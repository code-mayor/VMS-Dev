// server/utils/seed-database.js
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

// Demo users to create on startup
const demoUsers = [
  {
    email: 'admin@local.dev',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin'
  },
  {
    email: 'operator@local.dev',
    password: 'operator123',
    name: 'Operator User',
    role: 'operator'
  },
  {
    email: 'viewer@local.dev',
    password: 'viewer123',
    name: 'Viewer User',
    role: 'viewer'
  }
];

// Helper function to determine database type
const getDatabaseType = (db) => {
  // Check if it's the DatabaseAdapter class (from index.js)
  if (db && db.type) {
    return db.type;
  }
  // Check if it's a MySQL pool/connection
  if (db && db.execute) {
    return 'mysql';
  }
  // Default to SQLite
  return 'sqlite';
};

// Format datetime for MySQL
const formatDateForMySQL = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

// Get current timestamp in appropriate format
const getCurrentTimestamp = (dbType) => {
  const now = new Date();
  if (dbType === 'mysql') {
    return formatDateForMySQL(now);
  }
  return now.toISOString();
};

/**
 * Check if a column exists in a table
 */
const checkColumnExists = async (db, tableName, columnName) => {
  const dbType = getDatabaseType(db);

  try {
    if (dbType === 'mysql') {
      const query = `
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ? 
        AND COLUMN_NAME = ?
      `;

      if (db.get) {
        const result = await db.get(query, [tableName, columnName]);
        return result.count > 0;
      } else if (db.execute) {
        const [rows] = await db.execute(query, [tableName, columnName]);
        return rows[0].count > 0;
      }
    } else {
      // SQLite
      return new Promise((resolve) => {
        const query = `PRAGMA table_info(${tableName})`;
        const queryFn = db.all ? db.all.bind(db) : db.all;

        queryFn(query, [], (err, columns) => {
          if (err) {
            resolve(false);
          } else {
            const columnExists = columns && columns.some(col => col.name === columnName);
            resolve(columnExists);
          }
        });
      });
    }
  } catch (error) {
    logger.error(`Error checking column ${columnName} in table ${tableName}:`, error);
    return false;
  }
};

/**
 * Get table schema for dynamic query building
 */
