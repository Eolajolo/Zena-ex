const { logger } = require('../utils');
const { ERROR_CODES } = require('../constants');

// In-memory store for rate limiting (replace with Redis in production)
const requestCounts = new Map();

// Clean up old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > 60000) {
      requestCounts.delete(key);
    }
  }
}, 60000);

/**
 * Create rate limiter middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests per window
 * @param {string} options.message - Error message
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 60000,    // 1 minute
    max = 100,           // 100 requests per window
    message = 'Too many requests, please try again later'
  } = options;

  return (req, res, next) => {
    // Use IP + path as key (can also use user ID if authenticated)
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();

    let data = requestCounts.get(key);

    if (!data || now - data.windowStart > windowMs) {
      // Start new window
      data = { count: 1, windowStart: now };
      requestCounts.set(key, data);
    } else {
      data.count++;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - data.count));
    res.setHeader('X-RateLimit-Reset', new Date(data.windowStart + windowMs).toISOString());

    if (data.count > max) {
      logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });

      return res.status(429).json({
        success: false,
        errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message,
        retryAfter: Math.ceil((data.windowStart + windowMs - now) / 1000)
      });
    }

    next();
  };
};

// Pre-configured rate limiters
const rateLimiters = {
  // General API rate limit
  api: createRateLimiter({
    windowMs: 60000,
    max: 100,
    message: 'Too many requests, please try again later'
  }),

  // Strict limit for auth endpoints
  auth: createRateLimiter({
    windowMs: 900000,  // 15 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again in 15 minutes'
  }),

  // OTP/verification endpoints
  verification: createRateLimiter({
    windowMs: 300000,  // 5 minutes
    max: 3,
    message: 'Too many verification attempts, please try again in 5 minutes'
  }),

  // Transaction endpoints
  transactions: createRateLimiter({
    windowMs: 60000,
    max: 20,
    message: 'Too many transaction requests, please slow down'
  })
};

module.exports = {
  createRateLimiter,
  rateLimiters
};
