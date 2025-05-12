# Accounting Max - Database Schema Design

## Overview
This document outlines the database schema for the Accounting Max system. The database is designed to support double-entry accounting with blockchain integration through the Stabulum stablecoin.

## Collections

### Users
```javascript
{
  _id: ObjectId,
  email: String,
  passwordHash: String,
  salt: String,
  firstName: String,
  lastName: String,
  role: String, // admin, accountant, viewer
  organization: ObjectId, // reference to Organizations
  createdAt: Date,
  updatedAt: Date,
  lastLogin: Date,
  isActive: Boolean,
  twoFactorEnabled: Boolean,
  twoFactorSecret: String
}
```

### Organizations
```javascript
{
  _id: ObjectId,
  name: String,
  industry: String,
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  taxId: String,
  fiscalYearStart: Date,
  timezone: String,
  createdAt: Date,
  updatedAt: Date,
  settings: {
    currency: String,
    dateFormat: String,
    timeFormat: String
  },
  stabulumWalletAddress: String, // Integration with Stabulum stablecoin
  stabulumPublicKey: String
}
```

### ChartOfAccounts
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  accountNumber: String,
  name: String,
  type: String, // asset, liability, equity, revenue, expense
  subtype: String, // cash, accounts receivable, etc.
  description: String,
  isActive: Boolean,
  parentAccount: ObjectId, // for hierarchical account structure
  createdAt: Date,
  updatedAt: Date,
  balance: {
    amount: Number,
    lastUpdated: Date
  },
  stabulumLinked: Boolean, // whether this account is linked to Stabulum
  stabulumAddress: String // if applicable
}
```

### Journals
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  name: String,
  description: String,
  type: String, // general, sales, purchases, cash receipts, cash disbursements
  createdAt: Date,
  updatedAt: Date,
  isActive: Boolean
}
```

### JournalEntries
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  journalId: ObjectId,
  entryNumber: String,
  date: Date,
  description: String,
  reference: String, // invoice number, etc.
  status: String, // draft, posted, reconciled
  createdBy: ObjectId, // reference to Users
  createdAt: Date,
  updatedAt: Date,
  postingDate: Date,
  hasAttachments: Boolean,
  stabulumTransactionHash: String, // blockchain reference if posted to Stabulum
  stabulumTransactionBlockHeight: Number,
  stabulumTransactionConfirmations: Number
}
```

### JournalLines
```javascript
{
  _id: ObjectId,
  journalEntryId: ObjectId,
  lineNumber: Number,
  accountId: ObjectId, // reference to ChartOfAccounts
  description: String,
  debit: Number,
  credit: Number,
  stabulumAmount: Number, // amount in Stabulum tokens
  stabulumConfirmed: Boolean
}
```

### FiscalPeriods
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  name: String,
  startDate: Date,
  endDate: Date,
  status: String, // open, closed, adjusting
  createdAt: Date,
  updatedAt: Date
}
```

### Customers
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  customerNumber: String,
  name: String,
  contactName: String,
  email: String,
  phone: String,
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  taxId: String,
  createdAt: Date,
  updatedAt: Date,
  creditLimit: Number,
  terms: String, // net30, etc.
  stabulumWalletAddress: String // if they accept Stabulum payments
}
```

### Vendors
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  vendorNumber: String,
  name: String,
  contactName: String,
  email: String,
  phone: String,
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  taxId: String,
  createdAt: Date,
  updatedAt: Date,
  paymentTerms: String,
  stabulumWalletAddress: String // if they accept Stabulum payments
}
```

