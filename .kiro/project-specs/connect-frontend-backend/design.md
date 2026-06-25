# Design Document — Connect Frontend to Backend

## Overview

`voter-frontend/js/voter.js` is extended in-place to replace three fake/hardcoded behaviours with real API calls:

1. **Identity verification** — `POST /api/auth/login`
2. **Candidate list** — `GET /api/votes/candidates`
3. **Vote submission** — `POST /api/votes`

All changes stay inside `voter.js` and `voter.css`. No build tools, no new dependencies, no HTML changes beyond what is strictly required for new error-display elements. The existing IIFE structure, state object, element cache, and accessibility helpers (`announce`, focus management, `aria-live`) are fully preserved.

---

## Architecture

The module follows a simple layered approach inside a single IIFE:

```
┌─────────────────────────────────────────────────────┐
│  voter.js IIFE                                       │
│                                                      │
│  ┌─────────────┐   calls    ┌──────────────────────┐ │
│  │  Event      │──────────▶│  API Layer           │ │
│  │  Handlers   │           │  (apiLogin,           │ │
│  │  (bindEvents│           │   apiFetchCandidates, │ │
│  │   )         │           │   apiSubmitVote)      │ │
│  └─────────────┘           └──────────┬───────────┘ │
│         │                             │ fetch()      │
│         │ updates                     ▼              │
│  ┌─────────────┐           ┌──────────────────────┐ │
│  │  State      │           │  API_BASE constant   │ │
│  │  { token,   │◀──────────│  http://localhost:   │ │
│  │    ...}     │  stores   │  3000                │ │
│  └─────────────┘  JWT      └──────────────────────┘ │
│         │                                            │
│         │                                            │
│  ┌─────────────────────────────────────────────────┐ │
│  │  UI helpers                                     │ │
│  │  setLoading(), showInlineError(), announce()    │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Components

### 1. `API_BASE` constant

Placed at the top of the IIFE, before `TOTAL_STEPS`:

```js
const API_BASE = 'http://localhost:3000';
```

All fetch calls construct their URL as `` `${API_BASE}/api/...` ``.

---

### 2. Expanded `state` object

The JWT and the vote receipt data are stored in memory only:

```js
const state = {
  currentStep: 1,
  voterId: '',
  fullName: '',
  dateOfBirth: '',
  selectedCandidateId: null,
  token: null,          // JWT from POST /api/auth/login
  receiptData: null     // { confirmationCode, txHash, timestamp } from POST /api/votes
};
```

---

### 3. API helper functions

Three thin wrappers around `fetch`. Each returns a resolved value on success or throws on failure (including network errors). They do not touch the DOM — that is the caller's responsibility.

#### `apiLogin(voterId, fullName, dateOfBirth)`

```js
async function apiLogin(voterId, fullName, dateOfBirth) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voterId, fullName, dateOfBirth })
  });
  const json = await res.json();
  if (!res.ok) throw json; // throws { success, message, code }
  return json.data;        // { token, voterId, expiresIn }
}
```

#### `apiFetchCandidates()`

```js
async function apiFetchCandidates() {
  const res = await fetch(`${API_BASE}/api/votes/candidates`);
  const json = await res.json();
  if (!res.ok) throw json;
  return json.data.candidates; // [{ id, name, party, office }]
}
```

#### `apiSubmitVote(token, candidateId)`

```js
async function apiSubmitVote(token, candidateId) {
  const res = await fetch(`${API_BASE}/api/votes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ candidateId })
  });
  const json = await res.json();
  if (!res.ok) throw json;
  return json.data; // { confirmationCode, txHash, timestamp, ... }
}
```

---

### 4. UI state helpers

#### `setLoading(buttonEl, isLoading, loadingText, originalText)`

Centralises the disabled/label toggle for any action button:

```js
function setLoading(buttonEl, isLoading, loadingText, originalText) {
  if (isLoading) {
    buttonEl.disabled = true;
    buttonEl.textContent = loadingText || 'Please wait…';
  } else {
    buttonEl.disabled = false;
    buttonEl.textContent = originalText;
  }
}
```

#### `showInlineError(containerEl, message)`

Renders an error message into a dedicated container element and focuses it:

```js
function showInlineError(containerEl, message) {
  containerEl.textContent = message;
  containerEl.hidden = false;
  containerEl.focus();
  announce(message);
}
```

#### `clearInlineError(containerEl)`

```js
function clearInlineError(containerEl) {
  containerEl.textContent = '';
  containerEl.hidden = true;
}
```

---

### 5. `renderCandidates(candidates)` — updated signature

The existing `renderCandidates()` is updated to accept an array parameter instead of reading from the module-level `CANDIDATES` constant. The HTML template for each card is unchanged (preserving `aria-describedby` and radio semantics):

```js
function renderCandidates(candidates) {
  elements.candidateList.innerHTML = candidates.map(function (candidate) {
    var initials = candidate.name.split(' ')
      .map(function (w) { return w[0]; })
      .join('')
      .slice(0, 2)
      .toUpperCase();
    var checked = state.selectedCandidateId === candidate.id ? ' checked' : '';
    return (
      '<label class="candidate-card" for="candidate-' + candidate.id + '">' +
        '<input type="radio" name="candidate" id="candidate-' + candidate.id + '"' +
          ' value="' + candidate.id + '"' + checked +
          ' aria-describedby="candidate-desc-' + candidate.id + '">' +
        '<div class="candidate-card-inner">' +
          '<div class="candidate-avatar" aria-hidden="true">' + initials + '</div>' +
          '<div class="candidate-info">' +
            '<p class="candidate-name">' + candidate.name + '</p>' +
            '<p class="candidate-party" id="candidate-desc-' + candidate.id + '">' +
              candidate.party + ' &mdash; ' + candidate.office +
            '</p>' +
          '</div>' +
          '<div class="candidate-check" aria-hidden="true"></div>' +
        '</div>' +
      '</label>'
    );
  }).join('');

  elements.candidateList.querySelectorAll('input[type="radio"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      state.selectedCandidateId = radio.value;
      document.getElementById('candidate-error').hidden = true;
    });
  });
}
```

---

### 6. `populateReceipt()` — updated to use real data

Reads from `state.receiptData` set by the vote submission handler:

```js
function populateReceipt() {
  var data = state.receiptData;
  elements.receiptCode.textContent = data.confirmationCode;
  elements.receiptTime.textContent = formatTimestamp(new Date(data.timestamp));
  elements.receiptBlock.textContent = truncateTxHash(data.txHash);
}
```

#### `truncateTxHash(txHash)`

```js
function truncateTxHash(txHash) {
  // Input: "0xabcdef1234567890abcdef..."
  // Output: "0xABCDEF…7890"
  var stripped = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
  var head = stripped.slice(0, 6);
  var tail = stripped.slice(-4);
  return '0x' + head + '\u2026' + tail;
}
```

---

### 7. Event handler changes

#### Step 2 — Identity form submit

```js
elements.identityForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  clearInlineError(elements.authError); // clear previous API error
  if (!validateIdentityForm()) {
    announce('Please correct the errors in the form before continuing.');
    var firstInvalid = elements.identityForm.querySelector('.is-invalid');
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  var btn = document.getElementById('btn-verify');
  setLoading(btn, true, 'Please wait…', 'Continue to Candidates');
  try {
    var data = await apiLogin(state.voterId, state.fullName, state.dateOfBirth);
    state.token = data.token;
    handleNext(3);
  } catch (err) {
    var msg = (err && err.message) ? err.message : 'A network error occurred. Please check your connection and try again.';
    showInlineError(elements.authError, msg);
  } finally {
    setLoading(btn, false, null, 'Continue to Candidates');
  }
});
```

#### Step 3 — Enter step (candidate fetch)

A new `enterStep3` async function is called from `showStep` when transitioning to step 3:

```js
async function enterStep3() {
  var btn = document.getElementById('btn-select-candidate');
  btn.disabled = true;
  renderCandidates([]); // clear stale list
  elements.candidateList.innerHTML = '<p class="candidates-loading" aria-live="polite">Loading candidates…</p>';
  clearInlineError(elements.candidatesError);
  try {
    var candidates = await apiFetchCandidates();
    renderCandidates(candidates);
    btn.disabled = false;
  } catch (err) {
    var msg = (err && err.message) ? err.message : 'A network error occurred. Please check your connection and try again.';
    showInlineError(elements.candidatesError, msg);
    // Back button stays enabled — no additional action needed
  }
}
```

#### Step 4 — Vote submission

```js
document.getElementById('btn-submit-vote').addEventListener('click', async function () {
  if (!elements.confirmCheckbox.checked) {
    document.getElementById('confirm-error').hidden = false;
    announce('Please check the confirmation box to submit your vote.');
    elements.confirmCheckbox.focus();
    return;
  }
  clearInlineError(elements.voteError);

  var submitBtn = document.getElementById('btn-submit-vote');
  var backBtn = document.querySelector('#step-4 .btn-back');
  setLoading(submitBtn, true, 'Please wait…', 'Submit My Vote');
  backBtn.disabled = true;

  try {
    var data = await apiSubmitVote(state.token, state.selectedCandidateId);
    state.receiptData = data;
    handleNext(5);
  } catch (err) {
    var msg = (err && err.message) ? err.message : 'A network error occurred. Please check your connection and try again.';
    showInlineError(elements.voteError, msg);
  } finally {
    setLoading(submitBtn, false, null, 'Submit My Vote');
    backBtn.disabled = false;
  }
});
```

---

### 8. New DOM element references

Two new inline-error container elements are added to `elements` (the existing `confirm-error` and `candidate-error` elements in HTML are reused where applicable):

```js
elements.authError       = document.getElementById('auth-api-error');
elements.candidatesError = document.getElementById('candidates-api-error');
elements.voteError       = document.getElementById('vote-api-error');
```

These require three small additions to `index.html`:

- `<div id="auth-api-error" class="form-error-message" role="alert" hidden tabindex="-1"></div>` — inside Step 2, below the fieldset
- `<div id="candidates-api-error" class="form-error-message" role="alert" hidden tabindex="-1"></div>` — inside Step 3, below the candidate list
- `<div id="vote-api-error" class="form-error-message" role="alert" hidden tabindex="-1"></div>` — inside Step 4, below the confirmation check

> **Note**: While the constraint says "no HTML changes unless absolutely necessary", these three `<div>` additions are minimal and necessary to display inline errors as required by Requirements 2.4, 3.5, and 4.5. The alternative — reusing existing error elements for API errors — would mix validation errors with API errors and confuse screen readers.

---

### 9. Removed code

- `CANDIDATES` array constant — replaced by live API data
- `generateConfirmationCode()` function — replaced by `state.receiptData.confirmationCode`
- `generateBlockReference()` function — replaced by `truncateTxHash(state.receiptData.txHash)`

---

## Data Models

### In-memory state additions

```
state.token        : string | null   — JWT from login response
state.receiptData  : object | null   — { confirmationCode, txHash, timestamp, ... }
```

### API response shapes (consumed)

```
POST /api/auth/login  →  { success, data: { token, voterId, expiresIn } }
GET  /api/votes/candidates → { success, data: { candidates: [{ id, name, party, office }] } }
POST /api/votes       →  { success, data: { confirmationCode, txHash, timestamp } }
Error shape           →  { success: false, message: string, code: string }
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `INVALID_CREDENTIALS` (401) | Inline error on Step 2 with API `message` |
| `ALREADY_VOTED` (403) | Inline error on Step 4 with API `message` |
| `UNAUTHORIZED` (401) on vote | Inline error on Step 4 with API `message` |
| `RATE_LIMITED` (429) | Inline error on Step 2 with API `message` |
| `BLOCKCHAIN_ERROR` (500) | Inline error on Step 4 with API `message` |
| `VALIDATION_FAILED` (400) | Inline error on the relevant step with API `message` |
| Network failure (fetch rejects) | Generic inline message on the relevant step |
| Candidate fetch failure | Inline error on Step 3; Back button stays enabled |

---

## CSS Changes

Add to `voter.css`:

```css
/* Loading state for candidate list */
.candidates-loading {
  text-align: center;
  color: var(--text-secondary, #6c757d);
  padding: 2rem 0;
  font-style: italic;
}
```

No other CSS changes are required — the existing `.form-error-message` class already styles inline errors.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: All API requests use API_BASE

For any API call made by VoterJS (login, fetch candidates, submit vote), the request URL must start with the value of the `API_BASE` constant.

**Validates: Requirements 1.2**

---

### Property 2: Auth errors are displayed verbatim

For any error response returned by `POST /api/auth/login` that contains a non-empty `message` field, the text visible in the Step 2 inline error element must equal that `message` string exactly.

**Validates: Requirements 2.4, 7.1, 7.2**

---

### Property 3: JWT is stored in memory only

For any successful login response containing a `token`, that token value must be present in `state.token` and absent from `window.localStorage` and `window.sessionStorage`.

**Validates: Requirements 2.2**

---

### Property 4: Candidate cards cover the full API response

For any array of candidates returned by `GET /api/votes/candidates`, the rendered DOM must contain exactly one radio input per candidate, and each card must display the candidate's `name`, `party`, and `office` fields.

**Validates: Requirements 3.3, 3.6**

---

### Property 5: Candidate fetch errors keep Back accessible

For any error response (or network failure) when fetching candidates, the Back button on Step 3 must remain enabled (`disabled` attribute absent) after the error is handled.

**Validates: Requirements 3.5**

---

### Property 6: Vote submission includes correct Authorization header and candidateId

For any stored JWT and any selected candidateId, the request made by `apiSubmitVote` must include an `Authorization` header with the value `"Bearer <JWT>"` and a body containing `{ candidateId }`.

**Validates: Requirements 4.1**

---

### Property 7: Vote errors are displayed verbatim

For any error response returned by `POST /api/votes` that contains a non-empty `message` field, the text visible in the Step 4 inline error element must equal that `message` string exactly.

**Validates: Requirements 4.5, 7.1, 7.2**

---

### Property 8: txHash truncation is deterministic

For any txHash string of length ≥ 12 characters (after stripping the `0x` prefix), the output of `truncateTxHash` must be `"0x" + first6chars + "…" + last4chars`, where `first6chars` and `last4chars` are the first 6 and last 4 characters of the hex string after the `0x` prefix.

**Validates: Requirements 5.3**

---

### Property 9: Error messages are announced to screen readers

For any API error message displayed by VoterJS, the `announce` function must be called with a string equal to that error message, ensuring the `aria-live` region is updated.

**Validates: Requirements 7.3**
