const paymentRoutes = require('./payment.routes');
const paymentController = require('./payment.controller');
const paymentService = require('./payment.service');
const airtimeService = require('./airtime.service');
const dataService = require('./data.service');
const genericBillsService = require('./generic-bills.service');
const providerService = require('./provider.service');
const billsTransactionService = require('./bills.transaction.service');
const commissionService = require('./commission.service');
const payoutProviderService = require('./payout-provider.service');
const withdrawalService = require('./withdrawal.service');

module.exports = {
  routes: paymentRoutes,
  controller: paymentController,
  service: paymentService,
  airtimeService: airtimeService,
  dataService: dataService,
  genericBillsService: genericBillsService,
  providerService: providerService,
  billsTransactionService: billsTransactionService,
  commissionService: commissionService,
  payoutProviderService: payoutProviderService,
  withdrawalService: withdrawalService
};
