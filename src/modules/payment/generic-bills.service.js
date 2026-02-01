const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { NotFoundError, ValidationError } = require('../../shared/middleware');
const { TRANSACTION_STATUS, BILL_CATEGORIES } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');
const AccountService = require('../account/account.service');
const ProviderService = require('./provider.service');
const CommissionService = require('./commission.service');

/**
 * Generic Bills Service
 *
 * Configuration-based service for handling various bill payment types:
 * - Betting (wallet funding)
 * - Electricity (prepaid/postpaid)
 * - Cable TV (subscription)
 *
 * Each bill type is configured with:
 * - Providers/billers
 * - Validation rules
 * - Custom fields
 * - Amount limits
 *
 * NOTE: Wallet Integration
 * When Wallet module is built, update purchase methods to debit/credit wallet.
 */

// High value transaction threshold - requires biometric + PIN
const HIGH_VALUE_THRESHOLD = 500000;

// VAT rate for electricity (7.5%)
const ELECTRICITY_VAT_RATE = 0.075;

// Default tariff rates per DISCO (₦/kWh) - will be updated from provider API
const DEFAULT_TARIFF_RATES = {
  IKEDC: 209.5,
  EKEDC: 205.8,
  AEDC: 198.6,
  PHED: 215.2,
  KEDCO: 195.4,
  IBEDC: 202.3,
  BEDC: 210.8,
  EEDC: 198.9
};

// ==========================================
// BILL TYPE CONFIGURATIONS
// ==========================================

