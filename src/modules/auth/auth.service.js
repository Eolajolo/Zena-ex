const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const config = require('../../config');
const { DuplicateError, ValidationError, AuthenticationError, NotFoundError } = require('../../shared/middleware');

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
   * Login user
   */
  static async login(email, password) {
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

    // Generate session token (in production, use JWT)
    const token = uuidv4();
    const tokenData = {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      createdAt: new Date()
    };

    db.create('tokens', token, tokenData);

    return {
      user: this.sanitizeUser(user),
      token
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
   * Remove sensitive data from user object
   */
  static sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return {
      ...sanitized,
      displayUsername: `@${user.username}`,
      fullName: `${user.firstName} ${user.lastName}`
    };
  }
}

module.exports = AuthService;
