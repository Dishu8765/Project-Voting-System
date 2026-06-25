# Requirements Document

## Introduction

This document specifies the requirements for extending the existing blockchain voting system.
The existing system provides a 5-step voter portal (`voter-frontend/`), a Node.js/Express API (`voting-api/`), a simulated blockchain ledger, a SQLite database, and a PostgreSQL schema that has been designed but not yet wired up.

The extension adds five capabilities to the system:

1. A simulated biometric scan screen in the existing voter portal (Step 2)
2. A new React-based admin dashboard (`admin-dashboard/`)
3. Real Ganache blockchain integration replacing the simulated ledger
4. A Solidity smart contract (`Voting.sol`) for on-chain vote recording and double-vote prevention
5. Full database migration from SQLite (`better-sqlite3`) to PostgreSQL (`pg`)

---

## Glossary

- **Voter_Portal**: The existing plain HTML/JS/CSS voting application in `voter-frontend/`.
- **Biometric_Screen**: The simulated biometric scan UI inserted between identity verification and candidate selection.
- **Admin_Dashboard**: The new React 18 + Vite single-page application in `admin-dashboard/`.
- **API_Server**: The existing Node.js/Express backend in `voting-api/`.
- **Admin_Auth_Middleware**: The new Express middleware that validates admin JWTs, separate from voter JWT middleware.
- **Voting_Contract**: The Solidity smart contract (`contracts/Voting.sol`) deployed to the Ganache network.
- **Ganache_Node**: The local Ethereum test network started via the `ganache` npm package on `http://127.0.0.1:8545`.
- **Ethereum_Adapter**: The updated `voting-api/src/services/blockchain/ethereumAdapter.js` using Web3.js v4.
- **DB_Pool**: The PostgreSQL connection pool created via the `pg` npm package, replacing `better-sqlite3`.
- **Contract_Registry**: The local JSON file that persists the deployed `Voting_Contract` address across server restarts.
- **Nullifier_Hash**: A per-voter, per-election hash used by `Voting_Contract` to prevent double voting.
- **Vote_Hash**: A hash of the vote payload committed on-chain by `Voting_Contract`.
- **Admin_JWT**: A JSON Web Token issued to authenticated admin users, distinct from voter session JWTs.
- **Voter_JWT**: The existing JSON Web Token issued to authenticated voters.

---

## Requirements

### Requirement 1: Simulated Biometric Scan Screen

**User Story:** As a voter, I want to see a biometric scan animation after I submit my identity details, so that the verification process feels secure and trustworthy without requiring real hardware.

#### Acceptance Criteria

1. WHEN a voter submits a valid identity form on Step 2 and the API returns a successful authentication response, THE Voter_Portal SHALL display the Biometric_Screen as an intermediate step before advancing to Step 3 (Candidate Selection).
2. WHILE the Biometric_Screen is displayed, THE Voter_Portal SHALL show an animated progress bar that advances from 0% to 100% over a duration of 2 seconds.
3. WHILE the Biometric_Screen is displayed, THE Voter_Portal SHALL show a "Scanning…" status message visible to the user.
4. WHEN the Biometric_Screen animation completes its full 2-second duration without interruption, THE Voter_Portal SHALL automatically advance to Step 3; IF the animation is interrupted before completion, THE Voter_Portal SHALL wait for the animation to finish before advancing.
5. THE Voter_Portal SHALL update the step progress indicator and screen-reader announcement to reflect the Biometric_Screen as an intermediate phase between Step 2 and Step 3.
6. THE Voter_Portal SHALL implement the Biometric_Screen using only HTML, CSS, and JavaScript, introducing no new libraries or build tools to `voter-frontend/`.

---

### Requirement 2: Admin Dashboard Application

