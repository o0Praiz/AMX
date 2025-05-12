// models/Organization.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrganizationSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  industry: {
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
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  taxId: {
    type: String,
    trim: true
  },
  fiscalYearStart: {
    type: Date,
    default: () => {
      const currentYear = new Date().getFullYear();
      return new Date(currentYear, 0, 1); // January 1st of current year
    }
  },
  timezone: {
    type: String,
    default: 'UTC',
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
  settings: {
    currency: {
      type: String,
      default: 'USD',
      trim: true
    },
    dateFormat: {
      type: String,
      default: 'MM/DD/YYYY',
      trim: true
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '12h'
    },
    invoicePrefix: {
      type: String,
      default: 'INV',
      trim: true
    },
    billPrefix: {
      type: String,
      default: 'BILL',
      trim: true
    },
    customerPrefix: {
      type: String,
      default: 'CUS',
      trim: true
    },
    vendorPrefix: {
      type: String,
      default: 'VEN',
      trim: true
    },
    language: {
      type: String,
      default: 'en-US',
      trim: true
    },
    fiscalYearEnd: {
      type: Number, // Month number (0-11, where 0 is January)
      default: 11 // December
    },
    taxRate: {
      type: Number,
      default: 0
    },
    taxName: {
      type: String,
      default: 'Sales Tax',
      trim: true
    },
    invoiceTerms: {
      type: String,
      default: 'net30',
      trim: true
    },
    invoiceFooter: {
      type: String,
      trim: true
    },
    invoiceDueDays: {
      type: Number,
      default: 30
    },
    defaultStabulumWalletId: {
      type: Schema.Types.ObjectId,
      ref: 'StabulumWallet'
    },
    enableStabulumPayments: {
      type: Boolean,
      default: false
    },
    logo: {
      data: Buffer,
      contentType: String,
      filename: String
    },
    theme: {
      primaryColor: {
        type: String,
        default: '#3f51b5'
      },
      secondaryColor: {
        type: String,
        default: '#f50057'
      },
      fontFamily: {
        type: String,
        default: 'Roboto, sans-serif'
      }
    }
  },
  defaultAccounts: {
    assets: {
      cash: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      },
      accountsReceivable: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      },
      inventory: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      },
      stabulumAssets: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      }
    },
    liabilities: {
      accountsPayable: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      },
      taxPayable: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      }
    },
    equity: {
      retainedEarnings: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      }
    },
    revenue: {
      salesRevenue: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      },
      stabulumRevenue: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      }
    },
    expenses: {
      generalExpense: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      },
      stabulumExpense: {
        type: Schema.Types.ObjectId,
        ref: 'ChartOfAccounts'
      }
    }
  },
  integrations: {
    stabulum: {
      enabled: {
        type: Boolean,
        default: false
      },
      contractAddress: {
        type: String,
        trim: true
      },
      apiKey: {
        type: String,
        trim: true
      },
      apiUrl: {
        type: String,
        trim: true
      }
    },
    banking: {
      enabled: {
        type: Boolean,
        default: false
      },
      provider: {
        type: String,
        trim: true
      },
      credentials: {
        type: Map,
        of: String
      }
    },
    paymentProcessor: {
      enabled: {
        type: Boolean,
        default: false
      },
      provider: {
        type: String,
        trim: true
      },
      credentials: {
        type: Map,
        of: String
      }
    }
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  },
  stabulumWalletAddress: {
    type: String,
    trim: true
  },
  secretKey: {
    type: String,
    trim: true
  }
});

// Pre-save middleware
OrganizationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to check if fiscal year is calendar year
OrganizationSchema.methods.isCalendarFiscalYear = function() {
  const fiscalYearStart = new Date(this.fiscalYearStart);
  return fiscalYearStart.getMonth() === 0 && fiscalYearStart.getDate() === 1;
};

// Instance method to get current fiscal year start and end dates
OrganizationSchema.methods.getCurrentFiscalYear = function() {
  const today = new Date();
  const fiscalYearStart = new Date(this.fiscalYearStart);
  
  const currentFiscalYearStart = new Date(fiscalYearStart);
  if (fiscalYearStart.getMonth() > today.getMonth() || 
      (fiscalYearStart.getMonth() === today.getMonth() && 
       fiscalYearStart.getDate() > today.getDate())) {
    currentFiscalYearStart.setFullYear(today.getFullYear() - 1);
  } else {
    currentFiscalYearStart.setFullYear(today.getFullYear());
  }
  
  const currentFiscalYearEnd = new Date(currentFiscalYearStart);
  currentFiscalYearEnd.setFullYear(currentFiscalYearStart.getFullYear() + 1);
  currentFiscalYearEnd.setDate(currentFiscalYearEnd.getDate() - 1);
  
  return {
    start: currentFiscalYearStart,
    end: currentFiscalYearEnd
  };
};

