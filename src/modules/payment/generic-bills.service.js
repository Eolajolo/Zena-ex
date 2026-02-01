const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { NotFoundError, ValidationError } = require('../../shared/middleware');
const { TRANSACTION_STATUS, BILL_CATEGORIES } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');
const AccountService = require('../account/account.service');
const ProviderService = require('./provider.service');

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

// Cashback rate (2%)
const CASHBACK_RATE = 0.02;

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
    customerIdPlaceholder: 'Enter Meter Number',
    requiresValidation: true,
    validationOperation: 'verify_meter',
    purchaseOperation: 'purchase_electricity',
    amountLimits: { min: 1000, max: 500000 },
    hasMeterTypes: true,
    meterTypes: ['prepaid', 'postpaid'],
    providers: {
      IKEDC: {
        id: 'ikedc',
        code: 'IKEDC',
        name: 'Ikeja Electric',
        logo: 'ikedc.png',
        serviceId: 'ikeja-electric'
      },
      EKEDC: {
        id: 'ekedc',
        code: 'EKEDC',
        name: 'Eko Electric',
        logo: 'ekedc.png',
        serviceId: 'eko-electric'
      },
      AEDC: {
        id: 'aedc',
        code: 'AEDC',
        name: 'Abuja Electric',
        logo: 'aedc.png',
        serviceId: 'abuja-electric'
      },
      PHED: {
        id: 'phed',
        code: 'PHED',
        name: 'Port Harcourt Electric',
        logo: 'phed.png',
        serviceId: 'portharcourt-electric'
      },
      KEDCO: {
        id: 'kedco',
        code: 'KEDCO',
        name: 'Kano Electric',
        logo: 'kedco.png',
        serviceId: 'kano-electric'
      },
      IBEDC: {
        id: 'ibedc',
        code: 'IBEDC',
        name: 'Ibadan Electric',
        logo: 'ibedc.png',
        serviceId: 'ibadan-electric'
      },
      BEDC: {
        id: 'bedc',
        code: 'BEDC',
        name: 'Benin Electric',
        logo: 'bedc.png',
        serviceId: 'benin-electric'
      },
      EEDC: {
        id: 'eedc',
        code: 'EEDC',
        name: 'Enugu Electric',
        logo: 'eedc.png',
        serviceId: 'enugu-electric'
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
    customerIdField: 'smartcardNumber',
    customerIdLabel: 'Smartcard/IUC Number',
    customerIdPlaceholder: 'Enter Smartcard Number',
    requiresValidation: true,
    validationOperation: 'verify_smartcard',
    purchaseOperation: 'purchase_tv',
    hasPackages: true,
    providers: {
      DSTV: {
        id: 'dstv',
        code: 'DSTV',
        name: 'DStv',
        logo: 'dstv.png',
        packages: [
          { code: 'dstv_padi', name: 'DStv Padi', amount: 2500, validity: '1 Month' },
          { code: 'dstv_yanga', name: 'DStv Yanga', amount: 3500, validity: '1 Month' },
          { code: 'dstv_confam', name: 'DStv Confam', amount: 6200, validity: '1 Month' },
          { code: 'dstv_compact', name: 'DStv Compact', amount: 10500, validity: '1 Month' },
          { code: 'dstv_compact_plus', name: 'DStv Compact Plus', amount: 16600, validity: '1 Month' },
          { code: 'dstv_premium', name: 'DStv Premium', amount: 24500, validity: '1 Month' }
        ]
      },
      GOTV: {
        id: 'gotv',
        code: 'GOTV',
        name: 'GOtv',
        logo: 'gotv.png',
        packages: [
          { code: 'gotv_smallie', name: 'GOtv Smallie', amount: 1100, validity: '1 Month' },
          { code: 'gotv_jinja', name: 'GOtv Jinja', amount: 2700, validity: '1 Month' },
          { code: 'gotv_jolli', name: 'GOtv Jolli', amount: 3950, validity: '1 Month' },
          { code: 'gotv_max', name: 'GOtv Max', amount: 5700, validity: '1 Month' },
          { code: 'gotv_supa', name: 'GOtv Supa', amount: 7600, validity: '1 Month' }
        ]
      },
      STARTIMES: {
        id: 'startimes',
        code: 'STARTIMES',
        name: 'StarTimes',
        logo: 'startimes.png',
        packages: [
          { code: 'startimes_nova', name: 'StarTimes Nova', amount: 1200, validity: '1 Month' },
          { code: 'startimes_basic', name: 'StarTimes Basic', amount: 2100, validity: '1 Month' },
          { code: 'startimes_smart', name: 'StarTimes Smart', amount: 2800, validity: '1 Month' },
          { code: 'startimes_classic', name: 'StarTimes Classic', amount: 3000, validity: '1 Month' },
          { code: 'startimes_super', name: 'StarTimes Super', amount: 5500, validity: '1 Month' }
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
    return Object.values(config.providers).map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      logo: p.logo,
      color: p.color
    }));
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
  static getPackages(billType, providerCode) {
    const config = this.getConfig(billType);
    if (!config.hasPackages) {
      return null;
    }
    const provider = this.getProvider(billType, providerCode);
    return provider.packages || [];
  }

  /**
   * Get bill type info (for UI)
   */
  static getBillTypeInfo(billType) {
    const config = this.getConfig(billType);
    return {
      name: config.name,
      description: config.description,
      icon: config.icon,
      customerIdLabel: config.customerIdLabel,
      customerIdPlaceholder: config.customerIdPlaceholder,
      requiresValidation: config.requiresValidation,
      amountLimits: config.amountLimits,
      hasMeterTypes: config.hasMeterTypes || false,
      meterTypes: config.meterTypes || null,
      hasPackages: config.hasPackages || false,
      providers: this.getProviders(billType)
    };
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

    return {
      valid: true,
      customerId,
      customerName: result.data.customerName,
      customerDetails: result.data,
      provider
    };
  }

  /**
   * Check if transaction requires biometric
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

  // ==========================================
  // Beneficiary Methods
  // ==========================================

  /**
   * Get beneficiaries for a bill type
   */
  static getBeneficiaries(billType, userId, search = '') {
    const config = this.getConfig(billType);
    const recipients = db.findMany(config.beneficiaryCollection, (r) =>
      r.userId === userId && !r.deleted
    );

    let filtered = recipients;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = recipients.filter(r =>
        r.customerId.toLowerCase().includes(searchLower) ||
        (r.customerName && r.customerName.toLowerCase().includes(searchLower))
      );
    }

    filtered.sort((a, b) => new Date(b.lastUsed || b.createdAt) - new Date(a.lastUsed || a.createdAt));

    return filtered.map(r => ({
      id: r.id,
      customerId: r.customerId,
      customerName: r.customerName,
      provider: r.provider,
      lastUsed: r.lastUsed
    }));
  }

  /**
   * Add beneficiary
   */
  static addBeneficiary(billType, userId, customerId, customerName, provider) {
    const config = this.getConfig(billType);

    // Check if already exists
    const existing = db.findOne(config.beneficiaryCollection, (r) =>
      r.userId === userId && r.customerId === customerId && r.provider.code === provider.code && !r.deleted
    );

    if (existing) {
      if (customerName && customerName !== existing.customerName) {
        return db.update(config.beneficiaryCollection, existing.id, { customerName, updatedAt: new Date() });
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

    // Calculate cashback
    const cashback = this.calculateCashback(finalAmount);

    // Check if biometric is required
    const requiresBiometric = this.requiresBiometric(finalAmount);

    // Mock wallet balance
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
        logo: provider.logo
      },
      package: selectedPackage,
      meterType: meterType || null,
      amount: finalAmount,
      cashback,
      totalDebit: finalAmount,
      walletBalance: mockWalletBalance,
      requiresBiometric,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    };

    db.create(config.previewCollection, previewToken, preview);

    return {
      previewToken,
      billType,
      customerId: preview.customerId,
      customerName: preview.customerName,
      provider: preview.provider,
      package: preview.package,
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
      cashback: preview.cashback,
      status: TRANSACTION_STATUS.PROCESSING,
      providerReference: null,
      providerResponse: null,
      providerUsed: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

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

    // Update transaction
    const finalTransaction = db.update(config.collection, transactionId, {
      status: providerResult.success ? TRANSACTION_STATUS.COMPLETED : TRANSACTION_STATUS.FAILED,
      providerReference: providerResult.data?.providerReference || null,
      providerResponse: providerResult,
      providerUsed: providerResult.provider?.name || null,
      token: providerResult.data?.token || null, // For electricity
      completedAt: providerResult.success ? new Date() : null,
      failedAt: providerResult.success ? null : new Date(),
      failureReason: providerResult.success ? null : (providerResult.error || 'Provider error'),
      updatedAt: new Date()
    });

    // Update beneficiary last used
    if (providerResult.success) {
      this.updateBeneficiaryLastUsed(billType, userId, preview.customerId, preview.provider.code);
    }

    // Generate success message
    let successMessage;
    switch (billType) {
      case BILL_CATEGORIES.BETTING:
        successMessage = `₦${preview.amount.toLocaleString()} has been successfully added to your ${preview.provider.name} Wallet`;
        break;
      case BILL_CATEGORIES.ELECTRICITY:
        successMessage = `Electricity token generated for meter ${preview.customerId}`;
        break;
      case BILL_CATEGORIES.TV:
        successMessage = `${preview.package?.name || 'Subscription'} activated for ${preview.customerId}`;
        break;
      default:
        successMessage = `Payment successful for ${preview.customerId}`;
    }

    return {
      success: providerResult.success,
      transaction: {
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
      },
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

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: config.name,
      billType: billType,
      customerId: transaction.customerId,
      customerName: transaction.customerName,
      provider: transaction.provider,
      package: transaction.package,
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
  }

  /**
   * Generate transaction receipt
   */
  static generateReceipt(billType, userId, transactionId) {
    const config = this.getConfig(billType);
    const transaction = this.getTransactionDetails(billType, userId, transactionId);

    const details = [
      { label: 'Status', value: transaction.status === TRANSACTION_STATUS.COMPLETED ? 'Successful' : transaction.status },
      { label: config.customerIdLabel, value: transaction.customerId },
      { label: 'Provider', value: transaction.provider.name, icon: transaction.provider.logo },
      { label: 'Amount Equivalent', value: `₦${transaction.amount.toLocaleString()}` },
      { label: 'Reference', value: transaction.reference },
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

    // Add token for electricity
    if (transaction.token) {
      details.splice(2, 0, { label: 'Token', value: transaction.token });
    }

    // Add package for TV
    if (transaction.package) {
      details.splice(2, 0, { label: 'Package', value: transaction.package.name });
    }

    return {
      receiptId: `RCP${Date.now()}`,
      amount: transaction.amount,
      formattedAmount: `₦${transaction.amount.toLocaleString()}`,
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
