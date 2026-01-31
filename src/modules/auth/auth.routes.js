const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const {
  registerValidation,
  loginValidation,
  registerStep2Validation
} = require('./auth.validation');
const { handleValidationErrors, authenticate } = require('./auth.middleware');
const { rateLimiters } = require('../../shared/middleware');

// ==========================================
// Public routes (no auth required)
// ==========================================

// GET /api/auth/country-codes - Get supported country codes
router.get('/country-codes', authController.getCountryCodes);

// GET /api/auth/check-username/:username - Check username availability
router.get('/check-username/:username', authController.checkUsername);

// GET /api/auth/validate-referral/:code - Validate referral code
router.get('/validate-referral/:code', authController.validateReferralCode);

// POST /api/auth/check-password - Check password strength
router.post('/check-password', authController.checkPassword);

// GET /api/auth/remembered-user - Get remembered user for device (for subsequent login UI)
router.get('/remembered-user', authController.getRememberedUser);

// ==========================================
// Registration
// ==========================================

// POST /api/auth/register - Register new user
router.post(
  '/register',
  rateLimiters.auth,
  registerValidation,
  handleValidationErrors,
  authController.register
);

// ==========================================
// Login
// ==========================================

// POST /api/auth/login - Login user
router.post(
  '/login',
  rateLimiters.auth,
  loginValidation,
  handleValidationErrors,
  authController.login
);

// POST /api/auth/biometric-login - Login with biometric (subsequent login)
router.post(
  '/biometric-login',
  rateLimiters.auth,
  authController.biometricLogin
);

// ==========================================
// Forgot Password Flow
// ==========================================

// POST /api/auth/forgot-password - Request password reset (Step 1)
router.post(
  '/forgot-password',
  rateLimiters.verification,
  authController.forgotPassword
);

// POST /api/auth/forgot-password/verify - Verify OTP (Step 2)
router.post(
  '/forgot-password/verify',
  rateLimiters.verification,
  authController.verifyPasswordResetOTP
);

// POST /api/auth/forgot-password/resend - Resend OTP
router.post(
  '/forgot-password/resend',
  rateLimiters.verification,
  authController.resendPasswordResetOTP
);

// GET /api/auth/forgot-password/resend-status - Check resend cooldown
router.get('/forgot-password/resend-status', authController.getResendStatus);

// POST /api/auth/reset-password - Reset password (Step 3)
router.post(
  '/reset-password',
  rateLimiters.auth,
  registerStep2Validation, // Reuse password validation
  handleValidationErrors,
  authController.resetPassword
);

// ==========================================
// Protected routes (auth required)
// ==========================================

// POST /api/auth/logout - Logout user
router.post('/logout', authenticate, authController.logout);

// POST /api/auth/logout-all - Logout from all devices
router.post('/logout-all', authenticate, authController.logoutAll);

// GET /api/auth/me - Get current user
router.get('/me', authenticate, authController.getCurrentUser);

// PATCH /api/auth/settings - Update user settings
router.patch('/settings', authenticate, authController.updateSettings);

// POST /api/auth/change-password - Change password (for logged in user)
router.post(
  '/change-password',
  authenticate,
  registerStep2Validation,
  handleValidationErrors,
  authController.changePassword
);

// ==========================================
// Biometric Management
// ==========================================

// POST /api/auth/biometric/enable - Enable biometric login
router.post('/biometric/enable', authenticate, authController.enableBiometric);

// POST /api/auth/biometric/disable - Disable biometric login
router.post('/biometric/disable', authenticate, authController.disableBiometric);

module.exports = router;
