// routes/accounts.js
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const JournalEntry = require('../models/JournalEntry');
const JournalLine = require('../models/JournalLine');
const AuditTrail = require('../models/AuditTrail');

// @route   GET api/accounts
// @desc    Get chart of accounts
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { type, includeInactive, includeArchived, search } = req.query;
    
    // Build query
    const query = { organizationId: req.user.organization };
    
    if (type) {
      query.type = type;
    }
    
    if (includeInactive !== 'true') {
      query.isActive = true;
    }
    
    if (includeArchived !== 'true') {
      query.isArchived = false;
    }
    
    if (search) {
      query.$or = [
        { accountNumber: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get accounts
    const accounts = await ChartOfAccounts.find(query)
      .sort({ accountNumber: 1 })
      .populate('parentAccount', 'accountNumber name');
    
    res.json(accounts);
  } catch (err) {
    console.error('Error fetching chart of accounts:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/accounts
// @desc    Create a new account
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('name', 'Name is required').not().isEmpty(),
      check('type', 'Type is required').isIn([
        'asset', 'liability', 'equity', 'revenue', 'expense'
      ])
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      accountNumber, 
      name, 
      type, 
      subtype, 
      description,
      parentAccount,
      stabulumLinked,
      stabulumAddress,
      taxRate,
      isTaxable,
      isCashEquivalent,
      isReconcilable,
      metadata
    } = req.body;

    try {
      // Generate account number if not provided
      let finalAccountNumber = accountNumber;
      if (!finalAccountNumber) {
        finalAccountNumber = await ChartOfAccounts.generateAccountNumber(
          req.user.organization,
          type
        );
      }
      
      // Validate parent account if provided
      if (parentAccount) {
        const parent = await ChartOfAccounts.findOne({
          _id: parentAccount,
          organizationId: req.user.organization
        });
        
        if (!parent) {
          return res.status(400).json({ 
            message: 'Parent account not found' 
          });
        }
        
        // Check that parent account is of the same type
        if (parent.type !== type) {
          return res.status(400).json({ 
            message: 'Parent account must be of the same type' 
          });
        }
      }
      
      // Validate Stabulum address if provided
      if (stabulumLinked && stabulumAddress) {
        const existingAccount = await ChartOfAccounts.findOne({
          organizationId: req.user.organization,
          stabulumAddress,
          _id: { $ne: req.params.id }
        });
        
        if (existingAccount) {
          return res.status(400).json({ 
            message: 'Stabulum address is already linked to another account' 
          });
        }
      }

      // Create account
      const account = new ChartOfAccounts({
        organizationId: req.user.organization,
        accountNumber: finalAccountNumber,
        name,
        type,
        subtype,
        description,
        parentAccount,
        stabulumLinked: stabulumLinked || false,
        stabulumAddress: stabulumLinked ? stabulumAddress : null,
        taxRate: taxRate || 0,
        isTaxable: isTaxable || false,
        isCashEquivalent: isCashEquivalent || false,
        isReconcilable: isReconcilable || false,
        metadata: metadata || {}
      });

      await account.save();
      
      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'create',
        entityType: 'account',
        entityId: account._id,
        timestamp: new Date()
      });
      
      await auditTrail.save();

      res.status(201).json(account);
    } catch (err) {
      console.error('Error creating account:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET api/accounts/:id
// @desc    Get account by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const account = await ChartOfAccounts.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    }).populate('parentAccount', 'accountNumber name');

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json(account);
  } catch (err) {
    console.error('Error fetching account:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/accounts/:id
// @desc    Update account
// @access  Private
router.put(
  '/:id',
  [
    auth,
    [
      check('name', 'Name is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      name, 
      description,
      subtype,
      parentAccount,
      isActive,
      stabulumLinked,
      stabulumAddress,
      taxRate,
      isTaxable,
      isCashEquivalent,
      isReconcilable,
      isArchived,
      metadata
    } = req.body;

    try {
      // Find account
      const account = await ChartOfAccounts.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!account) {
        return res.status(404).json({ message: 'Account not found' });
      }
      
      // Check if account has transactions before allowing archive
      if (isArchived && !account.isArchived) {
        const hasTransactions = await JournalLine.findOne({
          accountId: account._id
        });
        
        if (hasTransactions) {
          return res.status(400).json({ 
            message: 'Cannot archive an account that has transactions' 
          });
        }
      }
      
      // Validate parent account if provided and changed
      if (parentAccount && parentAccount !== account.parentAccount?.toString()) {
        const parent = await ChartOfAccounts.findOne({
          _id: parentAccount,
          organizationId: req.user.organization
        });
        
        if (!parent) {
          return res.status(400).json({ 
            message: 'Parent account not found' 
          });
        }
        
        // Check that parent account is of the same type
        if (parent.type !== account.type) {
          return res.status(400).json({ 
            message: 'Parent account must be of the same type' 
          });
        }
        
        // Check for circular reference
        if (parentAccount === account._id.toString()) {
          return res.status(400).json({ 
            message: 'Account cannot be its own parent' 
          });
        }
      }
      
      // Validate Stabulum address if provided and changed
      if (stabulumLinked && 
          stabulumAddress && 
          stabulumAddress !== account.stabulumAddress) {
        const existingAccount = await ChartOfAccounts.findOne({
          organizationId: req.user.organization,
          stabulumAddress,
          _id: { $ne: req.params.id }
        });
        
        if (existingAccount) {
          return res.status(400).json({ 
            message: 'Stabulum address is already linked to another account' 
          });
        }
      }
      
      // Track changes for audit trail
      const changes = [];
      if (name !== account.name) {
        changes.push({
          field: 'name',
          oldValue: account.name,
          newValue: name
        });
      }
      
      if (description !== account.description) {
        changes.push({
          field: 'description',
          oldValue: account.description,
          newValue: description
        });
      }
      
      if (subtype !== account.subtype) {
        changes.push({
          field: 'subtype',
          oldValue: account.subtype,
          newValue: subtype
        });
      }
      
      if (parentAccount !== (account.parentAccount ? account.parentAccount.toString() : null)) {
        changes.push({
          field: 'parentAccount',
          oldValue: account.parentAccount ? account.parentAccount.toString() : null,
          newValue: parentAccount
        });
      }
      
      if (isActive !== undefined && isActive !== account.isActive) {
        changes.push({
          field: 'isActive',
          oldValue: account.isActive.toString(),
          newValue: isActive.toString()
        });
      }
      
      if (stabulumLinked !== account.stabulumLinked) {
        changes.push({
          field: 'stabulumLinked',
          oldValue: account.stabulumLinked.toString(),
          newValue: stabulumLinked.toString()
        });
      }
      
      if (stabulumAddress !== account.stabulumAddress) {
        changes.push({
          field: 'stabulumAddress',
          oldValue: account.stabulumAddress,
          newValue: stabulumAddress
        });
      }
      
      if (taxRate !== account.taxRate) {
        changes.push({
          field: 'taxRate',
          oldValue: account.taxRate.toString(),
          newValue: taxRate.toString()
        });
      }
      
      if (isTaxable !== account.isTaxable) {
        changes.push({
          field: 'isTaxable',
          oldValue: account.isTaxable.toString(),
          newValue: isTaxable.toString()
        });
      }
      
      if (isCashEquivalent !== account.isCashEquivalent) {
        changes.push({
          field: 'isCashEquivalent',
          oldValue: account.isCashEquivalent.toString(),
          newValue: isCashEquivalent.toString()
        });
      }
      
      if (isReconcilable !== account.isReconcilable) {
        changes.push({
          field: 'isReconcilable',
          oldValue: account.isReconcilable.toString(),
          newValue: isReconcilable.toString()
        });
      }
      
      if (isArchived !== account.isArchived) {
        changes.push({
          field: 'isArchived',
          oldValue: account.isArchived.toString(),
          newValue: isArchived.toString()
        });
      }

      // Update account
      account.name = name;
      account.description = description;
      if (subtype !== undefined) account.subtype = subtype;
      if (parentAccount !== undefined) account.parentAccount = parentAccount || null;
      if (isActive !== undefined) account.isActive = isActive;
      if (stabulumLinked !== undefined) account.stabulumLinked = stabulumLinked;
      if (stabulumLinked) {
        account.stabulumAddress = stabulumAddress;
      } else {
        account.stabulumAddress = null;
      }
      if (taxRate !== undefined) account.taxRate = taxRate;
      if (isTaxable !== undefined) account.isTaxable = isTaxable;
      if (isCashEquivalent !== undefined) account.isCashEquivalent = isCashEquivalent;
      if (isReconcilable !== undefined) account.isReconcilable = isReconcilable;
      if (isArchived !== undefined) account.isArchived = isArchived;
      if (metadata) {
        // Merge metadata rather than replacing
        for (const [key, value] of Object.entries(metadata)) {
          account.metadata.set(key, value);
        }
      }
      
      account.updatedAt = Date.now();

      await account.save();
      
      // Create audit trail if there were changes
      if (changes.length > 0) {
        const auditTrail = new AuditTrail({
          organizationId: req.user.organization,
          userId: req.user.id,
          action: 'update',
          entityType: 'account',
          entityId: account._id,
          timestamp: new Date(),
          changes
        });
        
        await auditTrail.save();
      }

      res.json(account);
    } catch (err) {
      console.error('Error updating account:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   DELETE api/accounts/:id
// @desc    Delete an account (if no associated transactions)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    // Find account
    const account = await ChartOfAccounts.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Check if account has transactions
    const hasTransactions = await JournalLine.findOne({
      accountId: account._id
    });
    
    if (hasTransactions) {
      return res.status(400).json({ 
        message: 'Cannot delete an account that has transactions. Consider archiving it instead.' 
      });
    }
    
    // Check if account has child accounts
    const hasChildren = await ChartOfAccounts.findOne({
      parentAccount: account._id
    });
    
    if (hasChildren) {
      return res.status(400).json({ 
        message: 'Cannot delete an account that has child accounts' 
      });
    }

    // Delete account
    await ChartOfAccounts.deleteOne({ _id: account._id });
    
    // Create audit trail
    const auditTrail = new AuditTrail({
      organizationId: req.user.organization,
      userId: req.user.id,
      action: 'delete',
      entityType: 'account',
      entityId: account._id,
      timestamp: new Date()
    });
    
    await auditTrail.save();

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Error deleting account:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/accounts/:id/transactions
// @desc    Get transactions for an account
// @access  Private
router.get('/:id/transactions', auth, async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    
    // Validate account exists and belongs to the organization
    const account = await ChartOfAccounts.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }
    
    // Build journal entry query
    const entryQuery = {
      organizationId: req.user.organization,
      status: 'posted'
    };
    
    if (startDate || endDate) {
      entryQuery.date = {};
      
      if (startDate) {
        entryQuery.date.$gte = new Date(startDate);
      }
      
      if (endDate) {
        entryQuery.date.$lte = new Date(endDate);
      }
    }
    
    // Get relevant journal entries
    const entries = await JournalEntry.find(entryQuery);
    const entryIds = entries.map(entry => entry._id);
    
    // Get journal lines for this account
    const totalLines = await JournalLine.countDocuments({
      journalEntryId: { $in: entryIds },
      accountId: account._id
    });
    
    const lines = await JournalLine.find({
      journalEntryId: { $in: entryIds },
      accountId: account._id
    })
      .sort({ 'journalEntryId.date': -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate({
        path: 'journalEntryId',
        select: 'entryNumber date description reference status',
        populate: {
          path: 'journalId',
          select: 'name type'
        }
      });
    
    // Calculate beginning balance
    let beginningBalance = 0;
    
    if (startDate) {
      // Get all entries before the start date
      const priorEntryQuery = {
        organizationId: req.user.organization,
        status: 'posted',
        date: { $lt: new Date(startDate) }
      };
      
      const priorEntries = await JournalEntry.find(priorEntryQuery);
      const priorEntryIds = priorEntries.map(entry => entry._id);
      
      // Get all lines for this account from prior entries
      const priorLines = await JournalLine.find({
        journalEntryId: { $in: priorEntryIds },
        accountId: account._id
      });
      
      // Calculate beginning balance based on account type
      priorLines.forEach(line => {
        if (['asset', 'expense'].includes(account.type)) {
          // Debit increases, credit decreases
          beginningBalance += line.debit - line.credit;
        } else {
          // Credit increases, debit decreases
          beginningBalance += line.credit - line.debit;
        }
      });
    }
    
    // Calculate running balance for each line
    let runningBalance = beginningBalance;
    const linesWithBalance = lines.map(line => {
      const lineCopy = line.toObject();
      
      if (['asset', 'expense'].includes(account.type)) {
        // Debit increases, credit decreases
        runningBalance += line.debit - line.credit;
      } else {
        // Credit increases, debit decreases
        runningBalance += line.credit - line.debit;
      }
      
      lineCopy.balance = runningBalance;
      return lineCopy;
    });
    
    res.json({
      account: {
        _id: account._id,
        accountNumber: account.accountNumber,
        name: account.name,
        type: account.type,
        balance: account.balance
      },
      beginningBalance,
      currentBalance: runningBalance,
      transactions: linesWithBalance,
      pagination: {
        total: totalLines,
        pages: Math.ceil(totalLines / limit),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error('Error fetching account transactions:', err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
