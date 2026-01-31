const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const config = require('../../config');
const { DuplicateError, ValidationError, AuthenticationError, NotFoundError } = require('../../shared/middleware');
const OTPService = require('./otp.service');

class AuthService {
  /**
   * Hash a password
   */
  static async hashPassword(password) {
    return bcrypt.hash(password, config.bcryptSaltRounds);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Check if username is available
   */
  static isUsernameAvailable(username) {
    const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;
    const existingUser = db.findOne('users', (user) =>
      user.username.toLowerCase() === normalizedUsername.toLowerCase()
    );
    return !existingUser;
  }

  /**
   * Check if email is available
   */
  static isEmailAvailable(email) {
    const existingUser = db.findOne('users', (user) =>
      user.email === email.toLowerCase()
    );
    return !existingUser;
  }

  /**
   * Check if phone is available
   */
  static isPhoneAvailable(countryCode, phoneNumber) {
    const fullPhone = `${countryCode}${phoneNumber}`;
    const existingUser = db.findOne('users', (user) =>
      user.fullPhoneNumber === fullPhone
    );
    return !existingUser;
  }

  /**
   * Validate referral code
   */
  static validateReferralCode(code) {
    if (!code) {
      return { valid: true, message: 'No referral code provided' };
    }

    const referralStore = db.getStore('referralCodes');
    const referral = referralStore.get(code.toUpperCase());

    if (!referral) {
      return { valid: false, message: 'Wrong Referral Code' };
    }

    if (!referral.isActive) {
      return { valid: false, message: 'Referral code is no longer active' };
    }

    return { valid: true, discount: referral.discount, message: 'Referral code applied' };
  }

  /**
   * Register a new user
   */
  static async register(userData) {
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
    } = userData;

    // Check for existing email
    if (!this.isEmailAvailable(email)) {
      throw new DuplicateError('Email already registered');
    }

    // Check for existing username
    if (!this.isUsernameAvailable(username)) {
      throw new DuplicateError('Username already taken');
    }

    // Check for existing phone
    if (!this.isPhoneAvailable(countryCode, phoneNumber)) {
      throw new DuplicateError('Phone number already registered');
    }

    // Validate referral code if provided
    if (referralCode) {
      const referralValidation = this.validateReferralCode(referralCode);
      if (!referralValidation.valid) {
        throw new ValidationError(referralValidation.message);
      }
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create user object
    const userId = uuidv4();
    const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;

    const user = {
      id: userId,
      username: normalizedUsername,
      firstName,
      lastName,
      countryCode,
      phoneNumber,
      fullPhoneNumber: `${countryCode}${phoneNumber}`,
      email: email.toLowerCase(),
      password: hashedPassword,
      referralCode: referralCode ? referralCode.toUpperCase() : null,
      termsAccepted,
      termsAcceptedAt: termsAccepted ? new Date() : null,
      kycLevel: 0,
      isVerified: false,
      isActive: true,
      lastLoginAt: null,
      settings: {
        biometricEnabled: false,
        faceIdEnabled: false,
        notificationsEnabled: false,
        twoFactorEnabled: false
      }
    };

    // Save to database
    db.create('users', userId, user);

    return this.sanitizeUser(user);
  }

  /**
   * Login user with enhanced features
   */
  static async login(email, password, options = {}) {
    const { rememberMe = false, deviceInfo = {} } = options;

    const user = db.findOne('users', (u) => u.email === email.toLowerCase());

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    const isValidPassword = await this.verifyPassword(password, user.password);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Update last login
    db.update('users', user.id, { lastLoginAt: new Date() });

    // Generate session token
    const token = uuidv4();
    const expiresIn = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000; // 30 days or 7 days

    const tokenData = {
      userId: user.id,
      token,
      type: 'session',
      rememberMe,
      deviceInfo: {
        userAgent: deviceInfo.userAgent || null,
        platform: deviceInfo.platform || null,
        deviceId: deviceInfo.deviceId || null
      },
      expiresAt: new Date(Date.now() + expiresIn),
      createdAt: new Date()
    };

    db.create('tokens', token, tokenData);

    // Generate biometric token if biometric is enabled
    let biometricToken = null;
    if (user.settings.biometricEnabled || user.settings.faceIdEnabled) {
      biometricToken = this.generateBiometricToken(user.id, deviceInfo.deviceId);
    }

    return {
      user: this.sanitizeUser({ ...user, lastLoginAt: new Date() }),
      token,
      biometricToken,
      expiresAt: tokenData.expiresAt
    };
  }

  /**
   * Generate biometric token for quick login
   */
  static generateBiometricToken(userId, deviceId) {
    if (!deviceId) return null;

    const biometricToken = crypto.randomBytes(32).toString('hex');
    const tokenKey = `biometric:${userId}:${deviceId}`;

    const tokenData = {
      userId,
      deviceId,
      token: biometricToken,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      createdAt: new Date()
    };

    // Remove existing biometric token for this device
    const existing = db.findOne('biometricTokens', (t) =>
      t.userId === userId && t.deviceId === deviceId
    );
    if (existing) {
      db.delete('biometricTokens', existing.id);
    }

    db.create('biometricTokens', tokenKey, tokenData);

    return biometricToken;
  }

  /**
   * Login with biometric (subsequent login)
   */
  static async biometricLogin(biometricToken, deviceId) {
    if (!biometricToken || !deviceId) {
      throw new AuthenticationError('Invalid biometric credentials');
    }

    const tokenData = db.findOne('biometricTokens', (t) =>
      t.token === biometricToken && t.deviceId === deviceId
    );

    if (!tokenData) {
      throw new AuthenticationError('Invalid biometric token');
    }

    if (new Date() > new Date(tokenData.expiresAt)) {
      db.delete('biometricTokens', `biometric:${tokenData.userId}:${tokenData.deviceId}`);
      throw new AuthenticationError('Biometric token expired. Please login with password.');
    }

    const user = db.findById('users', tokenData.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Update last login
    db.update('users', user.id, { lastLoginAt: new Date() });

    // Generate new session token
    const token = uuidv4();
    const sessionData = {
      userId: user.id,
      token,
      type: 'biometric_session',
      deviceId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date()
    };

    db.create('tokens', token, sessionData);

    return {
      user: this.sanitizeUser({ ...user, lastLoginAt: new Date() }),
      token,
      expiresAt: sessionData.expiresAt
    };
  }

  /**
   * Check if user has remembered device (for subsequent login UI)
   */
  static getRememberedUser(deviceId) {
    if (!deviceId) return null;

    const biometricToken = db.findOne('biometricTokens', (t) =>
      t.deviceId === deviceId && new Date() < new Date(t.expiresAt)
    );

    if (!biometricToken) return null;

    const user = db.findById('users', biometricToken.userId);
    if (!user || !user.isActive) return null;

    return {
      userId: user.id,
      username: user.username,
      displayUsername: `@${user.username}`,
      email: OTPService.maskEmail(user.email),
      firstName: user.firstName,
      hasBiometric: user.settings.biometricEnabled,
      hasFaceId: user.settings.faceIdEnabled
    };
  }

  /**
   * Logout user (invalidate token)
   */
  static async logout(token) {
    db.delete('tokens', token);
    return true;
  }

  /**
   * Logout from all devices
   */
  static async logoutAll(userId) {
    const tokens = db.findMany('tokens', (t) => t.userId === userId);
    tokens.forEach((t) => db.delete('tokens', t.token));

    const biometricTokens = db.findMany('biometricTokens', (t) => t.userId === userId);
    biometricTokens.forEach((t) => db.delete('biometricTokens', t.id));

    return true;
  }

  /**
   * Get user by token
   */
  static async getUserByToken(token) {
    const tokenData = db.findById('tokens', token);

    if (!tokenData) {
      throw new AuthenticationError('Invalid or expired token');
    }

    if (new Date() > new Date(tokenData.expiresAt)) {
      db.delete('tokens', token);
      throw new AuthenticationError('Token has expired');
    }

    const user = db.findById('users', tokenData.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return this.sanitizeUser(user);
  }

  /**
   * Request password reset (forgot password step 1)
   */
  static async requestPasswordReset(email) {
    const user = db.findOne('users', (u) => u.email === email.toLowerCase());

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        success: true,
        message: 'If an account exists, you will receive a reset code',
        email: OTPService.maskEmail(email)
      };
    }

    // Create OTP
    const otpResult = OTPService.createOTP(email, 'password_reset', 10);

    // Send OTP via email (mock)
    await OTPService.sendOTPEmail(email, otpResult.otp, 'password_reset');

    return {
      success: true,
      message: 'Reset code sent to your email',
      email: OTPService.maskEmail(email),
      expiresInMinutes: 10,
      // In development, return OTP for testing
      ...(config.nodeEnv === 'development' && { otp: otpResult.otp })
    };
  }

  /**
   * Verify password reset OTP (forgot password step 2)
   */
  static async verifyPasswordResetOTP(email, otp) {
    const user = db.findOne('users', (u) => u.email === email.toLowerCase());

    if (!user) {
      throw new ValidationError('Invalid or expired code');
    }

    // Verify OTP
    OTPService.verifyOTP(email, 'password_reset', otp);

    // Generate a temporary reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenData = {
      userId: user.id,
      email: email.toLowerCase(),
      token: resetToken,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      createdAt: new Date()
    };

    db.create('resetTokens', resetToken, resetTokenData);

    return {
      success: true,
      message: 'OTP verified successfully',
      resetToken,
      expiresInMinutes: 15
    };
  }

