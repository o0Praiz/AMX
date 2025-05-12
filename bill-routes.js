// routes/bills.js
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { Bill, BillItem, BillPayment } = require('../models/Bill');
const Vendor = require('../models/Vendor');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const JournalEntry = require('../models/JournalEntry');
const JournalLine = require('../models/JournalLine');
const AuditTrail = require('../models/AuditTrail');
const stabulumService = require('../services/stabulumService');
const mongoose = require('mongoose');

// @route   GET api/bills
// @desc    Get all bills
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { 
      status, 
      vendorId, 
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
        query.status = { $in: ['received', 'partial', 'overdue'] };
      } else {
        query.status = status;
      }
    }
    
    if (vendorId) {
      query.vendorId = vendorId;
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
        { billNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { referenceNumber: { $regex: search, $options: 'i' } },
        { vendorReference: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Determine sort field and order
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await Bill.countDocuments(query);
    
    // Get bills with pagination
    const bills = await Bill.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('vendorId', 'name contactName email')
      .populate('createdBy', 'firstName lastName');
    
    res.json({
      bills,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error('Error fetching bills:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/bills
// @desc    Create a new bill
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('vendorId', 'Vendor ID is required').not().isEmpty(),
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
      vendorId, 
      date, 
      dueDate, 
      items,
      description,
      notes,
      status,
      stabulumPaymentEnabled,
      discountType,
      discountValue,
      tags,
      referenceNumber,
      vendorReference
    } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate vendor exists and belongs to organization
      const vendor = await Vendor.findOne({
        _id: vendorId,
        organizationId: req.user.organization
      });

      if (!vendor) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: 'Vendor not found or does not belong to your organization' 
        });
      }
      
      // Generate bill number
      const billNumber = await Bill.generateBillNumber(req.user.organization);
      
      // Calculate bill totals
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
        if (item.taxRate > 0) {
          itemTaxAmount = itemNetAmount * (item.taxRate / 100);
        }
        
        subtotal += itemNetAmount;
        taxTotal += itemTaxAmount;
        discountTotal += itemDiscountAmount;
      }
      
      // Apply bill-level discount if applicable
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
        if (!vendor.stabulumWalletAddress) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Stabulum payment cannot be enabled because vendor has no Stabulum wallet address' 
          });
        }
        
        stabulumPaymentAddress = vendor.stabulumWalletAddress;
      }

      // Create bill
      const bill = new Bill({
        organizationId: req.user.organization,
        billNumber,
        vendorId,
        date: new Date(date),
        dueDate: new Date(dueDate),
        status: status || 'draft',
        total,
        subtotal,
        taxTotal,
        balance: total, // Initially, balance equals total
        description,
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
        vendorReference,
        tags: tags || []
      });

      await bill.save({ session });
      
      // Create bill items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        const billItem = new BillItem({
          billId: bill._id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
          taxRate: item.taxRate || 0,
          accountId: item.accountId,
          productId: item.productId,
          discountType: item.discountType,
          discountValue: item.discountValue,
          projectId: item.projectId,
          departmentId: item.departmentId
        });
        
        await billItem.save({ session });
      }
      
      // Create journal entry if status is 'received' or 'partial'
      if (['received', 'partial'].includes(bill.status)) {
        await createJournalEntryForBill(bill, items, req.user.organization, req.user.id, session);
      }
      
      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'create',
        entityType: 'bill',
        entityId: bill._id,
        timestamp: new Date()
      });
      
      await auditTrail.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Return the created bill with its items
      const populatedBill = await Bill.findById(bill._id)
        .populate('vendorId', 'name contactName email')
        .populate('createdBy', 'firstName lastName');
        
      const billItems = await BillItem.find({ billId: bill._id })
        .populate('accountId', 'accountNumber name');
      
      res.status(201).json({
        bill: populatedBill,
        items: billItems
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error creating bill:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET api/bills/:id
// @desc    Get bill by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const bill = await Bill.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    })
      .populate('vendorId', 'name contactName email address phone stabulumWalletAddress')
      .populate('createdBy', 'firstName lastName')
      .populate('journalEntryId');

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    // Get bill items
    const items = await BillItem.find({ billId: bill._id })
      .populate('accountId', 'accountNumber name')
      .populate('productId', 'name sku');
    
    // Get payments
    const payments = await BillPayment.find({ 
      billId: bill._id,
      isVoid: false
    }).sort({ date: -1 });

    res.json({
      bill,
      items,
      payments
    });
  } catch (err) {
    console.error('Error fetching bill:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/bills/:id
// @desc    Update bill
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
      vendorId, 
      date, 
      dueDate, 
      items,
      description,
      notes,
      status,
      stabulumPaymentEnabled,
      discountType,
      discountValue,
      tags,
      referenceNumber,
      vendorReference
    } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find bill
      const bill = await Bill.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!bill) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Bill not found' });
      }
      
      // Check if bill is in a state that can be edited
      if (!['draft', 'received'].includes(bill.status)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `Bill in '${bill.status}' status cannot be edited` 
        });
      }
      
      // Check if vendor is being changed
      let vendor;
      if (vendorId && vendorId !== bill.vendorId.toString()) {
        vendor = await Vendor.findOne({
          _id: vendorId,
          organizationId: req.user.organization
        });
        
        if (!vendor) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Vendor not found or does not belong to your organization' 
          });
        }
      } else {
        vendor = await Vendor.findById(bill.vendorId);
      }
      
      // Calculate bill totals
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
        if (item.taxRate > 0) {
          itemTaxAmount = itemNetAmount * (item.taxRate / 100);
        }
        
        subtotal += itemNetAmount;
        taxTotal += itemTaxAmount;
        discountTotal += itemDiscountAmount;
      }
      
      // Apply bill-level discount if applicable
      if (discountType === 'percentage' && discountValue > 0) {
        discountTotal += subtotal * (discountValue / 100);
        subtotal -= subtotal * (discountValue / 100);
      } else if (discountType === 'amount' && discountValue > 0) {
        discountTotal += Math.min(discountValue, subtotal);
        subtotal -= Math.min(discountValue, subtotal);
      }
      
      const total = subtotal + taxTotal;
      
      // Handle Stabulum payment settings
      let stabulumPaymentAddress = bill.stabulumPaymentAddress;
      
      if (stabulumPaymentEnabled && !bill.stabulumPaymentEnabled) {
        // Enabling Stabulum payment
        if (!vendor.stabulumWalletAddress) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Stabulum payment cannot be enabled because vendor has no Stabulum wallet address' 
          });
        }
        
        stabulumPaymentAddress = vendor.stabulumWalletAddress;
      } else if (!stabulumPaymentEnabled) {
        stabulumPaymentAddress = null;
      }
      
      // Calculate new balance
      const payments = await BillPayment.find({ 
        billId: bill._id,
        isVoid: false
      });
      
      let totalPaid = 0;
      payments.forEach(payment => {
        totalPaid += payment.amount;
      });
      
      const balance = Math.max(0, total - totalPaid);
      
      // Track changes for audit trail
      const changes = [];
      if (vendorId && vendorId !== bill.vendorId.toString()) {
        changes.push({
          field: 'vendorId',
          oldValue: bill.vendorId.toString(),
          newValue: vendorId
        });
      }
      
      if (date && new Date(date).toISOString() !== new Date(bill.date).toISOString()) {
        changes.push({
          field: 'date',
          oldValue: bill.date.toISOString(),
          newValue: new Date(date).toISOString()
        });
      }
      
      if (dueDate && new Date(dueDate).toISOString() !== new Date(bill.dueDate).toISOString()) {
        changes.push({
          field: 'dueDate',
          oldValue: bill.dueDate.toISOString(),
          newValue: new Date(dueDate).toISOString()
        });
      }
      
      if (status && status !== bill.status) {
        changes.push({
          field: 'status',
          oldValue: bill.status,
          newValue: status
        });
      }
      
      if (total !== bill.total) {
        changes.push({
          field: 'total',
          oldValue: bill.total.toString(),
          newValue: total.toString()
        });
      }

      // Update bill
      if (vendorId) bill.vendorId = vendorId;
      if (date) bill.date = new Date(date);
      if (dueDate) bill.dueDate = new Date(dueDate);
      bill.total = total;
      bill.subtotal = subtotal;
      bill.taxTotal = taxTotal;
      bill.balance = balance;
      bill.description = description;
      bill.notes = notes;
      if (status) bill.status = status;
      bill.stabulumPaymentEnabled = stabulumPaymentEnabled || false;
      bill.stabulumPaymentAddress = stabulumPaymentAddress;
      bill.stabulumPaymentAmount = stabulumPaymentEnabled ? balance : 0;
      bill.discountType = discountType;
      bill.discountValue = discountValue;
      bill.discountTotal = discountTotal;
      bill.referenceNumber = referenceNumber;
      bill.vendorReference = vendorReference;
      if (tags) bill.tags = tags;
      bill.updatedAt = Date.now();

      await bill.save({ session });
      
      // Delete existing items and create new ones
      await BillItem.deleteMany({ billId: bill._id }, { session });
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        const billItem = new BillItem({
          billId: bill._id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
          taxRate: item.taxRate || 0,
          accountId: item.accountId,
          productId: item.productId,
          discountType: item.discountType,
          discountValue: item.discountValue,
          projectId: item.projectId,
          departmentId: item.departmentId
        });
        
        await billItem.save({ session });
      }
      
      // Handle journal entry based on status
      if (bill.status === 'draft' && status === 'received') {
        // Create new journal entry
        await createJournalEntryForBill(bill, items, req.user.organization, req.user.id, session);
      } else if (bill.status === 'received' && bill.journalEntryId) {
        // Update existing journal entry
        await updateJournalEntryForBill(
          bill, 
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
          entityType: 'bill',
          entityId: bill._id,
          timestamp: new Date(),
          changes
        });
        
        await auditTrail.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      // Return the updated bill with its items
      const populatedBill = await Bill.findById(bill._id)
        .populate('vendorId', 'name contactName email')
        .populate('createdBy', 'firstName lastName')
        .populate('journalEntryId');
        
      const billItems = await BillItem.find({ billId: bill._id })
        .populate('accountId', 'accountNumber name');
        
      const billPayments = await BillPayment.find({ 
        billId: bill._id,
        isVoid: false
      }).sort({ date: -1 });
      
      res.json({
        bill: populatedBill,
        items: billItems,
        payments: billPayments
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error updating bill:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   POST api/bills/:id/receive
// @desc    Mark bill as received
// @access  Private
router.post('/:id/receive', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find bill
    const bill = await Bill.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });

    if (!bill) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Bill not found' });
    }
    
    // Check if bill is in draft status
    if (bill.status !== 'draft') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: `Bill in '${bill.status}' status cannot be marked as received` 
      });
    }
    
    // Get bill items
    const items = await BillItem.find({ billId: bill._id });
    
    // Create journal entry
    await createJournalEntryForBill(
      bill, 
      items, 
      req.user.organization, 
      req.user.id, 
      session
    );
    
    // Update bill status
    bill.status = 'received';
    bill.updatedAt = Date.now();
    
    await bill.save({ session });
    
    // Create audit trail
    const auditTrail = new AuditTrail({
      organizationId: req.user.organization,
      userId: req.user.id,
      action: 'update',
      entityType: 'bill',
      entityId: bill._id,
      timestamp: new Date(),
      changes: [
        {
          field: 'status',
          oldValue: 'draft',
          newValue: 'received'
        }
      ]
    });
    
    await auditTrail.save({ session });

    await session.commitTransaction();
    session.endSession();
    
    // Return the updated bill
    const populatedBill = await Bill.findById(bill._id)
      .populate('vendorId', 'name contactName email')
      .populate('createdBy', 'firstName lastName')
      .populate('journalEntryId');
    
    res.json({
      bill: populatedBill,
      message: 'Bill marked as received'
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error marking bill as received:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/bills/:id/void
// @desc    Void a bill
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
      // Find bill
      const bill = await Bill.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!bill) {
        return res.status(404).json({ message: 'Bill not found' });
      }
      
      // Use the model's instance method to void the bill
      await bill.voidBill(reason, req.user.id);
      
      // Return the voided bill
      const populatedBill = await Bill.findById(bill._id)
        .populate('vendorId', 'name contactName email')
        .populate('createdBy', 'firstName lastName')
        .populate('journalEntryId');
      
      res.json({
        bill: populatedBill,
        message: 'Bill voided successfully'
      });
    } catch (err) {
      console.error('Error voiding bill:', err.message);
      
      if (err.message.includes('Cannot void')) {
        return res.status(400).json({ message: err.message });
      }
      
      res.status(500).send('Server error');
    }
  }
);