const getTableSchema = async (db, tableName) => {
  const dbType = getDatabaseType(db);

  try {
    if (dbType === 'mysql') {
      // MySQL: Use INFORMATION_SCHEMA
      const query = `
        SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as notnull, COLUMN_KEY as pk
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ?
      `;

      if (db.all) {
        // It's a DatabaseAdapter
        return await db.all(query, [tableName]);
      } else if (db.execute) {
        // It's a raw MySQL connection
        const [rows] = await db.execute(query, [tableName]);
        return rows;
      }
    } else {
      // SQLite: Use PRAGMA
      return new Promise((resolve, reject) => {
        const query = `PRAGMA table_info(${tableName})`;

        if (db.all && typeof db.all === 'function') {
          // DatabaseAdapter or promise-based
          if (db.all.length === 2) {
            // Promise-based
            db.all(query, []).then(resolve).catch(reject);
          } else {
            // Callback-based
            db.all(query, [], (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            });
          }
        } else {
          // Raw SQLite connection
          db.all(query, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        }
      });
    }
  } catch (error) {
    logger.error(`Failed to get schema for table ${tableName}:`, error);
    return [];
  }
};

// Execute query based on database type
const executeQuery = async (db, query, params = []) => {
  const dbType = getDatabaseType(db);

  try {
    if (db.run && typeof db.run === 'function') {
      // DatabaseAdapter with run method
      return await db.run(query, params);
    } else if (db.execute) {
      // Raw MySQL connection
      const [result] = await db.execute(query, params);
      return { lastID: result.insertId, changes: result.affectedRows };
    } else {
      // Raw SQLite connection
      return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  } catch (error) {
    logger.error('Query execution error:', error);
    throw error;
  }
};

// Get all rows based on database type
const getAllRows = async (db, query, params = []) => {
  const dbType = getDatabaseType(db);

  try {
    if (db.all && typeof db.all === 'function') {
      // DatabaseAdapter with all method
      return await db.all(query, params);
    } else if (db.execute) {
      // Raw MySQL connection
      const [rows] = await db.execute(query, params);
      return rows;
    } else {
      // Raw SQLite connection
      return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  } catch (error) {
    logger.error('Get all rows error:', error);
    throw error;
  }
};

// Get single row based on database type
const getRow = async (db, query, params = []) => {
  const dbType = getDatabaseType(db);

  try {
    if (db.get && typeof db.get === 'function') {
      // DatabaseAdapter with get method
      return await db.get(query, params);
    } else if (db.execute) {
      // Raw MySQL connection
      const [rows] = await db.execute(query, params);
      return rows[0];
    } else {
      // Raw SQLite connection
      return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
  } catch (error) {
    logger.error('Get row error:', error);
    throw error;
  }
};

// Generate permissions based on role
const getPermissionsByRole = (role) => {
  let permissions = {};

  switch (role) {
    case 'admin':
      permissions = {
        devices: { read: true, write: true, delete: true, ptz: true, record: true },
        users: { read: true, write: true, delete: true },
        streams: { read: true, write: true, delete: true },
        recordings: { read: true, write: true, delete: true },
        motion_events: { read: true, write: true, delete: true },
        settings: { read: true, write: true }
      };
      break;
    case 'operator':
      permissions = {
        devices: { read: true, write: true, delete: false, ptz: true, record: true },
        users: { read: true, write: false, delete: false },
        streams: { read: true, write: true, delete: false },
        recordings: { read: true, write: true, delete: false },
        motion_events: { read: true, write: true, delete: false },
        settings: { read: true, write: false }
      };
      break;
    case 'viewer':
      permissions = {
        devices: { read: true, write: false, delete: false, ptz: false, record: false },
        users: { read: false, write: false, delete: false },
        streams: { read: true, write: false, delete: false },
        recordings: { read: true, write: false, delete: false },
        motion_events: { read: true, write: false, delete: false },
        settings: { read: false, write: false }
      };
      break;
  }

  return permissions;
};

// Main seed database function
const seedDatabase = async (db) => {
  try {
    logger.info('🌱 Starting database seeding...');

    const dbType = getDatabaseType(db);
    logger.info(`   Database type detected: ${dbType}`);

    // Get current table schema
    const userColumns = await getTableSchema(db, 'users');

    if (!userColumns || userColumns.length === 0) {
      logger.warn('⚠️ Users table not found or empty schema');
      return { created: 0, skipped: 0, error: 'Users table not found' };
    }

    const columnNames = userColumns.map(col => col.name);
    logger.info(`📋 Users table columns: ${columnNames.join(', ')}`);

    // Check if users already exist
    const existingUsers = await getAllRows(db, 'SELECT email FROM users', []);
    const existingEmails = existingUsers.map(user => user.email);
    logger.info(`📊 Found ${existingUsers.length} existing users in database`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const userData of demoUsers) {
      if (existingEmails.includes(userData.email)) {
        logger.info(`⏭️ Skipping ${userData.email} - already exists`);
        skippedCount++;
        continue;
      }

      try {
        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(userData.password, saltRounds);

        // Get permissions based on role
        const permissions = getPermissionsByRole(userData.role);

        // Generate user ID
        const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Get timestamps
        const now = getCurrentTimestamp(dbType);

        // Build query dynamically based on available columns
        const baseColumns = ['id', 'email', 'password_hash', 'name', 'role', 'permissions', 'created_at', 'updated_at', 'active'];
        const baseValues = [userId, userData.email, passwordHash, userData.name, userData.role, JSON.stringify(permissions), now, now, 1];

        // Add optional columns if they exist
        const optionalColumns = [
          { name: 'session_timeout', value: 3600 },
          { name: 'last_activity', value: now },
          { name: 'failed_login_attempts', value: 0 },
          { name: 'last_login', value: null }
        ];

        const finalColumns = [...baseColumns];
        const finalValues = [...baseValues];

        for (const optional of optionalColumns) {
          if (columnNames.includes(optional.name)) {
            finalColumns.push(optional.name);
            finalValues.push(optional.value);
          }
        }

        const placeholders = finalValues.map(() => '?').join(', ');
        const insertQuery = `INSERT INTO users (${finalColumns.join(', ')}) VALUES (${placeholders})`;

        await executeQuery(db, insertQuery, finalValues);

        logger.info(`✅ Created demo user: ${userData.email} (${userData.role})`);
        createdCount++;

      } catch (error) {
        // Check if it's a duplicate key error
        if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('UNIQUE constraint failed')) {
          logger.info(`ℹ️ User ${userData.email} already exists, skipping`);
          skippedCount++;
        } else {
          logger.error(`❌ Failed to create user ${userData.email}:`, error.message);

          // Try fallback with minimal columns
          try {
            logger.info(`🔄 Attempting fallback creation for ${userData.email}...`);

            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(userData.password, saltRounds);
            const now = getCurrentTimestamp(dbType);
            const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // Use only guaranteed columns
            const fallbackQuery = `
              INSERT INTO users (id, email, password_hash, name, role, permissions, created_at, updated_at, active) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await executeQuery(db, fallbackQuery, [
              userId, userData.email, passwordHash, userData.name, userData.role,
              JSON.stringify(getPermissionsByRole(userData.role)), now, now, 1
            ]);

            logger.info(`✅ Created demo user (fallback): ${userData.email} (${userData.role})`);
            createdCount++;

          } catch (fallbackError) {
            if (fallbackError.code === 'ER_DUP_ENTRY' || fallbackError.message?.includes('UNIQUE constraint failed')) {
              logger.info(`ℹ️ User ${userData.email} already exists (fallback), skipping`);
              skippedCount++;
            } else {
              logger.error(`❌ Fallback creation also failed for ${userData.email}:`, fallbackError.message);
            }
          }
        }
      }
    }

    logger.info(`🌱 Database seeding completed: ${createdCount} created, ${skippedCount} skipped`);

    if (createdCount > 0) {
      logger.info('📋 Demo Credentials Available:');
      demoUsers.forEach(user => {
        logger.info(`   ${user.role.padEnd(8)} | ${user.email.padEnd(20)} | ${user.password}`);
      });
    }

    // Test user authentication after seeding
    if (createdCount > 0) {
      try {
        logger.info('🧪 Testing demo user authentication...');

        const testUser = await getRow(db, 'SELECT * FROM users WHERE email = ?', ['admin@local.dev']);

        if (testUser) {
          logger.info('✅ Demo user authentication test passed');
        } else {
          logger.warn('⚠️ Demo user not found after creation');
        }

      } catch (testError) {
        logger.warn('⚠️ Demo user authentication test failed:', testError.message);
      }
    }

    return { created: createdCount, skipped: skippedCount };

  } catch (error) {
    logger.error('❌ Database seeding failed:', `-`, error);

    // Don't throw the error - let the server continue without demo users
    logger.warn('⚠️ Continuing server startup without demo users');
    return { created: 0, skipped: 0, error: error.message };
  }
};

/**
 * Verify demo users are accessible
 */
const verifyDemoUsers = async (db) => {
  try {
    logger.info('🔍 Verifying demo users...');

    const users = await getAllRows(db, 'SELECT email, name, role FROM users WHERE email LIKE "%@local.dev"', []);

    logger.info(`✅ Found ${users.length} demo users:`);
    users.forEach(user => {
      logger.info(`   • ${user.email} (${user.role})`);
    });

    return users;

  } catch (error) {
    logger.error('❌ Demo user verification failed:', error);
    return [];
  }
};

module.exports = {
  seedDatabase,
  verifyDemoUsers,
  demoUsers: demoUsers.map(u => ({ email: u.email, password: u.password, name: u.name, role: u.role }))
};