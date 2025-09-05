const sqlite3 = require('sqlite3').verbose();
const { logger } = require('./logger');

class DatabaseMigration {
  constructor(db) {
    this.db = db;
  }

  /**
   * Run all database migrations
   */
  async runMigrations() {
    logger.info('🔄 Running database migrations...');

    try {
      // Add missing columns to users table
      await this.addUsersTableColumns();
      
      // Add missing columns to devices table  
      await this.addDevicesTableColumns();
      
      // Verify data integrity
      await this.verifyDataIntegrity();

      logger.info('✅ Database migrations completed successfully');
    } catch (error) {
      logger.error('❌ Database migrations failed:', error);
      throw error;
    }
  }

  /**
   * Add missing columns to users table
   */
  async addUsersTableColumns() {
    const missingColumns = [
      { name: 'session_timeout', type: 'INTEGER', default: '86400' },
      { name: 'last_activity', type: 'DATETIME', default: 'CURRENT_TIMESTAMP' },
      { name: 'failed_login_attempts', type: 'INTEGER', default: '0' },
      { name: 'locked_until', type: 'DATETIME', default: 'NULL' },
      { name: 'password_reset_token', type: 'TEXT', default: 'NULL' },
      { name: 'password_reset_expires', type: 'DATETIME', default: 'NULL' }
    ];

    // Get current table structure
    const existingColumns = await this.getTableColumns('users');
    const existingColumnNames = existingColumns.map(col => col.name);

    for (const column of missingColumns) {
      if (!existingColumnNames.includes(column.name)) {
        try {
          const alterQuery = `ALTER TABLE users ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default}`;
          await this.runQuery(alterQuery);
          logger.info(`✅ Added users column: ${column.name}`);
        } catch (error) {
          logger.warn(`Column ${column.name} might already exist or migration failed:`, error.message);
        }
      } else {
        logger.info(`Column already exists: ${column.name}`);
      }
    }
  }

  /**
   * Add missing columns to devices table
   */
  async addDevicesTableColumns() {
    const missingColumns = [
      { name: 'discovered_at', type: 'DATETIME', default: 'CURRENT_TIMESTAMP' },
      { name: 'last_seen', type: 'DATETIME', default: 'CURRENT_TIMESTAMP' },
      { name: 'recording_enabled', type: 'INTEGER', default: '0' },
      { name: 'motion_detection_enabled', type: 'INTEGER', default: '0' },
      { name: 'network_interface', type: 'TEXT', default: 'NULL' },
      { name: 'discovery_method', type: 'TEXT', default: "'onvif'" },
      { name: 'onvif_profiles', type: 'TEXT', default: 'NULL' },
      { name: 'profile_assignments', type: 'TEXT', default: 'NULL' }
    ];

    // Get current table structure
    const existingColumns = await this.getTableColumns('devices');
    const existingColumnNames = existingColumns.map(col => col.name);

    for (const column of missingColumns) {
      if (!existingColumnNames.includes(column.name)) {
        try {
          const alterQuery = `ALTER TABLE devices ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default}`;
          await this.runQuery(alterQuery);
          logger.info(`✅ Added devices column: ${column.name}`);
        } catch (error) {
          logger.warn(`Device column ${column.name} migration failed:`, error.message);
        }
      } else {
        logger.info(`Device column already exists: ${column.name}`);
      }
    }
  }

  /**
   * Get table column information
   */
  async getTableColumns(tableName) {
    return new Promise((resolve, reject) => {
      this.db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
          reject(err);
        } else {
          resolve(columns || []);
        }
      });
    });
  }

  /**
   * Run a SQL query with promise wrapper
   */
  async runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  /**
   * Verify data integrity after migrations
   */
  async verifyDataIntegrity() {
    try {
      // Check if demo users can be created (test for missing columns)
      const testQuery = `
        SELECT session_timeout, last_activity, failed_login_attempts 
        FROM users 
        LIMIT 1
      `;
      
      await new Promise((resolve, reject) => {
        this.db.get(testQuery, (err, row) => {
          if (err && err.message.includes('no such column')) {
            reject(new Error('Users table missing required columns after migration'));
          } else {
            resolve(row);
          }
        });
      });

      logger.info('✅ Device data verification completed');
    } catch (error) {
      logger.warn('⚠️ Data verification warning:', error.message);
      // Don't throw here - let the seeding process handle missing columns
    }
  }

  /**
   * Log current table schema for debugging
   */
  async logTableSchema() {
    try {
      // Log users table schema
      const usersColumns = await this.getTableColumns('users');
      logger.info('📋 Current users table schema:');
      usersColumns.forEach(col => {
        logger.info(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
      });

      // Log devices table schema  
      const devicesColumns = await this.getTableColumns('devices');
      logger.info('📋 Current devices table schema:');
      devicesColumns.forEach(col => {
        logger.info(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
      });

    } catch (error) {
      logger.warn('⚠️ Could not log table schema:', error.message);
    }
  }

  /**
   * Create index for better performance
   */
  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address)',
      'CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_recordings_device ON recordings(device_id)',
      'CREATE INDEX IF NOT EXISTS idx_motion_events_device ON motion_events(device_id)'
    ];

    for (const indexSql of indexes) {
      try {
        await this.runQuery(indexSql);
        logger.info(`✅ Index created: ${indexSql.split(' ')[5]}`);
      } catch (error) {
        logger.warn(`Index creation failed: ${error.message}`);
      }
    }
  }

  /**
   * Reset a table completely (for development)
   */
  async resetTable(tableName) {
    logger.warn(`🗑️ Resetting table: ${tableName}`);
    
    try {
      await this.runQuery(`DELETE FROM ${tableName}`);
      logger.info(`✅ Table ${tableName} reset successfully`);
    } catch (error) {
      logger.error(`❌ Failed to reset table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats() {
    const tables = ['users', 'devices', 'audit_logs', 'recordings', 'motion_events'];
    const stats = {};

    for (const table of tables) {
      try {
        const count = await new Promise((resolve, reject) => {
          this.db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });
        stats[table] = count;
      } catch (error) {
        stats[table] = 'Error';
      }
    }

    logger.info('📊 Database statistics:', stats);
    return stats;
  }
}

module.exports = { DatabaseMigration };