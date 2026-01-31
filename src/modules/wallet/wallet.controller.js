const WalletService = require('./wallet.service');
const { logger } = require('../../shared/utils');

/**
 * Get user's wallets
 * GET /api/wallet
 */
const getWallets = async (req, res, next) => {
  try {
    const wallets = WalletService.getUserWallets(req.user.id);

    res.status(200).json({
      success: true,
      data: { wallets }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get wallet balance
 * GET /api/wallet/balance/:currency
 */
const getBalance = async (req, res, next) => {
  try {
    const { currency = 'NGN' } = req.params;
    const balance = WalletService.getBalance(req.user.id, currency.toUpperCase());

    res.status(200).json({
      success: true,
      data: balance
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all balances
 * GET /api/wallet/balances
 */
const getAllBalances = async (req, res, next) => {
  try {
    const wallets = WalletService.getUserWallets(req.user.id);

    const balances = wallets.map(w => ({
      currency: w.currency,
      balance: w.balance,
      lockedBalance: w.lockedBalance,
      availableBalance: w.balance - w.lockedBalance
    }));

    res.status(200).json({
      success: true,
      data: { balances }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new wallet
 * POST /api/wallet/create
 */
const createWallet = async (req, res, next) => {
  try {
    const { currency, type } = req.body;
    const wallet = WalletService.createWallet(req.user.id, currency, type);

    logger.info('Wallet created', { userId: req.user.id, currency });

    res.status(201).json({
      success: true,
      message: 'Wallet created successfully',
      data: { wallet }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get transactions
 * GET /api/wallet/transactions
 */
const getTransactions = async (req, res, next) => {
  try {
    const { currency, type, limit, offset } = req.query;

    const result = WalletService.getTransactions(req.user.id, {
      currency,
      type,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get transaction by ID
 * GET /api/wallet/transactions/:id
 */
const getTransactionById = async (req, res, next) => {
  try {
    const transaction = WalletService.getTransactionById(req.params.id);

    // Ensure user owns this transaction
    if (transaction.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { transaction }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getWallets,
  getBalance,
  getAllBalances,
  createWallet,
  getTransactions,
  getTransactionById
};
