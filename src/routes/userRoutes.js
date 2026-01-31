const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const {
  registerValidation,
  usernameCheckValidation,
  referralCodeValidation,
  settingsValidation,
  handleValidationErrors
} = require('../middleware/validation');

// GET /api/users/country-codes - Get supported country codes
router.get('/country-codes', userController.getCountryCodes);

// GET /api/users/check-username/:username - Check username availability
router.get(
  '/check-username/:username',
  usernameCheckValidation,
  handleValidationErrors,
  userController.checkUsername
);

// GET /api/users/validate-referral/:code - Validate referral code
router.get(
  '/validate-referral/:code',
  referralCodeValidation,
  handleValidationErrors,
  userController.validateReferralCode
);

// POST /api/users/check-password - Check password strength (real-time validation)
router.post('/check-password', userController.checkPassword);

// POST /api/users/register - Create new user account
router.post(
  '/register',
  registerValidation,
  handleValidationErrors,
  userController.createAccount
);

// PATCH /api/users/:id/settings - Update user settings (biometric, faceId, notifications)
router.patch(
  '/:id/settings',
  settingsValidation,
  handleValidationErrors,
  userController.updateSettings
);

// GET /api/users - Get all users
router.get('/', userController.getAllUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', userController.getUserById);

module.exports = router;
