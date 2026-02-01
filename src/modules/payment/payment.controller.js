const PaymentService = require('./payment.service');
const AirtimeService = require('./airtime.service');
const DataService = require('./data.service');
const GenericBillsService = require('./generic-bills.service');
const BillsTransactionService = require('./bills.transaction.service');
const ProviderService = require('./provider.service');
const WithdrawalService = require('./withdrawal.service');
const { logger } = require('../../shared/utils');
const { BILL_CATEGORIES } = require('../../shared/constants');

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

// ==========================================
// Generic Bills Endpoints (Betting, Electricity, Cable TV)
// ==========================================

/**
 * Factory function to create bill type handlers
 * This reduces code duplication for similar bill types
 */
const createBillTypeHandlers = (billType) => ({
  /**
   * Get providers for bill type
   */
  getProviders: async (req, res, next) => {
    try {
      const info = GenericBillsService.getBillTypeInfo(billType);

      res.status(200).json({
        success: true,
        data: info
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get packages for a provider (TV only)
   */
  getPackages: async (req, res, next) => {
    try {
      const { providerCode } = req.params;
      const packages = GenericBillsService.getPackages(billType, providerCode);

      res.status(200).json({
        success: true,
        data: { packages }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Validate customer
   */
  validateCustomer: async (req, res, next) => {
    try {
      const { customerId, providerCode, meterType } = req.body;
      const result = await GenericBillsService.validateCustomer(
        billType,
        providerCode,
        customerId,
        { meterType }
      );

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get beneficiaries
   */
  getBeneficiaries: async (req, res, next) => {
    try {
      const { search } = req.query;
      const beneficiaries = GenericBillsService.getBeneficiaries(billType, req.user.id, search);

      res.status(200).json({
        success: true,
        data: { beneficiaries }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Add beneficiary
   */
  addBeneficiary: async (req, res, next) => {
    try {
      const { customerId, customerName, providerCode } = req.body;
      const provider = GenericBillsService.getProvider(billType, providerCode);
      const beneficiary = GenericBillsService.addBeneficiary(
        billType,
        req.user.id,
        customerId,
        customerName,
        provider
      );

      res.status(201).json({
        success: true,
        message: 'Beneficiary added',
        data: beneficiary
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Initiate purchase (get preview)
   */
  initiatePurchase: async (req, res, next) => {
    try {
      const { customerId, providerCode, amount, packageCode, meterType } = req.body;

      const preview = await GenericBillsService.initiatePurchase(billType, req.user.id, {
        customerId,
        providerCode,
        amount,
        packageCode,
        meterType
      });

      logger.info(`${billType} purchase initiated`, {
        userId: req.user.id,
        provider: preview.provider.code,
        amount: preview.amount
      });

      res.status(200).json({
        success: true,
        message: 'Review your transaction details',
        data: preview
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Confirm and execute purchase
   */
  purchase: async (req, res, next) => {
    try {
      const { previewToken, transactionPin, biometricToken } = req.body;

      const result = await GenericBillsService.purchase(
        billType,
        req.user.id,
        previewToken,
        transactionPin,
        biometricToken
      );

      logger.info(`${billType} purchase completed`, {
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
  },

  /**
   * Get recent transactions
   */
  getRecentTransactions: async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 5;
      const transactions = GenericBillsService.getRecentTransactions(billType, req.user.id, limit);

      res.status(200).json({
        success: true,
        data: { transactions }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get transaction history
   */
  getTransactionHistory: async (req, res, next) => {
    try {
      const { provider, status, search, startDate, endDate, limit, offset } = req.query;

      const result = GenericBillsService.getTransactionHistory(billType, req.user.id, {
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
  },

  /**
   * Get single transaction details
   */
  getTransaction: async (req, res, next) => {
    try {
      const { transactionId } = req.params;
      const transaction = GenericBillsService.getTransactionDetails(billType, req.user.id, transactionId);

      res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Generate receipt
   */
  getReceipt: async (req, res, next) => {
    try {
      const { transactionId } = req.params;
      const receipt = GenericBillsService.generateReceipt(billType, req.user.id, transactionId);

      res.status(200).json({
        success: true,
        data: receipt
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Redo transaction
   */
  redoTransaction: async (req, res, next) => {
    try {
      const { transactionId } = req.params;
      const preview = await GenericBillsService.redoTransaction(billType, req.user.id, transactionId);

      res.status(200).json({
        success: true,
        message: 'Transaction ready to redo',
        data: preview
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Report issue
   */
  reportIssue: async (req, res, next) => {
    try {
      const { transactionId } = req.params;
      const { type, description } = req.body;

      const result = GenericBillsService.reportIssue(billType, req.user.id, transactionId, {
        type,
        description
      });

      logger.info(`${billType} issue reported`, {
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
  }
});

// Create handlers for each bill type
const bettingHandlers = createBillTypeHandlers(BILL_CATEGORIES.BETTING);

// ==========================================
// Withdrawal/Payout Endpoints
// ==========================================

/**
 * Get supported countries for withdrawal
 * GET /api/payment/withdrawal/countries
 */
const getWithdrawalCountries = async (req, res, next) => {
  try {
    const countries = WithdrawalService.getSupportedCountries();

    res.status(200).json({
      success: true,
      data: { countries }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payout options for a country (banks + mobile money)
 * GET /api/payment/withdrawal/countries/:countryCode/options
 */
const getWithdrawalOptions = async (req, res, next) => {
  try {
    const { countryCode } = req.params;
    const options = WithdrawalService.getPayoutOptions(countryCode);

    if (!options) {
      return res.status(404).json({
        success: false,
        message: 'Country not supported'
      });
    }

    res.status(200).json({
      success: true,
      data: options
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get banks for a country
 * GET /api/payment/withdrawal/banks
 */
const getWithdrawalBanks = async (req, res, next) => {
  try {
    const { countryCode, search } = req.query;
    const banks = WithdrawalService.getBanks(countryCode, search);

    res.status(200).json({
      success: true,
      data: { banks }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get mobile money providers for a country
 * GET /api/payment/withdrawal/mobile-wallets
 */
const getWithdrawalMobileWallets = async (req, res, next) => {
  try {
    const { countryCode } = req.query;
    const wallets = WithdrawalService.getMobileMoneyProviders(countryCode);

    res.status(200).json({
      success: true,
      data: { wallets }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate bank account
 * POST /api/payment/withdrawal/validate-bank
 */
const validateWithdrawalBankAccount = async (req, res, next) => {
  try {
    const { countryCode, bankCode, accountNumber } = req.body;
    const result = await WithdrawalService.validateBankAccount(countryCode, bankCode, accountNumber);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate mobile wallet
 * POST /api/payment/withdrawal/validate-wallet
 */
const validateWithdrawalMobileWallet = async (req, res, next) => {
  try {
    const { countryCode, walletProvider, phoneNumber } = req.body;
    const result = await WithdrawalService.validateMobileWallet(countryCode, walletProvider, phoneNumber);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent withdrawal recipients
 * GET /api/payment/withdrawal/recipients
 */
const getWithdrawalRecipients = async (req, res, next) => {
  try {
    const { countryCode, limit } = req.query;
    const recipients = WithdrawalService.getRecentRecipients(
      req.user.id,
      countryCode,
      parseInt(limit) || 10
    );

    res.status(200).json({
      success: true,
      data: { recipients }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate withdrawal (get preview)
 * POST /api/payment/withdrawal/initiate
 */
const initiateWithdrawal = async (req, res, next) => {
  try {
    const {
      countryCode,
      bankCode,
      walletProvider,
      accountNumber,
      phoneNumber,
      amount,
      sourceCurrency,
      narration
    } = req.body;

    // Get idempotency key from header
    const idempotencyKey = req.headers['x-idempotency-key'] || null;

    const preview = await WithdrawalService.initiateWithdrawal(req.user.id, {
      countryCode,
      bankCode,
      walletProvider,
      accountNumber,
      phoneNumber,
      amount,
      sourceCurrency,
      narration,
      deviceInfo: {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      }
    }, idempotencyKey);

    // Check if this is a duplicate request
    if (preview.isDuplicate) {
      logger.info('Duplicate withdrawal request detected', {
        userId: req.user.id,
        idempotencyKey
      });

      return res.status(200).json({
        success: true,
        message: preview.message,
        data: preview.transaction,
        isDuplicate: true
      });
    }

    logger.info('Withdrawal initiated', {
      userId: req.user.id,
      amount: preview.sourceAmount,
      currency: preview.sourceCurrency,
      country: preview.country.code
    });

    res.status(200).json({
      success: true,
      message: 'Review your withdrawal details',
      data: preview
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm and execute withdrawal
 * POST /api/payment/withdrawal/confirm
 */
const confirmWithdrawal = async (req, res, next) => {
  try {
    const { previewToken, transactionPin, biometricToken } = req.body;

    const result = await WithdrawalService.confirmWithdrawal(
      req.user.id,
      previewToken,
      transactionPin,
      biometricToken
    );

    logger.info('Withdrawal completed', {
      userId: req.user.id,
      transactionId: result.transaction.id,
      status: result.status,
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
 * Get withdrawal transaction history
 * GET /api/payment/withdrawal/transactions
 */
const getWithdrawalHistory = async (req, res, next) => {
  try {
    const { status, countryCode, search, startDate, endDate, limit, offset } = req.query;

    const result = WithdrawalService.getTransactionHistory(req.user.id, {
      status,
      countryCode,
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
 * Get single withdrawal transaction details
 * GET /api/payment/withdrawal/transactions/:transactionId
 */
const getWithdrawalTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const transaction = WithdrawalService.getTransactionDetails(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate withdrawal receipt
 * GET /api/payment/withdrawal/transactions/:transactionId/receipt
 */
const getWithdrawalReceipt = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const receipt = WithdrawalService.generateReceipt(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Redo a withdrawal
 * POST /api/payment/withdrawal/transactions/:transactionId/redo
 */
const redoWithdrawal = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const preview = await WithdrawalService.redoWithdrawal(req.user.id, transactionId);

    res.status(200).json({
      success: true,
      message: 'Withdrawal ready to redo',
      data: preview
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Report issue with withdrawal
 * POST /api/payment/withdrawal/transactions/:transactionId/report
 */
const reportWithdrawalIssue = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { type, description } = req.body;

    const result = WithdrawalService.reportIssue(req.user.id, transactionId, {
      type,
      description
    });

    logger.info('Withdrawal issue reported', {
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
const electricityHandlers = createBillTypeHandlers(BILL_CATEGORIES.ELECTRICITY);
const tvHandlers = createBillTypeHandlers(BILL_CATEGORIES.TV);

// ==========================================
// Betting Endpoints
// ==========================================
const getBettingProviders = bettingHandlers.getProviders;
const validateBettingCustomer = bettingHandlers.validateCustomer;
const getBettingBeneficiaries = bettingHandlers.getBeneficiaries;
const addBettingBeneficiary = bettingHandlers.addBeneficiary;
const initiateBettingPurchase = bettingHandlers.initiatePurchase;
const purchaseBetting = bettingHandlers.purchase;
const getRecentBettingTransactions = bettingHandlers.getRecentTransactions;
const getBettingHistory = bettingHandlers.getTransactionHistory;
const getBettingTransaction = bettingHandlers.getTransaction;
const getBettingReceipt = bettingHandlers.getReceipt;
const redoBettingTransaction = bettingHandlers.redoTransaction;
const reportBettingIssue = bettingHandlers.reportIssue;

// ==========================================
// Electricity Endpoints
// ==========================================
const getElectricityProviders = electricityHandlers.getProviders;
const validateElectricityCustomer = electricityHandlers.validateCustomer;
const getElectricityBeneficiaries = electricityHandlers.getBeneficiaries;
const addElectricityBeneficiary = electricityHandlers.addBeneficiary;
const initiateElectricityPurchase = electricityHandlers.initiatePurchase;
const purchaseElectricity = electricityHandlers.purchase;
const getRecentElectricityTransactions = electricityHandlers.getRecentTransactions;
const getElectricityHistory = electricityHandlers.getTransactionHistory;
const getElectricityTransaction = electricityHandlers.getTransaction;
const getElectricityReceipt = electricityHandlers.getReceipt;
const redoElectricityTransaction = electricityHandlers.redoTransaction;
const reportElectricityIssue = electricityHandlers.reportIssue;

// ==========================================
// Cable TV Endpoints
// ==========================================
const getTvProviders = tvHandlers.getProviders;
const getTvPackages = tvHandlers.getPackages;
const validateTvCustomer = tvHandlers.validateCustomer;
const getTvBeneficiaries = tvHandlers.getBeneficiaries;
const addTvBeneficiary = tvHandlers.addBeneficiary;
const initiateTvPurchase = tvHandlers.initiatePurchase;
const purchaseTv = tvHandlers.purchase;
const getRecentTvTransactions = tvHandlers.getRecentTransactions;
const getTvHistory = tvHandlers.getTransactionHistory;
const getTvTransaction = tvHandlers.getTransaction;
const getTvReceipt = tvHandlers.getReceipt;
const redoTvTransaction = tvHandlers.redoTransaction;
const reportTvIssue = tvHandlers.reportIssue;

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

  // Betting
  getBettingProviders,
  validateBettingCustomer,
  getBettingBeneficiaries,
  addBettingBeneficiary,
  initiateBettingPurchase,
  purchaseBetting,
  getRecentBettingTransactions,
  getBettingHistory,
  getBettingTransaction,
  getBettingReceipt,
  redoBettingTransaction,
  reportBettingIssue,

  // Electricity
  getElectricityProviders,
  validateElectricityCustomer,
  getElectricityBeneficiaries,
  addElectricityBeneficiary,
  initiateElectricityPurchase,
  purchaseElectricity,
  getRecentElectricityTransactions,
  getElectricityHistory,
  getElectricityTransaction,
  getElectricityReceipt,
  redoElectricityTransaction,
  reportElectricityIssue,

  // Cable TV
  getTvProviders,
  getTvPackages,
  validateTvCustomer,
  getTvBeneficiaries,
  addTvBeneficiary,
  initiateTvPurchase,
  purchaseTv,
  getRecentTvTransactions,
  getTvHistory,
  getTvTransaction,
  getTvReceipt,
  redoTvTransaction,
  reportTvIssue,

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

  // Withdrawal/Payout
  getWithdrawalCountries,
  getWithdrawalOptions,
  getWithdrawalBanks,
  getWithdrawalMobileWallets,
  validateWithdrawalBankAccount,
  validateWithdrawalMobileWallet,
  getWithdrawalRecipients,
  initiateWithdrawal,
  confirmWithdrawal,
  getWithdrawalHistory,
  getWithdrawalTransaction,
  getWithdrawalReceipt,
  redoWithdrawal,
  reportWithdrawalIssue,

  // Legacy/General
  payBill,
  transferToUser,
  transferToBank,
  getBillHistory,
  getTransferHistory,
  getBillers,
  getBanks
};
