// routes/reports.js
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const reportingService = require('../services/reportingService');

// @route   GET api/reports/income-statement
// @desc    Generate income statement report
// @access  Private
router.get('/income-statement', auth, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      compareWithPreviousPeriod,
      includeStabulumAmounts,
      showPercentages,
      groupBy,
      filterTags
    } = req.query;
    
    // Validate required dates
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Start date and end date are required' 
      });
    }
    
    // Parse options
    const options = {
      compareWithPreviousPeriod: compareWithPreviousPeriod === 'true',
      includeStabulumAmounts: includeStabulumAmounts === 'true',
      showPercentages: showPercentages !== 'false', // Default to true
      groupBy: ['type', 'subtype', 'account'].includes(groupBy) ? groupBy : 'type',
      filterTags: filterTags ? filterTags.split(',') : []
    };
    
    const report = await reportingService.generateIncomeStatement(
      req.user.organization,
      new Date(startDate),
      new Date(endDate),
      options
    );
    
    res.json(report);
  } catch (err) {
    console.error('Error generating income statement:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// @route   GET api/reports/balance-sheet
// @desc    Generate balance sheet report
// @access  Private
router.get('/balance-sheet', auth, async (req, res) => {
  try {
    const { 
      asOfDate, 
      compareWithPreviousYear,
      includeStabulumAmounts,
      groupBy
    } = req.query;
    
    // Validate required date
    if (!asOfDate) {
      return res.status(400).json({ 
        message: 'As of date is required' 
      });
    }
    
    // Parse options
    const options = {
      compareWithPreviousYear: compareWithPreviousYear === 'true',
      includeStabulumAmounts: includeStabulumAmounts === 'true',
      groupBy: ['type', 'subtype', 'account'].includes(groupBy) ? groupBy : 'type'
    };
    
    const report = await reportingService.generateBalanceSheet(
      req.user.organization,
      new Date(asOfDate),
      options
    );
    
    res.json(report);
  } catch (err) {
    console.error('Error generating balance sheet:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// @route   GET api/reports/cash-flow
// @desc    Generate cash flow statement report
// @access  Private
router.get('/cash-flow', auth, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      compareWithPreviousPeriod,
      includeStabulumFlow,
      cashAccountIds,
      cashEquivalentAccountIds
    } = req.query;
    
    // Validate required dates
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Start date and end date are required' 
      });
    }
    
    // Parse options
    const options = {
      compareWithPreviousPeriod: compareWithPreviousPeriod === 'true',
      includeStabulumFlow: includeStabulumFlow !== 'false', // Default to true
      cashAccountIds: cashAccountIds ? cashAccountIds.split(',') : [],
      cashEquivalentAccountIds: cashEquivalentAccountIds ? cashEquivalentAccountIds.split(',') : []
    };
    
    const report = await reportingService.generateCashFlowStatement(
      req.user.organization,
      new Date(startDate),
      new Date(endDate),
      options
    );
    
    res.json(report);
  } catch (err) {
    console.error('Error generating cash flow statement:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// @route   GET api/reports/trial-balance
// @desc    Generate trial balance report
// @access  Private
router.get('/trial-balance', auth, async (req, res) => {
  try {
    const { 
      asOfDate, 
      includeZeroBalances,
      groupBy,
      includeStabulumAmounts
    } = req.query;
    
    // Validate required date
    if (!asOfDate) {
      return res.status(400).json({ 
        message: 'As of date is required' 
      });
    }
    
    // Parse options
    const options = {
      includeZeroBalances: includeZeroBalances === 'true',
      groupBy: ['none', 'type', 'subtype'].includes(groupBy) ? groupBy : 'none',
      includeStabulumAmounts: includeStabulumAmounts === 'true'
    };
    
    const report = await reportingService.generateTrialBalance(
      req.user.organization,
      new Date(asOfDate),
      options
    );
    
    res.json(report);
  } catch (err) {
    console.error('Error generating trial balance:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// @route   GET api/reports/stabulum-transactions
// @desc    Generate Stabulum transaction report
// @access  Private
router.get('/stabulum-transactions', auth, async (req, res) => {
  try {
    const { startDate, endDate, transactionType, status } = req.query;
    
    // Validate required dates
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Start date and end date are required' 
      });
    }
    
    // Build query
    const query = {
      organizationId: req.user.organization,
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };
    
    if (transactionType) {
      query.transactionType = transactionType;
    }
    
    if (status) {
      query.status = status;
    }
    
    // Get transactions
    const StabulumTransaction = require('../models/StabulumTransaction');
    const transactions = await StabulumTransaction.find(query)
      .sort({ timestamp: -1 });
    
    // Calculate totals
    const totalsByType = {};
    let overallTotal = 0;
    
    transactions.forEach(tx => {
      if (!totalsByType[tx.transactionType]) {
        totalsByType[tx.transactionType] = 0;
      }
      
      totalsByType[tx.transactionType] += tx.amount;
      overallTotal += tx.transactionType === 'receipt' ? tx.amount : -tx.amount;
    });
    
    // Get wallets for reference
    const StabulumWallet = require('../models/StabulumWallet');
    const wallets = await StabulumWallet.find({
      organizationId: req.user.organization
    });
    
    const walletMap = {};
    wallets.forEach(wallet => {
      walletMap[wallet.address] = wallet.name;
    });
    
    // Enrich transactions with wallet names
    const enrichedTransactions = transactions.map(tx => {
      const data = tx.toObject();
      data.fromWalletName = walletMap[tx.fromAddress] || null;
      data.toWalletName = walletMap[tx.toAddress] || null;
      return data;
    });
    
    // Structure response
    const organization = await require('../models/Organization').findById(req.user.organization);
    
    const report = {
      title: 'Stabulum Transactions Report',
      subtitle: `For the period ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
      organizationName: organization.name,
      dateGenerated: new Date(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      transactions: enrichedTransactions,
      totalsByType,
      overallTotal,
      transactionCount: transactions.length
    };
    
    res.json(report);
  } catch (err) {
    console.error('Error generating Stabulum transactions report:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// @route   GET api/reports/general-ledger
// @desc    Generate general ledger report
// @access  Private
router.get('/general-ledger', auth, async (req, res) => {
  try {
    const { startDate, endDate, accountId } = req.query;
    
    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Start date and end date are required' 
      });
    }
    
    // Build journal entry query
    const entryQuery = {
      organizationId: req.user.organization,
      status: 'posted',
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };
    
    // Get journal entries
    const JournalEntry = require('../models/JournalEntry');
    const entries = await JournalEntry.find(entryQuery)
      .sort({ date: 1, entryNumber: 1 })
      .populate('journalId', 'name type');
    
    const entryIds = entries.map(entry => entry._id);
    
    // Build line query
    const lineQuery = {
      journalEntryId: { $in: entryIds }
    };
    
    if (accountId) {
      lineQuery.accountId = accountId;
    }
    
    // Get journal lines
    const JournalLine = require('../models/JournalLine');
    const lines = await JournalLine.find(lineQuery)
      .populate('accountId', 'accountNumber name type')
      .populate('journalEntryId', 'entryNumber date description reference');
    
    // Group lines by account
    const accountGroups = {};
    const ChartOfAccounts = require('../models/ChartOfAccounts');
    
    for (const line of lines) {
      if (!line.accountId || !line.journalEntryId) continue;
      
      const accountId = line.accountId._id.toString();
      
      if (!accountGroups[accountId]) {
        // Get beginning balance for this account as of startDate
        const beginningBalance = await this._calculateAccountBalance(
          req.user.organization,
          accountId,
          new Date(startDate)
        );
        
        accountGroups[accountId] = {
          accountId,
          accountNumber: line.accountId.accountNumber,
          accountName: line.accountId.name,
          accountType: line.accountId.type,
          beginningBalance,
          endingBalance: beginningBalance,
          entries: []
        };
      }
      
      // Add entry details
      accountGroups[accountId].entries.push({
        date: line.journalEntryId.date,
        entryNumber: line.journalEntryId.entryNumber,
        description: line.journalEntryId.description,
        reference: line.journalEntryId.reference,
        lineDescription: line.description,
        debit: line.debit,
        credit: line.credit,
        runningBalance: 0 // Will calculate below
      });
      
      // Update ending balance
      if (['asset', 'expense'].includes(line.accountId.type)) {
        // Debit increases, credit decreases
        accountGroups[accountId].endingBalance += line.debit - line.credit;
      } else {
        // Credit increases, debit decreases
        accountGroups[accountId].endingBalance += line.credit - line.debit;
      }
    }
    
    // Calculate running balances and sort entries by date
    for (const accountId in accountGroups) {
      const account = accountGroups[accountId];
      
      // Sort entries by date
      account.entries.sort((a, b) => 
        new Date(a.date) - new Date(b.date) || 
        a.entryNumber.localeCompare(b.entryNumber)
      );
      
      // Calculate running balances
      let runningBalance = account.beginningBalance;
      
      account.entries.forEach(entry => {
        if (['asset', 'expense'].includes(account.accountType)) {
          // Debit increases, credit decreases
          runningBalance += entry.debit - entry.credit;
        } else {
          // Credit increases, debit decreases
          runningBalance += entry.credit - entry.debit;
        }
        
        entry.runningBalance = runningBalance;
      });
    }
    
    // Convert to array and sort by account number
    const accounts = Object.values(accountGroups).sort((a, b) => 
      a.accountNumber.localeCompare(b.accountNumber)
    );
    
    // Structure response
    const organization = await require('../models/Organization').findById(req.user.organization);
    
    const report = {
      title: 'General Ledger',
      subtitle: `For the period ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
      organizationName: organization.name,
      dateGenerated: new Date(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      accounts
    };
    
    res.json(report);
  } catch (err) {
    console.error('Error generating general ledger report:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Helper function to calculate account balance as of a specific date
async function _calculateAccountBalance(organizationId, accountId, asOfDate) {
  // Get all posted journal entries up to the specified date
  const JournalEntry = require('../models/JournalEntry');
  const entries = await JournalEntry.find({
    organizationId,
    status: 'posted',
    date: { $lt: asOfDate }
  });
  
  const entryIds = entries.map(e => e._id);
  
  // Get journal lines for this account
  const JournalLine = require('../models/JournalLine');
  const lines = await JournalLine.find({
    journalEntryId: { $in: entryIds },
    accountId
  }).populate('accountId', 'type');
  
  if (lines.length === 0) return 0;
  
  // Calculate balance based on account type
  let balance = 0;
  const accountType = lines[0].accountId.type;
  
  lines.forEach(line => {
    if (['asset', 'expense'].includes(accountType)) {
      // Debit increases, credit decreases
      balance += line.debit - line.credit;
    } else {
      // Credit increases, debit decreases
      balance += line.credit - line.debit;
    }
  });
  
  return balance;
}

module.exports = router;
