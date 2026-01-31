const paymentRoutes = require('./payment.routes');
const paymentController = require('./payment.controller');
const paymentService = require('./payment.service');

module.exports = {
  routes: paymentRoutes,
  controller: paymentController,
  service: paymentService
};
