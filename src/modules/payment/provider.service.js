const { logger } = require('../../shared/utils');

/**
 * Provider Service
 *
 * This service abstracts external payment provider integrations.
 * It supports multiple providers with automatic failover and load balancing.
 *
 * Supported providers for different services:
 * - Airtime/Data: VTPass, Reloadly, Flutterwave
 * - Electricity: VTPass, Baxi
 * - Cable TV: VTPass, Baxi
 * - Betting: VTPass
 * - Bank Transfers: Paystack, Flutterwave
 * - International Transfers: Paystack, Wise, Flutterwave
 */

// Provider configurations (in production, load from environment/config)
const PROVIDER_CONFIG = {
  // VTPass - Nigerian VTU provider
  vtpass: {
    name: 'VTPass',
    baseUrl: 'https://api.vtpass.com/api',
    services: ['airtime', 'data', 'electricity', 'tv', 'betting'],
    priority: 1,
    enabled: true,
    timeout: 30000, // 30 seconds
    retries: 2
  },
  // Reloadly - International airtime/data provider
  reloadly: {
    name: 'Reloadly',
    baseUrl: 'https://topups.reloadly.com',
    services: ['airtime', 'data'],
    priority: 2,
    enabled: true,
    timeout: 30000,
    retries: 2
  },
  // Flutterwave - Payment provider
  flutterwave: {
    name: 'Flutterwave',
    baseUrl: 'https://api.flutterwave.com/v3',
    services: ['airtime', 'bank_transfer', 'international_transfer'],
    priority: 3,
    enabled: true,
    timeout: 60000,
    retries: 3
  },
  // Paystack - Payment provider
  paystack: {
    name: 'Paystack',
    baseUrl: 'https://api.paystack.co',
    services: ['bank_transfer', 'bank_verification'],
    priority: 1,
    enabled: true,
    timeout: 60000,
    retries: 3
  },
  // Baxi - Nigerian bills provider
  baxi: {
    name: 'Baxi',
    baseUrl: 'https://payments.baxipay.com.ng/api',
    services: ['airtime', 'data', 'electricity', 'tv'],
    priority: 2,
    enabled: true,
    timeout: 30000,
    retries: 2
  }
};

// Provider health status
const providerHealth = {};

