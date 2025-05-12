// routes/journalEntries.js
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Journal = require('../models/Journal');
const JournalEntry = require('../models/JournalEntry');
const JournalLine = require('../models/JournalLine');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const AuditTrail = require('../models/AuditTrail');
const mongoose = require('mongoose');

// @route   POST api/journal-entries
// @desc    Create a new journal entry
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('journalId', 'Journal ID is required').not().isEmpty(),
      check('date', 'Date is required').not().isEmpty(),
      check('lines', 'At least one journal line is required').isArray({ min: 1 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      journalId, 
      date, 
      description, 
      reference,
      lines,
      status,
      fiscalPeriodId,
      tags,
      notes
    } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check if journal exists and belongs to organization
      const journal = await Journal.findOne({
        _id: journalId,
        organizationId: req.user.organization
      });

      if (!journal) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Journal not found' });
      }

      // Generate entry number
      const entryNumber = await JournalEntry.generateEntryNumber(
        req.user.organization,
        journalId
      );

      // Create journal entry
      const journalEntry = new JournalEntry({
        organizationId: req.user.organization,
        journalId,
        entryNumber,
        date: new Date(date),
        description,
        reference,
        status: status || 'draft',
        createdBy: req.user.id,
        fiscalPeriodId,
        tags,
        notes
      });

      await journalEntry.save({ session });

      // Validate journal lines
      let totalDebits = 0;
      let totalCredits = 0;

      // Create journal lines
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Validate account exists and belongs to organization
        const account = await ChartOfAccounts.findOne({
          _id: line.accountId,
          organizationId: req.user.organization
        });

        if (!account) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: `Account with ID ${line.accountId} not found or doesn't belong to your organization`
          });
        }

        // Create journal line
        const journalLine = new JournalLine({
          journalEntryId: journalEntry._id,
          lineNumber: i + 1,
          accountId: line.accountId,
          description: line.description,
          debit: line.debit || 0,
          credit: line.credit || 0,
          stabulumAmount: line.stabulumAmount || 0,
          stabulumConfirmed: false,
          customerId: line.customerId,
          vendorId: line.vendorId,
          projectId: line.projectId,
          departmentId: line.departmentId,
          taxCode: line.taxCode,
          taxRate: line.taxRate || 0
        });

        totalDebits += journalLine.debit;
        totalCredits += journalLine.credit;

        await journalLine.save({ session });
      }

      // Verify debits = credits if entry is posted
      if (journalEntry.status === 'posted' && Math.abs(totalDebits - totalCredits) > 0.01) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: 'Journal entry is not balanced. Total debits must equal total credits.',
          totalDebits,
          totalCredits
        });
      }

      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'create',
        entityType: 'journal-entry',
        entityId: journalEntry._id,
        timestamp: new Date()
      });
      
      await auditTrail.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Return the journal entry with its lines
      const populatedEntry = await JournalEntry.findById(journalEntry._id)
        .populate('createdBy', 'firstName lastName');
      
      const entryLines = await JournalLine.find({ journalEntryId: journalEntry._id })
        .populate('accountId', 'accountNumber name type');
      
      res.status(201).json({
        journalEntry: populatedEntry,
        lines: entryLines
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error creating journal entry:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET api/journal-entries/:id
// @desc    Get journal entry by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const journalEntry = await JournalEntry.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    })
      .populate('journalId', 'name type')
      .populate('createdBy', 'firstName lastName')
      .populate('fiscalPeriodId', 'name startDate endDate');

    if (!journalEntry) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }

    // Get journal lines
    const journalLines = await JournalLine.find({
      journalEntryId: journalEntry._id
    })
      .populate('accountId', 'accountNumber name type')
      .populate('customerId', 'name')
      .populate('vendorId', 'name')
      .sort('lineNumber');

    res.json({
      journalEntry,
      lines: journalLines
    });
  } catch (err) {
    console.error('Error fetching journal entry:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/journal-entries/:id
// @desc    Update journal entry
// @access  Private
router.put(
  '/:id',
  [
    auth,
    [
      check('date', 'Date is required').not().isEmpty(),
      check('lines', 'At least one journal line is required').isArray({ min: 1 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      date, 
      description, 
      reference,
      lines,
      status,
      fiscalPeriodId,
      tags,
      notes
    } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find journal entry
      const journalEntry = await JournalEntry.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!journalEntry) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Journal entry not found' });
      }

      // Check if entry is already posted
      if (journalEntry.status === 'posted' && status !== 'reversed' && status !== 'voided') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: 'Cannot modify a posted journal entry' 
        });
      }

      // Track changes for audit trail
      const changes = [];
      
      if (date && new Date(date).toISOString() !== new Date(journalEntry.date).toISOString()) {
        changes.push({
          field: 'date',
          oldValue: journalEntry.date.toISOString(),
          newValue: new Date(date).toISOString()
        });
      }
      
      if (description !== journalEntry.description) {
        changes.push({
          field: 'description',
          oldValue: journalEntry.description,
          newValue: description
        });
      }
      
      if (reference !== journalEntry.reference) {
        changes.push({
          field: 'reference',
          oldValue: journalEntry.reference,
          newValue: reference
        });
      }
      
      if (status && status !== journalEntry.status) {
        changes.push({
          field: 'status',
          oldValue: journalEntry.status,
          newValue: status
        });
      }

      // Update journal entry
      if (date) journalEntry.date = new Date(date);
      if (description !== undefined) journalEntry.description = description;
      if (reference !== undefined) journalEntry.reference = reference;
      if (status) journalEntry.status = status;
      if (fiscalPeriodId) journalEntry.fiscalPeriodId = fiscalPeriodId;
      if (tags) journalEntry.tags = tags;
      if (notes !== undefined) journalEntry.notes = notes;
      
      journalEntry.updatedAt = Date.now();
      
      if (status === 'posted') {
        journalEntry.postingDate = Date.now();
      }

      await journalEntry.save({ session });

      // Handle journal lines
      if (lines && lines.length > 0) {
        // Delete existing lines
        await JournalLine.deleteMany({ 
          journalEntryId: journalEntry._id 
        }, { session });

        // Validate journal lines
        let totalDebits = 0;
        let totalCredits = 0;

        // Create new journal lines
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Validate account exists and belongs to organization
          const account = await ChartOfAccounts.findOne({
            _id: line.accountId,
            organizationId: req.user.organization
          });

          if (!account) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
              message: `Account with ID ${line.accountId} not found or doesn't belong to your organization`
            });
          }

          // Create journal line
          const journalLine = new JournalLine({
            journalEntryId: journalEntry._id,
            lineNumber: i + 1,
            accountId: line.accountId,
            description: line.description,
            debit: line.debit || 0,
            credit: line.credit || 0,
            stabulumAmount: line.stabulumAmount || 0,
            stabulumConfirmed: line.stabulumConfirmed || false,
            customerId: line.customerId,
            vendorId: line.vendorId,
            projectId: line.projectId,
            departmentId: line.departmentId,
            taxCode: line.taxCode,
            taxRate: line.taxRate || 0
          });

          totalDebits += journalLine.debit;
          totalCredits += journalLine.credit;

          await journalLine.save({ session });
        }

        // Verify debits = credits if entry is posted
        if (journalEntry.status === 'posted' && Math.abs(totalDebits - totalCredits) > 0.01) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ 
            message: 'Journal entry is not balanced. Total debits must equal total credits.',
            totalDebits,
            totalCredits
          });
        }
      }

      // Create audit trail if there were changes
      if (changes.length > 0) {
        const auditTrail = new AuditTrail({
          organizationId: req.user.organization,
          userId: req.user.id,
          action: 'update',
          entityType: 'journal-entry',
          entityId: journalEntry._id,
          timestamp: new Date(),
          changes
        });
        
        await auditTrail.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      // Return the updated journal entry with its lines
      const populatedEntry = await JournalEntry.findById(journalEntry._id)
        .populate('journalId', 'name type')
        .populate('createdBy', 'firstName lastName')
        .populate('fiscalPeriodId', 'name startDate endDate');
      
      const entryLines = await JournalLine.find({ journalEntryId: journalEntry._id })
        .populate('accountId', 'accountNumber name type')
        .populate('customerId', 'name')
        .populate('vendorId', 'name')
        .sort('lineNumber');
      
      res.json({
        journalEntry: populatedEntry,
        lines: entryLines
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error updating journal entry:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   POST api/journal-entries/:id/post
// @desc    Post a draft journal entry
// @access  Private
router.post('/:id/post', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find journal entry
    const journalEntry = await JournalEntry.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });

    if (!journalEntry) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Journal entry not found' });
    }

    // Check if entry is already posted
    if (journalEntry.status !== 'draft') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: `Journal entry is already ${journalEntry.status}` 
      });
    }

    // Get journal lines
    const journalLines = await JournalLine.find({
      journalEntryId: journalEntry._id
    });

    if (journalLines.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: 'Cannot post journal entry with no lines' 
      });
    }

    // Verify debits = credits
    let totalDebits = 0;
    let totalCredits = 0;

    journalLines.forEach(line => {
      totalDebits += line.debit;
      totalCredits += line.credit;
    });

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: 'Journal entry is not balanced. Total debits must equal total credits.',
        totalDebits,
        totalCredits
      });
    }

    // Update journal entry
    journalEntry.status = 'posted';
    journalEntry.postingDate = Date.now();
    journalEntry.updatedAt = Date.now();

    await journalEntry.save({ session });

    // Update account balances
    for (const line of journalLines) {
      const account = await ChartOfAccounts.findById(line.accountId);
      
      if (account) {
        // Update account balance based on account type and debit/credit
        if (line.debit > 0) {
          // Debits increase asset and expense accounts, decrease liability, equity, and revenue
          if (['asset', 'expense'].includes(account.type)) {
            account.balance.amount += line.debit;
          } else {
            account.balance.amount -= line.debit;
          }
        }
        
        if (line.credit > 0) {
          // Credits decrease asset and expense accounts, increase liability, equity, and revenue
          if (['asset', 'expense'].includes(account.type)) {
            account.balance.amount -= line.credit;
          } else {
            account.balance.amount += line.credit;
          }
        }
        
        account.balance.lastUpdated = new Date();
        await account.save({ session });
      }
    }

    // Create audit trail
    const auditTrail = new AuditTrail({
      organizationId: req.user.organization,
      userId: req.user.id,
      action: 'post',
      entityType: 'journal-entry',
      entityId: journalEntry._id,
      timestamp: new Date(),
      changes: [
        {
          field: 'status',
          oldValue: 'draft',
          newValue: 'posted'
        }
      ]
    });
    
    await auditTrail.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Return the posted journal entry with its lines
    const populatedEntry = await JournalEntry.findById(journalEntry._id)
      .populate('journalId', 'name type')
      .populate('createdBy', 'firstName lastName')
      .populate('fiscalPeriodId', 'name startDate endDate');
    
    const updatedLines = await JournalLine.find({ journalEntryId: journalEntry._id })
      .populate('accountId', 'accountNumber name type')
      .sort('lineNumber');
    
    res.json({
      journalEntry: populatedEntry,
      lines: updatedLines
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error posting journal entry:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/journal-entries/:id/void
// @desc    Void a posted journal entry
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

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find journal entry
      const journalEntry = await JournalEntry.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!journalEntry) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Journal entry not found' });
      }

      // Use the model's instance method to void the entry
      await journalEntry.voidEntry(req.user.id, reason);

      await session.commitTransaction();
      session.endSession();

      // Return the voided journal entry
      const populatedEntry = await JournalEntry.findById(journalEntry._id)
        .populate('journalId', 'name type')
        .populate('createdBy', 'firstName lastName');
      
      res.json({
        journalEntry: populatedEntry,
        message: 'Journal entry voided successfully'
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error voiding journal entry:', err.message);
      
      if (err.message === 'Journal entry is already voided' || 
          err.message === 'Cannot void a reconciled entry') {
        return res.status(400).json({ message: err.message });
      }
      
      res.status(500).send('Server error');
    }
  }
);

