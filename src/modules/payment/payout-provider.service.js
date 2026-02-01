const { v4: uuidv4 } = require('uuid');
const db = require('../../shared/database');

/**
 * Payout Provider Service
 *
 * Handles communication with external payout providers:
 * - Paystack (Primary for Nigeria)
 * - PalmPay (Alternative for Nigeria)
 * - Blaaiz (Multi-country support - Ghana, Kenya, etc.)
 *
 * Provides:
 * - Bank list retrieval
 * - Account validation
 * - Transfer initiation
 * - Transfer status checking
 */

// Provider configurations
const PAYOUT_PROVIDERS = {
  PAYSTACK: {
    id: 'paystack',
    name: 'Paystack',
    priority: 1,
    supportedCountries: ['NG'],
    supportedCurrencies: ['NGN'],
    features: {
      bankTransfer: true,
      mobileWallet: false,
      accountValidation: true
    },
    fees: {
      NGN: { flat: 10, percentage: 0, cap: 10000, maxFree: 5000 }
    }
  },
  PALMPAY: {
    id: 'palmpay',
    name: 'PalmPay',
    priority: 2,
    supportedCountries: ['NG'],
    supportedCurrencies: ['NGN'],
    features: {
      bankTransfer: true,
      mobileWallet: true,
      accountValidation: true
    },
    fees: {
      NGN: { flat: 15, percentage: 0, cap: 10000, maxFree: 5000 }
    }
  },
  BLAAIZ: {
    id: 'blaaiz',
    name: 'Blaaiz',
    priority: 1,
    supportedCountries: ['NG', 'GH', 'KE', 'ZA', 'TG', 'BJ', 'CI', 'SN'],
    supportedCurrencies: ['NGN', 'GHS', 'KES', 'ZAR', 'XOF'],
    features: {
      bankTransfer: true,
      mobileWallet: true,
      accountValidation: true
    },
    fees: {
      NGN: { flat: 10, percentage: 0.001, cap: 10000, maxFree: 5000 },
      GHS: { flat: 2, percentage: 0.01, cap: 500, maxFree: 100 },
      KES: { flat: 50, percentage: 0.01, cap: 5000, maxFree: 500 },
      ZAR: { flat: 5, percentage: 0.01, cap: 500, maxFree: 100 },
      XOF: { flat: 500, percentage: 0.01, cap: 50000, maxFree: 5000 }
    }
  }
};

// Country configurations
const COUNTRIES = {
  NG: {
    code: 'NG',
    name: 'Nigeria',
    currency: 'NGN',
    currencySymbol: '₦',
    flag: 'ng.png',
    payoutType: 'bank', // bank, momo, or both
    providers: ['paystack', 'palmpay', 'blaaiz']
  },
  GH: {
    code: 'GH',
    name: 'Ghana',
    currency: 'GHS',
    currencySymbol: 'GH₵',
    flag: 'gh.png',
    payoutType: 'both',
    providers: ['blaaiz']
  },
  KE: {
    code: 'KE',
    name: 'Kenya',
    currency: 'KES',
    currencySymbol: 'KSh',
    flag: 'ke.png',
    payoutType: 'both',
    providers: ['blaaiz']
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    currency: 'ZAR',
    currencySymbol: 'R',
    flag: 'za.png',
    payoutType: 'bank',
    providers: ['blaaiz']
  },
  TG: {
    code: 'TG',
    name: 'Togo',
    currency: 'XOF',
    currencySymbol: 'CFA',
    flag: 'tg.png',
    payoutType: 'momo',
    providers: ['blaaiz']
  },
  BJ: {
    code: 'BJ',
    name: 'Benin',
    currency: 'XOF',
    currencySymbol: 'CFA',
    flag: 'bj.png',
    payoutType: 'momo',
    providers: ['blaaiz']
  },
  CI: {
    code: 'CI',
    name: "Côte d'Ivoire",
    currency: 'XOF',
    currencySymbol: 'CFA',
    flag: 'ci.png',
    payoutType: 'momo',
    providers: ['blaaiz']
  },
  SN: {
    code: 'SN',
    name: 'Senegal',
    currency: 'XOF',
    currencySymbol: 'CFA',
    flag: 'sn.png',
    payoutType: 'momo',
    providers: ['blaaiz']
  }
};

