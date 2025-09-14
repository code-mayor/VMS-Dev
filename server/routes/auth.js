const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get database connection from app
const getDbConnection = (req) => req.app.get('dbConnection');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-dev-secret');
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

// Middleware to check if user has required role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Helper function to generate permissions based on role
function getPermissionsByRole(role) {
  const permissions = {
    admin: {
      devices: { read: true, write: true, delete: true, ptz: true, record: true },
      users: { read: true, write: true, delete: true, create: true, update: true },
      streams: { read: true, write: true, delete: true },
      recordings: { read: true, write: true, delete: true },
      motion_events: { read: true, write: true, delete: true },
      settings: { read: true, write: true }
    },
    operator: {
      devices: { read: true, write: true, delete: false, ptz: true, record: true },
      users: { read: true, write: false, delete: false, create: false, update: false },
      streams: { read: true, write: true, delete: false },
      recordings: { read: true, write: true, delete: false },
      motion_events: { read: true, write: true, delete: false },
      settings: { read: true, write: false }
    },
    viewer: {
      devices: { read: true, write: false, delete: false, ptz: false, record: false },
      users: { read: false, write: false, delete: false, create: false, update: false },
      streams: { read: true, write: false, delete: false },
      recordings: { read: true, write: false, delete: false },
      motion_events: { read: true, write: false, delete: false },
      settings: { read: false, write: false }
    }
  };

  return permissions[role] || permissions.viewer;
}

