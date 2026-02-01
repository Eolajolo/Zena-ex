const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const { authenticate, requireKycLevel } = require('../auth/auth.middleware');
const { rateLimiters } = require('../../shared/middleware');

// ==========================================
// Public Routes
// ==========================================

// General billers and banks
router.get('/billers', paymentController.getBillers);
router.get('/banks', paymentController.getBanks);

// Airtime providers (public for app to show options before login)
router.get('/airtime/providers', paymentController.getAirtimeProviders);

// Data providers and bundles (public for app to show options before login)
router.get('/data/providers', paymentController.getDataProviders);
router.get('/data/bundles/:providerCode', paymentController.getDataBundles);

// ==========================================
// Protected Routes
// ==========================================

router.use(authenticate);

// ==========================================
// Airtime Routes
// ==========================================

// Phone validation and recent numbers
router.post('/airtime/validate-phone', paymentController.validateAirtimePhone);
router.get('/airtime/recent', paymentController.getRecentAirtimeNumbers);

// Airtime purchase flow
router.post('/airtime/initiate', rateLimiters.transactions, paymentController.initiateAirtimePurchase);
router.post('/airtime/purchase', rateLimiters.transactions, paymentController.purchaseAirtime);

// Airtime transaction history
router.get('/airtime/transactions', paymentController.getAirtimeHistory);
router.get('/airtime/transactions/:transactionId', paymentController.getAirtimeTransaction);
router.get('/airtime/transactions/:transactionId/receipt', paymentController.getAirtimeReceipt);
router.post('/airtime/transactions/:transactionId/redo', paymentController.redoAirtimeTransaction);
router.post('/airtime/transactions/:transactionId/report', paymentController.reportAirtimeIssue);

// ==========================================
// Data (Mobile Data) Routes
// ==========================================

// Phone validation and recent numbers
router.post('/data/validate-phone', paymentController.validateDataPhone);
router.get('/data/recent', paymentController.getRecentDataNumbers);

// Beneficiaries
router.get('/data/beneficiaries', paymentController.getDataBeneficiaries);
router.post('/data/beneficiaries', paymentController.addDataBeneficiary);

// Data purchase flow
router.post('/data/initiate', rateLimiters.transactions, paymentController.initiateDataPurchase);
router.post('/data/purchase', rateLimiters.transactions, paymentController.purchaseData);

// Data transaction history
router.get('/data/transactions', paymentController.getDataHistory);
router.get('/data/transactions/:transactionId', paymentController.getDataTransaction);
router.get('/data/transactions/:transactionId/receipt', paymentController.getDataReceipt);
router.post('/data/transactions/:transactionId/redo', paymentController.redoDataTransaction);
router.post('/data/transactions/:transactionId/report', paymentController.reportDataIssue);

// ==========================================
// Unified Bills Transaction Routes
// ==========================================

// All bills transaction history
router.get('/bills/transactions', paymentController.getAllBillsHistory);
router.get('/bills/transactions/:transactionId', paymentController.getBillTransaction);
router.get('/bills/transactions/:transactionId/receipt', paymentController.getBillReceipt);
router.post('/bills/transactions/:transactionId/report', paymentController.reportBillIssue);

// Issue management
router.get('/bills/issue-types', paymentController.getIssueTypes);
router.get('/bills/issues', paymentController.getUserIssues);
router.get('/bills/issues/:issueId', paymentController.getIssueDetails);

// Legacy bill payment (generic)
router.post('/bills', rateLimiters.transactions, paymentController.payBill);
router.get('/bills/history', paymentController.getBillHistory);

// ==========================================
// Transfer Routes
// ==========================================

// Transfer to Zena user
router.post('/transfer/user', rateLimiters.transactions, paymentController.transferToUser);

// Transfer to bank
router.post('/transfer/bank', rateLimiters.transactions, paymentController.transferToBank);

// Transfer history
router.get('/transfers', paymentController.getTransferHistory);

// ==========================================
// Provider Health Routes (Admin)
// ==========================================

router.get('/providers/health', paymentController.getProviderHealth);
router.post('/providers/:providerId/toggle', paymentController.toggleProvider);

module.exports = router;
