# Secure Vote API

Node.js + Express backend for a blockchain-secured voting system. Single application, no microservices.

## Features

- RESTful API: authentication, vote submission, tallying, audit/verification
- Blockchain integration: stores **cryptographic vote hashes only** (not raw ballot data)
- Simulated permissioned ledger (default) or Ethereum private chain adapter
- Input validation via `express-validator`
- Rate limiting on authentication endpoints
- Plain-English error messages for voters
- Winston logging with timestamps for every vote and blockchain commit
- Environment-based configuration via `.env`
- Health check at `GET /health`

## Quick Start

```bash
cd voting-api
cp .env.example .env
npm install
npm run seed    # optional — auto-seeds on first start if empty
npm start
```

API runs at `http://localhost:3000`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| POST | `/api/auth/login` | Voter authentication (returns JWT) |
| GET | `/api/votes/candidates` | List ballot candidates |
| POST | `/api/votes` | Submit a vote (requires JWT) |
| GET | `/api/tally` | Current vote counts |
| GET | `/api/audit/summary` | Election audit overview |
| GET | `/api/audit/verify/code/:code` | Verify by confirmation code |
| GET | `/api/audit/verify/transaction/:txHash` | Verify by blockchain tx hash |
| POST | `/api/audit/verify/hash` | Verify vote hash on chain |

## Test Voters (after seed)

| Voter ID | Name | Date of Birth |
|----------|------|---------------|
| VOTER001 | Jane Smith | 1975-03-15 |
| VOTER002 | Robert Johnson | 1982-07-22 |
| VOTER003 | Maria Garcia | 1990-11-08 |

## Example: Authenticate and Vote

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"voterId":"VOTER001","fullName":"Jane Smith","dateOfBirth":"1975-03-15"}'

# Submit vote (replace TOKEN)
curl -X POST http://localhost:3000/api/votes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"candidateId":"c1"}'

# Verify receipt
curl http://localhost:3000/api/audit/verify/code/XXXX-XXXX-XXXX
```

## Configuration

See `.env.example` for all options:

- `DATABASE_URL` — SQLite file path
- `JWT_SECRET` — signing key for voter sessions
- `BLOCKCHAIN_PROVIDER` — `simulated` or `ethereum`
- `BLOCKCHAIN_NODE_URL` — Ethereum JSON-RPC endpoint (when using `ethereum`)

## Project Structure

```
src/
├── config/          # Environment configuration
├── db/              # SQLite database
├── data/            # Seed script
├── middleware/      # Auth, validation, rate limiting, errors
├── routes/          # auth, vote, tally, audit
├── services/        # Business logic + blockchain adapters
├── utils/           # Logger, crypto, errors
├── app.js           # Express app setup
└── server.js        # Entry point
```

## Blockchain

By default, votes are committed to a **simulated permissioned ledger** — a hash-linked chain stored locally, mirroring Hyperledger Fabric workflows without external infrastructure.

Set `BLOCKCHAIN_PROVIDER=ethereum` and point `BLOCKCHAIN_NODE_URL` at a private Geth/Hardhat node to use real on-chain storage.

Only the SHA-256 hash of the vote payload is written to the chain. The confirmation code and transaction hash are returned to the voter as proof.
