const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique ID
 */
const generateId = () => uuidv4();

/**
 * Generate a reference code for transactions
 * Format: ZEN-{TYPE}-{TIMESTAMP}-{RANDOM}
 */
const generateReference = (type = 'TXN') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ZEN-${type}-${timestamp}-${random}`;
};

/**
 * Format currency amount
 */
const formatCurrency = (amount, currency = 'NGN') => {
  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency
  });
  return formatter.format(amount);
};

/**
 * Mask sensitive data (email, phone)
 */
const maskEmail = (email) => {
  const [local, domain] = email.split('@');
  const maskedLocal = local.charAt(0) + '***' + local.charAt(local.length - 1);
  return `${maskedLocal}@${domain}`;
};

const maskPhone = (phone) => {
  if (phone.length < 8) return '****';
  return phone.slice(0, 4) + '****' + phone.slice(-3);
};

/**
 * Sanitize user input
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
};

/**
 * Check if value is empty
 */
const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

/**
 * Sleep utility for delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a function with exponential backoff
 */
const retry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, i));
      }
    }
  }

  throw lastError;
};

module.exports = {
  generateId,
  generateReference,
  formatCurrency,
  maskEmail,
  maskPhone,
  sanitizeString,
  isEmpty,
  sleep,
  retry
};
