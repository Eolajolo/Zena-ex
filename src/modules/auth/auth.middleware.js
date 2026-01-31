const { validationResult } = require('express-validator');
const AuthService = require('./auth.service');
const { AuthenticationError, ValidationError } = require('../../shared/middleware');

/**
 * Handle validation errors from express-validator
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: formattedErrors
    });
  }

  next();
};

/**
 * Authenticate user via token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.replace('Bearer ', '');
    const user = await AuthService.getUserByToken(token);

    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const user = await AuthService.getUserByToken(token);
      req.user = user;
      req.token = token;
    }

    next();
  } catch (error) {
    // Silently continue without user
    next();
  }
};

/**
 * Check if user has required KYC level
 */
const requireKycLevel = (minLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (req.user.kycLevel < minLevel) {
      return res.status(403).json({
        success: false,
        message: `KYC level ${minLevel} required. Current level: ${req.user.kycLevel}`,
        data: {
          requiredLevel: minLevel,
          currentLevel: req.user.kycLevel
        }
      });
    }

    next();
  };
};

module.exports = {
  handleValidationErrors,
  authenticate,
  optionalAuth,
  requireKycLevel
};