// Formats a JS Date into MySQL/SQLite-friendly 'YYYY-MM-DD HH:MM:SS'
function toSqlDateTime(d = new Date()) {
  // Use UTC; MySQL DATETIME accepts this format without timezone
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Query database for user using unified method
    const user = await dbConnection.get(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      logger.audit(`Failed login attempt for email: ${email} - User not found`);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Verify password against stored hash
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logger.audit(`Failed login attempt for email: ${email} - Invalid password`);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login in database (use SQL-safe DATETIME)
    const nowIso = toSqlDateTime();
    await dbConnection.run(
      'UPDATE users SET last_login = ? WHERE id = ?',
      [nowIso, user.id]
    );


    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'default-dev-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    logger.audit(`Successful login for user: ${email} (${user.role})`);

    // Parse permissions if stored as JSON string
    let permissions = user.permissions;
    if (typeof permissions === 'string') {
      try {
        permissions = JSON.parse(permissions);
      } catch (e) {
        logger.error('Error parsing user permissions:', e);
        permissions = getPermissionsByRole(user.role);
      }
    }

    // Return user data without password
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions,
      session_timeout: 3600,
      last_activity: nowIso,
      created_at: user.created_at,
      last_login: nowIso
    };

    res.json({
      success: true,
      user: userData,
      accessToken: token
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Enhanced Signup endpoint with better error handling (public endpoint for initial setup)
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    logger.info(`Registration attempt for: ${email} (role: ${role})`);

    // Enhanced validation
    if (!email || !password || !name) {
      logger.warn(`Registration failed - missing required fields for ${email}`);
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.warn(`Registration failed - invalid email format: ${email}`);
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    // Password strength validation
    if (password.length < 6) {
      logger.warn(`Registration failed - password too short for ${email}`);
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Validate role
    const validRoles = ['admin', 'operator', 'viewer'];
    const userRole = role || 'viewer';
    if (!validRoles.includes(userRole)) {
      logger.warn(`Registration failed - invalid role "${userRole}" for ${email}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid role specified. Must be admin, operator, or viewer'
      });
    }

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database not available during registration');
      return res.status(500).json({
        success: false,
        error: 'Database service is currently unavailable'
      });
    }

    // Check if user already exists
    logger.info(`Checking if user already exists: ${email}`);
    const existingUser = await dbConnection.get(
      'SELECT email, name, role FROM users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      logger.warn(`Registration failed - user already exists: ${email} (existing: ${existingUser.name}, ${existingUser.role})`);
      return res.status(409).json({
        success: false,
        error: `A user with email ${email} already exists. Please use a different email address or try logging in.`
      });
    }

    logger.info(`Email ${email} is available for registration`);

    // Hash password
    logger.info(`Hashing password for ${email}`);
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Set permissions based on role
    const permissions = getPermissionsByRole(userRole);

    // Create new user
    const nowIso = toSqlDateTime();
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    logger.info(`Creating new user: ${email} with ID: ${userId}`);

    // Insert user into database using unified method
    try {
      await dbConnection.run(
        'INSERT INTO users (id, email, password_hash, name, role, permissions, created_at, updated_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, email, passwordHash, name, userRole, JSON.stringify(permissions), nowIso, nowIso, 1]
      );

      logger.info(`User created successfully: ${email}`);
    } catch (dbError) {
      logger.error(`Database error creating user ${email}:`, dbError);

      // Provide specific error messages based on error type
      let errorMessage = 'Registration failed';
      if (dbError.message && (dbError.message.includes('UNIQUE') || dbError.message.includes('Duplicate'))) {
        errorMessage = 'A user with this email already exists';
      } else if (dbError.message && dbError.message.includes('NULL')) {
        errorMessage = 'Missing required user information';
      } else {
        errorMessage = `Database error: ${dbError.message || 'Unknown error'}`;
      }

      return res.status(500).json({
        success: false,
        error: errorMessage
      });
    }

    logger.audit(`New user registered successfully: ${email} with role: ${userRole}`);

    // Return user data without password
    const userData = {
      id: userId,
      email: email,
      name: name,
      role: userRole,
      permissions: permissions,
      session_timeout: 3600,
      last_activity: nowIso,
      created_at: nowIso,
      last_login: null
    };

    res.status(201).json({
      success: true,
      user: userData,
      message: `Account created successfully! Welcome ${name}.`
    });

  } catch (error) {
    logger.error(`Signup error for ${req.body?.email || 'unknown'}:`, error);

    // Return user-friendly error message
    let errorMessage = 'Registration failed';
    if (error.message && (error.message.includes('UNIQUE') || error.message.includes('Duplicate') || error.message.includes('already exists'))) {
      errorMessage = 'A user with this email already exists. Please use a different email address.';
    } else if (error.message && error.message.includes('NULL')) {
      errorMessage = 'Missing required information. Please fill in all fields.';
    } else if (error.message && error.message.includes('Database error')) {
      errorMessage = error.message;
    } else {
      errorMessage = 'Registration failed. Please try again.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// GET /api/auth/users - Get all users (protected)
router.get('/users', authenticateToken, requireRole(['admin', 'operator']), async (req, res) => {
  try {
    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get all users except passwords
    const users = await dbConnection.all(
      `SELECT 
        id, 
        email, 
        name, 
        role, 
        active,
        created_at,
        last_login,
        failed_login_attempts,
        locked_until
      FROM users 
      ORDER BY created_at DESC`
    );

    // Convert active field to boolean for consistency
    const processedUsers = users.map(user => ({
      ...user,
      active: Boolean(user.active),
      failed_login_attempts: user.failed_login_attempts || 0
    }));

    logger.info(`User list accessed by ${req.user.email}`);

    res.json({
      success: true,
      users: processedUsers,
      count: processedUsers.length
    });

  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// POST /api/auth/register - Create new user (protected, admin only)
router.post('/register', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { email, password, name, role = 'viewer' } = req.body;

    logger.info(`User creation attempt by ${req.user.email} for: ${email} (role: ${role})`);

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Password strength check
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Validate role
    const validRoles = ['admin', 'operator', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Check if user already exists
    const existingUser = await dbConnection.get(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'A user with this email already exists'
      });
    }

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate user ID
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Set permissions based on role
    const permissions = getPermissionsByRole(userRole);

    // Get SQL-safe timestamp
    const nowIso = toSqlDateTime();

    // Insert new user
    await dbConnection.run(
      `INSERT INTO users (
        id, email, password_hash, name, role, permissions, 
        created_at, updated_at, active, failed_login_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, email, passwordHash, name, userRole,
        JSON.stringify(permissions), nowIso, nowIso, 1, 0
      ]
    );

    logger.audit(`New user created by ${req.user.email}: ${email} with role: ${userRole}`);

    res.status(201).json({
      success: true,
      message: `User ${name} created successfully`,
      user: {
        id: userId,
        email: email,
        name: name,
        role: userRole,
        created_at: nowIso
      }
    });

  } catch (error) {
    logger.error(`User creation error:`, error);

    let errorMessage = 'Failed to create user';
    if (error.message && error.message.includes('UNIQUE')) {
      errorMessage = 'A user with this email already exists';
    }

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// PUT /api/auth/users/:userId - Update user (protected)
router.put('/users/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { active, role, name } = req.body;

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Check if user exists
    const user = await dbConnection.get(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (active !== undefined) {
      updates.push('active = ?');
      values.push(active ? 1 : 0);
    }

    if (role && ['admin', 'operator', 'viewer'].includes(role)) {
      updates.push('role = ?');
      values.push(role);

      // Update permissions based on new role
      const permissions = getPermissionsByRole(role);
      updates.push('permissions = ?');
      values.push(JSON.stringify(permissions));
    }

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    // Add updated_at timestamp
    updates.push('updated_at = ?');
    values.push(toSqlDateTime());

    // Add userId for WHERE clause
    values.push(userId);

    const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await dbConnection.run(updateQuery, values);

    logger.audit(`User ${user.email} updated by ${req.user.email}`);

    res.json({
      success: true,
      message: 'User updated successfully'
    });

  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

// DELETE /api/auth/users/:userId - Delete user (protected)
router.delete('/users/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'You cannot delete your own account'
      });
    }

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Check if user exists
    const user = await dbConnection.get(
      'SELECT email FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Delete the user
    await dbConnection.run('DELETE FROM users WHERE id = ?', [userId]);

    logger.audit(`User ${user.email} deleted by ${req.user.email}`);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

// Debug endpoint to check existing users (development only)
router.get('/debug/users', async (req, res) => {
  try {
    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    const users = await dbConnection.all(
      'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      users: users,
      count: users.length
    });

  } catch (error) {
    logger.error('Debug users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// Auth status endpoint
router.get('/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-dev-secret');

      const dbConnection = getDbConnection(req);
      const user = await dbConnection.get(
        'SELECT * FROM users WHERE id = ?',
        [decoded.userId]
      );

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      // Parse permissions
      let permissions = user.permissions;
      if (typeof permissions === 'string') {
        try {
          permissions = JSON.parse(permissions);
        } catch (e) {
          permissions = {};
        }
      }

      const nowIso = toSqlDateTime();

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: permissions,
          session_timeout: 3600,
          last_activity: nowIso,
          created_at: user.created_at,
          last_login: user.last_login
        }
      });

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

  } catch (error) {
    logger.error('Auth status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check auth status'
    });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  try {
    // In a real implementation, you'd invalidate the token
    // For now, just return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// Automatic Token Refresh
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    // Generate new token with same user data
    const newToken = jwt.sign(
      {
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role
      },
      process.env.JWT_SECRET || 'default-dev-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      accessToken: newToken
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
});

module.exports = router;