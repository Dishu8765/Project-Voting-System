# Requirements Document

## Introduction

This feature connects the `voter-frontend` multi-step voting wizard to the `voting-api` Express backend. The frontend currently operates entirely client-side with hardcoded candidate data and fake receipt values. This feature replaces those stubs with real API calls: authenticating the voter via `POST /api/auth/login`, fetching live candidates from `GET /api/votes/candidates`, and submitting the vote via `POST /api/votes`. All changes are confined to `voter-frontend/js/voter.js` and `voter-frontend/css/voter.css`. No build tools or new dependencies are introduced.

## Glossary

- **Wizard**: The five-step voting flow rendered by `voter-frontend/index.html` and controlled by `voter.js`.
- **VoterJS**: The single JavaScript module `voter-frontend/js/voter.js` that controls all wizard behaviour.
- **API**: The Express backend running at the URL defined by the `API_BASE` constant in VoterJS (default `http://localhost:3000`).
- **JWT**: The JSON Web Token returned by `POST /api/auth/login` and stored in VoterJS in-memory state.
- **Action button**: The primary forward-navigation button on each step (e.g., "Continue to Candidates", "Review My Selection", "Submit My Vote").
- **Inline error**: An error message rendered directly beneath the relevant form field or action area, without using a modal or alert dialog.
- **Loading state**: The UI state during an in-flight API call, characterised by a disabled action button and spinner or "Please wait…" text.
- **Receipt**: The content displayed on Step 5 showing confirmation code, submission timestamp, and blockchain reference.
- **txHash**: The blockchain transaction hash returned by `POST /api/votes` in `data.txHash`.
- **Confirmation code**: The value returned by `POST /api/votes` in `data.confirmationCode`.

## Requirements

### Requirement 1 — API Base URL Configuration

**User Story:** As a deployment operator, I want the API base URL defined as a single constant, so that I can change the target environment without hunting through the code.

#### Acceptance Criteria

1. THE VoterJS SHALL define a constant named `API_BASE` at the top of the module, defaulting to `"http://localhost:3000"`.
2. THE VoterJS SHALL prefix every API request URL with `API_BASE`.

---

### Requirement 2 — Voter Authentication (Step 2 → Step 3)

**User Story:** As a voter, I want my identity verified against the official voter roll, so that only registered voters can cast a ballot.

#### Acceptance Criteria

1. WHEN the identity form passes local validation, THE VoterJS SHALL call `POST /api/auth/login` with the body `{ voterId, fullName, dateOfBirth }` before advancing to Step 3.
2. WHEN `POST /api/auth/login` returns a successful response, THE VoterJS SHALL store the returned JWT in in-memory state and SHALL NOT write it to `localStorage` or any persistent storage.
3. WHEN `POST /api/auth/login` returns a successful response, THE VoterJS SHALL advance the wizard to Step 3.
4. WHEN `POST /api/auth/login` returns an error response, THE VoterJS SHALL display the API `message` field as an inline error on the identity form without advancing the wizard.
5. WHILE a `POST /api/auth/login` call is in flight, THE VoterJS SHALL disable the "Continue to Candidates" button and display a loading indicator.
6. WHEN the `POST /api/auth/login` call completes (success or error), THE VoterJS SHALL re-enable the "Continue to Candidates" button and remove the loading indicator.

---

### Requirement 3 — Live Candidate List (Step 3)

**User Story:** As a voter, I want to see the real list of candidates from the election system, so that I am choosing from the officially registered candidates.

#### Acceptance Criteria

1. WHEN the wizard enters Step 3, THE VoterJS SHALL call `GET /api/votes/candidates` to retrieve the candidate list.
2. WHILE `GET /api/votes/candidates` is in flight, THE VoterJS SHALL render a loading state inside the candidate list container and SHALL disable the "Review My Selection" button.
3. WHEN `GET /api/votes/candidates` returns a successful response, THE VoterJS SHALL render candidate cards from the API `data.candidates` array, replacing any previous content.
4. WHEN `GET /api/votes/candidates` returns a successful response, THE VoterJS SHALL re-enable the "Review My Selection" button.
5. IF `GET /api/votes/candidates` returns an error response, THEN THE VoterJS SHALL display an inline error message inside the candidate list container and SHALL keep the Back button accessible and enabled.
6. WHEN `GET /api/votes/candidates` returns candidate data, THE VoterJS SHALL render each candidate using the `id`, `name`, `party`, and `office` fields from the API response.