class ProviderService {
  /**
   * Get available providers for a service
   */
  static getProvidersForService(service) {
    return Object.entries(PROVIDER_CONFIG)
      .filter(([_, config]) => config.enabled && config.services.includes(service))
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([id, config]) => ({
        id,
        name: config.name,
        priority: config.priority,
        healthy: this.isProviderHealthy(id)
      }));
  }

  /**
   * Check if a provider is healthy
   */
  static isProviderHealthy(providerId) {
    const health = providerHealth[providerId];
    if (!health) return true; // Assume healthy if no data

    // Consider unhealthy if >5 failures in last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentFailures = (health.failures || []).filter(f => f > fiveMinutesAgo);

    return recentFailures.length < 5;
  }

  /**
   * Record provider health status
   */
  static recordProviderStatus(providerId, success, responseTime) {
    if (!providerHealth[providerId]) {
      providerHealth[providerId] = {
        successes: 0,
        failures: [],
        avgResponseTime: 0,
        lastChecked: null
      };
    }

    const health = providerHealth[providerId];
    health.lastChecked = Date.now();

    if (success) {
      health.successes++;
      health.avgResponseTime = (health.avgResponseTime + responseTime) / 2;
    } else {
      health.failures.push(Date.now());
      // Keep only last 10 failures
      if (health.failures.length > 10) {
        health.failures = health.failures.slice(-10);
      }
    }
  }

  /**
   * Execute request with failover
   */
  static async executeWithFailover(service, operation, params) {
    const providers = this.getProvidersForService(service);

    for (const provider of providers) {
      if (!provider.healthy) {
        logger.warn(`Skipping unhealthy provider: ${provider.name}`);
        continue;
      }

      try {
        const startTime = Date.now();
        const result = await this.executeProviderRequest(provider.id, operation, params);
        const responseTime = Date.now() - startTime;

        this.recordProviderStatus(provider.id, true, responseTime);

        logger.info(`Provider ${provider.name} succeeded`, {
          service,
          operation,
          responseTime
        });

        return {
          success: true,
          provider: provider.name,
          data: result
        };
      } catch (error) {
        this.recordProviderStatus(provider.id, false, 0);

        logger.error(`Provider ${provider.name} failed`, {
          service,
          operation,
          error: error.message
        });

        // Continue to next provider
      }
    }

    // All providers failed
    return {
      success: false,
      error: 'All providers are currently unavailable'
    };
  }

  /**
   * Execute request to specific provider
   * In production, this would make actual HTTP calls
   */
  static async executeProviderRequest(providerId, operation, params) {
    const config = PROVIDER_CONFIG[providerId];
    if (!config) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    // In production, implement actual API calls here
    // For now, simulate provider responses
    return this.simulateProviderResponse(providerId, operation, params);
  }

  /**
   * Simulate provider response (for development)
   */
  static async simulateProviderResponse(providerId, operation, params) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

    // Simulate occasional failures (5% failure rate)
    if (Math.random() < 0.05) {
      throw new Error('Provider service temporarily unavailable');
    }

    // Generate mock response based on operation
    switch (operation) {
      case 'purchase_airtime':
        return {
          status: 'success',
          transactionId: `${providerId.toUpperCase()}_${Date.now()}`,
          reference: params.reference,
          amount: params.amount,
          phoneNumber: params.phoneNumber,
          network: params.network,
          message: 'Airtime vending successful'
        };

      case 'verify_bank_account':
        return {
          status: 'success',
          accountNumber: params.accountNumber,
          bankCode: params.bankCode,
          accountName: this.generateMockAccountName(),
          bankName: params.bankName
        };

      case 'transfer_to_bank':
        return {
          status: 'success',
          transactionId: `${providerId.toUpperCase()}_${Date.now()}`,
          reference: params.reference,
          amount: params.amount,
          accountNumber: params.accountNumber,
          bankCode: params.bankCode,
          message: 'Transfer initiated'
        };

      case 'purchase_data':
        return {
          status: 'success',
          transactionId: `${providerId.toUpperCase()}_${Date.now()}`,
          reference: params.reference,
          amount: params.amount,
          phoneNumber: params.phoneNumber,
          dataBundle: params.bundleCode,
          message: 'Data bundle activated'
        };

      case 'pay_electricity':
        return {
          status: 'success',
          transactionId: `${providerId.toUpperCase()}_${Date.now()}`,
          reference: params.reference,
          token: this.generateMockElectricityToken(),
          units: (params.amount / 50).toFixed(2),
          amount: params.amount,
          meterNumber: params.meterNumber,
          message: 'Electricity token generated'
        };

      case 'pay_tv':
        return {
          status: 'success',
          transactionId: `${providerId.toUpperCase()}_${Date.now()}`,
          reference: params.reference,
          amount: params.amount,
          cardNumber: params.cardNumber,
          package: params.package,
          message: 'Cable TV subscription successful'
        };

      case 'fund_betting':
        return {
          status: 'success',
          transactionId: `${providerId.toUpperCase()}_${Date.now()}`,
          reference: params.reference,
          amount: params.amount,
          customerId: params.customerId,
          platform: params.platform,
          message: 'Betting wallet funded'
        };

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Generate mock account name for bank verification
   */
  static generateMockAccountName() {
    const firstNames = ['Adebayo', 'Chinedu', 'Fatima', 'Oluwaseun', 'Emeka'];
    const lastNames = ['Okonkwo', 'Abubakar', 'Olumide', 'Nnamdi', 'Adeyemi'];
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
  }

  /**
   * Generate mock electricity token
   */
  static generateMockElectricityToken() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
      segments.push(Math.floor(Math.random() * 90000 + 10000).toString());
    }
    return segments.join('-');
  }

  /**
   * Get provider health dashboard
   */
  static getHealthDashboard() {
    const dashboard = {};

    for (const [providerId, config] of Object.entries(PROVIDER_CONFIG)) {
      const health = providerHealth[providerId] || {};

      dashboard[providerId] = {
        name: config.name,
        enabled: config.enabled,
        services: config.services,
        healthy: this.isProviderHealthy(providerId),
        stats: {
          successes: health.successes || 0,
          recentFailures: (health.failures || []).filter(f => f > Date.now() - 5 * 60 * 1000).length,
          avgResponseTime: Math.round(health.avgResponseTime || 0),
          lastChecked: health.lastChecked ? new Date(health.lastChecked).toISOString() : null
        }
      };
    }

    return dashboard;
  }

  /**
   * Manually toggle provider enabled status
   */
  static setProviderEnabled(providerId, enabled) {
    if (!PROVIDER_CONFIG[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    PROVIDER_CONFIG[providerId].enabled = enabled;

    logger.info(`Provider ${providerId} ${enabled ? 'enabled' : 'disabled'}`);

    return { providerId, enabled };
  }
}

module.exports = ProviderService;
