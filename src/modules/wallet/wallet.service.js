const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { NotFoundError, InsufficientBalanceError, ValidationError } = require('../../shared/middleware');
const { CURRENCIES, WALLET_TYPES, TRANSACTION_TYPES, TRANSACTION_STATUS } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');

class WalletService {
  /**
   * Create a wallet for a user
   */
  static createWallet(userId, currency = 'NGN', type = WALLET_TYPES.FIAT) {
    // Check if wallet already exists
    const existingWallet = db.findOne('wallets', (w) =>
      w.userId === userId && w.currency === currency
    );

    if (existingWallet) {
      return existingWallet;
    }

    const walletId = uuidv4();
    const wallet = {
      id: walletId,
      userId,
      currency,
      type,
      balance: 0,
      lockedBalance: 0,
      isActive: true
    };

    db.create('wallets', walletId, wallet);
    return wallet;
  }

  /**
   * Get user's wallets
   */
  static getUserWallets(userId) {
    return db.findMany('wallets', (w) => w.userId === userId && w.isActive);
  }

  /**
   * Get wallet by ID
   */
  static getWalletById(walletId) {
    const wallet = db.findById('wallets', walletId);
    if (!wallet) {
      throw new NotFoundError('Wallet not found');
    }
    return wallet;
  }

  /**
   * Get wallet by user and currency
   */
  static getWalletByCurrency(userId, currency) {
    const wallet = db.findOne('wallets', (w) =>
      w.userId === userId && w.currency === currency && w.isActive
    );

    if (!wallet) {
      // Auto-create NGN wallet if doesn't exist
      if (currency === 'NGN') {
        return this.createWallet(userId, 'NGN');
      }
      throw new NotFoundError(`${currency} wallet not found`);
    }

    return wallet;
  }

  /**
   * Get wallet balance
   */
  static getBalance(userId, currency = 'NGN') {
    const wallet = this.getWalletByCurrency(userId, currency);
    return {
      currency: wallet.currency,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      availableBalance: wallet.balance - wallet.lockedBalance
    };
  }

  /**
   * Credit wallet
   */
  static async credit(userId, amount, currency, description, metadata = {}) {
    if (amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    const wallet = this.getWalletByCurrency(userId, currency);

    // Update balance
    const newBalance = wallet.balance + amount;
    db.update('wallets', wallet.id, { balance: newBalance });

    // Create transaction record
    const transaction = this.createTransaction({
      walletId: wallet.id,
      userId,
      type: TRANSACTION_TYPES.CREDIT,
      amount,
      currency,
      description,
      metadata,
      balanceAfter: newBalance
    });

    return { wallet: this.getWalletById(wallet.id), transaction };
  }

  /**
   * Debit wallet
   */
  static async debit(userId, amount, currency, description, metadata = {}) {
    if (amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    const wallet = this.getWalletByCurrency(userId, currency);
    const availableBalance = wallet.balance - wallet.lockedBalance;

    if (availableBalance < amount) {
      throw new InsufficientBalanceError(
        `Insufficient balance. Available: ${availableBalance} ${currency}`
      );
    }

    // Update balance
    const newBalance = wallet.balance - amount;
    db.update('wallets', wallet.id, { balance: newBalance });

    // Create transaction record
    const transaction = this.createTransaction({
      walletId: wallet.id,
      userId,
      type: TRANSACTION_TYPES.DEBIT,
      amount: -amount,
      currency,
      description,
      metadata,
      balanceAfter: newBalance
    });

    return { wallet: this.getWalletById(wallet.id), transaction };
  }

  /**
   * Lock funds (for pending transactions)
   */
  static lockFunds(userId, amount, currency) {
    const wallet = this.getWalletByCurrency(userId, currency);
    const availableBalance = wallet.balance - wallet.lockedBalance;

    if (availableBalance < amount) {
      throw new InsufficientBalanceError('Insufficient available balance');
    }

    db.update('wallets', wallet.id, {
      lockedBalance: wallet.lockedBalance + amount
    });

    return this.getWalletById(wallet.id);
  }

  /**
   * Unlock funds
   */
  static unlockFunds(userId, amount, currency) {
    const wallet = this.getWalletByCurrency(userId, currency);

    const newLockedBalance = Math.max(0, wallet.lockedBalance - amount);
    db.update('wallets', wallet.id, { lockedBalance: newLockedBalance });

    return this.getWalletById(wallet.id);
  }

  /**
   * Create transaction record
   */
  static createTransaction(data) {
    const transactionId = uuidv4();
    const transaction = {
      id: transactionId,
      reference: generateReference('TXN'),
      walletId: data.walletId,
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      metadata: data.metadata || {},
      balanceAfter: data.balanceAfter,
      status: TRANSACTION_STATUS.COMPLETED
    };

    db.create('transactions', transactionId, transaction);
    return transaction;
  }

  /**
   * Get user's transactions
   */
  static getTransactions(userId, options = {}) {
    const { currency, type, limit = 50, offset = 0 } = options;

    let transactions = db.findMany('transactions', (t) => t.userId === userId);

    if (currency) {
      transactions = transactions.filter(t => t.currency === currency);
    }

    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      transactions: transactions.slice(offset, offset + limit),
      total: transactions.length,
      limit,
      offset
    };
  }

  /**
   * Get transaction by ID
   */
  static getTransactionById(transactionId) {
    const transaction = db.findById('transactions', transactionId);
    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }
    return transaction;
  }
}

module.exports = WalletService;
