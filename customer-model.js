// models/Customer.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CustomerSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  customerNumber: {
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
  shippingAddress: {
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
  useShippingAsBilling: {
    type: Boolean,
    default: false
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
  creditLimit: {
    type: Number,
    default: 0
  },
  terms: {
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
  notes: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  customerGroup: {
    type: String,
    trim: true,
    index: true
  },
  category: {
    type: String,
    trim: true,
    index: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  defaultAccountId: {
    type: Schema.Types.ObjectId,
    ref: 'ChartOfAccounts'
  },
  taxExempt: {
    type: Boolean,
    default: false
  },
  taxExemptionNumber: {
    type: String,
    trim: true
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
CustomerSchema.index({ organizationId: 1, customerNumber: 1 }, { unique: true });
CustomerSchema.index({ organizationId: 1, name: 1 });
CustomerSchema.index({ organizationId: 1, stabulumWalletAddress: 1 });

// Pre-save middleware
CustomerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // If using shipping as billing, copy shipping address to billing
  if (this.useShippingAsBilling && this.shippingAddress) {
    this.address = this.shippingAddress;
  }
  
  next();
});

// Static method to generate next customer number
CustomerSchema.statics.generateCustomerNumber = async function(organizationId) {
  const organization = await mongoose.model('Organization').findById(organizationId);
  
  if (!organization) {
    throw new Error('Organization not found');
  }
  
  const prefix = organization.settings?.customerPrefix || 'CUS';
  
  const lastCustomer = await this.findOne(
    { organizationId },
    {},
    { sort: { customerNumber: -1 } }
  );
  
  let sequence = 1;
  
  if (lastCustomer && lastCustomer.customerNumber) {
    // Try to extract sequence from last customer number
    const matches = lastCustomer.customerNumber.match(/\d+$/);
    
    if (matches) {
      sequence = parseInt(matches[0]) + 1;
    }
  }
  
  return `${prefix}${sequence.toString().padStart(5, '0')}`;
};

// Instance method to get customer balance
CustomerSchema.methods.getBalance = async function() {
  const Invoice = mongoose.model('Invoice');
  const invoices = await Invoice.find({
    organizationId: this.organizationId,
    customerId: this._id,
    status: { $in: ['sent', 'partial', 'overdue'] }
  });
  
  let balance = 0;
  invoices.forEach(invoice => {
    balance += invoice.balance;
  });
  
  return balance;
};

// Instance method to get overdue amount
CustomerSchema.methods.getOverdueAmount = async function() {
  const Invoice = mongoose.model('Invoice');
  const overdueInvoices = await Invoice.find({
    organizationId: this.organizationId,
    customerId: this._id,
    status: 'overdue'
  });
  
  let overdueAmount = 0;
  overdueInvoices.forEach(invoice => {
    overdueAmount += invoice.balance;
  });
  
  return overdueAmount;
};

// Virtual for full address
CustomerSchema.virtual('fullAddress').get(function() {
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

module.exports = mongoose.model('Customer', CustomerSchema);
