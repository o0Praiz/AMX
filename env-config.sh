// .env.example - Environment variables template
// Rename to .env and fill in your specific values

# Node Environment
NODE_ENV=development

# Server Configuration
PORT=5000
HOST=localhost

# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/accountingmax
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=adminpassword

# Security
JWT_SECRET=your_jwt_secret_key_here
ENCRYPTION_SALT=your_encryption_salt_here
ENCRYPTION_IV=your_encryption_iv_here

# Stabulum Integration
STABULUM_RPC_URL=https://stabulum-rpc.example.com
STABULUM_CONTRACT_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
STABULUM_API_KEY=your_stabulum_api_key
STABULUM_API_URL=https://api.stabulum.example.com

# Initial Setup (set to 'true' to perform initial setup)
INITIAL_SETUP=true
INITIAL_ORG_NAME=My Organization

# Admin User (required if INITIAL_SETUP=true)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=StrongPassword123!
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=User

# Email Configuration (for password reset, notifications)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=notifications@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=Accounting Max <notifications@example.com>

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/app.log

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760  # 10MB in bytes

# API Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX=100  # requests per window

# Session Configuration
SESSION_SECRET=your_session_secret_here
SESSION_EXPIRY=43200000  # 12 hours in milliseconds

# Default Password Policies
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBER=true
PASSWORD_REQUIRE_SYMBOL=true
