// routes/invoices.js
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { Invoice, InvoiceItem, Payment } = require('../models/Invoice');
const Customer = require('../models/Customer');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const JournalEntry = require('../models/JournalEntry');
const JournalLine = require('../models/JournalLine');
const AuditTrail = require('../models/AuditTrail');
const stabulumService = require('../services/stabulumService');
const mongoose = require('mongoose');

// @route   GET api/invoices
// @desc    Get all invoices
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { 
      status, 
      customerId, 
      startDate, 
      endDate, 
      search,
      sortBy = 'date',
      sortOrder = 'desc',
      page = 1,
      limit = 25
    } = req.query;
    
    // Build query
    const query = { organizationId: req.user.organization };
    
    if (status) {
      if (status === 'unpaid') {
        query.status = { $in: ['sent', 'partial', 'overdue'] };
      } else {
        query.status = status;
      }
    }
    
    if (customerId) {
      query.customerId = customerId;
    }
    
    if (startDate || endDate) {
      query.date = {};
      
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }
    
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { referenceNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Determine sort field and order
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await Invoice.countDocuments(query);
    
    // Get invoices with pagination
    const invoices = await Invoice.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('customerId', 'name contactName email')
      .populate('createdBy', 'firstName lastName');
    
    res.json({
      invoices,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error('Error fetching invoices:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/invoices
// @desc    Create a new invoice
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('customerId', 'Customer ID is required').not().isEmpty(),
      check('date', 'Date is required').not().isEmpty(),
      check('dueDate', 'Due date is required').not().isEmpty(),
      check('items', 'At least one item is required').isArray({ min: 1 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      customerId, 
      date, 
      dueDate, 
      items,
      description,
      terms,
      notes,
      status,
      stabulumPaymentEnabled,
      discountType,
      discountValue,
      tags,
      referenceNumber
    } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate customer exists and belongs to organization
      const customer = await Customer.findOne({
        _id: customerId,
        organizationId: req.user.organization
      });

      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: 'Customer not found or does not belong to your organization' 
        });
      }
      
      // Generate invoice number
      const invoiceNumber = await Invoice.generateInvoiceNumber(req.user.organization);
      
      // Calculate invoice totals
      let subtotal = 0;
      let taxTotal = 0;
      let discountTotal = 0;
      
      // Validate items
      for (const item of items) {
        // Check that account exists and belongs to organization
        const account = await ChartOfAccounts.findOne({
          _id: item.accountId,
          organizationId: req.user.organization
        });
        
        if (!account) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: `Account with ID ${item.accountId} not found or doesn't belong to your organization` 
          });
        }
        
        // Calculate item amount
        const amount = item.quantity * item.unitPrice;
        
        // Apply item discount if applicable
        let itemDiscountAmount = 0;
        if (item.discountType === 'percentage' && item.discountValue > 0) {
          itemDiscountAmount = amount * (item.discountValue / 100);
        } else if (item.discountType === 'amount' && item.discountValue > 0) {
          itemDiscountAmount = Math.min(item.discountValue, amount);
        }
        
        const itemNetAmount = amount - itemDiscountAmount;
        
        // Calculate tax amount
        let itemTaxAmount = 0;
        if (item.taxRate > 0 && !customer.taxExempt) {
          itemTaxAmount = itemNetAmount * (item.taxRate / 100);
        }
        
        subtotal += itemNetAmount;
        taxTotal += itemTaxAmount;
        discountTotal += itemDiscountAmount;
      }
      
      // Apply invoice-level discount if applicable
      if (discountType === 'percentage' && discountValue > 0) {
        discountTotal += subtotal * (discountValue / 100);
        subtotal -= subtotal * (discountValue / 100);
      } else if (discountType === 'amount' && discountValue > 0) {
        discountTotal += Math.min(discountValue, subtotal);
        subtotal -= Math.min(discountValue, subtotal);
      }
      
      const total = subtotal + taxTotal;
      
      // Set up Stabulum payment if enabled
      let stabulumPaymentAddress = null;
      
      if (stabulumPaymentEnabled) {
        // Get organization's default Stabulum wallet
        const StabulumWallet = require('../models/StabulumWallet');
        const organizationWallet = await StabulumWallet.findDefaultWallet(req.user.organization);
        
        if (!organizationWallet) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Stabulum payment cannot be enabled because your organization has no default Stabulum wallet' 
          });
        }
        
        stabulumPaymentAddress = organizationWallet.address;
      }

      // Create invoice
      const invoice = new Invoice({
        organizationId: req.user.organization,
        invoiceNumber,
        customerId,
        date: new Date(date),
        dueDate: new Date(dueDate),
        status: status || 'draft',
        total,
        subtotal,
        taxTotal,
        balance: total, // Initially, balance equals total
        description,
        terms: terms || customer.terms,
        notes,
        createdBy: req.user.id,
        stabulumPaymentEnabled: stabulumPaymentEnabled || false,
        stabulumPaymentAddress,
        stabulumPaymentAmount: stabulumPaymentEnabled ? total : 0,
        stabulumPaymentStatus: stabulumPaymentEnabled ? 'pending' : null,
        discountType,
        discountValue,
        discountTotal,
        referenceNumber,
        tags: tags || []
      });

      await invoice.save({ session });
      
      // Create invoice items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        const invoiceItem = new InvoiceItem({
          invoiceId: invoice._id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
          taxRate: customer.taxExempt ? 0 : (item.taxRate || 0),
          accountId: item.accountId,
          productId: item.productId,
          discountType: item.discountType,
          discountValue: item.discountValue
        });
        
        await invoiceItem.save({ session });
      }
      
      // Create journal entry if status is 'sent' or 'partial'
      if (['sent', 'partial'].includes(invoice.status)) {
        await createJournalEntryForInvoice(invoice, items, req.user.organization, req.user.id, session);
      }
      
      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'create',
        entityType: 'invoice',
        entityId: invoice._id,
        timestamp: new Date()
      });
      
      await auditTrail.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Return the created invoice with its items
      const populatedInvoice = await Invoice.findById(invoice._id)
        .populate('customerId', 'name contactName email')
        .populate('createdBy', 'firstName lastName');
        
      const invoiceItems = await InvoiceItem.find({ invoiceId: invoice._id })
        .populate('accountId', 'accountNumber name');
      
      res.status(201).json({
        invoice: populatedInvoice,
        items: invoiceItems
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error creating invoice:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET api/invoices/:id
// @desc    Get invoice by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    })
      .populate('customerId', 'name contactName email address phone stabulumWalletAddress')
      .populate('createdBy', 'firstName lastName')
      .populate('journalEntryId');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Get invoice items
    const items = await InvoiceItem.find({ invoiceId: invoice._id })
      .populate('accountId', 'accountNumber name')
      .populate('productId', 'name sku');
    
    // Get payments
    const payments = await Payment.find({ 
      invoiceId: invoice._id,
      isVoid: false
    }).sort({ date: -1 });

    res.json({
      invoice,
      items,
      payments
    });
  } catch (err) {
    console.error('Error fetching invoice:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/invoices/:id
// @desc    Update invoice
// @access  Private
router.put(
  '/:id',
  [
    auth,
    [
      check('date', 'Date is required').not().isEmpty(),
      check('dueDate', 'Due date is required').not().isEmpty(),
      check('items', 'At least one item is required').isArray({ min: 1 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      customerId, 
      date, 
      dueDate, 
      items,
      description,
      terms,
      notes,
      status,
      stabulumPaymentEnabled,
      discountType,
      discountValue,
      tags,
      referenceNumber
    } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find invoice
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!invoice) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Invoice not found' });
      }
      
      // Check if invoice is in a state that can be edited
      if (!['draft', 'sent'].includes(invoice.status)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `Invoice in '${invoice.status}' status cannot be edited` 
        });
      }
      
      // Check if customer is being changed
      let customer;
      if (customerId && customerId !== invoice.customerId.toString()) {
        customer = await Customer.findOne({
          _id: customerId,
          organizationId: req.user.organization
        });
        
        if (!customer) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Customer not found or does not belong to your organization' 
          });
        }
      } else {
        customer = await Customer.findById(invoice.customerId);
      }
      
      // Calculate invoice totals
      let subtotal = 0;
      let taxTotal = 0;
      let discountTotal = 0;
      
      // Validate items
      for (const item of items) {
        // Check that account exists and belongs to organization
        const account = await ChartOfAccounts.findOne({
          _id: item.accountId,
          organizationId: req.user.organization
        });
        
        if (!account) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: `Account with ID ${item.accountId} not found or doesn't belong to your organization` 
          });
        }
        
        // Calculate item amount
        const amount = item.quantity * item.unitPrice;
        
        // Apply item discount if applicable
        let itemDiscountAmount = 0;
        if (item.discountType === 'percentage' && item.discountValue > 0) {
          itemDiscountAmount = amount * (item.discountValue / 100);
        } else if (item.discountType === 'amount' && item.discountValue > 0) {
          itemDiscountAmount = Math.min(item.discountValue, amount);
        }
        
        const itemNetAmount = amount - itemDiscountAmount;
        
        // Calculate tax amount
        let itemTaxAmount = 0;
        if (item.taxRate > 0 && !customer.taxExempt) {
          itemTaxAmount = itemNetAmount * (item.taxRate / 100);
        }
        
        subtotal += itemNetAmount;
        taxTotal += itemTaxAmount;
        discountTotal += itemDiscountAmount;
      }
      
      // Apply invoice-level discount if applicable
      if (discountType === 'percentage' && discountValue > 0) {
        discountTotal += subtotal * (discountValue / 100);
        subtotal -= subtotal * (discountValue / 100);
      } else if (discountType === 'amount' && discountValue > 0) {
        discountTotal += Math.min(discountValue, subtotal);
        subtotal -= Math.min(discountValue, subtotal);
      }
      
      const total = subtotal + taxTotal;
      
      // Handle Stabulum payment settings
      let stabulumPaymentAddress = invoice.stabulumPaymentAddress;
      
      if (stabulumPaymentEnabled && !invoice.stabulumPaymentEnabled) {
        // Enabling Stabulum payment
        const StabulumWallet = require('../models/StabulumWallet');
        const organizationWallet = await StabulumWallet.findDefaultWallet(req.user.organization);
        
        if (!organizationWallet) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Stabulum payment cannot be enabled because your organization has no default Stabulum wallet' 
          });
        }
        
        stabulumPaymentAddress = organizationWallet.address;
      } else if (!stabulumPaymentEnabled) {
        stabulumPaymentAddress = null;
      }
      
      // Calculate new balance
      const payments = await Payment.find({ 
        invoiceId: invoice._id,
        isVoid: false
      });
      
      let totalPaid = 0;
      payments.forEach(payment => {
        totalPaid += payment.amount;
      });
      
      const balance = Math.max(0, total - totalPaid);
      
      // Track changes for audit trail
      const changes = [];
      if (customerId && customerId !== invoice.customerId.toString()) {
        changes.push({
          field: 'customerId',
          oldValue: invoice.customerId.toString(),
          newValue: customerId
        });
      }
      
      if (date && new Date(date).toISOString() !== new Date(invoice.date).toISOString()) {
        changes.push({
          field: 'date',
          oldValue: invoice.date.toISOString(),
          newValue: new Date(date).toISOString()
        });
      }
      
      if (dueDate && new Date(dueDate).toISOString() !== new Date(invoice.dueDate).toISOString()) {
        changes.push({
          field: 'dueDate',
          oldValue: invoice.dueDate.toISOString(),
          newValue: new Date(dueDate).toISOString()
        });
      }
      
      if (status && status !== invoice.status) {
        changes.push({
          field: 'status',
          oldValue: invoice.status,
          newValue: status
        });
      }
      
      if (total !== invoice.total) {
        changes.push({
          field: 'total',
          oldValue: invoice.total.toString(),
          newValue: total.toString()
        });
      }

      // Update invoice
      if (customerId) invoice.customerId = customerId;
      if (date) invoice.date = new Date(date);
      if (dueDate) invoice.dueDate = new Date(dueDate);
      invoice.total = total;
      invoice.subtotal = subtotal;
      invoice.taxTotal = taxTotal;
      invoice.balance = balance;
      invoice.description = description;
      invoice.terms = terms;
      invoice.notes = notes;
      if (status) invoice.status = status;
      invoice.stabulumPaymentEnabled = stabulumPaymentEnabled || false;
      invoice.stabulumPaymentAddress = stabulumPaymentAddress;
      invoice.stabulumPaymentAmount = stabulumPaymentEnabled ? balance : 0;
      invoice.discountType = discountType;
      invoice.discountValue = discountValue;
      invoice.discountTotal = discountTotal;
      invoice.referenceNumber = referenceNumber;
      if (tags) invoice.tags = tags;
      invoice.updatedAt = Date.now();

      await invoice.save({ session });
      
      // Delete existing items and create new ones
      await InvoiceItem.deleteMany({ invoiceId: invoice._id }, { session });
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        const invoiceItem = new InvoiceItem({
          invoiceId: invoice._id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
          taxRate: customer.taxExempt ? 0 : (item.taxRate || 0),
          accountId: item.accountId,
          productId: item.productId,
          discountType: item.discountType,
          discountValue: item.discountValue
        });
        
        await invoiceItem.save({ session });
      }
      
      // Handle journal entry based on status
      if (invoice.status === 'draft' && status === 'sent') {
        // Create new journal entry
        await createJournalEntryForInvoice(invoice, items, req.user.organization, req.user.id, session);
      } else if (invoice.status === 'sent' && invoice.journalEntryId) {
        // Update existing journal entry
        await updateJournalEntryForInvoice(
          invoice, 
          items, 
          req.user.organization, 
          req.user.id, 
          session
        );
      }
      
      // Create audit trail if there were changes
      if (changes.length > 0) {
        const auditTrail = new AuditTrail({
          organizationId: req.user.organization,
          userId: req.user.id,
          action: 'update',
          entityType: 'invoice',
          entityId: invoice._id,
          timestamp: new Date(),
          changes
        });
        
        await auditTrail.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      // Return the updated invoice with its items
      const populatedInvoice = await Invoice.findById(invoice._id)
        .populate('customerId', 'name contactName email')
        .populate('createdBy', 'firstName lastName')
        .populate('journalEntryId');
        
      const invoiceItems = await InvoiceItem.find({ invoiceId: invoice._id })
        .populate('accountId', 'accountNumber name');
        
      const invoicePayments = await Payment.find({ 
        invoiceId: invoice._id,
        isVoid: false
      }).sort({ date: -1 });
      
      res.json({
        invoice: populatedInvoice,
        items: invoiceItems,
        payments: invoicePayments
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error updating invoice:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   POST api/invoices/:id/send
// @desc    Mark invoice as sent
// @access  Private
router.post('/:id/send', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find invoice
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });

    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check if invoice is in draft status
    if (invoice.status !== 'draft') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: `Invoice in '${invoice.status}' status cannot be marked as sent` 
      });
    }
    
    // Get invoice items
    const items = await InvoiceItem.find({ invoiceId: invoice._id });
    
    // Create journal entry
    await createJournalEntryForInvoice(
      invoice, 
      items, 
      req.user.organization, 
      req.user.id, 
      session
    );
    
    // Update invoice status
    invoice.status = 'sent';
    invoice.updatedAt = Date.now();
    
    await invoice.save({ session });
    
    // Create audit trail
    const auditTrail = new AuditTrail({
      organizationId: req.user.organization,
      userId: req.user.id,
      action: 'update',
      entityType: 'invoice',
      entityId: invoice._id,
      timestamp: new Date(),
      changes: [
        {
          field: 'status',
          oldValue: 'draft',
          newValue: 'sent'
        }
      ]
    });
    
    await auditTrail.save({ session });

    await session.commitTransaction();
    session.endSession();
    
    // Return the updated invoice
    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('customerId', 'name contactName email')
      .populate('createdBy', 'firstName lastName')
      .populate('journalEntryId');
    
    res.json({
      invoice: populatedInvoice,
      message: 'Invoice marked as sent'
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error marking invoice as sent:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/invoices/:id/void
// @desc    Void an invoice
// @access  Private
router.post(
  '/:id/void',
  [
    auth,
    [
      check('reason', 'Reason is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { reason } = req.body;

    try {
      // Find invoice
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }
      
      // Use the model's instance method to void the invoice
      await invoice.voidInvoice(reason, req.user.id);
      
      // Return the voided invoice
      const populatedInvoice = await Invoice.findById(invoice._id)
        .populate('customerId', 'name contactName email')
        .populate('createdBy', 'firstName lastName')
        .populate('journalEntryId');
      
      res.json({
        invoice: populatedInvoice,
        message: 'Invoice voided successfully'
      });
    } catch (err) {
      console.error('Error voiding invoice:', err.message);
      
      if (err.message.includes('Cannot void')) {
        return res.status(400).json({ message: err.message });
      }
      
      res.status(500).send('Server error');
    }
  }
);

// @route   POST api/invoices/:id/payments
// @desc    Record a payment for an invoice
// @access  Private
router.post(
  '/:id/payments',
  [
    auth,
    [
      check('amount', 'Amount is required').isNumeric(),
      check('date', 'Date is required').not().isEmpty(),
      check('method', 'Payment method is required').isIn([
        'cash', 'check', 'credit-card', 'bank-transfer', 'stabulum', 'other'
      ])
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, date, method, reference, notes } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find invoice
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!invoice) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Invoice not found' });
      }
      
      // Check if invoice can accept payments
      if (!['sent', 'partial', 'overdue'].includes(invoice.status)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `Cannot record payment for invoice in '${invoice.status}' status` 
        });
      }
      
      // Check if payment amount is valid
      if (parseFloat(amount) <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: 'Payment amount must be greater than zero' 
        });
      }
      
      if (parseFloat(amount) > invoice.balance) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `Payment amount (${amount}) cannot exceed the invoice balance (${invoice.balance})` 
        });
      }
      
      // Handle Stabulum payments
      let stabulumTransaction = null;
      if (method === 'stabulum') {
        if (!reference) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Transaction hash is required for Stabulum payments' 
          });
        }
        
        // Verify the transaction exists and belongs to this organization
        const StabulumTransaction = require('../models/StabulumTransaction');
        stabulumTransaction = await StabulumTransaction.findOne({
          transactionHash: reference,
          organizationId: req.user.organization
        });
        
        if (!stabulumTransaction) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Stabulum transaction not found or does not belong to your organization' 
          });
        }
        
        // Check if transaction is already used
        const existingPayment = await Payment.findOne({
          stabulumTransactionHash: reference
        });
        
        if (existingPayment) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'This Stabulum transaction is already used for another payment' 
          });
        }
      }
      
      // Record payment using the model's instance method
      const payment = await invoice.recordPayment(
        parseFloat(amount),
        new Date(date),
        method,
        reference,
        stabulumTransaction
      );
      
      // Create journal entry for the payment
      await createJournalEntryForPayment(
        payment,
        invoice,
        req.user.organization,
        req.user.id,
        method,
        session
      );
      
      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'create',
        entityType: 'payment',
        entityId: payment._id,
        timestamp: new Date()
      });
      
      await auditTrail.save({ session });

      await session.commitTransaction();
      session.endSession();
      
      // Return the updated invoice and payment
      const populatedInvoice = await Invoice.findById(invoice._id)
        .populate('customerId', 'name contactName email')
        .populate('createdBy', 'firstName lastName');
        
      const populatedPayment = await Payment.findById(payment._id)
        .populate('journalEntryId');
      
      res.status(201).json({
        invoice: populatedInvoice,
        payment: populatedPayment,
        message: 'Payment recorded successfully'
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error recording payment:', err.message);
      
      if (err.message.includes('Payment amount')) {
        return res.status(400).json({ message: err.message });
      }
      
      res.status(500).send('Server error');
    }
  }
);

