const authRoutes = require('./auth.routes');
const authController = require('./auth.controller');
const authService = require('./auth.service');
const authValidation = require('./auth.validation');
const authMiddleware = require('./auth.middleware');

module.exports = {
  routes: authRoutes,
  controller: authController,
  service: authService,
  validation: authValidation,
  middleware: authMiddleware
};
