const { logger } = require('../utils');
const { ERROR_CODES } = require('../constants');

class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = ERROR_CODES.INTERNAL_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation Error
class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, ERROR_CODES.VALIDATION_ERROR);
    this.errors = errors;
  }
}

// Authentication Error
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, ERROR_CODES.AUTHENTICATION_ERROR);
  }
}

// Authorization Error
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, ERROR_CODES.AUTHORIZATION_ERROR);
  }
}

// Not Found Error
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, ERROR_CODES.NOT_FOUND);
  }
}

// Duplicate Entry Error
class DuplicateError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, ERROR_CODES.DUPLICATE_ENTRY);
  }
}

// Insufficient Balance Error
class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient balance') {
    super(message, 400, ERROR_CODES.INSUFFICIENT_BALANCE);
  }
}

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Error occurred', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // If it's an operational error we created
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      errorCode: err.errorCode,
      message: err.message,
      ...(err.errors && { errors: err.errors })
    });
  }

  // For unexpected errors, don't leak details
  return res.status(500).json({
    success: false,
    errorCode: ERROR_CODES.INTERNAL_ERROR,
    message: 'An unexpected error occurred'
  });
};

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    errorCode: ERROR_CODES.NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`
  });
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DuplicateError,
  InsufficientBalanceError,
  errorHandler,
  notFoundHandler
};
