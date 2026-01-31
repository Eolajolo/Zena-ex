const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const WalletService = require('../wallet/wallet.service');
const { NotFoundError, ValidationError, InsufficientBalanceError } = require('../../shared/middleware');
const { TRANSACTION_STATUS, BILL_CATEGORIES } = require('../../shared/constants');
const { generateReference } = require('../../shared/utils');

class PaymentService {
  /**
   * Pay a bill (airtime, data, electricity, etc.)
   */
  static async payBill(userId, billData) {
    const { category, billerCode, amount, accountNumber, metadata = {} } = billData;

    // Validate category
    if (!Object.values(BILL_CATEGORIES).includes(category)) {
      throw new ValidationError('Invalid bill category');
    }

    // Check balance and debit wallet
    const { wallet, transaction } = await WalletService.debit(
      userId,
      amount,
      'NGN',
      `Bill payment - ${category}`,
      { category, billerCode, accountNumber, ...metadata }
    );

    // Create bill payment record
    const billId = uuidv4();
    const bill = {
      id: billId,
      reference: generateReference('BILL'),
      userId,
      category,
      billerCode,
      amount,
      accountNumber,
      status: TRANSACTION_STATUS.COMPLETED, // In production, this would be PENDING until confirmed
      transactionId: transaction.id,
      metadata
    };

    db.create('bills', billId, bill);

    return { bill, transaction };
  }

  /**
   * Transfer to another user
   */
  static async transferToUser(fromUserId, toUsername, amount, note = '') {
    // Find recipient
    const toUser = db.findOne('users', (u) =>
      u.username.toLowerCase() === toUsername.replace('@', '').toLowerCase()
    );

    if (!toUser) {
      throw new NotFoundError('Recipient not found');
    }

    if (toUser.id === fromUserId) {
      throw new ValidationError('Cannot transfer to yourself');
    }

    // Debit sender
    const { transaction: debitTxn } = await WalletService.debit(
      fromUserId,
      amount,
      'NGN',
      `Transfer to @${toUser.username}`,
      { recipientId: toUser.id, note }
    );

    // Credit recipient
    const { transaction: creditTxn } = await WalletService.credit(
      toUser.id,
      amount,
      'NGN',
      `Transfer from @${db.findById('users', fromUserId).username}`,
      { senderId: fromUserId, note }
    );

    // Create transfer record
    const transferId = uuidv4();
    const transfer = {
      id: transferId,
      reference: generateReference('TRF'),
      fromUserId,
      toUserId: toUser.id,
      amount,
      currency: 'NGN',
      note,
      status: TRANSACTION_STATUS.COMPLETED,
      debitTransactionId: debitTxn.id,
      creditTransactionId: creditTxn.id
    };

    db.create('transfers', transferId, transfer);

    return { transfer, transaction: debitTxn };
  }

  /**
   * Transfer to bank account
   */
  static async transferToBank(userId, bankData) {
    const { bankCode, accountNumber, accountName, amount, narration = '' } = bankData;

    // Debit wallet
    const { wallet, transaction } = await WalletService.debit(
      userId,
      amount,
      'NGN',
      `Bank transfer to ${accountName}`,
      { bankCode, accountNumber, narration }
    );

    // Create withdrawal record
    const withdrawalId = uuidv4();
    const withdrawal = {
      id: withdrawalId,
      reference: generateReference('WTH'),
      userId,
      bankCode,
      accountNumber,
      accountName,
      amount,
      narration,
      status: TRANSACTION_STATUS.PROCESSING, // Bank transfers need processing
      transactionId: transaction.id
    };

    db.create('withdrawals', withdrawalId, withdrawal);

    return { withdrawal, transaction };
  }

  /**
   * Get bill payment history
   */
  static getBillHistory(userId, options = {}) {
    const { category, limit = 50, offset = 0 } = options;

    let bills = db.findMany('bills', (b) => b.userId === userId);

    if (category) {
      bills = bills.filter(b => b.category === category);
    }

    bills.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      bills: bills.slice(offset, offset + limit),
      total: bills.length
    };
  }

  /**
   * Get transfer history
   */
  static getTransferHistory(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const transfers = db.findMany('transfers', (t) =>
      t.fromUserId === userId || t.toUserId === userId
    );

    transfers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      transfers: transfers.slice(offset, offset + limit),
      total: transfers.length
    };
  }

  /**
   * Get supported billers
   */
  static getBillers(category) {
    // Mock billers - in production, fetch from provider API
    const billers = {
      [BILL_CATEGORIES.AIRTIME]: [
        { code: 'MTN', name: 'MTN Nigeria', logo: 'mtn.png' },
        { code: 'GLO', name: 'Glo Nigeria', logo: 'glo.png' },
        { code: 'AIRTEL', name: 'Airtel Nigeria', logo: 'airtel.png' },
        { code: '9MOBILE', name: '9mobile', logo: '9mobile.png' }
      ],
      [BILL_CATEGORIES.DATA]: [
        { code: 'MTN_DATA', name: 'MTN Data', logo: 'mtn.png' },
        { code: 'GLO_DATA', name: 'Glo Data', logo: 'glo.png' },
        { code: 'AIRTEL_DATA', name: 'Airtel Data', logo: 'airtel.png' }
      ],
      [BILL_CATEGORIES.ELECTRICITY]: [
        { code: 'IKEDC', name: 'Ikeja Electric', logo: 'ikedc.png' },
        { code: 'EKEDC', name: 'Eko Electric', logo: 'ekedc.png' },
        { code: 'AEDC', name: 'Abuja Electric', logo: 'aedc.png' }
      ],
      [BILL_CATEGORIES.TV]: [
        { code: 'DSTV', name: 'DSTV', logo: 'dstv.png' },
        { code: 'GOTV', name: 'GOtv', logo: 'gotv.png' },
        { code: 'STARTIMES', name: 'StarTimes', logo: 'startimes.png' }
      ]
    };

    if (category) {
      return billers[category] || [];
    }

    return billers;
  }

  /**
   * Get supported banks
   */
  static getBanks() {
    // Mock banks - in production, fetch from provider API
    return [
      { code: '044', name: 'Access Bank' },
      { code: '023', name: 'Citibank' },
      { code: '050', name: 'Ecobank' },
      { code: '070', name: 'Fidelity Bank' },
      { code: '011', name: 'First Bank' },
      { code: '214', name: 'First City Monument Bank' },
      { code: '058', name: 'GTBank' },
      { code: '030', name: 'Heritage Bank' },
      { code: '301', name: 'Jaiz Bank' },
      { code: '082', name: 'Keystone Bank' },
      { code: '526', name: 'Parallex Bank' },
      { code: '076', name: 'Polaris Bank' },
      { code: '101', name: 'Providus Bank' },
      { code: '221', name: 'Stanbic IBTC Bank' },
      { code: '068', name: 'Standard Chartered Bank' },
      { code: '232', name: 'Sterling Bank' },
      { code: '100', name: 'Suntrust Bank' },
      { code: '032', name: 'Union Bank' },
      { code: '033', name: 'United Bank for Africa' },
      { code: '215', name: 'Unity Bank' },
      { code: '035', name: 'Wema Bank' },
      { code: '057', name: 'Zenith Bank' }
    ];
  }
}

module.exports = PaymentService;
