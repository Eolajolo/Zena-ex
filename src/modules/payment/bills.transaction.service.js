const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');
const { NotFoundError, ValidationError } = require('../../shared/middleware');
const { TRANSACTION_STATUS, BILL_CATEGORIES } = require('../../shared/constants');

/**
 * Bills Transaction Service
 *
 * Unified service for managing all bill payment transactions,
 * including history, receipts, and issue reporting.
 */

// Transaction types for bills
const BILL_TYPES = {
  [BILL_CATEGORIES.AIRTIME]: {
    name: 'Airtime',
    icon: 'phone',
    collection: 'airtimeTransactions'
  },
  [BILL_CATEGORIES.DATA]: {
    name: 'Data',
    icon: 'wifi',
    collection: 'dataTransactions'
  },
  [BILL_CATEGORIES.ELECTRICITY]: {
    name: 'Electricity',
    icon: 'bolt',
    collection: 'electricityTransactions'
  },
  [BILL_CATEGORIES.TV]: {
    name: 'Cable TV',
    icon: 'tv',
    collection: 'tvTransactions'
  },
  [BILL_CATEGORIES.BETTING]: {
    name: 'Betting',
    icon: 'gamepad',
    collection: 'bettingTransactions'
  }
};

// Issue types for reporting
const ISSUE_TYPES = {
  NOT_RECEIVED: 'not_received',
  WRONG_NUMBER: 'wrong_number',
  WRONG_AMOUNT: 'wrong_amount',
  DOUBLE_CHARGE: 'double_charge',
  OTHER: 'other'
};

