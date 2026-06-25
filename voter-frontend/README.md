# Secure Vote — Voter Frontend

A simple, accessible voter-facing interface for a blockchain-secured voting system. The frontend connects to the `voting-api` Express backend for authentication, live candidate data, and vote submission.

## Features

- **5-step voting flow:** Welcome → Identity Verification → Candidate Selection → Confirmation → Receipt
- **Live API integration:** All three steps call the `voting-api` backend — no fake data
- **Bootstrap 5** styling with a custom accessible theme
- **WCAG 2.1 AA** oriented: skip link, ARIA live regions, semantic HTML, visible focus states, keyboard navigation
- **Elder-friendly design:** 18px+ base font, 44px+ touch targets, high contrast, calm color palette
- **Inline error messages:** API errors shown directly on the relevant step — no modals
- **Receipt:** Real confirmation code and blockchain transaction hash from the API

## Prerequisites

The `voting-api` backend must be running before you open the frontend.

```bash
cd voting-api
npm install
npm start
```

The API runs on `http://localhost:3000` by default.

## Running the Frontend

**Option A — Open directly (simplest)**

Just double-click `index.html` or drag it into your browser. The CORS setting in `voting-api/.env` is `CORS_ORIGIN=*`, which allows requests from `file://` origins in development.

**Option B — Local HTTP server (recommended)**

```bash
# Python (built-in, no install needed)
cd voter-frontend
python -m http.server 8080

# Node.js
cd voter-frontend
npx serve .
```

Then visit `http://localhost:8080`.

## Test Voters

Use any of these credentials on the identity verification step:

| Voter ID  | Full Name       | Date of Birth |
|-----------|----------------|---------------|
| VOTER001  | Jane Smith      | 1975-03-15    |
| VOTER002  | Robert Johnson  | 1982-07-22    |
| VOTER003  | Maria Garcia    | 1990-11-08    |
| VOTER004  | James Wilson    | 1968-01-30    |
| VOTER005  | Patricia Brown  | 1955-09-12    |

Each voter can only vote once. Restart the API (which clears the SQLite DB on re-seed) to reset.

## API Configuration

The base URL is defined as a single constant at the top of `js/voter.js`:

```js
const API_BASE = 'http://localhost:3000';
```

Change this to your deployed backend URL before going to production.

## File Structure

```
voter-frontend/
├── index.html      # Main voting interface
├── css/
│   └── voter.css   # Accessible theme & layout
├── js/
│   └── voter.js    # Step navigation, API calls, form logic
└── README.md
```

## API Endpoints Used

| Step | Method | Endpoint | Purpose |
|------|--------|----------|---------|
| Step 2 → 3 | POST | `/api/auth/login` | Verify voter identity, get JWT |
| Step 3 | GET | `/api/votes/candidates` | Load live candidate list |
| Step 4 → 5 | POST | `/api/votes` | Submit vote, get receipt |

## Error Handling

All API errors are shown inline on the relevant step using the human-readable `message` from the API response. Screen reader users are notified via an `aria-live` region. Network failures show a generic retry message.

| Error | Where shown |
|-------|-------------|
| Wrong voter ID / name / DOB | Step 2, below the form |
| Voter already voted | Step 4, below the confirmation checkbox |
| Session expired | Step 4, below the confirmation checkbox |
| Candidates unavailable | Step 3, inside the candidate list area |
| Blockchain error | Step 4, below the confirmation checkbox |

## Accessibility Notes

- All interactive elements meet minimum 44×44px touch target size
- Color contrast ratios target WCAG AA (4.5:1 text, 3:1 UI components)
- Status uses amber/neutral tones instead of red/green to support colorblind users
- `prefers-reduced-motion` respected
- Screen reader announcements on step changes and API errors via `aria-live` region
- Escape key navigates back on steps 2, 3, and 4
