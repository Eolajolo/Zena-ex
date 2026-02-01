const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { NotFoundError, ValidationError } = require('../../shared/middleware');
const { TRANSACTION_STATUS, BILL_CATEGORIES } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');
const AccountService = require('../account/account.service');
const ProviderService = require('./provider.service');

/**
 * Data Service
 *
 * Handles mobile data bundle purchases for Nigerian network providers.
 *
 * NOTE: Wallet Integration
 * ========================
 * This service has placeholder wallet calls. When Wallet module is built, update:
 * - initiateDataPurchase: Check wallet balance
 * - purchaseData: Debit wallet and credit cashback
 * - purchaseData (failed): Refund wallet
 *
 * TODO: Import WalletService when available:
 * const WalletService = require('../wallet/wallet.service');
 */

// Nigerian network providers
const PROVIDERS = {
  MTN: {
    id: 'mtn',
    code: 'MTN',
    name: 'MTN Nigeria',
    logo: 'mtn.png',
    prefixes: ['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906', '0913', '0916']
  },
  GLO: {
    id: 'glo',
    code: 'GLO',
    name: 'Glo',
    logo: 'glo.png',
    prefixes: ['0805', '0807', '0705', '0815', '0811', '0905', '0915']
  },
  AIRTEL: {
    id: 'airtel',
    code: 'AIRTEL',
    name: 'Airtel',
    logo: 'airtel.png',
    prefixes: ['0802', '0808', '0708', '0812', '0701', '0902', '0901', '0907', '0912']
  },
  '9MOBILE': {
    id: '9mobile',
    code: '9MOBILE',
    name: '9mobile',
    logo: '9mobile.png',
    prefixes: ['0809', '0818', '0817', '0909', '0908']
  }
};

// Bundle categories
const BUNDLE_CATEGORIES = {
  HOT: 'hot',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  TWO_MONTH: '2month'
};

// High value transaction threshold - requires biometric + PIN
const HIGH_VALUE_THRESHOLD = 500000; // ₦500,000

// Cashback rate (2%)
const CASHBACK_RATE = 0.02;

