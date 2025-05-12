// services/reportingService.js
const mongoose = require('mongoose');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const JournalEntry = require('../models/JournalEntry');
const JournalLine = require('../models/JournalLine');
const Organization = require('../models/Organization');
const FiscalPeriod = require('../models/FiscalPeriod');
const StabulumTransaction = require('../models/StabulumTransaction');

class ReportingService {
  /**
   * Generate income statement (profit & loss) report
   * @param {string} organizationId - Organization ID
   * @param {Date} startDate - Start date for report
   * @param {Date} endDate - End date for report
   * @param {Object} options - Additional options for report generation
   * @returns {Object} - Income statement report data
   */
  async generateIncomeStatement(organizationId, startDate, endDate, options = {}) {
    try {
      const {
        compareWithPreviousPeriod = false,
        includeStabulumAmounts = false,
        showPercentages = true,
        groupBy = 'type', // 'type', 'subtype', or 'account'
        filterTags = []
      } = options;
      
      // Validate input
      if (!mongoose.Types.ObjectId.isValid(organizationId)) {
        throw new Error('Invalid organization ID');
      }
      
      if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
        throw new Error('Start date and end date must be valid dates');
      }
      
      if (startDate > endDate) {
        throw new Error('Start date must be before end date');
      }
      
      // Get organization settings for currency formatting
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }
      
      // Calculate previous period dates if comparing
      let prevStartDate, prevEndDate;
      if (compareWithPreviousPeriod) {
        const periodDuration = endDate - startDate;
        prevEndDate = new Date(startDate);
        prevStartDate = new Date(prevEndDate - periodDuration);
      }
      
      // Query accounts
      const revenueAccounts = await ChartOfAccounts.find({
        organizationId,
        type: 'revenue',
        isActive: true
      }).sort({ accountNumber: 1 });
      
      const expenseAccounts = await ChartOfAccounts.find({
        organizationId,
        type: 'expense',
        isActive: true
      }).sort({ accountNumber: 1 });
      
      // Build query for journal entries
      const entryQuery = {
        organizationId,
        status: 'posted',
        date: { 
          $gte: startDate, 
          $lte: endDate 
        }
      };
      
      // Add tag filtering if specified
      if (filterTags && filterTags.length > 0) {
        entryQuery.tags = { $in: filterTags };
      }
      
      // Get all relevant journal entries
      const journalEntries = await JournalEntry.find(entryQuery);
      const entryIds = journalEntries.map(entry => entry._id);
      
      // Get all journal lines for these entries
      const journalLines = await JournalLine.find({
        journalEntryId: { $in: entryIds }
      }).populate('accountId', 'accountNumber name type subtype');
      
      // Query for previous period if comparing
      let prevJournalLines = [];
      if (compareWithPreviousPeriod) {
        const prevEntryQuery = {
          organizationId,
          status: 'posted',
          date: { 
            $gte: prevStartDate, 
            $lte: prevEndDate 
          }
        };
        
        if (filterTags && filterTags.length > 0) {
          prevEntryQuery.tags = { $in: filterTags };
        }
        
        const prevJournalEntries = await JournalEntry.find(prevEntryQuery);
        const prevEntryIds = prevJournalEntries.map(entry => entry._id);
        
        prevJournalLines = await JournalLine.find({
          journalEntryId: { $in: prevEntryIds }
        }).populate('accountId', 'accountNumber name type subtype');
      }
      
      // Process revenue
      const revenueData = this._processAccountsForReport(
        revenueAccounts,
        journalLines,
        prevJournalLines,
        groupBy,
        includeStabulumAmounts
      );
      
      // Process expenses
      const expenseData = this._processAccountsForReport(
        expenseAccounts,
        journalLines,
        prevJournalLines,
        groupBy,
        includeStabulumAmounts
      );
      
      // Calculate totals
      const totalRevenue = revenueData.totalAmount;
      const totalExpenses = expenseData.totalAmount;
      const netIncome = totalRevenue - totalExpenses;
      
      let prevTotalRevenue = 0;
      let prevTotalExpenses = 0;
      let prevNetIncome = 0;
      
      if (compareWithPreviousPeriod) {
        prevTotalRevenue = revenueData.prevTotalAmount;
        prevTotalExpenses = expenseData.prevTotalAmount;
        prevNetIncome = prevTotalRevenue - prevTotalExpenses;
      }
      
