# Accounting Max Installation Guide

This guide will walk you through the process of setting up Accounting Max on your local environment or server.

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v16.x or later)
- MongoDB (v5.x or later)
- Git
- npm or yarn

Additionally, for production deployments:

- Docker and Docker Compose (optional for containerized deployment)
- HTTPS certificate for secure connections

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/o0Praiz/AMX.git
cd AMX
```

### 2. Install Dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
npm run install-client
```

### 3. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your specific settings
nano .env
```

Make sure to set the following essential variables:

- `MONGO_URI`: Your MongoDB connection string
- `JWT_SECRET`: A secure random string for JWT token encryption
- `ENCRYPTION_SALT` and `ENCRYPTION_IV`: For sensitive data encryption
- `STABULUM_RPC_URL` and `STABULUM_CONTRACT_ADDRESS`: If using Stabulum integration

### 4. Initialize the Database

```bash
# Run the initialization script
npm run seed
```

This will create:
- Default organization
- Admin user
- Chart of accounts
- Default journals

### 5. Start the Development Server

```bash
# Run both server and client in development mode
npm run dev

# Or run server only
npm run server

# Or client only
npm run client
```

The server will start on `http://localhost:5000` and the client on `http://localhost:3000`.

## Production Deployment

### Using Docker

1. Configure environment variables for production in `.env`

2. Build and start Docker containers:

```bash
docker-compose up -d
```

3. The application will be available at the configured port (default: 5000)

### Manual Deployment

1. Configure environment variables for production in `.env`

2. Build the client:

```bash
npm run build-client
```

3. Start the production server:

```bash
NODE_ENV=production npm start
```

## Heroku Deployment

1. Create a Heroku account and install the Heroku CLI

2. Log in to Heroku:

```bash
heroku login
```

3. Create a new Heroku app:

```bash
heroku create accounting-max-app
```

4. Add MongoDB add-on:

```bash
heroku addons:create mongodb:standard
```

5. Set environment variables:

```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your_jwt_secret_here
# Add other necessary environment variables
```

6. Deploy to Heroku:

```bash
git push heroku main
```

7. Initialize the database:

```bash
heroku run npm run seed
```

## Stabulum Integration Setup

To enable the Stabulum stablecoin integration:

1. Set the following environment variables:

```
STABULUM_RPC_URL=https://stabulum-rpc.example.com
STABULUM_CONTRACT_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
STABULUM_API_KEY=your_stabulum_api_key
STABULUM_API_URL=https://api.stabulum.example.com
```

2. Initialize Stabulum integration:

```bash
# During organization setup, enable Stabulum
ENABLE_STABULUM=true npm run seed
```

3. Create a Stabulum wallet for the organization:

```
POST /api/stabulum/wallets
{
  "name": "Main Organization Wallet",
  "purpose": "operating"
}
```

4. Link the wallet to a Chart of Accounts entry:

```
PUT /api/accounts/:id
{
  "stabulumLinked": true,
  "stabulumAddress": "wallet_address_here"
}
```

## First-Time Login

After setup, you can log in with the default admin credentials:

- Email: The email specified in your `.env` file under `ADMIN_EMAIL`
- Password: The password specified in your `.env` file under `ADMIN_PASSWORD`

**Important**: Change the default password immediately after your first login.

## Troubleshooting

### Database Connection Issues

If you experience issues connecting to MongoDB:

1. Verify your MongoDB connection string in the `.env` file
2. Ensure MongoDB service is running: `sudo systemctl status mongodb`
3. Check MongoDB logs: `sudo journalctl -u mongodb`

### API Errors

If the API returns errors:

1. Check the server logs for detailed error messages
2. Verify all required environment variables are set
3. Check MongoDB connection status
4. Ensure all dependencies are installed correctly

### Stabulum Integration Issues

If Stabulum integration isn't working:

1. Verify the Stabulum RPC URL is accessible
2. Check the Stabulum contract address is correct
3. Ensure your API key has sufficient permissions
4. Check blockchain network status

## Security Considerations

For production deployments, ensure:

1. HTTPS is properly configured
2. JWT_SECRET is a strong, unique value
3. Rate limiting is enabled
4. Firewall rules restrict access to MongoDB
5. Regular database backups are configured
6. System and npm packages are regularly updated

## Getting Help

If you need assistance:

- GitHub Issues: Create an issue in the project repository
- Documentation: Refer to the API documentation for endpoint details
- Contact: support@accountingmax.com

## Next Steps

After installation:

1. Set up organization details and fiscal year settings
2. Customize the Chart of Accounts
3. Add users with appropriate roles
4. Configure Stabulum integration
5. Create customers and vendors
6. Import opening balances
