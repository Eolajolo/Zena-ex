const { body } = require('express-validator');
const { COUNTRY_CODES } = require('../../shared/constants');

const countryCodeValues = COUNTRY_CODES.map(c => c.code);

// Step 1 validation - Account details
const registerStep1Validation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^@?[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),

  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),

  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),

  body('countryCode')
    .trim()
    .notEmpty()
    .withMessage('Country code is required')
    .custom((value) => {
      if (!countryCodeValues.includes(value)) {
        throw new Error('Invalid country code');
      }
      return true;
    }),

  body('phoneNumber')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^[0-9]{7,15}$/)
    .withMessage('Phone number must be 7-15 digits'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('referralCode')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 4, max: 20 })
    .withMessage('Referral code must be between 4 and 20 characters')
    .matches(/^[a-zA-Z0-9]+$/)
    .withMessage('Referral code can only contain letters and numbers'),

  body('termsAccepted')
    .notEmpty()
    .withMessage('You must accept the Terms of Use and Privacy Policy')
    .isBoolean()
    .withMessage('Terms acceptance must be a boolean')
    .custom((value) => {
      if (value !== true) {
        throw new Error('You must accept the Terms of Use and Privacy Policy');
      }
      return true;
    })
];

// Step 2 validation - Password setup
const registerStep2Validation = [
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Use at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Use at least one uppercase letter')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Use at least one special character'),

  body('confirmPassword')
    .notEmpty()
    .withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords must match');
      }
      return true;
    })
];

// Full registration validation (both steps)
const registerValidation = [...registerStep1Validation, ...registerStep2Validation];

// Login validation
const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Password strength checker
const checkPasswordStrength = (password) => {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };

  const allPassed = Object.values(checks).every((check) => check);

  return {
    valid: allPassed,
    checks
  };
};

module.exports = {
  registerStep1Validation,
  registerStep2Validation,
  registerValidation,
  loginValidation,
  checkPasswordStrength
};