// @route   POST api/journal-entries/:id/reverse
// @desc    Create a reversing entry for a posted journal entry
// @access  Private
router.post(
  '/:id/reverse',
  [
    auth,
    [
      check('date', 'Date is required').not().isEmpty(),
      check('reason', 'Reason is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { date, reason } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find journal entry
      const journalEntry = await JournalEntry.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!journalEntry) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Journal entry not found' });
      }

      // Use the model's instance method to create a reversing entry
      const reversalEntry = await journalEntry.createReversalEntry(
        req.user.id, 
        new Date(date),
        reason
      );

      await session.commitTransaction();
      session.endSession();

      // Return both the original and reversal entry
      const populatedOriginal = await JournalEntry.findById(journalEntry._id)
        .populate('journalId', 'name type')
        .populate('createdBy', 'firstName lastName');
      
      const populatedReversal = await JournalEntry.findById(reversalEntry._id)
        .populate('journalId', 'name type')
        .populate('createdBy', 'firstName lastName');
      
      const reversalLines = await JournalLine.find({ journalEntryId: reversalEntry._id })
        .populate('accountId', 'accountNumber name type')
        .sort('lineNumber');
      
      res.status(201).json({
        originalEntry: populatedOriginal,
        reversalEntry: populatedReversal,
        reversalLines,
        message: 'Reversal entry created successfully'
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error creating reversal entry:', err.message);
      
      if (err.message === 'Only posted entries can be reversed' || 
          err.message === 'This entry has already been reversed') {
        return res.status(400).json({ message: err.message });
      }
      
      res.status(500).send('Server error');
    }
  }
);

// @route   DELETE api/journal-entries/:id
// @desc    Delete a draft journal entry
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find journal entry
    const journalEntry = await JournalEntry.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });

    if (!journalEntry) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Journal entry not found' });
    }

    // Only draft entries can be deleted
    if (journalEntry.status !== 'draft') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: 'Only draft journal entries can be deleted' 
      });
    }

    // Delete journal lines
    await JournalLine.deleteMany({ 
      journalEntryId: journalEntry._id 
    }, { session });

    // Delete journal entry
    await JournalEntry.deleteOne({ _id: journalEntry._id }, { session });

    // Create audit trail
    const auditTrail = new AuditTrail({
      organizationId: req.user.organization,
      userId: req.user.id,
      action: 'delete',
      entityType: 'journal-entry',
      entityId: journalEntry._id,
      timestamp: new Date()
    });
    
    await auditTrail.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Journal entry deleted successfully' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error deleting journal entry:', err.message);
    res.status(500).send('Server error');
  }
});

// Export router
module.exports = router;
