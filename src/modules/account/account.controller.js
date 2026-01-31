const AccountService = require('./account.service');
const RecipientsService = require('./recipients.service');
const SecurityService = require('./security.service');
const { logger } = require('../../shared/utils');

// ==========================================
// Profile
// ==========================================

/**
 * Get current user's profile
 * GET /api/account/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const profile = AccountService.getProfile(req.user.id);

    res.status(200).json({
      success: true,
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update current user's profile
 * PATCH /api/account/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const profile = AccountService.updateProfile(req.user.id, req.body);

    logger.info('Profile updated', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Phone Number Update
// ==========================================

/**
 * Request phone number update
 * POST /api/account/phone/update
 */
const requestPhoneUpdate = async (req, res, next) => {
  try {
    const { countryCode, phoneNumber } = req.body;
    const result = await AccountService.requestPhoneUpdate(req.user.id, countryCode, phoneNumber);

    logger.info('Phone update requested', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        phone: result.phone,
        expiresInMinutes: result.expiresInMinutes,
        ...(result.otp && { otp: result.otp })
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify phone update OTP
 * POST /api/account/phone/verify
 */
const verifyPhoneUpdate = async (req, res, next) => {
  try {
    const { otp } = req.body;
    const result = AccountService.verifyPhoneUpdate(req.user.id, otp);

    SecurityService.logSecurityEvent(req.user.id, 'phone_updated');
    logger.info('Phone updated', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message,
      data: { user: result.user }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend phone update OTP
 * POST /api/account/phone/resend
 */
const resendPhoneUpdateOTP = async (req, res, next) => {
  try {
    const result = await AccountService.resendPhoneUpdateOTP(req.user.id);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        phone: result.phone,
        ...(result.otp && { otp: result.otp })
      }
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Transaction PIN
// ==========================================

/**
 * Request PIN setup (sends OTP)
 * POST /api/account/pin/setup
 */
const requestPinSetup = async (req, res, next) => {
  try {
    const result = await AccountService.requestPinSetup(req.user.id);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: result.email,
        expiresInMinutes: result.expiresInMinutes,
        ...(result.otp && { otp: result.otp })
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify PIN setup OTP
 * POST /api/account/pin/verify-otp
 */
const verifyPinSetupOTP = async (req, res, next) => {
  try {
    const { otp } = req.body;
    const result = AccountService.verifyPinSetupOTP(req.user.id, otp);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        pinSetupToken: result.pinSetupToken,
        expiresInMinutes: result.expiresInMinutes
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set transaction PIN
 * POST /api/account/pin/set
 */
const setTransactionPin = async (req, res, next) => {
  try {
    const { pinSetupToken, pin, confirmPin } = req.body;
    const result = await AccountService.setTransactionPin(req.user.id, pinSetupToken, pin, confirmPin);

    SecurityService.logSecurityEvent(req.user.id, 'pin_set');
    logger.info('Transaction PIN set', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change transaction PIN
 * POST /api/account/pin/change
 */
const changeTransactionPin = async (req, res, next) => {
  try {
    const { currentPin, newPin, confirmPin } = req.body;
    const result = await AccountService.changeTransactionPin(req.user.id, currentPin, newPin, confirmPin);

    SecurityService.logSecurityEvent(req.user.id, 'pin_changed');
    logger.info('Transaction PIN changed', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user has PIN set
 * GET /api/account/pin/status
 */
const getPinStatus = async (req, res, next) => {
  try {
    const hasPin = AccountService.hasTransactionPin(req.user.id);

    res.status(200).json({
      success: true,
      data: { hasTransactionPin: hasPin }
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2FA
// ==========================================

/**
 * Enable 2FA
 * POST /api/account/2fa/enable
 */
const enable2FA = async (req, res, next) => {
  try {
    const result = AccountService.enable2FA(req.user.id);

    SecurityService.logSecurityEvent(req.user.id, '2fa_enabled');
    logger.info('2FA enabled', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disable 2FA
 * POST /api/account/2fa/disable
 */
const disable2FA = async (req, res, next) => {
  try {
    const result = AccountService.disable2FA(req.user.id);

    SecurityService.logSecurityEvent(req.user.id, '2fa_disabled');
    logger.info('2FA disabled', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Device Management
// ==========================================

/**
 * Get all devices
 * GET /api/account/devices
 */
const getDevices = async (req, res, next) => {
  try {
    const result = SecurityService.getDevices(req.user.id);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a device
 * DELETE /api/account/devices/:deviceId
 */
const removeDevice = async (req, res, next) => {
  try {
    const currentDeviceId = req.headers['x-device-id'];
    const result = SecurityService.removeDevice(req.user.id, req.params.deviceId, currentDeviceId);

    SecurityService.logSecurityEvent(req.user.id, 'device_removed', { deviceId: req.params.deviceId });
    logger.info('Device removed', { userId: req.user.id, deviceId: req.params.deviceId });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Recipients - Bank Accounts
// ==========================================

/**
 * Get all bank recipients
 * GET /api/account/recipients/banks
 */
const getBankRecipients = async (req, res, next) => {
  try {
    const { search } = req.query;
    const result = RecipientsService.getBankRecipients(req.user.id, search);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add bank recipient
 * POST /api/account/recipients/banks
 */
const addBankRecipient = async (req, res, next) => {
  try {
    const result = RecipientsService.addBankRecipient(req.user.id, req.body);

    logger.info('Bank recipient added', { userId: req.user.id });

    res.status(201).json({
      success: true,
      message: result.message,
      data: { recipient: result.recipient }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete bank recipient
 * DELETE /api/account/recipients/banks/:id
 */
const deleteBankRecipient = async (req, res, next) => {
  try {
    const result = RecipientsService.deleteBankRecipient(req.user.id, req.params.id);

    logger.info('Bank recipient deleted', { userId: req.user.id, recipientId: req.params.id });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supported banks
 * GET /api/account/recipients/banks/list
 */
const getBanksList = async (req, res, next) => {
  try {
    const result = RecipientsService.getBanks();

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify bank account
 * POST /api/account/recipients/banks/verify
 */
const verifyBankAccount = async (req, res, next) => {
  try {
    const { bankCode, accountNumber } = req.body;
    const result = await RecipientsService.verifyBankAccount(bankCode, accountNumber);

    res.status(200).json({
      success: true,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Recipients - Wallets
// ==========================================

/**
 * Get all wallet recipients
 * GET /api/account/recipients/wallets
 */
const getWalletRecipients = async (req, res, next) => {
  try {
    const { search } = req.query;
    const result = RecipientsService.getWalletRecipients(req.user.id, search);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add wallet recipient by username
 * POST /api/account/recipients/wallets
 */
const addWalletRecipient = async (req, res, next) => {
  try {
    const { username } = req.body;
    const result = RecipientsService.addWalletRecipientByUsername(req.user.id, username);

    logger.info('Wallet recipient added', { userId: req.user.id });

    res.status(201).json({
      success: true,
      message: result.message,
      data: { recipient: result.recipient }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete wallet recipient
 * DELETE /api/account/recipients/wallets/:id
 */
const deleteWalletRecipient = async (req, res, next) => {
  try {
    const result = RecipientsService.deleteWalletRecipient(req.user.id, req.params.id);

    logger.info('Wallet recipient deleted', { userId: req.user.id, recipientId: req.params.id });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search Zena users
 * GET /api/account/recipients/wallets/search
 */
const searchUsers = async (req, res, next) => {
  try {
    const { q } = req.query;
    const result = RecipientsService.searchUsers(q, req.user.id);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Account Deletion
// ==========================================

/**
 * Request account deletion
 * POST /api/account/delete/request
 */
const requestAccountDeletion = async (req, res, next) => {
  try {
    const result = await AccountService.requestAccountDeletion(req.user.id);

    logger.info('Account deletion requested', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: result.email,
        ...(result.otp && { otp: result.otp })
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm account deletion
 * POST /api/account/delete/confirm
 */
const confirmAccountDeletion = async (req, res, next) => {
  try {
    const { otp } = req.body;
    const result = AccountService.deleteAccount(req.user.id, otp);

    logger.info('Account deleted', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Other
// ==========================================

/**
 * Get all users (admin only)
 * GET /api/account/users
 */
const getAllUsers = async (req, res, next) => {
  try {
    const { kycLevel, isVerified } = req.query;

    const filters = {};
    if (kycLevel !== undefined) filters.kycLevel = parseInt(kycLevel);
    if (isVerified !== undefined) filters.isVerified = isVerified === 'true';

    const result = AccountService.getAllUsers(filters);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID
 * GET /api/account/users/:id
 */
const getUserById = async (req, res, next) => {
  try {
    const profile = AccountService.getProfile(req.params.id);

    res.status(200).json({
      success: true,
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get KYC status
 * GET /api/account/kyc
 */
const getKycStatus = async (req, res, next) => {
  try {
    const profile = AccountService.getProfile(req.user.id);

    const kycRequirements = {
      0: { name: 'None', limits: { daily: 0, perTransaction: 0 } },
      1: { name: 'Phone Verified', limits: { daily: 50000, perTransaction: 10000 }, required: ['phone'] },
      2: { name: 'BVN Verified', limits: { daily: 500000, perTransaction: 100000 }, required: ['phone', 'bvn'] },
      3: { name: 'Full KYC', limits: { daily: 5000000, perTransaction: 1000000 }, required: ['phone', 'bvn', 'id', 'address'] }
    };

    res.status(200).json({
      success: true,
      data: {
        currentLevel: profile.kycLevel,
        currentLevelName: kycRequirements[profile.kycLevel]?.name,
        limits: kycRequirements[profile.kycLevel]?.limits,
        nextLevel: profile.kycLevel < 3 ? {
          level: profile.kycLevel + 1,
          name: kycRequirements[profile.kycLevel + 1]?.name,
          required: kycRequirements[profile.kycLevel + 1]?.required,
          limits: kycRequirements[profile.kycLevel + 1]?.limits
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get security logs
 * GET /api/account/security/logs
 */
const getSecurityLogs = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const result = SecurityService.getSecurityLogs(req.user.id, limit ? parseInt(limit) : 20);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Profile
  getProfile,
  updateProfile,

  // Phone update
  requestPhoneUpdate,
  verifyPhoneUpdate,
  resendPhoneUpdateOTP,

  // Transaction PIN
  requestPinSetup,
  verifyPinSetupOTP,
  setTransactionPin,
  changeTransactionPin,
  getPinStatus,

  // 2FA
  enable2FA,
  disable2FA,

  // Devices
  getDevices,
  removeDevice,

  // Recipients - Banks
  getBankRecipients,
  addBankRecipient,
  deleteBankRecipient,
  getBanksList,
  verifyBankAccount,

  // Recipients - Wallets
  getWalletRecipients,
  addWalletRecipient,
  deleteWalletRecipient,
  searchUsers,

  // Account deletion
  requestAccountDeletion,
  confirmAccountDeletion,

  // Other
  getAllUsers,
  getUserById,
  getKycStatus,
  getSecurityLogs
};
