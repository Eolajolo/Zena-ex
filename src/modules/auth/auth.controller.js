const AuthService = require('./auth.service');
const OTPService = require('./otp.service');
const { checkPasswordStrength } = require('./auth.validation');
const { COUNTRY_CODES } = require('../../shared/constants');
const { logger } = require('../../shared/utils');

/**
 * Check username availability
 * GET /api/auth/check-username/:username
 */
const checkUsername = async (req, res, next) => {
  try {
    const { username } = req.params;
    const isAvailable = AuthService.isUsernameAvailable(username);

    res.status(200).json({
      success: true,
      data: {
        username: username.startsWith('@') ? username : `@${username}`,
        available: isAvailable,
        message: isAvailable ? 'Username is available' : 'Username already taken'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate referral code
 * GET /api/auth/validate-referral/:code
 */
const validateReferralCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const validation = AuthService.validateReferralCode(code);

    if (validation.valid && code) {
      res.status(200).json({
        success: true,
        data: {
          code: code.toUpperCase(),
          valid: true,
          discount: validation.discount,
          message: validation.message
        }
      });
    } else if (!code) {
      res.status(200).json({
        success: true,
        data: {
          valid: true,
          message: 'No referral code provided'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        data: {
          code,
          valid: false,
          message: validation.message
        }
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Check password strength
 * POST /api/auth/check-password
 */
const checkPassword = async (req, res, next) => {
  try {
    const { password, confirmPassword } = req.body;

    const strength = checkPasswordStrength(password || '');
    const passwordsMatch = password === confirmPassword;

    res.status(200).json({
      success: true,
      data: {
        checks: {
          passwordsMatch,
          minLength: strength.checks.minLength,
          hasUppercase: strength.checks.hasUppercase,
          hasSpecialChar: strength.checks.hasSpecialChar
        },
        allValid: strength.valid && passwordsMatch
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supported country codes
 * GET /api/auth/country-codes
 */
const getCountryCodes = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        countryCodes: COUNTRY_CODES,
        default: '+234'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Register new user
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const user = await AuthService.register(req.body);

    logger.info('User registered', { userId: user.id, email: user.email });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user,
        nextSteps: {
          biometric: !user.settings.biometricEnabled,
          faceId: !user.settings.faceIdEnabled,
          notifications: !user.settings.notificationsEnabled
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Extract device info from headers
    const deviceInfo = {
      userAgent: req.headers['user-agent'],
      platform: req.headers['x-platform'],
      deviceId: req.headers['x-device-id']
    };

    const result = await AuthService.login(email, password, { rememberMe, deviceInfo });

    logger.info('User logged in', { userId: result.user.id, rememberMe });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Biometric login (subsequent login)
 * POST /api/auth/biometric-login
 */
const biometricLogin = async (req, res, next) => {
  try {
    const { biometricToken } = req.body;
    const deviceId = req.headers['x-device-id'];

    const result = await AuthService.biometricLogin(biometricToken, deviceId);

    logger.info('Biometric login', { userId: result.user.id });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get remembered user for device (for subsequent login UI)
 * GET /api/auth/remembered-user
 */
const getRememberedUser = async (req, res, next) => {
  try {
    const deviceId = req.headers['x-device-id'];
    const rememberedUser = AuthService.getRememberedUser(deviceId);

    res.status(200).json({
      success: true,
      data: {
        hasRememberedUser: !!rememberedUser,
        user: rememberedUser
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout user
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      await AuthService.logout(token);
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout from all devices
 * POST /api/auth/logout-all
 */
const logoutAll = async (req, res, next) => {
  try {
    await AuthService.logoutAll(req.user.id);

    logger.info('User logged out from all devices', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Logged out from all devices'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user
 * GET /api/auth/me
 */
const getCurrentUser = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user settings (biometric, faceId, notifications)
 * PATCH /api/auth/settings
 */
const updateSettings = async (req, res, next) => {
  try {
    const { biometricEnabled, faceIdEnabled, notificationsEnabled } = req.body;

    const user = await AuthService.updateSettings(req.user.id, {
      biometricEnabled,
      faceIdEnabled,
      notificationsEnabled
    });

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enable biometric login
 * POST /api/auth/biometric/enable
 */
const enableBiometric = async (req, res, next) => {
  try {
    const { type = 'biometric' } = req.body; // 'biometric' or 'faceId'
    const deviceId = req.headers['x-device-id'];

    const result = await AuthService.enableBiometric(req.user.id, deviceId, type);

    logger.info('Biometric enabled', { userId: req.user.id, type });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        biometricToken: result.biometricToken
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disable biometric login
 * POST /api/auth/biometric/disable
 */
const disableBiometric = async (req, res, next) => {
  try {
    const { type = 'biometric' } = req.body;

    const result = await AuthService.disableBiometric(req.user.id, type);

    logger.info('Biometric disabled', { userId: req.user.id, type });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Forgot Password Flow
// ==========================================

/**
 * Request password reset (Step 1)
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await AuthService.requestPasswordReset(email);

    logger.info('Password reset requested', { email: OTPService.maskEmail(email) });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        email: result.email,
        expiresInMinutes: result.expiresInMinutes,
        // Only in development
        ...(result.otp && { otp: result.otp })
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify password reset OTP (Step 2)
 * POST /api/auth/forgot-password/verify
 */
const verifyPasswordResetOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const result = await AuthService.verifyPasswordResetOTP(email, otp);

    logger.info('Password reset OTP verified', { email: OTPService.maskEmail(email) });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        resetToken: result.resetToken,
        expiresInMinutes: result.expiresInMinutes
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password (Step 3)
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, password } = req.body;

    const result = await AuthService.resetPassword(resetToken, password);

    logger.info('Password reset completed');

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend password reset OTP
 * POST /api/auth/forgot-password/resend
 */
const resendPasswordResetOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await AuthService.resendPasswordResetOTP(email);

    logger.info('Password reset OTP resent', { email: OTPService.maskEmail(email) });

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
 * Get resend OTP status (cooldown check)
 * GET /api/auth/forgot-password/resend-status
 */
const getResendStatus = async (req, res, next) => {
  try {
    const { email } = req.query;

    const status = OTPService.getResendStatus(email, 'password_reset');

    res.status(200).json({
      success: true,
      data: {
        canResend: status.canResend,
        cooldownRemaining: status.cooldownRemaining
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password (for authenticated user)
 * POST /api/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await AuthService.changePassword(req.user.id, currentPassword, newPassword);

    logger.info('Password changed', { userId: req.user.id });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Registration & validation
  checkUsername,
  validateReferralCode,
  checkPassword,
  getCountryCodes,
  register,

  // Login
  login,
  biometricLogin,
  getRememberedUser,

  // Logout
  logout,
  logoutAll,

  // User
  getCurrentUser,
  updateSettings,

  // Biometric
  enableBiometric,
  disableBiometric,

  // Forgot password
  forgotPassword,
  verifyPasswordResetOTP,
  resetPassword,
  resendPasswordResetOTP,
  getResendStatus,
  changePassword
};
