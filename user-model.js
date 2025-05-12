// models/User.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  salt: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'accountant', 'manager', 'viewer'],
    default: 'viewer'
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String
  },
  passwordResetToken: {
    type: String
  },
  passwordResetExpires: {
    type: Date
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    language: {
      type: String,
      default: 'en-US'
    },
    dateFormat: {
      type: String
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h']
    },
    defaultDashboard: {
      type: Schema.Types.ObjectId,
      ref: 'Dashboard'
    }
  },
  permissions: {
    invoices: {
      view: {
        type: Boolean,
        default: true
      },
      create: {
        type: Boolean,
        default: false
      },
      edit: {
        type: Boolean,
        default: false
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    bills: {
      view: {
        type: Boolean,
        default: true
      },
      create: {
        type: Boolean,
        default: false
      },
      edit: {
        type: Boolean,
        default: false
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    chartOfAccounts: {
      view: {
        type: Boolean,
        default: true
      },
      create: {
        type: Boolean,
        default: false
      },
      edit: {
        type: Boolean,
        default: false
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    journalEntries: {
      view: {
        type: Boolean,
        default: true
      },
      create: {
        type: Boolean,
        default: false
      },
      edit: {
        type: Boolean,
        default: false
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    reports: {
      view: {
        type: Boolean,
        default: true
      },
      export: {
        type: Boolean,
        default: false
      }
    },
    settings: {
      view: {
        type: Boolean,
        default: false
      },
      edit: {
        type: Boolean,
        default: false
      }
    },
    users: {
      view: {
        type: Boolean,
        default: false
      },
      create: {
        type: Boolean,
        default: false
      },
      edit: {
        type: Boolean,
        default: false
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    stabulum: {
      view: {
        type: Boolean,
        default: true
      },
      transact: {
        type: Boolean,
        default: false
      }
    }
  }
});

// Pre-save middleware
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Set permissions based on role
UserSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'admin':
        // Admin has all permissions
        for (const section in this.permissions) {
          for (const action in this.permissions[section]) {
            this.permissions[section][action] = true;
          }
        }
        break;
        
      case 'accountant':
        // Accountant can do most accounting functions
        this.permissions.invoices = {
          view: true,
          create: true,
          edit: true,
          delete: false
        };
        
        this.permissions.bills = {
          view: true,
          create: true,
          edit: true,
          delete: false
        };
        
        this.permissions.chartOfAccounts = {
          view: true,
          create: true,
          edit: true,
          delete: false
        };
        
        this.permissions.journalEntries = {
          view: true,
          create: true,
          edit: true,
          delete: false
        };
        
        this.permissions.reports = {
          view: true,
          export: true
        };
        
        this.permissions.settings = {
          view: true,
          edit: false
        };
        
        this.permissions.users = {
          view: false,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.stabulum = {
          view: true,
          transact: true
        };
        break;
        
      case 'manager':
        // Manager can view everything and make some changes
        this.permissions.invoices = {
          view: true,
          create: true,
          edit: true,
          delete: false
        };
        
        this.permissions.bills = {
          view: true,
          create: true,
          edit: true,
          delete: false
        };
        
        this.permissions.chartOfAccounts = {
          view: true,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.journalEntries = {
          view: true,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.reports = {
          view: true,
          export: true
        };
        
        this.permissions.settings = {
          view: true,
          edit: false
        };
        
        this.permissions.users = {
          view: true,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.stabulum = {
          view: true,
          transact: false
        };
        break;
        
      case 'viewer':
        // Viewer can only view most data
        this.permissions.invoices = {
          view: true,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.bills = {
          view: true,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.chartOfAccounts = {
          view: true,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.journalEntries = {
          view: true,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.reports = {
          view: true,
          export: false
        };
        
        this.permissions.settings = {
          view: false,
          edit: false
        };
        
        this.permissions.users = {
          view: false,
          create: false,
          edit: false,
          delete: false
        };
        
        this.permissions.stabulum = {
          view: true,
          transact: false
        };
        break;
    }
  }
  
  next();
});

// Static method to create a new user
UserSchema.statics.createUser = async function(userData, password) {
  // Generate salt and hash password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);
  
  // Create new user with hashed password
  const user = new this({
    ...userData,
    passwordHash,
    salt
  });
  
  await user.save();
  return user;
};

// Static method to authenticate user
UserSchema.statics.authenticate = async function(email, password) {
  // Find user by email
  const user = await this.findOne({ email, isActive: true });
  
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  // Check password
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }
  
  // Update last login time
  user.lastLogin = new Date();
  await user.save();
  
  return user;
};

// Instance method to generate JWT token
UserSchema.methods.generateAuthToken = function() {
  const payload = {
    user: {
      id: this._id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      role: this.role,
      organization: this.organization
    }
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
};

// Instance method to generate password reset token
UserSchema.methods.generatePasswordResetToken = async function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  // Token expires in 1 hour
  this.passwordResetExpires = Date.now() + 3600000;
  
  await this.save();
  
  return resetToken;
};

// Instance method to change password
UserSchema.methods.changePassword = async function(currentPassword, newPassword) {
  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, this.passwordHash);
  
  if (!isMatch) {
    throw new Error('Current password is incorrect');
  }
  
  // Generate new salt and hash
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(newPassword, salt);
  
  // Update password
  this.passwordHash = passwordHash;
  this.salt = salt;
  this.updatedAt = Date.now();
  
  // Clear any reset tokens
  this.passwordResetToken = undefined;
  this.passwordResetExpires = undefined;
  
  await this.save();
  return true;
};

// Instance method to check if user has a specific permission
UserSchema.methods.hasPermission = function(section, action) {
  // Admin always has all permissions
  if (this.role === 'admin') {
    return true;
  }
  
  // Check specific permission
  return this.permissions[section] && this.permissions[section][action] === true;
};

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('User', UserSchema);
