const walletRoutes = require('./wallet.routes');
const walletController = require('./wallet.controller');
const walletService = require('./wallet.service');

module.exports = {
  routes: walletRoutes,
  controller: walletController,
  service: walletService
};
