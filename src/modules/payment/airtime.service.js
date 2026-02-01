const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { NotFoundError, ValidationError, InsufficientBalanceError } = require('../../shared/middleware');
const { TRANSACTION_STATUS, BILL_CATEGORIES } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');
const AccountService = require('../account/account.service');
const ProviderService = require('./provider.service');

/**
 * Airtime Service
 *
 * Handles airtime purchases for Nigerian network providers.
 *
 * NOTE: Wallet Integration
 * ========================
 * This service currently has placeholder wallet calls (WalletService.debit/credit).
 * When the Wallet module is built, update the following methods:
 * - initiateAirtimePurchase: Check wallet balance
 * - purchaseAirtime: Debit wallet and credit cashback
 * - purchaseAirtime (failed): Refund wallet
 *
 * TODO: Import WalletService when available:
 * const WalletService = require('../wallet/wallet.service');
 */

// Nigerian network providers with their prefixes
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

// Airtime amount limits
const AMOUNT_LIMITS = {
  min: 100,      // ₦100
  max: 500000    // ₦500,000
};

// High value transaction threshold - requires biometric + PIN
const HIGH_VALUE_THRESHOLD = 500000; // ₦500,000

// Quick amount options with bonus percentage
const QUICK_AMOUNTS = [
  { amount: 100, bonus: 2 },
  { amount: 200, bonus: 2 },
  { amount: 500, bonus: 2 },
  { amount: 1000, bonus: 2 },
  { amount: 2000, bonus: 2 },
  { amount: 5000, bonus: 2 },
  { amount: 10000, bonus: 2 },
  { amount: 15000, bonus: 2 },
  { amount: 20000, bonus: 2 },
  { amount: 30000, bonus: 2 }
];

// Cashback rate (2%)
const CASHBACK_RATE = 0.02;

class AirtimeService {
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
   * Get amount limits and quick options
   */
  static getAmountOptions() {
    return {
      limits: AMOUNT_LIMITS,
      quickAmounts: QUICK_AMOUNTS,
      cashbackRate: CASHBACK_RATE * 100, // Return as percentage
      highValueThreshold: HIGH_VALUE_THRESHOLD
    };
  }

  /**
   * Check if transaction requires biometric verification
   */
  static requiresBiometric(amount) {
    return Number(amount) >= HIGH_VALUE_THRESHOLD;
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

    // Remove all non-digits
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Handle different formats
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      cleaned = '0' + cleaned.substring(3);
    } else if (cleaned.startsWith('234') && cleaned.length === 14) {
      cleaned = cleaned.substring(3);
    } else if (cleaned.length === 10 && !cleaned.startsWith('0')) {
      cleaned = '0' + cleaned;
    }

    // Validate Nigerian number format
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
   * Validate amount
   */
  static validateAmount(amount) {
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return { valid: false, error: 'Invalid amount' };
    }

    if (numAmount < AMOUNT_LIMITS.min) {
      return { valid: false, error: `Minimum amount is ₦${AMOUNT_LIMITS.min}` };
    }

    if (numAmount > AMOUNT_LIMITS.max) {
      return { valid: false, error: `Maximum amount is ₦${AMOUNT_LIMITS.max.toLocaleString()}` };
    }

