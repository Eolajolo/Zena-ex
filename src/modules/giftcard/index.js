const giftcardRoutes = require('./giftcard.routes');
const giftcardController = require('./giftcard.controller');
const giftcardService = require('./giftcard.service');

module.exports = {
  routes: giftcardRoutes,
  controller: giftcardController,
  service: giftcardService
};
