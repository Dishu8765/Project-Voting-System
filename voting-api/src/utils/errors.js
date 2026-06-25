class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', meta = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.meta = meta;
  }
}

const USER_MESSAGES = {
  INVALID_CREDENTIALS: 'The voter ID, name, or date of birth does not match our records. Please check your information and try again.',
  ALREADY_VOTED: 'A vote has already been recorded for this voter ID. Each person may vote only once.',
  UNAUTHORIZED: 'Your session has expired or is invalid. Please sign in again.',
  INVALID_CANDIDATE: 'The selected candidate is not on the ballot. Please choose from the listed candidates.',
  VOTE_NOT_FOUND: 'We could not find a vote matching that confirmation code. Please check the code and try again.',
  TX_NOT_FOUND: 'We could not find a transaction matching that reference. Please check the number and try again.',
  VALIDATION_FAILED: 'Some of the information you entered is not valid. Please review the form and try again.',
  RATE_LIMITED: 'Too many sign-in attempts. Please wait a few minutes before trying again.',
  BLOCKCHAIN_ERROR: 'Your vote could not be recorded at this time. Please try again or ask a poll worker for help.',
  NOT_FOUND: 'The page or resource you requested was not found.',
  SERVER_ERROR: 'Something went wrong on our end. Please try again in a moment.'
};

module.exports = { AppError, USER_MESSAGES };
