const { validationResult } = require('express-validator');
const { AppError, USER_MESSAGES } = require('../utils/errors');
const logger = require('../utils/logger');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const fields = errors.array().map((e) => e.path);
    return next(
      new AppError(USER_MESSAGES.VALIDATION_FAILED, 400, 'VALIDATION_FAILED', { fields })
    );
  }
  next();
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : USER_MESSAGES.SERVER_ERROR;

  if (!err.isOperational) {
    logger.error('Unexpected server error', {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: err.stack
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.code && { code: err.code }),
    ...(err.meta && { details: err.meta })
  });
}

function notFoundHandler(req, res, next) {
  next(new AppError(USER_MESSAGES.NOT_FOUND, 404, 'NOT_FOUND'));
}

module.exports = { validate, errorHandler, notFoundHandler };
