// Supported country codes with details
const COUNTRY_CODES = [
  { code: '+234', country: 'Nigeria', flag: '🇳🇬', currency: 'NGN' },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸', currency: 'USD' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { code: '+91', country: 'India', flag: '🇮🇳', currency: 'INR' },
  { code: '+233', country: 'Ghana', flag: '🇬🇭', currency: 'GHS' },
  { code: '+254', country: 'Kenya', flag: '🇰🇪', currency: 'KES' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦', currency: 'ZAR' },
  { code: '+971', country: 'UAE', flag: '🇦🇪', currency: 'AED' },
  { code: '+49', country: 'Germany', flag: '🇩🇪', currency: 'EUR' },
  { code: '+33', country: 'France', flag: '🇫🇷', currency: 'EUR' },
  { code: '+86', country: 'China', flag: '🇨🇳', currency: 'CNY' },
  { code: '+81', country: 'Japan', flag: '🇯🇵', currency: 'JPY' },
  { code: '+61', country: 'Australia', flag: '🇦🇺', currency: 'AUD' }
];

// KYC Levels
const KYC_LEVELS = {
  NONE: 0,        // Just registered
  PHONE: 1,       // Phone verified
  BVN: 2,         // BVN verified
  FULL: 3         // Full KYC (ID + Address proof)
};

// Transaction Types
const TRANSACTION_TYPES = {
  CREDIT: 'credit',
  DEBIT: 'debit',
  TRANSFER: 'transfer',
  WITHDRAWAL: 'withdrawal',
  DEPOSIT: 'deposit',
  BILL_PAYMENT: 'bill_payment',
  CRYPTO_BUY: 'crypto_buy',
  CRYPTO_SELL: 'crypto_sell',
  GIFTCARD_SELL: 'giftcard_sell'
};

// Transaction Status
const TRANSACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

// Wallet Types
const WALLET_TYPES = {
  FIAT: 'fiat',
  CRYPTO: 'crypto'
};

// Supported Currencies
const CURRENCIES = {
  FIAT: ['NGN', 'USD', 'GBP'],
  CRYPTO: ['BTC', 'ETH', 'USDT', 'USDC']
};

// Gift Card Types
const GIFTCARD_TYPES = [
  { id: 'itunes', name: 'iTunes', icon: 'itunes' },
  { id: 'amazon', name: 'Amazon', icon: 'amazon' },
  { id: 'steam', name: 'Steam', icon: 'steam' },
  { id: 'google_play', name: 'Google Play', icon: 'google' },
  { id: 'ebay', name: 'eBay', icon: 'ebay' },
  { id: 'walmart', name: 'Walmart', icon: 'walmart' },
  { id: 'sephora', name: 'Sephora', icon: 'sephora' },
  { id: 'nordstrom', name: 'Nordstrom', icon: 'nordstrom' }
];

// Bill Categories
const BILL_CATEGORIES = {
  AIRTIME: 'airtime',
  DATA: 'data',
  ELECTRICITY: 'electricity',
  TV: 'tv',
  INTERNET: 'internet',
  WATER: 'water',
  BETTING: 'betting'
};

// Error Codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

module.exports = {
  COUNTRY_CODES,
  KYC_LEVELS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUS,
  WALLET_TYPES,
  CURRENCIES,
  GIFTCARD_TYPES,
  BILL_CATEGORIES,
  ERROR_CODES
};
