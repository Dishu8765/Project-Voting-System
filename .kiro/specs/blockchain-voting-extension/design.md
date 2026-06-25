# Design Document — Blockchain Voting Extension

## Overview

This document describes the technical design for extending the existing blockchain voting system.
The system today is a plain-HTML voter portal (`voter-frontend/`), a Node.js/Express API
(`voting-api/`) backed by SQLite, and a simulated in-memory blockchain ledger.

The extension adds five concrete capabilities:

1. A simulated biometric scan screen injected into the voter portal between Steps 2 and 3.
2. A new React 18 + Vite admin dashboard (`admin-dashboard/`) for real-time monitoring and election management.
3. Full database migration from SQLite (`better-sqlite3`) to PostgreSQL (`pg`).
4. Real Ganache Ethereum integration replacing the simulated ledger, driven by Web3.js v4.
5. A Solidity smart contract (`Voting.sol`) that records and prevents double votes on-chain.

---

## Architecture

The system consists of four separately deployable units:

```
┌──────────────────────────────────────────────────────────────────┐
│  voter-frontend/   (static HTML/CSS/JS — no build step)          │
│  Serves on any static host or file://                            │
└──────────────────────────────────────────────────────────────────┘
                          │ XHR / fetch
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│  voting-api/       (Node.js / Express — port 3000)               │
│  ├── voter auth, vote submission, tally, audit                   │
│  ├── admin auth, election finalization                           │
│  └── blockchain status                                           │
└──────────────────────────────────────────────────────────────────┘
         │  pg pool                │  Web3.js v4
         ▼                         ▼
┌────────────────┐      ┌─────────────────────────────────────────┐
│  PostgreSQL    │      │  Ganache (ganache npm pkg — port 8545)  │
│  (schema.sql)  │      │  └── Voting.sol (deployed on startup)   │
└────────────────┘      └─────────────────────────────────────────┘
                          │ XHR / fetch
                          ▲
┌──────────────────────────────────────────────────────────────────┐
│  admin-dashboard/  (React 18 + Vite SPA — port 5173 dev)        │
│  /login  /dashboard                                              │
└──────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**PostgreSQL instead of SQLite** — The `voting-db/schema.sql` already defines a fully normalised PostgreSQL schema (UUID PKs, ENUM types, TIMESTAMPTZ). All services are rewritten to use `async pool.query()` via the `pg` package. SQLite WAL files and the `better-sqlite3` dependency are removed.

**Ganache replaces simulated ledger** — `BLOCKCHAIN_PROVIDER=ethereum` is now the only production path. The `simulatedLedger.js` code path is removed from the router in `services/blockchain/index.js`. The `start-ganache.js` script must be run before the API.

**Contract Registry JSON file** — The deployed `Voting.sol` address is persisted in `voting-api/contract-registry.json` so the API survives restarts without redeploying the contract.

**Separate admin JWT** — Admin tokens carry `role: "admin"` in the payload and are verified by a new `adminAuth` middleware, entirely distinct from the voter `authenticate` middleware. A voter JWT presented to an admin route returns 403 (not 401).

**No build step in voter-frontend** — The biometric screen is pure HTML + vanilla CSS animation + `setTimeout` inside the existing `voter.js` IIFE. No bundler or new `<script>` tags are added.

---

## Components and Interfaces

### 1. Project Structure (new and modified paths)

```
Blockchain/
├── start-ganache.js                          # NEW — starts Ganache on port 8545
├── contracts/
│   └── Voting.sol                            # NEW — Solidity smart contract
│
├── voter-frontend/
│   ├── index.html                            # MODIFIED — add biometric step section
│   ├── css/voter.css                         # MODIFIED — biometric scan styles
│   └── js/voter.js                           # MODIFIED — biometric screen logic
│
├── admin-dashboard/                          # NEW — React 18 + Vite SPA
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api/
│       │   └── client.js                     # axios instance with auth header
│       ├── components/
│       │   ├── ProtectedRoute.jsx
│       │   ├── LoginPage.jsx
│       │   ├── Dashboard.jsx
│       │   ├── ResultsTable.jsx
│       │   ├── ResultsChart.jsx
│       │   ├── AuditLogTable.jsx
│       │   ├── TxHashSearch.jsx
│       │   └── FinalizeButton.jsx
│       └── contexts/
│           └── AuthContext.jsx
│
├── voting-api/
│   ├── contract-registry.json                # NEW (git-ignored) — persisted contract address
│   ├── package.json                          # MODIFIED — add pg, web3, solc, bcryptjs, jsonwebtoken
│   ├── src/
│   │   ├── config/index.js                   # MODIFIED — new env vars
│   │   ├── db/index.js                       # REWRITTEN — pg Pool, async
│   │   ├── middleware/
│   │   │   ├── auth.js                       # MODIFIED — keep voter auth
│   │   │   └── adminAuth.js                  # NEW — admin JWT + role check
│   │   ├── routes/
│   │   │   ├── index.js                      # MODIFIED — add admin + blockchain routes
│   │   │   ├── admin.routes.js               # NEW
│   │   │   └── blockchain.routes.js          # NEW
│   │   └── services/
│   │       ├── admin.service.js              # NEW
│   │       ├── vote.service.js               # REWRITTEN — async pg, nullifier hash
│   │       ├── voter.service.js              # REWRITTEN — async pg
│   │       ├── tally.service.js              # REWRITTEN — async pg
│   │       ├── audit.service.js              # REWRITTEN — async pg
│   │       └── blockchain/
│   │           ├── index.js                  # MODIFIED — remove simulated path
│   │           └── ethereumAdapter.js        # REWRITTEN — Web3.js v4 + contract calls
│
└── voting-db/
    ├── schema.sql                            # MODIFIED — add admin_users, is_finalized
    └── migrate.sql                           # NEW — additive migration script
