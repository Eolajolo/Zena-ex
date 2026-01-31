const express = require('express');
const router = express.Router();
const accountController = require('./account.controller');
const { authenticate } = require('../auth/auth.middleware');

// All routes require authentication
router.use(authenticate);

// ==========================================
// Profile Routes
// ==========================================

// GET /api/account/profile - Get current user's profile
router.get('/profile', accountController.getProfile);

// PATCH /api/account/profile - Update current user's profile
router.patch('/profile', accountController.updateProfile);

// ==========================================
// Phone Update Routes
// ==========================================

// POST /api/account/phone/update - Request phone number update
router.post('/phone/update', accountController.requestPhoneUpdate);

// POST /api/account/phone/verify - Verify phone update OTP
router.post('/phone/verify', accountController.verifyPhoneUpdate);

// POST /api/account/phone/resend - Resend phone update OTP
router.post('/phone/resend', accountController.resendPhoneUpdateOTP);

// ==========================================
// Transaction PIN Routes
// ==========================================

// GET /api/account/pin/status - Get PIN status
router.get('/pin/status', accountController.getPinStatus);

// POST /api/account/pin/setup - Request PIN setup (sends OTP)
router.post('/pin/setup', accountController.requestPinSetup);

// POST /api/account/pin/verify-otp - Verify OTP for PIN setup
router.post('/pin/verify-otp', accountController.verifyPinSetupOTP);

// POST /api/account/pin/set - Set transaction PIN
router.post('/pin/set', accountController.setTransactionPin);

// POST /api/account/pin/verify - Verify transaction PIN
router.post('/pin/verify', accountController.verifyTransactionPin);

// POST /api/account/pin/change - Change transaction PIN
router.post('/pin/change', accountController.changeTransactionPin);

// ==========================================
// Two-Factor Authentication Routes
// ==========================================

// POST /api/account/2fa/enable - Enable 2FA
router.post('/2fa/enable', accountController.enable2FA);

// POST /api/account/2fa/disable - Disable 2FA
router.post('/2fa/disable', accountController.disable2FA);

// ==========================================
// Device Management Routes
// ==========================================

// GET /api/account/devices - Get all devices
router.get('/devices', accountController.getDevices);

// DELETE /api/account/devices/:deviceId - Remove a device
router.delete('/devices/:deviceId', accountController.removeDevice);

// ==========================================
// Bank Recipients Routes
// ==========================================

// GET /api/account/recipients/banks - Get all bank recipients
router.get('/recipients/banks', accountController.getBankRecipients);

// POST /api/account/recipients/banks - Add a bank recipient
router.post('/recipients/banks', accountController.addBankRecipient);

// DELETE /api/account/recipients/banks/:recipientId - Delete a bank recipient
router.delete('/recipients/banks/:recipientId', accountController.deleteBankRecipient);

// GET /api/account/recipients/banks/list - Get supported banks
router.get('/recipients/banks/list', accountController.getSupportedBanks);

// POST /api/account/recipients/banks/verify - Verify bank account
router.post('/recipients/banks/verify', accountController.verifyBankAccount);

// ==========================================
// Wallet Recipients Routes
// ==========================================

// GET /api/account/recipients/wallets - Get all wallet recipients
router.get('/recipients/wallets', accountController.getWalletRecipients);

// POST /api/account/recipients/wallets - Add a wallet recipient
router.post('/recipients/wallets', accountController.addWalletRecipient);

// DELETE /api/account/recipients/wallets/:recipientId - Delete a wallet recipient
router.delete('/recipients/wallets/:recipientId', accountController.deleteWalletRecipient);

// GET /api/account/recipients/users/search - Search Zena users
router.get('/recipients/users/search', accountController.searchUsers);

// ==========================================
// Account Deletion Routes
// ==========================================

// POST /api/account/delete/request - Request account deletion
router.post('/delete/request', accountController.requestAccountDeletion);

// POST /api/account/delete/confirm - Confirm account deletion
router.post('/delete/confirm', accountController.confirmAccountDeletion);

// ==========================================
// Security Routes
// ==========================================

// GET /api/account/security/logs - Get security logs
router.get('/security/logs', accountController.getSecurityLogs);

// ==========================================
// KYC Routes
// ==========================================

// GET /api/account/kyc - Get KYC status and requirements
router.get('/kyc', accountController.getKycStatus);

// POST /api/account/verify-phone - Verify phone number (legacy)
router.post('/verify-phone', accountController.verifyPhone);

// POST /api/account/verify-email - Verify email (legacy)
router.post('/verify-email', accountController.verifyEmail);

// POST /api/account/deactivate - Deactivate account (legacy)
router.post('/deactivate', accountController.deactivateAccount);

// ==========================================
// Admin Routes
// ==========================================

// GET /api/account/users - Get all users
router.get('/users', accountController.getAllUsers);

// GET /api/account/users/:id - Get user by ID
router.get('/users/:id', accountController.getUserById);

module.exports = router;
