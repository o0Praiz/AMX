// models/StabulumTransaction.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StabulumTransactionSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  transactionHash: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  blockHeight: {
    type: Number,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  fromAddress: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  toAddress: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
    index: true
  },
  confirmations: {
    type: Number,
    default: 0
  },
  journalEntryId: {
    type: Schema.Types.ObjectId,
    ref: 'JournalEntry',
    index: true
  },
  transactionType: {
    type: String,
    enum: ['payment', 'receipt', 'internal', 'fee'],
    required: true,
    index: true
  },
  relatedDocumentType: {
    type: String,
    enum: ['invoice', 'bill', 'transfer', 'expense', 'other', null],
    default: null
  },
  relatedDocumentId: {
    type: Schema.Types.ObjectId,
    refPath: 'relatedDocumentType',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  fee: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  }
});

// Compound indices
StabulumTransactionSchema.index({ organizationId: 1, status: 1 });
StabulumTransactionSchema.index({ organizationId: 1, transactionType: 1 });
StabulumTransactionSchema.index({ fromAddress: 1, toAddress: 1 });
StabulumTransactionSchema.index({ relatedDocumentType: 1, relatedDocumentId: 1 });

// Pre-save middleware to update timestamps
StabulumTransactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to find transactions by wallet address
StabulumTransactionSchema.statics.findByWalletAddress = async function(address, limit = 20) {
  const normalizedAddress = address.toLowerCase();
  return this.find({
    $or: [
      { fromAddress: normalizedAddress },
      { toAddress: normalizedAddress }
    ]
  })
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to find pending transactions for an organization
StabulumTransactionSchema.statics.findPendingTransactions = async function(organizationId) {
  return this.find({
    organizationId,
    status: 'pending'
  }).sort({ timestamp: -1 });
};

// Static method to calculate total volume for an organization
StabulumTransactionSchema.statics.calculateVolume = async function(organizationId, startDate, endDate) {
  const result = await this.aggregate([
    {
      $match: {
        organizationId: mongoose.Types.ObjectId(organizationId),
        status: 'confirmed',
        timestamp: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$transactionType',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Format results into an easier-to-use object
  const volumeByType = {};
  result.forEach(item => {
    volumeByType[item._id] = {
      totalAmount: item.totalAmount,
      count: item.count
    };
  });
  
  return volumeByType;
};

// Instance method to mark transaction as confirmed
StabulumTransactionSchema.methods.markAsConfirmed = async function(blockHeight, confirmations) {
  this.status = 'confirmed';
  this.blockHeight = blockHeight;
  this.confirmations = confirmations;
  this.updatedAt = Date.now();
  return this.save();
};

// Instance method to update confirmation count
StabulumTransactionSchema.methods.updateConfirmations = async function(confirmations) {
  this.confirmations = confirmations;
  this.updatedAt = Date.now();
  return this.save();
};

module.exports = mongoose.model('StabulumTransaction', StabulumTransactionSchema);