      // Calculate percentages if requested
      if (showPercentages) {
        // Add percentage of revenue to each expense item
        expenseData.items.forEach(item => {
          item.percentOfRevenue = totalRevenue !== 0 
            ? (Math.abs(item.amount) / totalRevenue) * 100 
            : 0;
            
          if (compareWithPreviousPeriod && prevTotalRevenue !== 0) {
            item.prevPercentOfRevenue = prevTotalRevenue !== 0
              ? (Math.abs(item.prevAmount || 0) / prevTotalRevenue) * 100
              : 0;
          }
        });
        
        // Add percentage of revenue to expense total
        expenseData.percentOfRevenue = totalRevenue !== 0
          ? (Math.abs(totalExpenses) / totalRevenue) * 100
          : 0;
          
        if (compareWithPreviousPeriod && prevTotalRevenue !== 0) {
          expenseData.prevPercentOfRevenue = prevTotalRevenue !== 0
            ? (Math.abs(prevTotalExpenses) / prevTotalRevenue) * 100
            : 0;
        }
        
        // Net income as percentage of revenue
        const netIncomePercentage = totalRevenue !== 0
          ? (netIncome / totalRevenue) * 100
          : 0;
          
        let prevNetIncomePercentage = 0;
        if (compareWithPreviousPeriod && prevTotalRevenue !== 0) {
          prevNetIncomePercentage = prevTotalRevenue !== 0
            ? (prevNetIncome / prevTotalRevenue) * 100
            : 0;
        }
      }
      
