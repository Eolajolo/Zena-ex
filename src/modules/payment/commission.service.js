const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { ValidationError, NotFoundError } = require('../../shared/middleware');
const { BILL_CATEGORIES } = require('../../shared/constants');

/**
 * Commission Service
 *
 * Manages commission and cashback rates for all bill payment products.
 *
 * Structure:
 * - Provider Commission: What Zena receives from the provider (e.g., 3.5%)
 * - User Cashback: What Zena gives to the user (e.g., 2%)
 * - Company Profit: Provider Commission - User Cashback (e.g., 1.5%)
 *
 * Rates are configurable per:
 * - Product type (airtime, data, betting, electricity, tv)
 * - Provider (MTN, Glo, IKEDC, etc.)
 * - External provider (Baxi, Ringo)
 *
 * NOTE: Rates should be stored in database for production.
 * This implementation uses in-memory storage for development.
 */

// Default commission configurations
// These can be updated via admin API or loaded from database
const DEFAULT_COMMISSION_CONFIG = {
  // Airtime Commissions
  [BILL_CATEGORIES.AIRTIME]: {
    default: {
      providerCommission: 0.035, // 3.5% from provider
      userCashback: 0.02,        // 2% to user
      // Company profit: 1.5%
    },
    providers: {
      MTN: {
        baxi: { providerCommission: 0.035, userCashback: 0.02 },
        ringo: { providerCommission: 0.035, userCashback: 0.02 }
      },
      GLO: {
        baxi: { providerCommission: 0.04, userCashback: 0.025 },
        ringo: { providerCommission: 0.038, userCashback: 0.02 }
      },
      AIRTEL: {
        baxi: { providerCommission: 0.035, userCashback: 0.02 },
        ringo: { providerCommission: 0.033, userCashback: 0.018 }
      },
      '9MOBILE': {
        baxi: { providerCommission: 0.04, userCashback: 0.025 },
        ringo: { providerCommission: 0.04, userCashback: 0.025 }
      }
    }
  },

  // Data Commissions
  [BILL_CATEGORIES.DATA]: {
    default: {
      providerCommission: 0.03,
      userCashback: 0.015,
    },
    providers: {
      MTN: {
        baxi: { providerCommission: 0.03, userCashback: 0.015 },
        ringo: { providerCommission: 0.028, userCashback: 0.015 }
      },
      GLO: {
        baxi: { providerCommission: 0.035, userCashback: 0.02 },
        ringo: { providerCommission: 0.032, userCashback: 0.018 }
      },
      AIRTEL: {
        baxi: { providerCommission: 0.03, userCashback: 0.015 },
        ringo: { providerCommission: 0.028, userCashback: 0.015 }
      },
      '9MOBILE': {
        baxi: { providerCommission: 0.035, userCashback: 0.02 },
        ringo: { providerCommission: 0.035, userCashback: 0.02 }
      }
    }
  },

  // Betting Commissions
  [BILL_CATEGORIES.BETTING]: {
    default: {
      providerCommission: 0.02,
      userCashback: 0.01,
    },
    providers: {
      SPORTYBET: { baxi: { providerCommission: 0.025, userCashback: 0.015 } },
      '1XBET': { baxi: { providerCommission: 0.02, userCashback: 0.01 } },
      BET9JA: { baxi: { providerCommission: 0.025, userCashback: 0.015 } },
      BET365: { baxi: { providerCommission: 0.02, userCashback: 0.01 } },
      '1960BET': { baxi: { providerCommission: 0.02, userCashback: 0.01 } },
      BETKING: { baxi: { providerCommission: 0.025, userCashback: 0.015 } },
      BETWAY: { baxi: { providerCommission: 0.02, userCashback: 0.01 } },
      BETANO: { baxi: { providerCommission: 0.02, userCashback: 0.01 } }
    }
  },

  // Electricity Commissions
  [BILL_CATEGORIES.ELECTRICITY]: {
    default: {
      providerCommission: 0.015,
      userCashback: 0.005,
    },
    providers: {
      IKEDC: {
        baxi: { providerCommission: 0.018, userCashback: 0.008 },
        ringo: { providerCommission: 0.015, userCashback: 0.005 }
      },
      EKEDC: {
        baxi: { providerCommission: 0.015, userCashback: 0.005 },
        ringo: { providerCommission: 0.015, userCashback: 0.005 }
      },
      AEDC: {
        baxi: { providerCommission: 0.018, userCashback: 0.008 },
        ringo: { providerCommission: 0.015, userCashback: 0.005 }
      },
      PHED: {
        baxi: { providerCommission: 0.015, userCashback: 0.005 },
        ringo: { providerCommission: 0.012, userCashback: 0.003 }
      },
      KEDCO: {
        baxi: { providerCommission: 0.015, userCashback: 0.005 },
        ringo: { providerCommission: 0.015, userCashback: 0.005 }
      },
      IBEDC: {
        baxi: { providerCommission: 0.015, userCashback: 0.005 },
        ringo: { providerCommission: 0.015, userCashback: 0.005 }
      },
      BEDC: {
        baxi: { providerCommission: 0.015, userCashback: 0.005 },
        ringo: { providerCommission: 0.015, userCashback: 0.005 }
      },
      EEDC: {
        baxi: { providerCommission: 0.015, userCashback: 0.005 },
        ringo: { providerCommission: 0.015, userCashback: 0.005 }
      }
    }
  },

  // Cable TV Commissions
  [BILL_CATEGORIES.TV]: {
    default: {
      providerCommission: 0.025,
      userCashback: 0.01,
    },
    providers: {
      DSTV: {
        baxi: { providerCommission: 0.03, userCashback: 0.015 },
        ringo: { providerCommission: 0.025, userCashback: 0.01 }
      },
      GOTV: {
        baxi: { providerCommission: 0.03, userCashback: 0.015 },
        ringo: { providerCommission: 0.025, userCashback: 0.01 }
      },
      STARTIMES: {
        baxi: { providerCommission: 0.035, userCashback: 0.02 },
        ringo: { providerCommission: 0.03, userCashback: 0.015 }
      }
    }
  }
};

