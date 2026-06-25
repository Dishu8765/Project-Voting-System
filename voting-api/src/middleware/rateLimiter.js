const rateLimit = require('express-rate-limit');
const config = require('../config');
const { USER_MESSAGES } = require('../utils/errors');

const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: USER_MESSAGES.RATE_LIMITED
  },
  handler(req, res) {
    res.status(429).json({
      success: false,
      message: USER_MESSAGES.RATE_LIMITED
    });
  }
});

module.exports = { authRateLimiter };
