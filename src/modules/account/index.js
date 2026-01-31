const accountRoutes = require('./account.routes');
const accountController = require('./account.controller');
const accountService = require('./account.service');
const recipientsService = require('./recipients.service');
const securityService = require('./security.service');

module.exports = {
  routes: accountRoutes,
  controller: accountController,
  service: accountService,
  recipientsService: recipientsService,
  securityService: securityService
};
