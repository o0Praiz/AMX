// models/Vendor.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VendorSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  vendorNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  contactName: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    index: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    street: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    zip: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      trim: true,
      default: 'United States'
    }
  },
  taxId: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  paymentTerms: {
    type: String,
    enum: ['net7', 'net15', 'net30', 'net60', 'net90', 'due-on-receipt', 'custom'],
    default: 'net30'
  },
  customTerms: {
    type: String,
    trim: true
  },
  stabulumWalletAddress: {
    type: String,
    trim: true
  },
  preferredPaymentMethod: {
    type: String,
    enum: ['check', 'bank-transfer', 'credit-card', 'stabulum', 'other', null],
    default: null
  },
  notes: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  vendorCategory: {
    type: String,
    trim: true,
    index: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  defaultExpenseAccountId: {
    type: Schema.Types.ObjectId,
    ref: 'ChartOfAccounts'
  },
  tax1099: {
    type: Boolean,
    default: false
  },
  tax1099Type: {
    type: String,
    enum: ['1099-MISC', '1099-NEC', null],
    default: null
  },
  bankAccountInfo: {
    bankName: {
      type: String,
      trim: true
    },
    accountNumber: {
      type: String,
      trim: true
    },
    routingNumber: {
      type: String,
      trim: true
    },
    accountType: {
      type: String,
      enum: ['checking', 'savings', null],
      default: null
    }
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  contacts: [{
    name: {
      type: String,
      trim: true
    },
    title: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  }
});

// Compound indices
VendorSchema.index({ organizationId: 1, vendorNumber: 1 }, { unique: true });
VendorSchema.index({ organizationId: 1, name: 1 });
VendorSchema.index({ organizationId: 1, stabulumWalletAddress: 1 });

// Pre-save middleware
VendorSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to generate next vendor number
VendorSchema.statics.generateVendorNumber = async function(organizationId) {
  const organization = await mongoose.model('Organization').findById(organizationId);
  
  if (!organization) {
    throw new Error('Organization not found');
  }
  
  const prefix = organization.settings?.vendorPrefix || 'VEN';
  
  const lastVendor = await this.findOne(
    { organizationId },
    {},
    { sort: { vendorNumber: -1 } }
  );
  
  let sequence = 1;
  
  if (lastVendor && lastVendor.vendorNumber) {
    // Try to extract sequence from last vendor number
    const matches = lastVendor.vendorNumber.match(/\d+$/);
    
    if (matches) {
      sequence = parseInt(matches[0]) + 1;
    }
  }
  
  return `${prefix}${sequence.toString().padStart(5, '0')}`;
};

// Instance method to get vendor balance
VendorSchema.methods.getBalance = async function() {
  const Bill = mongoose.model('Bill');
  const bills = await Bill.find({
    organizationId: this.organizationId,
    vendorId: this._id,
    status: { $in: ['received', 'partial', 'overdue'] }
  });
  
  let balance = 0;
  bills.forEach(bill => {
    balance += bill.balance;
  });
  
  return balance;
};

// Instance method to get overdue amount
VendorSchema.methods.getOverdueAmount = async function() {
  const Bill = mongoose.model('Bill');
  const overdueBills = await Bill.find({
    organizationId: this.organizationId,
    vendorId: this._id,
    status: 'overdue'
  });
  
  let overdueAmount = 0;
  overdueBills.forEach(bill => {
    overdueAmount += bill.balance;
  });
  
  return overdueAmount;
};

// Virtual for full address
VendorSchema.virtual('fullAddress').get(function() {
  if (!this.address) return '';
  
  const parts = [];
  if (this.address.street) parts.push(this.address.street);
  if (this.address.city) {
    let cityState = this.address.city;
    if (this.address.state) cityState += `, ${this.address.state}`;
    if (this.address.zip) cityState += ` ${this.address.zip}`;
    parts.push(cityState);
  }
  if (this.address.country && this.address.country !== 'United States') {
    parts.push(this.address.country);
  }
  
  return parts.join('\n');
});

module.exports = mongoose.model('Vendor', VendorSchema);