// @route   GET api/invoices/:id/pdf
// @desc    Generate PDF for invoice
// @access  Private
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    // Find invoice with related data
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    })
      .populate('customerId', 'name contactName email address phone stabulumWalletAddress')
      .populate('createdBy', 'firstName lastName');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Get invoice items
    const items = await InvoiceItem.find({ invoiceId: invoice._id })
      .populate('accountId', 'name');
    
    // Get organization info
    const Organization = require('../models/Organization');
    const organization = await Organization.findById(req.user.organization);
    
    // Get payments
    const payments = await Payment.find({ 
      invoiceId: invoice._id,
      isVoid: false
    }).sort({ date: -1 });
    
    // Generate PDF
    // Note: In a real implementation, you would use a library like PDFKit or
    // a service like DocRaptor to generate the PDF. For this example, we'll
    // just return the data that would be used to generate it.
    
    const pdfData = {
      invoice,
      items,
      payments,
      organization,
      generatedDate: new Date(),
      generatedBy: `${req.user.firstName} ${req.user.lastName}`
    };
    
    res.json({
      message: 'PDF data generated',
      data: pdfData
    });
  } catch (err) {
    console.error('Error generating invoice PDF:', err.message);
    res.status(500).send('Server error');
  }
});

// Helper function to create journal entry for invoice
async function createJournalEntryForInvoice(invoice, items, organizationId, userId, session) {
  // Find the sales journal
  const Journal = require('../models/Journal');
  const salesJournal = await Journal.findOne({
    organizationId,
    type: 'sales'
  });
  
  if (!salesJournal) {
    throw new Error('Sales journal not found');
  }
  
  // Get customer
  const customer = await Customer.findById(invoice.customerId);
  
  // Get accounts receivable account
  const arAccount = await ChartOfAccounts.findOne({
    organizationId,
    type: 'asset',
    subtype: 'accounts-receivable'
  });
  
  if (!arAccount) {
    throw new Error('Accounts receivable account not found');
  }
  
  // Get tax liability account if needed
  let taxAccount = null;
  if (invoice.taxTotal > 0) {
    taxAccount = await ChartOfAccounts.findOne({
      organizationId,
      type: 'liability',
      subtype: 'tax-payable'
    });
    
    if (!taxAccount) {
      throw new Error('Tax liability account not found');
    }
  }
  
  // Create journal entry
  const journalEntry = new JournalEntry({
    organizationId,
    journalId: salesJournal._id,
    entryNumber: await JournalEntry.generateEntryNumber(organizationId, salesJournal._id),
    date: invoice.date,
    description: `Invoice ${invoice.invoiceNumber} - ${customer.name}`,
    reference: invoice.invoiceNumber,
    status: 'posted',
    createdBy: userId,
    postingDate: new Date()
  });
  
  await journalEntry.save({ session });
  
  // Create journal lines
  
  // Debit Accounts Receivable
  const arLine = new JournalLine({
    journalEntryId: journalEntry._id,
    lineNumber: 1,
    accountId: arAccount._id,
    description: `Invoice ${invoice.invoiceNumber} - ${customer.name}`,
    debit: invoice.total,
    credit: 0
  });
  
  await arLine.save({ session });
  
  // Credit Revenue accounts
  let lineNumber = 2;
  
  for (const item of items) {
    const account = await ChartOfAccounts.findById(item.accountId);
    
    // Calculate item amount (after discounts)
    let amount = item.quantity * item.unitPrice;
    
    if (item.discountType === 'percentage' && item.discountValue > 0) {
      amount -= amount * (item.discountValue / 100);
    } else if (item.discountType === 'amount' && item.discountValue > 0) {
      amount -= Math.min(item.discountValue, amount);
    }
    
    const revenueLine = new JournalLine({
      journalEntryId: journalEntry._id,
      lineNumber,
      accountId: account._id,
      description: item.description,
      debit: 0,
      credit: amount
    });
    
    await revenueLine.save({ session });
    lineNumber++;
  }
  
  // Credit Tax Liability if applicable
  if (taxAccount && invoice.taxTotal > 0) {
    const taxLine = new JournalLine({
      journalEntryId: journalEntry._id,
      lineNumber,
      accountId: taxAccount._id,
      description: 'Sales tax',
      debit: 0,
      credit: invoice.taxTotal
    });
    
    await taxLine.save({ session });
  }
  
  // Update invoice with journal entry reference
  invoice.journalEntryId = journalEntry._id;
  await invoice.save({ session });
  
  return journalEntry;
}

