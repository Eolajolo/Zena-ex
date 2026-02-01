const PaymentService = require('./payment.service');
const AirtimeService = require('./airtime.service');
const DataService = require('./data.service');
const BillsTransactionService = require('./bills.transaction.service');
const ProviderService = require('./provider.service');
const { logger } = require('../../shared/utils');

// ==========================================
// Airtime Endpoints
// ==========================================

/**
 * Get airtime providers
 * GET /api/payment/airtime/providers
 */
const getAirtimeProviders = async (req, res, next) => {
  try {
    const providers = AirtimeService.getProviders();
    const amountOptions = AirtimeService.getAmountOptions();

    res.status(200).json({
      success: true,
      data: {
        providers,
        ...amountOptions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate phone number and detect provider
 * POST /api/payment/airtime/validate-phone
 */
const validateAirtimePhone = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    const result = AirtimeService.validatePhoneNumber(phoneNumber);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent phone numbers for airtime
 * GET /api/payment/airtime/recent
 */
const getRecentAirtimeNumbers = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const recentNumbers = AirtimeService.getRecentPhoneNumbers(req.user.id, limit);
    const recentTransactions = AirtimeService.getRecentTransactions(req.user.id, limit);

    res.status(200).json({
      success: true,
      data: {
        recentNumbers,
        recentTransactions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate airtime purchase (get preview)
 * POST /api/payment/airtime/initiate
 */
const initiateAirtimePurchase = async (req, res, next) => {
  try {
    const { phoneNumber, providerCode, amount } = req.body;

    const preview = await AirtimeService.initiateAirtimePurchase(req.user.id, {
      phoneNumber,
      providerCode,
      amount
    });

    logger.info('Airtime purchase initiated', {
      userId: req.user.id,
      amount,
      provider: preview.provider.code
    });

    res.status(200).json({
      success: true,
      message: 'Review your transaction details',
      data: preview
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm and execute airtime purchase
 * POST /api/payment/airtime/purchase
 */
const purchaseAirtime = async (req, res, next) => {
  try {
    const { previewToken, transactionPin } = req.body;

    const result = await AirtimeService.purchaseAirtime(
      req.user.id,
      previewToken,
      transactionPin
    );

    logger.info('Airtime purchase completed', {
      userId: req.user.id,
      transactionId: result.transaction.id,
      success: result.success
    });

    res.status(200).json({
      success: result.success,
      message: result.message,
      data: result.transaction
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get airtime transaction history
 * GET /api/payment/airtime/transactions
 */
const getAirtimeHistory = async (req, res, next) => {
  try {
    const { provider, status, search, startDate, endDate, limit, offset } = req.query;

    const result = AirtimeService.getTransactionHistory(req.user.id, {
      providerCode: provider,
      status,
      search,
      startDate,
      endDate,
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
 * Get single airtime transaction details
 * GET /api/payment/airtime/transactions/:transactionId
 */
const getAirtimeTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const transaction = AirtimeService.getTransactionDetails(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate airtime transaction receipt
 * GET /api/payment/airtime/transactions/:transactionId/receipt
 */
const getAirtimeReceipt = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const receipt = AirtimeService.generateReceipt(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Redo an airtime transaction
 * POST /api/payment/airtime/transactions/:transactionId/redo
 */
const redoAirtimeTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const preview = await AirtimeService.redoTransaction(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      message: 'Transaction ready to redo',
      data: preview
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Report issue with airtime transaction
 * POST /api/payment/airtime/transactions/:transactionId/report
 */
const reportAirtimeIssue = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { type, description } = req.body;

    const result = AirtimeService.reportIssue(req.user.id, transactionId, {
      type,
      description
    });

    logger.info('Airtime issue reported', {
      userId: req.user.id,
      transactionId,
      issueId: result.issueId
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Data (Mobile Data) Endpoints
// ==========================================

/**
 * Get data providers and bundles
 * GET /api/payment/data/providers
 */
const getDataProviders = async (req, res, next) => {
  try {
    const providers = DataService.getProviders();
    const categories = DataService.getCategories();

    res.status(200).json({
      success: true,
      data: {
        providers,
        categories
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get data bundles for a provider
 * GET /api/payment/data/bundles/:providerCode
 */
const getDataBundles = async (req, res, next) => {
  try {
    const { providerCode } = req.params;
    const { category } = req.query;

    const bundles = DataService.getBundles(providerCode, category);

    res.status(200).json({
      success: true,
      data: bundles
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate phone number for data
 * POST /api/payment/data/validate-phone
 */
const validateDataPhone = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    const result = DataService.validatePhoneNumber(phoneNumber);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent phone numbers and transactions for data
 * GET /api/payment/data/recent
 */
const getRecentDataNumbers = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const recentNumbers = DataService.getRecentPhoneNumbers(req.user.id, limit);
    const recentTransactions = DataService.getRecentTransactions(req.user.id, limit);

    res.status(200).json({
      success: true,
      data: {
        recentNumbers,
        recentTransactions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get data beneficiaries
 * GET /api/payment/data/beneficiaries
 */
const getDataBeneficiaries = async (req, res, next) => {
  try {
    const { search } = req.query;
    const beneficiaries = DataService.getBeneficiaries(req.user.id, search);

    res.status(200).json({
      success: true,
      data: { beneficiaries }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add data beneficiary
 * POST /api/payment/data/beneficiaries
 */
const addDataBeneficiary = async (req, res, next) => {
  try {
    const { phoneNumber, name } = req.body;
    const beneficiary = DataService.addBeneficiary(req.user.id, phoneNumber, name);

    res.status(201).json({
      success: true,
      message: 'Beneficiary added',
      data: beneficiary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate data purchase (get preview)
 * POST /api/payment/data/initiate
 */
const initiateDataPurchase = async (req, res, next) => {
  try {
    const { phoneNumber, providerCode, bundleCode } = req.body;

    const preview = await DataService.initiateDataPurchase(req.user.id, {
      phoneNumber,
      providerCode,
      bundleCode
    });

    logger.info('Data purchase initiated', {
      userId: req.user.id,
      bundle: preview.bundle.code,
      provider: preview.provider.code
    });

    res.status(200).json({
      success: true,
      message: 'Review your transaction details',
      data: preview
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm and execute data purchase
 * POST /api/payment/data/purchase
 */
const purchaseData = async (req, res, next) => {
  try {
    const { previewToken, transactionPin, biometricToken } = req.body;

    const result = await DataService.purchaseData(
      req.user.id,
      previewToken,
      transactionPin,
      biometricToken
    );

    logger.info('Data purchase completed', {
      userId: req.user.id,
      transactionId: result.transaction.id,
      success: result.success
    });

    res.status(200).json({
      success: result.success,
      message: result.message,
      data: result.transaction
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get data transaction history
 * GET /api/payment/data/transactions
 */
const getDataHistory = async (req, res, next) => {
  try {
    const { provider, status, search, startDate, endDate, limit, offset } = req.query;

    const result = DataService.getTransactionHistory(req.user.id, {
      providerCode: provider,
      status,
      search,
      startDate,
      endDate,
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
 * Get single data transaction details
 * GET /api/payment/data/transactions/:transactionId
 */
const getDataTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const transaction = DataService.getTransactionDetails(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate data transaction receipt
 * GET /api/payment/data/transactions/:transactionId/receipt
 */
const getDataReceipt = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const receipt = DataService.generateReceipt(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Redo a data transaction
 * POST /api/payment/data/transactions/:transactionId/redo
 */
const redoDataTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const preview = await DataService.redoTransaction(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      message: 'Transaction ready to redo',
      data: preview
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Report issue with data transaction
 * POST /api/payment/data/transactions/:transactionId/report
 */
const reportDataIssue = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { type, description } = req.body;

    const result = DataService.reportIssue(req.user.id, transactionId, {
      type,
      description
    });

    logger.info('Data issue reported', {
      userId: req.user.id,
      transactionId,
      issueId: result.issueId
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Unified Bills Transaction Endpoints
// ==========================================

/**
 * Get all bills transaction history
 * GET /api/payment/bills/transactions
 */
const getAllBillsHistory = async (req, res, next) => {
  try {
    const { category, status, search, startDate, endDate, limit, offset } = req.query;

    const result = BillsTransactionService.getAllBillsHistory(req.user.id, {
      category,
      status,
      search,
      startDate,
      endDate,
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
 * Get single transaction details
 * GET /api/payment/bills/transactions/:transactionId
 */
const getBillTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const transaction = BillsTransactionService.getTransactionDetails(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate transaction receipt
 * GET /api/payment/bills/transactions/:transactionId/receipt
 */
const getBillReceipt = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const receipt = BillsTransactionService.generateReceipt(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Report issue with any bill transaction
 * POST /api/payment/bills/transactions/:transactionId/report
 */
const reportBillIssue = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { type, description, contactMethod } = req.body;

    const result = BillsTransactionService.reportIssue(req.user.id, transactionId, {
      type,
      description,
      contactMethod
    });

    logger.info('Bill issue reported', {
      userId: req.user.id,
      transactionId,
      issueId: result.issueId
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
 * Get issue types
 * GET /api/payment/bills/issue-types
 */
const getIssueTypes = async (req, res, next) => {
  try {
    const issueTypes = BillsTransactionService.getIssueTypes();

    res.status(200).json({
      success: true,
      data: { issueTypes }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's reported issues
 * GET /api/payment/bills/issues
 */
const getUserIssues = async (req, res, next) => {
  try {
    const { status, limit, offset } = req.query;

    const result = BillsTransactionService.getUserIssues(req.user.id, {
      status,
      limit: parseInt(limit) || 20,
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
 * Get single issue details
 * GET /api/payment/bills/issues/:issueId
 */
const getIssueDetails = async (req, res, next) => {
  try {
    const { issueId } = req.params;
    const issue = BillsTransactionService.getIssueDetails(req.user.id, issueId);

    res.status(200).json({
      success: true,
      data: issue
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Provider Health Endpoints (Admin)
// ==========================================

/**
 * Get provider health dashboard
 * GET /api/payment/providers/health
 */
const getProviderHealth = async (req, res, next) => {
  try {
    const dashboard = ProviderService.getHealthDashboard();

    res.status(200).json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle provider enabled status
 * POST /api/payment/providers/:providerId/toggle
 */
const toggleProvider = async (req, res, next) => {
  try {
    const { providerId } = req.params;
    const { enabled } = req.body;

    const result = ProviderService.setProviderEnabled(providerId, enabled);

    logger.info('Provider toggled', {
      providerId,
      enabled,
      adminId: req.user.id
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Legacy/General Endpoints
// ==========================================

/**
 * Pay a bill (generic)
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
 * Get bill history (legacy)
 * GET /api/payment/bills/history
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
  // Airtime
  getAirtimeProviders,
  validateAirtimePhone,
  getRecentAirtimeNumbers,
  initiateAirtimePurchase,
  purchaseAirtime,
  getAirtimeHistory,
  getAirtimeTransaction,
  getAirtimeReceipt,
  redoAirtimeTransaction,
  reportAirtimeIssue,

  // Data (Mobile Data)
  getDataProviders,
  getDataBundles,
  validateDataPhone,
  getRecentDataNumbers,
  getDataBeneficiaries,
  addDataBeneficiary,
  initiateDataPurchase,
  purchaseData,
  getDataHistory,
  getDataTransaction,
  getDataReceipt,
  redoDataTransaction,
  reportDataIssue,

  // Unified Bills
  getAllBillsHistory,
  getBillTransaction,
  getBillReceipt,
  reportBillIssue,
  getIssueTypes,
  getUserIssues,
  getIssueDetails,

  // Provider Health
  getProviderHealth,
  toggleProvider,

  // Legacy/General
  payBill,
  transferToUser,
  transferToBank,
  getBillHistory,
  getTransferHistory,
  getBillers,
  getBanks
};