**User Story:** As an election administrator, I want a dedicated React web application, so that I can monitor election results in real time, review audit logs, verify individual votes, and finalize the election.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL be a React 18 application bootstrapped with Vite, located in the `admin-dashboard/` directory, using React Router v6 and Bootstrap 5.
2. THE Admin_Dashboard SHALL expose a `/login` route that renders a username and password login form.
3. WHEN an unauthenticated user navigates to any Admin_Dashboard route other than `/login`, THE Admin_Dashboard SHALL redirect the user to `/login`.
4. WHEN an admin submits credentials on `/login` and `POST /api/admin/login` returns a successful response with an Admin_JWT, THE Admin_Dashboard SHALL store the Admin_JWT in browser session storage and navigate to `/dashboard`; THE Admin_Dashboard SHALL NOT store a JWT or navigate away from `/login` unless the API response explicitly indicates success.
5. IF the `POST /api/admin/login` response indicates invalid credentials, THEN THE Admin_Dashboard SHALL display an inline error message on the login form without clearing the username field.
6. THE Admin_Dashboard `/dashboard` route SHALL display a results table with columns: Candidate Name, Party, Total Votes, and Percentage of total votes cast.
7. WHILE an admin is viewing `/dashboard`, THE Admin_Dashboard SHALL refresh the results table and bar chart every 10 seconds by re-fetching `GET /api/tally`.
8. THE Admin_Dashboard SHALL render a bar chart of current candidate vote totals using Chart.js, updated each time the results data refreshes.
9. THE Admin_Dashboard `/dashboard` route SHALL display an audit log table with columns: Transaction Hash (truncated), Voter ID (masked to last 4 characters), Timestamp, and Blockchain Status.
10. THE Admin_Dashboard SHALL provide a search input that accepts a transaction hash and calls `GET /api/audit/verify/transaction/:txHash` to display the matching audit record.
11. THE Admin_Dashboard `/dashboard` route SHALL display an "End Election" button that calls `POST /api/admin/election/finalize` when clicked.
12. WHEN the admin clicks "End Election", THE Admin_Dashboard SHALL display a confirmation modal before submitting the finalize request.
13. IF `POST /api/admin/election/finalize` returns a success response, THEN THE Admin_Dashboard SHALL disable the "End Election" button and display a "Election finalized" status message.

---

### Requirement 3: Admin Authentication

**User Story:** As an election administrator, I want a login system separate from voter authentication, so that admin privileges cannot be obtained using a voter credential.

#### Acceptance Criteria

1. THE API_Server SHALL expose `POST /api/admin/login` that accepts a JSON body containing `username` and `password` fields.
2. WHEN `POST /api/admin/login` receives valid credentials matching an `admin_users` record, THE API_Server SHALL return a signed Admin_JWT with a role claim of `"admin"` and an expiry of 60 minutes.
3. IF `POST /api/admin/login` receives credentials that do not match any `admin_users` record, THEN THE API_Server SHALL return HTTP 401 with a generic error message that does not reveal whether the username or password was incorrect.
4. THE Admin_Auth_Middleware SHALL verify that an `Authorization: Bearer` header is present, that the token is a valid Admin_JWT with a correct signature, and that the token carries a role claim of `"admin"` before granting access to any admin-only route; IF any of these checks fail, THEN THE Admin_Auth_Middleware SHALL reject the request with HTTP 401.
5. IF a request to an admin-only route presents a Voter_JWT (a token without the `"admin"` role claim) instead of an Admin_JWT, THEN THE Admin_Auth_Middleware SHALL reject the request with HTTP 403.
6. THE API_Server SHALL store admin passwords as bcrypt hashes in the `admin_users` table; plaintext passwords SHALL NOT be stored.
7. THE API_Server SHALL apply rate limiting to `POST /api/admin/login`, allowing a maximum of 10 requests per 15-minute window per IP address.

---

### Requirement 4: Ganache Blockchain Integration

**User Story:** As a system operator, I want the voting backend to record votes on a real local Ethereum network (Ganache), so that vote immutability can be verified against an actual blockchain rather than a simulated ledger.

#### Acceptance Criteria

1. THE API_Server SHALL connect to the Ganache_Node at `http://127.0.0.1:8545` using Web3.js v4 when the server starts.
2. IF the Ganache_Node is unreachable when the API_Server starts, THEN THE API_Server SHALL log an error and exit with a non-zero exit code rather than starting in a degraded state.
3. THE Ethereum_Adapter SHALL replace `simulatedLedger.js` as the active blockchain provider; THE API_Server SHALL remove the simulated ledger code path from the production configuration.
4. WHEN recording a vote, THE Ethereum_Adapter SHALL call `Voting_Contract.recordVote(nullifierHash, voteHash)` via Web3.js and return the resulting transaction hash and block number.
5. WHEN verifying a transaction, THE Ethereum_Adapter SHALL call `eth_getTransactionByHash` on the Ganache_Node and return the transaction details including the embedded vote hash.
6. THE API_Server SHALL expose `GET /api/blockchain/status` that returns a JSON object containing: `connected` (boolean), `blockNumber` (integer), `contractAddress` (string), and `accountCount` (integer).
7. IF the Ganache_Node becomes unreachable during a vote submission, THEN THE Ethereum_Adapter SHALL throw an error that causes THE API_Server to return HTTP 503 to the voter.
8. THE API_Server SHALL provide a `start-ganache.js` script in the project root that starts the Ganache_Node programmatically using the `ganache` npm package on port 8545 with a deterministic mnemonic.

---

### Requirement 5: Voting Smart Contract

**User Story:** As a system operator, I want a Solidity smart contract that records and verifies votes on-chain, so that double voting is prevented at the blockchain layer and results can be independently audited.

#### Acceptance Criteria

