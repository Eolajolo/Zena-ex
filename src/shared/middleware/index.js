const { errorHandler, notFoundHandler, AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, DuplicateError, InsufficientBalanceError } = require('./errorHandler');
const { createRateLimiter, rateLimiters } = require('./rateLimit');

module.exports = {
  // Error handling
  errorHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DuplicateError,
  InsufficientBalanceError,

  // Rate limiting
  createRateLimiter,
  rateLimiters
};