// Data bundles by provider and category
const DATA_BUNDLES = {
  MTN: {
    [BUNDLE_CATEGORIES.HOT]: [
      { code: 'mtn_500mb_hot', size: '500MB', amount: 500, validity: '1 Day', description: '500MB Daily Plan', bonus: 2 },
      { code: 'mtn_1gb_hot', size: '1GB', amount: 600, validity: '1 Day', description: '1GB Daily Plan', bonus: 2 },
      { code: 'mtn_2gb_hot', size: '2GB', amount: 800, validity: '1 Day', description: '2GB Daily Plan', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.DAILY]: [
      { code: 'mtn_50mb_daily', size: '50MB', amount: 50, validity: '1 Day', description: '50MB Daily', bonus: 2 },
      { code: 'mtn_150mb_daily', size: '150MB', amount: 100, validity: '1 Day', description: '150MB Daily', bonus: 2 },
      { code: 'mtn_500mb_daily', size: '500MB', amount: 300, validity: '1 Day', description: '500MB Daily', bonus: 2 },
      { code: 'mtn_1gb_daily', size: '1GB', amount: 500, validity: '1 Day', description: '1GB Daily', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.WEEKLY]: [
      { code: 'mtn_500mb_weekly', size: '500MB', amount: 500, validity: '7 Days', description: '500MB Weekly', bonus: 2 },
      { code: 'mtn_1gb_weekly', size: '1GB', amount: 700, validity: '7 Days', description: '1GB Weekly', bonus: 2 },
      { code: 'mtn_2gb_weekly', size: '2GB', amount: 1200, validity: '7 Days', description: '2GB Weekly', bonus: 2 },
      { code: 'mtn_6gb_weekly', size: '6GB', amount: 1500, validity: '7 Days', description: '6GB Weekly', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.MONTHLY]: [
      { code: 'mtn_1.5gb_monthly', size: '1.5GB', amount: 1000, validity: '30 Days', description: '1.5GB Monthly', bonus: 2 },
      { code: 'mtn_3gb_monthly', size: '3GB', amount: 1500, validity: '30 Days', description: '3GB Monthly', bonus: 2 },
      { code: 'mtn_5gb_monthly', size: '5GB', amount: 2000, validity: '30 Days', description: '5GB Monthly', bonus: 2 },
      { code: 'mtn_10gb_monthly', size: '10GB', amount: 3000, validity: '30 Days', description: '10GB Monthly', bonus: 2 },
      { code: 'mtn_20gb_monthly', size: '20GB', amount: 5000, validity: '30 Days', description: '20GB Monthly', bonus: 2 },
      { code: 'mtn_40gb_monthly', size: '40GB', amount: 10000, validity: '30 Days', description: '40GB Monthly', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.TWO_MONTH]: [
      { code: 'mtn_75gb_2month', size: '75GB', amount: 15000, validity: '60 Days', description: '75GB 2-Month Plan', bonus: 2 },
      { code: 'mtn_120gb_2month', size: '120GB', amount: 20000, validity: '60 Days', description: '120GB 2-Month Plan', bonus: 2 }
    ]
  },
  GLO: {
    [BUNDLE_CATEGORIES.HOT]: [
      { code: 'glo_500mb_hot', size: '500MB', amount: 500, validity: '1 Day', description: '500MB Daily Plan', bonus: 2 },
      { code: 'glo_1gb_hot', size: '1GB', amount: 600, validity: '1 Day', description: '1GB Daily Plan', bonus: 2 },
      { code: 'glo_2gb_hot', size: '2GB', amount: 800, validity: '1 Day', description: '2GB Daily Plan', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.DAILY]: [
      { code: 'glo_50mb_daily', size: '50MB', amount: 50, validity: '1 Day', description: '50MB Daily', bonus: 2 },
      { code: 'glo_150mb_daily', size: '150MB', amount: 100, validity: '1 Day', description: '150MB Daily', bonus: 2 },
      { code: 'glo_500mb_daily', size: '500MB', amount: 200, validity: '1 Day', description: '500MB Daily', bonus: 2 },
      { code: 'glo_1gb_daily', size: '1GB', amount: 300, validity: '1 Day', description: '1GB Daily', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.WEEKLY]: [
      { code: 'glo_1.6gb_weekly', size: '1.6GB', amount: 500, validity: '7 Days', description: '1.6GB Weekly', bonus: 2 },
      { code: 'glo_3.2gb_weekly', size: '3.2GB', amount: 1000, validity: '7 Days', description: '3.2GB Weekly', bonus: 2 },
      { code: 'glo_7gb_weekly', size: '7GB', amount: 1500, validity: '7 Days', description: '7GB Weekly', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.MONTHLY]: [
      { code: 'glo_2gb_monthly', size: '2GB', amount: 1000, validity: '30 Days', description: '2GB Monthly', bonus: 2 },
      { code: 'glo_4.5gb_monthly', size: '4.5GB', amount: 1500, validity: '30 Days', description: '4.5GB Monthly', bonus: 2 },
      { code: 'glo_7.5gb_monthly', size: '7.5GB', amount: 2000, validity: '30 Days', description: '7.5GB Monthly', bonus: 2 },
      { code: 'glo_10gb_monthly', size: '10GB', amount: 2500, validity: '30 Days', description: '10GB Monthly', bonus: 2 },
      { code: 'glo_18gb_monthly', size: '18GB', amount: 4000, validity: '30 Days', description: '18GB Monthly', bonus: 2 },
      { code: 'glo_29gb_monthly', size: '29GB', amount: 5000, validity: '30 Days', description: '29GB Monthly', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.TWO_MONTH]: [
      { code: 'glo_50gb_2month', size: '50GB', amount: 8000, validity: '60 Days', description: '50GB 2-Month Plan', bonus: 2 },
      { code: 'glo_93gb_2month', size: '93GB', amount: 10000, validity: '60 Days', description: '93GB 2-Month Plan', bonus: 2 }
    ]
  },
  AIRTEL: {
    [BUNDLE_CATEGORIES.HOT]: [
      { code: 'airtel_500mb_hot', size: '500MB', amount: 500, validity: '1 Day', description: '500MB Daily Plan', bonus: 2 },
      { code: 'airtel_1gb_hot', size: '1GB', amount: 600, validity: '1 Day', description: '1GB Daily Plan', bonus: 2 },
      { code: 'airtel_2gb_hot', size: '2GB', amount: 800, validity: '1 Day', description: '2GB Daily Plan', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.DAILY]: [
      { code: 'airtel_40mb_daily', size: '40MB', amount: 50, validity: '1 Day', description: '40MB Daily', bonus: 2 },
      { code: 'airtel_100mb_daily', size: '100MB', amount: 100, validity: '1 Day', description: '100MB Daily', bonus: 2 },
      { code: 'airtel_200mb_daily', size: '200MB', amount: 200, validity: '1 Day', description: '200MB Daily', bonus: 2 },
      { code: 'airtel_1gb_daily', size: '1GB', amount: 350, validity: '1 Day', description: '1GB Daily', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.WEEKLY]: [
      { code: 'airtel_750mb_weekly', size: '750MB', amount: 500, validity: '7 Days', description: '750MB Weekly', bonus: 2 },
      { code: 'airtel_1.5gb_weekly', size: '1.5GB', amount: 1000, validity: '7 Days', description: '1.5GB Weekly', bonus: 2 },
      { code: 'airtel_6gb_weekly', size: '6GB', amount: 1500, validity: '7 Days', description: '6GB Weekly', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.MONTHLY]: [
      { code: 'airtel_2gb_monthly', size: '2GB', amount: 1000, validity: '30 Days', description: '2GB Monthly', bonus: 2 },
      { code: 'airtel_3gb_monthly', size: '3GB', amount: 1500, validity: '30 Days', description: '3GB Monthly', bonus: 2 },
      { code: 'airtel_4.5gb_monthly', size: '4.5GB', amount: 2000, validity: '30 Days', description: '4.5GB Monthly', bonus: 2 },
      { code: 'airtel_10gb_monthly', size: '10GB', amount: 3000, validity: '30 Days', description: '10GB Monthly', bonus: 2 },
      { code: 'airtel_20gb_monthly', size: '20GB', amount: 5000, validity: '30 Days', description: '20GB Monthly', bonus: 2 },
      { code: 'airtel_40gb_monthly', size: '40GB', amount: 10000, validity: '30 Days', description: '40GB Monthly', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.TWO_MONTH]: [
      { code: 'airtel_75gb_2month', size: '75GB', amount: 15000, validity: '60 Days', description: '75GB 2-Month Plan', bonus: 2 },
      { code: 'airtel_110gb_2month', size: '110GB', amount: 20000, validity: '60 Days', description: '110GB 2-Month Plan', bonus: 2 }
    ]
  },
  '9MOBILE': {
    [BUNDLE_CATEGORIES.HOT]: [
      { code: '9mobile_500mb_hot', size: '500MB', amount: 500, validity: '1 Day', description: '500MB Daily Plan', bonus: 2 },
      { code: '9mobile_1gb_hot', size: '1GB', amount: 600, validity: '1 Day', description: '1GB Daily Plan', bonus: 2 },
      { code: '9mobile_2gb_hot', size: '2GB', amount: 800, validity: '1 Day', description: '2GB Daily Plan', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.DAILY]: [
      { code: '9mobile_50mb_daily', size: '50MB', amount: 50, validity: '1 Day', description: '50MB Daily', bonus: 2 },
      { code: '9mobile_150mb_daily', size: '150MB', amount: 100, validity: '1 Day', description: '150MB Daily', bonus: 2 },
      { code: '9mobile_500mb_daily', size: '500MB', amount: 200, validity: '1 Day', description: '500MB Daily', bonus: 2 },
      { code: '9mobile_1gb_daily', size: '1GB', amount: 300, validity: '1 Day', description: '1GB Daily', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.WEEKLY]: [
      { code: '9mobile_1gb_weekly', size: '1GB', amount: 500, validity: '7 Days', description: '1GB Weekly', bonus: 2 },
      { code: '9mobile_2.5gb_weekly', size: '2.5GB', amount: 1000, validity: '7 Days', description: '2.5GB Weekly', bonus: 2 },
      { code: '9mobile_7gb_weekly', size: '7GB', amount: 1500, validity: '7 Days', description: '7GB Weekly', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.MONTHLY]: [
      { code: '9mobile_1.5gb_monthly', size: '1.5GB', amount: 1000, validity: '30 Days', description: '1.5GB Monthly', bonus: 2 },
      { code: '9mobile_3gb_monthly', size: '3GB', amount: 1500, validity: '30 Days', description: '3GB Monthly', bonus: 2 },
      { code: '9mobile_4.5gb_monthly', size: '4.5GB', amount: 2000, validity: '30 Days', description: '4.5GB Monthly', bonus: 2 },
      { code: '9mobile_11gb_monthly', size: '11GB', amount: 3000, validity: '30 Days', description: '11GB Monthly', bonus: 2 },
      { code: '9mobile_15gb_monthly', size: '15GB', amount: 4000, validity: '30 Days', description: '15GB Monthly', bonus: 2 },
      { code: '9mobile_25gb_monthly', size: '25GB', amount: 5000, validity: '30 Days', description: '25GB Monthly', bonus: 2 }
    ],
    [BUNDLE_CATEGORIES.TWO_MONTH]: [
      { code: '9mobile_50gb_2month', size: '50GB', amount: 10000, validity: '60 Days', description: '50GB 2-Month Plan', bonus: 2 },
      { code: '9mobile_100gb_2month', size: '100GB', amount: 15000, validity: '60 Days', description: '100GB 2-Month Plan', bonus: 2 }
    ]
  }
};

class DataService {
  /**
   * Get all supported providers
   */
  static getProviders() {
    return Object.values(PROVIDERS).map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      logo: p.logo
    }));
  }

  /**
   * Get bundle categories
   */
  static getCategories() {
    return [
      { id: BUNDLE_CATEGORIES.HOT, name: 'Hot', description: 'Popular bundles' },
      { id: BUNDLE_CATEGORIES.DAILY, name: 'Daily', description: '1 Day validity' },
      { id: BUNDLE_CATEGORIES.WEEKLY, name: 'Weekly', description: '7 Days validity' },
      { id: BUNDLE_CATEGORIES.MONTHLY, name: 'Monthly', description: '30 Days validity' },
      { id: BUNDLE_CATEGORIES.TWO_MONTH, name: '2 Month', description: '60 Days validity' }
    ];
  }

  /**
   * Get data bundles for a provider
   */
  static getBundles(providerCode, category = null) {
    const normalizedCode = providerCode.toUpperCase();
    const providerBundles = DATA_BUNDLES[normalizedCode];

    if (!providerBundles) {
      throw new ValidationError('Invalid provider');
    }

    if (category) {
      return providerBundles[category] || [];
    }

    // Return all bundles grouped by category
    return {
      categories: this.getCategories(),
      bundles: providerBundles
    };
  }

  /**
   * Get a specific bundle by code
   */
  static getBundleByCode(providerCode, bundleCode) {
    const normalizedProvider = providerCode.toUpperCase();
    const providerBundles = DATA_BUNDLES[normalizedProvider];

    if (!providerBundles) {
      return null;
    }

    for (const category of Object.values(providerBundles)) {
      const bundle = category.find(b => b.code === bundleCode);
      if (bundle) {
        return bundle;
      }
    }

    return null;
  }

  /**
   * Detect provider from phone number
   */
  static detectProvider(phoneNumber) {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    if (!normalized) return null;

    const prefix = normalized.substring(0, 4);

    for (const [key, provider] of Object.entries(PROVIDERS)) {
      if (provider.prefixes.includes(prefix)) {
        return {
          id: provider.id,
          code: provider.code,
          name: provider.name,
          logo: provider.logo
        };
      }
    }

    return null;
  }

  /**
   * Normalize phone number to Nigerian format
   */
  static normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;

    let cleaned = phoneNumber.replace(/\D/g, '');

    if (cleaned.startsWith('234') && cleaned.length === 13) {
      cleaned = '0' + cleaned.substring(3);
    } else if (cleaned.startsWith('234') && cleaned.length === 14) {
      cleaned = cleaned.substring(3);
    } else if (cleaned.length === 10 && !cleaned.startsWith('0')) {
      cleaned = '0' + cleaned;
    }

    if (cleaned.length === 11 && cleaned.startsWith('0')) {
      return cleaned;
    }

    return null;
  }

  /**
   * Validate phone number
   */
  static validatePhoneNumber(phoneNumber) {
    const normalized = this.normalizePhoneNumber(phoneNumber);

    if (!normalized) {
      return {
        valid: false,
        error: 'Invalid phone number format',
        normalized: null,
        provider: null
      };
    }

    const provider = this.detectProvider(normalized);

    if (!provider) {
      return {
        valid: false,
        error: 'Phone number does not belong to a supported network',
        normalized,
        provider: null
      };
    }

    return {
      valid: true,
      error: null,
      normalized,
      provider
    };
  }

  /**
   * Check if transaction requires biometric verification
   */
  static requiresBiometric(amount) {
    return Number(amount) >= HIGH_VALUE_THRESHOLD;
  }

  /**
   * Calculate cashback
   */
  static calculateCashback(amount) {
    return Math.floor(amount * CASHBACK_RATE);
  }

  /**
   * Get recent data transactions for a user
   */
  static getRecentTransactions(userId, limit = 5) {
    const transactions = db.findMany('dataTransactions', (t) =>
      t.userId === userId
    );

    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return transactions.slice(0, limit).map(t => ({
      id: t.id,
      phoneNumber: t.recipientNumber,
      provider: t.provider,
      bundle: t.bundle,
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt
    }));
  }

  /**
   * Get recent phone numbers used for data purchase
   */
  static getRecentPhoneNumbers(userId, limit = 5) {
    const transactions = db.findMany('dataTransactions', (t) =>
      t.userId === userId && t.status === TRANSACTION_STATUS.COMPLETED
    );

    const phoneMap = new Map();
    transactions.forEach(t => {
      if (!phoneMap.has(t.recipientNumber) ||
          new Date(t.createdAt) > new Date(phoneMap.get(t.recipientNumber).createdAt)) {
        phoneMap.set(t.recipientNumber, t);
      }
    });

    const sorted = Array.from(phoneMap.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    return sorted.map(t => ({
      phoneNumber: t.recipientNumber,
      provider: t.provider,
      lastUsed: t.createdAt
    }));
  }

  /**
   * Get beneficiaries (saved recipients for data)
   */
  static getBeneficiaries(userId, search = '') {
    const recipients = db.findMany('dataBeneficiaries', (r) =>
      r.userId === userId && !r.deleted
    );

    let filtered = recipients;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = recipients.filter(r =>
        r.phoneNumber.includes(search) ||
        (r.name && r.name.toLowerCase().includes(searchLower))
      );
    }

    filtered.sort((a, b) => new Date(b.lastUsed || b.createdAt) - new Date(a.lastUsed || a.createdAt));

    return filtered.map(r => ({
      id: r.id,
      phoneNumber: r.phoneNumber,
      name: r.name,
      provider: r.provider,
      lastUsed: r.lastUsed
    }));
  }

  /**
   * Add beneficiary
   */
  static addBeneficiary(userId, phoneNumber, name = null) {
    const phoneValidation = this.validatePhoneNumber(phoneNumber);
    if (!phoneValidation.valid) {
      throw new ValidationError(phoneValidation.error);
    }

    // Check if already exists
    const existing = db.findOne('dataBeneficiaries', (r) =>
      r.userId === userId && r.phoneNumber === phoneValidation.normalized && !r.deleted
    );

    if (existing) {
      // Update name if provided
      if (name && name !== existing.name) {
        return db.update('dataBeneficiaries', existing.id, { name, updatedAt: new Date() });
      }
      return existing;
    }

    const beneficiaryId = uuidv4();
    const beneficiary = {
      id: beneficiaryId,
      userId,
      phoneNumber: phoneValidation.normalized,
      name,
      provider: phoneValidation.provider,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('dataBeneficiaries', beneficiaryId, beneficiary);
    return beneficiary;
  }

  /**
   * Initiate data purchase (returns preview)
   */
  static async initiateDataPurchase(userId, data) {
    const { phoneNumber, providerCode, bundleCode } = data;

    // Validate phone number
    const phoneValidation = this.validatePhoneNumber(phoneNumber);
    if (!phoneValidation.valid) {
      throw new ValidationError(phoneValidation.error);
    }

    // Get provider
    let provider;
    if (providerCode) {
      provider = PROVIDERS[providerCode.toUpperCase()];
      if (!provider) {
        throw new ValidationError('Invalid provider');
      }
    } else {
      provider = PROVIDERS[phoneValidation.provider.code];
    }

    // Get bundle
    const bundle = this.getBundleByCode(provider.code, bundleCode);
    if (!bundle) {
      throw new ValidationError('Invalid data bundle');
    }

    // Calculate cashback
    const cashback = this.calculateCashback(bundle.amount);

    // Check if biometric is required
    const requiresBiometric = this.requiresBiometric(bundle.amount);

    /**
     * TODO: Wallet Integration
     * const wallet = WalletService.getWallet(userId, 'NGN');
     * if (wallet.balance < bundle.amount) {
     *   throw new InsufficientBalanceError('Insufficient wallet balance');
     * }
     */

    // Mock wallet balance
    const mockWalletBalance = 1000000;

    // Create preview token
    const previewToken = uuidv4();
    const preview = {
      token: previewToken,
      userId,
      recipientNumber: phoneValidation.normalized,
      provider: {
        id: provider.id,
        code: provider.code,
        name: provider.name,
        logo: provider.logo
      },
      bundle: {
        code: bundle.code,
        size: bundle.size,
        amount: bundle.amount,
        validity: bundle.validity,
        description: bundle.description
      },
      amount: bundle.amount,
      cashback,
      totalDebit: bundle.amount,
      walletBalance: mockWalletBalance,
      requiresBiometric,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    };

    db.create('dataPreviews', previewToken, preview);

    return {
      previewToken,
      recipientNumber: preview.recipientNumber,
      provider: preview.provider,
      bundle: preview.bundle,
      amount: preview.amount,
      cashback: preview.cashback,
      totalDebit: preview.totalDebit,
      walletBalance: mockWalletBalance,
      requiresBiometric,
      biometricMessage: requiresBiometric
        ? 'This transaction requires both PIN and biometric verification'
        : null
    };
  }

  /**
   * Confirm and execute data purchase
   */
  static async purchaseData(userId, previewToken, transactionPin, biometricToken = null) {
    // Get preview
    const preview = db.findById('dataPreviews', previewToken);
    if (!preview) {
      throw new ValidationError('Transaction session expired. Please start again.');
    }

    if (preview.userId !== userId) {
      throw new ValidationError('Invalid transaction session');
    }

    if (new Date() > new Date(preview.expiresAt)) {
      db.delete('dataPreviews', previewToken);
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
    db.delete('dataPreviews', previewToken);

    // Create transaction record
    const transactionId = uuidv4();
    const reference = generateReference('DAT');

    const dataTransaction = {
      id: transactionId,
      reference,
      userId,
      type: BILL_CATEGORIES.DATA,
      recipientNumber: preview.recipientNumber,
      provider: preview.provider,
      bundle: preview.bundle,
      amount: preview.amount,
      cashback: preview.cashback,
      status: TRANSACTION_STATUS.PROCESSING,
      providerReference: null,
      providerResponse: null,
      providerUsed: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('dataTransactions', transactionId, dataTransaction);

    /**
     * TODO: Wallet Integration - Debit wallet
     */

    // Call external provider with failover
    const providerResult = await ProviderService.executeWithFailover(
      'data',
      'purchase_data',
      {
        reference,
        phoneNumber: preview.recipientNumber,
        network: preview.provider.code,
        amount: preview.amount,
        bundleCode: preview.bundle.code,
        bundleName: preview.bundle.description
      }
    );

    // Update transaction
    const finalTransaction = db.update('dataTransactions', transactionId, {
      status: providerResult.success ? TRANSACTION_STATUS.COMPLETED : TRANSACTION_STATUS.FAILED,
      providerReference: providerResult.data?.providerReference || null,
      providerResponse: providerResult,
      providerUsed: providerResult.provider?.name || null,
      completedAt: providerResult.success ? new Date() : null,
      failedAt: providerResult.success ? null : new Date(),
      failureReason: providerResult.success ? null : (providerResult.error || 'Provider error'),
      updatedAt: new Date()
    });

    // Update beneficiary last used
    if (providerResult.success) {
      const beneficiary = db.findOne('dataBeneficiaries', (b) =>
        b.userId === userId && b.phoneNumber === preview.recipientNumber && !b.deleted
      );
      if (beneficiary) {
        db.update('dataBeneficiaries', beneficiary.id, { lastUsed: new Date() });
      }
    }

    /**
     * TODO: Wallet Integration - Credit cashback or refund
     */

    return {
      success: providerResult.success,
      transaction: {
        id: finalTransaction.id,
        reference: finalTransaction.reference,
        recipientNumber: finalTransaction.recipientNumber,
        provider: finalTransaction.provider,
        bundle: finalTransaction.bundle,
        amount: finalTransaction.amount,
        cashback: finalTransaction.cashback,
        status: finalTransaction.status,
        providerUsed: finalTransaction.providerUsed,
        createdAt: finalTransaction.createdAt
      },
      message: providerResult.success
        ? `Data bundle of ${finalTransaction.bundle.size} (${finalTransaction.bundle.validity} plan) successfully purchased for ${finalTransaction.recipientNumber}`
        : providerResult.error || 'Data purchase failed. Please try again.'
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

  /**
   * Get data transaction history
   */
  static getTransactionHistory(userId, options = {}) {
    const {
      providerCode,
      status,
      search,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = options;

    let transactions = db.findMany('dataTransactions', (t) => t.userId === userId);

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
        t.recipientNumber.includes(search) ||
        t.reference.toLowerCase().includes(searchLower) ||
        t.provider.name.toLowerCase().includes(searchLower) ||
        t.bundle.size.toLowerCase().includes(searchLower)
      );
    }

    if (startDate) {
      const start = new Date(startDate);
      transactions = transactions.filter(t => new Date(t.createdAt) >= start);
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
  static getTransactionDetails(userId, transactionId) {
    const transaction = db.findById('dataTransactions', transactionId);

    if (!transaction || transaction.userId !== userId) {
      throw new NotFoundError('Transaction not found');
    }

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: 'Mobile Data',
      recipientNumber: transaction.recipientNumber,
      provider: transaction.provider,
      bundle: transaction.bundle,
      amount: transaction.amount,
      cashback: transaction.cashback,
      status: transaction.status,
      providerReference: transaction.providerReference,
      providerUsed: transaction.providerUsed,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      failedAt: transaction.failedAt,
      failureReason: transaction.failureReason
    };
  }

  /**
   * Generate transaction receipt
   */
  static generateReceipt(userId, transactionId) {
    const transaction = this.getTransactionDetails(userId, transactionId);

    return {
      receiptId: `RCP${Date.now()}`,
      amount: transaction.amount,
      amountEquivalent: `₦${transaction.amount.toLocaleString()}`,
      status: transaction.status,
      phoneNumber: transaction.recipientNumber,
      provider: transaction.provider,
      dataBundle: `${transaction.bundle.size} ${transaction.bundle.validity} Plan`,
      reference: transaction.reference,
      timestamp: new Date(transaction.createdAt).toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
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
  static async redoTransaction(userId, transactionId) {
    const originalTransaction = this.getTransactionDetails(userId, transactionId);

    return this.initiateDataPurchase(userId, {
      phoneNumber: originalTransaction.recipientNumber,
      providerCode: originalTransaction.provider.code,
      bundleCode: originalTransaction.bundle.code
    });
  }

  /**
   * Report an issue with a transaction
   */
  static reportIssue(userId, transactionId, issueData) {
    const transaction = this.getTransactionDetails(userId, transactionId);

    const issueId = uuidv4();
    const issue = {
      id: issueId,
      userId,
      transactionId,
      transactionReference: transaction.reference,
      transactionType: 'data',
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

module.exports = DataService;