const BILL_CONFIGS = {
  // Betting Configuration
  [BILL_CATEGORIES.BETTING]: {
    name: 'Betting',
    description: 'Fund your betting wallet',
    icon: 'gamepad',
    collection: 'bettingTransactions',
    beneficiaryCollection: 'bettingBeneficiaries',
    previewCollection: 'bettingPreviews',
    referencePrefix: 'BET',
    customerIdField: 'customerId',
    customerIdLabel: 'Betting ID',
    customerIdPlaceholder: 'Enter Betting ID e.g 23236FSD',
    requiresValidation: true,
    validationOperation: 'verify_betting',
    purchaseOperation: 'fund_betting',
    amountLimits: { min: 100, max: 500000 },
    providers: {
      SPORTYBET: {
        id: 'sportybet',
        code: 'SPORTYBET',
        name: 'SportyBet',
        logo: 'sportybet.png',
        color: '#E53935'
      },
      '1XBET': {
        id: '1xbet',
        code: '1XBET',
        name: '1XBET',
        logo: '1xbet.png',
        color: '#1A5CBA'
      },
      BET9JA: {
        id: 'bet9ja',
        code: 'BET9JA',
        name: 'Bet9ja',
        logo: 'bet9ja.png',
        color: '#1D6F2C'
      },
      BET365: {
        id: 'bet365',
        code: 'BET365',
        name: 'Bet365',
        logo: 'bet365.png',
        color: '#027B5B'
      },
      '1960BET': {
        id: '1960bet',
        code: '1960BET',
        name: '1960BET',
        logo: '1960bet.png',
        color: '#008751'
      },
      BETKING: {
        id: 'betking',
        code: 'BETKING',
        name: 'BetKing',
        logo: 'betking.png',
        color: '#0066CC'
      },
      BETWAY: {
        id: 'betway',
        code: 'BETWAY',
        name: 'Betway',
        logo: 'betway.png',
        color: '#00A826'
      },
      BETANO: {
        id: 'betano',
        code: 'BETANO',
        name: 'Betano',
        logo: 'betano.png',
        color: '#E4002B'
      }
    }
  },

  // Electricity Configuration
  [BILL_CATEGORIES.ELECTRICITY]: {
    name: 'Electricity',
    description: 'Pay electricity bills',
    icon: 'bolt',
    collection: 'electricityTransactions',
    beneficiaryCollection: 'electricityBeneficiaries',
    previewCollection: 'electricityPreviews',
    referencePrefix: 'ELC',
    customerIdField: 'meterNumber',
    customerIdLabel: 'Meter Number',
    customerIdPlaceholder: 'Enter your Meter Number',
    requiresValidation: true,
    validationOperation: 'verify_meter',
    purchaseOperation: 'purchase_electricity',
    amountLimits: { min: 1000, max: 500000 },
    hasMeterTypes: true,
    meterTypes: [
      { id: 'prepaid', name: 'Prepaid', description: 'Pay before use - receive token' },
      { id: 'postpaid', name: 'Postpaid', description: 'Pay after use - clear bills' }
    ],
    defaultMeterType: 'prepaid',
    vatRate: ELECTRICITY_VAT_RATE,
    providers: {
      IKEDC: {
        id: 'ikedc',
        code: 'IKEDC',
        name: 'Ikeja Electric',
        shortName: 'Ikeja Electric',
        logo: 'ikedc.png',
        serviceId: 'ikeja-electric',
        tariffRate: DEFAULT_TARIFF_RATES.IKEDC,
        minPurchase: 1000
      },
      EKEDC: {
        id: 'ekedc',
        code: 'EKEDC',
        name: 'Eko Electric',
        shortName: 'EKEDC',
        logo: 'ekedc.png',
        serviceId: 'eko-electric',
        tariffRate: DEFAULT_TARIFF_RATES.EKEDC,
        minPurchase: 1000
      },
      AEDC: {
        id: 'aedc',
        code: 'AEDC',
        name: 'Abuja Electric',
        shortName: 'AEDC',
        logo: 'aedc.png',
        serviceId: 'abuja-electric',
        tariffRate: DEFAULT_TARIFF_RATES.AEDC,
        minPurchase: 1000
      },
      PHED: {
        id: 'phed',
        code: 'PHED',
        name: 'Port Harcourt Electric',
        shortName: 'PHED',
        logo: 'phed.png',
        serviceId: 'portharcourt-electric',
        tariffRate: DEFAULT_TARIFF_RATES.PHED,
        minPurchase: 1000
      },
      KEDCO: {
        id: 'kedco',
        code: 'KEDCO',
        name: 'Kano Electric',
        shortName: 'KEDCO',
        logo: 'kedco.png',
        serviceId: 'kano-electric',
        tariffRate: DEFAULT_TARIFF_RATES.KEDCO,
        minPurchase: 1000
      },
      IBEDC: {
        id: 'ibedc',
        code: 'IBEDC',
        name: 'Ibadan Electric',
        shortName: 'IBEDC',
        logo: 'ibedc.png',
        serviceId: 'ibadan-electric',
        tariffRate: DEFAULT_TARIFF_RATES.IBEDC,
        minPurchase: 1000
      },
      BEDC: {
        id: 'bedc',
        code: 'BEDC',
        name: 'Benin Electric',
        shortName: 'BEDC',
        logo: 'bedc.png',
        serviceId: 'benin-electric',
        tariffRate: DEFAULT_TARIFF_RATES.BEDC,
        minPurchase: 1000
      },
      EEDC: {
        id: 'eedc',
        code: 'EEDC',
        name: 'Enugu Electric',
        shortName: 'EEDC',
        logo: 'eedc.png',
        serviceId: 'enugu-electric',
        tariffRate: DEFAULT_TARIFF_RATES.EEDC,
        minPurchase: 1000
      }
    }
  },

  // Cable TV Configuration
  [BILL_CATEGORIES.TV]: {
    name: 'Cable TV',
    description: 'Pay TV subscriptions',
    icon: 'tv',
    collection: 'tvTransactions',
    beneficiaryCollection: 'tvBeneficiaries',
    previewCollection: 'tvPreviews',
    referencePrefix: 'TV',
    customerIdField: 'decoderNumber',
    customerIdLabel: 'Decoder Number',
    customerIdPlaceholder: 'Enter Decoder Number (IUC)',
    requiresValidation: true,
    validationOperation: 'verify_smartcard',
    purchaseOperation: 'purchase_tv',
    hasPackages: true,
    hasPackageCategories: true,
    packageCategories: [
      { id: 'hot', name: 'Hot', description: 'Popular packages' },
      { id: 'premium', name: 'Premium', description: 'Premium packages with add-ons' }
    ],
    tabs: [
      { id: 'cable_tv', name: 'Cable Tv', active: true },
      { id: 'transactions', name: 'Transactions', active: false }
    ],
    providers: {
      DSTV: {
        id: 'dstv',
        code: 'DSTV',
        name: 'DSTV',
        fullName: 'DStv Nigeria',
        logo: 'dstv.png',
        color: '#003087',
        packageCategories: {
          hot: [
            { code: 'dstv_padi', name: 'Dstv Padi', amount: 4400, validity: '1 Month', description: 'Dstv Padi Package' },
            { code: 'dstv_yanga', name: 'Dstv Yanga', amount: 6000, validity: '1 Month', description: 'Dstv Yanga Package' },
            { code: 'dstv_confam', name: 'Dstv Confam', amount: 11000, validity: '1 Month', description: 'Dstv Confam Package' },
            { code: 'dstv_compact', name: 'Dstv Compact', amount: 15000, validity: '1 Month', description: 'Dstv Compact Package' },
            { code: 'dstv_compact_plus', name: 'Dstv Compact+', amount: 30000, validity: '1 Month', description: 'Dstv Compact+ Package' },
            { code: 'dstv_stream', name: 'Dstv Stream', amount: 44500, validity: '1 Month', description: 'Dstv Stream Package' }
          ],
          premium: [
            { code: 'dstv_premium', name: 'Dstv Premium', amount: 44500, validity: '1 Month', description: 'Dstv Premium Package' },
            { code: 'dstv_premium_french', name: 'Dstv Premium + French', amount: 65500, validity: '1 Month', description: 'Dstv Premium with French Channels' },
            { code: 'dstv_premium_showmax', name: 'Dstv Premium + Showmax', amount: 44500, validity: '1 Month', description: 'Dstv Premium with Showmax' },
            { code: 'dstv_premium_french_showmax', name: 'Dstv Premium French + Showmax', amount: 44500, validity: '1 Month', description: 'Dstv Premium with French and Showmax' },
            { code: 'dstv_premium_asia', name: 'Dstv Premium + Asia', amount: 44500, validity: '1 Month', description: 'Dstv Premium with Asia Channels' },
            { code: 'dstv_premium_asia_showmax', name: 'Dstv Premium Asia Showmax', amount: 44500, validity: '1 Month', description: 'Dstv Premium with Asia and Showmax' },
            { code: 'dstv_premium_xtraview', name: 'Dstv Premium + Xtraview', amount: 44500, validity: '1 Month', description: 'Dstv Premium with Xtraview' },
            { code: 'dstv_premium_french_xtraview', name: 'Dstv Premium + French + Xtraview', amount: 75000, validity: '1 Month', description: 'Dstv Premium with French and Xtraview' },
            { code: 'dstv_premium_asia_xtraview', name: 'Dstv Premiumasia + Xtraview', amount: 66500, validity: '1 Month', description: 'Dstv Premium with Asia and Xtraview' },
            { code: 'dstv_stream_premium', name: 'Dstv Stream Premium', amount: 44500, validity: '1 Month', description: 'Dstv Stream Premium Package' }
          ]
        },
        // Flat list for backward compatibility
        packages: [
          { code: 'dstv_padi', name: 'Dstv Padi', amount: 4400, validity: '1 Month', category: 'hot' },
          { code: 'dstv_yanga', name: 'Dstv Yanga', amount: 6000, validity: '1 Month', category: 'hot' },
          { code: 'dstv_confam', name: 'Dstv Confam', amount: 11000, validity: '1 Month', category: 'hot' },
          { code: 'dstv_compact', name: 'Dstv Compact', amount: 15000, validity: '1 Month', category: 'hot' },
          { code: 'dstv_compact_plus', name: 'Dstv Compact+', amount: 30000, validity: '1 Month', category: 'hot' },
          { code: 'dstv_stream', name: 'Dstv Stream', amount: 44500, validity: '1 Month', category: 'hot' },
          { code: 'dstv_premium', name: 'Dstv Premium', amount: 44500, validity: '1 Month', category: 'premium' },
          { code: 'dstv_premium_french', name: 'Dstv Premium + French', amount: 65500, validity: '1 Month', category: 'premium' },
          { code: 'dstv_premium_showmax', name: 'Dstv Premium + Showmax', amount: 44500, validity: '1 Month', category: 'premium' },
          { code: 'dstv_premium_french_showmax', name: 'Dstv Premium French + Showmax', amount: 44500, validity: '1 Month', category: 'premium' },
          { code: 'dstv_premium_asia', name: 'Dstv Premium + Asia', amount: 44500, validity: '1 Month', category: 'premium' },
          { code: 'dstv_premium_asia_showmax', name: 'Dstv Premium Asia Showmax', amount: 44500, validity: '1 Month', category: 'premium' },
          { code: 'dstv_premium_xtraview', name: 'Dstv Premium + Xtraview', amount: 44500, validity: '1 Month', category: 'premium' },
          { code: 'dstv_premium_french_xtraview', name: 'Dstv Premium + French + Xtraview', amount: 75000, validity: '1 Month', category: 'premium' },
          { code: 'dstv_premium_asia_xtraview', name: 'Dstv Premiumasia + Xtraview', amount: 66500, validity: '1 Month', category: 'premium' },
          { code: 'dstv_stream_premium', name: 'Dstv Stream Premium', amount: 44500, validity: '1 Month', category: 'premium' }
        ]
      },
      SHOWMAX: {
        id: 'showmax',
        code: 'SHOWMAX',
        name: 'Showmax',
        fullName: 'Showmax Streaming',
        logo: 'showmax.png',
        color: '#E50914',
        packageCategories: {
          hot: [
            { code: 'showmax_mobile', name: 'Showmax Mobile', amount: 1200, validity: '1 Month', description: 'Mobile only streaming' },
            { code: 'showmax_standard', name: 'Showmax Standard', amount: 2900, validity: '1 Month', description: 'Standard streaming package' }
          ],
          premium: [
            { code: 'showmax_pro', name: 'Showmax Pro', amount: 6300, validity: '1 Month', description: 'Pro package with sports' },
            { code: 'showmax_pro_mobile', name: 'Showmax Pro Mobile', amount: 3200, validity: '1 Month', description: 'Pro mobile streaming' }
          ]
        },
        packages: [
          { code: 'showmax_mobile', name: 'Showmax Mobile', amount: 1200, validity: '1 Month', category: 'hot' },
          { code: 'showmax_standard', name: 'Showmax Standard', amount: 2900, validity: '1 Month', category: 'hot' },
          { code: 'showmax_pro', name: 'Showmax Pro', amount: 6300, validity: '1 Month', category: 'premium' },
          { code: 'showmax_pro_mobile', name: 'Showmax Pro Mobile', amount: 3200, validity: '1 Month', category: 'premium' }
        ]
      },
      GOTV: {
        id: 'gotv',
        code: 'GOTV',
        name: 'GoTV',
        fullName: 'GOtv Nigeria',
        logo: 'gotv.png',
        color: '#00A859',
        packageCategories: {
          hot: [
            { code: 'gotv_smallie', name: 'GOtv Smallie', amount: 1575, validity: '1 Month', description: 'GOtv Smallie Package' },
            { code: 'gotv_jinja', name: 'GOtv Jinja', amount: 3300, validity: '1 Month', description: 'GOtv Jinja Package' },
            { code: 'gotv_jolli', name: 'GOtv Jolli', amount: 5100, validity: '1 Month', description: 'GOtv Jolli Package' }
          ],
          premium: [
            { code: 'gotv_max', name: 'GOtv Max', amount: 7200, validity: '1 Month', description: 'GOtv Max Package' },
            { code: 'gotv_supa', name: 'GOtv Supa', amount: 9600, validity: '1 Month', description: 'GOtv Supa Package' },
            { code: 'gotv_supa_plus', name: 'GOtv Supa+', amount: 15700, validity: '1 Month', description: 'GOtv Supa+ Package' }
          ]
        },
        packages: [
          { code: 'gotv_smallie', name: 'GOtv Smallie', amount: 1575, validity: '1 Month', category: 'hot' },
          { code: 'gotv_jinja', name: 'GOtv Jinja', amount: 3300, validity: '1 Month', category: 'hot' },
          { code: 'gotv_jolli', name: 'GOtv Jolli', amount: 5100, validity: '1 Month', category: 'hot' },
          { code: 'gotv_max', name: 'GOtv Max', amount: 7200, validity: '1 Month', category: 'premium' },
          { code: 'gotv_supa', name: 'GOtv Supa', amount: 9600, validity: '1 Month', category: 'premium' },
          { code: 'gotv_supa_plus', name: 'GOtv Supa+', amount: 15700, validity: '1 Month', category: 'premium' }
        ]
      },
      STARTIMES: {
        id: 'startimes',
        code: 'STARTIMES',
        name: 'StarTimes',
        fullName: 'StarTimes Nigeria',
        logo: 'startimes.png',
        color: '#FF6600',
        packageCategories: {
          hot: [
            { code: 'startimes_nova', name: 'StarTimes Nova', amount: 1200, validity: '1 Month', description: 'StarTimes Nova Package' },
            { code: 'startimes_basic', name: 'StarTimes Basic', amount: 2100, validity: '1 Month', description: 'StarTimes Basic Package' },
            { code: 'startimes_smart', name: 'StarTimes Smart', amount: 2800, validity: '1 Month', description: 'StarTimes Smart Package' }
          ],
          premium: [
            { code: 'startimes_classic', name: 'StarTimes Classic', amount: 3000, validity: '1 Month', description: 'StarTimes Classic Package' },
            { code: 'startimes_super', name: 'StarTimes Super', amount: 5500, validity: '1 Month', description: 'StarTimes Super Package' }
          ]
        },
        packages: [
          { code: 'startimes_nova', name: 'StarTimes Nova', amount: 1200, validity: '1 Month', category: 'hot' },
          { code: 'startimes_basic', name: 'StarTimes Basic', amount: 2100, validity: '1 Month', category: 'hot' },
          { code: 'startimes_smart', name: 'StarTimes Smart', amount: 2800, validity: '1 Month', category: 'hot' },
          { code: 'startimes_classic', name: 'StarTimes Classic', amount: 3000, validity: '1 Month', category: 'premium' },
          { code: 'startimes_super', name: 'StarTimes Super', amount: 5500, validity: '1 Month', category: 'premium' }
        ]
      }
    }
  }
};

