const express = require('express');
const router = express.Router();
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const inMemoryStorage = require('../services/InMemoryStorage');

/**
 * Middleware to ensure session ID exists
 */
const ensureSessionId = (req, res, next) => {
  if (!req.session.id) {
    req.session.id = uuidv4();
    req.session.save();
  }
  req.sessionId = req.session.id;
  next();
};

router.use(ensureSessionId);

/**
 * POST /api/users/register
 * Register a new user (guest checkout support)
 */
router.post('/register', asyncHandler(async (req, res) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone
  } = req.body;

  let user;
  let existingUser;

  if (global.dbConnected) {
    // Use MongoDB
    existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    user = new User({
      email,
      password,
      profile: {
        firstName,
        lastName,
        phone
      },
      status: 'active'
    });

    await user.save();
  } else {
    // Use in-memory storage
    existingUser = await inMemoryStorage.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    user = await inMemoryStorage.createUser({
      email,
      password,
      firstName,
      lastName,
      phone
    });
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.status(201).json({
    success: true,
    data: {
      user: global.dbConnected ? user.getPublicProfile() : {
        id: user._id,
        email: user.email,
        name: `${user.profile.firstName} ${user.profile.lastName}`,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        phone: user.profile.phone,
        avatar: user.profile.avatar,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      token,
      message: 'User registered successfully'
    }
  });
}));

/**
 * POST /api/users/signup
 * Alias for /register endpoint
 */
router.post('/signup', asyncHandler(async (req, res) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone
  } = req.body;

  let user;
  let existingUser;

  if (global.dbConnected) {
    // Use MongoDB
    existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    user = new User({
      email,
      password,
      profile: {
        firstName,
        lastName,
        phone
      },
      status: 'active'
    });

    await user.save();
  } else {
    // Use in-memory storage
    existingUser = await inMemoryStorage.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    user = await inMemoryStorage.createUser({
      email,
      password,
      firstName,
      lastName,
      phone
    });
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.status(201).json({
    success: true,
    data: {
      user: global.dbConnected ? user.getPublicProfile() : {
        id: user._id,
        email: user.email,
        name: `${user.profile.firstName} ${user.profile.lastName}`,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        phone: user.profile.phone,
        avatar: user.profile.avatar,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      token,
      message: 'User registered successfully'
    }
  });
}));

/**
 * POST /api/users/login
 * Login user
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  let user;
  let isValidPassword;

  if (global.dbConnected) {
    // Use MongoDB
    user = await User.findByEmail(email).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    isValidPassword = await user.comparePassword(password);
  } else {
    // Use in-memory storage
    user = await inMemoryStorage.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    isValidPassword = await inMemoryStorage.comparePassword(user, password);
  }

  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password'
    });
  }

  // Check if user is active
  if (user.status !== 'active') {
    return res.status(401).json({
      success: false,
      error: 'Account is not active'
    });
  }

  // Update last login
  user.lastLogin = new Date();
  if (global.dbConnected) {
    await user.recordLogin(req.ip, req.get('User-Agent'));
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    success: true,
    data: {
      user: global.dbConnected ? user.getPublicProfile() : {
        id: user._id,
        email: user.email,
        name: `${user.profile.firstName} ${user.profile.lastName}`,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        phone: user.profile.phone,
        avatar: user.profile.avatar,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      token,
      message: 'Login successful'
    }
  });
}));

/**
 * GET /api/users/profile
 * Get user profile (requires authentication)
 */
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  let user;
  
  if (global.dbConnected) {
    user = await User.findById(req.userId);
  } else {
    user = await inMemoryStorage.findUserById(req.userId);
  }
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  res.json({
    success: true,
    data: {
      user: global.dbConnected ? user.getPublicProfile() : {
        id: user._id,
        email: user.email,
        name: `${user.profile.firstName} ${user.profile.lastName}`,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        phone: user.profile.phone,
        dateOfBirth: user.profile.dateOfBirth,
        avatar: user.profile.avatar,
        addresses: user.addresses,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    }
  });
}));

/**
 * PUT /api/users/profile
 * Update user profile
 */
router.put('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    phone,
    dateOfBirth,
    gender,
    address,
    city,
    country
  } = req.body;

  let user;
  
  if (global.dbConnected) {
    user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update profile fields
    if (firstName) user.profile.firstName = firstName;
    if (lastName) user.profile.lastName = lastName;
    if (phone) user.profile.phone = phone;
    if (dateOfBirth) user.profile.dateOfBirth = dateOfBirth;
    if (gender) user.profile.gender = gender;

    await user.save();
  } else {
    const profileData = {};
    if (firstName) profileData.firstName = firstName;
    if (lastName) profileData.lastName = lastName;
    if (phone) profileData.phone = phone;
    if (dateOfBirth) profileData.dateOfBirth = dateOfBirth;
    if (gender) profileData.gender = gender;
    if (address) profileData.address = address;
    if (city) profileData.city = city;
    if (country) profileData.country = country;

    user = await inMemoryStorage.updateUserProfile(req.userId, profileData);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
  }

  res.json({
    success: true,
    data: {
      user: global.dbConnected ? user.getPublicProfile() : {
        id: user._id,
        email: user.email,
        name: `${user.profile.firstName} ${user.profile.lastName}`,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        phone: user.profile.phone,
        dateOfBirth: user.profile.dateOfBirth,
        address: user.profile.address,
        city: user.profile.city,
        country: user.profile.country,
        avatar: user.profile.avatar,
        addresses: user.addresses,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      message: 'Profile updated successfully'
    }
  });
}));

/**
 * GET /api/users/addresses
 * Get user addresses
 */
router.get('/addresses', authenticateToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  res.json({
    success: true,
    data: {
      addresses: user.addresses
    }
  });
}));

/**
 * POST /api/users/addresses
 * Add new address
 */
router.post('/addresses', authenticateToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  await user.addAddress(req.body);

  res.status(201).json({
    success: true,
    data: {
      addresses: user.addresses,
      message: 'Address added successfully'
    }
  });
}));

/**
 * PUT /api/users/addresses/:addressId
 * Update address
 */
router.put('/addresses/:addressId', authenticateToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  try {
    await user.updateAddress(req.params.addressId, req.body);

    res.json({
      success: true,
      data: {
        addresses: user.addresses,
        message: 'Address updated successfully'
      }
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * DELETE /api/users/addresses/:addressId
 * Delete address
 */
router.delete('/addresses/:addressId', authenticateToken, asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  try {
    await user.removeAddress(req.params.addressId);

    res.json({
      success: true,
      data: {
        addresses: user.addresses,
        message: 'Address deleted successfully'
      }
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * Authentication middleware
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token is required'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    req.userId = decoded.userId;
    next();
  });
}

module.exports = router;