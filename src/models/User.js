const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// In-memory storage (replace with database in production)
const users = new Map();

// Valid referral codes (in production, this would be from database)
const referralCodes = new Map([
  ['ZENA2024', { discount: 10, isActive: true }],
  ['WELCOME10', { discount: 10, isActive: true }],
  ['FRIEND20', { discount: 20, isActive: true }],
  ['BJEISLP', { discount: 15, isActive: true }]
]);

class User {
  constructor({
    username,
    firstName,
    lastName,
    countryCode,
    phoneNumber,
    email,
    password,
    referralCode,
    termsAccepted
  }) {
    this.id = uuidv4();
    this.username = username.startsWith('@') ? username.slice(1) : username;
    this.firstName = firstName;
    this.lastName = lastName;
    this.countryCode = countryCode;
    this.phoneNumber = phoneNumber;
    this.fullPhoneNumber = `${countryCode}${phoneNumber}`;
    this.email = email.toLowerCase();
    this.password = password;
    this.referralCode = referralCode || null;
    this.termsAccepted = termsAccepted;
    this.termsAcceptedAt = termsAccepted ? new Date() : null;
    this.biometricEnabled = false;
    this.faceIdEnabled = false;
    this.notificationsEnabled = false;
    this.isVerified = false;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Hash password before saving
  static async hashPassword(password) {
    return bcrypt.hash(password, config.bcryptSaltRounds);
  }

  // Verify password
  static async verifyPassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }

  // Validate referral code
  static validateReferralCode(code) {
    if (!code) {
      return { valid: true, message: 'No referral code provided' };
    }

    const referral = referralCodes.get(code.toUpperCase());
    if (!referral) {
      return { valid: false, message: 'Wrong Referral Code' };
    }

    if (!referral.isActive) {
      return { valid: false, message: 'Referral code is no longer active' };
    }

    return { valid: true, discount: referral.discount, message: 'Referral code applied' };
  }

  // Check if username is available
  static isUsernameAvailable(username) {
    const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;
    const existingUser = Array.from(users.values()).find(
      (user) => user.username.toLowerCase() === normalizedUsername.toLowerCase()
    );
    return !existingUser;
  }

  // Check if email is available
  static isEmailAvailable(email) {
    const existingUser = Array.from(users.values()).find(
      (user) => user.email === email.toLowerCase()
    );
    return !existingUser;
  }

  // Check if phone number is available
  static isPhoneAvailable(countryCode, phoneNumber) {
    const fullPhone = `${countryCode}${phoneNumber}`;
    const existingUser = Array.from(users.values()).find(
      (user) => user.fullPhoneNumber === fullPhone
    );
    return !existingUser;
  }

  // Create a new user
  static async create(userData) {
    // Check if email already exists
    if (!User.isEmailAvailable(userData.email)) {
      throw new Error('Email already registered');
    }

    // Check if username already exists
    if (!User.isUsernameAvailable(userData.username)) {
      throw new Error('Username already taken');
    }

    // Check if phone number already exists
    if (!User.isPhoneAvailable(userData.countryCode, userData.phoneNumber)) {
      throw new Error('Phone number already registered');
    }

    // Validate referral code if provided
    if (userData.referralCode) {
      const referralValidation = User.validateReferralCode(userData.referralCode);
      if (!referralValidation.valid) {
        throw new Error(referralValidation.message);
      }
    }

    // Hash password
    const hashedPassword = await User.hashPassword(userData.password);

    // Create new user
    const user = new User({
      ...userData,
      password: hashedPassword
    });

    // Store user
    users.set(user.id, user);

    return user;
  }

  // Find user by ID
  static findById(id) {
    return users.get(id) || null;
  }

  // Find user by email
  static findByEmail(email) {
    return Array.from(users.values()).find(
      (user) => user.email === email.toLowerCase()
    ) || null;
  }

  // Find user by username
  static findByUsername(username) {
    const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;
    return Array.from(users.values()).find(
      (user) => user.username.toLowerCase() === normalizedUsername.toLowerCase()
    ) || null;
  }

  // Get all users
  static findAll() {
    return Array.from(users.values());
  }

  // Update user settings
  static updateSettings(id, settings) {
    const user = users.get(id);
    if (!user) return null;

    if (settings.biometricEnabled !== undefined) {
      user.biometricEnabled = settings.biometricEnabled;
    }
    if (settings.faceIdEnabled !== undefined) {
      user.faceIdEnabled = settings.faceIdEnabled;
    }
    if (settings.notificationsEnabled !== undefined) {
      user.notificationsEnabled = settings.notificationsEnabled;
    }

    user.updatedAt = new Date();
    users.set(id, user);

    return user;
  }

  // Return user data without password
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      displayUsername: `@${this.username}`,
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: `${this.firstName} ${this.lastName}`,
      countryCode: this.countryCode,
      phoneNumber: this.phoneNumber,
      fullPhoneNumber: this.fullPhoneNumber,
      email: this.email,
      referralCode: this.referralCode,
      termsAccepted: this.termsAccepted,
      biometricEnabled: this.biometricEnabled,
      faceIdEnabled: this.faceIdEnabled,
      notificationsEnabled: this.notificationsEnabled,
      isVerified: this.isVerified,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = User;