1. THE Voting_Contract SHALL implement a `recordVote(bytes32 nullifierHash, bytes32 voteHash)` function that stores the mapping of `nullifierHash` to `voteHash` in contract storage.
2. WHEN `recordVote` is called with a `nullifierHash` that has already been recorded, THE Voting_Contract SHALL revert the transaction, preventing double voting.
3. THE Voting_Contract SHALL implement a `verifyVote(bytes32 voteHash)` function that returns `true` if the given `voteHash` exists in contract storage and `false` otherwise.
4. THE Voting_Contract SHALL implement a `getVoteCount()` function that returns the total number of votes recorded as a `uint256`.
5. THE Voting_Contract SHALL implement a `finalize()` function restricted to the contract owner that sets the contract state to finalized.
6. WHEN `finalize()` is called on an already-finalized contract, THE Voting_Contract SHALL revert the transaction.
7. WHEN `recordVote` is called on a finalized contract, THE Voting_Contract SHALL revert the transaction.
8. THE API_Server SHALL compile `Voting.sol` using the `solc` npm package and deploy the compiled contract to the Ganache_Node on startup if no saved address exists in the Contract_Registry.
9. WHEN deployment of the Voting_Contract succeeds, THE API_Server SHALL write the deployed contract address to the Contract_Registry JSON file; IF writing to the Contract_Registry fails, THE API_Server SHALL log a warning and continue running using the in-memory contract address for the current session.
10. WHEN the API_Server starts and the Contract_Registry contains a saved address, THE API_Server SHALL load the contract at that address rather than redeploying; THE API_Server SHALL NOT write to the Contract_Registry for contracts loaded by address from the registry or through any means other than a fresh deployment.

---

### Requirement 6: Database Migration — SQLite to PostgreSQL

**User Story:** As a system operator, I want the voting API to use PostgreSQL instead of SQLite, so that the database can support concurrent connections and align with the existing `voting-db/schema.sql` design.

#### Acceptance Criteria

1. THE API_Server SHALL replace the `better-sqlite3` dependency with the `pg` npm package and manage all database access through a `DB_Pool`.
2. THE DB_Pool SHALL be configured using the `DATABASE_URL` environment variable and SHALL support a maximum of 10 concurrent connections.
3. THE API_Server SHALL execute all database queries using async `pool.query()` calls; no synchronous database calls SHALL remain in the codebase.
4. THE API_Server SHALL use `voting-db/schema.sql` as the base schema, applied to PostgreSQL on first run.
5. THE API_Server schema SHALL include an `admin_users` table with columns: `id` (UUID, primary key), `username` (TEXT, unique, not null), `password_hash` (TEXT, not null), and `created_at` (TIMESTAMPTZ, default NOW()).
6. THE API_Server schema SHALL add an `is_finalized` boolean column (default `FALSE`, not null) to the `elections` table; elections SHALL begin as not finalized and require an explicit admin finalization action to become finalized.
7. THE API_Server schema SHALL confirm that the `votes` table uses `blockchain_tx_hash` as the column name for the on-chain transaction hash, matching the existing `voting-db/schema.sql` definition.
8. IF the PostgreSQL connection fails on startup, THEN THE API_Server SHALL log the connection error with the host and port, and exit with a non-zero exit code.
9. THE API_Server health endpoint (`GET /health`) SHALL report the PostgreSQL connection status instead of the former SQLite status.

---

### Requirement 7: New API Endpoints

**User Story:** As an election administrator, I want dedicated API endpoints for admin login, election finalization, and blockchain status, so that the admin dashboard can perform privileged operations without using voter-facing routes.

#### Acceptance Criteria

1. THE API_Server SHALL expose `POST /api/admin/login` protected by rate limiting, accepting `username` and `password` as specified in Requirement 3.
2. THE API_Server SHALL expose `POST /api/admin/election/finalize` protected by the Admin_Auth_Middleware.
3. WHEN `POST /api/admin/election/finalize` is called with a valid Admin_JWT for an election that is not yet finalized, THE API_Server SHALL set `elections.is_finalized = TRUE` in the database and call `Voting_Contract.finalize()` on the Ganache_Node.
4. IF `POST /api/admin/election/finalize` is called for an election that is already finalized, THEN THE API_Server SHALL return HTTP 409 with an error message indicating the election has already been finalized.
5. THE API_Server SHALL expose `GET /api/blockchain/status` as a public endpoint (no authentication required) returning the fields specified in Requirement 4, Acceptance Criteria 6.
6. WHEN a voter submits a vote via `POST /api/votes`, THE API_Server SHALL verify that the election `status` is `'ACTIVE'` and `is_finalized = FALSE`; IF the election is finalized (`is_finalized = TRUE`), THE API_Server SHALL return HTTP 403 with a message indicating voting has closed; IF the election status is not `'ACTIVE'` (e.g., `'UPCOMING'` or `'CLOSED'`), THE API_Server SHALL return HTTP 403 with a message indicating voting is not currently open.