```

### 2. Biometric Screen (voter-frontend)

**index.html changes** — insert a new `<section>` between Step 2 and Step 3. It carries `data-step="2b"` (a non-integer sentinel that is never matched by the numeric progress logic). The section is always `hidden` initially.

```html
<!-- Biometric Scan (Step 2b — injected between Step 2 and Step 3) -->
<section class="vote-step" id="step-2b" aria-labelledby="step-2b-heading"
         data-step="2b" hidden>
  <div class="step-card">
    <h1 id="step-2b-heading" class="step-heading">Biometric Verification</h1>
    <p class="step-lead">Please hold still while we verify your identity.</p>
    <div class="biometric-container" aria-hidden="true">
      <div class="biometric-ring">
        <div class="biometric-pulse"></div>
      </div>
    </div>
    <p id="biometric-status" class="biometric-status" aria-live="polite">Scanning…</p>
    <div class="biometric-progress" role="progressbar"
         aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
         aria-labelledby="biometric-status" id="biometric-bar-track">
      <div class="biometric-progress-fill" id="biometric-bar-fill"
           style="width:0%"></div>
    </div>
  </div>
</section>
```

**voter.js changes** — add a `showBiometricScreen()` function inside the IIFE that:
1. Hides all `.vote-step` sections and shows `#step-2b`.
2. Announces "Biometric verification in progress" to the screen reader.
3. Starts a 2000 ms CSS-driven progress animation using `requestAnimationFrame` + timestamp delta (or a simple `setInterval` every 20 ms incrementing by 1%).
4. On completion, calls `handleNext(3)`.
5. Replace the `handleNext(3)` call inside the `identityForm` submit handler with `showBiometricScreen()`.

The `STEP_TITLES` map and `TOTAL_STEPS` constant remain at 5 (the biometric phase is a sub-phase of Step 2, not a numbered step in the public progress indicator). The progress bar shows step 2 as active throughout the biometric phase.

**voter.css changes** — add `.biometric-container`, `.biometric-ring`, `.biometric-pulse`, `.biometric-status`, `.biometric-progress`, `.biometric-progress-fill` styles. The ring uses a CSS `@keyframes` rotation, and the fill bar uses a CSS `transition: width 2s linear`.

### 3. Admin Dashboard (admin-dashboard/)

**React Router v6 route tree:**

```
<BrowserRouter>
  <Routes>
    <Route path="/login"     element={<LoginPage />} />
    <Route path="/"          element={<ProtectedRoute />}>
      <Route path="dashboard" element={<Dashboard />} />
      <Route index           element={<Navigate to="dashboard" />} />
    </Route>
    <Route path="*"          element={<Navigate to="/login" />} />
  </Routes>
</BrowserRouter>
```

**AuthContext** — holds `{ token, login(token), logout() }`. `login()` writes to `sessionStorage.setItem('adminToken', token)`. `logout()` clears it. On mount, initialises from `sessionStorage`. `ProtectedRoute` reads this context; if `token` is falsy, renders `<Navigate to="/login" />`.

**API client (`src/api/client.js`)** — an axios instance with `baseURL: import.meta.env.VITE_API_BASE_URL` (default `http://localhost:3000`). A request interceptor attaches `Authorization: Bearer <token>` from `sessionStorage`. A response interceptor redirects to `/login` on 401.

**Dashboard polling** — `useEffect` with `setInterval(fetchTally, 10_000)` and `setInterval(fetchAudit, 10_000)`. Both intervals are cleared on unmount.

**Chart.js integration** — `<ResultsChart>` renders a `<canvas>` ref, creates a `Chart` instance on mount with `type: 'bar'`, and calls `chart.data.datasets[0].data = newData; chart.update()` each time the tally prop changes. Destroying and recreating the chart is avoided to prevent flicker.

**Finalization flow:**
1. User clicks "End Election" → modal appears (Bootstrap `Modal` JS or a `<dialog>` element).
2. User clicks "Confirm" → `POST /api/admin/election/finalize` is called with the stored token.
3. On 200 → button disabled, status message shown.
4. On 409 → inline message "Election is already finalized."
5. On 401/403 → user is redirected to login (handled by axios interceptor).
