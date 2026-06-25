const express = require('express');
const { loginRules } = require('../middleware/validators');
const { validate } = require('../middleware/errorHandler');
const { authRateLimiter } = require('../middleware/rateLimiter');
const voterService = require('../services/voter.service');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate a voter and return a session token.
 */
router.post('/login', authRateLimiter, ...loginRules, validate, (req, res, next) => {
  try {
    const { voterId, fullName, dateOfBirth } = req.body;
    const result = voterService.authenticateVoter({ voterId, fullName, dateOfBirth });

    res.json({
      success: true,
      message: 'You have been verified. You may now cast your vote.',
      data: result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
