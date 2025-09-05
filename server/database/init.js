const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const { logger } = require('../utils/logger');

class DatabaseInitializer {
  constructor() {
    this.dbPath = path.join(__dirname, '../../onvif_vms.db');
    this.db = null;
  }

  async initialize() {
    try {
      logger.info('Connected to SQLite database');
      
      // Create database connection
      this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          logger.error('Database connection error:', err);
          throw err;
        }
      });

      // Enable foreign keys and WAL mode for better performance
      await this.runQuery('PRAGMA foreign_keys = ON');
      await this.runQuery('PRAGMA journal_mode = WAL');

      // Create all tables
      await this.createTables();
      logger.info('All database tables created successfully');

      // Insert default data
      await this.insertDefaultData();
      logger.info('Default data inserted successfully');

      return this.db;
    } catch (error) {
      logger.error('Database initialization error:', error);
      throw error;
    }
  }

  async createTables() {
    // Users table
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
        permissions TEXT NOT NULL,
        session_timeout INTEGER DEFAULT 3600,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Devices table with RTSP credential support
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        port INTEGER DEFAULT 80,
        endpoint TEXT,
        manufacturer TEXT,
        model TEXT,
        hardware TEXT,
        location TEXT,
        onvif_profile TEXT DEFAULT 'S',
        types TEXT,
        scopes TEXT,
        capabilities TEXT,
        status TEXT DEFAULT 'discovered' CHECK (status IN ('discovered', 'connected', 'offline', 'online', 'authenticated')),
        recording_enabled BOOLEAN DEFAULT FALSE,
        motion_detection_enabled BOOLEAN DEFAULT FALSE,
        username TEXT,
        password TEXT,
        rtsp_username TEXT,
        rtsp_password TEXT,
        authenticated BOOLEAN DEFAULT FALSE,
        last_seen DATETIME,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User sessions table
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Audit logs table
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Device recordings table
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS device_recordings (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        duration INTEGER,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        trigger_type TEXT DEFAULT 'manual',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
      )
    `);

    // Motion events table
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS motion_events (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        confidence REAL,
        coordinates TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT FALSE,
        recording_triggered BOOLEAN DEFAULT FALSE,
        metadata TEXT,
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
      )
    `);

    // Custom events table
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS custom_events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        device_id TEXT,
        trigger_type TEXT NOT NULL,
        trigger_conditions TEXT NOT NULL,
        actions TEXT NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Device streams table
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS device_streams (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        stream_name TEXT NOT NULL,
        stream_url TEXT NOT NULL,
        stream_type TEXT NOT NULL CHECK (stream_type IN ('rtsp', 'http', 'mjpeg', 'hls')),
        resolution TEXT,
        fps INTEGER,
        bitrate INTEGER,
        codec TEXT,
        profile TEXT,
        is_primary BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_devices_ip_address ON devices (ip_address)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_motion_events_device_id ON motion_events (device_id)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_motion_events_timestamp ON motion_events (timestamp)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_user_sessions_access_token ON user_sessions (access_token)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at)');
  }

  async insertDefaultData() {
    // Check if users already exist
    const userCount = await this.getQuery('SELECT COUNT(*) as count FROM users');
    if (userCount.count > 0) {
      logger.info('Default users already exist, skipping user creation');
      return;
    }

    // Default user permissions
    const adminPermissions = JSON.stringify({
      devices: { read: true, write: true, delete: true, ptz: true, record: true },
      users: { read: true, write: true, delete: true },
      streams: { read: true, write: true, delete: true },
      settings: { read: true, write: true },
      recordings: { read: true, write: true, delete: true },
      motion_events: { read: true, write: true, delete: true }
    });

    const operatorPermissions = JSON.stringify({
      devices: { read: true, write: true, delete: false, ptz: true, record: true },
      users: { read: true, write: false, delete: false },
      streams: { read: true, write: true, delete: false },
      settings: { read: true, write: false },
      recordings: { read: true, write: true, delete: true },
      motion_events: { read: true, write: true, delete: false }
    });

    const viewerPermissions = JSON.stringify({
      devices: { read: true, write: false, delete: false, ptz: false, record: false },
      users: { read: false, write: false, delete: false },
      streams: { read: true, write: false, delete: false },
      settings: { read: false, write: false },
      recordings: { read: true, write: false, delete: false },
      motion_events: { read: true, write: false, delete: false }
    });

    // Generate bcrypt hashes for passwords
    logger.info('Generating secure password hashes...');
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const operatorPasswordHash = await bcrypt.hash('operator123', 10);
    const viewerPasswordHash = await bcrypt.hash('viewer123', 10);

    // Create default users with properly hashed passwords
    const users = [
      {
        id: 'admin-001',
        email: 'admin@local.dev',
        password: adminPasswordHash,
        name: 'System Administrator',
        role: 'admin',
        permissions: adminPermissions,
        session_timeout: 7200 // 2 hours
      },
      {
        id: 'operator-001',
        email: 'operator@local.dev',
        password: operatorPasswordHash,
        name: 'Camera Operator',
        role: 'operator',
        permissions: operatorPermissions,
        session_timeout: 3600 // 1 hour
      },
      {
        id: 'viewer-001',
        email: 'viewer@local.dev',
        password: viewerPasswordHash,
        name: 'Security Viewer',
        role: 'viewer',
        permissions: viewerPermissions,
        session_timeout: 1800 // 30 minutes
      }
    ];

    for (const user of users) {
      await this.runQuery(`
        INSERT INTO users (id, email, password, name, role, permissions, session_timeout)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [user.id, user.email, user.password, user.name, user.role, user.permissions, user.session_timeout]);
      
      logger.info(`Created user: ${user.email} (${user.role})`);
    }

    logger.info('Default users created successfully');
  }

  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('SQL execution error:', err);
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          logger.error('SQL query error:', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('SQL query error:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          logger.error('Database close error:', err);
        } else {
          logger.info('Database connection closed');
        }
      });
    }
  }
}

module.exports = { DatabaseInitializer };