      // Build report response
      const report = {
        title: 'Income Statement',
        subtitle: `For the period ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
        organizationName: organization.name,
        currency: organization.settings.currency || 'USD',
        dateGenerated: new Date(),
        startDate,
        endDate,
        revenue: {
          items: revenueData.items,
          total: totalRevenue,
          prevTotal: compareWithPreviousPeriod ? prevTotalRevenue : undefined
        },
        expenses: {
          items: expenseData.items,
          total: totalExpenses,
          percentOfRevenue: showPercentages ? expenseData.percentOfRevenue : undefined,
          prevTotal: compareWithPreviousPeriod ? prevTotalExpenses : undefined,
          prevPercentOfRevenue: showPercentages && compareWithPreviousPeriod ? expenseData.prevPercentOfRevenue : undefined
        },
        netIncome: {
          amount: netIncome,
          percentOfRevenue: showPercentages ? (totalRevenue !== 0 ? (netIncome / totalRevenue) * 100 : 0) : undefined,
          prevAmount: compareWithPreviousPeriod ? prevNetIncome : undefined,
          prevPercentOfRevenue: showPercentages && compareWithPreviousPeriod 
            ? (prevTotalRevenue !== 0 ? (prevNetIncome / prevTotalRevenue) * 100 : 0) 
            : undefined
        }
      };
      
      return report;
    } catch (error) {
      console.error('Error generating income statement:', error);
      throw error;
    }
  }
  
  /**
   * Generate balance sheet report
   * @param {string} organizationId - Organization ID
   * @param {Date} asOfDate - Date for balance sheet
   * @param {Object} options - Additional options for report generation
   * @returns {Object} - Balance sheet report data
   */
  async generateBalanceSheet(organizationId, asOfDate, options = {}) {
    try {
      const {
        compareWithPreviousYear = false,
        includeStabulumAmounts = false,
        groupBy = 'type', // 'type', 'subtype', or 'account'
      } = options;
      
      // Validate input
      if (!mongoose.Types.ObjectId.isValid(organizationId)) {
        throw new Error('Invalid organization ID');
      }
      
      if (!(asOfDate instanceof Date)) {
        throw new Error('asOfDate must be a valid date');
      }
      
      // Get organization settings for currency formatting
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }
      
      // Calculate previous year date if comparing
      let prevAsOfDate;
      if (compareWithPreviousYear) {
        prevAsOfDate = new Date(asOfDate);
        prevAsOfDate.setFullYear(prevAsOfDate.getFullYear() - 1);
      }
      
      // Query accounts
      const assetAccounts = await ChartOfAccounts.find({
        organizationId,
        type: 'asset',
        isActive: true
      }).sort({ accountNumber: 1 });
      
      const liabilityAccounts = await ChartOfAccounts.find({
        organizationId,
        type: 'liability',
        isActive: true
      }).sort({ accountNumber: 1 });
      
      const equityAccounts = await ChartOfAccounts.find({
        organizationId,
        type: 'equity',
        isActive: true
      }).sort({ accountNumber: 1 });
      
      // Get journal entries up to asOfDate
      const entryQuery = {
        organizationId,
        status: 'posted',
        date: { $lte: asOfDate }
      };
      
      const journalEntries = await JournalEntry.find(entryQuery);
      const entryIds = journalEntries.map(entry => entry._id);
      
      // Get journal lines for these entries
      const journalLines = await JournalLine.find({
        journalEntryId: { $in: entryIds }
      }).populate('accountId', 'accountNumber name type subtype');
      
      // Query for previous year if comparing
      let prevJournalLines = [];
      if (compareWithPreviousYear) {
        const prevEntryQuery = {
          organizationId,
          status: 'posted',
          date: { $lte: prevAsOfDate }
        };
        
        const prevJournalEntries = await JournalEntry.find(prevEntryQuery);
        const prevEntryIds = prevJournalEntries.map(entry => entry._id);
        
        prevJournalLines = await JournalLine.find({
          journalEntryId: { $in: prevEntryIds }
        }).populate('accountId', 'accountNumber name type subtype');
      }
      
      // Process assets
      const assetData = this._processAccountsForReport(
        assetAccounts,
        journalLines,
        prevJournalLines,
        groupBy,
        includeStabulumAmounts
      );
      
      // Process liabilities
      const liabilityData = this._processAccountsForReport(
        liabilityAccounts,
        journalLines,
        prevJournalLines,
        groupBy,
        includeStabulumAmounts
      );
      
      // Process equity
      const equityData = this._processAccountsForReport(
        equityAccounts,
        journalLines,
        prevJournalLines,
        groupBy,
        includeStabulumAmounts
      );
      
      // Calculate retained earnings (will be added to equity)
      const retainedEarnings = await this._calculateRetainedEarnings(
        organizationId,
        asOfDate,
        journalLines
      );
      
      let prevRetainedEarnings = 0;
      if (compareWithPreviousYear) {
        prevRetainedEarnings = await this._calculateRetainedEarnings(
          organizationId,
          prevAsOfDate,
          prevJournalLines
        );
      }
      
      // Add retained earnings to equity section
      equityData.items.push({
        id: 'retained-earnings',
        name: 'Retained Earnings',
        amount: retainedEarnings,
        prevAmount: compareWithPreviousYear ? prevRetainedEarnings : undefined
      });
      
      equityData.totalAmount += retainedEarnings;
      if (compareWithPreviousYear) {
        equityData.prevTotalAmount += prevRetainedEarnings;
      }
      
      // Calculate totals
      const totalAssets = assetData.totalAmount;
      const totalLiabilities = liabilityData.totalAmount;
      const totalEquity = equityData.totalAmount;
      const liabilitiesAndEquity = totalLiabilities + totalEquity;
      
      let prevTotalAssets = 0;
      let prevTotalLiabilities = 0;
      let prevTotalEquity = 0;
      let prevLiabilitiesAndEquity = 0;
      
      if (compareWithPreviousYear) {
        prevTotalAssets = assetData.prevTotalAmount;
        prevTotalLiabilities = liabilityData.prevTotalAmount;
        prevTotalEquity = equityData.prevTotalAmount;
        prevLiabilitiesAndEquity = prevTotalLiabilities + prevTotalEquity;
      }
      
      // Build report response
      const report = {
        title: 'Balance Sheet',
        subtitle: `As of ${asOfDate.toLocaleDateString()}`,
        organizationName: organization.name,
        currency: organization.settings.currency || 'USD',
        dateGenerated: new Date(),
        asOfDate,
        assets: {
          items: assetData.items,
          total: totalAssets,
          prevTotal: compareWithPreviousYear ? prevTotalAssets : undefined
        },
        liabilities: {
          items: liabilityData.items,
          total: totalLiabilities,
          prevTotal: compareWithPreviousYear ? prevTotalLiabilities : undefined
        },
        equity: {
          items: equityData.items,
          total: totalEquity,
          prevTotal: compareWithPreviousYear ? prevTotalEquity : undefined
        },
        liabilitiesAndEquity: {
          total: liabilitiesAndEquity,
          prevTotal: compareWithPreviousYear ? prevLiabilitiesAndEquity : undefined
        },
        balanced: Math.abs(totalAssets - liabilitiesAndEquity) < 0.01
      };
      
      return report;
    } catch (error) {
      console.error('Error generating balance sheet:', error);
      throw error;
    }
  }
  
  /**
   * Generate cash flow statement
   * @param {string} organizationId - Organization ID
   * @param {Date} startDate - Start date for report
   * @param {Date} endDate - End date for report
   * @param {Object} options - Additional options for report generation
   * @returns {Object} - Cash flow statement report data
   */
  async generateCashFlowStatement(organizationId, startDate, endDate, options = {}) {
    try {
      const {
        compareWithPreviousPeriod = false,
        includeStabulumFlow = true,
        cashAccountIds = [], // If empty, will auto-detect cash accounts
        cashEquivalentAccountIds = [] // If empty, will auto-detect cash equivalent accounts
      } = options;
      
      // Validate input
      if (!mongoose.Types.ObjectId.isValid(organizationId)) {
        throw new Error('Invalid organization ID');
      }
      
      if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
        throw new Error('Start date and end date must be valid dates');
      }
      
      if (startDate > endDate) {
        throw new Error('Start date must be before end date');
      }
      
      // Get organization settings for currency formatting
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }
      
      // Calculate previous period dates if comparing
      let prevStartDate, prevEndDate;
      if (compareWithPreviousPeriod) {
        const periodDuration = endDate - startDate;
        prevEndDate = new Date(startDate);
        prevStartDate = new Date(prevEndDate - periodDuration);
      }
      
      // Find cash and cash equivalent accounts if not provided
      let cashAccounts = [];
      if (cashAccountIds.length > 0) {
        cashAccounts = await ChartOfAccounts.find({
          _id: { $in: cashAccountIds },
          organizationId
        });
      } else {
        // Auto-detect cash accounts based on subtype
        cashAccounts = await ChartOfAccounts.find({
          organizationId,
          type: 'asset',
          subtype: 'cash',
          isActive: true
        });
      }
      
      let cashEquivalentAccounts = [];
      if (cashEquivalentAccountIds.length > 0) {
        cashEquivalentAccounts = await ChartOfAccounts.find({
          _id: { $in: cashEquivalentAccountIds },
          organizationId
        });
      } else {
        // Auto-detect cash equivalent accounts based on subtype
        cashEquivalentAccounts = await ChartOfAccounts.find({
          organizationId,
          type: 'asset',
          subtype: 'cash-equivalents',
          isActive: true
        });
      }
      
      // Combine cash and cash equivalent accounts
      const cashAndEquivalentAccounts = [...cashAccounts, ...cashEquivalentAccounts];
      const cashAccountIdStrings = cashAndEquivalentAccounts.map(acc => acc._id.toString());
      
      // Get entries for the period
      const entryQuery = {
        organizationId,
        status: 'posted',
        date: { 
          $gte: startDate, 
          $lte: endDate 
        }
      };
      
      const journalEntries = await JournalEntry.find(entryQuery);
      const entryIds = journalEntries.map(entry => entry._id);
      
      // Get all journal lines for these entries
      const journalLines = await JournalLine.find({
        journalEntryId: { $in: entryIds }
      }).populate('accountId', 'accountNumber name type subtype');
      
      // Get entries for previous period if comparing
      let prevJournalLines = [];
      if (compareWithPreviousPeriod) {
        const prevEntryQuery = {
          organizationId,
          status: 'posted',
          date: { 
            $gte: prevStartDate, 
            $lte: prevEndDate 
          }
        };
        
        const prevEntries = await JournalEntry.find(prevEntryQuery);
        const prevEntryIds = prevEntries.map(entry => entry._id);
        
        prevJournalLines = await JournalLine.find({
          journalEntryId: { $in: prevEntryIds }
        }).populate('accountId', 'accountNumber name type subtype');
      }
      
      // Calculate beginning and ending cash balances
      const beginningCashBalance = await this._calculateCashBalance(
        organizationId,
        startDate,
        cashAccountIdStrings
      );
      
      const endingCashBalance = await this._calculateCashBalance(
        organizationId,
        endDate,
        cashAccountIdStrings
      );
      
      let prevBeginningCashBalance = 0;
      let prevEndingCashBalance = 0;
      
      if (compareWithPreviousPeriod) {
        prevBeginningCashBalance = await this._calculateCashBalance(
          organizationId,
          prevStartDate,
          cashAccountIdStrings
        );
        
        prevEndingCashBalance = await this._calculateCashBalance(
          organizationId,
          prevEndDate,
          cashAccountIdStrings
        );
      }
      
      // Calculate net change in cash
      const netChangeCash = endingCashBalance - beginningCashBalance;
      const prevNetChangeCash = compareWithPreviousPeriod 
        ? prevEndingCashBalance - prevBeginningCashBalance 
        : 0;
      
      // Classify journal lines into operating, investing, and financing activities
      const {
        operatingActivities,
        investingActivities,
        financingActivities
      } = await this._classifyCashFlowActivities(
        journalLines,
        cashAccountIdStrings,
        organizationId
      );
      
      let prevOperatingActivities = {};
      let prevInvestingActivities = {};
      let prevFinancingActivities = {};
      
      if (compareWithPreviousPeriod) {
        const prevClassification = await this._classifyCashFlowActivities(
          prevJournalLines,
          cashAccountIdStrings,
          organizationId
        );
        
        prevOperatingActivities = prevClassification.operatingActivities;
        prevInvestingActivities = prevClassification.investingActivities;
        prevFinancingActivities = prevClassification.financingActivities;
      }
      
      // Get Stabulum flow data if requested
      let stabulumFlow = null;
      let prevStabulumFlow = null;
      
      if (includeStabulumFlow) {
        stabulumFlow = await this._calculateStabulumFlow(
          organizationId,
          startDate,
          endDate
        );
        
        if (compareWithPreviousPeriod) {
          prevStabulumFlow = await this._calculateStabulumFlow(
            organizationId,
            prevStartDate,
            prevEndDate
          );
        }
      }
      
      // Build report response
      const report = {
        title: 'Statement of Cash Flows',
        subtitle: `For the period ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
        organizationName: organization.name,
        currency: organization.settings.currency || 'USD',
        dateGenerated: new Date(),
        startDate,
        endDate,
        operatingActivities: {
          items: operatingActivities.items,
          total: operatingActivities.total,
          prevItems: compareWithPreviousPeriod ? prevOperatingActivities.items : undefined,
          prevTotal: compareWithPreviousPeriod ? prevOperatingActivities.total : undefined
        },
        investingActivities: {
          items: investingActivities.items,
          total: investingActivities.total,
          prevItems: compareWithPreviousPeriod ? prevInvestingActivities.items : undefined,
          prevTotal: compareWithPreviousPeriod ? prevInvestingActivities.total : undefined
        },
        financingActivities: {
          items: financingActivities.items,
          total: financingActivities.total,
          prevItems: compareWithPreviousPeriod ? prevFinancingActivities.items : undefined,
          prevTotal: compareWithPreviousPeriod ? prevFinancingActivities.total : undefined
        },
        stabulumFlow: includeStabulumFlow ? {
          inflow: stabulumFlow.inflow,
          outflow: stabulumFlow.outflow,
          net: stabulumFlow.net,
          prevInflow: compareWithPreviousPeriod ? prevStabulumFlow.inflow : undefined,
          prevOutflow: compareWithPreviousPeriod ? prevStabulumFlow.outflow : undefined,
          prevNet: compareWithPreviousPeriod ? prevStabulumFlow.net : undefined
        } : undefined,
        beginningCashBalance,
        endingCashBalance,
        netChangeCash,
        prevBeginningCashBalance: compareWithPreviousPeriod ? prevBeginningCashBalance : undefined,
        prevEndingCashBalance: compareWithPreviousPeriod ? prevEndingCashBalance : undefined,
        prevNetChangeCash: compareWithPreviousPeriod ? prevNetChangeCash : undefined,
        reconciliation: {
          calculatedChange: operatingActivities.total + investingActivities.total + financingActivities.total,
          actualChange: netChangeCash,
          difference: (operatingActivities.total + investingActivities.total + financingActivities.total) - netChangeCash
        }
      };
      