// @route   POST api/bills/:id/payments
// @desc    Record a payment for a bill
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
      ]),
      check('bankAccountId', 'Bank account ID is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      amount, 
      date, 
      method, 
      reference, 
      notes, 
      bankAccountId,
      checkNumber 
    } = req.body;
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find bill
      const bill = await Bill.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!bill) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Bill not found' });
      }
      
      // Check if bill can accept payments
      if (!['received', 'partial', 'overdue'].includes(bill.status)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `Cannot record payment for bill in '${bill.status}' status` 
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
      
      if (parseFloat(amount) > bill.balance) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `Payment amount (${amount}) cannot exceed the bill balance (${bill.balance})` 
        });
      }
      
      // Validate bank account exists and belongs to organization
      const bankAccount = await ChartOfAccounts.findOne({
        _id: bankAccountId,
        organizationId: req.user.organization,
        type: 'asset',
        $or: [
          { subtype: 'cash' },
          { subtype: 'bank' }
        ]
      });
      
      if (!bankAccount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: 'Bank account not found or is not a valid cash/bank account' 
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
        const existingPayment = await BillPayment.findOne({
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
      
      // Create payment record
      const payment = new BillPayment({
        organizationId: req.user.organization,
        billId: bill._id,
        vendorId: bill.vendorId,
        amount: parseFloat(amount),
        date: new Date(date),
        method,
        reference,
        notes,
        bankAccountId,
        checkNumber,
        createdBy: req.user.id,
        stabulumTransactionHash: stabulumTransaction ? stabulumTransaction.transactionHash : null
      });
      
      await payment.save({ session });
      
      // Update bill balance
      bill.balance -= parseFloat(amount);
      
      // Update status based on new balance
      if (bill.balance === 0) {
        bill.status = 'paid';
      } else if (bill.balance < bill.total) {
        bill.status = 'partial';
      }
      
      // If Stabulum transaction provided, update Stabulum payment status
      if (stabulumTransaction) {
        bill.stabulumPaymentStatus = 'confirmed';
        bill.stabulumTransactionHash = stabulumTransaction.transactionHash;
      }
      
      await bill.save({ session });
      
      // Create journal entry for the payment
      await createJournalEntryForBillPayment(
        payment,
        bill,
        bankAccount,
        req.user.organization,
        req.user.id,
        session
      );
      
      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'create',
        entityType: 'bill-payment',
        entityId: payment._id,
        timestamp: new Date()
      });
      
      await auditTrail.save({ session });

      await session.commitTransaction();
      session.endSession();
      
      // Return the updated bill and payment
      const populatedBill = await Bill.findById(bill._id)
        .populate('vendorId', 'name contactName email')
        .populate('createdBy', 'firstName lastName');
        
      const populatedPayment = await BillPayment.findById(payment._id)
        .populate('journalEntryId')
        .populate('bankAccountId', 'accountNumber name');
      
      res.status(201).json({
        bill: populatedBill,
        payment: populatedPayment,
        message: 'Payment recorded successfully'
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error recording bill payment:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// Helper function to create journal entry for bill
async function createJournalEntryForBill(bill, items, organizationId, userId, session) {
  // Find the purchases journal
  const Journal = require('../models/Journal');
  const purchasesJournal = await Journal.findOne({
    organizationId,
    type: 'purchases'
  });
  
  if (!purchasesJournal) {
    throw new Error('Purchases journal not found');
  }
  
  // Get vendor
  const vendor = await Vendor.findById(bill.vendorId);
  
  // Get accounts payable account
  const apAccount = await ChartOfAccounts.findOne({
    organizationId,
    type: 'liability',
    subtype: 'accounts-payable'
  });
  
  if (!apAccount) {
    throw new Error('Accounts payable account not found');
  }
  
  // Create journal entry
  const journalEntry = new JournalEntry({
    organizationId,
    journalId: purchasesJournal._id,
    entryNumber: await JournalEntry.generateEntryNumber(organizationId, purchasesJournal._id),
    date: bill.date,
    description: `Bill ${bill.billNumber} - ${vendor.name}`,
    reference: bill.vendorReference || bill.billNumber,
    status: 'posted',
    createdBy: userId,
    postingDate: new Date()
  });
  
  await journalEntry.save({ session });
  
  // Create journal lines
  
  // Credit Accounts Payable
  const apLine = new JournalLine({
    journalEntryId: journalEntry._id,
    lineNumber: 1,
    accountId: apAccount._id,
    description: `Bill ${bill.billNumber} - ${vendor.name}`,
    debit: 0,
    credit: bill.total
  });
  
  await apLine.save({ session });
  
  // Debit Expense accounts
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
    
    // Add tax if applicable
    if (item.taxRate > 0) {
      amount += amount * (item.taxRate / 100);
    }
    
    const expenseLine = new JournalLine({
      journalEntryId: journalEntry._id,
      lineNumber,
      accountId: account._id,
      description: item.description,
      debit: amount,
      credit: 0,
      projectId: item.projectId,
      departmentId: item.departmentId
    });
    
    await expenseLine.save({ session });
    lineNumber++;
  }
  
  // Update bill with journal entry reference
  bill.journalEntryId = journalEntry._id;
  await bill.save({ session });
  
  return journalEntry;
}

// Helper function to update journal entry for bill
async function updateJournalEntryForBill(bill, items, organizationId, userId, session) {
  if (!bill.journalEntryId) {
    throw new Error('Bill has no associated journal entry');
  }
  
  // Get journal entry
  const journalEntry = await JournalEntry.findById(bill.journalEntryId);
  
  if (!journalEntry) {
    throw new Error('Associated journal entry not found');
  }
  
  // Get vendor
  const vendor = await Vendor.findById(bill.vendorId);
  
  // Get accounts payable account
  const apAccount = await ChartOfAccounts.findOne({
    organizationId,
    type: 'liability',
    subtype: 'accounts-payable'
  });
  
  if (!apAccount) {
    throw new Error('Accounts payable account not found');
  }
  
  // Update journal entry
  journalEntry.date = bill.date;
  journalEntry.description = `Bill ${bill.billNumber} - ${vendor.name}`;
  journalEntry.reference = bill.vendorReference || bill.billNumber;
  journalEntry.updatedAt = new Date();
  
  await journalEntry.save({ session });
  
  // Delete existing lines
  await JournalLine.deleteMany({ journalEntryId: journalEntry._id }, { session });
  
  // Create new journal lines
  
  // Credit Accounts Payable
  const apLine = new JournalLine({
    journalEntryId: journalEntry._id,
    lineNumber: 1,
    accountId: apAccount._id,
    description: `Bill ${bill.billNumber} - ${vendor.name}`,
    debit: 0,
    credit: bill.total
  });
  
  await apLine.save({ session });
  
  // Debit Expense accounts
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
    
    // Add tax if applicable
    if (item.taxRate > 0) {
      amount += amount * (item.taxRate / 100);
    }
    
    const expenseLine = new JournalLine({
      journalEntryId: journalEntry._id,
      lineNumber,
      accountId: account._id,
      description: item.description,
      debit: amount,
      credit: 0,
      projectId: item.projectId,
      departmentId: item.departmentId
    });
    
    await expenseLine.save({ session });
    lineNumber++;
  }
  
  return journalEntry;
}

// Helper function to create journal entry for bill payment
async function createJournalEntryForBillPayment(payment, bill, bankAccount, organizationId, userId, session) {
  // Find the cash disbursements journal
  const Journal = require('../models/Journal');
  const cashJournal = await Journal.findOne({
    organizationId,
    type: 'cash-disbursements'
  });
  
  if (!cashJournal) {
    throw new Error('Cash disbursements journal not found');
  }
  
  // Get vendor
  const vendor = await Vendor.findById(bill.vendorId);
  
  // Get accounts payable account
  const apAccount = await ChartOfAccounts.findOne({
    organizationId,
    type: 'liability',
    subtype: 'accounts-payable'
  });
  
  if (!apAccount) {
    throw new Error('Accounts payable account not found');
  }
  
  // Create journal entry
  const journalEntry = new JournalEntry({
    organizationId,
    journalId: cashJournal._id,
    entryNumber: await JournalEntry.generateEntryNumber(organizationId, cashJournal._id),
    date: payment.date,
    description: `Payment for Bill ${bill.billNumber} - ${vendor.name}`,
    reference: payment.reference || (payment.checkNumber ? `Check #${payment.checkNumber}` : bill.billNumber),
    status: 'posted',
    createdBy: userId,
    postingDate: new Date(),
    stabulumTransactionHash: payment.stabulumTransactionHash
  });
  
  await journalEntry.save({ session });
  
  // Create journal lines
  
  // Debit Accounts Payable
  const apLine = new JournalLine({
    journalEntryId: journalEntry._id,
    lineNumber: 1,
    accountId: apAccount._id,
    description: `Payment for Bill ${bill.billNumber} - ${vendor.name}`,
    debit: payment.amount,
    credit: 0
  });
  
  await apLine.save({ session });
  
  // Credit Bank/Cash
  const bankLine = new JournalLine({
    journalEntryId: journalEntry._id,
    lineNumber: 2,
    accountId: bankAccount._id,
    description: payment.method === 'check' 
      ? `Check #${payment.checkNumber || 'N/A'} to ${vendor.name}` 
      : `Payment to ${vendor.name}`,
    debit: 0,
    credit: payment.amount,
    stabulumAmount: payment.method === 'stabulum' ? payment.amount : 0,
    stabulumConfirmed: payment.method === 'stabulum'
  });
  
  await bankLine.save({ session });
  
  // Update payment with journal entry reference
  payment.journalEntryId = journalEntry._id;
  await payment.save({ session });
  
  return journalEntry;
}

module.exports = router;
