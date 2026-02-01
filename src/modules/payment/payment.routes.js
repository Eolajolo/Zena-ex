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
// Betting Routes
// ==========================================

// Providers and validation
router.get('/betting/providers', paymentController.getBettingProviders);
router.post('/betting/validate', paymentController.validateBettingCustomer);

// Beneficiaries
router.get('/betting/beneficiaries', paymentController.getBettingBeneficiaries);
router.post('/betting/beneficiaries', paymentController.addBettingBeneficiary);

// Betting wallet funding flow
router.post('/betting/initiate', rateLimiters.transactions, paymentController.initiateBettingPurchase);
router.post('/betting/purchase', rateLimiters.transactions, paymentController.purchaseBetting);

// Betting transaction history
router.get('/betting/recent', paymentController.getRecentBettingTransactions);
router.get('/betting/transactions', paymentController.getBettingHistory);
router.get('/betting/transactions/:transactionId', paymentController.getBettingTransaction);
router.get('/betting/transactions/:transactionId/receipt', paymentController.getBettingReceipt);
router.post('/betting/transactions/:transactionId/redo', paymentController.redoBettingTransaction);
router.post('/betting/transactions/:transactionId/report', paymentController.reportBettingIssue);

// ==========================================
// Electricity Routes
// ==========================================

// Providers and validation
router.get('/electricity/providers', paymentController.getElectricityProviders);
router.post('/electricity/validate', paymentController.validateElectricityCustomer);

// Beneficiaries
router.get('/electricity/beneficiaries', paymentController.getElectricityBeneficiaries);
router.post('/electricity/beneficiaries', paymentController.addElectricityBeneficiary);

// Electricity purchase flow
router.post('/electricity/initiate', rateLimiters.transactions, paymentController.initiateElectricityPurchase);
router.post('/electricity/purchase', rateLimiters.transactions, paymentController.purchaseElectricity);

// Electricity transaction history
router.get('/electricity/recent', paymentController.getRecentElectricityTransactions);
router.get('/electricity/transactions', paymentController.getElectricityHistory);
router.get('/electricity/transactions/:transactionId', paymentController.getElectricityTransaction);
router.get('/electricity/transactions/:transactionId/receipt', paymentController.getElectricityReceipt);
router.post('/electricity/transactions/:transactionId/redo', paymentController.redoElectricityTransaction);
router.post('/electricity/transactions/:transactionId/report', paymentController.reportElectricityIssue);

// ==========================================
// Cable TV Routes
// ==========================================

// Providers, packages and validation
router.get('/tv/providers', paymentController.getTvProviders);
router.get('/tv/packages/:providerCode', paymentController.getTvPackages);
router.post('/tv/validate', paymentController.validateTvCustomer);

// Beneficiaries
router.get('/tv/beneficiaries', paymentController.getTvBeneficiaries);
router.post('/tv/beneficiaries', paymentController.addTvBeneficiary);

// TV subscription flow
router.post('/tv/initiate', rateLimiters.transactions, paymentController.initiateTvPurchase);
router.post('/tv/purchase', rateLimiters.transactions, paymentController.purchaseTv);

// TV transaction history
router.get('/tv/recent', paymentController.getRecentTvTransactions);
router.get('/tv/transactions', paymentController.getTvHistory);
router.get('/tv/transactions/:transactionId', paymentController.getTvTransaction);
router.get('/tv/transactions/:transactionId/receipt', paymentController.getTvReceipt);
router.post('/tv/transactions/:transactionId/redo', paymentController.redoTvTransaction);
router.post('/tv/transactions/:transactionId/report', paymentController.reportTvIssue);

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
// Withdrawal/Payout Routes
// ==========================================

// Countries and payout options
router.get('/withdrawal/countries', paymentController.getWithdrawalCountries);
router.get('/withdrawal/countries/:countryCode/options', paymentController.getWithdrawalOptions);
router.get('/withdrawal/banks', paymentController.getWithdrawalBanks);
router.get('/withdrawal/mobile-wallets', paymentController.getWithdrawalMobileWallets);

// Account validation
router.post('/withdrawal/validate-bank', paymentController.validateWithdrawalBankAccount);
router.post('/withdrawal/validate-wallet', paymentController.validateWithdrawalMobileWallet);

// Recent recipients
router.get('/withdrawal/recipients', paymentController.getWithdrawalRecipients);

// Withdrawal flow
router.post('/withdrawal/initiate', rateLimiters.transactions, paymentController.initiateWithdrawal);
router.post('/withdrawal/confirm', rateLimiters.transactions, paymentController.confirmWithdrawal);

// Withdrawal transaction history
router.get('/withdrawal/transactions', paymentController.getWithdrawalHistory);
router.get('/withdrawal/transactions/:transactionId', paymentController.getWithdrawalTransaction);
router.get('/withdrawal/transactions/:transactionId/receipt', paymentController.getWithdrawalReceipt);
router.post('/withdrawal/transactions/:transactionId/redo', paymentController.redoWithdrawal);
router.post('/withdrawal/transactions/:transactionId/report', paymentController.reportWithdrawalIssue);

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
