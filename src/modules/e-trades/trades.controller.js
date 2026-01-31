const TradesService = require('./trades.service');
const { logger } = require('../../shared/utils');

/**
 * Get exchange rates
 * GET /api/trades/rates
 */
const getRates = async (req, res, next) => {
  try {
    const rates = TradesService.getExchangeRates();

    res.status(200).json({
      success: true,
      data: { rates }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get rate for specific crypto
 * GET /api/trades/rates/:crypto
 */
const getRate = async (req, res, next) => {
  try {
    const { crypto } = req.params;
    const { side = 'buy' } = req.query;

    const rate = TradesService.getRate(crypto, side);

    res.status(200).json({
      success: true,
      data: rate
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate trade
 * POST /api/trades/calculate
 */
const calculateTrade = async (req, res, next) => {
  try {
    const { crypto, amount, side } = req.body;
    const calculation = TradesService.calculateTrade(crypto, amount, side);

    res.status(200).json({
      success: true,
      data: calculation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Buy crypto
 * POST /api/trades/buy
 */
const buyCrypto = async (req, res, next) => {
  try {
    const { crypto, amount } = req.body;
    const result = await TradesService.buyCrypto(req.user.id, crypto, amount);

    logger.info('Crypto bought', {
      userId: req.user.id,
      crypto,
      amount,
      cryptoAmount: result.calculation.cryptoAmount
    });

    res.status(200).json({
      success: true,
      message: `Successfully bought ${result.calculation.cryptoAmount} ${crypto}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Sell crypto
 * POST /api/trades/sell
 */
const sellCrypto = async (req, res, next) => {
  try {
    const { crypto, amount } = req.body;
    const result = await TradesService.sellCrypto(req.user.id, crypto, amount);

    logger.info('Crypto sold', {
      userId: req.user.id,
      crypto,
      cryptoAmount: amount,
      fiatAmount: result.calculation.fiatAmount
    });

    res.status(200).json({
      success: true,
      message: `Successfully sold ${amount} ${crypto}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get trade history
 * GET /api/trades/history
 */
const getTradeHistory = async (req, res, next) => {
  try {
    const { crypto, type, limit, offset } = req.query;
    const result = TradesService.getTradeHistory(req.user.id, {
      crypto,
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
 * Get order by ID
 * GET /api/trades/orders/:id
 */
const getOrderById = async (req, res, next) => {
  try {
    const order = TradesService.getOrderById(req.params.id);

    if (order.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { order }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supported cryptocurrencies
 * GET /api/trades/cryptos
 */
const getSupportedCryptos = async (req, res, next) => {
  try {
    const cryptos = TradesService.getSupportedCryptos();

    res.status(200).json({
      success: true,
      data: { cryptos }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRates,
  getRate,
  calculateTrade,
  buyCrypto,
  sellCrypto,
  getTradeHistory,
  getOrderById,
  getSupportedCryptos
};