class GenericBillsService {
  // ==========================================
  // Configuration Methods
  // ==========================================

  /**
   * Get configuration for a bill type
   */
  static getConfig(billType) {
    const config = BILL_CONFIGS[billType];
    if (!config) {
      throw new ValidationError(`Invalid bill type: ${billType}`);
    }
    return config;
  }

  /**
   * Get all supported bill types
   */
  static getBillTypes() {
    return Object.entries(BILL_CONFIGS).map(([key, config]) => ({
      id: key,
      name: config.name,
      description: config.description,
      icon: config.icon
    }));
  }

  /**
   * Get providers for a bill type
   */
  static getProviders(billType) {
    const config = this.getConfig(billType);
    return Object.values(config.providers).map(p => {
      const provider = {
        id: p.id,
        code: p.code,
        name: p.name,
        shortName: p.shortName || p.name,
        logo: p.logo,
        color: p.color
      };

      // Add electricity-specific provider fields
      if (billType === BILL_CATEGORIES.ELECTRICITY) {
        provider.minPurchase = p.minPurchase;
        provider.tariffRate = p.tariffRate;
        provider.serviceId = p.serviceId;
      }

      return provider;
    });
  }

  /**
   * Get provider by code
   */
  static getProvider(billType, providerCode) {
    const config = this.getConfig(billType);
    const provider = config.providers[providerCode.toUpperCase()];
    if (!provider) {
      throw new ValidationError('Invalid provider');
    }
    return provider;
  }

  /**
   * Get packages for a provider (for TV)
   */
  static getPackages(billType, providerCode, category = null) {
    const config = this.getConfig(billType);
    if (!config.hasPackages) {
      return null;
    }
    const provider = this.getProvider(billType, providerCode);

    // If provider has package categories and category is specified
    if (config.hasPackageCategories && provider.packageCategories) {
      if (category) {
        return provider.packageCategories[category] || [];
      }
      // Return all packages grouped by category
      return {
        categories: config.packageCategories,
        packages: provider.packageCategories,
        flatList: provider.packages || []
      };
    }

    return provider.packages || [];
  }

  /**
   * Get packages by category for TV providers
   */
  static getPackagesByCategory(billType, providerCode, category) {
    const config = this.getConfig(billType);
    if (!config.hasPackageCategories) {
      return this.getPackages(billType, providerCode);
    }

    const provider = this.getProvider(billType, providerCode);
    if (!provider.packageCategories) {
      return provider.packages || [];
    }

    return provider.packageCategories[category] || [];
  }

