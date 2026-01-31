const AuthService = require('./auth.service');
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
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);

    logger.info('User logged in', { userId: result.user.id });

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

module.exports = {
  checkUsername,
  validateReferralCode,
  checkPassword,
  getCountryCodes,
  register,
  login,
  logout,
  getCurrentUser,
  updateSettings
};
