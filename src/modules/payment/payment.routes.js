const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const { authenticate, requireKycLevel } = require('../auth/auth.middleware');
const { rateLimiters } = require('../../shared/middleware');

// Public routes
router.get('/billers', paymentController.getBillers);
router.get('/banks', paymentController.getBanks);

// Protected routes
router.use(authenticate);

// Bill payments
router.post('/bills', rateLimiters.transactions, paymentController.payBill);
router.get('/bills', paymentController.getBillHistory);

// Transfers
router.post('/transfer/user', rateLimiters.transactions, paymentController.transferToUser);
router.post('/transfer/bank', rateLimiters.transactions, paymentController.transferToBank);
router.get('/transfers', paymentController.getTransferHistory);

module.exports = router;
