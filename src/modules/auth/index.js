const authRoutes = require('./auth.routes');
const authController = require('./auth.controller');
const authService = require('./auth.service');
const otpService = require('./otp.service');
const authValidation = require('./auth.validation');
const authMiddleware = require('./auth.middleware');

module.exports = {
  routes: authRoutes,
  controller: authController,
  service: authService,
  otpService: otpService,
  validation: authValidation,
  middleware: authMiddleware
};
