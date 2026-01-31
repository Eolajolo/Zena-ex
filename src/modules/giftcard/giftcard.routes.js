const express = require('express');
const router = express.Router();
const giftcardController = require('./giftcard.controller');
const { authenticate } = require('../auth/auth.middleware');
const { rateLimiters } = require('../../shared/middleware');

// Public routes
router.get('/cards', giftcardController.getSupportedCards);
router.get('/rates/:cardType', giftcardController.getCardRate);

// Protected routes
router.use(authenticate);

// Calculate payout
router.post('/calculate', giftcardController.calculatePayout);

// Submit gift card
router.post('/submit', rateLimiters.transactions, giftcardController.submitGiftcard);

// History
router.get('/history', giftcardController.getGiftcardHistory);
router.get('/:id', giftcardController.getGiftcardById);

// Admin routes (in production, add admin middleware)
router.get('/admin/pending', giftcardController.getPendingGiftcards);
router.post('/:id/verify', giftcardController.verifyGiftcard);

module.exports = router;
