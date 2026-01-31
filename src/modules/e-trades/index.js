const tradesRoutes = require('./trades.routes');
const tradesController = require('./trades.controller');
const tradesService = require('./trades.service');

module.exports = {
  routes: tradesRoutes,
  controller: tradesController,
  service: tradesService
};