  /**
   * Reset password (forgot password step 3)
   */
  static async resetPassword(resetToken, newPassword) {
    const tokenData = db.findById('resetTokens', resetToken);

    if (!tokenData) {
      throw new ValidationError('Invalid or expired reset link');
    }

    if (new Date() > new Date(tokenData.expiresAt)) {
      db.delete('resetTokens', resetToken);
      throw new ValidationError('Reset link has expired. Please request a new one.');
    }

    const user = db.findById('users', tokenData.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update password
    db.update('users', user.id, {
      password: hashedPassword,
      passwordChangedAt: new Date()
    });

    // Delete reset token
    db.delete('resetTokens', resetToken);

    // Invalidate all existing sessions for security
    await this.logoutAll(user.id);

    return {
      success: true,
      message: 'Password reset successfully. Please login with your new password.'
    };
  }

  /**
   * Resend password reset OTP
   */
  static async resendPasswordResetOTP(email) {
    const resendStatus = OTPService.getResendStatus(email, 'password_reset');

    if (!resendStatus.canResend) {
      throw new ValidationError(
        `Please wait ${resendStatus.cooldownRemaining} seconds before requesting a new code`
      );
    }

    return this.requestPasswordReset(email);
  }

  /**
   * Change password (for logged in user)
   */
  static async changePassword(userId, currentPassword, newPassword) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update password
    db.update('users', userId, {
      password: hashedPassword,
      passwordChangedAt: new Date()
    });

    return {
      success: true,
      message: 'Password changed successfully'
    };
  }