// Static method to generate encryption key for Stabulum integration
OrganizationSchema.statics.generateSecretKey = function() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

// Virtuals
OrganizationSchema.virtual('fullAddress').get(function() {
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

// Instance method to initialize default chart of accounts
OrganizationSchema.methods.initializeChartOfAccounts = async function() {
  const ChartOfAccounts = mongoose.model('ChartOfAccounts');
  
  // Define the default chart of accounts structure
  const defaultAccounts = [
    // Asset accounts
    {
      accountNumber: '1000',
      name: 'Cash',
      type: 'asset',
      subtype: 'cash',
      description: 'Cash on hand',
      isReconcilable: true,
      isCashEquivalent: true
    },
    {
      accountNumber: '1100',
      name: 'Accounts Receivable',
      type: 'asset',
      subtype: 'accounts-receivable',
      description: 'Amounts owed by customers'
    },
    {
      accountNumber: '1200',
      name: 'Inventory',
      type: 'asset',
      subtype: 'inventory',
      description: 'Goods held for sale'
    },
    {
      accountNumber: '1300',
      name: 'Prepaid Expenses',
      type: 'asset',
      subtype: 'prepaid-expenses',
      description: 'Expenses paid in advance'
    },
    {
      accountNumber: '1400',
      name: 'Stabulum Holdings',
      type: 'asset',
      subtype: 'cryptocurrencies',
      description: 'Stabulum stablecoin holdings',
      stabulumLinked: true
    },
    {
      accountNumber: '1500',
      name: 'Fixed Assets',
      type: 'asset',
      subtype: 'fixed-assets',
      description: 'Long-term tangible assets'
    },
    
    // Liability accounts
    {
      accountNumber: '2000',
      name: 'Accounts Payable',
      type: 'liability',
      subtype: 'accounts-payable',
      description: 'Amounts owed to vendors'
    },
    {
      accountNumber: '2100',
      name: 'Sales Tax Payable',
      type: 'liability',
      subtype: 'tax-payable',
      description: 'Sales tax collected but not yet remitted'
    },
    {
      accountNumber: '2200',
      name: 'Accrued Expenses',
      type: 'liability',
      subtype: 'accrued-expenses',
      description: 'Expenses incurred but not yet paid'
    },
    {
      accountNumber: '2300',
      name: 'Unearned Revenue',
      type: 'liability',
      subtype: 'unearned-revenue',
      description: 'Payments received for goods/services not yet provided'
    },
    
    // Equity accounts
    {
      accountNumber: '3000',
      name: 'Owner\'s Equity',
      type: 'equity',
      subtype: 'owner-equity',
      description: 'Owner\'s investment in the business'
    },
    {
      accountNumber: '3100',
      name: 'Retained Earnings',
      type: 'equity',
      subtype: 'retained-earnings',
      description: 'Accumulated earnings less distributions'
    },
    
    // Revenue accounts
    {
      accountNumber: '4000',
      name: 'Sales Revenue',
      type: 'revenue',
      subtype: 'sales',
      description: 'Income from sales of goods/services'
    },
    {
      accountNumber: '4100',
      name: 'Stabulum Revenue',
      type: 'revenue',
      subtype: 'cryptocurrency',
      description: 'Income from Stabulum transactions'
    },
    {
      accountNumber: '4900',
      name: 'Other Revenue',
      type: 'revenue',
      subtype: 'other',
      description: 'Miscellaneous income'
    },
    
    // Expense accounts
    {
      accountNumber: '5000',
      name: 'Cost of Goods Sold',
      type: 'expense',
      subtype: 'cogs',
      description: 'Direct costs of products/services sold'
    },
    {
      accountNumber: '5100',
      name: 'Salaries and Wages',
      type: 'expense',
      subtype: 'payroll',
      description: 'Employee compensation'
    },
    {
      accountNumber: '5200',
      name: 'Rent Expense',
      type: 'expense',
      subtype: 'rent',
      description: 'Rent for business premises'
    },
    {
      accountNumber: '5300',
      name: 'Utilities Expense',
      type: 'expense',
      subtype: 'utilities',
      description: 'Electricity, water, internet, etc.'
    },
    {
      accountNumber: '5400',
      name: 'Office Supplies',
      type: 'expense',
      subtype: 'supplies',
      description: 'Consumable office supplies'
    },
    {
      accountNumber: '5500',
      name: 'Professional Services',
      type: 'expense',
      subtype: 'professional-services',
      description: 'Legal, accounting, consulting fees'
    },
    {
      accountNumber: '5600',
      name: 'Marketing and Advertising',
      type: 'expense',
      subtype: 'marketing',
      description: 'Promotional expenses'
    },
    {
      accountNumber: '5700',
      name: 'Transaction Fees',
      type: 'expense',
      subtype: 'transaction-fees',
      description: 'Bank and payment processing fees'
    },
    {
      accountNumber: '5800',
      name: 'Stabulum Transaction Fees',
      type: 'expense',
      subtype: 'cryptocurrency-fees',
      description: 'Fees for Stabulum transactions'
    },
    {
      accountNumber: '5900',
      name: 'Miscellaneous Expenses',
      type: 'expense',
      subtype: 'other',
      description: 'Expenses not classified elsewhere'
    }
  ];
  
  // Create accounts and track references for default account settings
  const defaultAccountRefs = {
    assets: {},
    liabilities: {},
    equity: {},
    revenue: {},
    expenses: {}
  };
  
  for (const accountData of defaultAccounts) {
    const account = new ChartOfAccounts({
      organizationId: this._id,
      ...accountData
    });
    
    await account.save();
    
    // Store references for default accounts
    if (accountData.accountNumber === '1000') {
      defaultAccountRefs.assets.cash = account._id;
    } else if (accountData.accountNumber === '1100') {
      defaultAccountRefs.assets.accountsReceivable = account._id;
    } else if (accountData.accountNumber === '1200') {
      defaultAccountRefs.assets.inventory = account._id;
    } else if (accountData.accountNumber === '1400') {
      defaultAccountRefs.assets.stabulumAssets = account._id;
    } else if (accountData.accountNumber === '2000') {
      defaultAccountRefs.liabilities.accountsPayable = account._id;
    } else if (accountData.accountNumber === '2100') {
      defaultAccountRefs.liabilities.taxPayable = account._id;
    } else if (accountData.accountNumber === '3100') {
      defaultAccountRefs.equity.retainedEarnings = account._id;
    } else if (accountData.accountNumber === '4000') {
      defaultAccountRefs.revenue.salesRevenue = account._id;
    } else if (accountData.accountNumber === '4100') {
      defaultAccountRefs.revenue.stabulumRevenue = account._id;
    } else if (accountData.accountNumber === '5900') {
      defaultAccountRefs.expenses.generalExpense = account._id;
    } else if (accountData.accountNumber === '5800') {
      defaultAccountRefs.expenses.stabulumExpense = account._id;
    }
  }
  
  // Update organization with default account references
  this.defaultAccounts = defaultAccountRefs;
  await this.save();
  
  return defaultAccounts.length;
};

// Instance method to initialize journals
OrganizationSchema.methods.initializeJournals = async function() {
  const Journal = mongoose.model('Journal');
  
  // Define default journals
  const defaultJournals = [
    {
      name: 'General Journal',
      description: 'For general transactions that don\'t fit in other journals',
      type: 'general'
    },
    {
      name: 'Sales Journal',
      description: 'For recording customer invoices and sales',
      type: 'sales'
    },
    {
      name: 'Purchases Journal',
      description: 'For recording vendor bills and purchases',
      type: 'purchases'
    },
    {
      name: 'Cash Receipts Journal',
      description: 'For recording money received',
      type: 'cash-receipts'
    },
    {
      name: 'Cash Disbursements Journal',
      description: 'For recording money paid out',
      type: 'cash-disbursements'
    }
  ];
  
  for (const journalData of defaultJournals) {
    const journal = new Journal({
      organizationId: this._id,
      ...journalData
    });
    
    await journal.save();
  }
  
  return defaultJournals.length;
};

module.exports = mongoose.model('Organization', OrganizationSchema);
