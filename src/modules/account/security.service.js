const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { NotFoundError, ValidationError } = require('../../shared/middleware');

class SecurityService {
  // ==========================================
  // Device Management
  // ==========================================

  /**
   * Get all devices for a user
   */
  static getDevices(userId) {
    const tokens = db.findMany('tokens', (t) =>
      t.userId === userId && new Date() < new Date(t.expiresAt)
    );

    const biometricTokens = db.findMany('biometricTokens', (t) =>
      t.userId === userId && new Date() < new Date(t.expiresAt)
    );

    // Group by device ID
    const deviceMap = new Map();

    tokens.forEach((token) => {
      const deviceId = token.deviceInfo?.deviceId || token.token;
      if (!deviceMap.has(deviceId)) {
        deviceMap.set(deviceId, {
          id: deviceId,
          name: this.getDeviceName(token.deviceInfo),
          platform: token.deviceInfo?.platform || 'Unknown',
          location: token.deviceInfo?.location || 'Unknown',
          isActive: true,
          lastActiveAt: token.createdAt,
          hasBiometric: false
        });
      }
    });

    biometricTokens.forEach((token) => {
      const deviceId = token.deviceId;
      if (deviceMap.has(deviceId)) {
        deviceMap.get(deviceId).hasBiometric = true;
      } else {
        deviceMap.set(deviceId, {
          id: deviceId,
          name: 'Unknown Device',
          platform: 'Unknown',
          location: 'Unknown',
          isActive: false,
          lastActiveAt: token.createdAt,
          hasBiometric: true
        });
      }
    });

    const devices = Array.from(deviceMap.values());

    // Sort by last active
    devices.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt));

    return {
      devices,
      count: devices.length
    };
  }

  /**
   * Register a new device
   */
  static registerDevice(userId, deviceInfo) {
    const deviceId = deviceInfo.deviceId || uuidv4();

    const device = {
      id: deviceId,
      userId,
      deviceId,
      name: this.getDeviceName(deviceInfo),
      platform: deviceInfo.platform || 'Unknown',
      userAgent: deviceInfo.userAgent || null,
      location: deviceInfo.location || null,
      ipAddress: deviceInfo.ipAddress || null,
      isTrusted: false,
      registeredAt: new Date(),
      lastActiveAt: new Date()
    };

    db.create('devices', deviceId, device);

    return device;
  }

  /**
   * Remove a device (logout from that device)
   */
  static removeDevice(userId, deviceId, currentDeviceId) {
    // Can't remove current device
    if (deviceId === currentDeviceId) {
      throw new ValidationError('Cannot remove current device. Use logout instead.');
    }

    // Remove all tokens for this device
    const tokens = db.findMany('tokens', (t) =>
      t.userId === userId && t.deviceInfo?.deviceId === deviceId
    );
    tokens.forEach((t) => db.delete('tokens', t.token));

    // Remove biometric tokens
    const biometricTokens = db.findMany('biometricTokens', (t) =>
      t.userId === userId && t.deviceId === deviceId
    );
    biometricTokens.forEach((t) => db.delete('biometricTokens', `biometric:${userId}:${deviceId}`));

    // Remove device record if exists
    db.delete('devices', deviceId);

    return {
      success: true,
      message: 'Device removed successfully'
    };
  }

  /**
   * Get device name from device info
   */
  static getDeviceName(deviceInfo) {
    if (!deviceInfo) return 'Unknown Device';

    const { platform, userAgent } = deviceInfo;

    if (platform) {
      if (platform.toLowerCase().includes('iphone')) return 'iPhone';
      if (platform.toLowerCase().includes('ipad')) return 'iPad';
      if (platform.toLowerCase().includes('android')) return 'Android';
      if (platform.toLowerCase().includes('mac')) return 'MacOS';
      if (platform.toLowerCase().includes('win')) return 'Windows';
      if (platform.toLowerCase().includes('linux')) return 'Linux';
    }

    if (userAgent) {
      if (userAgent.includes('iPhone')) return 'iPhone';
      if (userAgent.includes('iPad')) return 'iPad';
      if (userAgent.includes('Android')) return 'Android';
      if (userAgent.includes('Chrome')) return 'Google Chrome';
      if (userAgent.includes('Safari')) return 'Safari';
      if (userAgent.includes('Firefox')) return 'Firefox';
    }

    return 'Unknown Device';
  }

  /**
   * Update device last active time
   */
  static updateDeviceActivity(deviceId) {
    const device = db.findById('devices', deviceId);
    if (device) {
      db.update('devices', deviceId, {
        lastActiveAt: new Date()
      });
    }
  }

  // ==========================================
  // Security Logs
  // ==========================================

  /**
   * Log security event
   */
  static logSecurityEvent(userId, eventType, details = {}) {
    const eventId = uuidv4();
    const event = {
      id: eventId,
      userId,
      eventType,
      details,
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
      createdAt: new Date()
    };

    db.create('securityLogs', eventId, event);

    return event;
  }

  /**
   * Get security logs for a user
   */
  static getSecurityLogs(userId, limit = 20) {
    let logs = db.findMany('securityLogs', (l) => l.userId === userId);

    // Sort by date descending
    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Limit results
    logs = logs.slice(0, limit);

    return {
      logs: logs.map((log) => ({
        id: log.id,
        eventType: log.eventType,
        description: this.getEventDescription(log.eventType),
        ipAddress: log.ipAddress,
        createdAt: log.createdAt
      })),
      count: logs.length
    };
  }

  /**
   * Get human-readable event description
   */
  static getEventDescription(eventType) {
    const descriptions = {
      login: 'Logged in',
      logout: 'Logged out',
      password_changed: 'Password changed',
      pin_set: 'Transaction PIN set',
      pin_changed: 'Transaction PIN changed',
      phone_updated: 'Phone number updated',
      email_updated: 'Email updated',
      biometric_enabled: 'Biometric login enabled',
      biometric_disabled: 'Biometric login disabled',
      '2fa_enabled': '2-Factor Authentication enabled',
      '2fa_disabled': '2-Factor Authentication disabled',
      device_removed: 'Device removed',
      failed_login: 'Failed login attempt',
      failed_pin: 'Failed PIN attempt'
    };

    return descriptions[eventType] || eventType;
  }
}

module.exports = SecurityService;
