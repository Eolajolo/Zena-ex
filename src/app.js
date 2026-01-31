const express = require('express');
const config = require('./config');
const { errorHandler, notFoundHandler, rateLimiters } = require('./shared/middleware');
const { logger } = require('./shared/utils');

// Import modules
const { auth, account, wallet, payment, eTrades, giftcard } = require('./modules');

const app = express();

// ===========================================
// Middleware
// ===========================================

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`
    });
  });
  next();
});

// Global rate limiting
app.use(rateLimiters.api);

// ===========================================
// Health Check
// ===========================================

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Zena API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });
});

// ===========================================
// API Routes
// ===========================================

// Auth routes - /api/auth
app.use('/api/auth', auth.routes);

// Account routes - /api/account
app.use('/api/account', account.routes);

// Wallet routes - /api/wallet
app.use('/api/wallet', wallet.routes);

// Payment routes - /api/payment
app.use('/api/payment', payment.routes);

// E-Trades routes - /api/trades
app.use('/api/trades', eTrades.routes);

// Giftcard routes - /api/giftcard
app.use('/api/giftcard', giftcard.routes);

// ===========================================
// Error Handling
// ===========================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ===========================================
// Server Start
// ===========================================

const startServer = () => {
  app.listen(config.port, () => {
    logger.info(`Zena API server started`, {
      port: config.port,
      environment: config.nodeEnv
    });

    console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║        🚀 ZENA API Server Running                 ║
║                                                   ║
║   Local:    http://localhost:${config.port}              ║
║   Env:      ${config.nodeEnv.padEnd(35)}║
║                                                   ║
║   Modules:                                        ║
║   • Auth      /api/auth                           ║
║   • Account   /api/account                        ║
║   • Wallet    /api/wallet                         ║
║   • Payment   /api/payment                        ║
║   • E-Trades  /api/trades                         ║
║   • Giftcard  /api/giftcard                       ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    `);
  });
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = app;
