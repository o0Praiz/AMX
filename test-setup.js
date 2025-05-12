// tests/setup.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');

// Setup MongoDB Memory Server
let mongoServer;

// Setup functions
const dbConnect = async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
};

const dbDisconnect = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
};

const dbClear = async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

// Generate test JWT token
const generateAuthToken = (user) => {
  const payload = {
    user: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organization: user.organization
    }
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'test_secret_key',
    { expiresIn: '1h' }
  );
};

// Create a test organization
const createTestOrganization = async () => {
  const Organization = mongoose.model('Organization');
  
  const organization = new Organization({
    name: 'Test Organization',
    industry: 'Technology',
    timezone: 'UTC',
    address: {
      country: 'United States'
    },
    settings: {
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h'
    }
  });
  
  await organization.save();
  return organization;
};

// Create a test user
const createTestUser = async (organization, role = 'admin') => {
  const User = mongoose.model('User');
  
  const user = new User({
    email: `test-${role}@example.com`,
    passwordHash: '$2a$12$RP0FjejrXOhIOv1LK6Thuu.uy.xUWBNH1G3txdv6xEyQJZI989CWC', // "password123"
    salt: '$2a$12$RP0FjejrXOhIOv1LK6Thuu',
    firstName: 'Test',
    lastName: 'User',
    role,
    organization: organization._id,
    isActive: true
  });
  
  await user.save();
  return user;
};

// Initialize test data
const initializeTestData = async () => {
  // Create organization
  const organization = await createTestOrganization();
  
  // Create a user for each role
  const adminUser = await createTestUser(organization, 'admin');
  const accountantUser = await createTestUser(organization, 'accountant');
  const managerUser = await createTestUser(organization, 'manager');
  const viewerUser = await createTestUser(organization, 'viewer');
  
  // Create chart of accounts
  await organization.initializeChartOfAccounts();
  
  // Create journals
  await organization.initializeJournals();
  
  return {
    organization,
    users: {
      admin: adminUser,
      accountant: accountantUser,
      manager: managerUser,
      viewer: viewerUser
    }
  };
};

// Request helpers
const authRequest = (user) => {
  const token = generateAuthToken(user);
  return request(app).set('x-auth-token', token);
};

module.exports = {
  dbConnect,
  dbDisconnect,
  dbClear,
  generateAuthToken,
  createTestOrganization,
  createTestUser,
  initializeTestData,
  authRequest
};
