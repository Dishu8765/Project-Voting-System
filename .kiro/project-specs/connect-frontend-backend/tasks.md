# Implementation Plan: Connect Frontend to Backend

## Overview

Replace all fake/hardcoded logic in `voter-frontend/js/voter.js` with real API calls to the `voting-api` Express backend. Three minimal `<div>` elements are added to `index.html` for inline API error display. All other changes are confined to `voter.js` and `voter.css`.

---

## Tasks

- [x] 1. Add `API_BASE` constant and expand in-memory state
  - Add `const API_BASE = 'http://localhost:3000';` at the top of the IIFE, before `TOTAL_STEPS`
  - Add `token: null` and `receiptData: null` fields to the `state` object
  - Remove the `CANDIDATES` constant array
  - _Requirements: 1.1, 1.2, 2.2_

- [x] 2. Add inline error container elements to `index.html` and wire up element references in `voter.js`
  - Add `<div id="auth-api-error" class="form-error-message" role="alert" hidden tabindex="-1"></div>` inside Step 2, below the `</fieldset>` closing tag
  - Add `<div id="candidates-api-error" class="form-error-message" role="alert" hidden tabindex="-1"></div>` inside Step 3, below `#candidate-list`
  - Add `<div id="vote-api-error" class="form-error-message" role="alert" hidden tabindex="-1"></div>` inside Step 4, below the `.confirmation-check` div
  - Add `elements.authError`, `elements.candidatesError`, and `elements.voteError` references in the `elements` object
  - _Requirements: 2.4, 3.5, 4.5, 7.2_

- [x] 3. Implement UI state helpers: `setLoading`, `showInlineError`, `clearInlineError`
  - Implement `setLoading(buttonEl, isLoading, loadingText, originalText)` — toggles `disabled` and button label
  - Implement `showInlineError(containerEl, message)` — sets text content, removes `hidden`, calls `focus()` and `announce()`
  - Implement `clearInlineError(containerEl)` — clears text and adds `hidden`
  - _Requirements: 6.1, 6.2, 7.2, 7.3, 7.4_

- [x] 4. Implement API helper functions
  - [x] 4.1 Implement `apiLogin(voterId, fullName, dateOfBirth)`
    - Calls `POST ${API_BASE}/api/auth/login` with JSON body
    - Returns `json.data` on success; throws the parsed JSON error object on non-OK response
    - Lets `fetch` reject naturally on network failure (caller handles it)
    - _Requirements: 1.2, 2.1_

  - [ ]* 4.2 Write property test for `apiLogin` request shape
    - **Property 1: All API requests use API_BASE**
    - **Property 6: Vote submission includes correct Authorization header and candidateId** (analogous for login body)
    - Use a mock `fetch` to capture the outgoing request and assert URL starts with `API_BASE` and body contains `{ voterId, fullName, dateOfBirth }`
    - **Validates: Requirements 1.2, 2.1**

  - [x] 4.3 Implement `apiFetchCandidates()`
    - Calls `GET ${API_BASE}/api/votes/candidates`
    - Returns `json.data.candidates` array on success; throws parsed JSON error on non-OK
    - _Requirements: 1.2, 3.1_

  - [x] 4.4 Implement `apiSubmitVote(token, candidateId)`
    - Calls `POST ${API_BASE}/api/votes` with `Authorization: Bearer <token>` header and `{ candidateId }` body
    - Returns `json.data` on success; throws parsed JSON error on non-OK
    - _Requirements: 1.2, 4.1_

  - [ ]* 4.5 Write property test for `apiSubmitVote` request shape
    - **Property 6: Vote submission includes correct Authorization header and candidateId**
    - Use mock `fetch` to verify Authorization header equals `"Bearer <token>"` for any token string, and body equals `{ candidateId }` for any candidateId
    - **Validates: Requirements 4.1**

- [x] 5. Implement `truncateTxHash` utility and update `populateReceipt`
  - [x] 5.1 Implement `truncateTxHash(txHash)`
    - Strip `0x` prefix if present, take first 6 chars and last 4 chars of hex string, return `"0x" + head + "…" + tail`
    - _Requirements: 5.3_

  - [ ]* 5.2 Write property test for `truncateTxHash`
    - **Property 8: txHash truncation is deterministic**
    - For any hex string ≥ 12 chars (with or without `0x` prefix), assert output matches `"0x" + first6 + "…" + last4`
    - **Validates: Requirements 5.3**

  - [x] 5.3 Update `populateReceipt()` to read from `state.receiptData`
    - Replace fake code generators with `state.receiptData.confirmationCode`, `formatTimestamp(new Date(state.receiptData.timestamp))`, and `truncateTxHash(state.receiptData.txHash)`
    - Remove `generateConfirmationCode` and `generateBlockReference` functions
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 5.4 Write property test for `populateReceipt` output
    - **Property 8: txHash truncation is deterministic** (end-to-end: receipt-block text matches truncated txHash)
    - For any `receiptData` object, assert `receipt-code` text equals `confirmationCode`, `receipt-block` text equals `truncateTxHash(txHash)`, and `receipt-time` is a non-empty string
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 6. Replace identity form submit handler with async API-calling version
  - [x] 6.1 Update the `identityForm` submit listener to be async
    - Call `clearInlineError(elements.authError)` at the start
    - Call `setLoading` on `#btn-verify` before the API call; restore in `finally`
    - Call `apiLogin` with stored identity values; on success set `state.token = data.token` and call `handleNext(3)`
    - On error, call `showInlineError(elements.authError, ...)` using the error `message` or generic network message
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 6.2 Write property test for auth error display
    - **Property 2: Auth errors are displayed verbatim**
    - For any error response message string, assert the `auth-api-error` element text equals that message after the handler runs
    - **Validates: Requirements 2.4, 7.1**

  - [ ]* 6.3 Write property test for JWT memory storage
    - **Property 3: JWT is stored in memory only**
    - For any token string returned in a mock success response, assert `state.token` equals that token AND `localStorage.getItem` returns null for all keys
    - **Validates: Requirements 2.2**

