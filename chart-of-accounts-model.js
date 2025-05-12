// models/ChartOfAccounts.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChartOfAccountsSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  accountNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['asset', 'liability', 'equity', 'revenue', 'expense'],
    required: true,
    index: true
  },
  subtype: {
    type: String,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  parentAccount: {
    type: Schema.Types.ObjectId,
    ref: 'ChartOfAccounts',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  balance: {
    amount: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  stabulumLinked: {
    type: Boolean,
    default: false
  },
  stabulumAddress: {
    type: String,
    trim: true,
    sparse: true
  },
  taxRate: {
    type: Number,
    default: 0
  },
  isTaxable: {
    type: Boolean,
    default: false
  },
  isCashEquivalent: {
    type: Boolean,
    default: false
  },
  isReconcilable: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  }
});

// Compound indices
ChartOfAccountsSchema.index({ organizationId: 1, accountNumber: 1 }, { unique: true });
ChartOfAccountsSchema.index({ organizationId: 1, type: 1 });
ChartOfAccountsSchema.index({ organizationId: 1, stabulumLinked: 1 });

// Pre-save middleware
ChartOfAccountsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Ensure no duplicate account numbers
ChartOfAccountsSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('accountNumber')) {
    const existing = await this.constructor.findOne({
      organizationId: this.organizationId,
      accountNumber: this.accountNumber,
      _id: { $ne: this._id }
    });
    
    if (existing) {
      const error = new Error(`Account number ${this.accountNumber} is already in use`);
      return next(error);
    }
  }
  
  next();
});

// Ensure Stabulum address is unique if provided
ChartOfAccountsSchema.pre('save', async function(next) {
  if (this.stabulumLinked && this.stabulumAddress && 
      (this.isNew || this.isModified('stabulumAddress'))) {
    const existing = await this.constructor.findOne({
      organizationId: this.organizationId,
      stabulumAddress: this.stabulumAddress,
      _id: { $ne: this._id }
    });
    
    if (existing) {
      const error = new Error(`Stabulum address ${this.stabulumAddress} is already linked to another account`);
      return next(error);
    }
  }
  
  next();
});

// Static method to generate next account number
ChartOfAccountsSchema.statics.generateAccountNumber = async function(organizationId, type) {
  // Get prefix based on account type
  let prefix;
  switch (type) {
    case 'asset':
      prefix = '1';
      break;
    case 'liability':
      prefix = '2';
      break;
    case 'equity':
      prefix = '3';
      break;
    case 'revenue':
      prefix = '4';
      break;
    case 'expense':
      prefix = '5';
      break;
    default:
      prefix = '9'; // Other
  }
  
  // Find the highest existing account number with this prefix
  const highestAccount = await this.findOne(
    { 
      organizationId,
      accountNumber: { $regex: `^${prefix}\\d*` }
    },
    {},
    { sort: { accountNumber: -1 } }
  );
  
  let nextNumber;
  if (highestAccount) {
    // Extract the numeric part and increment
    const currentNumber = parseInt(highestAccount.accountNumber);
    nextNumber = currentNumber + 1;
  } else {
    // First account of this type
    nextNumber = parseInt(prefix + '000');
  }
  
  return nextNumber.toString();
};

// Static method to find account by Stabulum address
ChartOfAccountsSchema.statics.findByStabulumAddress = async function(organizationId, address) {
  return this.findOne({
    organizationId,
    stabulumLinked: true,
    stabulumAddress: address
  });
};

// Instance method to set balance
ChartOfAccountsSchema.methods.setBalance = async function(amount) {
  this.balance.amount = amount;
  this.balance.lastUpdated = new Date();
  await this.save();
};

// Instance method to adjust balance
ChartOfAccountsSchema.methods.adjustBalance = async function(amount) {
  this.balance.amount += amount;
  this.balance.lastUpdated = new Date();
  await this.save();
};

module.exports = mongoose.model('ChartOfAccounts', ChartOfAccountsSchema);
