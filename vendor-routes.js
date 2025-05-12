// routes/vendors.js
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Vendor = require('../models/Vendor');
const { Bill } = require('../models/Bill');
const AuditTrail = require('../models/AuditTrail');

// @route   GET api/vendors
// @desc    Get all vendors
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { active, search, sort = 'name', order = 'asc', page = 1, limit = 25 } = req.query;
    
    const query = { organizationId: req.user.organization };
    
    if (active === 'true') {
      query.isActive = true;
    } else if (active === 'false') {
      query.isActive = false;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { vendorNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } }
      ];
    }
    
    const sortOptions = {};
    sortOptions[sort] = order === 'asc' ? 1 : -1;
    
    const total = await Vendor.countDocuments(query);
    const vendors = await Vendor.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    res.json({
      vendors,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching vendors:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/vendors
// @desc    Create a new vendor
// @access  Private
router.post(
  '/',
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
      contactName,
      email,
      phone,
      address,
      taxId,
      website,
      paymentTerms,
      customTerms,
      stabulumWalletAddress,
      preferredPaymentMethod,
      notes,
      vendorCategory,
      tags,
      defaultExpenseAccountId,
      tax1099,
      tax1099Type,
      bankAccountInfo
    } = req.body;
    
    try {
      // Generate vendor number
      const vendorNumber = await Vendor.generateVendorNumber(req.user.organization);
      
      // Create vendor
      const vendor = new Vendor({
        organizationId: req.user.organization,
        vendorNumber,
        name,
        contactName,
        email,
        phone,
        address,
        taxId,
        website,
        paymentTerms,
        customTerms,
        stabulumWalletAddress,
        preferredPaymentMethod,
        notes,
        vendorCategory,
        tags,
        defaultExpenseAccountId,
        tax1099,
        tax1099Type,
        bankAccountInfo
      });
      
      await vendor.save();
      
      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'create',
        entityType: 'vendor',
        entityId: vendor._id,
        timestamp: new Date()
      });
      
      await auditTrail.save();
      
      res.status(201).json(vendor);
    } catch (err) {
      console.error('Error creating vendor:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET api/vendors/:id
// @desc    Get vendor by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    res.json(vendor);
  } catch (err) {
    console.error('Error fetching vendor:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/vendors/:id
// @desc    Update vendor
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
      contactName,
      email,
      phone,
      address,
      taxId,
      website,
      paymentTerms,
      customTerms,
      stabulumWalletAddress,
      preferredPaymentMethod,
      notes,
      isActive,
      vendorCategory,
      tags,
      defaultExpenseAccountId,
      tax1099,
      tax1099Type,
      bankAccountInfo
    } = req.body;
    
    try {
      let vendor = await Vendor.findOne({
        _id: req.params.id,
        organizationId: req.user.organization
      });
      
      if (!vendor) {
        return res.status(404).json({ message: 'Vendor not found' });
      }
      
      // Track changes for audit trail
      const changes = [];
      
      if (name !== vendor.name) {
        changes.push({
          field: 'name',
          oldValue: vendor.name,
          newValue: name
        });
      }
      
      if (isActive !== undefined && isActive !== vendor.isActive) {
        changes.push({
          field: 'isActive',
          oldValue: vendor.isActive.toString(),
          newValue: isActive.toString()
        });
      }
      
      // Update vendor
      vendor.name = name;
      if (contactName !== undefined) vendor.contactName = contactName;
      if (email !== undefined) vendor.email = email;
      if (phone !== undefined) vendor.phone = phone;
      if (address !== undefined) vendor.address = address;
      if (taxId !== undefined) vendor.taxId = taxId;
      if (website !== undefined) vendor.website = website;
      if (paymentTerms !== undefined) vendor.paymentTerms = paymentTerms;
      if (customTerms !== undefined) vendor.customTerms = customTerms;
      if (stabulumWalletAddress !== undefined) vendor.stabulumWalletAddress = stabulumWalletAddress;
      if (preferredPaymentMethod !== undefined) vendor.preferredPaymentMethod = preferredPaymentMethod;
      if (notes !== undefined) vendor.notes = notes;
      if (isActive !== undefined) vendor.isActive = isActive;
      if (vendorCategory !== undefined) vendor.vendorCategory = vendorCategory;
      if (tags !== undefined) vendor.tags = tags;
      if (defaultExpenseAccountId !== undefined) vendor.defaultExpenseAccountId = defaultExpenseAccountId;
      if (tax1099 !== undefined) vendor.tax1099 = tax1099;
      if (tax1099Type !== undefined) vendor.tax1099Type = tax1099Type;
      if (bankAccountInfo !== undefined) vendor.bankAccountInfo = bankAccountInfo;
      
      await vendor.save();
      
      // Create audit trail if there were changes
      if (changes.length > 0) {
        const auditTrail = new AuditTrail({
          organizationId: req.user.organization,
          userId: req.user.id,
          action: 'update',
          entityType: 'vendor',
          entityId: vendor._id,
          timestamp: new Date(),
          changes
        });
        
        await auditTrail.save();
      }
      
      res.json(vendor);
    } catch (err) {
      console.error('Error updating vendor:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   DELETE api/vendors/:id
// @desc    Delete vendor (or deactivate if has transactions)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    // Check if vendor has bills
    const hasBills = await Bill.findOne({
      vendorId: vendor._id
    });
    
    if (hasBills) {
      // Deactivate vendor instead of deleting
      vendor.isActive = false;
      await vendor.save();
      
      // Create audit trail
      const auditTrail = new AuditTrail({
        organizationId: req.user.organization,
        userId: req.user.id,
        action: 'deactivate',
        entityType: 'vendor',
        entityId: vendor._id,
        timestamp: new Date(),
        notes: 'Vendor deactivated instead of deleted due to existing bills'
      });
      
      await auditTrail.save();
      
      return res.json({ 
        message: 'Vendor has existing bills and cannot be deleted. It has been deactivated instead.' 
      });
    }
    
    // Delete vendor if no bills
    await Vendor.deleteOne({ _id: vendor._id });
    
    // Create audit trail
    const auditTrail = new AuditTrail({
      organizationId: req.user.organization,
      userId: req.user.id,
      action: 'delete',
      entityType: 'vendor',
      entityId: vendor._id,
      timestamp: new Date()
    });
    
    await auditTrail.save();
    
    res.json({ message: 'Vendor deleted successfully' });
  } catch (err) {
    console.error('Error deleting vendor:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/vendors/:id/bills
// @desc    Get bills for a vendor
// @access  Private
router.get('/:id/bills', auth, async (req, res) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 25 } = req.query;
    
    // Verify vendor exists and belongs to organization
    const vendor = await Vendor.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    // Build query
    const query = {
      organizationId: req.user.organization,
      vendorId: vendor._id
    };
    
    if (status) {
      if (status === 'unpaid') {
        query.status = { $in: ['received', 'partial', 'overdue'] };
      } else {
        query.status = status;
      }
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
    
    // Get total count
    const total = await Bill.countDocuments(query);
    
    // Get bills with pagination
    const bills = await Bill.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    // Calculate summary statistics
    const unpaidBills = await Bill.find({
      organizationId: req.user.organization,
      vendorId: vendor._id,
      status: { $in: ['received', 'partial', 'overdue'] }
    });
    
    let totalUnpaid = 0;
    let totalOverdue = 0;
    
    unpaidBills.forEach(bill => {
      totalUnpaid += bill.balance;
      
      if (bill.status === 'overdue') {
        totalOverdue += bill.balance;
      }
    });
    
    res.json({
      vendor: {
        id: vendor._id,
        name: vendor.name,
        vendorNumber: vendor.vendorNumber
      },
      bills,
      summary: {
        totalUnpaid,
        totalOverdue,
        count: total
      },
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching vendor bills:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/vendors/stats/summary
// @desc    Get vendor statistics summary
// @access  Private
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const totalVendors = await Vendor.countDocuments({
      organizationId: req.user.organization
    });
    
    const activeVendors = await Vendor.countDocuments({
      organizationId: req.user.organization,
      isActive: true
    });
    
    const inactiveVendors = totalVendors - activeVendors;
    
    // Get vendors with outstanding bills
    const vendorsWithBills = await Bill.aggregate([
      {
        $match: {
          organizationId: mongoose.Types.ObjectId(req.user.organization),
          status: { $in: ['received', 'partial', 'overdue'] }
        }
      },
      {
        $group: {
          _id: '$vendorId',
          totalOutstanding: { $sum: '$balance' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalOutstanding: -1 } },
      { $limit: 10 }
    ]);
    
    // Get vendor details for the top vendors
    const vendorIds = vendorsWithBills.map(v => v._id);
    const topVendors = await Vendor.find({
      _id: { $in: vendorIds }
    }, 'name vendorNumber');
    
    // Map vendor details to results
    const vendorMap = {};
    topVendors.forEach(vendor => {
      vendorMap[vendor._id.toString()] = {
        name: vendor.name,
        vendorNumber: vendor.vendorNumber
      };
    });
    
    const topVendorsWithDetails = vendorsWithBills.map(vendor => ({
      id: vendor._id,
      name: vendorMap[vendor._id.toString()]?.name || 'Unknown Vendor',
      vendorNumber: vendorMap[vendor._id.toString()]?.vendorNumber || '',
      totalOutstanding: vendor.totalOutstanding,
      billCount: vendor.count
    }));
    
    // Calculate total spending by category (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const spendingByCategory = await Bill.aggregate([
      {
        $match: {
          organizationId: mongoose.Types.ObjectId(req.user.organization),
          date: { $gte: ninetyDaysAgo }
        }
      },
      {
        $lookup: {
          from: 'vendors',
          localField: 'vendorId',
          foreignField: '_id',
          as: 'vendor'
        }
      },
      { $unwind: '$vendor' },
      {
        $group: {
          _id: '$vendor.vendorCategory',
          totalSpent: { $sum: '$total' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } }
    ]);
    
    res.json({
      totalVendors,
      activeVendors,
      inactiveVendors,
      topVendors: topVendorsWithDetails,
      spendingByCategory
    });
  } catch (err) {
    console.error('Error generating vendor statistics:', err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
