# BU TicketChain

A blockchain-backed ticketing system for Boston University events. Each ticket is represented as an on-chain NFT (ERC-1155), ensuring transparent ownership and preventing fraud.

![BU TicketChain](https://img.shields.io/badge/Built%20with-Solidity%20%7C%20React%20%7C%20Node.js-blue)

## 🎫 Features

- **Blockchain-Verified Tickets**: Each ticket is an ERC-1155 NFT with verifiable on-chain ownership
- **Atomic Transactions**: Payment and ticket minting happen in a single transaction
- **Role-Based Access**: Admin, User, and Verifier roles with appropriate permissions
- **Discount System**: BU students and faculty receive discounted pricing
- **QR Code Verification**: Verifiers can scan QR codes to validate tickets at venue entry
- **Refund Support**: Tickets can be refunded before event start time
- **Transfer Support**: Ticket holders can transfer tickets to other users

## 📁 Project Structure

```
bu-ticketchain/
├── contracts/          # Solidity smart contracts (Hardhat)
│   ├── contracts/      # Smart contract source files
│   ├── scripts/        # Deployment scripts
│   └── test/           # Contract tests
├── backend/            # Node.js API server (Fastify)
│   ├── src/
│   │   ├── routes/     # API endpoints
│   │   ├── services/   # Business logic & blockchain listener
│   │   └── lib/        # Utilities (Prisma, blockchain, auth)
│   └── prisma/         # Database schema
├── frontend/           # React SPA (Vite)
│   └── src/
│       ├── pages/      # Route pages
│       ├── components/ # Reusable components
│       ├── stores/     # Zustand state management
│       └── lib/        # API & blockchain utilities
└── docker-compose.yml  # PostgreSQL setup
```

## Start instructions

### Prerequisites

- Node.js, pnpm, docker, and metamask extension

### 1. Install Dependencies

```bash

npm install -g pnpm

pnpm install
```

### 2. Start PostgreSQL

```bash
# Start the database
pnpm db:up

# Run migrations
pnpm db:migrate
```

### 3. Deploy Smart Contracts (Local)

```bash
# In terminal 1: Start local Hardhat node
cd contracts
pnpm node

# In terminal 2: Deploy contracts
pnpm contracts:deploy:local
```

Note the deployed contract address from the output.

### 4. Configure Environment

```bash
# Backend
cp backend/env.example backend/.env
# Edit .env with your contract address and other settings

# Frontend (optional)
# Create frontend/.env with:
# VITE_CONTRACT_ADDRESS=<your-contract-address>
```

### 5. Start Development Servers

```bash
# Terminal 1: Backend
pnpm backend:dev

# Terminal 2: Frontend
pnpm frontend:dev
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Tech Stack

### Smart Contracts
- **Solidity 0.8.24** - Smart contract language
- **Hardhat** - Development environment
- **OpenZeppelin** - Battle-tested contract libraries
- **ethers.js** - Ethereum library

### Backend
- **Fastify** - Fast, low-overhead web framework
- **Prisma** - Type-safe database ORM
- **PostgreSQL** - Relational database
- **JWT** - Authentication tokens
- **ethers.js** - Blockchain interaction

### Frontend
- **React 18** - UI library
- **Vite** - Build tool
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **react-router-dom** - Routing
- **qrcode.react** - QR code generation

## 📝 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login with email/password |
| GET | `/auth/me` | Get current user info |
| POST | `/auth/link-wallet` | Link MetaMask wallet |

### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/events` | List all events |
| GET | `/events/:id` | Get event details |
| POST | `/events` | Create event (admin) |
| GET | `/events/:id/stats` | Get event statistics (admin) |

### Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tickets/me` | Get user's tickets |
| POST | `/tickets/buy` | Record ticket purchase |
| POST | `/tickets/transfer` | Record ticket transfer |
| POST | `/tickets/refund` | Record ticket refund |
| POST | `/tickets/verify` | Verify ticket (verifier) |
| POST | `/tickets/mark-used` | Mark ticket as used (verifier) |

## 🧪 Testing

### Smart Contract Tests

```bash
cd contracts
pnpm test

# With coverage
pnpm test:coverage
```

### Test Coverage

The smart contract tests cover:
- ✅ Event creation and validation
- ✅ Discount eligibility management
- ✅ Ticket purchasing with correct pricing
- ✅ Preventing overselling
- ✅ Ticket transfers
- ✅ Refunds before event start
- ✅ Ticket verification and marking as used
- ✅ Admin withdrawal functionality

## Security Considerations

1. **Smart Contract**
   - Uses OpenZeppelin's battle-tested contracts
   - ReentrancyGuard for purchase/refund functions
   - Ownable for admin functions

2. **Backend**
   - JWT authentication with expiration
   - Role-based authorization
   - Input validation with Zod

3. **Frontend**
   - No sensitive data stored in local storage (except JWT)
   - MetaMask handles private key management








