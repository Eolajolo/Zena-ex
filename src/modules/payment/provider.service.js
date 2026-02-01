const { logger } = require('../../shared/utils');

/**
 * Provider Service
 *
 * Handles external payment provider integrations with automatic failover.
 *
 * Primary Providers:
 * - Baxi: Nigerian VTU/Bills provider (https://www.baxipay.com.ng)
 * - Ringo: Nigerian VTU/Bills provider (https://www.rfringo.com)
 *
 * The service automatically fails over to the secondary provider
 * if the primary is unavailable or returns an error.
 */

// Provider configurations
// In production, API keys should come from environment variables
const PROVIDER_CONFIG = {
  // Baxi - Primary provider for most services
  baxi: {
    name: 'Baxi',
    baseUrl: process.env.BAXI_BASE_URL || 'https://payments.baxipay.com.ng/api/baxipay',
    apiKey: process.env.BAXI_API_KEY || '',
    agentCode: process.env.BAXI_AGENT_CODE || '',
    services: ['airtime', 'data', 'electricity', 'tv', 'betting'],
    priority: 1,
    enabled: true,
    timeout: 30000, // 30 seconds
    retries: 2,
    // Baxi-specific service codes
    serviceCodes: {
      airtime: {
        MTN: 'mtn',
        GLO: 'glo',
        AIRTEL: 'airtel',
        '9MOBILE': 'etisalat'
      },
      data: {
        MTN: 'mtn_data',
        GLO: 'glo_data',
        AIRTEL: 'airtel_data',
        '9MOBILE': 'etisalat_data'
      }
    }
  },

  // Ringo - Secondary/failover provider
  ringo: {
    name: 'Ringo',
    baseUrl: process.env.RINGO_BASE_URL || 'https://api.rfringo.com/api',
    apiKey: process.env.RINGO_API_KEY || '',
    merchantId: process.env.RINGO_MERCHANT_ID || '',
    services: ['airtime', 'data', 'electricity', 'tv'],
    priority: 2,
    enabled: true,
    timeout: 30000,
    retries: 2,
    // Ringo-specific service codes
    serviceCodes: {
      airtime: {
        MTN: 'MTN',
        GLO: 'GLO',
        AIRTEL: 'AIRTEL',
        '9MOBILE': '9MOBILE'
      },
      data: {
        MTN: 'MTN',
        GLO: 'GLO',
        AIRTEL: 'AIRTEL',
        '9MOBILE': '9MOBILE'
      }
    }
  }
};

// Provider health tracking
const providerHealth = {};

// Circuit breaker states
const CIRCUIT_STATES = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Failing, don't try
  HALF_OPEN: 'half_open' // Testing if recovered
};

const circuitBreakers = {};

class ProviderService {
  /**
   * Get provider configuration
   */
  static getProviderConfig(providerId) {
    return PROVIDER_CONFIG[providerId];
  }

