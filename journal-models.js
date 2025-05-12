// models/Journal.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const JournalSchema = new Schema({
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
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['general', 'sales', 'purchases', 'cash-receipts', 'cash-disbursements', 'payroll', 'fixed-assets'],
    default: 'general'
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
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Index for faster lookups
JournalSchema.index({ organizationId: 1, type: 1 });

// Pre-save middleware
JournalSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Journal', JournalSchema);

// models/JournalEntry.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const JournalEntrySchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  journalId: {
    type: Schema.Types.ObjectId,
    ref: 'Journal',
    required: true,
    index: true
  },
  entryNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  reference: {
    type: String,
    trim: true,
    index: true
  },
  status: {
    type: String,
    enum: ['draft', 'posted', 'reconciled', 'reversed', 'voided'],
    default: 'draft',
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  postingDate: {
    type: Date
  },
  reversingDate: {
    type: Date
  },
  reversalOf: {
    type: Schema.Types.ObjectId,
    ref: 'JournalEntry'
  },
  reversedBy: {
    type: Schema.Types.ObjectId,
    ref: 'JournalEntry'
  },
  hasAttachments: {
    type: Boolean,
    default: false
  },
  stabulumTransactionHash: {
    type: String,
    trim: true,
    index: true
  },
  stabulumTransactionBlockHeight: {
    type: Number
  },
  stabulumTransactionConfirmations: {
    type: Number,
    default: 0
  },
  fiscalPeriodId: {
    type: Schema.Types.ObjectId,
    ref: 'FiscalPeriod',
    index: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    trim: true
  }
});

// Compound indices
JournalEntrySchema.index({ organizationId: 1, date: 1 });
JournalEntrySchema.index({ organizationId: 1, status: 1 });
JournalEntrySchema.index({ journalId: 1, date: 1 });

// Pre-save middleware
JournalEntrySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Validate that debits = credits before saving
JournalEntrySchema.pre('save', async function(next) {
  if (this.status === 'posted') {
    const JournalLine = mongoose.model('JournalLine');
    
    const lines = await JournalLine.find({ journalEntryId: this._id });
    
    if (lines.length === 0) {
      const error = new Error('Journal entry must have at least one line item');
      return next(error);
    }
    
    const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);
    
    // Check if debits equal credits, allowing for small floating point differences
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      const error = new Error('Journal entry is not balanced. Debits must equal credits.');
      return next(error);
    }
  }
  
  next();
});