// Helper function to update journal entry for invoice
async function updateJournalEntryForInvoice(invoice, items, organizationId, userId, session) {
  if (!invoice.journalEntryId) {
    throw new Error('Invoice has no associated journal entry');
  }
  
  // Get journal entry
  const journalEntry = await JournalEntry.findById(invoice.journalEntryId);
  
  if (!journalEntry) {
    throw new Error('Associated journal entry not found');
  }
  
  // Get customer
  const customer = await Customer.findById(invoice.customerId);
  
  // Get accounts receivable account
  const arAccount = await ChartOfAccounts.findOne({
    organizationId,
    type: 'asset',
    subtype: 'accounts-receivable'
  });
  
  if (!arAccount) {
    throw new Error('Accounts receivable account not found');
  }
  
  // Get tax liability account if needed
  let taxAccount = null;
  if (invoice.taxTotal > 0) {
    taxAccount = await ChartOfAccounts.findOne({
      organizationId,
      type: 'liability',
      subtype: 'tax-payable'
    });
    
    if (!taxAccount) {
      throw new Error('Tax liability account not found');
    }
  }
  
  // Update journal entry
  journalEntry.date = invoice.date;
  journalEntry.description = `Invoice ${invoice.invoiceNumber} - ${customer.name}`;
  journalEntry.updatedAt = new Date();
  
  await journalEntry.save({ session });
  
  // Delete existing lines
  await JournalLine.deleteMany({ journalEntryId: journalEntry._id }, { session });
  
  // Create new journal lines
  
  // Debit Accounts Receivable
  const arLine = new JournalLine({
    journalEntryId: journalEntry._id,
    lineNumber: 1,
    accountId: arAccount._id,
    description: `Invoice ${invoice.invoiceNumber} - ${customer.name}`,
    debit: invoice.total,
    credit: 0
  });
  
  await arLine.save({ session });
  
  // Credit Revenue accounts
  let lineNumber = 2;
  
  for (const item of items) {
    const account = await ChartOfAccounts.findById(item.accountId);
    
    // Calculate item amount (after discounts)
    let amount = item.quantity * item.unitPrice;
    
    if (item.discountType === 'percentage' && item.discountValue > 0) {
      amount -= amount * (item.discountValue / 100);
    } else if (item.discountType === 'amount' && item.discountValue > 0) {
      amount -= Math.min(item.discountValue, amount);
    }
    
    const revenueLine = new JournalLine({
      journalEntryId: journalEntry._id,
      lineNumber,
      accountId: account._id,
      description: item.description,
      debit: 0,
      credit: amount
    });
    
    await revenueLine.save({ session });
    lineNumber++;
  }
  
  // Credit Tax Liability if applicable
  if (taxAccount && invoice.taxTotal > 0) {
    const taxLine = new JournalLine({
      journalEntryId: journalEntry._id,
      lineNumber,
      accountId: taxAccount._id,
      description: 'Sales tax',
      debit: 0,
      credit: invoice.taxTotal
    });
    
    await taxLine.save({ session });
  }
  
  return journalEntry;
}

