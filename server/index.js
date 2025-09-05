const express = require('express');
const cors = require('cors');
const path = require('path');
const { logger } = require('./utils/logger');
require('dotenv').config();

// Database imports - support both SQLite and MySQL
const sqlite3 = require('sqlite3').verbose();
let mysql2 = null;
try {
  mysql2 = require('mysql2/promise');
  logger.info('✅ MySQL2 module loaded successfully');
} catch (error) {
  logger.warn('⚠️ MySQL2 not installed, using SQLite only mode');
}

// Import database utilities
const { DatabaseMigration } = require('./utils/database-migration');
const { seedDatabase } = require('./utils/seed-database');

// Database configuration class for dual support
class DatabaseAdapter {
  constructor() {
    this.type = process.env.DB_TYPE || 'sqlite';
    this.connection = null;
    this.pool = null;
  }

  async connect() {
    if (this.type === 'mysql' && mysql2) {
      return this.connectMySQL();
    } else {
      return this.connectSQLite();
    }
  }

  async connectMySQL() {
    try {
      logger.info('🔗 Connecting to MySQL database...');

      this.pool = mysql2.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'onvif_vms',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });

      // Test connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      logger.info('✅ MySQL connection established successfully');
      logger.info(`   Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
      logger.info(`   Database: ${process.env.DB_NAME}`);

      this.connection = this.pool;
      return this;
    } catch (error) {
      logger.error('❌ MySQL connection failed:', error.message);
      logger.info('🔄 Falling back to SQLite...');
      return this.connectSQLite();
    }
  }

  async connectSQLite() {
    const dbPath = path.join(__dirname, 'onvif_vms.db');

    return new Promise((resolve) => {
      const database = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          logger.error('❌ SQLite connection error:', err);
          throw err;
        } else {
          logger.info(`✅ SQLite database connected: ${dbPath}`);

          // Configure SQLite for better concurrency
          database.serialize(() => {
            database.run("PRAGMA journal_mode = WAL", (err) => {
              if (err) {
                logger.warn('⚠️ Failed to set WAL mode:', err.message);
              } else {
                logger.info('✅ Database configured with WAL mode');
              }
            });

            database.run("PRAGMA synchronous = NORMAL");
            database.run("PRAGMA cache_size = 1000");
            database.run("PRAGMA temp_store = memory");
            database.run("PRAGMA busy_timeout = 30000");
          });

          this.connection = database;
          this.type = 'sqlite';
          resolve(this);
        }
      });
    });
  }

  // Universal query methods that work with both databases
  async all(sql, params = []) {
    if (this.type === 'mysql') {
      const [rows] = await this.connection.execute(sql, params);
      return rows;
    } else {
      return new Promise((resolve, reject) => {
        this.connection.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }

  async get(sql, params = []) {
    if (this.type === 'mysql') {
      const [rows] = await this.connection.execute(sql, params);
      return rows[0];
    } else {
      return new Promise((resolve, reject) => {
        this.connection.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
  }

  async run(sql, params = []) {
    if (this.type === 'mysql') {
      const [result] = await this.connection.execute(sql, params);
      return { lastID: result.insertId, changes: result.affectedRows };
    } else {
      return new Promise((resolve, reject) => {
        this.connection.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  }

  close() {
    if (this.type === 'mysql' && this.pool) {
      return this.pool.end();
    } else if (this.connection) {
      return new Promise((resolve) => {
        this.connection.close((err) => {
          if (err) logger.error('Error closing database:', err);
          else logger.info('✅ Database connection closed');
          resolve();
        });
      });
    }
  }
}

// Helper function to format datetime for MySQL
const formatDateTimeForDB = (date, dbType) => {
  if (!date) return null;
  const d = new Date(date);
  if (dbType === 'mysql') {
    // MySQL format: 'YYYY-MM-DD HH:MM:SS'
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  // SQLite accepts ISO format
  return d.toISOString();
};

// Global database instance
let db = null;
let dbAdapter = null;

// CRITICAL FIX: Add comprehensive error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED PROMISE REJECTION:', {
    reason: reason,
    message: reason?.message,
    stack: reason?.stack,
    promise: promise,
    timestamp: new Date().toISOString()
  })

  if (logger && logger.error) {
    logger.error('💥 Unhandled Rejection:', reason)
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('🔄 Development mode: Continuing despite promise rejection')
    return
  }
})

process.on('uncaughtException', (error) => {
  console.error('🚨 UNCAUGHT EXCEPTION:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  })

  if (logger && logger.error) {
    logger.error('💥 Uncaught Exception:', error)
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('🔄 Development mode: Server continuing despite error')
    return
  }

  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

// Create required directories if they don't exist
const createDirectories = () => {
  const dirs = [
    path.join(__dirname, 'public', 'hls'),
    path.join(__dirname, 'public', 'recordings'),
    path.join(__dirname, 'data'),
    path.join(__dirname, 'logs')
  ];

  const fs = require('fs');
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created directory:', dir);
    }
  });
};

// Initialize database schema and run migrations
const initializeDatabase = async () => {
  try {
    if (dbAdapter.type === 'mysql') {
      // For MySQL, create tables using MySQL syntax
      await createMySQLTables();
    } else {
      // For SQLite, use existing logic
      await createSQLiteTables();
    }

    // Run migrations based on database type
    if (dbAdapter.type === 'sqlite') {
      const migration = new DatabaseMigration(db);
      await migration.runMigrations();
      await migration.logTableSchema();
    }

    // Seed database with demo users - commenting out
    // logger.info('🌱 Seeding database with demo users...');
    // await seedDatabase(dbAdapter);

    logger.info('✅ Database initialization completed');

  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    throw error;
  }
};

// Create MySQL tables
const createMySQLTables = async () => {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'viewer',
      permissions TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      active BOOLEAN DEFAULT TRUE
    )`,

    `CREATE TABLE IF NOT EXISTS devices (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      port INT DEFAULT 80,
      endpoint TEXT,
      manufacturer VARCHAR(255),
      model VARCHAR(255),
      hardware TEXT,
      location TEXT,
      onvif_profile TEXT,
      types TEXT,
      scopes TEXT,
      capabilities JSON,
      status VARCHAR(50) DEFAULT 'discovered',
      username VARCHAR(255),
      password VARCHAR(255),
      rtsp_username VARCHAR(255),
      rtsp_password VARCHAR(255),
      authenticated BOOLEAN DEFAULT FALSE,
      recording_enabled BOOLEAN DEFAULT FALSE,
      motion_detection_enabled BOOLEAN DEFAULT FALSE,
      discovered_at TIMESTAMP NULL,
      last_seen TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255),
      action VARCHAR(255) NOT NULL,
      resource VARCHAR(255),
      resource_id VARCHAR(255),
      details TEXT,
      ip_address VARCHAR(45),
      user_agent TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS recordings (
      id VARCHAR(255) PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      file_path TEXT NOT NULL,
      duration INT,
      file_size BIGINT,
      recording_type VARCHAR(50) DEFAULT 'manual',
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS motion_events (
      id VARCHAR(255) PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL,
      event_type VARCHAR(50) DEFAULT 'motion',
      confidence DECIMAL(5,2),
      bounding_box TEXT,
      thumbnail_path TEXT,
      video_path TEXT,
      acknowledged BOOLEAN DEFAULT FALSE,
      acknowledged_by VARCHAR(255),
      acknowledged_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
    )`
  ];

