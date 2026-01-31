const User = require('../models/User');
const { checkPasswordStrength, countryCodes } = require('../middleware/validation');

// Check username availability
const checkUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const isAvailable = User.isUsernameAvailable(username);

    res.status(200).json({
      success: true,
      data: {
        username: username.startsWith('@') ? username : `@${username}`,
        available: isAvailable,
        message: isAvailable ? 'Username is available' : 'Username already taken'
      }
    });
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while checking username availability'
    });
  }
};

// Validate referral code
const validateReferralCode = async (req, res) => {
  try {
    const { code } = req.params;
    const validation = User.validateReferralCode(code);

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
    console.error('Error validating referral code:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while validating referral code'
    });
  }
};

// Check password strength (for real-time validation)
const checkPassword = async (req, res) => {
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
    console.error('Error checking password:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while checking password strength'
    });
  }
};

// Get supported country codes
const getCountryCodes = async (req, res) => {
  try {
    const countryData = [
      { code: '+234', country: 'Nigeria', flag: '🇳🇬' },
      { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
      { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
      { code: '+91', country: 'India', flag: '🇮🇳' },
      { code: '+233', country: 'Ghana', flag: '🇬🇭' },
      { code: '+254', country: 'Kenya', flag: '🇰🇪' },
      { code: '+27', country: 'South Africa', flag: '🇿🇦' },
      { code: '+971', country: 'UAE', flag: '🇦🇪' },
      { code: '+49', country: 'Germany', flag: '🇩🇪' },
      { code: '+33', country: 'France', flag: '🇫🇷' },
      { code: '+86', country: 'China', flag: '🇨🇳' },
      { code: '+81', country: 'Japan', flag: '🇯🇵' },
      { code: '+61', country: 'Australia', flag: '🇦🇺' }
    ];

    res.status(200).json({
      success: true,
      data: {
        countryCodes: countryData,
        default: '+234'
      }
    });
  } catch (error) {
    console.error('Error fetching country codes:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching country codes'
    });
  }
};

// Create new user account (full registration)
const createAccount = async (req, res) => {
  try {
    const {
      username,
      firstName,
      lastName,
      countryCode,
      phoneNumber,
      email,
      referralCode,
      termsAccepted,
      password
    } = req.body;

    // Create user
    const user = await User.create({
      username,
      firstName,
      lastName,
      countryCode,
      phoneNumber,
      email,
      referralCode: referralCode || null,
      termsAccepted,
      password
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON(),
        nextSteps: {
          biometric: !user.biometricEnabled,
          faceId: !user.faceIdEnabled,
          notifications: !user.notificationsEnabled
        }
      }
    });
  } catch (error) {
    // Handle duplicate field errors
    if (error.message.includes('already') || error.message.includes('taken')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    // Handle referral code errors
    if (error.message.includes('Referral')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    console.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the account'
    });
  }
};

// Update user settings (biometric, faceId, notifications)
const updateSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { biometricEnabled, faceIdEnabled, notificationsEnabled } = req.body;

    const user = User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updatedUser = User.updateSettings(id, {
      biometricEnabled,
      faceIdEnabled,
      notificationsEnabled
    });

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        user: updatedUser.toJSON()
      }
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating settings'
    });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON()
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the user'
    });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = User.findAll();

    res.status(200).json({
      success: true,
      data: {
        users: users.map((user) => user.toJSON()),
        count: users.length
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching users'
    });
  }
};

module.exports = {
  checkUsername,
  validateReferralCode,
  checkPassword,
  getCountryCodes,
  createAccount,
  updateSettings,
  getUserById,
  getAllUsers
};
