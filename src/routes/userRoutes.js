const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { registerValidation, handleValidationErrors } = require('../middleware/validation');

// POST /api/users/register - Create new user account
router.post(
  '/register',
  registerValidation,
  handleValidationErrors,
  userController.createAccount
);

// GET /api/users - Get all users
router.get('/', userController.getAllUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', userController.getUserById);

module.exports = router;
