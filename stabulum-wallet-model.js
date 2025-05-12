// models/StabulumWallet.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StabulumWalletSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  publicKey: {
    type: String,
    required: true,
    trim: true
  },
  encryptedPrivateKey: {
    type: String,
    required: true
  },
  balance: {
    type: Number,
    default: 0
  },
  lastSynced: {
    type: Date,
    default: Date.now
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  purpose: {
    type: String,
    enum: ['operating', 'payroll', 'tax', 'customer-payments', 'vendor-payments', 'savings', 'other'],
    default: 'operating'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true
  }
});

// Index for faster lookups
StabulumWalletSchema.index({ organizationId: 1, isDefault: 1 });
StabulumWalletSchema.index({ address: 1 });

// Pre-save middleware to update timestamps
StabulumWalletSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to safely return wallet info without sensitive data
StabulumWalletSchema.methods.toPublic = function() {
  const walletObj = this.toObject();
  delete walletObj.encryptedPrivateKey;
  return walletObj;
};

// Static method to find organization's default wallet
StabulumWalletSchema.statics.findDefaultWallet = async function(organizationId) {
  return this.findOne({ 
    organizationId, 
    isDefault: true,
    isActive: true
  });
};

// Static method to find wallets by purpose
StabulumWalletSchema.statics.findByPurpose = async function(organizationId, purpose) {
  return this.find({ 
    organizationId, 
    purpose,
    isActive: true
  });
};

// Instance method to set this wallet as default
StabulumWalletSchema.methods.setAsDefault = async function() {
  // First, unset any existing default wallets for this organization
  await this.constructor.updateMany(
    { organizationId: this.organizationId, isDefault: true },
    { isDefault: false }
  );
  
  // Then set this wallet as default
  this.isDefault = true;
  return this.save();
};

module.exports = mongoose.model('StabulumWallet', StabulumWalletSchema);