  /**
   * Update user settings
   */
  static async updateSettings(userId, settings) {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updatedUser = db.update('users', userId, {
      settings: { ...user.settings, ...settings }
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Enable biometric login
   */
  static async enableBiometric(userId, deviceId, type = 'biometric') {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const settings = { ...user.settings };
    if (type === 'faceId') {
      settings.faceIdEnabled = true;
    } else {
      settings.biometricEnabled = true;
    }

    db.update('users', userId, { settings });

    // Generate biometric token
    const biometricToken = this.generateBiometricToken(userId, deviceId);

    return {
      success: true,
      message: `${type === 'faceId' ? 'Face ID' : 'Biometric'} enabled successfully`,
      biometricToken
    };
  }

  /**
   * Disable biometric login
   */
  static async disableBiometric(userId, type = 'biometric') {
    const user = db.findById('users', userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const settings = { ...user.settings };
    if (type === 'faceId') {
      settings.faceIdEnabled = false;
    } else {
      settings.biometricEnabled = false;
    }

    db.update('users', userId, { settings });

    // Remove biometric tokens if both are disabled
    if (!settings.biometricEnabled && !settings.faceIdEnabled) {
      const tokens = db.findMany('biometricTokens', (t) => t.userId === userId);
      tokens.forEach((t) => db.delete('biometricTokens', t.id));
    }

    return {
      success: true,
      message: `${type === 'faceId' ? 'Face ID' : 'Biometric'} disabled successfully`
    };
  }

  /**
   * Remove sensitive data from user object
   */
  static sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return {
      ...sanitized,
      displayUsername: `@${user.username}`,
      fullName: `${user.firstName} ${user.lastName}`,
      maskedEmail: OTPService.maskEmail(user.email),
      maskedPhone: OTPService.maskPhone(user.fullPhoneNumber)
    };
  }
}

module.exports = AuthService;
