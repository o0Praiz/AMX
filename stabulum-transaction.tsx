import React, { useState, useEffect } from 'react';
import { 
  Check, AlertCircle, Copy, 
  ExternalLink, ArrowRight, Loader,
  Download, RefreshCw, Send, Plus
} from 'lucide-react';

const StabulumTransactionForm = () => {
  const [transactionType, setTransactionType] = useState('send');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [walletId, setWalletId] = useState('');
  const [note, setNote] = useState('');
  const [relatedDocument, setRelatedDocument] = useState('');
  const [relatedDocumentType, setRelatedDocumentType] = useState('none');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [wallets, setWallets] = useState([]);
  const [balance, setBalance] = useState(0);
  const [documents, setDocuments] = useState({
    invoices: [],
    bills: []
  });

  useEffect(() => {
    // Fetch wallets and related documents
    fetchWallets();
    fetchRelatedDocuments();
  }, []);

  useEffect(() => {
    // Update balance when wallet changes
    if (walletId) {
      const selectedWallet = wallets.find(w => w.id === walletId);
      if (selectedWallet) {
        setBalance(selectedWallet.balance);
      }
    }
  }, [walletId, wallets]);

  const fetchWallets = async () => {
    // In a real app, this would be an API call
    // Example: const response = await fetch('/api/stabulum/wallets');
    // const data = await response.json();
    
    // Mock data for demonstration
    setTimeout(() => {
      setWallets([
        { id: 'wallet1', name: 'Main Operating Wallet', address: '0x1a2b3c4d5e6f7g8h9i0j', balance: 5280.50, purpose: 'operating' },
        { id: 'wallet2', name: 'Customer Payments Wallet', address: '0xabcdef1234567890abcdef', balance: 3150.75, purpose: 'customer-payments' },
        { id: 'wallet3', name: 'Vendor Payments Wallet', address: '0x9876543210abcdef9876543210', balance: 1845.25, purpose: 'vendor-payments' }
      ]);
      // Set default wallet
      setWalletId('wallet1');
      setBalance(5280.50);
    }, 500);
  };

  const fetchRelatedDocuments = async () => {
    // In a real app, this would be an API call
    // Example: const response = await fetch('/api/documents/unpaid');
    // const data = await response.json();
    
    // Mock data for demonstration
    setTimeout(() => {
      setDocuments({
        invoices: [
          { id: 'inv1', number: 'INV-2505-00001', customerName: 'Acme Corp', amount: 1250.75, date: '2025-05-01', dueDate: '2025-05-31' },
          { id: 'inv2', number: 'INV-2505-00002', customerName: 'Globex Industries', amount: 3450.00, date: '2025-05-05', dueDate: '2025-05-20' },
          { id: 'inv3', number: 'INV-2505-00003', customerName: 'Initech LLC', amount: 875.50, date: '2025-05-10', dueDate: '2025-05-25' }
        ],
        bills: [
          { id: 'bill1', number: 'BILL-2505-00001', vendorName: 'Office Supply Co', amount: 450.25, date: '2025-05-03', dueDate: '2025-05-18' },
          { id: 'bill2', number: 'BILL-2505-00002', vendorName: 'Cloud Services Inc', amount: 1200.00, date: '2025-05-08', dueDate: '2025-05-23' },
          { id: 'bill3', number: 'BILL-2505-00003', vendorName: 'Marketing Agency', amount: 2750.00, date: '2025-05-12', dueDate: '2025-05-26' }
        ]
      });
    }, 500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // Validate form
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Please enter a valid amount');
      }

      if (transactionType === 'send' && !recipient) {
        throw new Error('Please enter a recipient address');
      }

      if (!walletId) {
        throw new Error('Please select a wallet');
      }

      // In a real app, this would be an API call to create transaction
      // Example: 
      // const response = await fetch('/api/stabulum/transactions', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     transactionType,
      //     amount: parseFloat(amount),
      //     recipient,
      //     walletId,
      //     note,
      //     relatedDocumentId: relatedDocument,
      //     relatedDocumentType: relatedDocumentType === 'none' ? null : relatedDocumentType
      //   })
      // });
      
      // if (!response.ok) throw new Error('Failed to process transaction');
      // const data = await response.json();

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Success
      setSuccess(true);
      
      // Reset form after success
      setTimeout(() => {
        setAmount('');
        setRecipient('');
        setNote('');
        setRelatedDocument('');
        setRelatedDocumentType('none');
        setSuccess(false);
      }, 3000);
      
    } catch (err) {
      setError(err.message || 'An error occurred while processing the transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSelect = (e) => {
    const value = e.target.value;
    if (!value || value === 'none') {
      setRelatedDocument('');
      return;
    }

    const [type, id] = value.split(':');
    setRelatedDocumentType(type);
    setRelatedDocument(id);

    // Auto-fill amount and recipient based on selected document
    if (type === 'bill') {
      const bill = documents.bills.find(b => b.id === id);
      if (bill) {
        setAmount(bill.amount.toString());
        // In a real app, you would fetch vendor's Stabulum address
        setRecipient('0xVendorAddress');
      }
    } else if (type === 'invoice') {
      const invoice = documents.invoices.find(i => i.id === id);
      if (invoice) {
        setAmount(invoice.amount.toString());
      }
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatAddress = (address) => {
    if (!address || address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800">Stabulum Transaction</h2>
        <p className="text-sm text-gray-600 mt-1">Send or receive Stabulum stablecoin tokens</p>
      </div>

      <div className="p-6">
        {/* Transaction Type Toggle */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
          <div className="flex rounded-md shadow-sm">
            <button
              type="button"
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-l-md focus:outline-none ${
                transactionType === 'send'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              onClick={() => setTransactionType('send')}
            >
              Send
            </button>
            <button
              type="button"
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-r-md focus:outline-none ${
                transactionType === 'receive'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              onClick={() => setTransactionType('receive')}
            >
              Receive
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Wallet Selection */}
          <div className="mb-6">
            <label htmlFor="wallet" className="block text-sm font-medium text-gray-700 mb-2">
              Select Wallet
            </label>
            <div className="mt-1">
              <select
                id="wallet"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                required
              >
                <option value="">Select a wallet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} ({formatCurrency(wallet.balance)})
                  </option>
                ))}
              </select>
            </div>
            {walletId && (
              <div className="mt-2 flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div>
                  <p className="text-xs text-gray-500">Address</p>
                  <div className="flex items-center">
                    <p className="text-sm font-mono">
                      {formatAddress(wallets.find(w => w.id === walletId)?.address)}
                    </p>
                    <button
                      type="button"
                      className="ml-2 text-gray-500 hover:text-gray-700"
                      onClick={() => copyToClipboard(wallets.find(w => w.id === walletId)?.address)}
                      title="Copy address"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Current Balance</p>
                  <p className="text-sm font-medium">{formatCurrency(balance)} STBL</p>
                </div>
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="mb-6">
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
              Amount (STBL)
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="number"
                name="amount"
                id="amount"
                className="block w-full pl-7 pr-12 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="0"
                required
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">STBL</span>
              </div>
            </div>
            {transactionType === 'send' && amount && parseFloat(amount) > balance && (
              <p className="mt-2 text-sm text-red-600">
                <AlertCircle className="inline-block h-4 w-4 mr-1" />
                Amount exceeds wallet balance
              </p>
            )}
          </div>

          {/* Recipient Address - only show for send */}
          {transactionType === 'send' && (
            <div className="mb-6">
              <label htmlFor="recipient" className="block text-sm font-medium text-gray-700 mb-2">
                Recipient Address
              </label>
              <input
                type="text"
                name="recipient"
                id="recipient"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="0x..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                required={transactionType === 'send'}
              />
            </div>
          )}

          {/* Related Document */}
          <div className="mb-6">
            <label htmlFor="relatedDocument" className="block text-sm font-medium text-gray-700 mb-2">
              Related Document (Optional)
            </label>
            <select
              id="relatedDocument"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={relatedDocument ? `${relatedDocumentType}:${relatedDocument}` : ''}
              onChange={handleDocumentSelect}
            >
              <option value="none">None</option>
              <optgroup label="Invoices">
                {documents.invoices.map((invoice) => (
                  <option key={invoice.id} value={`invoice:${invoice.id}`}>
                    {invoice.number} - {invoice.customerName} ({formatCurrency(invoice.amount)})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Bills">
                {documents.bills.map((bill) => (
                  <option key={bill.id} value={`bill:${bill.id}`}>
                    {bill.number} - {bill.vendorName} ({formatCurrency(bill.amount)})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Note */}
          <div className="mb-6">
            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
              Note (Optional)
            </label>
            <textarea
              id="note"
              rows="3"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add a note for this transaction"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            ></textarea>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex items-start">
              <Check className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Transaction successful!</p>
                <p className="text-sm mt-1">Transaction has been initiated and will be confirmed shortly.</p>
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              loading
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <Loader className="animate-spin h-5 w-5 mr-2" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center justify-center">
                {transactionType === 'send' ? (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Send Stabulum
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5 mr-2" />
                    Generate Receive Address
                  </>
                )}
              </span>
            )}
          </button>
        </form>
      </div>

      {/* Transaction Details Section */}
      <div className="p-6 bg-gray-50 border-t border-gray-200 rounded-b-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Transactions</h3>
        
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {/* Transaction items */}
          {[
            { id: 'tx1', type: 'outgoing', amount: 1250.75, date: '2025-05-10', address: '0xabcd...1234', status: 'confirmed', confirmations: 18 },
            { id: 'tx2', type: 'incoming', amount: 3450.00, date: '2025-05-08', address: '0x9876...5432', status: 'confirmed', confirmations: 25 },
            { id: 'tx3', type: 'outgoing', amount: 500.00, date: '2025-05-05', address: '0xefgh...7890', status: 'pending', confirmations: 2 }
          ].map(tx => (
            <div key={tx.id} className="flex items-center justify-between p-3 bg-white rounded-md shadow-sm">
              <div className="flex items-center">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                  tx.type === 'incoming' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                }`}>
                  {tx.type === 'incoming' ? (
                    <ArrowRight className="h-4 w-4 transform rotate-90" />
                  ) : (
                    <ArrowRight className="h-4 w-4 transform -rotate-90" />
                  )}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">
                    {tx.type === 'incoming' ? 'Received' : 'Sent'} {formatCurrency(tx.amount)}
                  </p>
                  <p className="text-xs text-gray-500">{tx.date}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center">
                  <div className={`text-xs ${
                    tx.status === 'confirmed' 
                      ? 'text-green-600 bg-green-100' 
                      : 'text-yellow-600 bg-yellow-100'
                  } px-2 py-0.5 rounded-full`}>
                    {tx.status === 'confirmed' ? (
                      <span className="flex items-center">
                        <Check className="h-3 w-3 mr-1" />
                        {tx.confirmations} confirmations
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Loader className="h-3 w-3 mr-1 animate-spin" />
                        Pending ({tx.confirmations}/12)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ml-2 text-gray-500 hover:text-gray-700"
                    title="View on blockchain"
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {tx.type === 'incoming' ? 'From: ' : 'To: '}{tx.address}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 flex items-center text-sm text-blue-600 hover:text-blue-800"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh transaction status
        </button>
      </div>
    </div>
  );
};

export default StabulumTransactionForm;