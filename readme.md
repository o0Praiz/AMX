# Accounting Max (AMX)

Accounting Max is a comprehensive accounting software solution for financial businesses on the internet. It integrates with the Stabulum stablecoin to provide blockchain-powered accounting capabilities, combining traditional financial management with cryptocurrency features.

## Features

- **Double-Entry Accounting**: Complete double-entry accounting system with journal entries, general ledger, and chart of accounts
- **Stabulum Integration**: Seamless integration with Stabulum stablecoin for blockchain-based accounting
- **Invoicing**: Create, send, and track customer invoices with payment processing
- **Bill Management**: Manage vendor bills, track expenses, and schedule payments
- **Financial Reporting**: Generate income statements, balance sheets, cash flow statements, and more
- **Multi-User Access**: Role-based permissions system for teams of any size
- **Cryptocurrency Support**: Track and manage Stabulum assets alongside traditional accounting
- **Dashboard Analytics**: Real-time financial insights and performance metrics

## Technology Stack

- **Backend**: Node.js with Express
- **Database**: MongoDB
- **Frontend**: React with Material UI
- **Blockchain Integration**: Web3.js for Stabulum integration
- **Authentication**: JWT-based authentication with role-based access control
- **Deployment**: Docker containerization for easy deployment

## Getting Started

### Prerequisites

- Node.js (v16+)
- MongoDB (v5+)
- Docker and Docker Compose (for containerized deployment)
- Access to Stabulum blockchain network (optional for cryptocurrency features)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/o0Praiz/AMX.git
   cd AMX
   ```

2. Create environment configuration:
   ```
   cp .env.example .env
   ```

3. Edit the `.env` file with your specific configuration values

4. Install dependencies:
   ```
   npm install
   ```

5. Run the application:
   ```
   npm run dev
   ```

### Docker Deployment

1. Build and start the containers:
   ```
   docker-compose up -d
   ```

2. The application will be available at `http://localhost:5000`

## Project Structure

```
AMX/
├── client/               # React frontend
├── config/               # Configuration files
├── controllers/          # API controllers
├── models/               # Database models
├── routes/               # API routes
├── services/             # Business logic services
├── middleware/           # Express middleware
├── utils/                # Utility functions
├── tests/                # Test suite
├── docker/               # Docker configuration
└── public/               # Static assets
```

## API Documentation

The API documentation is available at `/api/docs` when running the application in development mode.

Key endpoints:

- `/api/auth` - Authentication
- `/api/accounts` - Chart of Accounts
- `/api/journals` - Journal management
- `/api/invoices` - Invoice management
- `/api/bills` - Bill management
- `/api/customers` - Customer management
- `/api/vendors` - Vendor management
- `/api/reports` - Financial reporting
- `/api/stabulum` - Stabulum integration

## Stabulum Integration

Accounting Max integrates with the Stabulum stablecoin to provide blockchain-powered accounting. The integration allows:

- Tracking assets in Stabulum tokens
- Sending and receiving payments in Stabulum
- Recording transactions with blockchain verification
- Reconciling accounts with blockchain data

For more information about Stabulum, visit the [Stabulum repository](https://github.com/o0Praiz/Stabulum).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Stabulum](https://github.com/o0Praiz/Stabulum) - Stablecoin integration
- [MongoDB](https://www.mongodb.com/) - Database
- [Express](https://expressjs.com/) - Web framework
- [React](https://reactjs.org/) - UI library
- [Node.js](https://nodejs.org/) - JavaScript runtime
- [Web3.js](https://web3js.readthedocs.io/) - Ethereum JavaScript API
