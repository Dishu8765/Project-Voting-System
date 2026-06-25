const { body, param } = require('express-validator');

const loginRules = [
  body('voterId')
    .trim()
    .notEmpty()
    .withMessage('Voter ID is required.')
    .matches(/^[A-Za-z0-9]{6,12}$/)
    .withMessage('Voter ID must be 6 to 12 letters or numbers.'),
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required.')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters.'),
  body('dateOfBirth')
    .notEmpty()
    .withMessage('Date of birth is required.')
    .isISO8601({ strict: true })
    .withMessage('Date of birth must be a valid date (YYYY-MM-DD).')
];

const submitVoteRules = [
  body('candidateId')
    .trim()
    .notEmpty()
    .withMessage('Please select a candidate.')
    .matches(/^c[0-9]+$/)
    .withMessage('Invalid candidate selection.')
];

const confirmationCodeRules = [
  param('confirmationCode')
    .trim()
    .notEmpty()
    .matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    .withMessage('Confirmation code must be in the format XXXX-XXXX-XXXX.')
];

const transactionHashRules = [
  param('txHash')
    .trim()
    .notEmpty()
    .matches(/^0x[a-fA-F0-9]{64}$/)
    .withMessage('Transaction hash must start with 0x followed by 64 hexadecimal characters.')
];

const voteHashRules = [
  body('voteHash')
    .trim()
    .notEmpty()
    .matches(/^[a-fA-F0-9]{64}$/)
    .withMessage('Vote hash must be 64 hexadecimal characters.')
];

module.exports = {
  loginRules,
  submitVoteRules,
  confirmationCodeRules,
  transactionHashRules,
  voteHashRules
};