  /**
   * Get bill type info (for UI)
   */
  static getBillTypeInfo(billType) {
    const config = this.getConfig(billType);
    const info = {
      name: config.name,
      description: config.description,
      icon: config.icon,
      customerIdLabel: config.customerIdLabel,
      customerIdPlaceholder: config.customerIdPlaceholder,
      requiresValidation: config.requiresValidation,
      amountLimits: config.amountLimits,
      hasMeterTypes: config.hasMeterTypes || false,
      meterTypes: config.meterTypes || null,
      defaultMeterType: config.defaultMeterType || null,
      hasPackages: config.hasPackages || false,
      hasPackageCategories: config.hasPackageCategories || false,
      packageCategories: config.packageCategories || null,
      tabs: config.tabs || null,
      providers: this.getProviders(billType)
    };

    // For electricity, add VAT rate info and tabs
    if (billType === BILL_CATEGORIES.ELECTRICITY) {
      info.vatRate = config.vatRate;
      info.tabs = [
        { id: 'prepaid', name: 'Prepaid', active: true },
        { id: 'postpaid', name: 'Postpaid', active: false },
        { id: 'transactions', name: 'Transactions', active: false }
      ];
    }

    // For TV, add package categories and tabs
    if (billType === BILL_CATEGORIES.TV) {
      info.tabs = config.tabs || [
        { id: 'cable_tv', name: 'Cable Tv', active: true },
        { id: 'transactions', name: 'Transactions', active: false }
      ];
    }

    return info;
  }

  // ==========================================
  // Validation Methods
  // ==========================================

  /**
   * Validate amount
   */
  static validateAmount(billType, amount) {
    const config = this.getConfig(billType);
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return { valid: false, error: 'Invalid amount' };
    }

    if (config.amountLimits) {
      if (numAmount < config.amountLimits.min) {
        return { valid: false, error: `Minimum amount is ₦${config.amountLimits.min}` };
      }
      if (numAmount > config.amountLimits.max) {
        return { valid: false, error: `Maximum amount is ₦${config.amountLimits.max.toLocaleString()}` };
      }
    }

