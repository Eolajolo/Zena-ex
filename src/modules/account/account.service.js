const db = require('../../shared/database');
const { NotFoundError, ValidationError } = require('../../shared/middleware');
const { KYC_LEVELS } = require('../../shared/constants');

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

    const updatedUser = db.update('users', userId, filteredUpdates);
    return this.sanitizeProfile(updatedUser);
  }

  /**
   * Get all users (admin only)
   */
  static getAllUsers(filters = {}) {
    let users = db.findMany('users', () => true);

    // Apply filters
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

    // Upgrade KYC level if currently at NONE
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
    const { password, ...profile } = user;
    return {
      ...profile,
      displayUsername: `@${user.username}`,
      fullName: `${user.firstName} ${user.lastName}`
    };
  }
}

module.exports = AccountService;
