// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
  // Get token from header
  const token = req.header('x-auth-token');

  // Check if no token
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user by ID
    const user = await User.findById(decoded.user.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token, user not found' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ message: 'User account is inactive' });
    }
    
    // Add user data to request
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Organization = require('../models/Organization');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, twoFactorToken } = req.body;

    try {
      // Find user by email
      let user = await User.findOne({ email });

      if (!user) {
        return res
          .status(400)
          .json({ message: 'Invalid credentials' });
      }
      
      if (!user.isActive) {
        return res
          .status(401)
          .json({ message: 'Account is inactive. Please contact your administrator.' });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.passwordHash);

      if (!isMatch) {
        return res
          .status(400)
          .json({ message: 'Invalid credentials' });
      }
      
      // Check 2FA if enabled
      if (user.twoFactorEnabled) {
        if (!twoFactorToken) {
          return res.status(200).json({ 
            requireTwoFactor: true,
            userId: user.id,
            message: 'Two-factor authentication required'
          });
        }
        
        const verified = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: twoFactorToken
        });
        
        if (!verified) {
          return res.status(400).json({ 
            message: 'Invalid two-factor authentication code' 
          });
        }
      }
      
      // Update last login timestamp
      user.lastLogin = Date.now();
      await user.save();

      // Create and return JWT
      const payload = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          organization: user.organization
        }
      };

      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '12h' },
        (err, token) => {
          if (err) throw err;
          res.json({ token });
        }
      );
    } catch (err) {
      console.error('Login error:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET api/auth/user
// @desc    Get user data
// @access  Private
router.get('/user', auth, async (req, res) => {
  try {
    // Return user without password
    const user = await User.findById(req.user.id)
      .select('-passwordHash -salt -twoFactorSecret')
      .populate('organization', 'name industry settings');
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching user data:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/register
// @desc    Register a new user (admin only)
// @access  Private/Admin
router.post(
  '/register',
  [
    auth,
    [
      check('email', 'Please include a valid email').isEmail(),
      check('password', 'Please enter a password with 6 or more characters')
        .isLength({ min: 6 }),
      check('firstName', 'First name is required').not().isEmpty(),
      check('lastName', 'Last name is required').not().isEmpty(),
      check('role', 'Role is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, role } = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ email });

      if (user) {
        return res
          .status(400)
          .json({ message: 'User already exists' });
      }

      // Create salt and hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create new user
      user = new User({
        email,
        passwordHash,
        salt,
        firstName,
        lastName,
        role,
        organization: req.user.organization, // Same org as admin
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isActive: true
      });

      await user.save();

      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      });
    } catch (err) {
      console.error('Registration error:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   POST api/auth/register-organization
// @desc    Register a new organization with admin user
// @access  Public (initial setup)
router.post(
  '/register-organization',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters')
      .isLength({ min: 6 }),
    check('firstName', 'First name is required').not().isEmpty(),
    check('lastName', 'Last name is required').not().isEmpty(),
    check('organizationName', 'Organization name is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      organizationName,
      industry,
      address,
      taxId,
      fiscalYearStart
    } = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ email });

      if (user) {
        return res
          .status(400)
          .json({ message: 'User already exists' });
      }
      
      // Create new organization
      const organization = new Organization({
        name: organizationName,
        industry: industry || 'Other',
        address: address || {},
        taxId: taxId || '',
        fiscalYearStart: fiscalYearStart || new Date(new Date().getFullYear(), 0, 1), // Jan 1 current year
        timezone: 'UTC',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        settings: {
          currency: 'USD',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h'
        }
      });
      
      await organization.save();

      // Create salt and hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create admin user
      user = new User({
        email,
        passwordHash,
        salt,
        firstName,
        lastName,
        role: 'admin', // First user is always admin
        organization: organization._id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isActive: true
      });

      await user.save();
      
      // Create and return JWT
      const payload = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          organization: user.organization
        }
      };

      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '12h' },
        (err, token) => {
          if (err) throw err;
          res.status(201).json({
            message: 'Organization and admin user created successfully',
            token,
            organization: {
              id: organization._id,
              name: organization.name
            }
          });
        }
      );
    } catch (err) {
      console.error('Organization registration error:', err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   POST api/auth/setup-2fa
// @desc    Setup two-factor authentication
// @access  Private
router.post('/setup-2fa', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Generate new secret
    const secret = speakeasy.generateSecret({
      name: `Accounting Max (${user.email})`
    });
    
    // Update user with new secret but don't enable 2FA yet
    user.twoFactorSecret = secret.base32;
    await user.save();
    
    // Generate QR code
    qrcode.toDataURL(secret.otpauth_url, (err, dataURL) => {
      if (err) {
        console.error('QR code generation error:', err);
        return res.status(500).json({ message: 'Error generating QR code' });
      }
      
      res.json({
        message: 'Two-factor authentication setup initiated',
        secret: secret.base32,
        qrCode: dataURL
      });
    });
  } catch (err) {
    console.error('2FA setup error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/verify-2fa
// @desc    Verify and enable two-factor authentication
// @access  Private
router.post('/verify-2fa', auth, async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }
    
    const user = await User.findById(req.user.id);
    
    // Verify token with secret
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });
    
    if (!verified) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }
    
    // Enable 2FA
    user.twoFactorEnabled = true;
    await user.save();
    
    res.json({
      message: 'Two-factor authentication enabled successfully'
    });
  } catch (err) {
    console.error('2FA verification error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/disable-2fa
// @desc    Disable two-factor authentication
// @access  Private
router.post('/disable-2fa', auth, async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ 
        message: 'Verification code and password are required' 
      });
    }
    
    const user = await User.findById(req.user.id);
    
    // Verify password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid password' });
    }
    
    // Verify token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });
    
    if (!verified) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }
    
    // Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = '';
    await user.save();
    
    res.json({
      message: 'Two-factor authentication disabled successfully'
    });
  } catch (err) {
    console.error('2FA disabling error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/change-password
// @desc    Change user password
// @access  Private
router.post(
  '/change-password',
  [
    auth,
    [
      check('currentPassword', 'Current password is required').exists(),
      check('newPassword', 'New password must be at least 6 characters').isLength({ min: 6 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    try {
      const user = await User.findById(req.user.id);
      
      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      
      // Update password
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(newPassword, salt);
      user.salt = salt;
      user.updatedAt = Date.now();
      
      await user.save();
      
      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      console.error('Password change error:', err.message);
      res.status(500).send('Server error');
    }
  }
);

module.exports = router;
