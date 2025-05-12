// config/database.js
const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const User = require('../models/User');

// Configure mongoose
mongoose.set('strictQuery', false);

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('MongoDB connected successfully');
    
    // Check if initialization is needed
    await checkInitialization();
    
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Check if system needs initial setup
const checkInitialization = async () => {
  try {
    // Check if any organizations exist
    const orgCount = await Organization.countDocuments();
    
    if (orgCount === 0) {
      console.log('No organizations found. System initialization required.');
      
      // Check if initial setup flag is set
      if (process.env.INITIAL_SETUP === 'true') {
        await performInitialSetup();
      }
    }
  } catch (error) {
    console.error('Error checking initialization status:', error);
  }
};

// Perform initial system setup with default data
const performInitialSetup = async () => {
  try {
    console.log('Performing initial setup...');
    
    // Create organization
    const organization = new Organization({
      name: process.env.INITIAL_ORG_NAME || 'Demo Organization',
      industry: 'Technology',
      timezone: 'UTC',
      secretKey: Organization.generateSecretKey(),
      address: {
        country: 'United States'
      },
      settings: {
        currency: 'USD',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        language: 'en-US'
      }
    });
    
    await organization.save();
    console.log('Created organization:', organization.name);
    
    // Initialize chart of accounts
    const accountsCount = await organization.initializeChartOfAccounts();
    console.log(`Created ${accountsCount} default accounts`);
    
    // Initialize journals
    const journalsCount = await organization.initializeJournals();
    console.log(`Created ${journalsCount} default journals`);
    
    // Create admin user
    if (
      process.env.ADMIN_EMAIL &&
      process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_FIRST_NAME &&
      process.env.ADMIN_LAST_NAME
    ) {
      const adminUser = await User.createUser(
        {
          email: process.env.ADMIN_EMAIL,
          firstName: process.env.ADMIN_FIRST_NAME,
          lastName: process.env.ADMIN_LAST_NAME,
          role: 'admin',
          organization: organization._id,
          isActive: true
        },
        process.env.ADMIN_PASSWORD
      );
      
      console.log('Created admin user:', adminUser.email);
    } else {
      console.warn('Admin user not created. Missing environment variables.');
    }
    
    console.log('Initial setup completed successfully');
  } catch (error) {
    console.error('Error during initial setup:', error);
  }
};

// Close database connection
const closeDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    return true;
  } catch (error) {
    console.error('Error closing MongoDB connection:', error.message);
    return false;
  }
};

module.exports = {
  connectDB,
  closeDB,
  performInitialSetup
};
