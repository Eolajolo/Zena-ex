const AccountService = require('./account.service');
const { logger } = require('../../shared/utils');

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
 * Verify phone (after OTP verification)
 * POST /api/account/verify-phone
 */
const verifyPhone = async (req, res, next) => {
  try {
    // In production, this would verify OTP first
    const profile = AccountService.verifyPhone(req.user.id);

    logger.info('Phone verified', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify email (after email link clicked)
 * POST /api/account/verify-email
 */
const verifyEmail = async (req, res, next) => {
  try {
    // In production, this would verify email token first
    const profile = AccountService.verifyEmail(req.user.id);

    logger.info('Email verified', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deactivate account
 * POST /api/account/deactivate
 */
const deactivateAccount = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const profile = AccountService.deactivateAccount(req.user.id, reason);

    logger.info('Account deactivated', { userId: req.user.id, reason });

    res.status(200).json({
      success: true,
      message: 'Account deactivated successfully',
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get KYC status and requirements
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

module.exports = {
  getProfile,
  updateProfile,
  getAllUsers,
  getUserById,
  verifyPhone,
  verifyEmail,
  deactivateAccount,
  getKycStatus
};
