const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const WalletService = require('../wallet/wallet.service');
const { NotFoundError, ValidationError } = require('../../shared/middleware');
const { TRANSACTION_STATUS, GIFTCARD_TYPES } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');

class GiftcardService {
  /**
   * Get supported gift card types with rates
   */
  static getSupportedCards() {
    // Mock rates - in production, fetch from provider
    const rates = {
      itunes: { usd: { min: 25, max: 500, rate: 620 } },
      amazon: { usd: { min: 25, max: 500, rate: 600 } },
      steam: { usd: { min: 20, max: 200, rate: 580 } },
      google_play: { usd: { min: 25, max: 500, rate: 590 } },
      ebay: { usd: { min: 25, max: 500, rate: 550 } },
      walmart: { usd: { min: 25, max: 500, rate: 540 } },
      sephora: { usd: { min: 25, max: 500, rate: 520 } },
      nordstrom: { usd: { min: 50, max: 500, rate: 510 } }
    };

    return GIFTCARD_TYPES.map(card => ({
      ...card,
      rates: rates[card.id] || {}
    }));
  }

  /**
   * Get card rates
   */
  static getCardRate(cardType, currency = 'usd') {
    const cards = this.getSupportedCards();
    const card = cards.find(c => c.id === cardType.toLowerCase());

    if (!card) {
      throw new ValidationError('Unsupported gift card type');
    }

    const rate = card.rates[currency.toLowerCase()];
    if (!rate) {
      throw new ValidationError(`Currency ${currency} not supported for ${card.name}`);
    }

    return {
      cardType: card.id,
      cardName: card.name,
      currency,
      rate: rate.rate,
      minAmount: rate.min,
      maxAmount: rate.max
    };
  }

  /**
   * Calculate payout for gift card
   */
  static calculatePayout(cardType, amount, currency = 'usd') {
    const rateInfo = this.getCardRate(cardType, currency);

    if (amount < rateInfo.minAmount || amount > rateInfo.maxAmount) {
      throw new ValidationError(
        `Amount must be between ${rateInfo.minAmount} and ${rateInfo.maxAmount} ${currency.toUpperCase()}`
      );
    }

    const ngnAmount = amount * rateInfo.rate;

    return {
      cardType: rateInfo.cardType,
      cardName: rateInfo.cardName,
      cardAmount: amount,
      cardCurrency: currency.toUpperCase(),
      rate: rateInfo.rate,
      ngnAmount,
      fee: 0 // Can add processing fee here
    };
  }

  /**
   * Submit gift card for redemption
   */
  static async submitGiftcard(userId, cardData) {
    const { cardType, amount, currency = 'usd', cardCode, cardPin, images = [] } = cardData;

    // Calculate payout
    const calculation = this.calculatePayout(cardType, amount, currency);

    // Create gift card transaction (pending verification)
    const giftcardId = uuidv4();
    const giftcard = {
      id: giftcardId,
      reference: generateReference('GC'),
      userId,
      cardType: calculation.cardType,
      cardName: calculation.cardName,
      cardAmount: amount,
      cardCurrency: currency.toUpperCase(),
      cardCode: cardCode ? this.maskCardCode(cardCode) : null,
      cardPin: cardPin ? '****' : null,
      rawCardCode: cardCode, // In production, encrypt this
      rawCardPin: cardPin,   // In production, encrypt this
      images,
      rate: calculation.rate,
      ngnAmount: calculation.ngnAmount,
      status: TRANSACTION_STATUS.PENDING,
      verificationNote: null,
      verifiedAt: null,
      verifiedBy: null
    };

    db.create('giftcards', giftcardId, giftcard);

    return {
      giftcard: this.sanitizeGiftcard(giftcard),
      calculation
    };
  }

  /**
   * Verify and complete gift card (admin function)
   */
  static async verifyGiftcard(giftcardId, approved, note = '', adminId) {
    const giftcard = db.findById('giftcards', giftcardId);
    if (!giftcard) {
      throw new NotFoundError('Gift card transaction not found');
    }

    if (giftcard.status !== TRANSACTION_STATUS.PENDING) {
      throw new ValidationError('Gift card has already been processed');
    }

    if (approved) {
      // Credit user's NGN wallet
      const { transaction } = await WalletService.credit(
        giftcard.userId,
        giftcard.ngnAmount,
        'NGN',
        `Gift card redemption - ${giftcard.cardName}`,
        { giftcardId, cardType: giftcard.cardType }
      );

      db.update('giftcards', giftcardId, {
        status: TRANSACTION_STATUS.COMPLETED,
        verificationNote: note,
        verifiedAt: new Date(),
        verifiedBy: adminId,
        transactionId: transaction.id
      });
    } else {
      db.update('giftcards', giftcardId, {
        status: TRANSACTION_STATUS.FAILED,
        verificationNote: note,
        verifiedAt: new Date(),
        verifiedBy: adminId
      });
    }

    return this.sanitizeGiftcard(db.findById('giftcards', giftcardId));
  }

  /**
   * Get user's gift card history
   */
  static getGiftcardHistory(userId, options = {}) {
    const { status, cardType, limit = 50, offset = 0 } = options;

    let giftcards = db.findMany('giftcards', (g) => g.userId === userId);

    if (status) {
      giftcards = giftcards.filter(g => g.status === status);
    }

    if (cardType) {
      giftcards = giftcards.filter(g => g.cardType === cardType.toLowerCase());
    }

    giftcards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      giftcards: giftcards.slice(offset, offset + limit).map(g => this.sanitizeGiftcard(g)),
      total: giftcards.length
    };
  }

  /**
   * Get gift card by ID
   */
  static getGiftcardById(giftcardId) {
    const giftcard = db.findById('giftcards', giftcardId);
    if (!giftcard) {
      throw new NotFoundError('Gift card transaction not found');
    }
    return this.sanitizeGiftcard(giftcard);
  }

  /**
   * Mask card code for display
   */
  static maskCardCode(code) {
    if (!code || code.length < 8) return '****';
    return code.slice(0, 4) + '****' + code.slice(-4);
  }

  /**
   * Remove sensitive data
   */
  static sanitizeGiftcard(giftcard) {
    const { rawCardCode, rawCardPin, ...safe } = giftcard;
    return safe;
  }

  /**
   * Get pending gift cards (admin)
   */
  static getPendingGiftcards(options = {}) {
    const { limit = 50, offset = 0 } = options;

    let giftcards = db.findMany('giftcards', (g) => g.status === TRANSACTION_STATUS.PENDING);
    giftcards.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // Oldest first

    return {
      giftcards: giftcards.slice(offset, offset + limit),
      total: giftcards.length
    };
  }
}

module.exports = GiftcardService;
