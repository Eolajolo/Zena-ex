const express = require('express');
const router = express.Router();
const walletController = require('./wallet.controller');
const { authenticate } = require('../auth/auth.middleware');

// All routes require authentication
router.use(authenticate);

// GET /api/wallet - Get user's wallets
router.get('/', walletController.getWallets);

// GET /api/wallet/balances - Get all balances
router.get('/balances', walletController.getAllBalances);

// GET /api/wallet/balance/:currency - Get specific wallet balance
router.get('/balance/:currency', walletController.getBalance);

// POST /api/wallet/create - Create a new wallet
router.post('/create', walletController.createWallet);

// GET /api/wallet/transactions - Get transactions
router.get('/transactions', walletController.getTransactions);

// GET /api/wallet/transactions/:id - Get transaction by ID
router.get('/transactions/:id', walletController.getTransactionById);

module.exports = router;