// Static method to generate next entry number
JournalEntrySchema.statics.generateEntryNumber = async function(organizationId, journalId) {
  const journal = await mongoose.model('Journal').findById(journalId);
  
  if (!journal) {
    throw new Error('Journal not found');
  }
  
  const prefix = journal.type.substring(0, 3).toUpperCase();
  
  const lastEntry = await this.findOne(
    { organizationId, journalId },
    {},
    { sort: { createdAt: -1 } }
  );
  
  let sequenceNumber = 1;
  
  if (lastEntry && lastEntry.entryNumber) {
    const lastSequenceStr = lastEntry.entryNumber.split('-')[1];
    
    if (lastSequenceStr && !isNaN(lastSequenceStr)) {
      sequenceNumber = parseInt(lastSequenceStr, 10) + 1;
    }
  }
  
  const year = new Date().getFullYear().toString().substr(2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  
  return `${prefix}-${year}${month}-${sequenceNumber.toString().padStart(5, '0')}`;
};

// Instance method to void a journal entry
JournalEntrySchema.methods.voidEntry = async function(userId, reason) {
  if (this.status === 'voided') {
    throw new Error('Journal entry is already voided');
  }
  
  if (this.status === 'reconciled') {
    throw new Error('Cannot void a reconciled entry');
  }
  
  const JournalLine = mongoose.model('JournalLine');
  const lines = await JournalLine.find({ journalEntryId: this._id });
  
  if (this.status === 'posted') {
    // Reverse the effect on account balances
    for (const line of lines) {
      const account = await mongoose.model('ChartOfAccounts').findById(line.accountId);
      
      if (account) {
        if (line.debit > 0) {
          // Reverse debit by reducing balance for asset/expense accounts, increasing for liability/equity/revenue
          if (['asset', 'expense'].includes(account.type)) {
            account.balance.amount -= line.debit;
          } else {
            account.balance.amount += line.debit;
          }
        }
        
        if (line.credit > 0) {
          // Reverse credit by increasing balance for asset/expense accounts, reducing for liability/equity/revenue
          if (['asset', 'expense'].includes(account.type)) {
            account.balance.amount += line.credit;
          } else {
            account.balance.amount -= line.credit;
          }
        }
        
        account.balance.lastUpdated = new Date();
        await account.save();
      }
    }
  }
  
  // Update the journal entry status
  this.status = 'voided';
  this.notes = this.notes ? `${this.notes}\n\nVoided: ${reason}` : `Voided: ${reason}`;
  this.updatedAt = new Date();
  
  // Create audit trail
  const AuditTrail = mongoose.model('AuditTrail');
  const auditTrail = new AuditTrail({
    organizationId: this.organizationId,
    userId,
    action: 'void',
    entityType: 'journal-entry',
    entityId: this._id,
    timestamp: new Date(),
    changes: [
      {
        field: 'status',
        oldValue: 'posted',
        newValue: 'voided'
      }
    ],
    notes: reason
  });
  
  await auditTrail.save();
  
  return this.save();
};

// Instance method to create a reversing entry
JournalEntrySchema.methods.createReversalEntry = async function(userId, date, reason) {
  if (this.status !== 'posted') {
    throw new Error('Only posted entries can be reversed');
  }
  
  if (this.reversedBy) {
    throw new Error('This entry has already been reversed');
  }
  
  const JournalLine = mongoose.model('JournalLine');
  const originalLines = await JournalLine.find({ journalEntryId: this._id });
  
  const JournalEntry = mongoose.model('JournalEntry');
  
  // Create the reversing entry
  const reversalEntry = new JournalEntry({
    organizationId: this.organizationId,
    journalId: this.journalId,
    entryNumber: await JournalEntry.generateEntryNumber(this.organizationId, this.journalId),
    date: date || new Date(),
    description: `Reversal of entry ${this.entryNumber}: ${this.description}`,
    reference: this.reference,
    status: 'draft',
    createdBy: userId,
    reversalOf: this._id,
    fiscalPeriodId: this.fiscalPeriodId,
    notes: reason
  });
  
  await reversalEntry.save();
  
  // Create the reversal lines with opposite debits and credits
  for (const line of originalLines) {
    const reversalLine = new JournalLine({
      journalEntryId: reversalEntry._id,
      lineNumber: line.lineNumber,
      accountId: line.accountId,
      description: `Reversal of ${line.description}`,
      debit: line.credit,  // Reverse debit and credit
      credit: line.debit,
      stabulumAmount: line.stabulumAmount,
      stabulumConfirmed: false
    });
    
    await reversalLine.save();
  }
  
  // Update the original entry to reference its reversal
  this.reversedBy = reversalEntry._id;
  await this.save();
  
  // Create audit trail
  const AuditTrail = mongoose.model('AuditTrail');
  const auditTrail = new AuditTrail({
    organizationId: this.organizationId,
    userId,
    action: 'reverse',
    entityType: 'journal-entry',
    entityId: this._id,
    timestamp: new Date(),
    changes: [
      {
        field: 'reversedBy',
        oldValue: null,
        newValue: reversalEntry._id.toString()
      }
    ],
    notes: reason
  });
  
  await auditTrail.save();
  
  return reversalEntry;
};

module.exports = mongoose.model('JournalEntry', JournalEntrySchema);

// models/JournalLine.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const JournalLineSchema = new Schema({
  journalEntryId: {
    type: Schema.Types.ObjectId,
    ref: 'JournalEntry',
    required: true,
    index: true
  },
  lineNumber: {
    type: Number,
    required: true
  },
  accountId: {
    type: Schema.Types.ObjectId,
    ref: 'ChartOfAccounts',
    required: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  debit: {
    type: Number,
    default: 0,
    min: 0
  },
  credit: {
    type: Number,
    default: 0,
    min: 0
  },
  stabulumAmount: {
    type: Number,
    default: 0
  },
  stabulumConfirmed: {
    type: Boolean,
    default: false
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    index: true
  },
  vendorId: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor',
    index: true
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  departmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },
  taxCode: {
    type: String,
    trim: true
  },
  taxRate: {
    type: Number,
    default: 0
  },
  reconciled: {
    type: Boolean,
    default: false
  },
  reconciliationDate: {
    type: Date
  },
  reconciliationId: {
    type: Schema.Types.ObjectId,
    ref: 'Reconciliation',
    index: true
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  }
});

// Compound indices
JournalLineSchema.index({ journalEntryId: 1, lineNumber: 1 }, { unique: true });
JournalLineSchema.index({ accountId: 1, journalEntryId: 1 });

// Validate that either debit or credit is non-zero but not both
JournalLineSchema.pre('validate', function(next) {
  if (this.debit > 0 && this.credit > 0) {
    const error = new Error('A journal line cannot have both debit and credit values');
    return next(error);
  }
  
  if (this.debit === 0 && this.credit === 0) {
    const error = new Error('A journal line must have either a debit or credit value');
    return next(error);
  }
  
  next();
});

// Update account balances after saving
JournalLineSchema.post('save', async function() {
  try {
    const JournalEntry = mongoose.model('JournalEntry');
    const entry = await JournalEntry.findById(this.journalEntryId);
    
    // Only update account balances for posted entries
    if (entry && entry.status === 'posted') {
      const ChartOfAccounts = mongoose.model('ChartOfAccounts');
      const account = await ChartOfAccounts.findById(this.accountId);
      
      if (account) {
        // Update account balance based on account type and debit/credit
        if (this.debit > 0) {
          // Debits increase asset and expense accounts, decrease liability, equity, and revenue
          if (['asset', 'expense'].includes(account.type)) {
            account.balance.amount += this.debit;
          } else {
            account.balance.amount -= this.debit;
          }
        }
        
        if (this.credit > 0) {
          // Credits decrease asset and expense accounts, increase liability, equity, and revenue
          if (['asset', 'expense'].includes(account.type)) {
            account.balance.amount -= this.credit;
          } else {
            account.balance.amount += this.credit;
          }
        }
        
        account.balance.lastUpdated = new Date();
        await account.save();
      }
    }
  } catch (error) {
    console.error('Error updating account balance:', error);
  }
});

module.exports = mongoose.model('JournalLine', JournalLineSchema);
