const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { NotFoundError, ValidationError, DuplicateError } = require('../../shared/middleware');

// Nigerian Banks
const BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
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
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '999', name: 'Nedbank' }
];

class RecipientsService {
  // ==========================================
  // Bank Account Recipients
  // ==========================================

  /**
   * Get all bank recipients for a user
   */
  static getBankRecipients(userId, search = '') {
    let recipients = db.findMany('recipients', (r) =>
      r.userId === userId && r.type === 'bank' && !r.isDeleted
    );

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      recipients = recipients.filter((r) =>
        r.accountName.toLowerCase().includes(searchLower) ||
        r.accountNumber.includes(search) ||
        r.bankName.toLowerCase().includes(searchLower)
      );
    }

    // Sort by most recently used
    recipients.sort((a, b) => {
      const aDate = a.lastUsedAt || a.createdAt;
      const bDate = b.lastUsedAt || b.createdAt;
      return new Date(bDate) - new Date(aDate);
    });

    return {
      recipients: recipients.map(this.formatRecipient),
      count: recipients.length
    };
  }

  /**
   * Add a new bank recipient
   */
  static addBankRecipient(userId, data) {
    const { bankCode, accountNumber, accountName } = data;

    // Validate bank code
    const bank = BANKS.find((b) => b.code === bankCode);
    if (!bank) {
      throw new ValidationError('Invalid bank code');
    }

    // Validate account number
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new ValidationError('Account number must be 10 digits');
    }

    // Check for duplicate
    const existing = db.findOne('recipients', (r) =>
      r.userId === userId &&
      r.type === 'bank' &&
      r.bankCode === bankCode &&
      r.accountNumber === accountNumber &&
      !r.isDeleted
    );

    if (existing) {
      throw new DuplicateError('This recipient already exists');
    }

    const recipientId = uuidv4();
    const recipient = {
      id: recipientId,
      userId,
      type: 'bank',
      bankCode,
      bankName: bank.name,
      accountNumber,
      accountName: accountName.toUpperCase(),
      initials: this.getInitials(accountName),
      isVerified: false,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('recipients', recipientId, recipient);

    return {
      success: true,
      message: 'Recipient added successfully',
      recipient: this.formatRecipient(recipient)
    };
  }

  /**
   * Delete a bank recipient
   */
  static deleteBankRecipient(userId, recipientId) {
    const recipient = db.findById('recipients', recipientId);

    if (!recipient || recipient.userId !== userId) {
      throw new NotFoundError('Recipient not found');
    }

    if (recipient.isDeleted) {
      throw new NotFoundError('Recipient already deleted');
    }

    // Soft delete
    db.update('recipients', recipientId, {
      isDeleted: true,
      deletedAt: new Date()
    });

    return {
      success: true,
      message: 'Recipient deleted successfully'
    };
  }

  /**
   * Get recipient by ID
   */
  static getRecipientById(userId, recipientId) {
    const recipient = db.findById('recipients', recipientId);

    if (!recipient || recipient.userId !== userId || recipient.isDeleted) {
      throw new NotFoundError('Recipient not found');
    }

    return this.formatRecipient(recipient);
  }

  /**
   * Update recipient last used time
   */
  static markAsUsed(recipientId) {
    const recipient = db.findById('recipients', recipientId);
    if (recipient) {
      db.update('recipients', recipientId, {
        lastUsedAt: new Date(),
        usageCount: (recipient.usageCount || 0) + 1
      });
    }
  }

  // ==========================================
  // Wallet Recipients (Zena users)
  // ==========================================

  /**
   * Get all wallet recipients for a user
   */
  static getWalletRecipients(userId, search = '') {
    let recipients = db.findMany('recipients', (r) =>
      r.userId === userId && r.type === 'wallet' && !r.isDeleted
    );

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      recipients = recipients.filter((r) =>
        r.recipientName.toLowerCase().includes(searchLower) ||
        r.recipientUsername.toLowerCase().includes(searchLower)
      );
    }

    // Sort by most recently used
    recipients.sort((a, b) => {
      const aDate = a.lastUsedAt || a.createdAt;
      const bDate = b.lastUsedAt || b.createdAt;
      return new Date(bDate) - new Date(aDate);
    });

    return {
      recipients: recipients.map(this.formatWalletRecipient),
      count: recipients.length
    };
  }

  /**
   * Add a new wallet recipient (Zena user)
   */
  static addWalletRecipient(userId, recipientUserId) {
    // Can't add yourself
    if (userId === recipientUserId) {
      throw new ValidationError('You cannot add yourself as a recipient');
    }

    // Check if recipient user exists
    const recipientUser = db.findById('users', recipientUserId);
    if (!recipientUser || !recipientUser.isActive) {
      throw new NotFoundError('User not found');
    }

    // Check for duplicate
    const existing = db.findOne('recipients', (r) =>
      r.userId === userId &&
      r.type === 'wallet' &&
      r.recipientUserId === recipientUserId &&
      !r.isDeleted
    );

    if (existing) {
      throw new DuplicateError('This recipient already exists');
    }

    const recipientId = uuidv4();
    const recipient = {
      id: recipientId,
      userId,
      type: 'wallet',
      recipientUserId,
      recipientUsername: recipientUser.username,
      recipientName: `${recipientUser.firstName} ${recipientUser.lastName}`,
      initials: this.getInitials(`${recipientUser.firstName} ${recipientUser.lastName}`),
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('recipients', recipientId, recipient);

    return {
      success: true,
      message: 'Recipient added successfully',
      recipient: this.formatWalletRecipient(recipient)
    };
  }

  /**
   * Add wallet recipient by username
   */
  static addWalletRecipientByUsername(userId, username) {
    // Normalize username
    const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;

    // Find user
    const recipientUser = db.findOne('users', (u) =>
      u.username.toLowerCase() === normalizedUsername.toLowerCase() && u.isActive
    );

    if (!recipientUser) {
      throw new NotFoundError('User not found');
    }

    return this.addWalletRecipient(userId, recipientUser.id);
  }

  /**
   * Delete a wallet recipient
   */
  static deleteWalletRecipient(userId, recipientId) {
    return this.deleteBankRecipient(userId, recipientId); // Same logic
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  /**
   * Get supported banks
   */
  static getBanks() {
    return {
      banks: BANKS,
      count: BANKS.length
    };
  }

  /**
   * Verify bank account (mock - would call real API)
   */
  static async verifyBankAccount(bankCode, accountNumber) {
    // Validate inputs
    const bank = BANKS.find((b) => b.code === bankCode);
    if (!bank) {
      throw new ValidationError('Invalid bank code');
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      throw new ValidationError('Account number must be 10 digits');
    }

    // In production, this would call Paystack/Flutterwave API
    // For now, return mock data
    return {
      success: true,
      data: {
        accountNumber,
        accountName: 'MOCK ACCOUNT NAME',
        bankCode,
        bankName: bank.name
      }
    };
  }

  /**
   * Search Zena users by username
   */
  static searchUsers(query, excludeUserId) {
    if (!query || query.length < 2) {
      return { users: [], count: 0 };
    }

    const normalizedQuery = query.toLowerCase().replace('@', '');

    const users = db.findMany('users', (u) =>
      u.isActive &&
      u.id !== excludeUserId &&
      (u.username.toLowerCase().includes(normalizedQuery) ||
        u.firstName.toLowerCase().includes(normalizedQuery) ||
        u.lastName.toLowerCase().includes(normalizedQuery))
    ).slice(0, 10); // Limit to 10 results

    return {
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayUsername: `@${u.username}`,
        fullName: `${u.firstName} ${u.lastName}`,
        initials: this.getInitials(`${u.firstName} ${u.lastName}`)
      })),
      count: users.length
    };
  }

  /**
   * Get initials from name
   */
  static getInitials(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  /**
   * Format bank recipient for response
   */
  static formatRecipient(recipient) {
    return {
      id: recipient.id,
      type: recipient.type,
      bankCode: recipient.bankCode,
      bankName: recipient.bankName,
      accountNumber: recipient.accountNumber,
      accountName: recipient.accountName,
      initials: recipient.initials,
      isVerified: recipient.isVerified,
      lastUsedAt: recipient.lastUsedAt,
      createdAt: recipient.createdAt
    };
  }

  /**
   * Format wallet recipient for response
   */
  static formatWalletRecipient(recipient) {
    return {
      id: recipient.id,
      type: recipient.type,
      recipientUserId: recipient.recipientUserId,
      username: recipient.recipientUsername,
      displayUsername: `@${recipient.recipientUsername}`,
      name: recipient.recipientName,
      initials: recipient.initials,
      lastUsedAt: recipient.lastUsedAt,
      createdAt: recipient.createdAt
    };
  }
}

module.exports = RecipientsService;
