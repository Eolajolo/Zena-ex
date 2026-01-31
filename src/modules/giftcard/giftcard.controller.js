const GiftcardService = require('./giftcard.service');
const { logger } = require('../../shared/utils');

/**
 * Get supported gift cards
 * GET /api/giftcard/cards
 */
const getSupportedCards = async (req, res, next) => {
  try {
    const cards = GiftcardService.getSupportedCards();

    res.status(200).json({
      success: true,
      data: { cards }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get rate for specific card
 * GET /api/giftcard/rates/:cardType
 */
const getCardRate = async (req, res, next) => {
  try {
    const { cardType } = req.params;
    const { currency = 'usd' } = req.query;

    const rate = GiftcardService.getCardRate(cardType, currency);

    res.status(200).json({
      success: true,
      data: rate
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate payout
 * POST /api/giftcard/calculate
 */
const calculatePayout = async (req, res, next) => {
  try {
    const { cardType, amount, currency = 'usd' } = req.body;
    const calculation = GiftcardService.calculatePayout(cardType, amount, currency);

    res.status(200).json({
      success: true,
      data: calculation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit gift card for redemption
 * POST /api/giftcard/submit
 */
const submitGiftcard = async (req, res, next) => {
  try {
    const result = await GiftcardService.submitGiftcard(req.user.id, req.body);

    logger.info('Gift card submitted', {
      userId: req.user.id,
      cardType: req.body.cardType,
      amount: req.body.amount
    });

    res.status(201).json({
      success: true,
      message: 'Gift card submitted for verification',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get gift card history
 * GET /api/giftcard/history
 */
const getGiftcardHistory = async (req, res, next) => {
  try {
    const { status, cardType, limit, offset } = req.query;
    const result = GiftcardService.getGiftcardHistory(req.user.id, {
      status,
      cardType,
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
 * Get gift card by ID
 * GET /api/giftcard/:id
 */
const getGiftcardById = async (req, res, next) => {
  try {
    const giftcard = GiftcardService.getGiftcardById(req.params.id);

    if (giftcard.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { giftcard }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify gift card (admin)
 * POST /api/giftcard/:id/verify
 */
const verifyGiftcard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approved, note } = req.body;

    const giftcard = await GiftcardService.verifyGiftcard(
      id,
      approved,
      note,
      req.user.id
    );

    logger.info('Gift card verified', {
      giftcardId: id,
      approved,
      verifiedBy: req.user.id
    });

    res.status(200).json({
      success: true,
      message: approved ? 'Gift card approved and credited' : 'Gift card rejected',
      data: { giftcard }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get pending gift cards (admin)
 * GET /api/giftcard/admin/pending
 */
const getPendingGiftcards = async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = GiftcardService.getPendingGiftcards({
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

module.exports = {
  getSupportedCards,
  getCardRate,
  calculatePayout,
  submitGiftcard,
  getGiftcardHistory,
  getGiftcardById,
  verifyGiftcard,
  getPendingGiftcards
};