- [x] 7. Implement `enterStep3` and update `showStep` to call it
  - [x] 7.1 Implement async `enterStep3()` function
    - Disable `#btn-select-candidate`, clear `candidate-list` innerHTML, show `<p class="candidates-loading">Loading candidates…</p>`
    - Call `apiFetchCandidates()`; on success call `renderCandidates(candidates)` and re-enable the button
    - On error call `showInlineError(elements.candidatesError, ...)` and leave Back button enabled
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 7.2 Update `showStep` to call `enterStep3()` when advancing to step 3
    - Add `if (step === 3) { enterStep3(); }` inside `showStep` after the existing step-display logic
    - _Requirements: 3.1_

  - [ ]* 7.3 Write property test for candidate rendering
    - **Property 4: Candidate cards cover the full API response**
    - For any array of candidate objects, assert the DOM contains exactly `candidates.length` radio inputs and each candidate's `name`, `party`, and `office` appear in the rendered HTML
    - **Validates: Requirements 3.3, 3.6**

  - [ ]* 7.4 Write property test for candidate fetch error behaviour
    - **Property 5: Candidate fetch errors keep Back accessible**
    - For any error response, assert the Back button in Step 3 does not have the `disabled` attribute after the error handler runs
    - **Validates: Requirements 3.5**

- [x] 8. Checkpoint — Verify identity auth and candidate list work end-to-end
  - Start the `voting-api` server and open `voter-frontend/index.html` via a local file server
  - Test Step 2 → Step 3 with a valid seed voter (e.g., `VOTER001 | Jane Smith | 1975-03-15`)
  - Test with an invalid voter ID to confirm inline error appears without advancing
  - Confirm candidate cards render from the live API with correct names, parties, and offices
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Replace vote submission handler with async API-calling version
  - [x] 9.1 Update the `#btn-submit-vote` click listener to be async
    - Call `clearInlineError(elements.voteError)` before the API call
    - Call `setLoading` on `#btn-submit-vote` and disable the Step 4 Back button before the API call; restore both in `finally`
    - Call `apiSubmitVote(state.token, state.selectedCandidateId)`; on success set `state.receiptData = data` and call `handleNext(5)`
    - On error call `showInlineError(elements.voteError, ...)` using the error `message` or generic network message
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 9.2 Write property test for vote error display
    - **Property 7: Vote errors are displayed verbatim**
    - For any error response message string (e.g., `ALREADY_VOTED`, `BLOCKCHAIN_ERROR`), assert the `vote-api-error` element text equals that message
    - **Validates: Requirements 4.5, 7.1**

- [x] 10. Add `.candidates-loading` CSS rule
  - Add to `voter.css`: `.candidates-loading { text-align: center; color: #6c757d; padding: 2rem 0; font-style: italic; }`
  - _Requirements: 3.2_

- [ ] 11. Write property test for screen reader announcement of errors
  - [ ]* 11.1 Write property test for `announce` being called on every API error
    - **Property 9: Error messages are announced to screen readers**
    - Mock `announce` and assert it is called with the same string that appears in the inline error element, for auth errors, candidate errors, and vote errors
    - **Validates: Requirements 7.3**

- [ ] 12. Final checkpoint — Full end-to-end smoke test
  - Test the complete happy path: login → candidates → confirm → receipt with real confirmation code, timestamp, and truncated txHash
  - Test `ALREADY_VOTED` error on Step 4 (vote with the same seed voter twice)
  - Verify Escape key still triggers Back on steps 2, 3, and 4
  - Verify screen reader live region updates on step transitions and errors
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All API helper functions (`apiLogin`, `apiFetchCandidates`, `apiSubmitVote`) are pure async functions with no DOM side-effects — they are easy to unit-test with a mocked `fetch`
- The `truncateTxHash` function is a pure transformation and is ideal for property-based testing
- Property tests validate universal correctness; unit tests in checkpoints validate integration behaviour
- No build tooling is assumed — tests can be run via a simple test harness or browser console scripts

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3"] },
    { "wave": 3, "tasks": ["4", "5"] },
    { "wave": 4, "tasks": ["6", "7"] },
    { "wave": 5, "tasks": ["8"] },
    { "wave": 6, "tasks": ["9", "10", "11"] },
    { "wave": 7, "tasks": ["12"] }
  ]
}
```

- Task 1 (constants + state) must come first — everything depends on `API_BASE` and the expanded `state`
- Task 2 (HTML error containers) must precede tasks 3, 6, 7, 9 which reference those elements
- Task 3 (UI helpers) must precede tasks 6, 7, 9 which call `setLoading` and `showInlineError`
- Task 4 (API helpers) must precede tasks 6, 7, 9 which call them
- Task 5 (`truncateTxHash` + `populateReceipt`) must precede task 9 which sets `state.receiptData`
- Task 8 (checkpoint) gates tasks 9–12 on a working auth + candidate flow
- Tasks 10 and 11 are independent and can be done in any order before task 12