---

### Requirement 4 — Vote Submission (Step 4 → Step 5)

**User Story:** As a voter, I want my confirmed selection submitted to the blockchain-backed API, so that my vote is securely recorded.

#### Acceptance Criteria

1. WHEN the voter checks the confirmation checkbox and clicks "Submit My Vote", THE VoterJS SHALL call `POST /api/votes` with the header `Authorization: Bearer <JWT>` and the body `{ candidateId: <selectedCandidateId> }`.
2. WHEN `POST /api/votes` returns a successful response, THE VoterJS SHALL advance the wizard to Step 5.
3. WHILE a `POST /api/votes` call is in flight, THE VoterJS SHALL disable the "Submit My Vote" button, display a loading indicator, and disable the Back button on Step 4.
4. WHEN the `POST /api/votes` call completes (success or error), THE VoterJS SHALL re-enable the "Submit My Vote" button and the Back button.
5. IF `POST /api/votes` returns an error response, THEN THE VoterJS SHALL display the API `message` field as an inline error on Step 4 without advancing the wizard.

---

### Requirement 5 — Receipt Population (Step 5)

**User Story:** As a voter, I want the receipt screen to show real confirmation details from the API, so that I can verify my vote on the public ledger.

#### Acceptance Criteria

1. WHEN the wizard advances to Step 5 following a successful vote submission, THE VoterJS SHALL populate the receipt confirmation code field with `data.confirmationCode` from the `POST /api/votes` response.
2. WHEN the wizard advances to Step 5 following a successful vote submission, THE VoterJS SHALL populate the receipt timestamp field by formatting `data.timestamp` from the `POST /api/votes` response using the existing `formatTimestamp` function.
3. WHEN the wizard advances to Step 5 following a successful vote submission, THE VoterJS SHALL populate the blockchain reference field with `data.txHash` truncated to the format `0x<first-6-hex-chars>…<last-4-hex-chars>`.
4. THE VoterJS SHALL remove the `generateConfirmationCode` and `generateBlockReference` fake-data functions and SHALL NOT call them after this feature is implemented.

---

### Requirement 6 — Loading and Disabled States

**User Story:** As a voter, I want clear feedback when the system is processing my request, so that I do not accidentally submit twice or navigate away.

#### Acceptance Criteria

1. WHILE any API call is in flight, THE VoterJS SHALL set the action button for that step to `disabled` and update its visible label to indicate loading (e.g., "Please wait…").
2. WHEN an API call completes, THE VoterJS SHALL restore the action button label to its original text and remove the `disabled` attribute.
3. WHILE `POST /api/votes` is in flight, THE VoterJS SHALL also set `disabled` on the Back button within Step 4.
4. WHEN `POST /api/votes` completes, THE VoterJS SHALL remove `disabled` from the Back button within Step 4.

---

### Requirement 7 — Error Handling and Accessibility

**User Story:** As a voter, I want error messages shown near the relevant field in plain language, so that I understand what went wrong and can take corrective action.

#### Acceptance Criteria

1. THE VoterJS SHALL display API error messages using the `message` field from the API error response body.
2. THE VoterJS SHALL render all API error messages as inline text within the relevant step, not in modal dialogs or browser alerts.
3. WHEN an API error is displayed, THE VoterJS SHALL call the existing `announce` function with the error message to notify screen reader users.
4. WHEN an API call returns an error, THE VoterJS SHALL move focus to the inline error element so keyboard and screen reader users are directed to the message.
5. IF a network failure occurs (fetch rejects with no HTTP response), THEN THE VoterJS SHALL display a generic inline message: "A network error occurred. Please check your connection and try again."

---

### Requirement 8 — Preservation of Existing Accessibility Features

**User Story:** As a voter who uses assistive technology, I want all existing accessibility behaviours preserved after the API integration, so that the wizard remains usable with screen readers and keyboard navigation.

#### Acceptance Criteria

1. THE VoterJS SHALL preserve the `announce` function and all calls to it that were present before this feature.
2. THE VoterJS SHALL preserve all `aria-live` region behaviour present in the original implementation.
3. THE VoterJS SHALL preserve all focus-management calls (step heading focus on step transition) present in the original implementation.
4. THE VoterJS SHALL preserve keyboard navigation (Escape key triggers Back) present in the original implementation.