class BillsTransactionService {
  /**
   * Get unified bill transaction history
   */
  static getAllBillsHistory(userId, options = {}) {
    const {
      category,
      status,
      search,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = options;

    // Collect transactions from all bill types or specific category
    let allTransactions = [];

    const categoriesToSearch = category
      ? [category]
      : Object.keys(BILL_TYPES);

    for (const cat of categoriesToSearch) {
      const config = BILL_TYPES[cat];
      if (!config) continue;

      const transactions = db.findMany(config.collection, (t) => t.userId === userId);

      // Add category info to each transaction
      allTransactions.push(...transactions.map(t => ({
        ...t,
        category: cat,
        categoryName: config.name,
        categoryIcon: config.icon
      })));
    }

    // Apply filters
    if (status) {
      allTransactions = allTransactions.filter(t => t.status === status);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      allTransactions = allTransactions.filter(t =>
        (t.recipientNumber && t.recipientNumber.includes(search)) ||
        (t.reference && t.reference.toLowerCase().includes(searchLower)) ||
        (t.provider && t.provider.name.toLowerCase().includes(searchLower))
      );
    }

    if (startDate) {
      const start = new Date(startDate);
      allTransactions = allTransactions.filter(t => new Date(t.createdAt) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      allTransactions = allTransactions.filter(t => new Date(t.createdAt) <= end);
    }

    // Sort by date descending
    allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Group by date
    const grouped = this.groupByDate(allTransactions.slice(offset, offset + limit));

    // Calculate stats
    const stats = this.calculateStats(allTransactions);

    return {
      transactions: allTransactions.slice(offset, offset + limit),
      grouped,
      stats,
      total: allTransactions.length,
      hasMore: offset + limit < allTransactions.length
    };
  }

  /**
   * Group transactions by date
   */
  static groupByDate(transactions) {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    transactions.forEach(t => {
      const txDate = new Date(t.createdAt);
      txDate.setHours(0, 0, 0, 0);

      let dateKey;
      if (txDate.getTime() === today.getTime()) {
        dateKey = 'Today';
      } else if (txDate.getTime() === yesterday.getTime()) {
        dateKey = 'Yesterday';
      } else {
        dateKey = txDate.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(t);
    });

    return groups;
  }

  /**
   * Calculate transaction statistics
   */
  static calculateStats(transactions) {
    const completed = transactions.filter(t => t.status === TRANSACTION_STATUS.COMPLETED);
    const failed = transactions.filter(t => t.status === TRANSACTION_STATUS.FAILED);

    const totalAmount = completed.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalCashback = completed.reduce((sum, t) => sum + (t.cashback || 0), 0);

    // Category breakdown
    const byCategory = {};
    for (const cat of Object.keys(BILL_TYPES)) {
      const catTransactions = completed.filter(t => t.category === cat);
      byCategory[cat] = {
        count: catTransactions.length,
        amount: catTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)
      };
    }

    return {
      totalTransactions: transactions.length,
      completedCount: completed.length,
      failedCount: failed.length,
      totalAmount,
      totalCashback,
      byCategory
    };
  }

  /**
   * Get transaction by ID (from any bill category)
   */
  static getTransaction(userId, transactionId) {
    for (const [category, config] of Object.entries(BILL_TYPES)) {
      const transaction = db.findById(config.collection, transactionId);
      if (transaction && transaction.userId === userId) {
        return {
          ...transaction,
          category,
          categoryName: config.name,
          categoryIcon: config.icon
        };
      }
    }

    throw new NotFoundError('Transaction not found');
  }

  /**
   * Get detailed transaction view
   */
  static getTransactionDetails(userId, transactionId) {
    const transaction = this.getTransaction(userId, transactionId);

    // Format for UI
    return {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.categoryName,
      category: transaction.category,
      categoryIcon: transaction.categoryIcon,

      // Amount info
      amount: transaction.amount,
      formattedAmount: `₦${transaction.amount.toLocaleString()}`,
      cashback: transaction.cashback || 0,
      formattedCashback: transaction.cashback ? `+₦${transaction.cashback} Cashback` : null,

      // Status
      status: transaction.status,
      statusLabel: this.getStatusLabel(transaction.status),
      statusColor: this.getStatusColor(transaction.status),

      // Recipient info
      recipientNumber: transaction.recipientNumber,
      provider: transaction.provider,

      // Transaction identifiers
      providerReference: transaction.providerReference,

      // Timestamps
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      formattedDate: new Date(transaction.createdAt).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      formattedTime: new Date(transaction.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),

      // Description
      description: this.generateDescription(transaction),

      // Actions
      canRedo: transaction.status === TRANSACTION_STATUS.COMPLETED,
      canReport: true
    };
  }

  /**
   * Get status label
   */
  static getStatusLabel(status) {
    const labels = {
      [TRANSACTION_STATUS.PENDING]: 'Pending',
      [TRANSACTION_STATUS.PROCESSING]: 'Processing',
      [TRANSACTION_STATUS.COMPLETED]: 'Successful',
      [TRANSACTION_STATUS.FAILED]: 'Failed',
      [TRANSACTION_STATUS.CANCELLED]: 'Cancelled',
      [TRANSACTION_STATUS.REFUNDED]: 'Refunded'
    };
    return labels[status] || status;
  }

  /**
   * Get status color
   */
  static getStatusColor(status) {
    const colors = {
      [TRANSACTION_STATUS.PENDING]: 'orange',
      [TRANSACTION_STATUS.PROCESSING]: 'blue',
      [TRANSACTION_STATUS.COMPLETED]: 'green',
      [TRANSACTION_STATUS.FAILED]: 'red',
      [TRANSACTION_STATUS.CANCELLED]: 'gray',
      [TRANSACTION_STATUS.REFUNDED]: 'purple'
    };
    return colors[status] || 'gray';
  }

  /**
   * Generate transaction description
   */
  static generateDescription(transaction) {
    const providerName = transaction.provider?.name || 'Unknown';

    switch (transaction.category) {
      case BILL_CATEGORIES.AIRTIME:
        return `Bill payment for ${providerName} recharge for ${transaction.recipientNumber}`;
      case BILL_CATEGORIES.DATA:
        return `Data bundle for ${providerName} - ${transaction.recipientNumber}`;
      case BILL_CATEGORIES.ELECTRICITY:
        return `Electricity payment for meter ${transaction.recipientNumber}`;
      case BILL_CATEGORIES.TV:
        return `Cable TV subscription for ${transaction.recipientNumber}`;
      case BILL_CATEGORIES.BETTING:
        return `Betting wallet funding for ${transaction.recipientNumber}`;
      default:
        return `Bill payment - ${providerName}`;
    }
  }

  /**
   * Generate printable receipt
   */
  static generateReceipt(userId, transactionId) {
    const transaction = this.getTransactionDetails(userId, transactionId);
    const user = db.findById('users', userId);

    return {
      // Header
      receiptId: `RCP${Date.now().toString(36).toUpperCase()}`,
      receiptType: 'Transaction Receipt',

      // Amount display
      amount: transaction.amount,
      formattedAmount: transaction.formattedAmount,

      // Details rows
      details: [
        { label: 'Status', value: transaction.statusLabel, color: transaction.statusColor },
        { label: 'Phone Number', value: transaction.recipientNumber },
        { label: 'Provider', value: transaction.provider?.name, icon: transaction.provider?.logo },
        { label: 'Amount Equivalent', value: transaction.formattedAmount },
        { label: 'Reference', value: transaction.reference },
        { label: 'Timestamp', value: `${transaction.formattedDate} | ${transaction.formattedTime}` }
      ],

      // Footer
      branding: {
        name: 'ZENAEX',
        tagline: 'Any issues with this transaction?',
        supportEmail: 'disputes@Zenaex.com',
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Report issue with transaction
   */
  static reportIssue(userId, transactionId, issueData) {
    // Validate transaction exists
    const transaction = this.getTransaction(userId, transactionId);

    // Validate issue type
    if (issueData.type && !Object.values(ISSUE_TYPES).includes(issueData.type)) {
      throw new ValidationError('Invalid issue type');
    }

    // Create issue record
    const issueId = uuidv4();
    const issue = {
      id: issueId,
      ticketNumber: `TKT${Date.now().toString(36).toUpperCase()}`,
      userId,
      transactionId,
      transactionReference: transaction.reference,
      transactionCategory: transaction.category,
      transactionAmount: transaction.amount,
      type: issueData.type || ISSUE_TYPES.OTHER,
      description: issueData.description,
      contactMethod: issueData.contactMethod || 'email',
      attachments: issueData.attachments || [],
      status: 'open',
      priority: this.calculateIssuePriority(transaction, issueData),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.create('transactionIssues', issueId, issue);

    return {
      success: true,
      issueId,
      ticketNumber: issue.ticketNumber,
      message: 'Issue reported successfully. Our support team will review and get back to you within 24 hours.',
      estimatedResolution: '24-48 hours'
    };
  }

  /**
   * Calculate issue priority based on transaction and issue details
   */
  static calculateIssuePriority(transaction, issueData) {
    // Higher amount = higher priority
    if (transaction.amount >= 50000) return 'high';
    if (issueData.type === ISSUE_TYPES.DOUBLE_CHARGE) return 'high';
    if (transaction.amount >= 10000) return 'medium';
    return 'normal';
  }

  /**
   * Get user's reported issues
   */
  static getUserIssues(userId, options = {}) {
    const { status, limit = 20, offset = 0 } = options;

    let issues = db.findMany('transactionIssues', (i) => i.userId === userId);

    if (status) {
      issues = issues.filter(i => i.status === status);
    }

    issues.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      issues: issues.slice(offset, offset + limit),
      total: issues.length
    };
  }

  /**
   * Get single issue details
   */
  static getIssueDetails(userId, issueId) {
    const issue = db.findById('transactionIssues', issueId);

    if (!issue || issue.userId !== userId) {
      throw new NotFoundError('Issue not found');
    }

    return {
      ...issue,
      statusLabel: this.getIssueStatusLabel(issue.status)
    };
  }

  /**
   * Get issue status label
   */
  static getIssueStatusLabel(status) {
    const labels = {
      open: 'Open',
      in_progress: 'In Progress',
      resolved: 'Resolved',
      closed: 'Closed'
    };
    return labels[status] || status;
  }

  /**
   * Get available issue types
   */
  static getIssueTypes() {
    return [
      { id: ISSUE_TYPES.NOT_RECEIVED, label: 'Airtime/Service not received' },
      { id: ISSUE_TYPES.WRONG_NUMBER, label: 'Sent to wrong number' },
      { id: ISSUE_TYPES.WRONG_AMOUNT, label: 'Wrong amount charged' },
      { id: ISSUE_TYPES.DOUBLE_CHARGE, label: 'Charged twice' },
      { id: ISSUE_TYPES.OTHER, label: 'Other issue' }
    ];
  }
}

module.exports = BillsTransactionService;