// Nigerian banks (mock - real list from provider API)
const NIGERIAN_BANKS = [
  { code: '044', name: 'Access Bank', logo: 'access.png' },
  { code: '035', name: 'Alat by Wema', logo: 'wema.png' },
  { code: '214', name: 'First City Monument Bank', logo: 'fcmb.png' },
  { code: '070', name: 'Fidelity Bank', logo: 'fidelity.png' },
  { code: '011', name: 'First Bank of Nigeria', logo: 'firstbank.png' },
  { code: '058', name: 'Guaranty Trust Bank', logo: 'gtbank.png' },
  { code: '082', name: 'Keystone Bank', logo: 'keystone.png' },
  { code: '076', name: 'Polaris Bank', logo: 'polaris.png' },
  { code: '221', name: 'Stanbic IBTC Bank', logo: 'stanbic.png' },
  { code: '232', name: 'Sterling Bank', logo: 'sterling.png' },
  { code: '032', name: 'Union Bank of Nigeria', logo: 'unionbank.png' },
  { code: '033', name: 'United Bank for Africa', logo: 'uba.png' },
  { code: '215', name: 'Unity Bank', logo: 'unity.png' },
  { code: '035', name: 'Wema Bank', logo: 'wema.png' },
  { code: '057', name: 'Zenith Bank', logo: 'zenith.png' },
  { code: '999992', name: 'Opay', logo: 'opay.png' },
  { code: '999991', name: 'Palmpay', logo: 'palmpay.png' },
  { code: '999993', name: 'Kuda Bank', logo: 'kuda.png' },
  { code: '999994', name: 'Moniepoint', logo: 'moniepoint.png' }
];

// Ghana banks
const GHANA_BANKS = [
  { code: 'GCB', name: 'GCB Bank', logo: 'gcb.png' },
  { code: 'ECOBANK_GH', name: 'Ecobank Ghana', logo: 'ecobank.png' },
  { code: 'ABSA_GH', name: 'Absa Bank Ghana', logo: 'absa.png' },
  { code: 'STANBIC_GH', name: 'Stanbic Bank Ghana', logo: 'stanbic.png' },
  { code: 'CAL', name: 'CAL Bank', logo: 'cal.png' },
  { code: 'FIDELITY_GH', name: 'Fidelity Bank Ghana', logo: 'fidelity.png' }
];

// Kenya banks
const KENYA_BANKS = [
  { code: 'EQUITY_KE', name: 'Equity Bank', logo: 'equity.png' },
  { code: 'KCB', name: 'Kenya Commercial Bank', logo: 'kcb.png' },
  { code: 'COOP_KE', name: 'Co-operative Bank', logo: 'coop.png' },
  { code: 'ABSA_KE', name: 'Absa Bank Kenya', logo: 'absa.png' },
  { code: 'STANBIC_KE', name: 'Stanbic Bank Kenya', logo: 'stanbic.png' }
];

// South Africa banks
const SOUTH_AFRICA_BANKS = [
  { code: 'ABSA_ZA', name: 'Absa Bank', logo: 'absa.png' },
  { code: 'FNB', name: 'First National Bank', logo: 'fnb.png' },
  { code: 'NEDBANK', name: 'Nedbank', logo: 'nedbank.png' },
  { code: 'STANDARD_ZA', name: 'Standard Bank', logo: 'standard.png' },
  { code: 'CAPITEC', name: 'Capitec Bank', logo: 'capitec.png' }
];

