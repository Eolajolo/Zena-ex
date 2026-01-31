const accountRoutes = require('./account.routes');
const accountController = require('./account.controller');
const accountService = require('./account.service');

module.exports = {
  routes: accountRoutes,
  controller: accountController,
  service: accountService
};
