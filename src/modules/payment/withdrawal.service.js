const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../../shared/database');
const { NotFoundError, ValidationError } = require('../../shared/middleware');
const { TRANSACTION_STATUS } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');
const AccountService = require('../account/account.service');
const PayoutProviderService = require('./payout-provider.service');

/**
 * Withdrawal Service
 *
 * Handles withdrawal/payout of funds from user wallet to bank accounts or mobile money.
 *
 * Features:
 * - Multi-country/currency support
 * - Bank and Mobile Money payouts
 * - Account validation with providers
 * - Exchange rate conversion
 * - Fee calculation
 * - Idempotency (prevents duplicate withdrawals)
 * - Fraud prevention (velocity limits, risk scoring, cooling periods)
 * - PIN + biometric verification for high-value transactions
 *
 * NOTE: Wallet Integration
 * ========================
 * This service has placeholder wallet calls. When Wallet module is built, update:
 * - initiateWithdrawal: Check wallet balance
 * - confirmWithdrawal: Debit wallet
 * - handleWithdrawalFailure: Refund wallet
 */

// Transaction thresholds
const HIGH_VALUE_THRESHOLD = 500000; // ₦500,000 - requires biometric
const SUSPICIOUS_AMOUNT_THRESHOLD = 1000000; // ₦1,000,000 - triggers review

// Withdrawal limits (in base currency NGN equivalent)
const WITHDRAWAL_LIMITS = {
  perTransaction: { min: 100, max: 10000000 }, // ₦100 - ₦10M
  daily: 20000000,     // ₦20M per day
  weekly: 50000000,    // ₦50M per week
  monthly: 100000000   // ₦100M per month
};

// Idempotency key expiry (24 hours)
const IDEMPOTENCY_KEY_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Preview expiry (10 minutes)
const PREVIEW_EXPIRY_MS = 10 * 60 * 1000;

// New account cooling period (24 hours - first withdrawal delayed)
const NEW_ACCOUNT_COOLING_HOURS = 24;

// Risk score thresholds
const RISK_SCORE_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 60,
  HIGH: 80
};

class WithdrawalService {
  // ==========================================
  // Country & Bank Methods
  // ==========================================

  /**
   * Get supported countries for withdrawal
   */
  static getSupportedCountries() {
    return PayoutProviderService.getSupportedCountries();
  }

  /**
   * Get banks for a country
   */
  static getBanks(countryCode, search = '') {
    return PayoutProviderService.getBanks(countryCode, search);
  }

  /**
   * Get mobile money providers for a country
   */
  static getMobileMoneyProviders(countryCode) {
    return PayoutProviderService.getMobileMoneyProviders(countryCode);
  }

  /**
   * Get payout options for a country
   */
  static getPayoutOptions(countryCode) {
    return PayoutProviderService.getPayoutOptions(countryCode);
  }

  // ==========================================
  // Idempotency Methods
  // ==========================================