// Mobile Money providers
const MOBILE_MONEY_PROVIDERS = {
  GH: [
    { code: 'MTN_MOMO_GH', name: 'MTN Mobile Money', logo: 'mtn.png' },
    { code: 'VODAFONE_CASH', name: 'Vodafone Cash', logo: 'vodafone.png' },
    { code: 'AIRTELTIGO_MONEY', name: 'AirtelTigo Money', logo: 'airteltigo.png' }
  ],
  KE: [
    { code: 'MPESA', name: 'M-Pesa', logo: 'mpesa.png' },
    { code: 'AIRTEL_MONEY_KE', name: 'Airtel Money', logo: 'airtel.png' }
  ],
  TG: [
    { code: 'MOMO_PBS', name: 'Momo PBS', logo: 'momo.png' },
    { code: 'FLOOZ', name: 'Flooz', logo: 'flooz.png' }
  ],
  BJ: [
    { code: 'MTN_MOMO_BJ', name: 'MTN Mobile Money', logo: 'mtn.png' },
    { code: 'MOOV_MONEY', name: 'Moov Money', logo: 'moov.png' }
  ],
  CI: [
    { code: 'ORANGE_MONEY', name: 'Orange Money', logo: 'orange.png' },
    { code: 'MTN_MOMO_CI', name: 'MTN Mobile Money', logo: 'mtn.png' },
    { code: 'WAVE', name: 'Wave', logo: 'wave.png' }
  ],
  SN: [
    { code: 'ORANGE_MONEY_SN', name: 'Orange Money', logo: 'orange.png' },
    { code: 'WAVE_SN', name: 'Wave', logo: 'wave.png' },
    { code: 'FREE_MONEY', name: 'Free Money', logo: 'free.png' }
  ]
};

// Bank list by country
const BANKS_BY_COUNTRY = {
  NG: NIGERIAN_BANKS,
  GH: GHANA_BANKS,
  KE: KENYA_BANKS,
  ZA: SOUTH_AFRICA_BANKS
};

// Provider circuit breaker state
const providerCircuitBreaker = {};

class PayoutProviderService {
  // ==========================================
  // Country & Currency Methods
  // ==========================================

  /**
   * Get supported countries for withdrawal
   */
  static getSupportedCountries() {
    return Object.values(COUNTRIES).map(c => ({
      code: c.code,
      name: c.name,
      currency: c.currency,
      currencySymbol: c.currencySymbol,
      flag: c.flag,
      payoutType: c.payoutType
    }));
  }

  /**
   * Get country by code
   */
  static getCountry(countryCode) {
    return COUNTRIES[countryCode.toUpperCase()] || null;
  }

  /**
   * Get banks for a country
   */
  static getBanks(countryCode, search = '') {
    const country = this.getCountry(countryCode);
    if (!country) return [];

    const banks = BANKS_BY_COUNTRY[countryCode.toUpperCase()] || [];

    if (search) {
      const searchLower = search.toLowerCase();
      return banks.filter(b => b.name.toLowerCase().includes(searchLower));
    }

    return banks;
  }

  /**
   * Get mobile money providers for a country
   */
  static getMobileMoneyProviders(countryCode) {
    return MOBILE_MONEY_PROVIDERS[countryCode.toUpperCase()] || [];
  }

  /**
   * Get payout options for a country (banks + momo)
   */
  static getPayoutOptions(countryCode) {
    const country = this.getCountry(countryCode);
    if (!country) return null;

    const options = {
      country,
      banks: [],
      mobileWallets: []
    };

    if (country.payoutType === 'bank' || country.payoutType === 'both') {
      options.banks = this.getBanks(countryCode);
    }

    if (country.payoutType === 'momo' || country.payoutType === 'both') {
      options.mobileWallets = this.getMobileMoneyProviders(countryCode);
    }

    return options;
  }

  // ==========================================
  // Provider Selection
  // ==========================================

  /**
   * Get best provider for a country/currency
   */
  static getBestProvider(countryCode, currency) {
    const country = this.getCountry(countryCode);
    if (!country) return null;

    const availableProviders = country.providers
      .map(p => PAYOUT_PROVIDERS[p.toUpperCase()])
      .filter(p => p && p.supportedCurrencies.includes(currency))
      .filter(p => !this.isProviderCircuitOpen(p.id))
      .sort((a, b) => a.priority - b.priority);

    return availableProviders[0] || null;
  }

