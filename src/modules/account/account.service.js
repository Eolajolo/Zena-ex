const db = require('../../shared/database');
const { NotFoundError, ValidationError, AuthenticationError } = require('../../shared/middleware');
const { KYC_LEVELS, COUNTRY_CODES } = require('../../shared/constants');
const OTPService = require('../auth/otp.service');
const bcrypt = require('bcryptjs');
const config = require('../../config');

class AccountService {
  /**
   * Get user profile by ID
   */
  static getProfile(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return this.sanitizeProfile(user);
  }

  /**
   * Update user profile
   */
  static updateProfile(userId, updates) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const allowedUpdates = ['firstName', 'lastName', 'avatar', 'dateOfBirth', 'gender', 'address'];
    const filteredUpdates = {};

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    filteredUpdates.updatedAt = new Date();

    const updatedUser = db.update('users', userId, filteredUpdates);
    return this.sanitizeProfile(updatedUser);
  }

  // ==========================================
  // Phone Number Management
  // ==========================================

  /**
   * Request phone number update (sends OTP to new number)
   */
  static async requestPhoneUpdate(userId, countryCode, phoneNumber) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Validate country code
    const validCountryCodes = COUNTRY_CODES.map(c => c.code);
    if (!validCountryCodes.includes(countryCode)) {
      throw new ValidationError('Invalid country code');
    }

    const fullPhoneNumber = `${countryCode}${phoneNumber}`;

    // Check if phone is already taken by another user
    const existingUser = db.findOne('users', (u) =>
      u.fullPhoneNumber === fullPhoneNumber && u.id !== userId
    );
    if (existingUser) {
      throw new ValidationError('Phone number already registered to another account');
    }

    // Store pending phone update
    const pendingKey = `phone_update:${userId}`;
    db.create('pendingUpdates', pendingKey, {
      userId,
      countryCode,
      phoneNumber,
      fullPhoneNumber,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    });

    // Create OTP
    const otpResult = OTPService.createOTP(fullPhoneNumber, 'phone_update', 10);

    // Send OTP via SMS (mock)
    await OTPService.sendOTPSMS(fullPhoneNumber, otpResult.otp, 'phone_update');

    return {
      success: true,
      message: 'Verification code sent to your new phone number',
      phone: OTPService.maskPhone(fullPhoneNumber),
      expiresInMinutes: 10,
      ...(config.nodeEnv === 'development' && { otp: otpResult.otp })
    };
  }

  /**
   * Verify phone update OTP and update phone number
   */
  static verifyPhoneUpdate(userId, otp) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get pending phone update
    const pendingKey = `phone_update:${userId}`;
    const pending = db.findById('pendingUpdates', pendingKey);

    if (!pending) {
      throw new ValidationError('No pending phone update found. Please request a new update.');
    }

    if (new Date() > new Date(pending.expiresAt)) {
      db.delete('pendingUpdates', pendingKey);
      throw new ValidationError('Phone update request expired. Please request a new update.');
    }

    // Verify OTP
    OTPService.verifyOTP(pending.fullPhoneNumber, 'phone_update', otp);

    // Update user's phone number
    const updatedUser = db.update('users', userId, {
      countryCode: pending.countryCode,
      phoneNumber: pending.phoneNumber,
      fullPhoneNumber: pending.fullPhoneNumber,
      phoneVerified: true,
      phoneVerifiedAt: new Date(),
      updatedAt: new Date()
    });

    // Clean up pending update
    db.delete('pendingUpdates', pendingKey);

    return {
      success: true,
      message: 'Phone number updated successfully',
      user: this.sanitizeProfile(updatedUser)
    };
  }

  /**
   * Resend phone update OTP
   */
  static async resendPhoneUpdateOTP(userId) {
    const pendingKey = `phone_update:${userId}`;
    const pending = db.findById('pendingUpdates', pendingKey);

    if (!pending) {
      throw new ValidationError('No pending phone update found. Please request a new update.');
    }

    const resendStatus = OTPService.getResendStatus(pending.fullPhoneNumber, 'phone_update');
    if (!resendStatus.canResend) {
      throw new ValidationError(
        `Please wait ${resendStatus.cooldownRemaining} seconds before requesting a new code`
      );
    }

    // Create new OTP
    const otpResult = OTPService.createOTP(pending.fullPhoneNumber, 'phone_update', 10);

    // Send OTP via SMS
    await OTPService.sendOTPSMS(pending.fullPhoneNumber, otpResult.otp, 'phone_update');

    return {
      success: true,
      message: 'Verification code resent',
      phone: OTPService.maskPhone(pending.fullPhoneNumber),
      ...(config.nodeEnv === 'development' && { otp: otpResult.otp })
    };
  }

  // ==========================================
  // Transaction PIN Management
  // ==========================================

  /**
   * Check if user has transaction PIN set
   */
  static hasTransactionPin(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return !!user.transactionPin;
  }

  /**
   * Request PIN setup/reset (sends OTP to email)
   */
  static async requestPinSetup(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Create OTP
    const otpResult = OTPService.createOTP(user.email, 'pin_setup', 10);

    // Send OTP via email
    await OTPService.sendOTPEmail(user.email, otpResult.otp, 'pin_setup');

    return {
      success: true,
      message: 'Verification code sent to your email',
      email: OTPService.maskEmail(user.email),
      expiresInMinutes: 10,
      ...(config.nodeEnv === 'development' && { otp: otpResult.otp })
    };
  }

  /**
   * Verify OTP for PIN setup
   */
  static verifyPinSetupOTP(userId, otp) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify OTP
    OTPService.verifyOTP(user.email, 'pin_setup', otp);

    // Generate temporary token for PIN setup
    const pinSetupToken = require('crypto').randomBytes(32).toString('hex');
    db.create('pinSetupTokens', pinSetupToken, {
      userId,
      token: pinSetupToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      createdAt: new Date()
    });

    return {
      success: true,
      message: 'OTP verified successfully',
      pinSetupToken,
      expiresInMinutes: 10
    };
  }

  /**
   * Set transaction PIN
   */
  static async setTransactionPin(userId, pinSetupToken, pin, confirmPin) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify setup token
    const tokenData = db.findById('pinSetupTokens', pinSetupToken);
    if (!tokenData || tokenData.userId !== userId) {
      throw new ValidationError('Invalid or expired session. Please start again.');
    }

    if (new Date() > new Date(tokenData.expiresAt)) {
      db.delete('pinSetupTokens', pinSetupToken);
      throw new ValidationError('Session expired. Please start again.');
    }

    // Validate PIN
    if (!/^\d{4}$/.test(pin)) {
      throw new ValidationError('PIN must be exactly 4 digits');
    }

    if (pin !== confirmPin) {
      throw new ValidationError('PINs do not match');
    }

    // Check for weak PINs
    const weakPins = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321'];
    if (weakPins.includes(pin)) {
      throw new ValidationError('Please choose a stronger PIN');
    }

    // Hash PIN
    const hashedPin = await bcrypt.hash(pin, config.bcryptSaltRounds);

    // Update user
    db.update('users', userId, {
      transactionPin: hashedPin,
      pinSetAt: new Date(),
      updatedAt: new Date()
    });

    // Clean up token
    db.delete('pinSetupTokens', pinSetupToken);

    return {
      success: true,
      message: 'Transaction PIN set successfully'
    };
  }

  /**
   * Verify transaction PIN
   */
  static async verifyTransactionPin(userId, pin) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.transactionPin) {
      throw new ValidationError('Transaction PIN not set');
    }

    const isValid = await bcrypt.compare(pin, user.transactionPin);
    if (!isValid) {
      throw new AuthenticationError('Invalid PIN');
    }

    return true;
  }

  /**
   * Change transaction PIN (requires current PIN)
   */
  static async changeTransactionPin(userId, currentPin, newPin, confirmPin) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.transactionPin) {
      throw new ValidationError('Transaction PIN not set. Please set up a PIN first.');
    }

    // Verify current PIN
    const isValid = await bcrypt.compare(currentPin, user.transactionPin);
    if (!isValid) {
      throw new AuthenticationError('Current PIN is incorrect');
    }

    // Validate new PIN
    if (!/^\d{4}$/.test(newPin)) {
      throw new ValidationError('PIN must be exactly 4 digits');
    }

    if (newPin !== confirmPin) {
      throw new ValidationError('PINs do not match');
    }

    if (currentPin === newPin) {
      throw new ValidationError('New PIN must be different from current PIN');
    }

    // Hash new PIN
    const hashedPin = await bcrypt.hash(newPin, config.bcryptSaltRounds);

    // Update user
    db.update('users', userId, {
      transactionPin: hashedPin,
      pinChangedAt: new Date(),
      updatedAt: new Date()
    });

    return {
      success: true,
      message: 'Transaction PIN changed successfully'
    };
  }

  // ==========================================
  // 2FA Management
  // ==========================================

  /**
   * Enable 2FA
   */
  static enable2FA(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    db.update('users', userId, {
      settings: {
        ...user.settings,
        twoFactorEnabled: true
      },
      updatedAt: new Date()
    });

    return {
      success: true,
      message: '2-Factor Authentication enabled'
    };
  }

  /**
   * Disable 2FA
   */
  static disable2FA(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    db.update('users', userId, {
      settings: {
        ...user.settings,
        twoFactorEnabled: false
      },
      updatedAt: new Date()
    });

    return {
      success: true,
      message: '2-Factor Authentication disabled'
    };
  }

  // ==========================================
  // Account Deletion
  // ==========================================

  /**
   * Request account deletion
   */
  static async requestAccountDeletion(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Create OTP for confirmation
    const otpResult = OTPService.createOTP(user.email, 'account_deletion', 10);

    // Send OTP via email
    await OTPService.sendOTPEmail(user.email, otpResult.otp, 'account_deletion');

    return {
      success: true,
      message: 'Confirmation code sent to your email',
      email: OTPService.maskEmail(user.email),
      ...(config.nodeEnv === 'development' && { otp: otpResult.otp })
    };
  }

  /**
   * Confirm account deletion
   */
  static deleteAccount(userId, otp) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify OTP
    OTPService.verifyOTP(user.email, 'account_deletion', otp);

    // Soft delete - mark as deleted but keep data
    db.update('users', userId, {
      isActive: false,
      isDeleted: true,
      deletedAt: new Date(),
      email: `deleted_${user.id}@deleted.local`,
      phoneNumber: `deleted_${user.id}`,
      fullPhoneNumber: `deleted_${user.id}`
    });

    // Delete all tokens
    const tokens = db.findMany('tokens', (t) => t.userId === userId);
    tokens.forEach((t) => db.delete('tokens', t.token));

    return {
      success: true,
      message: 'Account deleted successfully'
    };
  }

  // ==========================================
  // Other Methods
  // ==========================================

  /**
   * Get all users (admin only)
   */
  static getAllUsers(filters = {}) {
    let users = db.findMany('users', () => true);

    if (filters.kycLevel !== undefined) {
      users = users.filter(u => u.kycLevel === filters.kycLevel);
    }

    if (filters.isVerified !== undefined) {
      users = users.filter(u => u.isVerified === filters.isVerified);
    }

    return {
      users: users.map(u => this.sanitizeProfile(u)),
      count: users.length
    };
  }

  /**
   * Get user by ID (for internal use)
   */
  static getUserById(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  /**
   * Update KYC level
   */
  static updateKycLevel(userId, level, verificationData = {}) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!Object.values(KYC_LEVELS).includes(level)) {
      throw new ValidationError('Invalid KYC level');
    }

    const updatedUser = db.update('users', userId, {
      kycLevel: level,
      kycVerification: {
        ...user.kycVerification,
        ...verificationData,
        updatedAt: new Date()
      }
    });

    return this.sanitizeProfile(updatedUser);
  }

  /**
   * Verify phone number
   */
  static verifyPhone(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updates = {
      phoneVerified: true,
      phoneVerifiedAt: new Date()
    };

    if (user.kycLevel === KYC_LEVELS.NONE) {
      updates.kycLevel = KYC_LEVELS.PHONE;
    }

    const updatedUser = db.update('users', userId, updates);
    return this.sanitizeProfile(updatedUser);
  }

  /**
   * Verify email
   */
  static verifyEmail(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updatedUser = db.update('users', userId, {
      emailVerified: true,
      emailVerifiedAt: new Date()
    });

    return this.sanitizeProfile(updatedUser);
  }

  /**
   * Deactivate account
   */
  static deactivateAccount(userId, reason = '') {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updatedUser = db.update('users', userId, {
      isActive: false,
      deactivatedAt: new Date(),
      deactivationReason: reason
    });

    return this.sanitizeProfile(updatedUser);
  }

  /**
   * Reactivate account
   */
  static reactivateAccount(userId) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updatedUser = db.update('users', userId, {
      isActive: true,
      reactivatedAt: new Date()
    });

    return this.sanitizeProfile(updatedUser);
  }

  /**
   * Remove sensitive data from profile
   */
  static sanitizeProfile(user) {
    const { password, transactionPin, ...profile } = user;
    return {
      ...profile,
      displayUsername: `@${user.username}`,
      fullName: `${user.firstName} ${user.lastName}`,
      maskedEmail: OTPService.maskEmail(user.email),
      maskedPhone: OTPService.maskPhone(user.fullPhoneNumber),
      hasTransactionPin: !!user.transactionPin
    };
  }
}

module.exports = AccountService;
