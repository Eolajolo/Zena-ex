const User = require('../models/User');

// Create new user account
const createAccount = async (req, res) => {
  try {
    const { username, email, phoneNumber, password } = req.body;

    // Create user
    const user = await User.create({
      username,
      email,
      phoneNumber,
      password
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON()
      }
    });
  } catch (error) {
    // Handle duplicate field errors
    if (error.message.includes('already')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    console.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the account'
    });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON()
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the user'
    });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = User.findAll();

    res.status(200).json({
      success: true,
      data: {
        users: users.map((user) => user.toJSON()),
        count: users.length
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching users'
    });
  }
};

module.exports = {
  createAccount,
  getUserById,
  getAllUsers
};
