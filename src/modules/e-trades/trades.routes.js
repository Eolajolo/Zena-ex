const express = require('express');
const router = express.Router();
const tradesController = require('./trades.controller');
const { authenticate } = require('../auth/auth.middleware');
const { rateLimiters } = require('../../shared/middleware');

// Public routes
router.get('/rates', tradesController.getRates);
router.get('/rates/:crypto', tradesController.getRate);
router.get('/cryptos', tradesController.getSupportedCryptos);

// Protected routes
router.use(authenticate);

// Calculate trade (preview)
router.post('/calculate', tradesController.calculateTrade);

// Execute trades
router.post('/buy', rateLimiters.transactions, tradesController.buyCrypto);
router.post('/sell', rateLimiters.transactions, tradesController.sellCrypto);

// Trade history
router.get('/history', tradesController.getTradeHistory);
router.get('/orders/:id', tradesController.getOrderById);

module.exports = router;