// Helper function to create journal entry for payment
async function createJournalEntryForPayment(payment, invoice, organizationId, userId, paymentMethod, session) {
  // Find the cash receipts journal
  const Journal = require('../models/Journal');
  const cashJournal = await Journal.findOne({
    organizationId,
    type: 'cash-receipts'
  });
  
  if (!cashJournal) {
    throw new Error('Cash receipts journal not found');
  }
  
  // Get customer
  const customer = await Customer.findById(invoice.customerId);
  
  // Get accounts receivable account
  const arAccount = await ChartOfAccounts.findOne({
    organizationId,
    type: 'asset',
    subtype: 'accounts-receivable'
  });
  
  if (!arAccount) {
    throw new Error('Accounts receivable account not found');
  }
  
  // Get the appropriate cash/bank account based on payment method
  let cashAccount;
  
  if (paymentMethod === 'stabulum') {
    // Get the Stabulum wallet account
    cashAccount = await ChartOfAccounts.findOne({
      organizationId,
      stabulumLinked: true,
      stabulumAddress: invoice.stabulumPaymentAddress
    });
    
    if (!cashAccount) {
      // Use default Stabulum asset account
      cashAccount = await ChartOfAccounts.findOne({
        organizationId,
        type: 'asset',
        subtype: 'cryptocurrencies'
      });
    }
  } else if (paymentMethod === 'credit-card') {
    // Use merchant account
    cashAccount = await ChartOfAccounts.findOne({
      organizationId,
      type: 'asset',
      subtype: 'merchant-account'
    });
  } else if (paymentMethod === 'bank-transfer') {
    // Use bank account
    cashAccount = await ChartOfAccounts.findOne({
      organizationId,
      type: 'asset',
      subtype: 'bank'
    });
  } else {
    // Default to cash account
    cashAccount = await ChartOfAccounts.findOne({
      organizationId,
      type: 'asset',
      subtype: 'cash'
    });
  }
  
  if (!cashAccount) {
    throw new Error(`Account for payment method '${paymentMethod}' not found`);
  }
  
  // Create journal entry
  const journalEntry = new JournalEntry({
    organizationId,
    journalId: cashJournal._id,
    entryNumber: await JournalEntry.generateEntryNumber(organizationId, cashJournal._id),
    date: payment.date,
    description: `Payment for Invoice ${invoice.invoiceNumber} - ${customer.name}`,
    reference: payment.reference || invoice.invoiceNumber,
    status: 'posted',
    createdBy: userId,
    postingDate: new Date(),
    stabulumTransactionHash: payment.stabulumTransactionHash
  });
  
  await journalEntry.save({ session });
  
  // Create journal lines
  
  // Debit Cash/Bank
  const cashLine = new JournalLine({
    journalEntryId: journalEntry._id,
    lineNumber: 1,
    accountId: cashAccount._id,
    description: `Payment for Invoice ${invoice.invoiceNumber}`,
    debit: payment.amount,
    credit: 0,
    stabulumAmount: paymentMethod === 'stabulum' ? payment.amount : 0,
    stabulumConfirmed: paymentMethod === 'stabulum'
  });
  
  await cashLine.save({ session });
  
  // Credit Accounts Receivable
  const arLine = new JournalLine({
    journalEntryId: journalEntry._id,
    lineNumber: 2,
    accountId: arAccount._id,
    description: `Payment for Invoice ${invoice.invoiceNumber} - ${customer.name}`,
    debit: 0,
    credit: payment.amount,
    customerId: customer._id
  });
  
  await arLine.save({ session });
  
  // Update payment with journal entry reference
  payment.journalEntryId = journalEntry._id;
  await payment.save({ session });
  
  return journalEntry;
}

module.exports = router;
