// models/Invoice.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const InvoiceSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  invoiceNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  dueDate: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'void'],
    default: 'draft',
    index: true
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  balance: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    trim: true
  },
  terms: {
    type: String,
    trim: true
  },
  notes: {
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
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  journalEntryId: {
    type: Schema.Types.ObjectId,
    ref: 'JournalEntry',
    index: true
  },
  stabulumPaymentEnabled: {
    type: Boolean,
    default: false
  },
  stabulumPaymentAddress: {
    type: String,
    trim: true
  },
  stabulumPaymentAmount: {
    type: Number,
    default: 0
  },
  stabulumPaymentStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', null],
    default: null
  },
  stabulumTransactionHash: {
    type: String,
    trim: true,
    index: true
  },
  attachments: [{
    fileName: String,
    fileType: String,
    fileSize: Number,
    filePath: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  currency: {
    type: String,
    default: 'USD',
    trim: true
  },
  exchangeRate: {
    type: Number,
    default: 1
  },
  discountType: {
    type: String,
    enum: ['percentage', 'amount', null],
    default: null
  },
  discountValue: {
    type: Number,
    default: 0
  },
  discountTotal: {
    type: Number,
    default: 0
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  recurringScheduleId: {
    type: Schema.Types.ObjectId,
    ref: 'RecurringSchedule',
    index: true
  },
  isRecurring: {
    type: Boolean,
    default: false
  }
});

// Compound indices
InvoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ customerId: 1, date: 1 });
InvoiceSchema.index({ status: 1, dueDate: 1 });

// Pre-save middleware
InvoiceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Update status based on balance and due date
  if (this.isModified('balance') || this.isModified('dueDate')) {
    if (this.balance === 0 && this.status !== 'void') {
      this.status = 'paid';
    } else if (this.balance > 0 && this.balance < this.total && this.status !== 'void') {
      this.status = 'partial';
    } else if (this.balance === this.total && 
              this.dueDate < new Date() && 
              ['draft', 'sent'].includes(this.status)) {
      this.status = 'overdue';
    }
  }
  
  next();
});

// Static method to generate next invoice number
InvoiceSchema.statics.generateInvoiceNumber = async function(organizationId) {
  const organization = await mongoose.model('Organization').findById(organizationId);
  
  if (!organization) {
    throw new Error('Organization not found');
  }
  
  const prefix = organization.settings?.invoicePrefix || 'INV';
  const year = new Date().getFullYear().toString().substr(2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  
  const lastInvoice = await this.findOne(
    { organizationId },
    {},
    { sort: { createdAt: -1 } }
  );
  
  let sequence = 1;
  
  if (lastInvoice && lastInvoice.invoiceNumber) {
    // Try to extract sequence from last invoice number
    const matches = lastInvoice.invoiceNumber.match(/\d+$/);
    
    if (matches) {
      sequence = parseInt(matches[0]) + 1;
    }
  }
  
  return `${prefix}-${year}${month}-${sequence.toString().padStart(5, '0')}`;
};

// Instance method to record payment
InvoiceSchema.methods.recordPayment = async function(amount, paymentDate, paymentMethod, reference, stabulumTransaction = null) {
  if (amount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }
  
  if (amount > this.balance) {
    throw new Error('Payment amount cannot exceed the invoice balance');
  }
  
  // Create payment record
  const Payment = mongoose.model('Payment');
  const payment = new Payment({
    organizationId: this.organizationId,
    invoiceId: this._id,
    customerId: this.customerId,
    amount,
    date: paymentDate || new Date(),
    method: paymentMethod,
    reference,
    stabulumTransactionHash: stabulumTransaction ? stabulumTransaction.transactionHash : null
  });
  
  await payment.save();
  
  // Update invoice balance
  this.balance -= amount;
  
  // Update status based on new balance
  if (this.balance === 0) {
    this.status = 'paid';
  } else if (this.balance < this.total) {
    this.status = 'partial';
  }
  
  // If Stabulum transaction provided, update Stabulum payment status
  if (stabulumTransaction) {
    this.stabulumPaymentStatus = 'confirmed';
    this.stabulumTransactionHash = stabulumTransaction.transactionHash;
  }
  
  await this.save();
  
  return payment;
};

// Instance method to void an invoice
InvoiceSchema.methods.voidInvoice = async function(reason, userId) {
  if (this.status === 'void') {
    throw new Error('Invoice is already void');
  }
  
  // Check if there are payments
  const Payment = mongoose.model('Payment');
  const payments = await Payment.find({ invoiceId: this._id });
  
  if (payments.length > 0) {
    throw new Error('Cannot void an invoice with payments. Refund payments first.');
  }
  
  // Void associated journal entry if it exists
  if (this.journalEntryId) {
    const JournalEntry = mongoose.model('JournalEntry');
    const journalEntry = await JournalEntry.findById(this.journalEntryId);
    
    if (journalEntry && journalEntry.status === 'posted') {
      await journalEntry.voidEntry(userId, `Invoice ${this.invoiceNumber} voided: ${reason}`);
    }
  }
  
  // Update invoice status
  this.status = 'void';
  this.notes = this.notes 
    ? `${this.notes}\n\nVoided on ${new Date().toISOString()}: ${reason}`
    : `Voided on ${new Date().toISOString()}: ${reason}`;
  
  // Create audit trail
  const AuditTrail = mongoose.model('AuditTrail');
  const auditTrail = new AuditTrail({
    organizationId: this.organizationId,
    userId,
    action: 'void',
    entityType: 'invoice',
    entityId: this._id,
    timestamp: new Date(),
    notes: reason
  });
  
  await auditTrail.save();
  
  return this.save();
};

// Model for invoice items
const InvoiceItemSchema = new Schema({
  invoiceId: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  taxRate: {
    type: Number,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  accountId: {
    type: Schema.Types.ObjectId,
    ref: 'ChartOfAccounts',
    required: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },
  discountType: {
    type: String,
    enum: ['percentage', 'amount', null],
    default: null
  },
  discountValue: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  }
});

InvoiceItemSchema.pre('save', function(next) {
  // Calculate amount and tax amount before saving
  this.amount = this.quantity * this.unitPrice;
  
  // Apply discount if applicable
  if (this.discountType === 'percentage' && this.discountValue > 0) {
    this.discountAmount = this.amount * (this.discountValue / 100);
    this.amount -= this.discountAmount;
  } else if (this.discountType === 'amount' && this.discountValue > 0) {
    this.discountAmount = Math.min(this.discountValue, this.amount);
    this.amount -= this.discountAmount;
  }
  
  // Calculate tax amount
  if (this.taxRate > 0) {
    this.taxAmount = this.amount * (this.taxRate / 100);
  }
  
  next();
});

// Model for payments
const PaymentSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  invoiceId: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  method: {
    type: String,
    enum: ['cash', 'check', 'credit-card', 'bank-transfer', 'stabulum', 'other'],
    required: true
  },
  reference: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  journalEntryId: {
    type: Schema.Types.ObjectId,
    ref: 'JournalEntry',
    index: true
  },
  stabulumTransactionHash: {
    type: String,
    trim: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  isVoid: {
    type: Boolean,
    default: false
  }
});

const Invoice = mongoose.model('Invoice', InvoiceSchema);
const InvoiceItem = mongoose.model('InvoiceItem', InvoiceItemSchema);
const Payment = mongoose.model('Payment', PaymentSchema);

module.exports = {
  Invoice,
  InvoiceItem,
  Payment
};
