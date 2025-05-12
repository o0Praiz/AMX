// scripts/initialize.js
const { connectDB, closeDB } = require('../config/database');
const Organization = require('../models/Organization');
const User = require('../models/User');
const StabulumWallet = require('../models/StabulumWallet');
const stabulumService = require('../services/stabulumService');
const ChartOfAccounts = require('../models/ChartOfAccounts');

/**
 * Initialize a new organization with all required components
 * Can be run directly: node scripts/initialize.js
 * Or called programmatically from the application
 */
const initializeOrganization = async (config) => {
  try {
    console.log('🚀 Starting organization initialization...');
    
    // Use provided config or environment variables
    const {
      orgName = process.env.INITIAL_ORG_NAME || 'My Organization',
      adminEmail = process.env.ADMIN_EMAIL,
      adminPassword = process.env.ADMIN_PASSWORD,
      adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin',
      adminLastName = process.env.ADMIN_LAST_NAME || 'User',
      currency = process.env.DEFAULT_CURRENCY || 'USD',
      enableStabulum = process.env.ENABLE_STABULUM === 'true'
    } = config || {};
    
    // Validate required inputs
    if (!adminEmail || !adminPassword) {
      throw new Error('Admin email and password are required for initialization');
    }
    
    // Connect to database if not already connected
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    
    // Check if organization already exists
    const existingOrg = await Organization.findOne({ name: orgName });
    if (existingOrg) {
      console.log(`Organization "${orgName}" already exists. Skipping initialization.`);
      return { success: false, message: 'Organization already exists' };
    }
    
    // 1. Create organization
    console.log(`Creating organization: ${orgName}`);
    const organization = new Organization({
      name: orgName,
      industry: 'Finance',
      timezone: 'UTC',
      secretKey: Organization.generateSecretKey(),
      settings: {
        currency,
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        language: 'en-US',
        enableStabulumPayments: enableStabulum
      }
    });
    
    await organization.save();
    console.log('✅ Organization created successfully');
    
    // 2. Initialize chart of accounts
    console.log('Creating chart of accounts...');
    const accountsCount = await organization.initializeChartOfAccounts();
    console.log(`✅ Created ${accountsCount} default accounts`);
    
    // 3. Initialize journals
    console.log('Creating journals...');
    const journalsCount = await organization.initializeJournals();
    console.log(`✅ Created ${journalsCount} default journals`);
    
    // 4. Create admin user
    console.log(`Creating admin user: ${adminEmail}`);
    const adminUser = await User.createUser(
      {
        email: adminEmail,
        firstName: adminFirstName,
        lastName: adminLastName,
        role: 'admin',
        organization: organization._id,
        isActive: true
      },
      adminPassword
    );
    console.log('✅ Admin user created successfully');
    
    // 5. Initialize Stabulum integration if enabled
    if (enableStabulum) {
      console.log('Setting up Stabulum integration...');
      
      try {
        // Create default Stabulum wallet
        console.log('Creating default Stabulum wallet...');
        const wallet = await stabulumService.createWallet(
          organization._id,
          'Default Organization Wallet',
          'operating'
        );
        
        // Set wallet as default
        await wallet.setAsDefault();
        
        // Update organization settings
        organization.settings.defaultStabulumWalletId = wallet._id;
        organization.stabulumWalletAddress = wallet.address;
        await organization.save();
        
        // Link wallet to chart of accounts
        const stabulumAccount = await ChartOfAccounts.findOne({
          organizationId: organization._id,
          subtype: 'cryptocurrencies'
        });
        
        if (stabulumAccount) {
          stabulumAccount.stabulumLinked = true;
          stabulumAccount.stabulumAddress = wallet.address;
          await stabulumAccount.save();
        }
        
        console.log(`✅ Stabulum wallet created: ${wallet.address.substring(0, 8)}...`);
      } catch (error) {
        console.error('⚠️ Stabulum wallet creation failed:', error.message);
        console.log('Organization created, but Stabulum integration needs manual setup');
      }
    }
    
    console.log('🎉 Organization initialization completed successfully!');
    console.log('----------------------------------------------------------');
    console.log(`Organization: ${organization.name}`);
    console.log(`Admin User: ${adminUser.email}`);
    console.log('----------------------------------------------------------');
    
    return {
      success: true,
      organization,
      admin: adminUser
    };
  } catch (error) {
    console.error('❌ Organization initialization failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

// Run directly if called from command line
if (require.main === module) {
  initializeOrganization()
    .then(result => {
      if (result.success) {
        console.log('Initialization completed successfully');
      } else {
        console.error('Initialization failed:', result.error || result.message);
      }
      
      // Close database connection and exit
      closeDB().then(() => process.exit(result.success ? 0 : 1));
    })
    .catch(error => {
      console.error('Fatal initialization error:', error);
      closeDB().then(() => process.exit(1));
    });
}

module.exports = {
  initializeOrganization
};
