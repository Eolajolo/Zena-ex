const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { registerValidation, loginValidation } = require('./auth.validation');
const { handleValidationErrors, authenticate } = require('./auth.middleware');
const { rateLimiters } = require('../../shared/middleware');

// Public routes (no auth required)

// GET /api/auth/country-codes - Get supported country codes
router.get('/country-codes', authController.getCountryCodes);

// GET /api/auth/check-username/:username - Check username availability
router.get('/check-username/:username', authController.checkUsername);

// GET /api/auth/validate-referral/:code - Validate referral code
router.get('/validate-referral/:code', authController.validateReferralCode);

// POST /api/auth/check-password - Check password strength
router.post('/check-password', authController.checkPassword);

// POST /api/auth/register - Register new user
router.post(
  '/register',
  rateLimiters.auth,
  registerValidation,
  handleValidationErrors,
  authController.register
);

// POST /api/auth/login - Login user
router.post(
  '/login',
  rateLimiters.auth,
  loginValidation,
  handleValidationErrors,
  authController.login
);

// Protected routes (auth required)

// POST /api/auth/logout - Logout user
router.post('/logout', authenticate, authController.logout);

// GET /api/auth/me - Get current user
router.get('/me', authenticate, authController.getCurrentUser);

// PATCH /api/auth/settings - Update user settings
router.patch('/settings', authenticate, authController.updateSettings);

module.exports = router;
