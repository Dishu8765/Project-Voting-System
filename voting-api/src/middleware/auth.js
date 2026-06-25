const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError, USER_MESSAGES } = require('../utils/errors');

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError(USER_MESSAGES.UNAUTHORIZED, 401, 'UNAUTHORIZED'));
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.voter = { voterId: payload.voterId };
    next();
  } catch {
    next(new AppError(USER_MESSAGES.UNAUTHORIZED, 401, 'UNAUTHORIZED'));
  }
}

module.exports = { authenticate };
