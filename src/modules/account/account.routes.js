const express = require('express');
const router = express.Router();
const accountController = require('./account.controller');
const { authenticate } = require('../auth/auth.middleware');

// All routes require authentication
router.use(authenticate);

// GET /api/account/profile - Get current user's profile
router.get('/profile', accountController.getProfile);

// PATCH /api/account/profile - Update current user's profile
router.patch('/profile', accountController.updateProfile);

// GET /api/account/kyc - Get KYC status and requirements
router.get('/kyc', accountController.getKycStatus);

// POST /api/account/verify-phone - Verify phone number
router.post('/verify-phone', accountController.verifyPhone);

// POST /api/account/verify-email - Verify email
router.post('/verify-email', accountController.verifyEmail);

// POST /api/account/deactivate - Deactivate account
router.post('/deactivate', accountController.deactivateAccount);

// Admin routes
// GET /api/account/users - Get all users
router.get('/users', accountController.getAllUsers);

// GET /api/account/users/:id - Get user by ID
router.get('/users/:id', accountController.getUserById);

module.exports = router;