// In-memory storage for commission configs (override defaults)
// In production, this would be stored in database
let commissionOverrides = {};

class CommissionService {
  /**
   * Get commission rates for a product/provider combination
   *
   * @param {string} productType - Bill category (airtime, data, betting, etc.)
   * @param {string} providerCode - Provider code (MTN, IKEDC, DSTV, etc.)
   * @param {string} externalProvider - External provider used (baxi, ringo)
   * @returns {Object} Commission rates
   */
  static getCommissionRates(productType, providerCode, externalProvider = 'baxi') {
    // Check for overrides first
    const overrideKey = `${productType}:${providerCode}:${externalProvider}`;
    if (commissionOverrides[overrideKey]) {
      return commissionOverrides[overrideKey];
    }

    // Get from default config
    const productConfig = DEFAULT_COMMISSION_CONFIG[productType];
    if (!productConfig) {
      return { providerCommission: 0, userCashback: 0 };
    }

    // Try specific provider + external provider
    const providerConfig = productConfig.providers?.[providerCode];
    if (providerConfig) {
      const externalConfig = providerConfig[externalProvider];
      if (externalConfig) {
        return externalConfig;
      }
      // Try any external provider config
      const firstExternal = Object.values(providerConfig)[0];
      if (firstExternal) {
        return firstExternal;
      }
    }

    // Fall back to default
    return productConfig.default || { providerCommission: 0, userCashback: 0 };
  }

  /**
   * Calculate cashback amount for a transaction
   *
   * @param {number} amount - Transaction amount
   * @param {string} productType - Bill category
   * @param {string} providerCode - Provider code
   * @param {string} externalProvider - External provider used
   * @returns {Object} Cashback calculation details
   */
  static calculateCashback(amount, productType, providerCode, externalProvider = 'baxi') {
    const rates = this.getCommissionRates(productType, providerCode, externalProvider);

    const providerCommissionAmount = Math.floor(amount * rates.providerCommission);
    const userCashbackAmount = Math.floor(amount * rates.userCashback);
    const companyProfitAmount = providerCommissionAmount - userCashbackAmount;

    return {
      amount,
      providerCommissionRate: rates.providerCommission,
      providerCommissionAmount,
      userCashbackRate: rates.userCashback,
      userCashbackAmount,
      companyProfitRate: rates.providerCommission - rates.userCashback,
      companyProfitAmount
    };
  }

  /**
   * Update commission rates for a specific product/provider
   * This would typically be an admin-only operation
   *
   * @param {string} productType - Bill category
   * @param {string} providerCode - Provider code
   * @param {string} externalProvider - External provider
   * @param {Object} rates - New rates { providerCommission, userCashback }
   * @param {string} adminId - ID of admin making the change
   */
  static updateCommissionRates(productType, providerCode, externalProvider, rates, adminId) {
    if (rates.providerCommission < 0 || rates.providerCommission > 1) {
      throw new ValidationError('Provider commission must be between 0 and 1');
    }
    if (rates.userCashback < 0 || rates.userCashback > 1) {
      throw new ValidationError('User cashback must be between 0 and 1');
    }
    if (rates.userCashback > rates.providerCommission) {
      throw new ValidationError('User cashback cannot exceed provider commission');
    }

    const overrideKey = `${productType}:${providerCode}:${externalProvider}`;
    const previousRates = this.getCommissionRates(productType, providerCode, externalProvider);

    commissionOverrides[overrideKey] = {
      providerCommission: rates.providerCommission,
      userCashback: rates.userCashback
    };

    // Log the change for audit
    const changeLog = {
      id: uuidv4(),
      productType,
      providerCode,
      externalProvider,
      previousRates,
      newRates: rates,
      changedBy: adminId,
      changedAt: new Date()
    };

    db.create('commissionChangeLogs', changeLog.id, changeLog);

    return {
      success: true,
      message: 'Commission rates updated',
      previousRates,
      newRates: rates
    };
  }

