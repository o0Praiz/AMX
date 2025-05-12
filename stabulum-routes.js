// routes/stabulum.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const stabulumService = require('../services/stabulumService');
const StabulumWallet = require('../models/StabulumWallet');
const StabulumTransaction = require('../models/StabulumTransaction');
const Organization = require('../models/Organization');

// Get all wallets for an organization
router.get('/wallets', auth, async (req, res) => {
  try {
    const wallets = await StabulumWallet.find({
      organizationId: req.user.organization
    });
    
    // Don't include sensitive data in response
    const publicWallets = wallets.map(wallet => wallet.toPublic());
    
    res.json(publicWallets);
  } catch (error) {
    console.error('Error fetching wallets:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new wallet
router.post('/wallets', auth, async (req, res) => {
  try {
    const { name, purpose } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Wallet name is required' });
    }
    
    const wallet = await stabulumService.createWallet(
      req.user.organization,
      name,
      purpose || 'operating'
    );
    
    res.status(201).json(wallet.toPublic());
  } catch (error) {
    console.error('Error creating wallet:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific wallet
router.get('/wallets/:id', auth, async (req, res) => {
  try {
    const wallet = await StabulumWallet.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    // Sync balance before returning
    await stabulumService.syncWalletBalance(wallet._id);
    
    // Reload wallet to get updated balance
    const updatedWallet = await StabulumWallet.findById(wallet._id);
    
    res.json(updatedWallet.toPublic());
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update wallet
router.put('/wallets/:id', auth, async (req, res) => {
  try {
    const { name, purpose, isDefault, notes, isActive } = req.body;
    
    const wallet = await StabulumWallet.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    if (name) wallet.name = name;
    if (purpose) wallet.purpose = purpose;
    if (notes !== undefined) wallet.notes = notes;
    if (isActive !== undefined) wallet.isActive = isActive;
    
    await wallet.save();
    
    // Handle setting as default separately
    if (isDefault) {
      await wallet.setAsDefault();
    }
    
    res.json(wallet.toPublic());
  } catch (error) {
    console.error('Error updating wallet:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get wallet transactions
router.get('/wallets/:id/transactions', auth, async (req, res) => {
  try {
    const wallet = await StabulumWallet.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    const limit = parseInt(req.query.limit) || 20;
    const transactions = await StabulumTransaction.findByWalletAddress(wallet.address, limit);
    
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new transaction
router.post('/transactions', auth, async (req, res) => {
  try {
    const { 
      walletId, 
      toAddress, 
      amount, 
      notes, 
      relatedDocumentType, 
      relatedDocumentId 
    } = req.body;
    
    if (!walletId || !toAddress || !amount) {
      return res.status(400).json({ 
        message: 'Wallet ID, recipient address, and amount are required' 
      });
    }
    
    const wallet = await StabulumWallet.findOne({
      _id: walletId,
      organizationId: req.user.organization
    });
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    // Verify sufficient balance
    await stabulumService.syncWalletBalance(wallet._id);
    const updatedWallet = await StabulumWallet.findById(wallet._id);
    
    if (updatedWallet.balance < amount) {
      return res.status(400).json({ 
        message: 'Insufficient balance',
        available: updatedWallet.balance,
        requested: amount
      });
    }
    
    const transaction = await stabulumService.createTransaction(
      walletId,
      toAddress,
      amount,
      notes,
      relatedDocumentType,
      relatedDocumentId
    );
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all transactions for an organization
router.get('/transactions', auth, async (req, res) => {
  try {
    const { status, type, startDate, endDate, limit } = req.query;
    const query = { organizationId: req.user.organization };
    
    if (status) {
      query.status = status;
    }
    
    if (type) {
      query.transactionType = type;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    const transactions = await StabulumTransaction.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit) || 50);
    
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific transaction
router.get('/transactions/:id', auth, async (req, res) => {
  try {
    const transaction = await StabulumTransaction.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    // Get blockchain status if pending
    if (transaction.status === 'pending') {
      try {
        const txInfo = await stabulumService.getTransaction(transaction.transactionHash);
        
        transaction.status = txInfo.status;
        transaction.blockHeight = txInfo.blockNumber;
        transaction.confirmations = txInfo.confirmations;
        transaction.updatedAt = new Date();
        
        await transaction.save();
      } catch (txError) {
        console.error('Error fetching transaction status from blockchain:', txError);
        // Continue with existing data if blockchain query fails
      }
    }
    
    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create journal entry for a transaction
router.post('/transactions/:id/journal', auth, async (req, res) => {
  try {
    const { journalId, description } = req.body;
    
    if (!journalId) {
      return res.status(400).json({ message: 'Journal ID is required' });
    }
    
    const transaction = await StabulumTransaction.findOne({
      _id: req.params.id,
      organizationId: req.user.organization
    });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    if (transaction.journalEntryId) {
      return res.status(400).json({ 
        message: 'Transaction already has a journal entry',
        journalEntryId: transaction.journalEntryId
      });
    }
    
    const journalEntry = await stabulumService.createJournalEntryForTransaction(
      transaction._id,
      journalId,
      description
    );
    
    res.status(201).json(journalEntry);
  } catch (error) {
    console.error('Error creating journal entry for transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sync pending transactions
router.post('/sync', auth, async (req, res) => {
  try {
    const updatedTransactions = await stabulumService.syncPendingTransactions();
    
    // Also check for incoming transactions
    const newIncomingCount = await stabulumService.monitorIncomingTransactions(
      req.user.organization
    );
    
    res.json({
      updatedTransactions: updatedTransactions.length,
      newIncomingTransactions: newIncomingCount,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error syncing Stabulum transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get transaction volume statistics
router.get('/stats/volume', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Start date and end date are required' 
      });
    }
    
    const volumeStats = await StabulumTransaction.calculateVolume(
      req.user.organization,
      new Date(startDate),
      new Date(endDate)
    );
    
    res.json(volumeStats);
  } catch (error) {
    console.error('Error fetching transaction volume statistics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