  /**
   * Generate idempotency key for a withdrawal request
   * Key is based on: userId + amount + destinationAccount + timestamp (rounded to 5 min)
   */
  static generateIdempotencyKey(userId, amount, accountNumber, currency) {
    const timeWindow = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute window
    const data = `${userId}:${amount}:${accountNumber}:${currency}:${timeWindow}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Check if idempotency key exists (duplicate request)
   */
  static checkIdempotencyKey(idempotencyKey) {
    const existing = db.findById('idempotencyKeys', idempotencyKey);

    if (existing) {
      // Check if expired
      if (new Date() > new Date(existing.expiresAt)) {
        db.delete('idempotencyKeys', idempotencyKey);
        return null;
      }
      return existing;
    }

    return null;
  }

  /**
   * Store idempotency key with transaction reference
   */
  static storeIdempotencyKey(idempotencyKey, transactionId, status) {
    const record = {
      id: idempotencyKey,
      transactionId,
      status,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_EXPIRY_MS)
    };

    db.create('idempotencyKeys', idempotencyKey, record);
    return record;
  }

  // ==========================================
  // Fraud Prevention Methods
  // ==========================================

  /**
   * Calculate risk score for a withdrawal
   * Returns score 0-100 (higher = riskier)
   */
  static calculateRiskScore(userId, withdrawalData, deviceInfo = {}) {
    let score = 0;
    const factors = [];

    const { amount, accountNumber, countryCode, isNewRecipient } = withdrawalData;

    // Factor 1: Amount (0-20 points)
    if (amount >= SUSPICIOUS_AMOUNT_THRESHOLD) {
      score += 20;
      factors.push({ factor: 'high_amount', points: 20, detail: 'Large withdrawal amount' });
    } else if (amount >= HIGH_VALUE_THRESHOLD) {
      score += 10;
      factors.push({ factor: 'medium_amount', points: 10, detail: 'Medium-high withdrawal amount' });
    }

    // Factor 2: New recipient (0-15 points)
    if (isNewRecipient) {
      score += 15;
      factors.push({ factor: 'new_recipient', points: 15, detail: 'First withdrawal to this account' });
    }

    // Factor 3: Account age (0-20 points)
    const account = db.findById('accounts', userId);
    if (account) {
      const accountAgeHours = (Date.now() - new Date(account.createdAt).getTime()) / (1000 * 60 * 60);
      if (accountAgeHours < 24) {
        score += 20;
        factors.push({ factor: 'new_account', points: 20, detail: 'Account less than 24 hours old' });
      } else if (accountAgeHours < 168) { // 7 days
        score += 10;
        factors.push({ factor: 'young_account', points: 10, detail: 'Account less than 7 days old' });
      }
    }

    // Factor 4: Velocity check (0-25 points)
    const velocityScore = this.checkVelocity(userId, amount);
    score += velocityScore.points;
    if (velocityScore.points > 0) {
      factors.push(velocityScore);
    }

    // Factor 5: Unusual timing (0-10 points)
    const hour = new Date().getHours();
    if (hour >= 1 && hour <= 5) { // 1 AM - 5 AM
      score += 10;
      factors.push({ factor: 'unusual_timing', points: 10, detail: 'Withdrawal during unusual hours' });
    }

    // Factor 6: Cross-border transfer (0-10 points)
    if (countryCode !== 'NG') {
      score += 10;
      factors.push({ factor: 'cross_border', points: 10, detail: 'International withdrawal' });
    }

    // Factor 7: Device/IP (would check in production)
    // if (deviceInfo.isNewDevice) { score += 15; }
    // if (deviceInfo.isVPN) { score += 15; }

    return {
      score: Math.min(score, 100),
      level: score >= RISK_SCORE_THRESHOLDS.HIGH ? 'high' :
             score >= RISK_SCORE_THRESHOLDS.MEDIUM ? 'medium' :
             score >= RISK_SCORE_THRESHOLDS.LOW ? 'low' : 'minimal',
      factors,
      requiresReview: score >= RISK_SCORE_THRESHOLDS.HIGH,
      blockedReason: score >= 90 ? 'Transaction blocked due to high risk score' : null
    };
  }

  /**
   * Check velocity limits
   */
  static checkVelocity(userId, amount) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get user's withdrawal history
    const withdrawals = db.findMany('withdrawalTransactions', (t) =>
      t.userId === userId &&
      t.status !== TRANSACTION_STATUS.FAILED &&
      new Date(t.createdAt) >= monthAgo
    );

    // Calculate totals
    const dailyTotal = withdrawals
      .filter(t => new Date(t.createdAt) >= dayAgo)
      .reduce((sum, t) => sum + t.amount, 0);

    const weeklyTotal = withdrawals
      .filter(t => new Date(t.createdAt) >= weekAgo)
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyTotal = withdrawals.reduce((sum, t) => sum + t.amount, 0);

    // Check daily velocity
    if (dailyTotal + amount > WITHDRAWAL_LIMITS.daily) {
      return { factor: 'daily_limit', points: 25, detail: 'Approaching daily withdrawal limit' };
    }

    // Check for burst withdrawals (more than 5 in last hour)
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const hourlyCount = withdrawals.filter(t => new Date(t.createdAt) >= hourAgo).length;
    if (hourlyCount >= 5) {
      return { factor: 'burst_velocity', points: 25, detail: 'Multiple withdrawals in short period' };
    }

    // Check weekly trend
    if (weeklyTotal + amount > WITHDRAWAL_LIMITS.weekly * 0.8) {
      return { factor: 'weekly_trend', points: 15, detail: 'High weekly withdrawal volume' };
    }

    return { factor: 'velocity_ok', points: 0, detail: 'Normal velocity' };
  }

  /**
   * Validate withdrawal limits
   */
  static validateLimits(userId, amount, currency) {
    const errors = [];

    // Per-transaction limits
    if (amount < WITHDRAWAL_LIMITS.perTransaction.min) {
      errors.push(`Minimum withdrawal amount is ₦${WITHDRAWAL_LIMITS.perTransaction.min}`);
    }
    if (amount > WITHDRAWAL_LIMITS.perTransaction.max) {
      errors.push(`Maximum withdrawal amount is ₦${WITHDRAWAL_LIMITS.perTransaction.max.toLocaleString()}`);
    }

    // Get user's withdrawal history
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const withdrawals = db.findMany('withdrawalTransactions', (t) =>
      t.userId === userId &&
      t.status !== TRANSACTION_STATUS.FAILED &&
      new Date(t.createdAt) >= monthAgo
    );

    const dailyTotal = withdrawals
      .filter(t => new Date(t.createdAt) >= dayAgo)
      .reduce((sum, t) => sum + t.amount, 0);

    const weeklyTotal = withdrawals
      .filter(t => new Date(t.createdAt) >= weekAgo)
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyTotal = withdrawals.reduce((sum, t) => sum + t.amount, 0);

    if (dailyTotal + amount > WITHDRAWAL_LIMITS.daily) {
      errors.push(`Daily withdrawal limit of ₦${WITHDRAWAL_LIMITS.daily.toLocaleString()} exceeded`);
    }

    if (weeklyTotal + amount > WITHDRAWAL_LIMITS.weekly) {
      errors.push(`Weekly withdrawal limit of ₦${WITHDRAWAL_LIMITS.weekly.toLocaleString()} exceeded`);
    }

    if (monthlyTotal + amount > WITHDRAWAL_LIMITS.monthly) {
      errors.push(`Monthly withdrawal limit of ₦${WITHDRAWAL_LIMITS.monthly.toLocaleString()} exceeded`);
    }

    return {
      valid: errors.length === 0,
      errors,
      limits: {
        daily: { used: dailyTotal, limit: WITHDRAWAL_LIMITS.daily, remaining: WITHDRAWAL_LIMITS.daily - dailyTotal },
        weekly: { used: weeklyTotal, limit: WITHDRAWAL_LIMITS.weekly, remaining: WITHDRAWAL_LIMITS.weekly - weeklyTotal },
        monthly: { used: monthlyTotal, limit: WITHDRAWAL_LIMITS.monthly, remaining: WITHDRAWAL_LIMITS.monthly - monthlyTotal }
      }
    };
  }

  /**
   * Check if biometric verification is required
   */
  static requiresBiometric(amount) {
    return Number(amount) >= HIGH_VALUE_THRESHOLD;
  }

  // ==========================================
  // Beneficiary/Recipient Methods
  // ==========================================

  /**
   * Get recent transfer recipients
   */
  static getRecentRecipients(userId, countryCode = null, limit = 10) {
    let recipients = db.findMany('withdrawalBeneficiaries', (r) =>
      r.userId === userId && !r.deleted
    );

    if (countryCode) {
      recipients = recipients.filter(r => r.countryCode === countryCode);
    }

    recipients.sort((a, b) => new Date(b.lastUsed || b.createdAt) - new Date(a.lastUsed || a.createdAt));

    return recipients.slice(0, limit).map(r => ({
      id: r.id,
      accountNumber: r.accountNumber,
      accountName: r.accountName,
      bank: r.bank,
      countryCode: r.countryCode,
      currency: r.currency,
      payoutType: r.payoutType,
      lastUsed: r.lastUsed,
      displayLabel: r.accountName,
      displaySubLabel: `${r.accountNumber} • ${r.bank.name}`
    }));
  }

  /**
   * Add or update beneficiary
   */
  static addBeneficiary(userId, recipientData) {
    const { accountNumber, accountName, bank, countryCode, currency, payoutType } = recipientData;

    // Check if exists
    const existing = db.findOne('withdrawalBeneficiaries', (r) =>
      r.userId === userId &&
      r.accountNumber === accountNumber &&
      r.bank.code === bank.code &&
      !r.deleted
    );

    if (existing) {
      return db.update('withdrawalBeneficiaries', existing.id, {
        accountName,
        lastUsed: new Date(),
        updatedAt: new Date()
      });
    }

    const beneficiaryId = uuidv4();
    const beneficiary = {
      id: beneficiaryId,
      userId,
      accountNumber,
      accountName,
      bank,
      countryCode,
      currency,
      payoutType, // 'bank' or 'momo'
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('withdrawalBeneficiaries', beneficiaryId, beneficiary);
    return beneficiary;
  }

  /**
   * Check if recipient is new (first-time transfer)
   */
  static isNewRecipient(userId, accountNumber, bankCode) {
    const existing = db.findOne('withdrawalBeneficiaries', (r) =>
      r.userId === userId &&
      r.accountNumber === accountNumber &&
      r.bank.code === bankCode &&
      !r.deleted
    );
    return !existing;
  }

  // ==========================================
  // Account Validation
  // ==========================================

  /**
   * Validate bank account
   */
  static async validateBankAccount(countryCode, bankCode, accountNumber) {
    return PayoutProviderService.validateBankAccount(countryCode, bankCode, accountNumber);
  }

  /**
   * Validate mobile wallet
   */
  static async validateMobileWallet(countryCode, walletProvider, phoneNumber) {
    return PayoutProviderService.validateMobileWallet(countryCode, walletProvider, phoneNumber);
  }

  // ==========================================
  // Withdrawal Flow
  // ==========================================

  /**
   * Initiate withdrawal (create preview)
   */
  static async initiateWithdrawal(userId, data, idempotencyKey = null) {
    const {
      countryCode,
      bankCode,
      walletProvider,
      accountNumber,
      phoneNumber,
      amount,
      sourceCurrency = 'USD',
      narration,
      deviceInfo
    } = data;

    // Determine payout type
    const payoutType = walletProvider ? 'momo' : 'bank';
    const destinationId = payoutType === 'bank' ? accountNumber : phoneNumber;

    // Get country config
    const country = PayoutProviderService.getCountry(countryCode);
    if (!country) {
      throw new ValidationError('Unsupported country');
    }

    // Check idempotency
    const autoIdempotencyKey = idempotencyKey ||
      this.generateIdempotencyKey(userId, amount, destinationId, country.currency);

    const existingRequest = this.checkIdempotencyKey(autoIdempotencyKey);
    if (existingRequest) {
      // Return existing transaction
      const existingTransaction = db.findById('withdrawalTransactions', existingRequest.transactionId);
      if (existingTransaction) {
        return {
          isDuplicate: true,
          message: 'Duplicate request detected. Returning existing transaction.',
          transaction: this.formatTransactionResponse(existingTransaction)
        };
      }
    }

    // Validate account/wallet
    let validation;
    if (payoutType === 'bank') {
      validation = await this.validateBankAccount(countryCode, bankCode, accountNumber);
    } else {
      validation = await this.validateMobileWallet(countryCode, walletProvider, phoneNumber);
    }

    if (!validation.valid) {
      throw new ValidationError(validation.error || 'Account validation failed');
    }

    // Calculate exchange rate and converted amount
    const conversion = PayoutProviderService.convertAmount(amount, sourceCurrency, country.currency);

    // Calculate fee
    const feeInfo = PayoutProviderService.calculateFee(country.currency, conversion.convertedAmount);

    // Validate limits
    const limitsCheck = this.validateLimits(userId, conversion.convertedAmount, country.currency);
    if (!limitsCheck.valid) {
      throw new ValidationError(limitsCheck.errors.join('. '));
    }

    // Check if new recipient
    const isNewRecipient = this.isNewRecipient(userId, destinationId, bankCode || walletProvider);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(userId, {
      amount: conversion.convertedAmount,
      accountNumber: destinationId,
      countryCode,
      isNewRecipient
    }, deviceInfo);

    if (riskScore.blockedReason) {
      throw new ValidationError(riskScore.blockedReason);
    }

    // Check biometric requirement
    const requiresBiometric = this.requiresBiometric(conversion.convertedAmount);

    /**
     * TODO: Wallet Integration - Check balance
     * const wallet = WalletService.getWallet(userId, sourceCurrency);
     * if (wallet.balance < amount) {
     *   throw new ValidationError('Insufficient wallet balance');
     * }
     */
    const mockWalletBalance = 50000; // Mock balance in USD

    if (amount > mockWalletBalance) {
      throw new ValidationError('Insufficient wallet balance');
    }

    // Create preview
    const previewToken = uuidv4();
    const preview = {
      token: previewToken,
      userId,
      idempotencyKey: autoIdempotencyKey,
      payoutType,
      countryCode,
      country: {
        code: country.code,
        name: country.name,
        currency: country.currency,
        currencySymbol: country.currencySymbol,
        flag: country.flag
      },
      recipient: {
        accountNumber: destinationId,
        accountName: validation.accountName,
        bank: validation.bank || validation.wallet,
        payoutType
      },
      sourceCurrency,
      sourceAmount: amount,
      destinationCurrency: country.currency,
      destinationAmount: conversion.convertedAmount,
      exchangeRate: conversion.rate,
      rateDisplay: conversion.rateDisplay,
      fee: feeInfo.fee,
      feeDisplay: `${country.currencySymbol}${feeInfo.fee.toLocaleString()}`,
      totalDebit: amount, // In source currency
      totalCredit: conversion.convertedAmount - feeInfo.fee, // In destination currency
      narration,
      walletBalance: mockWalletBalance,
      isNewRecipient,
      riskScore: riskScore.score,
      riskLevel: riskScore.level,
      requiresReview: riskScore.requiresReview,
      requiresBiometric,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + PREVIEW_EXPIRY_MS)
    };

    db.create('withdrawalPreviews', previewToken, preview);

    return {
      previewToken,
      recipient: preview.recipient,
      country: preview.country,
      sourceAmount: amount,
      sourceCurrency,
      destinationAmount: conversion.convertedAmount,
      destinationCurrency: country.currency,
      exchangeRate: conversion.rate,
      rateDisplay: conversion.rateDisplay,
      fee: feeInfo.fee,
      feeDisplay: preview.feeDisplay,
      totalCredit: preview.totalCredit,
      walletBalance: mockWalletBalance,
      requiresBiometric,
      biometricMessage: requiresBiometric
        ? 'This withdrawal requires both PIN and biometric verification'
        : null,
      requiresReview: riskScore.requiresReview,
      reviewMessage: riskScore.requiresReview
        ? 'This withdrawal will be reviewed before processing'
        : null
    };
  }

  /**
   * Confirm and execute withdrawal
   */
  static async confirmWithdrawal(userId, previewToken, transactionPin, biometricToken = null) {
    // Get preview
    const preview = db.findById('withdrawalPreviews', previewToken);
    if (!preview) {
      throw new ValidationError('Withdrawal session expired. Please start again.');
    }

    if (preview.userId !== userId) {
      throw new ValidationError('Invalid withdrawal session');
    }

    if (new Date() > new Date(preview.expiresAt)) {
      db.delete('withdrawalPreviews', previewToken);
      throw new ValidationError('Withdrawal session expired. Please start again.');
    }

    // Verify transaction PIN
    await AccountService.verifyTransactionPin(userId, transactionPin);

    // For high-value, verify biometric
    if (preview.requiresBiometric) {
      if (!biometricToken) {
        throw new ValidationError('Biometric verification required for withdrawals above ₦500,000');
      }
      await this.verifyBiometricToken(userId, biometricToken);
    }

    // Delete preview
    db.delete('withdrawalPreviews', previewToken);

    // Create transaction record
    const transactionId = uuidv4();
    const reference = generateReference('WTH');
    const sessionId = `100012${Date.now()}${Math.floor(Math.random() * 10000)}`;

    const transaction = {
      id: transactionId,
      reference,
      sessionId,
      userId,
      type: 'withdrawal',
      payoutType: preview.payoutType,
      countryCode: preview.countryCode,
      country: preview.country,
      recipient: preview.recipient,
      sourceCurrency: preview.sourceCurrency,
      sourceAmount: preview.sourceAmount,
      destinationCurrency: preview.destinationCurrency,
      destinationAmount: preview.destinationAmount,
      exchangeRate: preview.exchangeRate,
      fee: preview.fee,
      totalDebit: preview.totalDebit,
      totalCredit: preview.totalCredit,
      narration: preview.narration,
      riskScore: preview.riskScore,
      riskLevel: preview.riskLevel,
      status: preview.requiresReview ? TRANSACTION_STATUS.PENDING : TRANSACTION_STATUS.PROCESSING,
      statusMessage: preview.requiresReview ? 'Under review' : 'Processing',
      providerReference: null,
      providerUsed: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('withdrawalTransactions', transactionId, transaction);

    // Store idempotency key
    this.storeIdempotencyKey(preview.idempotencyKey, transactionId, transaction.status);

    /**
     * TODO: Wallet Integration - Debit wallet
     * WalletService.debit(userId, preview.sourceCurrency, preview.sourceAmount, {
     *   type: 'withdrawal',
     *   reference
     * });
     */

    // If requires review, return pending status
    if (preview.requiresReview) {
      // Add beneficiary (even for review)
      this.addBeneficiary(userId, {
        accountNumber: preview.recipient.accountNumber,
        accountName: preview.recipient.accountName,
        bank: preview.recipient.bank,
        countryCode: preview.countryCode,
        currency: preview.destinationCurrency,
        payoutType: preview.payoutType
      });

      return {
        success: true,
        status: 'pending',
        transaction: this.formatTransactionResponse(transaction),
        message: 'Withdrawal submitted for review. You will be notified once processed.'
      };
    }

    // Execute transfer
    let transferResult;
    if (preview.payoutType === 'bank') {
      transferResult = await PayoutProviderService.initiateBankTransfer({
        countryCode: preview.countryCode,
        currency: preview.destinationCurrency,
        bankCode: preview.recipient.bank.code,
        accountNumber: preview.recipient.accountNumber,
        accountName: preview.recipient.accountName,
        amount: preview.totalCredit,
        reference,
        narration: preview.narration || 'Zenaex Withdrawal'
      });
    } else {
      transferResult = await PayoutProviderService.initiateMomoTransfer({
        countryCode: preview.countryCode,
        currency: preview.destinationCurrency,
        walletProvider: preview.recipient.bank.code,
        phoneNumber: preview.recipient.accountNumber,
        accountName: preview.recipient.accountName,
        amount: preview.totalCredit,
        reference,
        narration: preview.narration || 'Zenaex Withdrawal'
      });
    }

    // Update transaction
    const finalStatus = transferResult.success ? TRANSACTION_STATUS.COMPLETED : TRANSACTION_STATUS.FAILED;
    const finalTransaction = db.update('withdrawalTransactions', transactionId, {
      status: finalStatus,
      statusMessage: transferResult.success ? 'Successful' : (transferResult.error || 'Failed'),
      providerReference: transferResult.providerReference,
      providerUsed: transferResult.provider,
      completedAt: transferResult.success ? new Date() : null,
      failedAt: transferResult.success ? null : new Date(),
      failureReason: transferResult.success ? null : transferResult.error,
      updatedAt: new Date()
    });

    // Update idempotency key status
    db.update('idempotencyKeys', preview.idempotencyKey, { status: finalStatus });

    // Add/update beneficiary on success
    if (transferResult.success) {
      this.addBeneficiary(userId, {
        accountNumber: preview.recipient.accountNumber,
        accountName: preview.recipient.accountName,
        bank: preview.recipient.bank,
        countryCode: preview.countryCode,
        currency: preview.destinationCurrency,
        payoutType: preview.payoutType
      });
    } else {
      /**
       * TODO: Wallet Integration - Refund on failure
       * WalletService.credit(userId, preview.sourceCurrency, preview.sourceAmount, {
       *   type: 'withdrawal_reversal',
       *   reference
       * });
       */
    }

    return {
      success: transferResult.success,
      status: finalStatus,
      transaction: this.formatTransactionResponse(finalTransaction),
      message: transferResult.success
        ? `You have successfully withdraw funds to ${preview.recipient.accountName}`
        : transferResult.error || 'Withdrawal failed. Funds have been reversed to your account.'
    };
  }

  /**
   * Format transaction response for API
   */
  static formatTransactionResponse(transaction) {
    return {
      id: transaction.id,
      reference: transaction.reference,
      sessionId: transaction.sessionId,
      type: 'Withdrawal',
      payoutType: transaction.payoutType,
      recipient: transaction.recipient,
      country: transaction.country,
      sourceAmount: transaction.sourceAmount,
      sourceCurrency: transaction.sourceCurrency,
      destinationAmount: transaction.destinationAmount,
      destinationCurrency: transaction.destinationCurrency,
      exchangeRate: transaction.exchangeRate,
      fee: transaction.fee,
      totalCredit: transaction.totalCredit,
      status: transaction.status,
      statusMessage: transaction.statusMessage,
      narration: transaction.narration,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt
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
  // Transaction History
  // ==========================================

  /**
   * Get withdrawal history
   */
  static getTransactionHistory(userId, options = {}) {
    const { status, countryCode, search, startDate, endDate, limit = 50, offset = 0 } = options;

    let transactions = db.findMany('withdrawalTransactions', (t) => t.userId === userId);

    if (status) {
      transactions = transactions.filter(t => t.status === status);
    }

    if (countryCode) {
      transactions = transactions.filter(t => t.countryCode === countryCode);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      transactions = transactions.filter(t =>
        t.reference.toLowerCase().includes(searchLower) ||
        t.recipient.accountNumber.includes(search) ||
        t.recipient.accountName.toLowerCase().includes(searchLower)
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

    return {
      transactions: transactions.slice(offset, offset + limit).map(t => this.formatTransactionResponse(t)),
      total: transactions.length,
      hasMore: offset + limit < transactions.length
    };
  }

  /**
   * Get transaction details
   */
  static getTransactionDetails(userId, transactionId) {
    const transaction = db.findById('withdrawalTransactions', transactionId);

    if (!transaction || transaction.userId !== userId) {
      throw new NotFoundError('Transaction not found');
    }

    return {
      ...this.formatTransactionResponse(transaction),
      providerReference: transaction.providerReference,
      providerUsed: transaction.providerUsed,
      riskLevel: transaction.riskLevel,
      failureReason: transaction.failureReason,
      completedAt: transaction.completedAt,
      failedAt: transaction.failedAt
    };
  }

  /**
   * Generate withdrawal receipt
   */
  static generateReceipt(userId, transactionId) {
    const transaction = this.getTransactionDetails(userId, transactionId);

    let statusDisplay = transaction.status;
    let statusColor = '#000000';
    let amountPrefix = '-';

    if (transaction.status === TRANSACTION_STATUS.COMPLETED) {
      statusDisplay = 'Successful';
      statusColor = '#22C55E';
    } else if (transaction.status === TRANSACTION_STATUS.PENDING || transaction.status === TRANSACTION_STATUS.PROCESSING) {
      statusDisplay = 'Pending';
      statusColor = '#F59E0B';
    } else if (transaction.status === TRANSACTION_STATUS.FAILED) {
      statusDisplay = 'Reversal';
      statusColor = '#EF4444';
      amountPrefix = '+'; // Reversed amount
    }

    const details = [
      { label: 'Type', value: 'Withdrawal' },
      { label: 'Bank', value: transaction.recipient.bank.name },
      { label: 'Recipient', value: transaction.recipient.accountName },
      { label: 'Account Number', value: transaction.recipient.accountNumber },
      { label: 'Transaction ID', value: transaction.reference, copyable: true },
      { label: 'Session ID', value: transaction.sessionId, copyable: true },
      { label: 'Remark', value: transaction.narration || 'N/A' },
      { label: 'Our Fee', value: `$${(transaction.fee / transaction.exchangeRate).toFixed(2)}` }
    ];

    return {
      receiptId: `RCP${Date.now()}`,
      date: new Date(transaction.createdAt).toLocaleDateString('en-US', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      time: new Date(transaction.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      amount: transaction.sourceAmount,
      formattedAmount: `${amountPrefix}$${transaction.sourceAmount.toLocaleString()}`,
      localAmount: transaction.destinationAmount,
      formattedLocalAmount: `${transaction.country.currencySymbol}${transaction.destinationAmount.toLocaleString()}`,
      status: statusDisplay,
      statusColor,
      description: transaction.status === TRANSACTION_STATUS.COMPLETED
        ? `You have successfully withdraw funds to ${transaction.recipient.accountName}`
        : transaction.status === TRANSACTION_STATUS.FAILED
          ? "This transaction couldn't be completed, the funds have been reversed to your account."
          : 'Transaction Pending',
      details,
      actions: [
        { id: 'share_receipt', label: 'Share Receipt', primary: true },
        { id: 'report_issue', label: 'Report Issue', primary: false },
        { id: 'redo_transaction', label: 'Redo Transaction' }
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
   * Redo a withdrawal
   */
  static async redoWithdrawal(userId, transactionId) {
    const original = this.getTransactionDetails(userId, transactionId);

    return this.initiateWithdrawal(userId, {
      countryCode: original.countryCode,
      bankCode: original.payoutType === 'bank' ? original.recipient.bank.code : undefined,
      walletProvider: original.payoutType === 'momo' ? original.recipient.bank.code : undefined,
      accountNumber: original.payoutType === 'bank' ? original.recipient.accountNumber : undefined,
      phoneNumber: original.payoutType === 'momo' ? original.recipient.accountNumber : undefined,
      amount: original.sourceAmount,
      sourceCurrency: original.sourceCurrency,
      narration: original.narration
    });
  }

  /**
   * Report issue with transaction
   */
  static reportIssue(userId, transactionId, issueData) {
    const transaction = this.getTransactionDetails(userId, transactionId);

    const issueId = uuidv4();
    const issue = {
      id: issueId,
      userId,
      transactionId,
      transactionReference: transaction.reference,
      transactionType: 'withdrawal',
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

module.exports = WithdrawalService;
