// routes/journals.js
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Journal = require('../models/Journal');
const JournalEntry = require('../models/JournalEntry');
const JournalLine = require('../models/JournalLine');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const AuditTrail = require('../models/AuditTrail');

// @route   GET api/journals
// @desc    Get all journals for organization
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const journals = await Journal.find({ 
      organizationId: req.user.organization 
    }).sort({ name: 1 });
    
    res.json(journals);
  } catch (err) {
    console.error('Error fetching journals:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/journals
// @desc    Create a new journal
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('name', 'Name is required').not().isEmpty(),
      check('type', 'Type is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, type } = req.body;

    try {
      // Check if journal with same name already exists
      const existingJournal = await Journal.findOne({
        organizationId: req.user.organization,
        name
      });

      if (existingJournal) {
        return res.status(400).json({ 
          message: 'A journal with this name already exists' 
        });
      }

      // Create new journal
      const journal = new Journal({
        organizationId: req.user.organization,
        name,
        description,
        type,
        createdBy: req.user.id,
        isActive: true
      });

      await journal.save();
      
      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'create',
        entityType: 'journal',
        entityId: journal._id,
        timestamp: new Date()
      });
      
      await auditTrail.save();

      res.status(201).json(journal);
    } catch (err) {
      console.error('Error creating journal:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET api/journals/:id
// @desc    Get journal by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const journal = await Journal.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });

    if (!journal) {
      return res.status(404).json({ message: 'Journal not found' });
    }

    res.json(journal);
  } catch (err) {
    console.error('Error fetching journal:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/journals/:id
// @desc    Update journal
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

    const { name, description, type, isActive } = req.body;

    try {
      let journal = await Journal.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });

      if (!journal) {
        return res.status(404).json({ message: 'Journal not found' });
      }

      // Check if another journal with same name exists
      if (name !== journal.name) {
        const existingJournal = await Journal.findOne({
          organizationId: req.user.organization,
          name,
          _id: { $ne: req.params.id }
        });

        if (existingJournal) {
          return res.status(400).json({ 
            message: 'A journal with this name already exists' 
          });
        }
      }

      // Track changes for audit trail
      const changes = [];
      if (name !== journal.name) {
        changes.push({
          field: 'name',
          oldValue: journal.name,
          newValue: name
        });
      }
      
      if (description !== journal.description) {
        changes.push({
          field: 'description',
          oldValue: journal.description,
          newValue: description
        });
      }
      
      if (type !== journal.type) {
        changes.push({
          field: 'type',
          oldValue: journal.type,
          newValue: type
        });
      }
      
      if (isActive !== undefined && isActive !== journal.isActive) {
        changes.push({
          field: 'isActive',
          oldValue: journal.isActive.toString(),
          newValue: isActive.toString()
        });
      }

      // Update journal
      journal.name = name;
      journal.description = description;
      journal.type = type;
      if (isActive !== undefined) {
        journal.isActive = isActive;
      }
      journal.updatedAt = Date.now();

      await journal.save();
      
      // Create audit trail if there were changes
      if (changes.length > 0) {
        const auditTrail = new AuditTrail({
          organizationId: req.user.organization,
          userId: req.user.id,
          action: 'update',
          entityType: 'journal',
          entityId: journal._id,
          timestamp: new Date(),
          changes
        });
        
        await auditTrail.save();
      }

      res.json(journal);
    } catch (err) {
      console.error('Error updating journal:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   DELETE api/journals/:id
// @desc    Delete journal (soft delete by setting isActive to false)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const journal = await Journal.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });

    if (!journal) {
      return res.status(404).json({ message: 'Journal not found' });
    }

    // Check if journal has any entries
    const entriesCount = await JournalEntry.countDocuments({
      journalId: journal._id
    });

    if (entriesCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete journal with existing entries. Deactivate it instead.'
      });
    }

    // Perform soft delete
    journal.isActive = false;
    journal.updatedAt = Date.now();

    await journal.save();
    
    // Create audit trail
    const auditTrail = new AuditTrail({
      organizationId: req.user.organization,
      userId: req.user.id,
      action: 'delete',
      entityType: 'journal',
      entityId: journal._id,
      timestamp: new Date(),
      changes: [
        {
          field: 'isActive',
          oldValue: 'true',
          newValue: 'false'
        }
      ]
    });
    
    await auditTrail.save();

    res.json({ message: 'Journal deactivated successfully' });
  } catch (err) {
    console.error('Error deleting journal:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/journals/:id/entries
// @desc    Get journal entries for a specific journal
// @access  Private
router.get('/:id/entries', auth, async (req, res) => {
  try {
    const { page = 1, limit = 25, status, startDate, endDate, search } = req.query;
    
    // Check if journal exists and belongs to organization
    const journal = await Journal.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });

    if (!journal) {
      return res.status(404).json({ message: 'Journal not found' });
    }

    // Build query
    const query = {
      journalId: journal._id,
      organizationId: req.user.organization
    };

    if (status) {
      query.status = status;
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
        { description: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } },
        { entryNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const entries = await JournalEntry.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName');

    // Get total count for pagination
    const total = await JournalEntry.countDocuments(query);

    res.json({
      entries,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (err) {
    console.error('Error fetching journal entries:', err.message);
    res.status(500).send('Server error');
  }
});

// Export router
module.exports = router;
