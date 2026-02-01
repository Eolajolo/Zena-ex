const paymentRoutes = require('./payment.routes');
const paymentController = require('./payment.controller');
const paymentService = require('./payment.service');
const airtimeService = require('./airtime.service');
const dataService = require('./data.service');
const providerService = require('./provider.service');
const billsTransactionService = require('./bills.transaction.service');

module.exports = {
  routes: paymentRoutes,
  controller: paymentController,
  service: paymentService,
  airtimeService: airtimeService,
  dataService: dataService,
  providerService: providerService,
  billsTransactionService: billsTransactionService
};
