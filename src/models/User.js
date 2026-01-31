const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// In-memory storage (replace with database in production)
const users = new Map();

class User {
  constructor({ username, email, phoneNumber, password }) {
    this.id = uuidv4();
    this.username = username;
    this.email = email.toLowerCase();
    this.phoneNumber = phoneNumber;
    this.password = password;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Hash password before saving
  static async hashPassword(password) {
    return bcrypt.hash(password, config.bcryptSaltRounds);
  }

  // Verify password
  static async verifyPassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }

  // Create a new user
  static async create(userData) {
    // Check if email already exists
    const existingEmail = Array.from(users.values()).find(
      (user) => user.email === userData.email.toLowerCase()
    );
    if (existingEmail) {
      throw new Error('Email already registered');
    }

    // Check if username already exists
    const existingUsername = Array.from(users.values()).find(
      (user) => user.username === userData.username
    );
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Check if phone number already exists
    const existingPhone = Array.from(users.values()).find(
      (user) => user.phoneNumber === userData.phoneNumber
    );
    if (existingPhone) {
      throw new Error('Phone number already registered');
    }

    // Hash password
    const hashedPassword = await User.hashPassword(userData.password);

    // Create new user
    const user = new User({
      ...userData,
      password: hashedPassword
    });

    // Store user
    users.set(user.id, user);

    return user;
  }

  // Find user by ID
  static findById(id) {
    return users.get(id) || null;
  }

  // Find user by email
  static findByEmail(email) {
    return Array.from(users.values()).find(
      (user) => user.email === email.toLowerCase()
    ) || null;
  }

  // Find user by username
  static findByUsername(username) {
    return Array.from(users.values()).find(
      (user) => user.username === username
    ) || null;
  }

  // Get all users
  static findAll() {
    return Array.from(users.values());
  }

  // Return user data without password
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      phoneNumber: this.phoneNumber,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = User;
