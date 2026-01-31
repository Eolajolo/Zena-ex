const crypto = require('crypto');
const db = require('../../shared/database');
const { ValidationError } = require('../../shared/middleware');
const { logger } = require('../../shared/utils');

class OTPService {
  /**
   * Generate a 6-digit OTP
   */
  static generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Create and store OTP for a user
   * @param {string} identifier - Email or phone
   * @param {string} purpose - 'password_reset', 'email_verify', 'phone_verify', 'login'
   * @param {number} expiresInMinutes - OTP validity in minutes
   */
  static createOTP(identifier, purpose, expiresInMinutes = 10) {
    const normalizedIdentifier = identifier.toLowerCase();
    const otpKey = `${purpose}:${normalizedIdentifier}`;

    // Check for existing OTP and cooldown
    const existingOTP = db.findOne('otps', (o) => o.key === otpKey);

    if (existingOTP) {
      const cooldownRemaining = this.getCooldownRemaining(existingOTP);
      if (cooldownRemaining > 0) {
        throw new ValidationError(`Please wait ${cooldownRemaining} seconds before requesting a new code`);
      }
    }

    // Generate new OTP
    const otp = this.generateOTP();
    const now = new Date();

    const otpData = {
      id: otpKey,
      key: otpKey,
      identifier: normalizedIdentifier,
      purpose,
      code: otp,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(now.getTime() + expiresInMinutes * 60 * 1000),
      cooldownUntil: new Date(now.getTime() + 60 * 1000), // 60 seconds cooldown for resend
      createdAt: now
    };

    // Delete existing OTP if any
    if (existingOTP) {
      db.delete('otps', existingOTP.id);
    }

    db.create('otps', otpKey, otpData);

    logger.info('OTP created', { identifier: this.maskIdentifier(normalizedIdentifier), purpose });

    return {
      otp, // In production, this would be sent via email/SMS, not returned
      expiresAt: otpData.expiresAt,
      expiresInMinutes
    };
  }

  /**
   * Verify OTP
   */
  static verifyOTP(identifier, purpose, code) {
    const normalizedIdentifier = identifier.toLowerCase();
    const otpKey = `${purpose}:${normalizedIdentifier}`;

    const otpData = db.findById('otps', otpKey);

    if (!otpData) {
      throw new ValidationError('Invalid or expired code. Please request a new one.');
    }

    // Check if expired
    if (new Date() > new Date(otpData.expiresAt)) {
      db.delete('otps', otpKey);
      throw new ValidationError('Code has expired. Please request a new one.');
    }

    // Check attempts
    if (otpData.attempts >= otpData.maxAttempts) {
      db.delete('otps', otpKey);
      throw new ValidationError('Too many failed attempts. Please request a new code.');
    }

    // Verify code
    if (otpData.code !== code) {
      // Increment attempts
      db.update('otps', otpKey, { attempts: otpData.attempts + 1 });

      const remainingAttempts = otpData.maxAttempts - otpData.attempts - 1;
      throw new ValidationError(
        `Invalid code. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`
      );
    }

    // OTP is valid - delete it
    db.delete('otps', otpKey);

    logger.info('OTP verified', { identifier: this.maskIdentifier(normalizedIdentifier), purpose });

    return true;
  }

  /**
   * Get cooldown remaining in seconds
   */
  static getCooldownRemaining(otpData) {
    if (!otpData || !otpData.cooldownUntil) return 0;

    const now = new Date();
    const cooldownUntil = new Date(otpData.cooldownUntil);

    if (now >= cooldownUntil) return 0;

    return Math.ceil((cooldownUntil - now) / 1000);
  }

  /**
   * Get resend cooldown status
   */
  static getResendStatus(identifier, purpose) {
    const normalizedIdentifier = identifier.toLowerCase();
    const otpKey = `${purpose}:${normalizedIdentifier}`;

    const otpData = db.findById('otps', otpKey);

    if (!otpData) {
      return { canResend: true, cooldownRemaining: 0 };
    }

    const cooldownRemaining = this.getCooldownRemaining(otpData);

    return {
      canResend: cooldownRemaining === 0,
      cooldownRemaining
    };
  }

  /**
   * Mask email for display
   */
  static maskEmail(email) {
    const [local, domain] = email.split('@');
    if (local.length <= 3) {
      return `${local.charAt(0)}***@${domain}`;
    }
    return `${local.slice(0, 3)}****@${domain}`;
  }

  /**
   * Mask phone for display
   */
  static maskPhone(phone) {
    if (phone.length < 8) return '****';
    return phone.slice(0, 4) + '****' + phone.slice(-3);
  }

  /**
   * Mask identifier (auto-detect email or phone)
   */
  static maskIdentifier(identifier) {
    if (identifier.includes('@')) {
      return this.maskEmail(identifier);
    }
    return this.maskPhone(identifier);
  }

  /**
   * Send OTP via email (mock - implement actual email service)
   */
  static async sendOTPEmail(email, otp, purpose) {
    // In production, integrate with email service (SendGrid, SES, etc.)
    logger.info('Sending OTP email', {
      to: this.maskEmail(email),
      purpose,
      // Don't log OTP in production
      otp: process.env.NODE_ENV === 'development' ? otp : '******'
    });

    // Mock email sending
    return {
      sent: true,
      message: `OTP sent to ${this.maskEmail(email)}`
    };
  }

  /**
   * Send OTP via SMS (mock - implement actual SMS service)
   */
  static async sendOTPSMS(phone, otp, purpose) {
    // In production, integrate with SMS service (Twilio, Termii, etc.)
    logger.info('Sending OTP SMS', {
      to: this.maskPhone(phone),
      purpose
    });

    // Mock SMS sending
    return {
      sent: true,
      message: `OTP sent to ${this.maskPhone(phone)}`
    };
  }
}

module.exports = OTPService;
