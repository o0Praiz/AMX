// stabulumService.js - Integration service for Stabulum stablecoin

const Web3 = require('web3');
const axios = require('axios');
const crypto = require('crypto');
const StabulumTransaction = require('../models/StabulumTransaction');
const StabulumWallet = require('../models/StabulumWallet');
const JournalEntry = require('../models/JournalEntry');
const JournalLine = require('../models/JournalLine');

// Load ABI (Application Binary Interface) for the Stabulum contract
const stabulumABI = require('../contracts/StabulumABI.json');

class StabulumService {
  constructor() {
    this.web3 = new Web3(process.env.STABULUM_RPC_URL);
    this.stabulumContract = new this.web3.eth.Contract(
      stabulumABI,
      process.env.STABULUM_CONTRACT_ADDRESS
    );
    this.apiKey = process.env.STABULUM_API_KEY;
    this.apiBaseUrl = process.env.STABULUM_API_URL;
  }

  // Create a new wallet for an organization
  async createWallet(organizationId, walletName, purpose) {
    try {
      const account = this.web3.eth.accounts.create();
      
      // Encrypt private key using the organization's secret key
      // In production, use proper key management and HSM
      const organization = await Organization.findById(organizationId);
      const encryptionKey = crypto.createHash('sha256')
        .update(organization.secretKey + process.env.ENCRYPTION_SALT)
        .digest('hex');
      
      const encryptedPrivateKey = crypto.createCipheriv(
        'aes-256-cbc', 
        Buffer.from(encryptionKey, 'hex'),
        Buffer.from(process.env.ENCRYPTION_IV, 'hex')
      ).update(account.privateKey, 'utf8', 'hex');
      
      const wallet = new StabulumWallet({
        organizationId,
        name: walletName,
        address: account.address,
        publicKey: account.address, // Ethereum-style addresses use the public key as the address
        encryptedPrivateKey,
        balance: 0,
        lastSynced: new Date(),
        isDefault: false,
        purpose,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await wallet.save();
      return wallet;
    } catch (error) {
      console.error('Error creating Stabulum wallet:', error);
      throw error;
    }
  }

  // Get balance for a wallet
  async getWalletBalance(walletAddress) {
    try {
      const balance = await this.stabulumContract.methods
        .balanceOf(walletAddress)
        .call();
      
      return this.web3.utils.fromWei(balance, 'ether');
    } catch (error) {
      console.error('Error fetching Stabulum balance:', error);
      throw error;
    }
  }

  // Sync wallet balance with the blockchain
  async syncWalletBalance(walletId) {
    try {
      const wallet = await StabulumWallet.findById(walletId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      const balance = await this.getWalletBalance(wallet.address);
      
      wallet.balance = balance;
      wallet.lastSynced = new Date();
      wallet.updatedAt = new Date();
      
      await wallet.save();
      return wallet;
    } catch (error) {
      console.error('Error syncing wallet balance:', error);
      throw error;
    }
  }

  // Get transaction details from the blockchain
  async getTransaction(transactionHash) {
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/transactions/${transactionHash}`,
        {
          headers: {
            'x-api-key': this.apiKey
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error fetching Stabulum transaction:', error);
      throw error;
    }
  }

  // Create a new transaction
  async createTransaction(fromWalletId, toAddress, amount, notes, relatedDocumentType, relatedDocumentId) {
    try {
      const wallet = await StabulumWallet.findById(fromWalletId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      // Decrypt private key (in production, use proper key management)
      const organization = await Organization.findById(wallet.organizationId);
      const encryptionKey = crypto.createHash('sha256')
        .update(organization.secretKey + process.env.ENCRYPTION_SALT)
        .digest('hex');
      
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc', 
        Buffer.from(encryptionKey, 'hex'),
        Buffer.from(process.env.ENCRYPTION_IV, 'hex')
      );
      
      let decryptedPrivateKey = decipher.update(wallet.encryptedPrivateKey, 'hex', 'utf8');
      decryptedPrivateKey += decipher.final('utf8');
      
      // Create transaction
      const amountWei = this.web3.utils.toWei(amount.toString(), 'ether');
      const gasPrice = await this.web3.eth.getGasPrice();
      const gasLimit = 100000; // Estimate gas for the transfer
      
      const txData = this.stabulumContract.methods.transfer(
        toAddress,
        amountWei
      ).encodeABI();
      
      const txParams = {
        from: wallet.address,
        to: process.env.STABULUM_CONTRACT_ADDRESS,
        gas: gasLimit,
        gasPrice,
        data: txData,
        nonce: await this.web3.eth.getTransactionCount(wallet.address)
      };
      
      const signedTx = await this.web3.eth.accounts.signTransaction(
        txParams,
        decryptedPrivateKey
      );
      
      const receipt = await this.web3.eth.sendSignedTransaction(
        signedTx.rawTransaction
      );
      
      // Record transaction in database
      const transaction = new StabulumTransaction({
        organizationId: wallet.organizationId,
        transactionHash: receipt.transactionHash,
        blockHeight: receipt.blockNumber,
        timestamp: new Date(),
        fromAddress: wallet.address,
        toAddress,
        amount: parseFloat(amount),
        status: 'confirmed',
        confirmations: 1, // Will be updated by the sync process
        transactionType: 'payment',
        relatedDocumentType,
        relatedDocumentId,
        createdAt: new Date(),
        updatedAt: new Date(),
        fee: parseFloat(this.web3.utils.fromWei(
          (gasPrice * receipt.gasUsed).toString(),
          'ether'
        )),
        notes
      });
      
      await transaction.save();
      
      // Update wallet balance
      await this.syncWalletBalance(fromWalletId);
      
      return transaction;
    } catch (error) {
      console.error('Error creating Stabulum transaction:', error);
      throw error;
    }
  }

  // Create journal entry for a Stabulum transaction
  async createJournalEntryForTransaction(transactionId, journalId, description) {
    try {
      const transaction = await StabulumTransaction.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }
      
      // Get organization's chart of accounts
      const organization = await Organization.findById(transaction.organizationId);
      
      // Find relevant accounts
      const stabulumAssetAccount = await ChartOfAccounts.findOne({
        organizationId: transaction.organizationId,
        type: 'asset',
        stabulumLinked: true,
        stabulumAddress: transaction.fromAddress
      });
      
      const feeExpenseAccount = await ChartOfAccounts.findOne({
        organizationId: transaction.organizationId,
        type: 'expense',
        subtype: 'transaction fees'
      });
      
      // Create journal entry
      const journalEntry = new JournalEntry({
        organizationId: transaction.organizationId,
        journalId,
        entryNumber: `STBL-${Date.now()}`,
        date: transaction.timestamp,
        description: description || `Stabulum Transaction: ${transaction.notes}`,
        reference: transaction.transactionHash,
        status: 'posted',
        createdBy: null, // System-generated
        createdAt: new Date(),
        updatedAt: new Date(),
        postingDate: new Date(),
        hasAttachments: false,
        stabulumTransactionHash: transaction.transactionHash,
        stabulumTransactionBlockHeight: transaction.blockHeight,
        stabulumTransactionConfirmations: transaction.confirmations
      });
      
      await journalEntry.save();
      
      // Create journal lines for double-entry accounting
      // Debit the relevant expense/asset account based on transaction type
      let debitAccountId;
      if (transaction.transactionType === 'payment') {
        // For payments, find the relevant expense account based on related document
        if (transaction.relatedDocumentType === 'bill') {
          const bill = await Bill.findById(transaction.relatedDocumentId);
          debitAccountId = bill ? bill.accountId : organization.defaultExpenseAccountId;
        } else {
          debitAccountId = organization.defaultExpenseAccountId;
        }
      } else if (transaction.transactionType === 'internal') {
        // For internal transfers, find the receiving wallet's asset account
        const receivingWallet = await StabulumWallet.findOne({
          address: transaction.toAddress
        });
        
        if (receivingWallet) {
          const receivingAccount = await ChartOfAccounts.findOne({
            organizationId: transaction.organizationId,
            stabulumLinked: true,
            stabulumAddress: receivingWallet.address
          });
          
          debitAccountId = receivingAccount ? receivingAccount._id : organization.defaultAssetAccountId;
        } else {
          debitAccountId = organization.defaultAssetAccountId;
        }
      }
      
      // Create debit line
      const debitLine = new JournalLine({
        journalEntryId: journalEntry._id,
        lineNumber: 1,
        accountId: debitAccountId,
        description: `Payment via Stabulum: ${transaction.notes}`,
        debit: transaction.amount,
        credit: 0,
        stabulumAmount: transaction.amount,
        stabulumConfirmed: true
      });
      
      await debitLine.save();
      
      // Create credit line for the Stabulum wallet
      const creditLine = new JournalLine({
        journalEntryId: journalEntry._id,
        lineNumber: 2,
        accountId: stabulumAssetAccount._id,
        description: `Payment from Stabulum wallet: ${transaction.fromAddress}`,
        debit: 0,
        credit: transaction.amount,
        stabulumAmount: transaction.amount,
        stabulumConfirmed: true
      });
      
      await creditLine.save();
      
      // If there was a transaction fee, add it as another line
      if (transaction.fee > 0) {
        const feeLine = new JournalLine({
          journalEntryId: journalEntry._id,
          lineNumber: 3,
          accountId: feeExpenseAccount._id,
          description: 'Stabulum transaction fee',
          debit: transaction.fee,
          credit: 0,
          stabulumAmount: transaction.fee,
          stabulumConfirmed: true
        });
        
        await feeLine.save();
        
        // Add corresponding credit to balance the fee
        const feeBalanceLine = new JournalLine({
          journalEntryId: journalEntry._id,
          lineNumber: 4,
          accountId: stabulumAssetAccount._id,
          description: 'Stabulum transaction fee',
          debit: 0,
          credit: transaction.fee,
          stabulumAmount: transaction.fee,
          stabulumConfirmed: true
        });
        
        await feeBalanceLine.save();
      }
      
      // Update transaction with journal entry reference
      transaction.journalEntryId = journalEntry._id;
      await transaction.save();
      
      return journalEntry;
    } catch (error) {
      console.error('Error creating journal entry for Stabulum transaction:', error);
      throw error;
    }
  }

  // Sync all pending transactions with the blockchain
  async syncPendingTransactions() {
    try {
      const pendingTransactions = await StabulumTransaction.find({
        status: 'pending'
      });
      
      for (const transaction of pendingTransactions) {
        const txInfo = await this.getTransaction(transaction.transactionHash);
        
        transaction.status = txInfo.status;
        transaction.blockHeight = txInfo.blockNumber;
        transaction.confirmations = txInfo.confirmations;
        transaction.updatedAt = new Date();
        
        await transaction.save();
        
        // If transaction is now confirmed, update related journal entry
        if (txInfo.status === 'confirmed' && transaction.journalEntryId) {
          const journalEntry = await JournalEntry.findById(transaction.journalEntryId);
          if (journalEntry) {
            journalEntry.status = 'posted';
            journalEntry.stabulumTransactionConfirmations = txInfo.confirmations;
            await journalEntry.save();
            
            // Update journal lines
            await JournalLine.updateMany(
              { journalEntryId: journalEntry._id },
              { stabulumConfirmed: true }
            );
          }
        }
      }
      
      return pendingTransactions;
    } catch (error) {
      console.error('Error syncing pending Stabulum transactions:', error);
      throw error;
    }
  }

  // Monitor for incoming transactions
  async monitorIncomingTransactions(organizationId) {
    try {
      const wallets = await StabulumWallet.find({ organizationId });
      const walletsMap = new Map(wallets.map(w => [w.address.toLowerCase(), w]));
      
      // Get the latest block number
      const latestBlock = await this.web3.eth.getBlockNumber();
      const fromBlock = latestBlock - 1000; // Look back 1000 blocks
      
      // Get transfer events from Stabulum contract
      const events = await this.stabulumContract.getPastEvents('Transfer', {
        fromBlock,
        toBlock: 'latest'
      });
      
      // Filter events where the recipient is one of our wallets
      const relevantEvents = events.filter(event => 
        walletsMap.has(event.returnValues.to.toLowerCase())
      );
      
      // Process each incoming transaction
      for (const event of relevantEvents) {
        const existingTx = await StabulumTransaction.findOne({
          transactionHash: event.transactionHash
        });
        
        if (!existingTx) {
          const wallet = walletsMap.get(event.returnValues.to.toLowerCase());
          const txInfo = await this.web3.eth.getTransaction(event.transactionHash);
          const receipt = await this.web3.eth.getTransactionReceipt(event.transactionHash);
          const block = await this.web3.eth.getBlock(txInfo.blockNumber);
          
          // Create new transaction record
          const transaction = new StabulumTransaction({
            organizationId,
            transactionHash: event.transactionHash,
            blockHeight: txInfo.blockNumber,
            timestamp: new Date(block.timestamp * 1000),
            fromAddress: event.returnValues.from,
            toAddress: event.returnValues.to,
            amount: parseFloat(this.web3.utils.fromWei(
              event.returnValues.value,
              'ether'
            )),
            status: 'confirmed',
            confirmations: latestBlock - txInfo.blockNumber + 1,
            transactionType: 'receipt',
            createdAt: new Date(),
            updatedAt: new Date(),
            notes: 'Incoming transaction'
          });
          
          await transaction.save();
          
          // Update wallet balance
          await this.syncWalletBalance(wallet._id);
          
          // Create corresponding journal entry
          const organization = await Organization.findById(organizationId);
          
          // Find the general journal
          const journal = await Journal.findOne({
            organizationId,
            type: 'general'
          });
          
          if (journal) {
            await this.createJournalEntryForIncomingTransaction(
              transaction._id,
              journal._id,
              'Incoming Stabulum transaction'
            );
          }
        }
      }
      
      return relevantEvents.length;
    } catch (error) {
      console.error('Error monitoring incoming Stabulum transactions:', error);
      throw error;
    }
  }

  // Create journal entry for incoming transaction
  async createJournalEntryForIncomingTransaction(transactionId, journalId, description) {
    try {
      const transaction = await StabulumTransaction.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }
      
      // Get organization's chart of accounts
      const organization = await Organization.findById(transaction.organizationId);
      
      // Find receiving wallet account
      const receivingWallet = await StabulumWallet.findOne({
        organizationId: transaction.organizationId,
        address: transaction.toAddress
      });
      
      if (!receivingWallet) {
        throw new Error('Receiving wallet not found');
      }
      
      const stabulumAssetAccount = await ChartOfAccounts.findOne({
        organizationId: transaction.organizationId,
        stabulumLinked: true,
        stabulumAddress: transaction.toAddress
      });
      
      // Default to unclassified revenue
      const revenueAccount = await ChartOfAccounts.findOne({
        organizationId: transaction.organizationId,
        type: 'revenue',
        subtype: 'unclassified'
      });
      
      // Create journal entry
      const journalEntry = new JournalEntry({
        organizationId: transaction.organizationId,
        journalId,
        entryNumber: `STBL-IN-${Date.now()}`,
        date: transaction.timestamp,
        description: description || `Incoming Stabulum Transaction`,
        reference: transaction.transactionHash,
        status: 'posted',
        createdBy: null, // System-generated
        createdAt: new Date(),
        updatedAt: new Date(),
        postingDate: new Date(),
        hasAttachments: false,
        stabulumTransactionHash: transaction.transactionHash,
        stabulumTransactionBlockHeight: transaction.blockHeight,
        stabulumTransactionConfirmations: transaction.confirmations
      });
      
      await journalEntry.save();
      
      // Create journal lines for double-entry accounting
      // Debit the Stabulum wallet account
      const debitLine = new JournalLine({
        journalEntryId: journalEntry._id,
        lineNumber: 1,
        accountId: stabulumAssetAccount._id,
        description: `Received in Stabulum wallet: ${transaction.toAddress}`,
        debit: transaction.amount,
        credit: 0,
        stabulumAmount: transaction.amount,
        stabulumConfirmed: true
      });
      
      await debitLine.save();
      
      // Credit the revenue account (or other appropriate account)
      const creditLine = new JournalLine({
        journalEntryId: journalEntry._id,
        lineNumber: 2,
        accountId: revenueAccount._id,
        description: `Incoming payment via Stabulum`,
        debit: 0,
        credit: transaction.amount,
        stabulumAmount: transaction.amount,
        stabulumConfirmed: true
      });
      
      await creditLine.save();
      
      // Update transaction with journal entry reference
      transaction.journalEntryId = journalEntry._id;
      await transaction.save();
      
      return journalEntry;
    } catch (error) {
      console.error('Error creating journal entry for incoming Stabulum transaction:', error);
      throw error;
    }
  }
}

module.exports = new StabulumService();