  /**
   * Check if provider circuit breaker is open
   */
  static isProviderCircuitOpen(providerId) {
    const state = providerCircuitBreaker[providerId];
    if (!state) return false;

    if (state.failures >= 3) {
      const cooldownEnd = new Date(state.lastFailure.getTime() + 5 * 60 * 1000);
      if (new Date() < cooldownEnd) {
        return true;
      }
      // Reset after cooldown
      delete providerCircuitBreaker[providerId];
    }
    return false;
  }

  /**
   * Record provider failure
   */
  static recordProviderFailure(providerId) {
    if (!providerCircuitBreaker[providerId]) {
      providerCircuitBreaker[providerId] = { failures: 0, lastFailure: null };
    }
    providerCircuitBreaker[providerId].failures++;
    providerCircuitBreaker[providerId].lastFailure = new Date();
  }

  /**
   * Record provider success
   */
  static recordProviderSuccess(providerId) {
    if (providerCircuitBreaker[providerId]) {
      providerCircuitBreaker[providerId].failures = Math.max(0, providerCircuitBreaker[providerId].failures - 1);
    }
  }

  // ==========================================
  // Account Validation
  // ==========================================

  /**
   * Validate bank account
   */
  static async validateBankAccount(countryCode, bankCode, accountNumber) {
    const provider = this.getBestProvider(countryCode, COUNTRIES[countryCode]?.currency);
    if (!provider) {
      throw new Error('No payout provider available for this country');
    }

    // Mock validation - in production, call provider API
    // Simulating async provider call
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock response
    const mockNames = [
      'Okunola Roscoly', 'Carter Efe', 'Ezekiel Shakur', 'Wonuola Fetuga',
      'Tunde Ezemora', 'Tunde Perry', 'Adewale Oluwaseun', 'Chidinma Okafor'
    ];

    const isValid = accountNumber.length >= 10 && /^\d+$/.test(accountNumber);

    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid account number format',
        provider: provider.id
      };
    }

    const bank = this.getBanks(countryCode).find(b => b.code === bankCode);

    return {
      valid: true,
      accountNumber,
      accountName: mockNames[Math.floor(Math.random() * mockNames.length)],
      bank: bank || { code: bankCode, name: 'Unknown Bank' },
      provider: provider.id
    };
  }

  /**
   * Validate mobile wallet
   */
  static async validateMobileWallet(countryCode, walletProvider, phoneNumber) {
    const provider = this.getBestProvider(countryCode, COUNTRIES[countryCode]?.currency);
    if (!provider) {
      throw new Error('No payout provider available for this country');
    }

    // Mock validation
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockNames = [
      'Okunola Roscoly', 'Ama Serwaa', 'Kwame Asante', 'Fatou Diallo'
    ];

    const isValid = phoneNumber.length >= 9 && /^\d+$/.test(phoneNumber.replace(/[+\s-]/g, ''));

    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid phone number format',
        provider: provider.id
      };
    }

    const wallet = this.getMobileMoneyProviders(countryCode).find(w => w.code === walletProvider);

    return {
      valid: true,
      phoneNumber,
      accountName: mockNames[Math.floor(Math.random() * mockNames.length)],
      wallet: wallet || { code: walletProvider, name: 'Unknown Wallet' },
      provider: provider.id
    };
  }

  // ==========================================
  // Transfer Execution
  // ==========================================

  /**
   * Initiate bank transfer
   */
  static async initiateBankTransfer(transferData) {
    const {
      countryCode,
      currency,
      bankCode,
      accountNumber,
      accountName,
      amount,
      reference,
      narration
    } = transferData;

    const provider = this.getBestProvider(countryCode, currency);
    if (!provider) {
      throw new Error('No payout provider available');
    }

    // Mock transfer initiation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate success/failure (90% success rate)
    const isSuccess = Math.random() > 0.1;

    if (!isSuccess) {
      this.recordProviderFailure(provider.id);
      return {
        success: false,
        error: 'Transfer failed at provider',
        provider: provider.id,
        reference
      };
    }

    this.recordProviderSuccess(provider.id);

    return {
      success: true,
      provider: provider.id,
      reference,
      providerReference: `${provider.id.toUpperCase()}_${Date.now()}`,
      status: 'pending', // pending, processing, completed, failed
      message: 'Transfer initiated successfully'
    };
  }

  /**
   * Initiate mobile money transfer
   */
  static async initiateMomoTransfer(transferData) {
    const {
      countryCode,
      currency,
      walletProvider,
      phoneNumber,
      accountName,
      amount,
      reference,
      narration
    } = transferData;

    const provider = this.getBestProvider(countryCode, currency);
    if (!provider) {
      throw new Error('No payout provider available');
    }

    // Mock transfer
    await new Promise(resolve => setTimeout(resolve, 1000));

    const isSuccess = Math.random() > 0.1;

    if (!isSuccess) {
      this.recordProviderFailure(provider.id);
      return {
        success: false,
        error: 'Mobile money transfer failed',
        provider: provider.id,
        reference
      };
    }

    this.recordProviderSuccess(provider.id);

    return {
      success: true,
      provider: provider.id,
      reference,
      providerReference: `${provider.id.toUpperCase()}_MOMO_${Date.now()}`,
      status: 'pending',
      message: 'Mobile money transfer initiated successfully'
    };
  }

  /**
   * Check transfer status
   */
  static async checkTransferStatus(providerId, reference) {
    // Mock status check
    await new Promise(resolve => setTimeout(resolve, 300));

    // Mock statuses
    const statuses = ['completed', 'completed', 'completed', 'processing', 'failed'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    return {
      reference,
      status,
      provider: providerId,
      updatedAt: new Date()
    };
  }

  // ==========================================
  // Fees & Exchange Rates
  // ==========================================

  /**
   * Calculate withdrawal fee
   */
  static calculateFee(currency, amount, provider = null) {
    // Get fee config from provider or use default
    let feeConfig;

    if (provider) {
      feeConfig = PAYOUT_PROVIDERS[provider.toUpperCase()]?.fees[currency];
    }

    if (!feeConfig) {
      // Default fee structure
      feeConfig = {
        flat: 10,
        percentage: 0.001,
        cap: 10000,
        maxFree: 5000
      };
    }

    // Free transfers under threshold
    if (amount <= feeConfig.maxFree) {
      return { fee: 0, feeType: 'free' };
    }

    // Calculate fee
    let fee = feeConfig.flat + (amount * feeConfig.percentage);
    fee = Math.min(fee, feeConfig.cap); // Apply cap
    fee = Math.ceil(fee); // Round up

    return {
      fee,
      feeType: 'standard',
      breakdown: {
        flat: feeConfig.flat,
        percentageRate: feeConfig.percentage,
        cap: feeConfig.cap
      }
    };
  }

  /**
   * Get exchange rate (for USD to local currency)
   */
  static getExchangeRate(fromCurrency, toCurrency) {
    // Mock exchange rates (USD to local)
    const rates = {
      'USD_NGN': 1450,
      'USD_GHS': 12.5,
      'USD_KES': 153,
      'USD_ZAR': 18.5,
      'USD_XOF': 610,
      'EUR_NGN': 1580,
      'GBP_NGN': 1820
    };

    const key = `${fromCurrency}_${toCurrency}`;
    const rate = rates[key];

    if (!rate) {
      // If no direct rate, assume 1:1 or return null
      if (fromCurrency === toCurrency) return { rate: 1, inverse: 1 };
      return null;
    }

    return {
      rate,
      inverse: 1 / rate,
      pair: key,
      updatedAt: new Date()
    };
  }

  /**
   * Convert amount using exchange rate
   */
  static convertAmount(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return { originalAmount: amount, convertedAmount: amount, rate: 1 };
    }

    const exchangeRate = this.getExchangeRate(fromCurrency, toCurrency);
    if (!exchangeRate) {
      throw new Error(`Exchange rate not available for ${fromCurrency} to ${toCurrency}`);
    }

    return {
      originalAmount: amount,
      convertedAmount: Math.floor(amount * exchangeRate.rate),
      rate: exchangeRate.rate,
      rateDisplay: `$1 = ${exchangeRate.rate.toLocaleString()} ${toCurrency}`
    };
  }
}

module.exports = PayoutProviderService;