    return { valid: true, error: null };
  }

  /**
   * Calculate cashback
   */
  static calculateCashback(amount) {
    return Math.floor(amount * CASHBACK_RATE);
  }

  /**
   * Get recent airtime transactions for a user
   */
  static getRecentTransactions(userId, limit = 5) {
    const transactions = db.findMany('airtimeTransactions', (t) =>
      t.userId === userId
    );

    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return transactions.slice(0, limit).map(t => ({
      id: t.id,
      phoneNumber: t.recipientNumber,
      provider: t.provider,
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt
    }));
  }

  /**
   * Get recent phone numbers used for airtime
   */
  static getRecentPhoneNumbers(userId, limit = 5) {
    const transactions = db.findMany('airtimeTransactions', (t) =>
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
   * Initiate airtime purchase (returns preview)
   */
  static async initiateAirtimePurchase(userId, data) {
    const { phoneNumber, providerCode, amount } = data;

    // Validate phone number
    const phoneValidation = this.validatePhoneNumber(phoneNumber);
    if (!phoneValidation.valid) {
      throw new ValidationError(phoneValidation.error);
    }

    // Validate amount
    const amountValidation = this.validateAmount(amount);
    if (!amountValidation.valid) {
      throw new ValidationError(amountValidation.error);
    }

    // Get provider (use detected or provided)
    let provider;
    if (providerCode) {
      provider = PROVIDERS[providerCode.toUpperCase()];
      if (!provider) {
        throw new ValidationError('Invalid provider');
      }
    } else {
      provider = PROVIDERS[phoneValidation.provider.code];
    }

    // Calculate cashback
    const cashback = this.calculateCashback(Number(amount));

    // Check if biometric is required for high-value transactions
    const requiresBiometric = this.requiresBiometric(amount);

    /**
     * TODO: Wallet Integration
     * When Wallet module is available, uncomment this:
     *
     * const wallet = WalletService.getWallet(userId, 'NGN');
     * if (wallet.balance < Number(amount)) {
     *   throw new InsufficientBalanceError('Insufficient wallet balance');
     * }
     */

    // Mock wallet balance for now
    const mockWalletBalance = 1000000; // ₦1,000,000

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
      amount: Number(amount),
      cashback,
      totalDebit: Number(amount),
      walletBalance: mockWalletBalance,
      requiresBiometric,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };

    // Store preview
    db.create('airtimePreviews', previewToken, preview);

    return {
      previewToken,
      recipientNumber: preview.recipientNumber,
      provider: preview.provider,
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
   * Confirm and execute airtime purchase
   *
   * @param {string} userId - User ID
   * @param {string} previewToken - Preview token from initiate
   * @param {string} transactionPin - 4-digit transaction PIN
   * @param {string} biometricToken - Required for transactions >= ₦500,000
   */
  static async purchaseAirtime(userId, previewToken, transactionPin, biometricToken = null) {
    // Get preview first to check amount
    const preview = db.findById('airtimePreviews', previewToken);
    if (!preview) {
      throw new ValidationError('Transaction session expired. Please start again.');
    }

    if (preview.userId !== userId) {
      throw new ValidationError('Invalid transaction session');
    }

    if (new Date() > new Date(preview.expiresAt)) {
      db.delete('airtimePreviews', previewToken);
      throw new ValidationError('Transaction session expired. Please start again.');
    }

    // Always verify transaction PIN
    await AccountService.verifyTransactionPin(userId, transactionPin);

    // For high-value transactions, also verify biometric
    if (preview.requiresBiometric) {
      if (!biometricToken) {
        throw new ValidationError('Biometric verification required for transactions above ₦500,000');
      }
      // Verify biometric token
      await this.verifyBiometricToken(userId, biometricToken);
    }

    // Delete preview
    db.delete('airtimePreviews', previewToken);

    // Create transaction record
    const transactionId = uuidv4();
    const reference = generateReference('AIR');

    const airtimeTransaction = {
      id: transactionId,
      reference,
      userId,
      type: BILL_CATEGORIES.AIRTIME,
      recipientNumber: preview.recipientNumber,
      provider: preview.provider,
      amount: preview.amount,
      cashback: preview.cashback,
      status: TRANSACTION_STATUS.PROCESSING,
      providerReference: null,
      providerResponse: null,
      providerUsed: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('airtimeTransactions', transactionId, airtimeTransaction);

    /**
     * TODO: Wallet Integration
     * When Wallet module is available, uncomment this:
     *
     * const { transaction: walletTransaction } = await WalletService.debit(
     *   userId,
     *   preview.amount,
     *   'NGN',
     *   `Airtime - ${preview.provider.name} - ${preview.recipientNumber}`,
     *   {
     *     airtimeTransactionId: transactionId,
     *     provider: preview.provider.code,
     *     recipientNumber: preview.recipientNumber
     *   }
     * );
     *
     * db.update('airtimeTransactions', transactionId, {
     *   walletTransactionId: walletTransaction.id
     * });
     */

    // Call external provider with failover (Baxi -> Ringo)
    const providerResult = await ProviderService.executeWithFailover(
      'airtime',
      'purchase_airtime',
      {
        reference,
        phoneNumber: preview.recipientNumber,
        network: preview.provider.code,
        amount: preview.amount
      }
    );

    // Update transaction with provider response
    const finalTransaction = db.update('airtimeTransactions', transactionId, {
      status: providerResult.success ? TRANSACTION_STATUS.COMPLETED : TRANSACTION_STATUS.FAILED,
      providerReference: providerResult.data?.providerReference || null,
      providerResponse: providerResult,
      providerUsed: providerResult.provider?.name || null,
      completedAt: providerResult.success ? new Date() : null,
      failedAt: providerResult.success ? null : new Date(),
      failureReason: providerResult.success ? null : (providerResult.error || 'Provider error'),
      updatedAt: new Date()
    });

    /**
     * TODO: Wallet Integration
     * When Wallet module is available:
     *
     * If successful, credit cashback:
     * if (providerResult.success && preview.cashback > 0) {
     *   await WalletService.credit(
     *     userId,
     *     preview.cashback,
     *     'NGN',
     *     `Cashback - Airtime purchase`,
     *     { type: 'cashback', sourceTransactionId: transactionId }
     *   );
     * }
     *
     * If failed, refund wallet:
     * if (!providerResult.success) {
     *   await WalletService.credit(
     *     userId,
     *     preview.amount,
     *     'NGN',
     *     `Refund - Failed airtime purchase - ${reference}`,
     *     { airtimeTransactionId: transactionId }
     *   );
     * }
     */

    return {
      success: providerResult.success,
      transaction: {
        id: finalTransaction.id,
        reference: finalTransaction.reference,
        recipientNumber: finalTransaction.recipientNumber,
        provider: finalTransaction.provider,
        amount: finalTransaction.amount,
        cashback: finalTransaction.cashback,
        status: finalTransaction.status,
        providerUsed: finalTransaction.providerUsed,
        createdAt: finalTransaction.createdAt
      },
      message: providerResult.success
        ? `Airtime successfully purchased for ${finalTransaction.recipientNumber}`
        : providerResult.error || 'Airtime purchase failed. Please try again.'
    };
  }

  /**
   * Verify biometric token for high-value transactions
   */
  static async verifyBiometricToken(userId, biometricToken) {
    // Check if token exists and is valid
    const tokenData = db.findById('biometricTokens', biometricToken);

    if (!tokenData) {
      throw new ValidationError('Invalid biometric verification');
    }

    if (tokenData.userId !== userId) {
      throw new ValidationError('Invalid biometric verification');
    }

    if (new Date() > new Date(tokenData.expiresAt)) {
      db.delete('biometricTokens', biometricToken);
      throw new ValidationError('Biometric verification expired. Please verify again.');
    }

    // Token is valid - delete it (one-time use)
    db.delete('biometricTokens', biometricToken);

    return true;
  }

  /**
   * Get airtime transaction history
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

    let transactions = db.findMany('airtimeTransactions', (t) => t.userId === userId);

    // Apply filters
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
        t.provider.name.toLowerCase().includes(searchLower)
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

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Group by date for UI
    const grouped = this.groupTransactionsByDate(transactions.slice(offset, offset + limit));

    return {
      transactions: transactions.slice(offset, offset + limit),
      grouped,
      total: transactions.length,
      hasMore: offset + limit < transactions.length
    };
  }

  /**
   * Group transactions by date (Today, Yesterday, Date)
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
    const transaction = db.findById('airtimeTransactions', transactionId);

    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }

    if (transaction.userId !== userId) {
      throw new NotFoundError('Transaction not found');
    }

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: 'Airtime',
      recipientNumber: transaction.recipientNumber,
      provider: transaction.provider,
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

    return this.initiateAirtimePurchase(userId, {
      phoneNumber: originalTransaction.recipientNumber,
      providerCode: originalTransaction.provider.code,
      amount: originalTransaction.amount
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

module.exports = AirtimeService;
