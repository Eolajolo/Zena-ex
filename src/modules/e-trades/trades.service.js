const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const WalletService = require('../wallet/wallet.service');
const { NotFoundError, ValidationError, InsufficientBalanceError } = require('../../shared/middleware');
const { TRANSACTION_STATUS, CURRENCIES } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');

class TradesService {
  /**
   * Get current exchange rates
   */
  static getExchangeRates() {
    // Mock rates - in production, fetch from exchange API
    return {
      BTC: { buy: 68500000, sell: 67800000, currency: 'NGN' },
      ETH: { buy: 5200000, sell: 5150000, currency: 'NGN' },
      USDT: { buy: 1580, sell: 1550, currency: 'NGN' },
      USDC: { buy: 1580, sell: 1550, currency: 'NGN' },
      updatedAt: new Date()
    };
  }

  /**
   * Get rate for specific pair
   */
  static getRate(crypto, side = 'buy') {
    const rates = this.getExchangeRates();
    const rate = rates[crypto.toUpperCase()];

    if (!rate) {
      throw new ValidationError(`Unsupported cryptocurrency: ${crypto}`);
    }

    return {
      crypto,
      rate: rate[side],
      side,
      currency: rate.currency
    };
  }

  /**
   * Calculate trade amount
   */
  static calculateTrade(crypto, amount, side) {
    const rateInfo = this.getRate(crypto, side);

    if (side === 'buy') {
      // User pays NGN, receives crypto
      const cryptoAmount = amount / rateInfo.rate;
      return {
        fiatAmount: amount,
        cryptoAmount,
        rate: rateInfo.rate,
        crypto,
        side
      };
    } else {
      // User pays crypto, receives NGN
      const fiatAmount = amount * rateInfo.rate;
      return {
        fiatAmount,
        cryptoAmount: amount,
        rate: rateInfo.rate,
        crypto,
        side
      };
    }
  }

  /**
   * Buy crypto with NGN
   */
  static async buyCrypto(userId, crypto, fiatAmount) {
    const calculation = this.calculateTrade(crypto, fiatAmount, 'buy');

    // Debit NGN wallet
    const { transaction: debitTxn } = await WalletService.debit(
      userId,
      fiatAmount,
      'NGN',
      `Buy ${crypto}`,
      { crypto, cryptoAmount: calculation.cryptoAmount, rate: calculation.rate }
    );

    // Ensure crypto wallet exists
    WalletService.createWallet(userId, crypto, 'crypto');

    // Credit crypto wallet
    const { transaction: creditTxn } = await WalletService.credit(
      userId,
      calculation.cryptoAmount,
      crypto,
      `Purchased ${crypto}`,
      { fiatAmount, rate: calculation.rate }
    );

    // Create trade order
    const orderId = uuidv4();
    const order = {
      id: orderId,
      reference: generateReference('BUY'),
      userId,
      type: 'buy',
      crypto,
      cryptoAmount: calculation.cryptoAmount,
      fiatAmount,
      rate: calculation.rate,
      status: TRANSACTION_STATUS.COMPLETED,
      debitTransactionId: debitTxn.id,
      creditTransactionId: creditTxn.id
    };

    db.create('trade_orders', orderId, order);

    return { order, calculation };
  }

  /**
   * Sell crypto for NGN
   */
  static async sellCrypto(userId, crypto, cryptoAmount) {
    const calculation = this.calculateTrade(crypto, cryptoAmount, 'sell');

    // Debit crypto wallet
    const { transaction: debitTxn } = await WalletService.debit(
      userId,
      cryptoAmount,
      crypto,
      `Sell ${crypto}`,
      { fiatAmount: calculation.fiatAmount, rate: calculation.rate }
    );

    // Credit NGN wallet
    const { transaction: creditTxn } = await WalletService.credit(
      userId,
      calculation.fiatAmount,
      'NGN',
      `Sold ${crypto}`,
      { crypto, cryptoAmount, rate: calculation.rate }
    );

    // Create trade order
    const orderId = uuidv4();
    const order = {
      id: orderId,
      reference: generateReference('SELL'),
      userId,
      type: 'sell',
      crypto,
      cryptoAmount,
      fiatAmount: calculation.fiatAmount,
      rate: calculation.rate,
      status: TRANSACTION_STATUS.COMPLETED,
      debitTransactionId: debitTxn.id,
      creditTransactionId: creditTxn.id
    };

    db.create('trade_orders', orderId, order);

    return { order, calculation };
  }

  /**
   * Get trade history
   */
  static getTradeHistory(userId, options = {}) {
    const { crypto, type, limit = 50, offset = 0 } = options;

    let orders = db.findMany('trade_orders', (o) => o.userId === userId);

    if (crypto) {
      orders = orders.filter(o => o.crypto === crypto.toUpperCase());
    }

    if (type) {
      orders = orders.filter(o => o.type === type);
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      orders: orders.slice(offset, offset + limit),
      total: orders.length
    };
  }

  /**
   * Get order by ID
   */
  static getOrderById(orderId) {
    const order = db.findById('trade_orders', orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    return order;
  }

  /**
   * Get supported cryptocurrencies
   */
  static getSupportedCryptos() {
    return CURRENCIES.CRYPTO.map(crypto => ({
      symbol: crypto,
      name: this.getCryptoName(crypto),
      icon: `${crypto.toLowerCase()}.png`
    }));
  }

  /**
   * Get crypto full name
   */
  static getCryptoName(symbol) {
    const names = {
      BTC: 'Bitcoin',
      ETH: 'Ethereum',
      USDT: 'Tether',
      USDC: 'USD Coin'
    };
    return names[symbol] || symbol;
  }
}

module.exports = TradesService;
