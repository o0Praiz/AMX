# Accounting Max API Documentation

## Overview

The Accounting Max API provides endpoints for accounting operations with Stabulum stablecoin integration. The API follows RESTful principles and uses JWT for authentication.

## Base URL

```
https://your-domain.com/api
```

For local development:

```
http://localhost:5000/api
```

## Authentication

### JWT Token

Most endpoints require authentication using JSON Web Tokens (JWT). The token should be included in the request header as follows:

```
x-auth-token: <your_jwt_token>
```

### Getting a Token

To get a JWT token, use the login endpoint:

```
POST /auth/login
```

## Endpoints

### Authentication

#### Login

```
POST /auth/login
```

Authenticate a user and get JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword",
  "twoFactorToken": "123456" // Optional, required if 2FA is enabled
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Register a New User (Admin only)

```
POST /auth/register
```

Create a new user account (requires admin authentication).

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "firstName": "John",
  "lastName": "Doe",
  "role": "accountant" // One of: admin, accountant, manager, viewer
}
```

**Response:**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "60f1a5b3b9e1c82b3cda1234",
    "email": "newuser@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "accountant"
  }
}
```

#### Register Organization with Admin

```
POST /auth/register-organization
```

Create a new organization with admin user account.

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "securepassword",
  "firstName": "Admin",
  "lastName": "User",
  "organizationName": "My Company",
  "industry": "Technology",
  "address": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94105",
    "country": "United States"
  }
}
```

**Response:**
```json
{
  "message": "Organization and admin user created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "organization": {
    "id": "60f1a5b3b9e1c82b3cda5678",
    "name": "My Company"
  }
}
```

#### Get Current User

```
GET /auth/user
```

Get information about the authenticated user.

**Response:**
```json
{
  "_id": "60f1a5b3b9e1c82b3cda1234",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "accountant",
  "organization": {
    "_id": "60f1a5b3b9e1c82b3cda5678",
    "name": "My Company",
    "industry": "Technology",
    "settings": {
      "currency": "USD",
      "dateFormat": "MM/DD/YYYY",
      "timeFormat": "12h"
    }
  }
}
```

### Chart of Accounts

#### Get Chart of Accounts

```
GET /accounts
```

Get the organization's chart of accounts.

**Query Parameters:**
- `type` - Filter by account type (asset, liability, equity, revenue, expense)
- `includeInactive` - Include inactive accounts (true/false)
- `includeArchived` - Include archived accounts (true/false)
- `search` - Search by account number, name, or description

**Response:**
```json
[
  {
    "_id": "60f1a5b3b9e1c82b3cda9876",
    "accountNumber": "1000",
    "name": "Cash",
    "type": "asset",
    "subtype": "cash",
    "description": "Cash on hand",
    "isActive": true,
    "balance": {
      "amount": 10000,
      "lastUpdated": "2025-05-10T14:30:00.000Z"
    }
  },
  {
    "_id": "60f1a5b3b9e1c82b3cda9877",
    "accountNumber": "1100",
    "name": "Accounts Receivable",
    "type": "asset",
    "subtype": "accounts-receivable",
    "description": "Amounts owed by customers",
    "isActive": true,
    "balance": {
      "amount": 25000,
      "lastUpdated": "2025-05-10T14:30:00.000Z"
    }
  }
]
```

#### Create Account

```
POST /accounts
```

Create a new account.

**Request Body:**
```json
{
  "name": "Office Supplies",
  "type": "expense",
  "subtype": "supplies",
  "description": "Office supplies and consumables",
  "accountNumber": "5400" // Optional, will be auto-generated if not provided
}
```

**Response:**
```json
{
  "_id": "60f1a5b3b9e1c82b3cda9880",
  "accountNumber": "5400",
  "name": "Office Supplies",
  "type": "expense",
  "subtype": "supplies",
  "description": "Office supplies and consumables",
  "isActive": true,
  "balance": {
    "amount": 0,
    "lastUpdated": "2025-05-11T10:15:00.000Z"
  }
}
```

### Journals and Journal Entries

#### Get Journal Entries

```
GET /journals/:id/entries
```

Get entries for a specific journal.

**Path Parameters:**
- `id` - Journal ID

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Number of results per page (default: 25)
- `status` - Filter by status (draft, posted, reconciled, reversed, voided)
- `startDate` - Filter by date range start (YYYY-MM-DD)
- `endDate` - Filter by date range end (YYYY-MM-DD)

**Response:**
```json
{
  "entries": [
    {
      "_id": "60f1a5b3b9e1c82b3cdb1234",
      "entryNumber": "GEN-2505-00001",
      "date": "2025-05-10T00:00:00.000Z",
      "description": "Initial deposit",
      "status": "posted",
      "createdBy": {
        "_id": "60f1a5b3b9e1c82b3cda1234",
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  ],
  "total": 45,
  "pages": 2,
  "currentPage": 1
}
```

#### Create Journal Entry

```
POST /journal-entries
```

Create a new journal entry.

**Request Body:**
```json
{
  "journalId": "60f1a5b3b9e1c82b3cdb5678",
  "date": "2025-05-11",
  "description": "Equipment purchase",
  "reference": "INV-12345",
  "status": "draft",
  "lines": [
    {
      "accountId": "60f1a5b3b9e1c82b3cda9876", // Asset account (Equipment)
      "description": "Purchase of equipment",
      "debit": 5000,
      "credit": 0
    },
    {
      "accountId": "60f1a5b3b9e1c82b3cda9875", // Cash account
      "description": "Payment for equipment",
      "debit": 0,
      "credit": 5000
    }
  ]
}
```

**Response:**
```json
{
  "journalEntry": {
    "_id": "60f1a5b3b9e1c82b3cdb1235",
    "entryNumber": "GEN-2505-00002",
    "date": "2025-05-11T00:00:00.000Z",
    "description": "Equipment purchase",
    "reference": "INV-12345",
    "status": "draft"
  },
  "lines": [
    {
      "_id": "60f1a5b3b9e1c82b3cdb1236",
      "accountId": {
        "_id": "60f1a5b3b9e1c82b3cda9876",
        "accountNumber": "1500",
        "name": "Equipment"
      },
      "description": "Purchase of equipment",
      "debit": 5000,
      "credit": 0
    },
    {
      "_id": "60f1a5b3b9e1c82b3cdb1237",
      "accountId": {
        "_id": "60f1a5b3b9e1c82b3cda9875",
        "accountNumber": "1000",
        "name": "Cash"
      },
      "description": "Payment for equipment",
      "debit": 0,
      "credit": 5000
    }
  ]
}
```

### Invoices

#### Get Invoices

```
GET /invoices
```

Get organization's invoices.

**Query Parameters:**
- `status` - Filter by status (draft, sent, partial, paid, overdue, void, unpaid)
- `customerId` - Filter by customer ID
- `startDate` - Filter by date range start (YYYY-MM-DD)
- `endDate` - Filter by date range end (YYYY-MM-DD)
- `search` - Search by invoice number, description, or reference
- `page` - Page number (default: 1)
- `limit` - Number of results per page (default: 25)

**Response:**
```json
{
  "invoices": [
    {
      "_id": "60f1a5b3b9e1c82b3cdb8765",
      "invoiceNumber": "INV-2505-00001",
      "customerId": {
        "_id": "60f1a5b3b9e1c82b3cda4321",
        "name": "Acme Corp"
      },
      "date": "2025-05-01T00:00:00.000Z",
      "dueDate": "2025-05-31T00:00:00.000Z",
      "status": "sent",
      "total": 1500,
      "balance": 1500
    }
  ],
  "pagination": {
    "total": 38,
    "pages": 2,
    "page": 1,
    "limit": 25
  }
}
```

#### Create Invoice

```
POST /invoices
```

Create a new invoice.

**Request Body:**
```json
{
  "customerId": "60f1a5b3b9e1c82b3cda4321",
  "date": "2025-05-11",
  "dueDate": "2025-05-25",
  "items": [
    {
      "description": "Consulting Services",
      "quantity": 10,
      "unitPrice": 150,
      "accountId": "60f1a5b3b9e1c82b3cda9878", // Revenue account
      "taxRate": 7
    }
  ],
  "description": "Consulting services for May 2025",
  "stabulumPaymentEnabled": true
}
```

**Response:**
```json
{
  "bill": {
    "_id": "60f1a5b3b9e1c82b3cdb8766",
    "invoiceNumber": "INV-2505-00002",
    "customerId": {
      "_id": "60f1a5b3b9e1c82b3cda4321",
      "name": "Acme Corp"
    },
    "date": "2025-05-11T00:00:00.000Z",
    "dueDate": "2025-05-25T00:00:00.000Z",
    "status": "draft",
    "total": 1605,
    "subtotal": 1500,
    "taxTotal": 105,
    "balance": 1605,
    "stabulumPaymentEnabled": true
  },
  "items": [
    {
      "_id": "60f1a5b3b9e1c82b3cdb8767",
      "description": "Consulting Services",
      "quantity": 10,
      "unitPrice": 150,
      "amount": 1500,
      "taxRate": 7,
      "taxAmount": 105,
      "accountId": {
        "_id": "60f1a5b3b9e1c82b3cda9878",
        "accountNumber": "4000",
        "name": "Services Revenue"
      }
    }
  ]
}
```

### Bills

#### Get Bills

```
GET /bills
```

Get organization's bills.

**Query Parameters:**
- Similar to invoices endpoint

**Response:**
```json
{
  "bills": [
    {
      "_id": "60f1a5b3b9e1c82b3cdb9876",
      "billNumber": "BILL-2505-00001",
      "vendorId": {
        "_id": "60f1a5b3b9e1c82b3cda5432",
        "name": "Office Supply Co"
      },
      "date": "2025-05-05T00:00:00.000Z",
      "dueDate": "2025-05-20T00:00:00.000Z",
      "status": "received",
      "total": 850,
      "balance": 850
    }
  ],
  "pagination": {
    "total": 15,
    "pages": 1,
    "page": 1,
    "limit": 25
  }
}
```

### Reports

#### Generate Income Statement

```
GET /reports/income-statement
```

Generate income statement (profit and loss) report.

**Query Parameters:**
- `startDate` - Start date (YYYY-MM-DD, required)
- `endDate` - End date (YYYY-MM-DD, required)
- `compareWithPreviousPeriod` - Compare with previous period (true/false)
- `includeStabulumAmounts` - Include Stabulum token amounts (true/false)
- `showPercentages` - Show percentages (true/false, default: true)
- `groupBy` - Grouping level (type, subtype, account, default: type)

**Response:**
```json
{
  "title": "Income Statement",
  "subtitle": "For the period Jan 1, 2025 to May 11, 2025",
  "organizationName": "My Company",
  "currency": "USD",
  "dateGenerated": "2025-05-11T15:30:00.000Z",
  "startDate": "2025-01-01T00:00:00.000Z",
  "endDate": "2025-05-11T00:00:00.000Z",
  "revenue": {
    "items": [
      {
        "id": "services",
        "name": "Services Revenue",
        "amount": 120000
      },
      {
        "id": "product-sales",
        "name": "Product Sales",
        "amount": 80000
      }
    ],
    "total": 200000
  },
  "expenses": {
    "items": [
      {
        "id": "payroll",
        "name": "Payroll",
        "amount": 85000,
        "percentOfRevenue": 42.5
      },
      {
        "id": "rent",
        "name": "Rent",
        "amount": 25000,
        "percentOfRevenue": 12.5
      }
    ],
    "total": 150000,
    "percentOfRevenue": 75
  },
  "netIncome": {
    "amount": 50000,
    "percentOfRevenue": 25
  }
}
```

#### Generate Balance Sheet

```
GET /reports/balance-sheet
```

Generate balance sheet report.

**Query Parameters:**
- `asOfDate` - Date to generate balance sheet for (YYYY-MM-DD, required)
- `compareWithPreviousYear` - Compare with previous year (true/false)
- `includeStabulumAmounts` - Include Stabulum token amounts (true/false)
- `groupBy` - Grouping level (type, subtype, account, default: type)

**Response:**
```json
{
  "title": "Balance Sheet",
  "subtitle": "As of May 11, 2025",
  "organizationName": "My Company",
  "currency": "USD",
  "dateGenerated": "2025-05-11T15:35:00.000Z",
  "asOfDate": "2025-05-11T00:00:00.000Z",
  "assets": {
    "items": [
      {
        "id": "cash",
        "name": "Cash and Cash Equivalents",
        "amount": 125000
      },
      {
        "id": "accounts-receivable",
        "name": "Accounts Receivable",
        "amount": 75000
      }
    ],
    "total": 250000
  },
  "liabilities": {
    "items": [
      {
        "id": "accounts-payable",
        "name": "Accounts Payable",
        "amount": 35000
      },
      {
        "id": "loans",
        "name": "Loans Payable",
        "amount": 65000
      }
    ],
    "total": 100000
  },
  "equity": {
    "items": [
      {
        "id": "retained-earnings",
        "name": "Retained Earnings",
        "amount": 150000
      }
    ],
    "total": 150000
  },
  "liabilitiesAndEquity": {
    "total": 250000
  },
  "balanced": true
}
```

### Stabulum Integration

#### Get Stabulum Wallets

```
GET /stabulum/wallets
```

Get organization's Stabulum wallets.

**Response:**
```json
[
  {
    "_id": "60f1a5b3b9e1c82b3cdbabcd",
    "name": "Operating Wallet",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "balance": 5000,
    "lastSynced": "2025-05-11T15:00:00.000Z",
    "isDefault": true,
    "purpose": "operating"
  }
]
```

#### Create Transaction

```
POST /stabulum/transactions
```

Create a new Stabulum transaction.

**Request Body:**
```json
{
  "walletId": "60f1a5b3b9e1c82b3cdbabcd",
  "toAddress": "0xabcdef1234567890abcdef1234567890abcdef12",
  "amount": 1250,
  "notes": "Payment to vendor",
  "relatedDocumentType": "bill",
  "relatedDocumentId": "60f1a5b3b9e1c82b3cdb9876"
}
```

**Response:**
```json
{
  "_id": "60f1a5b3b9e1c82b3cdbef01",
  "transactionHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "fromAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "toAddress": "0xabcdef1234567890abcdef1234567890abcdef12",
  "amount": 1250,
  "status": "confirmed",
  "confirmations": 5,
  "transactionType": "payment",
  "relatedDocumentType": "bill",
  "relatedDocumentId": "60f1a5b3b9e1c82b3cdb9876",
  "createdAt": "2025-05-11T15:45:00.000Z",
  "fee": 0.05
}
```

## Error Responses

The API uses standard HTTP status codes for errors:

- `400 Bad Request` - The request was invalid or cannot be processed
- `401 Unauthorized` - Authentication is required or the token is invalid
- `403 Forbidden` - The authenticated user doesn't have permission
- `404 Not Found` - The requested resource doesn't exist
- `500 Internal Server Error` - An error occurred on the server

Error response format:

```json
{
  "message": "Error message details"
}
```

## Rate Limiting

The API implements rate limiting to protect against abuse. You may receive a `429 Too Many Requests` status code if you exceed the limits.

## Need Help?

For additional help, contact the support team at support@accountingmax.com.
