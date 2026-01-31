const PaymentService = require('./payment.service');
const { logger } = require('../../shared/utils');

/**
 * Pay a bill
 * POST /api/payment/bills
 */
const payBill = async (req, res, next) => {
  try {
    const result = await PaymentService.payBill(req.user.id, req.body);

    logger.info('Bill paid', {
      userId: req.user.id,
      category: req.body.category,
      amount: req.body.amount
    });

    res.status(200).json({
      success: true,
      message: 'Bill payment successful',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Transfer to another user
 * POST /api/payment/transfer/user
 */
const transferToUser = async (req, res, next) => {
  try {
    const { username, amount, note } = req.body;
    const result = await PaymentService.transferToUser(req.user.id, username, amount, note);

    logger.info('User transfer', {
      fromUserId: req.user.id,
      toUsername: username,
      amount
    });

    res.status(200).json({
      success: true,
      message: 'Transfer successful',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Transfer to bank account
 * POST /api/payment/transfer/bank
 */
const transferToBank = async (req, res, next) => {
  try {
    const result = await PaymentService.transferToBank(req.user.id, req.body);

    logger.info('Bank transfer', {
      userId: req.user.id,
      bankCode: req.body.bankCode,
      amount: req.body.amount
    });

    res.status(200).json({
      success: true,
      message: 'Transfer initiated',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get bill history
 * GET /api/payment/bills
 */
const getBillHistory = async (req, res, next) => {
  try {
    const { category, limit, offset } = req.query;
    const result = PaymentService.getBillHistory(req.user.id, {
      category,
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
 * Get transfer history
 * GET /api/payment/transfers
 */
const getTransferHistory = async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = PaymentService.getTransferHistory(req.user.id, {
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
 * Get supported billers
 * GET /api/payment/billers
 */
const getBillers = async (req, res, next) => {
  try {
    const { category } = req.query;
    const billers = PaymentService.getBillers(category);

    res.status(200).json({
      success: true,
      data: { billers }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supported banks
 * GET /api/payment/banks
 */
const getBanks = async (req, res, next) => {
  try {
    const banks = PaymentService.getBanks();

    res.status(200).json({
      success: true,
      data: { banks }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  payBill,
  transferToUser,
  transferToBank,
  getBillHistory,
  getTransferHistory,
  getBillers,
  getBanks
};