  /**
   * Get available providers for a service, sorted by priority
   */
  static getProvidersForService(service) {
    return Object.entries(PROVIDER_CONFIG)
      .filter(([_, config]) => config.enabled && config.services.includes(service))
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([id, config]) => ({
        id,
        name: config.name,
        priority: config.priority,
        healthy: this.isProviderHealthy(id),
        circuitState: this.getCircuitState(id)
      }));
  }

  /**
   * Check if provider is healthy based on recent failures
   */
  static isProviderHealthy(providerId) {
    const health = providerHealth[providerId];
    if (!health) return true;

    // Check circuit breaker
    const circuit = circuitBreakers[providerId];
    if (circuit && circuit.state === CIRCUIT_STATES.OPEN) {
      // Check if we should try half-open
      if (Date.now() - circuit.openedAt > 60000) { // 1 minute cooldown
        circuit.state = CIRCUIT_STATES.HALF_OPEN;
      } else {
        return false;
      }
    }

    // Consider unhealthy if >3 failures in last 2 minutes
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    const recentFailures = (health.failures || []).filter(f => f > twoMinutesAgo);

    return recentFailures.length < 3;
  }

  /**
   * Get circuit breaker state
   */
  static getCircuitState(providerId) {
    const circuit = circuitBreakers[providerId];
    return circuit ? circuit.state : CIRCUIT_STATES.CLOSED;
  }

  /**
   * Record provider request result
   */
  static recordProviderResult(providerId, success, responseTime, error = null) {
    // Initialize health tracking
    if (!providerHealth[providerId]) {
      providerHealth[providerId] = {
        successes: 0,
        failures: [],
        totalRequests: 0,
        avgResponseTime: 0,
        lastSuccess: null,
        lastFailure: null,
        lastError: null
      };
    }

    // Initialize circuit breaker
    if (!circuitBreakers[providerId]) {
      circuitBreakers[providerId] = {
        state: CIRCUIT_STATES.CLOSED,
        failureCount: 0,
        successCount: 0,
        openedAt: null
      };
    }

    const health = providerHealth[providerId];
    const circuit = circuitBreakers[providerId];

    health.totalRequests++;
    health.lastChecked = Date.now();

    if (success) {
      health.successes++;
      health.lastSuccess = Date.now();
      health.avgResponseTime = Math.round(
        (health.avgResponseTime * (health.successes - 1) + responseTime) / health.successes
      );

      // Circuit breaker: success in half-open moves to closed
      if (circuit.state === CIRCUIT_STATES.HALF_OPEN) {
        circuit.successCount++;
        if (circuit.successCount >= 2) { // 2 successes to close
          circuit.state = CIRCUIT_STATES.CLOSED;
          circuit.failureCount = 0;
          circuit.successCount = 0;
          logger.info(`Circuit breaker CLOSED for ${providerId}`);
        }
      } else {
        circuit.failureCount = 0; // Reset on success
      }
    } else {
      health.failures.push(Date.now());
      health.lastFailure = Date.now();
      health.lastError = error;

      // Keep only last 20 failures
      if (health.failures.length > 20) {
        health.failures = health.failures.slice(-20);
      }

      // Circuit breaker: failures
      circuit.failureCount++;
      circuit.successCount = 0;

      if (circuit.failureCount >= 3 && circuit.state !== CIRCUIT_STATES.OPEN) {
        circuit.state = CIRCUIT_STATES.OPEN;
        circuit.openedAt = Date.now();
        logger.warn(`Circuit breaker OPEN for ${providerId}`, { failureCount: circuit.failureCount });
      }
    }
  }

  /**
   * Execute request with automatic failover between providers
   */
  static async executeWithFailover(service, operation, params) {
    const providers = this.getProvidersForService(service);
    const errors = [];

    for (const provider of providers) {
      // Skip unhealthy providers (unless in half-open for testing)
      if (!provider.healthy && provider.circuitState !== CIRCUIT_STATES.HALF_OPEN) {
        logger.info(`Skipping unhealthy provider: ${provider.name}`);
        continue;
      }

      try {
        const startTime = Date.now();
        const result = await this.executeProviderRequest(provider.id, service, operation, params);
        const responseTime = Date.now() - startTime;

        this.recordProviderResult(provider.id, true, responseTime);

        logger.info(`Provider ${provider.name} succeeded`, {
          service,
          operation,
          responseTime,
          reference: result.reference
        });

        return {
          success: true,
          provider: {
            id: provider.id,
            name: provider.name
          },
          data: result,
          responseTime
        };
      } catch (error) {
        this.recordProviderResult(provider.id, false, 0, error.message);
        errors.push({ provider: provider.name, error: error.message });

        logger.error(`Provider ${provider.name} failed`, {
          service,
          operation,
          error: error.message
        });

        // Continue to next provider
      }
    }

    // All providers failed
    logger.error('All providers failed', { service, operation, errors });

    return {
      success: false,
      error: 'Service temporarily unavailable. Please try again.',
      providerErrors: errors
    };
  }

  /**
   * Execute request to specific provider
   */
  static async executeProviderRequest(providerId, service, operation, params) {
    const config = PROVIDER_CONFIG[providerId];
    if (!config) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    // In production, implement actual API calls here
    // For now, use simulated responses for development
    if (process.env.NODE_ENV === 'production') {
      return this.makeProviderApiCall(providerId, service, operation, params);
    } else {
      return this.simulateProviderResponse(providerId, service, operation, params);
    }
  }

  /**
   * Make actual API call to provider (production)
   * This is where you'd implement the real Baxi/Ringo API calls
   */
  static async makeProviderApiCall(providerId, service, operation, params) {
    const config = PROVIDER_CONFIG[providerId];

    // TODO: Implement actual API calls when ready
    // Example structure for Baxi airtime:
    /*
    if (providerId === 'baxi' && operation === 'purchase_airtime') {
      const response = await axios.post(
        `${config.baseUrl}/services/airtime/request`,
        {
          agentCode: config.agentCode,
          service_type: config.serviceCodes.airtime[params.network],
          phone: params.phoneNumber,
          amount: params.amount,
          agentReference: params.reference
        },
        {
          headers: {
            'x-api-key': config.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: config.timeout
        }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          reference: response.data.transactionReference,
          providerReference: response.data.providerReference,
          message: response.data.message
        };
      } else {
        throw new Error(response.data.message || 'Provider request failed');
      }
    }
    */

    throw new Error('Production API calls not yet implemented');
  }

  /**
   * Simulate provider response (development/testing)
   */
  static async simulateProviderResponse(providerId, service, operation, params) {
    // Simulate network delay (200-700ms)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

    // Simulate occasional failures (5% failure rate per provider)
    if (Math.random() < 0.05) {
      const errors = [
        'Connection timeout',
        'Service temporarily unavailable',
        'Invalid response from provider',
        'Rate limit exceeded'
      ];
      throw new Error(errors[Math.floor(Math.random() * errors.length)]);
    }

    const timestamp = new Date().toISOString();
    const providerRef = `${providerId.toUpperCase()}_${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Generate response based on operation
    switch (operation) {
      case 'purchase_airtime':
        return {
          success: true,
          reference: params.reference,
          providerReference: providerRef,
          transactionId: providerRef,
          amount: params.amount,
          phoneNumber: params.phoneNumber,
          network: params.network,
          message: 'Airtime vending successful',
          timestamp
        };

      case 'purchase_data':
        return {
          success: true,
          reference: params.reference,
          providerReference: providerRef,
          transactionId: providerRef,
          amount: params.amount,
          phoneNumber: params.phoneNumber,
          network: params.network,
          bundleCode: params.bundleCode,
          bundleName: params.bundleName,
          message: 'Data bundle activated successfully',
          timestamp
        };

      case 'verify_meter':
        return {
          success: true,
          meterNumber: params.meterNumber,
          customerName: this.generateMockName(),
          customerAddress: 'Lagos, Nigeria',
          meterType: params.meterType || 'prepaid',
          disco: params.disco,
          minimumAmount: 1000,
          timestamp
        };

      case 'purchase_electricity':
        return {
          success: true,
          reference: params.reference,
          providerReference: providerRef,
          token: this.generateMockElectricityToken(),
          units: (params.amount / 50).toFixed(2),
          amount: params.amount,
          meterNumber: params.meterNumber,
          customerName: params.customerName,
          message: 'Electricity token generated successfully',
          timestamp
        };

      case 'verify_smartcard':
        return {
          success: true,
          smartcardNumber: params.smartcardNumber,
          customerName: this.generateMockName(),
          currentBouquet: 'DStv Compact',
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          provider: params.provider,
          timestamp
        };

      case 'purchase_tv':
        return {
          success: true,
          reference: params.reference,
          providerReference: providerRef,
          amount: params.amount,
          smartcardNumber: params.smartcardNumber,
          bouquet: params.bouquet,
          customerName: params.customerName,
          message: 'Cable TV subscription successful',
          timestamp
        };

      case 'verify_betting':
        return {
          success: true,
          customerId: params.customerId,
          customerName: this.generateMockName(),
          platform: params.platform,
          timestamp
        };

      case 'fund_betting':
        return {
          success: true,
          reference: params.reference,
          providerReference: providerRef,
          amount: params.amount,
          customerId: params.customerId,
          platform: params.platform,
          message: 'Betting wallet funded successfully',
          timestamp
        };

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Generate mock Nigerian name
   */
  static generateMockName() {
    const firstNames = ['Adebayo', 'Chinedu', 'Fatima', 'Oluwaseun', 'Emeka', 'Aisha', 'Tunde', 'Ngozi'];
    const lastNames = ['Okonkwo', 'Abubakar', 'Olumide', 'Nnamdi', 'Adeyemi', 'Ibrahim', 'Bakare', 'Eze'];
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
   * Get data bundles from provider
   */
  static async getDataBundles(providerId, network) {
    // In production, fetch from provider API
    // For now, return mock data bundles
    return this.getMockDataBundles(network);
  }

  /**
   * Mock data bundles (will be replaced with provider API)
   */
  static getMockDataBundles(network) {
    const bundles = {
      MTN: [
        { code: 'mtn_50mb', name: '50MB', amount: 50, validity: '1 day', description: '50MB Daily' },
        { code: 'mtn_150mb', name: '150MB', amount: 100, validity: '1 day', description: '150MB Daily' },
        { code: 'mtn_1gb', name: '1GB', amount: 300, validity: '1 day', description: '1GB Daily' },
        { code: 'mtn_2gb', name: '2GB', amount: 500, validity: '2 days', description: '2GB 2-Day Plan' },
        { code: 'mtn_3gb', name: '3GB', amount: 1000, validity: '30 days', description: '3GB Monthly' },
        { code: 'mtn_5gb', name: '5GB', amount: 1500, validity: '30 days', description: '5GB Monthly' },
        { code: 'mtn_10gb', name: '10GB', amount: 2500, validity: '30 days', description: '10GB Monthly' },
        { code: 'mtn_20gb', name: '20GB', amount: 5000, validity: '30 days', description: '20GB Monthly' },
        { code: 'mtn_40gb', name: '40GB', amount: 10000, validity: '30 days', description: '40GB Monthly' }
      ],
      GLO: [
        { code: 'glo_50mb', name: '50MB', amount: 50, validity: '1 day', description: '50MB Daily' },
        { code: 'glo_150mb', name: '150MB', amount: 100, validity: '1 day', description: '150MB Daily' },
        { code: 'glo_1gb', name: '1GB', amount: 300, validity: '1 day', description: '1GB Daily' },
        { code: 'glo_2gb', name: '2GB', amount: 500, validity: '14 days', description: '2GB Flexi' },
        { code: 'glo_4.5gb', name: '4.5GB', amount: 1000, validity: '30 days', description: '4.5GB Monthly' },
        { code: 'glo_7.5gb', name: '7.5GB', amount: 1500, validity: '30 days', description: '7.5GB Monthly' },
        { code: 'glo_10gb', name: '10GB', amount: 2500, validity: '30 days', description: '10GB Monthly' },
        { code: 'glo_18gb', name: '18GB', amount: 4000, validity: '30 days', description: '18GB Monthly' }
      ],
      AIRTEL: [
        { code: 'airtel_40mb', name: '40MB', amount: 50, validity: '1 day', description: '40MB Daily' },
        { code: 'airtel_100mb', name: '100MB', amount: 100, validity: '1 day', description: '100MB Daily' },
        { code: 'airtel_1gb', name: '1GB', amount: 300, validity: '1 day', description: '1GB Daily' },
        { code: 'airtel_2gb', name: '2GB', amount: 500, validity: '14 days', description: '2GB Binge' },
        { code: 'airtel_3gb', name: '3GB', amount: 1000, validity: '30 days', description: '3GB Monthly' },
        { code: 'airtel_4.5gb', name: '4.5GB', amount: 1500, validity: '30 days', description: '4.5GB Monthly' },
        { code: 'airtel_10gb', name: '10GB', amount: 2500, validity: '30 days', description: '10GB Monthly' },
        { code: 'airtel_20gb', name: '20GB', amount: 5000, validity: '30 days', description: '20GB Monthly' }
      ],
      '9MOBILE': [
        { code: '9mobile_50mb', name: '50MB', amount: 50, validity: '1 day', description: '50MB Daily' },
        { code: '9mobile_150mb', name: '150MB', amount: 100, validity: '1 day', description: '150MB Daily' },
        { code: '9mobile_1gb', name: '1GB', amount: 300, validity: '1 day', description: '1GB Daily' },
        { code: '9mobile_1.5gb', name: '1.5GB', amount: 500, validity: '30 days', description: '1.5GB Monthly' },
        { code: '9mobile_3gb', name: '3GB', amount: 1000, validity: '30 days', description: '3GB Monthly' },
        { code: '9mobile_4.5gb', name: '4.5GB', amount: 1500, validity: '30 days', description: '4.5GB Monthly' },
        { code: '9mobile_11gb', name: '11GB', amount: 2500, validity: '30 days', description: '11GB Monthly' },
        { code: '9mobile_15gb', name: '15GB', amount: 4000, validity: '30 days', description: '15GB Monthly' }
      ]
    };

    return bundles[network] || [];
  }

  /**
   * Get provider health dashboard
   */
  static getHealthDashboard() {
    const dashboard = {};

    for (const [providerId, config] of Object.entries(PROVIDER_CONFIG)) {
      const health = providerHealth[providerId] || {};
      const circuit = circuitBreakers[providerId] || { state: CIRCUIT_STATES.CLOSED };

      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      const recentFailures = (health.failures || []).filter(f => f > twoMinutesAgo);

      dashboard[providerId] = {
        name: config.name,
        enabled: config.enabled,
        services: config.services,
        priority: config.priority,
        healthy: this.isProviderHealthy(providerId),
        circuitState: circuit.state,
        stats: {
          totalRequests: health.totalRequests || 0,
          successes: health.successes || 0,
          recentFailures: recentFailures.length,
          avgResponseTime: health.avgResponseTime || 0,
          lastSuccess: health.lastSuccess ? new Date(health.lastSuccess).toISOString() : null,
          lastFailure: health.lastFailure ? new Date(health.lastFailure).toISOString() : null,
          lastError: health.lastError
        }
      };
    }

    return dashboard;
  }

  /**
   * Manually enable/disable a provider
   */
  static setProviderEnabled(providerId, enabled) {
    if (!PROVIDER_CONFIG[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    PROVIDER_CONFIG[providerId].enabled = enabled;
    logger.info(`Provider ${providerId} ${enabled ? 'enabled' : 'disabled'}`);

    return { providerId, enabled };
  }

  /**
   * Reset circuit breaker for a provider
   */
  static resetCircuitBreaker(providerId) {
    if (circuitBreakers[providerId]) {
      circuitBreakers[providerId] = {
        state: CIRCUIT_STATES.CLOSED,
        failureCount: 0,
        successCount: 0,
        openedAt: null
      };
      logger.info(`Circuit breaker reset for ${providerId}`);
    }
    return { providerId, state: CIRCUIT_STATES.CLOSED };
  }
}

module.exports = ProviderService;
