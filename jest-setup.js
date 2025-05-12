// jest.setup.js
// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.MONGO_URI = 'mongodb://localhost:27017/accountingmax_test';
process.env.PORT = '5001';
process.env.STABULUM_RPC_URL = 'http://localhost:8545';
process.env.STABULUM_CONTRACT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
process.env.STABULUM_API_KEY = 'test_stabulum_api_key';
process.env.STABULUM_API_URL = 'http://localhost:8546';
process.env.ENCRYPTION_SALT = 'test_encryption_salt';
process.env.ENCRYPTION_IV = '0123456789abcdef';

// Silence console logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock external services
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  })
}));

jest.mock('web3', () => {
  return jest.fn().mockImplementation(() => {
    return {
      eth: {
        Contract: jest.fn().mockImplementation(() => ({
          methods: {
            balanceOf: jest.fn().mockReturnValue({
              call: jest.fn().mockResolvedValue('5000000000000000000')
            }),
            transfer: jest.fn().mockReturnValue({
              encodeABI: jest.fn().mockReturnValue('0xencoded')
            })
          }
        })),
        accounts: {
          create: jest.fn().mockReturnValue({
            address: '0x1234567890abcdef1234567890abcdef12345678',
            privateKey: '0xprivatekey'
          }),
          signTransaction: jest.fn().mockResolvedValue({
            rawTransaction: '0xrawtransaction'
          })
        },
        getGasPrice: jest.fn().mockResolvedValue('20000000000'),
        getTransactionCount: jest.fn().mockResolvedValue(0),
        sendSignedTransaction: jest.fn().mockResolvedValue({
          transactionHash: '0xtxhash',
          blockNumber: 12345
        }),
        getTransaction: jest.fn().mockResolvedValue({
          blockNumber: 12345
        }),
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: true,
          gasUsed: 21000
        }),
        getBlock: jest.fn().mockResolvedValue({
          timestamp: Math.floor(Date.now() / 1000)
        }),
        getBlockNumber: jest.fn().mockResolvedValue(12345)
      },
      utils: {
        toWei: jest.fn().mockImplementation((amount) => amount + '000000000000000000'),
        fromWei: jest.fn().mockImplementation((amount) => amount.replace('000000000000000000', ''))
      }
    };
  });
});

// Mock qrcode
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockImplementation((url, callback) => {
    callback(null, 'data:image/png;base64,mockedQRCode');
  })
}));

// Mock speakeasy
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn().mockReturnValue({
    base32: 'ABCDEFGHIJKLMNOP',
    otpauth_url: 'otpauth://totp/Test:user@example.com?secret=ABCDEFGHIJKLMNOP&issuer=Test'
  }),
  totp: {
    verify: jest.fn().mockReturnValue(true)
  }
}));