### Invoices
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  invoiceNumber: String,
  customerId: ObjectId,
  date: Date,
  dueDate: Date,
  status: String, // draft, sent, partial, paid, overdue, void
  total: Number,
  balance: Number,
  description: String,
  terms: String,
  notes: String,
  createdAt: Date,
  updatedAt: Date,
  journalEntryId: ObjectId, // reference to JournalEntries when posted
  stabulumPaymentEnabled: Boolean,
  stabulumPaymentAddress: String,
  stabulumPaymentAmount: Number,
  stabulumPaymentStatus: String, // pending, confirmed, failed
  stabulumTransactionHash: String
}
```

### InvoiceItems
```javascript
{
  _id: ObjectId,
  invoiceId: ObjectId,
  description: String,
  quantity: Number,
  unitPrice: Number,
  amount: Number,
  taxRate: Number,
  taxAmount: Number,
  accountId: ObjectId // revenue account
}
```

### Bills
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  billNumber: String,
  vendorId: ObjectId,
  date: Date,
  dueDate: Date,
  status: String, // draft, received, partial, paid, overdue, void
  total: Number,
  balance: Number,
  description: String,
  createdAt: Date,
  updatedAt: Date,
  journalEntryId: ObjectId, // reference to JournalEntries when posted
  stabulumPaymentEnabled: Boolean,
  stabulumPaymentAddress: String,
  stabulumPaymentAmount: Number,
  stabulumPaymentStatus: String // pending, sent, confirmed, failed
}
```

### BillItems
```javascript
{
  _id: ObjectId,
  billId: ObjectId,
  description: String,
  quantity: Number,
  unitPrice: Number,
  amount: Number,
  taxRate: Number,
  taxAmount: Number,
  accountId: ObjectId // expense account
}
```

### StabulumTransactions
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  transactionHash: String,
  blockHeight: Number,
  timestamp: Date,
  fromAddress: String,
  toAddress: String,
  amount: Number,
  status: String, // pending, confirmed, failed
  confirmations: Number,
  journalEntryId: ObjectId, // reference to associated journal entry if any
  transactionType: String, // payment, receipt, internal, fee
  relatedDocumentType: String, // invoice, bill, etc.
  relatedDocumentId: ObjectId,
  createdAt: Date,
  updatedAt: Date,
  fee: Number,
  notes: String
}
```

### StabulumWallets
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  name: String,
  address: String,
  publicKey: String,
  encryptedPrivateKey: String, // encrypted with user's key
  balance: Number,
  lastSynced: Date,
  isDefault: Boolean,
  purpose: String, // operating, payroll, tax, etc.
  createdAt: Date,
  updatedAt: Date
}
```

### AuditTrail
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,
  userId: ObjectId,
  action: String, // create, update, delete, view, post, void
  entityType: String, // journal entry, invoice, etc.
  entityId: ObjectId,
  timestamp: Date,
  ipAddress: String,
  changes: [
    {
      field: String,
      oldValue: String,
      newValue: String
    }
  ],
  stabulumTransactionHash: String // if applicable
}
```

## Indexes
- Users: email (unique), organization
- Organizations: name, stabulumWalletAddress
- ChartOfAccounts: organizationId + accountNumber (unique), type, parentAccount
- JournalEntries: organizationId, journalId, date, status, stabulumTransactionHash
- JournalLines: journalEntryId, accountId
- Invoices: organizationId + invoiceNumber (unique), customerId, status, dueDate
- Bills: organizationId + billNumber (unique), vendorId, status, dueDate
- StabulumTransactions: transactionHash (unique), organizationId, fromAddress, toAddress, status

## Relationships
- Users belong to Organizations
- Organizations have many ChartOfAccounts, Journals, FiscalPeriods, Customers, Vendors
- Journals have many JournalEntries
- JournalEntries have many JournalLines
- JournalLines reference ChartOfAccounts
- Invoices belong to Customers and have many InvoiceItems
- Bills belong to Vendors and have many BillItems
- StabulumTransactions may reference JournalEntries

## Stabulum Integration
The database schema includes fields for Stabulum stablecoin integration:
- Wallet addresses for organizations, customers, and vendors
- Transaction hashes and blockchain references
- Balance tracking in both standard currency and Stabulum tokens
- Status tracking for blockchain confirmations

This schema provides the foundation for a robust accounting system with blockchain integration.