    return { valid: true, error: null };
  }

  /**
   * Validate customer ID with provider
   */
  static async validateCustomer(billType, providerCode, customerId, options = {}) {
    const config = this.getConfig(billType);
    const provider = this.getProvider(billType, providerCode);

    if (!config.requiresValidation) {
      return {
        valid: true,
        customerId,
        customerName: null,
        provider
      };
    }

    // For electricity, validate meter type
    if (billType === BILL_CATEGORIES.ELECTRICITY && options.meterType) {
      const meterValidation = this.validateMeterType(options.meterType);
      if (!meterValidation.valid) {
        return {
          valid: false,
          error: meterValidation.error,
          customerId,
          provider
        };
      }
    }

    // Call provider to validate customer
    const result = await ProviderService.executeWithFailover(
      billType,
      config.validationOperation,
      {
        customerId,
        provider: provider.code,
        ...options
      }
    );

    if (!result.success) {
      return {
        valid: false,
        error: result.error || 'Unable to verify customer',
        customerId,
        provider
      };
    }

    // Build base response
    const response = {
      valid: true,
      customerId,
      customerName: result.data.customerName,
      customerDetails: result.data,
      provider
    };

    // Add electricity-specific fields
    if (billType === BILL_CATEGORIES.ELECTRICITY) {
      response.meterDetails = {
        meterNumber: customerId,
        customerName: result.data.customerName,
        meterType: options.meterType || 'prepaid',
        meterCategory: result.data.meterCategory || result.data.tariffClass || 'MD',
        tariffClass: result.data.tariffClass || 'A-Non MD',
        serviceAddress: result.data.serviceAddress || result.data.address || '',
        minPurchase: provider.minPurchase || 1000,
        tariffRate: result.data.tariffRate || provider.tariffRate,
        outstandingDebt: result.data.outstandingDebt || 0
      };
    }

    return response;
  }

  /**
   * Check if transaction requires biometric
   */
  static requiresBiometric(amount) {
    return Number(amount) >= HIGH_VALUE_THRESHOLD;
  }

  /**
   * Calculate cashback using CommissionService
   * Returns full commission breakdown including company profit
   *
   * @param {number} amount - Transaction amount
   * @param {string} billType - Bill category
   * @param {string} providerCode - Provider code
   * @param {string} externalProvider - External provider (baxi/ringo)
   * @returns {Object} Commission breakdown
   */
  static calculateCashback(amount, billType, providerCode, externalProvider = 'baxi') {
    return CommissionService.calculateCashback(amount, billType, providerCode, externalProvider);
  }

  /**
   * Check if cashback is available for this product/provider
   */
  static isCashbackAvailable(billType, providerCode, externalProvider = 'baxi') {
    return CommissionService.isCashbackAvailable(billType, providerCode, externalProvider);
  }

  // ==========================================
  // Electricity-Specific Methods
  // ==========================================

  /**
   * Calculate electricity units (kWh) from amount
   * Formula: Units = (Amount - VAT) / Tariff Rate
   */
  static calculateElectricityUnits(amount, tariffRate, vatRate = ELECTRICITY_VAT_RATE) {
    const amountBeforeVat = amount / (1 + vatRate);
    const units = amountBeforeVat / tariffRate;
    return Math.round(units * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate electricity breakdown
   * Returns detailed cost breakdown for electricity purchase
   */
  static calculateElectricityBreakdown(amount, providerCode) {
    const tariffRate = DEFAULT_TARIFF_RATES[providerCode] || 209.5;
    const vatRate = ELECTRICITY_VAT_RATE;

    // Calculate amounts
    const costOfUnits = amount / (1 + vatRate);
    const vatAmount = amount - costOfUnits;
    const unitsPurchased = costOfUnits / tariffRate;

    return {
      amount,
      costOfUnits: Math.round(costOfUnits * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      vatRate,
      tariffRate,
      unitsPurchased: Math.round(unitsPurchased * 100) / 100,
      unitLabel: 'kWh'
    };
  }

  /**
   * Generate electricity token (mock - real token comes from provider)
   * Format: XXXX-XXXX-XXXX-XXXX-XXXX
   */
  static generateMockElectricityToken() {
    const segments = [];
    for (let i = 0; i < 5; i++) {
      segments.push(Math.floor(1000 + Math.random() * 9000).toString());
    }
    return segments.join('-');
  }

  /**
   * Validate meter type
   */
  static validateMeterType(meterType) {
    const validTypes = ['prepaid', 'postpaid'];
    if (!meterType || !validTypes.includes(meterType.toLowerCase())) {
      return { valid: false, error: 'Invalid meter type. Must be prepaid or postpaid.' };
    }
    return { valid: true, meterType: meterType.toLowerCase() };
  }

  // ==========================================
  // Beneficiary Methods
  // ==========================================

  /**
   * Get beneficiaries for a bill type
   */
  static getBeneficiaries(billType, userId, search = '', options = {}) {
    const config = this.getConfig(billType);
    const { meterType } = options;

    let recipients = db.findMany(config.beneficiaryCollection, (r) =>
      r.userId === userId && !r.deleted
    );

    // For electricity, filter by meter type if specified
    if (billType === BILL_CATEGORIES.ELECTRICITY && meterType) {
      recipients = recipients.filter(r =>
        r.meterType === meterType || !r.meterType
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      recipients = recipients.filter(r =>
        r.customerId.toLowerCase().includes(searchLower) ||
        (r.customerName && r.customerName.toLowerCase().includes(searchLower))
      );
    }

    recipients.sort((a, b) => new Date(b.lastUsed || b.createdAt) - new Date(a.lastUsed || a.createdAt));

    return recipients.map(r => {
      const beneficiary = {
        id: r.id,
        customerId: r.customerId,
        customerName: r.customerName,
        provider: r.provider,
        lastUsed: r.lastUsed
      };

      // Add electricity-specific fields
      if (billType === BILL_CATEGORIES.ELECTRICITY) {
        beneficiary.meterType = r.meterType;
        beneficiary.serviceAddress = r.serviceAddress;
      }

      // Add TV-specific fields (decoder number display)
      if (billType === BILL_CATEGORIES.TV) {
        beneficiary.decoderNumber = r.customerId;
        beneficiary.displayLabel = r.customerName || r.customerId;
        beneficiary.displaySubLabel = `Decoder Number: ${r.customerId}`;
      }

      return beneficiary;
    });
  }

  /**
   * Add beneficiary
   */
  static addBeneficiary(billType, userId, customerId, customerName, provider, additionalData = {}) {
    const config = this.getConfig(billType);

    // Check if already exists
    const existing = db.findOne(config.beneficiaryCollection, (r) =>
      r.userId === userId && r.customerId === customerId && r.provider.code === provider.code && !r.deleted
    );

    if (existing) {
      const updates = { updatedAt: new Date() };
      if (customerName && customerName !== existing.customerName) {
        updates.customerName = customerName;
      }
      // Update electricity-specific fields
      if (billType === BILL_CATEGORIES.ELECTRICITY) {
        if (additionalData.meterType) updates.meterType = additionalData.meterType;
        if (additionalData.serviceAddress) updates.serviceAddress = additionalData.serviceAddress;
      }
      if (Object.keys(updates).length > 1) {
        return db.update(config.beneficiaryCollection, existing.id, updates);
      }
      return existing;
    }

    const beneficiaryId = uuidv4();
    const beneficiary = {
      id: beneficiaryId,
      userId,
      customerId,
      customerName,
      provider: {
        id: provider.id,
        code: provider.code,
        name: provider.name,
        logo: provider.logo
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add electricity-specific fields
    if (billType === BILL_CATEGORIES.ELECTRICITY) {
      beneficiary.meterType = additionalData.meterType || 'prepaid';
      beneficiary.serviceAddress = additionalData.serviceAddress || '';
    }

    db.create(config.beneficiaryCollection, beneficiaryId, beneficiary);
    return beneficiary;
  }

  /**
   * Update beneficiary last used
   */
  static updateBeneficiaryLastUsed(billType, userId, customerId, providerCode) {
    const config = this.getConfig(billType);
    const beneficiary = db.findOne(config.beneficiaryCollection, (b) =>
      b.userId === userId && b.customerId === customerId && b.provider.code === providerCode && !b.deleted
    );
    if (beneficiary) {
      db.update(config.beneficiaryCollection, beneficiary.id, { lastUsed: new Date() });
    }
  }

  // ==========================================
  // Purchase Methods
  // ==========================================

  /**
   * Initiate bill payment (returns preview)
   */
  static async initiatePurchase(billType, userId, data) {
    const config = this.getConfig(billType);
    const { customerId, providerCode, amount, packageCode, meterType } = data;

    // Get provider
    const provider = this.getProvider(billType, providerCode);

    // Determine amount (from package or input)
    let finalAmount = amount;
    let selectedPackage = null;

    if (config.hasPackages && packageCode) {
      const packages = this.getPackages(billType, providerCode);
      selectedPackage = packages.find(p => p.code === packageCode);
      if (!selectedPackage) {
        throw new ValidationError('Invalid package');
      }
      finalAmount = selectedPackage.amount;
    }

    // Validate amount
    if (finalAmount) {
      const amountValidation = this.validateAmount(billType, finalAmount);
      if (!amountValidation.valid) {
        throw new ValidationError(amountValidation.error);
      }
    }

    // Validate customer
    const validation = await this.validateCustomer(billType, providerCode, customerId, { meterType });
    if (!validation.valid) {
      throw new ValidationError(validation.error || 'Customer validation failed');
    }

    // Calculate cashback and commission breakdown
    // External provider will be determined at purchase time, use 'baxi' as default for preview
    const commissionBreakdown = this.calculateCashback(finalAmount, billType, providerCode, 'baxi');
    const cashbackAvailable = this.isCashbackAvailable(billType, providerCode, 'baxi');

    // Check if biometric is required
    const requiresBiometric = this.requiresBiometric(finalAmount);

    // Mock wallet balance
    // TODO: Replace with actual wallet balance when Wallet module is built
    const mockWalletBalance = 1000000;

    // Create preview token
    const previewToken = uuidv4();
    const preview = {
      token: previewToken,
      userId,
      billType,
      customerId,
      customerName: validation.customerName,
      customerDetails: validation.customerDetails,
      provider: {
        id: provider.id,
        code: provider.code,
        name: provider.name,
        shortName: provider.shortName || provider.name,
        logo: provider.logo
      },
      package: selectedPackage,
      meterType: meterType || null,
      amount: finalAmount,
      // Store full commission breakdown for transaction recording
      commissionBreakdown,
      cashback: commissionBreakdown.userCashbackAmount,
      cashbackAvailable,
      totalDebit: finalAmount,
      walletBalance: mockWalletBalance,
      requiresBiometric,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    };

    // Add electricity-specific preview data
    if (billType === BILL_CATEGORIES.ELECTRICITY) {
      const breakdown = this.calculateElectricityBreakdown(finalAmount, providerCode);
      preview.electricityDetails = {
        meterNumber: customerId,
        meterType: meterType || 'prepaid',
        meterCategory: validation.meterDetails?.meterCategory || 'MD',
        tariffClass: validation.meterDetails?.tariffClass || 'A-Non MD',
        serviceAddress: validation.meterDetails?.serviceAddress || '',
        minPurchase: validation.meterDetails?.minPurchase || 1000,
        outstandingDebt: validation.meterDetails?.outstandingDebt || 0,
        ...breakdown
      };
    }

    db.create(config.previewCollection, previewToken, preview);

    // Build response
    const response = {
      previewToken,
      billType,
      customerId: preview.customerId,
      customerName: preview.customerName,
      provider: preview.provider,
      package: preview.package,
      amount: preview.amount,
      cashback: preview.cashback,
      cashbackAvailable: preview.cashbackAvailable,
      cashbackRate: preview.commissionBreakdown.userCashbackRate,
      totalDebit: preview.totalDebit,
      walletBalance: mockWalletBalance,
      requiresBiometric,
      biometricMessage: requiresBiometric
        ? 'This transaction requires both PIN and biometric verification'
        : null
    };

    // Add electricity-specific fields to response
    if (billType === BILL_CATEGORIES.ELECTRICITY) {
      response.meterType = preview.electricityDetails.meterType;
      response.meterCategory = preview.electricityDetails.meterCategory;
      response.serviceAddress = preview.electricityDetails.serviceAddress;
      response.minPurchase = preview.electricityDetails.minPurchase;
      response.unitsPurchased = preview.electricityDetails.unitsPurchased;
      response.tariffRate = preview.electricityDetails.tariffRate;
      response.vatAmount = preview.electricityDetails.vatAmount;
      response.costOfUnits = preview.electricityDetails.costOfUnits;
      response.outstandingDebt = preview.electricityDetails.outstandingDebt;
    }

    return response;
  }

  /**
   * Confirm and execute purchase
   */
  static async purchase(billType, userId, previewToken, transactionPin, biometricToken = null) {
    const config = this.getConfig(billType);

    // Get preview
    const preview = db.findById(config.previewCollection, previewToken);
    if (!preview) {
      throw new ValidationError('Transaction session expired. Please start again.');
    }

    if (preview.userId !== userId) {
      throw new ValidationError('Invalid transaction session');
    }

    if (new Date() > new Date(preview.expiresAt)) {
      db.delete(config.previewCollection, previewToken);
      throw new ValidationError('Transaction session expired. Please start again.');
    }

    // Verify transaction PIN
    await AccountService.verifyTransactionPin(userId, transactionPin);

    // For high-value transactions, verify biometric
    if (preview.requiresBiometric) {
      if (!biometricToken) {
        throw new ValidationError('Biometric verification required for transactions above ₦500,000');
      }
      await this.verifyBiometricToken(userId, biometricToken);
    }

    // Delete preview
    db.delete(config.previewCollection, previewToken);

    // Create transaction record
    const transactionId = uuidv4();
    const reference = generateReference(config.referencePrefix);

    const transaction = {
      id: transactionId,
      reference,
      userId,
      type: billType,
      customerId: preview.customerId,
      customerName: preview.customerName,
      provider: preview.provider,
      package: preview.package,
      meterType: preview.meterType,
      amount: preview.amount,
      // Commission breakdown from preview
      commissionBreakdown: preview.commissionBreakdown || null,
      cashback: preview.cashback,
      cashbackAvailable: preview.cashbackAvailable,
      // Company profit fields
      providerCommissionAmount: preview.commissionBreakdown?.providerCommissionAmount || 0,
      companyProfitAmount: preview.commissionBreakdown?.companyProfitAmount || 0,
      status: TRANSACTION_STATUS.PROCESSING,
      providerReference: null,
      providerResponse: null,
      providerUsed: null,
      externalProvider: null, // Will be set after provider call
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add electricity-specific fields
    if (billType === BILL_CATEGORIES.ELECTRICITY && preview.electricityDetails) {
      transaction.electricityDetails = {
        meterNumber: preview.electricityDetails.meterNumber,
        meterType: preview.electricityDetails.meterType,
        meterCategory: preview.electricityDetails.meterCategory,
        tariffClass: preview.electricityDetails.tariffClass,
        serviceAddress: preview.electricityDetails.serviceAddress,
        tariffRate: preview.electricityDetails.tariffRate,
        unitsPurchased: preview.electricityDetails.unitsPurchased,
        costOfUnits: preview.electricityDetails.costOfUnits,
        vatAmount: preview.electricityDetails.vatAmount,
        vatRate: preview.electricityDetails.vatRate,
        outstandingDebt: preview.electricityDetails.outstandingDebt
      };
    }

    db.create(config.collection, transactionId, transaction);

    // Call external provider
    const providerResult = await ProviderService.executeWithFailover(
      billType,
      config.purchaseOperation,
      {
        reference,
        customerId: preview.customerId,
        customerName: preview.customerName,
        provider: preview.provider.code,
        amount: preview.amount,
        package: preview.package?.code,
        meterType: preview.meterType
      }
    );

    // Prepare update data
    const updateData = {
      status: providerResult.success ? TRANSACTION_STATUS.COMPLETED : TRANSACTION_STATUS.FAILED,
      providerReference: providerResult.data?.providerReference || null,
      providerResponse: providerResult,
      providerUsed: providerResult.provider?.name || null,
      completedAt: providerResult.success ? new Date() : null,
      failedAt: providerResult.success ? null : new Date(),
      failureReason: providerResult.success ? null : (providerResult.error || 'Provider error'),
      updatedAt: new Date()
    };

    // Handle electricity token for prepaid meters
    if (billType === BILL_CATEGORIES.ELECTRICITY && providerResult.success) {
      // Token comes from provider for prepaid, or generate mock for testing
      const token = providerResult.data?.token ||
        (preview.meterType === 'prepaid' ? this.generateMockElectricityToken() : null);
      updateData.token = token;

      // Update electricity details with any additional provider data
      if (transaction.electricityDetails) {
        updateData.electricityDetails = {
          ...transaction.electricityDetails,
          token: token,
          unitsPurchased: providerResult.data?.units || transaction.electricityDetails.unitsPurchased
        };
      }
    } else {
      updateData.token = providerResult.data?.token || null;
    }

    // Update transaction with external provider used
    const externalProviderUsed = providerResult.provider?.id || 'baxi';
    updateData.externalProvider = externalProviderUsed;

    // Recalculate commission with actual external provider used (rates may differ)
    if (providerResult.success && preview.commissionBreakdown) {
      const actualCommission = CommissionService.calculateCashback(
        preview.amount,
        billType,
        preview.provider.code,
        externalProviderUsed
      );
      updateData.commissionBreakdown = actualCommission;
      updateData.cashback = actualCommission.userCashbackAmount;
      updateData.providerCommissionAmount = actualCommission.providerCommissionAmount;
      updateData.companyProfitAmount = actualCommission.companyProfitAmount;
    }

    const finalTransaction = db.update(config.collection, transactionId, updateData);

    // Update beneficiary last used and record commission for reporting
    if (providerResult.success) {
      this.updateBeneficiaryLastUsed(billType, userId, preview.customerId, preview.provider.code);

      // Record commission for financial reporting
      CommissionService.recordTransactionCommission({
        transactionId: finalTransaction.id,
        transactionReference: finalTransaction.reference,
        userId,
        productType: billType,
        providerCode: preview.provider.code,
        externalProvider: externalProviderUsed,
        amount: preview.amount
      });
    }

    // Generate success message
    let successMessage;
    switch (billType) {
      case BILL_CATEGORIES.BETTING:
        successMessage = `₦${preview.amount.toLocaleString()} has been successfully added to your ${preview.provider.name} Wallet`;
        break;
      case BILL_CATEGORIES.ELECTRICITY:
        if (preview.meterType === 'prepaid') {
          successMessage = `Electricity token generated for meter ${preview.customerId}`;
        } else {
          successMessage = `Bill payment for ${preview.provider.name} recharge for Meter Number ${preview.customerId}`;
        }
        break;
      case BILL_CATEGORIES.TV:
        const packageName = preview.package?.name || 'Subscription';
        const validity = preview.package?.validity || '1 Month';
        successMessage = `${packageName} (${validity}) subscription successfully renewed`;
        break;
      default:
        successMessage = `Payment successful for ${preview.customerId}`;
    }

    // Build transaction response
    const transactionResponse = {
      id: finalTransaction.id,
      reference: finalTransaction.reference,
      customerId: finalTransaction.customerId,
      customerName: finalTransaction.customerName,
      provider: finalTransaction.provider,
      package: finalTransaction.package,
      amount: finalTransaction.amount,
      cashback: finalTransaction.cashback,
      status: finalTransaction.status,
      token: finalTransaction.token,
      providerUsed: finalTransaction.providerUsed,
      createdAt: finalTransaction.createdAt
    };

    // Add electricity-specific fields to response
    if (billType === BILL_CATEGORIES.ELECTRICITY && finalTransaction.electricityDetails) {
      transactionResponse.meterType = finalTransaction.electricityDetails.meterType;
      transactionResponse.meterCategory = finalTransaction.electricityDetails.meterCategory;
      transactionResponse.serviceAddress = finalTransaction.electricityDetails.serviceAddress;
      transactionResponse.tariffClass = finalTransaction.electricityDetails.tariffClass;
      transactionResponse.tariffRate = finalTransaction.electricityDetails.tariffRate;
      transactionResponse.unitsPurchased = finalTransaction.electricityDetails.unitsPurchased;
      transactionResponse.costOfUnits = finalTransaction.electricityDetails.costOfUnits;
      transactionResponse.vatAmount = finalTransaction.electricityDetails.vatAmount;
      transactionResponse.vatRate = finalTransaction.electricityDetails.vatRate;
      transactionResponse.outstandingDebt = finalTransaction.electricityDetails.outstandingDebt;
    }

    return {
      success: providerResult.success,
      transaction: transactionResponse,
      message: providerResult.success
        ? successMessage
        : providerResult.error || 'Payment failed. Please try again.'
    };
  }

  /**
   * Verify biometric token
   */
  static async verifyBiometricToken(userId, biometricToken) {
    const tokenData = db.findById('biometricTokens', biometricToken);

    if (!tokenData || tokenData.userId !== userId) {
      throw new ValidationError('Invalid biometric verification');
    }

    if (new Date() > new Date(tokenData.expiresAt)) {
      db.delete('biometricTokens', biometricToken);
      throw new ValidationError('Biometric verification expired. Please verify again.');
    }

    db.delete('biometricTokens', biometricToken);
    return true;
  }

  // ==========================================
  // History Methods
  // ==========================================

  /**
   * Get recent transactions
   */
  static getRecentTransactions(billType, userId, limit = 5) {
    const config = this.getConfig(billType);
    const transactions = db.findMany(config.collection, (t) => t.userId === userId);

    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return transactions.slice(0, limit).map(t => ({
      id: t.id,
      customerId: t.customerId,
      customerName: t.customerName,
      provider: t.provider,
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt
    }));
  }

  /**
   * Get transaction history
   */
  static getTransactionHistory(billType, userId, options = {}) {
    const config = this.getConfig(billType);
    const { providerCode, status, search, startDate, endDate, limit = 50, offset = 0 } = options;

    let transactions = db.findMany(config.collection, (t) => t.userId === userId);

    if (providerCode) {
      transactions = transactions.filter(t =>
        t.provider.code.toLowerCase() === providerCode.toLowerCase()
      );
    }

    if (status) {
      transactions = transactions.filter(t => t.status === status);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      transactions = transactions.filter(t =>
        t.customerId.toLowerCase().includes(searchLower) ||
        t.reference.toLowerCase().includes(searchLower) ||
        t.provider.name.toLowerCase().includes(searchLower) ||
        (t.customerName && t.customerName.toLowerCase().includes(searchLower))
      );
    }

    if (startDate) {
      transactions = transactions.filter(t => new Date(t.createdAt) >= new Date(startDate));
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      transactions = transactions.filter(t => new Date(t.createdAt) <= end);
    }

    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const grouped = this.groupTransactionsByDate(transactions.slice(offset, offset + limit));

    return {
      transactions: transactions.slice(offset, offset + limit),
      grouped,
      total: transactions.length,
      hasMore: offset + limit < transactions.length
    };
  }

  /**
   * Group transactions by date
   */
  static groupTransactionsByDate(transactions) {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    transactions.forEach(t => {
      const txDate = new Date(t.createdAt);
      txDate.setHours(0, 0, 0, 0);

      let dateKey;
      if (txDate.getTime() === today.getTime()) {
        dateKey = 'Today';
      } else if (txDate.getTime() === yesterday.getTime()) {
        dateKey = 'Yesterday';
      } else {
        dateKey = txDate.toLocaleDateString('en-US', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(t);
    });

    return groups;
  }

  /**
   * Get single transaction details
   */
  static getTransactionDetails(billType, userId, transactionId) {
    const config = this.getConfig(billType);
    const transaction = db.findById(config.collection, transactionId);

    if (!transaction || transaction.userId !== userId) {
      throw new NotFoundError('Transaction not found');
    }

    const details = {
      id: transaction.id,
      reference: transaction.reference,
      type: config.name,
      billType: billType,
      customerId: transaction.customerId,
      customerName: transaction.customerName,
      provider: transaction.provider,
      package: transaction.package,
      meterType: transaction.meterType,
      amount: transaction.amount,
      cashback: transaction.cashback,
      status: transaction.status,
      token: transaction.token,
      providerReference: transaction.providerReference,
      providerUsed: transaction.providerUsed,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      failedAt: transaction.failedAt,
      failureReason: transaction.failureReason
    };

    // Add electricity-specific details
    if (billType === BILL_CATEGORIES.ELECTRICITY && transaction.electricityDetails) {
      details.electricityDetails = {
        meterNumber: transaction.electricityDetails.meterNumber,
        meterType: transaction.electricityDetails.meterType,
        meterCategory: transaction.electricityDetails.meterCategory,
        tariffClass: transaction.electricityDetails.tariffClass,
        serviceAddress: transaction.electricityDetails.serviceAddress,
        tariffRate: transaction.electricityDetails.tariffRate,
        unitsPurchased: transaction.electricityDetails.unitsPurchased,
        costOfUnits: transaction.electricityDetails.costOfUnits,
        vatAmount: transaction.electricityDetails.vatAmount,
        vatRate: transaction.electricityDetails.vatRate,
        outstandingDebt: transaction.electricityDetails.outstandingDebt,
        token: transaction.electricityDetails.token || transaction.token
      };
    }

    return details;
  }

  /**
   * Generate transaction receipt
   */
  static generateReceipt(billType, userId, transactionId) {
    const config = this.getConfig(billType);
    const transaction = this.getTransactionDetails(billType, userId, transactionId);

    // Determine status display
    let statusDisplay = transaction.status;
    let statusColor = '#000000';
    if (transaction.status === TRANSACTION_STATUS.COMPLETED) {
      statusDisplay = 'Successful';
      statusColor = '#22C55E'; // Green
    } else if (transaction.status === TRANSACTION_STATUS.PENDING || transaction.status === TRANSACTION_STATUS.PROCESSING) {
      statusDisplay = 'Pending';
      statusColor = '#F59E0B'; // Amber
    } else if (transaction.status === TRANSACTION_STATUS.FAILED) {
      statusDisplay = 'Failed';
      statusColor = '#EF4444'; // Red
    }

    // Build receipt based on bill type
    if (billType === BILL_CATEGORIES.ELECTRICITY) {
      return this.generateElectricityReceipt(transaction, statusDisplay, statusColor);
    }

    // TV-specific receipt
    if (billType === BILL_CATEGORIES.TV) {
      return this.generateTVReceipt(transaction, statusDisplay, statusColor);
    }

    // Default receipt format for other bill types
    const details = [
      { label: 'Status', value: statusDisplay, color: statusColor },
      { label: config.customerIdLabel, value: transaction.customerId },
      { label: 'Provider', value: transaction.provider.name, icon: transaction.provider.logo },
      { label: 'Amount Equivalent', value: `₦${transaction.amount.toLocaleString()}` },
      { label: 'Transaction ID', value: transaction.reference, copyable: true },
      {
        label: 'Timestamp',
        value: new Date(transaction.createdAt).toLocaleString('en-US', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      }
    ];

    // Add token for prepaid
    if (transaction.token) {
      details.splice(1, 0, { label: 'Token', value: transaction.token, copyable: true });
    }

    // Add package for TV
    if (transaction.package) {
      details.splice(2, 0, { label: 'Package', value: transaction.package.name });
    }

    return {
      receiptId: `RCP${Date.now()}`,
      amount: transaction.amount,
      formattedAmount: `₦${transaction.amount.toLocaleString()}`,
      status: statusDisplay,
      statusColor,
      details,
      generatedAt: new Date().toISOString(),
      supportEmail: 'disputes@Zenaex.com',
      branding: {
        name: 'ZENAEX',
        message: 'Any issues with this transaction? Contact us at disputes@Zenaex.com'
      }
    };
  }

  /**
   * Generate electricity-specific receipt
   * Matches the UI design with all electricity fields
   */
  static generateElectricityReceipt(transaction, statusDisplay, statusColor) {
    const elecDetails = transaction.electricityDetails || {};

    const details = [
      { label: 'Status', value: statusDisplay, color: statusColor },
      { label: 'Meter Type', value: elecDetails.meterType || transaction.meterType || 'Prepaid', capitalize: true },
      { label: 'Meter Number', value: transaction.customerId },
      { label: 'Customer Name', value: transaction.customerName || 'N/A' },
      { label: 'Provider', value: transaction.provider.name, icon: transaction.provider.logo },
      { label: 'Units Purchased', value: `${elecDetails.unitsPurchased || 0} kWh` },
      { label: 'Service Address', value: elecDetails.serviceAddress || 'N/A' },
      { label: 'Amount Equivalent', value: `₦${transaction.amount.toLocaleString()}` },
      { label: 'Transaction ID', value: transaction.reference, copyable: true },
      {
        label: 'Timestamp',
        value: new Date(transaction.createdAt).toLocaleString('en-US', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      }
    ];

    // Add token for prepaid meters (at position 1, after status)
    if (transaction.token || elecDetails.token) {
      details.splice(1, 0, {
        label: 'Token',
        value: transaction.token || elecDetails.token,
        copyable: true,
        highlight: true
      });
    }

    // Extended details for transaction detail view
    const extendedDetails = [
      { label: 'Type', value: 'Electricity' },
      { label: 'Meter Type', value: elecDetails.meterType || transaction.meterType || 'Prepaid', capitalize: true },
      { label: 'Recipient', value: transaction.provider.name },
      { label: 'Meter Number', value: transaction.customerId },
      { label: 'Customer Name', value: transaction.customerName || 'N/A' },
      { label: 'Service Address', value: elecDetails.serviceAddress || 'N/A' },
      { label: 'Tariff Class', value: elecDetails.tariffClass || 'A-Non MD' },
      { label: 'Tariff Rate', value: elecDetails.tariffRate ? `₦${elecDetails.tariffRate}/kWh` : 'N/A' },
      { label: 'Units Purchased', value: `${elecDetails.unitsPurchased || 0} kWh` },
      { label: 'VAT Amount', value: `₦${(elecDetails.vatAmount || 0).toLocaleString()}` },
      { label: 'VAT Rate', value: elecDetails.vatRate || ELECTRICITY_VAT_RATE },
      { label: 'Cost of Units', value: `₦${(elecDetails.costOfUnits || 0).toLocaleString()}` },
      { label: 'Outstanding Debt', value: `₦${(elecDetails.outstandingDebt || 0).toLocaleString()}` },
      { label: 'Transaction ID', value: transaction.reference, copyable: true }
    ];

    return {
      receiptId: `RCP${Date.now()}`,
      amount: transaction.amount,
      formattedAmount: `₦${transaction.amount.toLocaleString()}`,
      status: statusDisplay,
      statusColor,
      token: transaction.token || elecDetails.token,
      meterType: elecDetails.meterType || transaction.meterType,
      details,
      extendedDetails,
      description: `Bill payment for ${transaction.provider.name} recharge for Meter Number ${transaction.customerId}`,
      generatedAt: new Date().toISOString(),
      supportEmail: 'disputes@Zenaex.com',
      branding: {
        name: 'ZENAEX',
        message: 'Any issues with this transaction? Contact us at disputes@Zenaex.com'
      }
    };
  }

  /**
   * Generate TV-specific receipt
   * Matches the UI design for Cable TV transactions
   */
  static generateTVReceipt(transaction, statusDisplay, statusColor) {
    const details = [
      { label: 'Status', value: statusDisplay, color: statusColor },
      { label: 'Product Name', value: transaction.provider.name, icon: transaction.provider.logo },
      { label: 'Subscription Plan', value: transaction.package ? `${transaction.package.name} (${transaction.package.validity})` : 'N/A' },
      { label: 'Decoder Number', value: transaction.customerId },
      { label: 'Customer Name', value: transaction.customerName || 'N/A' },
      { label: 'Amount', value: `₦${transaction.amount.toLocaleString()}` },
      { label: 'Transaction ID', value: transaction.reference, copyable: true },
      {
        label: 'Timestamp',
        value: new Date(transaction.createdAt).toLocaleString('en-US', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      }
    ];

    // Success message based on package
    const packageName = transaction.package?.name || 'Subscription';
    const validity = transaction.package?.validity || '1 Month';
    const successDescription = `${packageName} (${validity}) subscription successfully renewed`;

    return {
      receiptId: `RCP${Date.now()}`,
      amount: transaction.amount,
      formattedAmount: `₦${transaction.amount.toLocaleString()}`,
      status: statusDisplay,
      statusColor,
      productName: transaction.provider.name,
      subscriptionPlan: transaction.package?.name,
      decoderNumber: transaction.customerId,
      customerName: transaction.customerName,
      details,
      description: successDescription,
      // Actions available after transaction
      actions: [
        { id: 'view_details', label: 'View Transaction Details', icon: 'receipt' },
        { id: 'report_issue', label: 'Report Issue', icon: 'warning' },
        { id: 'refer_earn', label: 'Refer & Earn', icon: 'gift' }
      ],
      generatedAt: new Date().toISOString(),
      supportEmail: 'disputes@Zenaex.com',
      branding: {
        name: 'ZENAEX',
        message: 'Any issues with this transaction? Contact us at disputes@Zenaex.com'
      }
    };
  }

  /**
   * Redo a previous transaction
   */
  static async redoTransaction(billType, userId, transactionId) {
    const original = this.getTransactionDetails(billType, userId, transactionId);

    return this.initiatePurchase(billType, userId, {
      customerId: original.customerId,
      providerCode: original.provider.code,
      amount: original.amount,
      packageCode: original.package?.code
    });
  }

  /**
   * Report an issue with a transaction
   */
  static reportIssue(billType, userId, transactionId, issueData) {
    const transaction = this.getTransactionDetails(billType, userId, transactionId);

    const issueId = uuidv4();
    const issue = {
      id: issueId,
      userId,
      transactionId,
      transactionReference: transaction.reference,
      transactionType: billType,
      type: issueData.type || 'general',
      description: issueData.description,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('transactionIssues', issueId, issue);

    return {
      issueId,
      message: 'Issue reported successfully. Our support team will review and get back to you.',
      ticketNumber: `TKT${Date.now().toString(36).toUpperCase()}`
    };
  }
}

module.exports = GenericBillsService;