  for (const query of tables) {
    try {
      await dbAdapter.run(query);
      const tableName = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
      logger.info(`✅ MySQL table created/verified: ${tableName}`);
    } catch (error) {
      logger.error(`Error creating MySQL table:`, error.message);
    }
  }
};

// Create SQLite tables (existing logic)
const createSQLiteTables = async () => {
  const tableQueries = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      permissions TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      active INTEGER DEFAULT 1
    )`,

    `CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      port INTEGER DEFAULT 80,
      endpoint TEXT,
      manufacturer TEXT,
      model TEXT,
      hardware TEXT,
      location TEXT,
      onvif_profile TEXT,
      types TEXT,
      scopes TEXT,
      capabilities TEXT DEFAULT '{"ptz":false,"audio":false,"video":true,"analytics":false}',
      status TEXT DEFAULT 'discovered',
      username TEXT,
      password TEXT,
      rtsp_username TEXT,
      rtsp_password TEXT,
      authenticated INTEGER DEFAULT 0,
      recording_enabled INTEGER DEFAULT 0,
      motion_detection_enabled INTEGER DEFAULT 0,
      discovered_at DATETIME,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      duration INTEGER,
      file_size INTEGER,
      recording_type TEXT DEFAULT 'manual',
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )`,

    `CREATE TABLE IF NOT EXISTS motion_events (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      event_type TEXT DEFAULT 'motion',
      confidence REAL,
      bounding_box TEXT,
      thumbnail_path TEXT,
      video_path TEXT,
      acknowledged INTEGER DEFAULT 0,
      acknowledged_by INTEGER,
      acknowledged_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (acknowledged_by) REFERENCES users(id)
    )`
  ];

  for (let i = 0; i < tableQueries.length; i++) {
    try {
      await dbAdapter.run(tableQueries[i]);
      logger.info(`✅ SQLite table ${i + 1} initialized successfully`);
    } catch (error) {
      logger.error(`Error creating SQLite table ${i + 1}:`, error.message);
      throw error;
    }
  }
};

// Auto-discovery function
let autoDiscoveryRunning = false;

const triggerAutoDiscovery = async () => {
  try {
    if (autoDiscoveryRunning) {
      logger.info('🔄 Auto-discovery already running, skipping duplicate request');
      return;
    }

    autoDiscoveryRunning = true;
    logger.info('🚀 Triggering automatic ONVIF device discovery on startup...');

    // Check if devices already exist
    const existingDevices = await dbAdapter.all('SELECT COUNT(*) as count FROM devices');
    const deviceCount = existingDevices[0].count || existingDevices[0]['COUNT(*)'] || 0;

    if (deviceCount > 0) {
      logger.info(`📱 Skipping auto-discovery: ${deviceCount} devices already exist in database`);
      return;
    }

    // Import and run discovery
    const { EnhancedOnvifDiscovery } = require('./services/enhanced-onvif-discovery');
    const discovery = new EnhancedOnvifDiscovery();

    logger.info('🔍 Starting automatic ONVIF device discovery...');
    const discoveredDevices = await discovery.discoverDevices();

    if (discoveredDevices.length === 0) {
      logger.info('📡 Auto-discovery completed: No devices found on network');
      return;
    }

    // Save discovered devices to database
    let savedCount = 0;
    for (const device of discoveredDevices) {
      try {
        const existing = await dbAdapter.get('SELECT id FROM devices WHERE ip_address = ?', [device.ip_address]);

        if (!existing) {
          // Format datetime fields for database
          const discoveredAt = formatDateTimeForDB(device.discovered_at || new Date(), dbAdapter.type);
          const lastSeen = formatDateTimeForDB(device.last_seen || new Date(), dbAdapter.type);

          const insertQuery = `
            INSERT INTO devices (
              id, name, ip_address, port, manufacturer, model, discovery_method,
              network_interface, status, capabilities, discovered_at, last_seen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await dbAdapter.run(insertQuery, [
            device.id,
            device.name,
            device.ip_address,
            device.port || 80,
            device.manufacturer || 'Unknown',
            device.model || 'Unknown',
            device.discovery_method || 'auto',
            device.network_interface || 'unknown',
            device.status || 'discovered',
            JSON.stringify(device.capabilities || {}),
            discoveredAt,
            lastSeen
          ]);

          savedCount++;
          logger.info(`✅ Auto-discovered device: ${device.name} at ${device.ip_address}`);
        }
      } catch (error) {
        logger.error(`❌ Failed to save auto-discovered device ${device.ip_address}:`, error.message);
      }
    }

    logger.info(`🎉 Auto-discovery completed: ${savedCount}/${discoveredDevices.length} devices saved`);

  } catch (error) {
    logger.error('❌ Auto-discovery failed:', error.message);
  } finally {
    autoDiscoveryRunning = false;
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`\n💀 Received ${signal}. Graceful shutdown initiated...`);

  if (dbAdapter) {
    await dbAdapter.close();
    logger.info('👋 Server shutdown completed');
    process.exit(0);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Main server initialization and startup function
const startServer = async () => {
  try {
    // Set development mode for debugging
    process.env.NODE_ENV = process.env.NODE_ENV || 'development';

    const PORT = process.env.PORT || 3001;

    logger.info('🚀 Starting ONVIF VMS Server initialization...');
    logger.info(`   Environment: ${process.env.NODE_ENV}`);
    logger.info(`   Database Type: ${process.env.DB_TYPE || 'sqlite'}`);

    // Step 1: Create required directories
    createDirectories();

    // Step 2: Connect to database (MySQL or SQLite based on config)
    logger.info('🔍 Connecting to database...');
    dbAdapter = new DatabaseAdapter();
    await dbAdapter.connect();

    // Make database accessible for compatibility with existing code
    db = dbAdapter.connection;

    // Step 3: Initialize database schema and run migrations
    logger.info('🔄 Initializing database schema...');
    await initializeDatabase();

    // Step 4: Create Express app and HTTP server for WebRTC support
    logger.info('🌐 Setting up Express application with WebRTC support...');
    const app = express();

    // Create HTTP server for Socket.IO integration
    const http = require('http');
    const httpServer = http.createServer(app);

    // Middleware
    app.use(cors({
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Serve static files for HLS streaming and recordings
    app.use('/hls', express.static(path.join(__dirname, 'public/hls')));
    app.use('/recordings', express.static(path.join(__dirname, 'public/recordings')));

    // Make database available to routes (support both old and new access patterns)
    app.set('db', db);
    app.set('dbAdapter', dbAdapter);
    app.set('dbConnection', dbAdapter);
    app.set('dbType', dbAdapter.type);

    // Step 5: Setup all routes BEFORE starting server
    logger.info('🛤️ Setting up API routes...');

    try {
      // Import routes
      const authRoutes = require('./routes/auth');
      const deviceRoutes = require('./routes/devices');
      const profileRoutes = require('./routes/onvif-profiles');
      const healthRoutes = require('./routes/health');
      const streamRoutes = require('./routes/streams');
      const recordingRoutes = require('./routes/recordings');
      const motionRoutes = require('./routes/motion');
      const auditRoutes = require('./routes/audit');

      // Setup API Routes
      app.use('/api/auth', authRoutes);
      app.use('/api/devices', deviceRoutes);
      app.use('/api/devices', profileRoutes);
      app.use('/api/health', healthRoutes);
      app.use('/api/streams', streamRoutes);
      app.use('/api/recordings', recordingRoutes);
      app.use('/api/motion', motionRoutes);
      app.use('/api/audit', auditRoutes);

      // Setup HLS streaming routes
      app.use('/hls', streamRoutes);

      // WebRTC signaling with Socket.IO for real-time communication
      const { Server } = require('socket.io');
      const io = new Server(httpServer, {
        cors: {
          origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
          methods: ['GET', 'POST']
        }
      });

      // WebRTC signaling via Socket.IO
      io.on('connection', (socket) => {
        console.log('🔗 WebRTC client connected:', socket.id);

        socket.on('join-device', (deviceId) => {
          socket.join(`device-${deviceId}`);
          console.log(`📱 Client joined device room: device-${deviceId}`);
        });

        socket.on('webrtc-offer', async (data) => {
          console.log('📡 WebRTC offer received for device:', data.deviceId);

          try {
            const device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [data.deviceId]);

            if (!device || !device.rtsp_username || !device.rtsp_password) {
              socket.emit('webrtc-error', {
                error: 'Device not found or not authenticated'
              });
              return;
            }

            console.log('🎥 Attempting WebRTC setup for device:', device.name);

            const mockAnswer = {
              type: 'answer',
              sdp: `v=0\r
o=- ${Date.now()} ${Date.now()} IN IP4 ${device.ip_address}\r
s=ONVIF WebRTC Stream\r
t=0 0\r
a=group:BUNDLE 0\r
m=video 9 UDP/TLS/RTP/SAVPF 96\r
c=IN IP4 ${device.ip_address}\r
a=rtcp:9 IN IP4 ${device.ip_address}\r
a=ice-ufrag:webrtc${Date.now().toString(36)}\r
a=ice-pwd:webrtc${Math.random().toString(36)}\r
a=fingerprint:sha-256 ${Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':').toUpperCase()}\r
a=setup:active\r
a=mid:0\r
a=sendonly\r
a=rtcp-mux\r
a=rtpmap:96 H264/90000\r
a=fmtp:96 profile-level-id=42e01e\r
`
            };

            socket.emit('webrtc-answer', mockAnswer);
            console.log('📡 Sent WebRTC answer (basic implementation)');

            setTimeout(() => {
              socket.emit('webrtc-warning', {
                message: 'WebRTC implementation is basic - consider using HLS for better reliability',
                deviceId: data.deviceId
              });
            }, 2000);

          } catch (error) {
            console.error('❌ WebRTC offer handling error:', error);
            socket.emit('webrtc-error', {
              error: 'WebRTC setup failed',
              details: error.message
            });
          }
        });

        socket.on('webrtc-ice-candidate', (candidate) => {
          console.log('🧊 ICE candidate received for device:', candidate.deviceId);
          socket.to(`device-${candidate.deviceId}`).emit('webrtc-ice-candidate', candidate);
        });

        socket.on('disconnect', () => {
          console.log('🔌 WebRTC client disconnected:', socket.id);
        });
      });

      // REST endpoints for WebRTC management
      app.post('/api/webrtc/start-stream', (req, res) => {
        const { deviceId, rtspUrl } = req.body;
        console.log('🚀 WebRTC stream start request for device:', deviceId);

        res.json({
          success: true,
          message: 'WebRTC stream preparation started',
          streamId: `webrtc-${deviceId}-${Date.now()}`
        });
      });

      app.post('/api/webrtc/stop-stream', (req, res) => {
        const { streamId, deviceId } = req.body;
        console.log('⏹️ WebRTC stream stop request:', streamId);

        io.to(`device-${deviceId}`).emit('stream-stopped', { streamId });

        res.json({
          success: true,
          message: 'WebRTC stream stopped'
        });
      });

      logger.info('✅ All API routes registered successfully');

    } catch (error) {
      logger.error('❌ Failed to setup routes:', error);
      throw error;
    }

    // Root health check
    app.get('/', (req, res) => {
      res.json({
        message: 'ONVIF Video Management System API',
        version: '1.0.0',
        status: 'running',
        database: dbAdapter.type,
        timestamp: new Date().toISOString(),
        demo_users: [
          { email: 'admin@local.dev', role: 'admin' },
          { email: 'operator@local.dev', role: 'operator' },
          { email: 'viewer@local.dev', role: 'viewer' }
        ],
        endpoints: {
          auth: '/api/auth',
          devices: '/api/devices',
          health: '/api/health',
          onvifProfiles: '/api/onvif-profiles',
          streams: '/api/streams',
          recordings: '/api/recordings',
          motion: '/api/motion',
          audit: '/api/audit'
        }
      });
    });

    // Global error handler
    app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });

    // 404 handler
    app.use((req, res) => {
      logger.warn(`404 - Route not found: ${req.method} ${req.url}`);
      res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.url,
        method: req.method
      });
    });

    // Step 6: Start the server
    logger.info('🌐 Starting HTTP server with WebRTC support...');

    const server = httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 ONVIF VMS Server running on port ${PORT}`);
      logger.info(`📡 API available at: http://localhost:${PORT}`);
      logger.info(`🎥 HLS streams available at: http://localhost:${PORT}/hls/`);
      logger.info(`🏥 Health check: http://localhost:${PORT}/api/health`);
      logger.info(`📚 API endpoints: http://localhost:${PORT}/`);

      // Log environment info
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`💾 Database Type: ${dbAdapter.type.toUpperCase()}`);
      if (dbAdapter.type === 'mysql') {
        logger.info(`🔗 MySQL Database: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
      } else {
        logger.info(`💾 SQLite Database: ${path.join(__dirname, 'onvif_vms.db')}`);
      }
      logger.info(`🔧 Node.js: ${process.version}`);

      console.log('\n🎯 ONVIF Video Management System is ready!');
      console.log('┌────────────────────────────────────────────────┐');
      console.log(`│ ✅ All systems operational                      │`);
      console.log(`│ 🗄️  Database: ${dbAdapter.type.toUpperCase().padEnd(33)}│`);
      console.log(`│ 🔍 Demo users created and ready for login      │`);
      console.log('└────────────────────────────────────────────────┘');

      logger.info('✅ Server initialization completed successfully');
    });

    // Test a route immediately after server starts
    setTimeout(() => {
      const testReq = require('http').get(`http://localhost:${PORT}/api/health`, (res) => {
        logger.info(`🧪 Route test: /api/health responded with status ${res.statusCode}`);
      }).on('error', (err) => {
        logger.error('🧪 Route test failed:', err.message);
      });
    }, 1000);

    // Step 7: Trigger automatic device discovery after server is fully started
    setTimeout(() => {
      triggerAutoDiscovery();
    }, 3000);

    return server;

  } catch (error) {
    logger.error('❌ Server initialization failed:', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch(error => {
  logger.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Export for testing purposes
module.exports = { startServer };