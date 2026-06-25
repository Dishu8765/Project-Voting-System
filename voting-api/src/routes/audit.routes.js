const express = require('express');
const {
  confirmationCodeRules,
  transactionHashRules,
  voteHashRules
} = require('../middleware/validators');
const { validate } = require('../middleware/errorHandler');
const auditService = require('../services/audit.service');

const router = express.Router();

/**
 * GET /api/audit/summary
 * High-level audit overview for election officials.
 */
router.get('/summary', (req, res, next) => {
  try {
    const summary = auditService.getAuditSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/audit/verify/code/:confirmationCode
 * Verify a vote using the voter's confirmation code.
 */
router.get(
  '/verify/code/:confirmationCode',
  ...confirmationCodeRules,
  validate,
  (req, res, next) => {
    try {
      const result = auditService.verifyByConfirmationCode(req.params.confirmationCode);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/audit/verify/transaction/:txHash
 * Verify a vote using the blockchain transaction hash.
 */
router.get(
  '/verify/transaction/:txHash',
  ...transactionHashRules,
  validate,
  async (req, res, next) => {
    try {
      const result = await auditService.verifyByTransactionHash(req.params.txHash);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/audit/verify/hash
 * Verify that a vote hash exists on the blockchain.
 */
router.post('/verify/hash', ...voteHashRules, validate, async (req, res, next) => {
  try {
    const result = await auditService.verifyVoteHash(req.body.voteHash);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