  /**
   * Get all commission rates for a product type
   */
  static getAllRatesForProduct(productType) {
    const productConfig = DEFAULT_COMMISSION_CONFIG[productType];
    if (!productConfig) {
      return null;
    }

    const rates = {
      default: productConfig.default,
      providers: {}
    };

    // Merge defaults with overrides
    for (const [providerCode, providerConfig] of Object.entries(productConfig.providers || {})) {
      rates.providers[providerCode] = {};
      for (const [externalProvider, config] of Object.entries(providerConfig)) {
        const overrideKey = `${productType}:${providerCode}:${externalProvider}`;
        rates.providers[providerCode][externalProvider] =
          commissionOverrides[overrideKey] || config;
      }
    }

    return rates;
  }

  /**
   * Get all commission configurations
   */
  static getAllCommissionConfigs() {
    const configs = {};
    for (const productType of Object.keys(DEFAULT_COMMISSION_CONFIG)) {
      configs[productType] = this.getAllRatesForProduct(productType);
    }
    return configs;
  }

  /**
   * Record commission/profit for a completed transaction
   * This creates a record for financial reporting
   */
  static recordTransactionCommission(transactionData) {
    const {
      transactionId,
      transactionReference,
      userId,
      productType,
      providerCode,
      externalProvider,
      amount
    } = transactionData;

    const calculation = this.calculateCashback(
      amount,
      productType,
      providerCode,
      externalProvider
    );

    const commissionRecord = {
      id: uuidv4(),
      transactionId,
      transactionReference,
      userId,
      productType,
      providerCode,
      externalProvider,
      transactionAmount: amount,
      providerCommissionRate: calculation.providerCommissionRate,
      providerCommissionAmount: calculation.providerCommissionAmount,
      userCashbackRate: calculation.userCashbackRate,
      userCashbackAmount: calculation.userCashbackAmount,
      companyProfitRate: calculation.companyProfitRate,
      companyProfitAmount: calculation.companyProfitAmount,
      status: 'recorded',
      createdAt: new Date()
    };

    db.create('transactionCommissions', commissionRecord.id, commissionRecord);

    return commissionRecord;
  }

  /**
   * Get commission summary for reporting
   */
  static getCommissionSummary(options = {}) {
    const { productType, providerCode, startDate, endDate, limit = 100, offset = 0 } = options;

    let records = db.findMany('transactionCommissions', () => true);

    if (productType) {
      records = records.filter(r => r.productType === productType);
    }

    if (providerCode) {
      records = records.filter(r => r.providerCode === providerCode);
    }

    if (startDate) {
      records = records.filter(r => new Date(r.createdAt) >= new Date(startDate));
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      records = records.filter(r => new Date(r.createdAt) <= end);
    }

    // Calculate totals
    const totals = records.reduce((acc, r) => ({
      totalTransactions: acc.totalTransactions + 1,
      totalTransactionAmount: acc.totalTransactionAmount + r.transactionAmount,
      totalProviderCommission: acc.totalProviderCommission + r.providerCommissionAmount,
      totalUserCashback: acc.totalUserCashback + r.userCashbackAmount,
      totalCompanyProfit: acc.totalCompanyProfit + r.companyProfitAmount
    }), {
      totalTransactions: 0,
      totalTransactionAmount: 0,
      totalProviderCommission: 0,
      totalUserCashback: 0,
      totalCompanyProfit: 0
    });

    // Sort by date descending
    records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      summary: totals,
      records: records.slice(offset, offset + limit),
      total: records.length,
      hasMore: offset + limit < records.length
    };
  }

  /**
   * Get change history for commission rates
   */
  static getCommissionChangeHistory(options = {}) {
    const { productType, limit = 50, offset = 0 } = options;

    let logs = db.findMany('commissionChangeLogs', () => true);

    if (productType) {
      logs = logs.filter(l => l.productType === productType);
    }

    logs.sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));

    return {
      logs: logs.slice(offset, offset + limit),
      total: logs.length,
      hasMore: offset + limit < logs.length
    };
  }

  /**
   * Disable cashback for a product/provider (set to 0)
   * Useful when commercial agreement ends or is unfavorable
   */
  static disableCashback(productType, providerCode, externalProvider, adminId) {
    const currentRates = this.getCommissionRates(productType, providerCode, externalProvider);

    return this.updateCommissionRates(
      productType,
      providerCode,
      externalProvider,
      {
        providerCommission: currentRates.providerCommission,
        userCashback: 0
      },
      adminId
    );
  }

  /**
   * Check if cashback is available for a product/provider
   */
  static isCashbackAvailable(productType, providerCode, externalProvider = 'baxi') {
    const rates = this.getCommissionRates(productType, providerCode, externalProvider);
    return rates.userCashback > 0;
  }
}

module.exports = CommissionService;