      return report;
    } catch (error) {
      console.error('Error generating cash flow statement:', error);
      throw error;
    }
  }
  
  /**
   * Helper method to process accounts for financial reports
   * @private
   */
  _processAccountsForReport(accounts, journalLines, prevJournalLines, groupBy, includeStabulumAmounts) {
    // Group accounts by specified grouping
    const groupedAccounts = {};
    
    // Create map of account IDs to accounts for quick lookup
    const accountMap = {};
    accounts.forEach(account => {
      accountMap[account._id.toString()] = account;
      
      let groupKey;
      if (groupBy === 'type') {
        groupKey = account.type;
      } else if (groupBy === 'subtype') {
        groupKey = account.subtype || 'Other';
      } else {
        // 'account' grouping - each account is its own group
        groupKey = account._id.toString();
      }
      
      if (!groupedAccounts[groupKey]) {
        groupedAccounts[groupKey] = {
          id: groupKey,
          name: this._formatGroupName(groupKey, groupBy),
          accounts: [],
          amount: 0,
          prevAmount: 0
        };
      }
      
      groupedAccounts[groupKey].accounts.push(account);
    });
    
    // Process journal lines to calculate account balances
    journalLines.forEach(line => {
      if (!line.accountId) return;
      
      const accountId = line.accountId._id.toString();
      const account = accountMap[accountId];
      
      if (!account) return; // Skip if not in our account list
      
      let groupKey;
      if (groupBy === 'type') {
        groupKey = account.type;
      } else if (groupBy === 'subtype') {
        groupKey = account.subtype || 'Other';
      } else {
        groupKey = accountId;
      }
      
      // Process debit/credit based on account type
      if (['asset', 'expense'].includes(account.type)) {
        // Debit increases, credit decreases
        groupedAccounts[groupKey].amount += line.debit - line.credit;
      } else {
        // Credit increases, debit decreases
        groupedAccounts[groupKey].amount += line.credit - line.debit;
      }
      
      // Include Stabulum amounts if requested
      if (includeStabulumAmounts && line.stabulumAmount > 0) {
        if (!groupedAccounts[groupKey].stabulumAmount) {
          groupedAccounts[groupKey].stabulumAmount = 0;
        }
        
        if (line.debit > 0) {
          groupedAccounts[groupKey].stabulumAmount += line.stabulumAmount;
        } else if (line.credit > 0) {
          groupedAccounts[groupKey].stabulumAmount -= line.stabulumAmount;
        }
      }
    });
    
    // Process previous period journal lines if provided
    if (prevJournalLines && prevJournalLines.length > 0) {
      prevJournalLines.forEach(line => {
        if (!line.accountId) return;
        
        const accountId = line.accountId._id.toString();
        const account = accountMap[accountId];
        
        if (!account) return; // Skip if not in our account list
        
        let groupKey;
        if (groupBy === 'type') {
          groupKey = account.type;
        } else if (groupBy === 'subtype') {
          groupKey = account.subtype || 'Other';
        } else {
          groupKey = accountId;
        }
        
        // Process debit/credit based on account type
        if (['asset', 'expense'].includes(account.type)) {
          // Debit increases, credit decreases
          groupedAccounts[groupKey].prevAmount += line.debit - line.credit;
        } else {
          // Credit increases, debit decreases
          groupedAccounts[groupKey].prevAmount += line.credit - line.debit;
        }
      });
    }
    
    // Convert the grouped accounts object to an array and calculate totals
    const result = {
      items: [],
      totalAmount: 0,
      prevTotalAmount: 0
    };
    
    for (const key in groupedAccounts) {
      const group = groupedAccounts[key];
      
      // Only include groups with non-zero amounts
      if (group.amount !== 0 || group.prevAmount !== 0) {
        result.items.push({
          id: group.id,
          name: group.name,
          amount: group.amount,
          prevAmount: group.prevAmount !== 0 ? group.prevAmount : undefined,
          stabulumAmount: group.stabulumAmount,
          accountCount: group.accounts.length
        });
        
        result.totalAmount += group.amount;
        result.prevTotalAmount += group.prevAmount;
      }
    }
    
    // Sort items by amount (descending)
    result.items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    
    return result;
  }
  
  /**
   * Helper method to format group names
   * @private
   */
  _formatGroupName(key, groupBy) {
    if (groupBy === 'type') {
      // Capitalize first letter
      return key.charAt(0).toUpperCase() + key.slice(1);
    } else if (groupBy === 'subtype') {
      // Format subtype names
      const formattedName = key
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return formattedName;
    } else {
      // For account grouping, use the account name from the accountMap
      return key;
    }
  }
  
  /**
   * Calculate retained earnings
   * @private
   */
  async _calculateRetainedEarnings(organizationId, asOfDate, journalLines) {
    // Get revenue and expense accounts
    const revenueAccounts = await ChartOfAccounts.find({
      organizationId,
      type: 'revenue',
      isActive: true
    });
    
    const expenseAccounts = await ChartOfAccounts.find({
      organizationId,
      type: 'expense',
      isActive: true
    });
    
    const revenueAccountIds = revenueAccounts.map(a => a._id.toString());
    const expenseAccountIds = expenseAccounts.map(a => a._id.toString());
    
    // Calculate net income from journal lines
    let totalRevenue = 0;
    let totalExpenses = 0;
    
    journalLines.forEach(line => {
      if (!line.accountId) return;
      
      const accountId = line.accountId._id.toString();
      
      if (revenueAccountIds.includes(accountId)) {
        // For revenue, credit increases, debit decreases
        totalRevenue += line.credit - line.debit;
      } else if (expenseAccountIds.includes(accountId)) {
        // For expenses, debit increases, credit decreases
        totalExpenses += line.debit - line.credit;
      }
    });
    
    // Retained earnings = Revenue - Expenses
    return totalRevenue - totalExpenses;
  }
  
  /**
   * Calculate cash balance as of a specific date
   * @private
   */
  async _calculateCashBalance(organizationId, date, cashAccountIds) {
    // Get all posted journal entries up to the specified date
    const entries = await JournalEntry.find({
      organizationId,
      status: 'posted',
      date: { $lte: date }
    });
    
    const entryIds = entries.map(e => e._id);
    
    // Get all journal lines for cash accounts
    const cashLines = await JournalLine.find({
      journalEntryId: { $in: entryIds },
      accountId: { $in: cashAccountIds }
    });
    
    // Calculate cash balance
    let cashBalance = 0;
    
    cashLines.forEach(line => {
      // For asset accounts, debit increases, credit decreases
      cashBalance += line.debit - line.credit;
    });
    
    return cashBalance;
  }
  
  /**
   * Classify cash flow activities
   * @private
   */
  async _classifyCashFlowActivities(journalLines, cashAccountIds, organizationId) {
    // Get classification settings for accounts
    const accounts = await ChartOfAccounts.find({ 
      organizationId,
      isActive: true
    });
    
    // Create lookup map for account classifications
    const accountClassificationMap = {};
    accounts.forEach(account => {
      accountClassificationMap[account._id.toString()] = account.metadata 
        ? (account.metadata.get('cashFlowCategory') || this._determineDefaultCashFlowCategory(account))
        : this._determineDefaultCashFlowCategory(account);
    });
    
    // Initialize activity categorization
    const operatingActivities = {
      items: [],
      total: 0
    };
    
    const investingActivities = {
      items: [],
      total: 0
    };
    
    const financingActivities = {
      items: [],
      total: 0
    };
    
    // Process journal entries that involve cash accounts
    const processedEntries = new Set();
    
    for (const line of journalLines) {
      if (!line.accountId || !line.journalEntryId) continue;
      
      const accountId = line.accountId._id.toString();
      const entryId = line.journalEntryId.toString();
      
      // Skip cash accounts themselves
      if (cashAccountIds.includes(accountId)) continue;
      
      // Skip already processed entries
      if (processedEntries.has(entryId)) continue;
      
      // Check if this entry involves a cash account
      const cashLinesInEntry = journalLines.filter(l => 
        l.journalEntryId && 
        l.journalEntryId.toString() === entryId && 
        l.accountId && 
        cashAccountIds.includes(l.accountId._id.toString())
      );
      
      if (cashLinesInEntry.length === 0) continue;
      
      // Mark as processed
      processedEntries.add(entryId);
      
      // Calculate net cash impact
      let netCashImpact = 0;
      cashLinesInEntry.forEach(cashLine => {
        // For cash accounts (assets), debit increases cash, credit decreases
        netCashImpact += cashLine.debit - cashLine.credit;
      });
      
      // Skip entries with no cash impact
      if (Math.abs(netCashImpact) < 0.01) continue;
      
      // Get non-cash lines in this entry
      const nonCashLines = journalLines.filter(l =>
        l.journalEntryId &&
        l.journalEntryId.toString() === entryId &&
        l.accountId &&
        !cashAccountIds.includes(l.accountId._id.toString())
      );
      
      // Group by account and classification
      const accountGroups = {};
      
      nonCashLines.forEach(ncLine => {
        const ncAccountId = ncLine.accountId._id.toString();
        const classification = accountClassificationMap[ncAccountId] || 'operating';
        
        if (!accountGroups[classification]) {
          accountGroups[classification] = {
            accounts: {},
            total: 0
          };
        }
        
        if (!accountGroups[classification].accounts[ncAccountId]) {
          accountGroups[classification].accounts[ncAccountId] = {
            name: ncLine.accountId.name,
            amount: 0
          };
        }
        
        // Process based on account type
        if (['asset', 'expense'].includes(ncLine.accountId.type)) {
          // Debit increases, credit decreases
          accountGroups[classification].accounts[ncAccountId].amount += ncLine.debit - ncLine.credit;
        } else {
          // Credit increases, debit decreases
          accountGroups[classification].accounts[ncAccountId].amount += ncLine.credit - ncLine.debit;
        }
        
        accountGroups[classification].total += accountGroups[classification].accounts[ncAccountId].amount;
      });
      
      // Add to appropriate activity category
      for (const classification in accountGroups) {
        const group = accountGroups[classification];
        let targetActivity;
        
        if (classification === 'operating') {
          targetActivity = operatingActivities;
        } else if (classification === 'investing') {
          targetActivity = investingActivities;
        } else if (classification === 'financing') {
          targetActivity = financingActivities;
        } else {
          // Default to operating
          targetActivity = operatingActivities;
        }
        
        // Convert accounts to array
        const accountsArray = Object.values(group.accounts);
        
        // Only add if there are accounts
        if (accountsArray.length > 0) {
          // Calculate proportional cash impact
          const proportionalImpact = netCashImpact * (Math.abs(group.total) / 
            (Math.abs(group.total) + 
             Math.abs(accountGroups.operating?.total || 0) + 
             Math.abs(accountGroups.investing?.total || 0) + 
             Math.abs(accountGroups.financing?.total || 0)));
          
          // Create a description based on the accounts
          const description = accountsArray.length === 1 
            ? accountsArray[0].name 
            : `${accountsArray[0].name} and ${accountsArray.length - 1} more accounts`;
          
          targetActivity.items.push({
            description,
            amount: proportionalImpact,
            accounts: accountsArray
          });
          
          targetActivity.total += proportionalImpact;
        }
      }
    }
    
    // Sort items by amount (descending)
    operatingActivities.items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    investingActivities.items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    financingActivities.items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    
    return {
      operatingActivities,
      investingActivities,
      financingActivities
    };
  }
  
  /**
   * Determine default cash flow category for an account
   * @private
   */
  _determineDefaultCashFlowCategory(account) {
    // Assign default cash flow categories based on account type and subtype
    if (account.type === 'expense' || account.type === 'revenue') {
      return 'operating';
    }
    
    if (account.type === 'asset') {
      if (['cash', 'cash-equivalents', 'accounts-receivable', 'inventory'].includes(account.subtype)) {
        return 'operating';
      } else if (['fixed-assets', 'investments', 'intangible-assets'].includes(account.subtype)) {
        return 'investing';
      }
    }
    
    if (account.type === 'liability') {
      if (['accounts-payable', 'accrued-expenses'].includes(account.subtype)) {
        return 'operating';
      } else if (['loans', 'bonds-payable', 'notes-payable'].includes(account.subtype)) {
        return 'financing';
      }
    }
    
    if (account.type === 'equity') {
      return 'financing';
    }
    
    // Default to operating
    return 'operating';
  }
  
  /**
   * Calculate Stabulum flow for a period
   * @private
   */
  async _calculateStabulumFlow(organizationId, startDate, endDate) {
    // Query Stabulum transactions for the period
    const transactions = await StabulumTransaction.find({
      organizationId,
      status: 'confirmed',
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    });
    
    let inflow = 0;
    let outflow = 0;
    
    transactions.forEach(tx => {
      if (tx.transactionType === 'receipt') {
        inflow += tx.amount;
      } else if (tx.transactionType === 'payment') {
        outflow += tx.amount;
      }
    });
    
    return {
      inflow,
      outflow,
      net: inflow - outflow,
      transactionCount: transactions.length
    };
  }
  
  /**
   * Generate trial balance report
   * @param {string} organizationId - Organization ID
   * @param {Date} asOfDate - Date for trial balance
   * @param {Object} options - Additional options for report generation
   * @returns {Object} - Trial balance report data
   */
  async generateTrialBalance(organizationId, asOfDate, options = {}) {
    try {
      const {
        includeZeroBalances = false,
        groupBy = 'none', // 'none', 'type', or 'subtype'
        includeStabulumAmounts = false
      } = options;
      
      // Validate input
      if (!mongoose.Types.ObjectId.isValid(organizationId)) {
        throw new Error('Invalid organization ID');
      }
      
      if (!(asOfDate instanceof Date)) {
        throw new Error('asOfDate must be a valid date');
      }
      
      // Get organization settings for currency formatting
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }
      
      // Get all active accounts
      const accounts = await ChartOfAccounts.find({
        organizationId,
        isActive: true
      }).sort({ accountNumber: 1 });
      
      // Get all posted journal entries up to the specified date
      const entries = await JournalEntry.find({
        organizationId,
        status: 'posted',
        date: { $lte: asOfDate }
      });
      
      const entryIds = entries.map(e => e._id);
      
      // Get all journal lines for these entries
      const journalLines = await JournalLine.find({
        journalEntryId: { $in: entryIds }
      });
      
      // Calculate account balances
      const accountBalances = {};
      
      accounts.forEach(account => {
        accountBalances[account._id.toString()] = {
          id: account._id.toString(),
          accountNumber: account.accountNumber,
          name: account.name,
          type: account.type,
          subtype: account.subtype,
          debit: 0,
          credit: 0,
          netDebit: 0,
          netCredit: 0,
          balance: 0,
          stabulumAmount: 0
        };
      });
      
      // Process journal lines
      journalLines.forEach(line => {
        if (!line.accountId) return;
        
        const accountId = line.accountId.toString();
        if (!accountBalances[accountId]) return;
        
        accountBalances[accountId].debit += line.debit;
        accountBalances[accountId].credit += line.credit;
        
        if (includeStabulumAmounts && line.stabulumAmount > 0) {
          if (line.debit > 0) {
            accountBalances[accountId].stabulumAmount += line.stabulumAmount;
          } else if (line.credit > 0) {
            accountBalances[accountId].stabulumAmount -= line.stabulumAmount;
          }
        }
      });
      
      // Calculate net debit/credit based on account type normal balance
      for (const accountId in accountBalances) {
        const account = accountBalances[accountId];
        const netBalance = account.debit - account.credit;
        
        account.balance = netBalance;
        
        if (['asset', 'expense'].includes(account.type)) {
          // Normal balance is debit
          if (netBalance > 0) {
            account.netDebit = netBalance;
            account.netCredit = 0;
          } else {
            account.netDebit = 0;
            account.netCredit = Math.abs(netBalance);
          }
        } else {
          // Normal balance is credit
          if (netBalance < 0) {
            account.netDebit = 0;
            account.netCredit = Math.abs(netBalance);
          } else {
            account.netDebit = netBalance;
            account.netCredit = 0;
          }
        }
      }
      
      // Filter out zero balances if not including them
      let balanceArray = Object.values(accountBalances);
      
      if (!includeZeroBalances) {
        balanceArray = balanceArray.filter(account => account.balance !== 0);
      }
      
      // Group accounts if specified
      if (groupBy !== 'none') {
        const groupedBalances = {};
        
        balanceArray.forEach(account => {
          const groupKey = groupBy === 'type' 
            ? account.type 
            : (account.subtype || 'Other');
          
          if (!groupedBalances[groupKey]) {
            groupedBalances[groupKey] = {
              id: groupKey,
              name: this._formatGroupName(groupKey, groupBy),
              type: groupBy === 'type' ? account.type : null,
              accounts: [],
              debit: 0,
              credit: 0,
              netDebit: 0,
              netCredit: 0,
              stabulumAmount: 0
            };
          }
          
          groupedBalances[groupKey].accounts.push(account);
          groupedBalances[groupKey].debit += account.debit;
          groupedBalances[groupKey].credit += account.credit;
          groupedBalances[groupKey].netDebit += account.netDebit;
          groupedBalances[groupKey].netCredit += account.netCredit;
          
          if (includeStabulumAmounts) {
            groupedBalances[groupKey].stabulumAmount += account.stabulumAmount;
          }
        });
        
        balanceArray = Object.values(groupedBalances);
      }
      
      // Sort by account number or name
      balanceArray.sort((a, b) => {
        if (a.accountNumber && b.accountNumber) {
          return a.accountNumber.localeCompare(b.accountNumber);
        } else {
          return a.name.localeCompare(b.name);
        }
      });
      
      // Calculate totals
      const totals = {
        debit: 0,
        credit: 0,
        netDebit: 0,
        netCredit: 0,
        stabulumAmount: 0
      };
      
      balanceArray.forEach(account => {
        totals.debit += account.debit;
        totals.credit += account.credit;
        totals.netDebit += account.netDebit;
        totals.netCredit += account.netCredit;
        
        if (includeStabulumAmounts) {
          totals.stabulumAmount += account.stabulumAmount;
        }
      });
      
      // Build report response
      const report = {
        title: 'Trial Balance',
        subtitle: `As of ${asOfDate.toLocaleDateString()}`,
        organizationName: organization.name,
        currency: organization.settings.currency || 'USD',
        dateGenerated: new Date(),
        asOfDate,
        accounts: balanceArray,
        totals,
        balanced: Math.abs(totals.netDebit - totals.netCredit) < 0.01
      };
      
      return report;
    } catch (error) {
      console.error('Error generating trial balance:', error);
      throw error;
    }
  }
}

module.exports = new ReportingService();
