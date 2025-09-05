const mysql = require('mysql2/promise');
const { logger } = require('./logger');
require('dotenv').config();

class MySQLMigration {
    constructor() {
        this.connection = null;
    }

    async connect() {
        this.connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'onvif_vms'
        });
        logger.info('Connected to MySQL for migration');
    }

    async createTables() {
        const tables = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'operator', 'viewer') DEFAULT 'viewer',
        permissions JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        active BOOLEAN DEFAULT TRUE,
        INDEX idx_email (email),
        INDEX idx_role (role)
      )`,

            // Devices table
            `CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(36) PRIMARY KEY,
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
        status ENUM('online', 'offline', 'unknown', 'discovered') DEFAULT 'discovered',
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        onvif_profiles JSON,
        profile_assignments JSON,
        discovery_method VARCHAR(50),
        network_interface VARCHAR(50),
        INDEX idx_ip (ip_address),
        INDEX idx_status (status)
      )`,

            // Audit logs table
            `CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36),
        action VARCHAR(255) NOT NULL,
        resource VARCHAR(255),
        resource_id VARCHAR(36),
        details TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_user (user_id),
        INDEX idx_timestamp (timestamp)
      )`,

            // Recordings table
            `CREATE TABLE IF NOT EXISTS recordings (
        id VARCHAR(36) PRIMARY KEY,
        device_id VARCHAR(36) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        duration INT,
        file_size BIGINT,
        recording_type ENUM('manual', 'scheduled', 'motion', 'continuous') DEFAULT 'manual',
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        INDEX idx_device (device_id),
        INDEX idx_start_time (start_time)
      )`,

            // Motion events table
            `CREATE TABLE IF NOT EXISTS motion_events (
        id VARCHAR(36) PRIMARY KEY,
        device_id VARCHAR(36) NOT NULL,
        event_type VARCHAR(50) DEFAULT 'motion',
        confidence DECIMAL(5,2),
        bounding_box JSON,
        thumbnail_path TEXT,
        video_path TEXT,
        acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_by VARCHAR(36),
        acknowledged_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_device (device_id),
        INDEX idx_created (created_at)
      )`,

            // Sessions table
            `CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        token VARCHAR(512) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_expires (expires_at)
      )`,

            // Device streams table
            `CREATE TABLE IF NOT EXISTS device_streams (
        id VARCHAR(36) PRIMARY KEY,
        device_id VARCHAR(36) NOT NULL,
        stream_name VARCHAR(255) NOT NULL,
        stream_url TEXT NOT NULL,
        stream_type ENUM('rtsp', 'http', 'mjpeg', 'hls') NOT NULL,
        resolution VARCHAR(20),
        fps INT,
        bitrate INT,
        codec VARCHAR(50),
        profile VARCHAR(50),
        is_primary BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        INDEX idx_device_stream (device_id, is_primary)
      )`,

            // Custom events table
            `CREATE TABLE IF NOT EXISTS custom_events (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        device_id VARCHAR(36),
        trigger_type VARCHAR(50) NOT NULL,
        trigger_conditions JSON NOT NULL,
        actions JSON NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )`,

            // Presets table
            `CREATE TABLE IF NOT EXISTS presets (
        id VARCHAR(36) PRIMARY KEY,
        device_id VARCHAR(36) NOT NULL,
        profile_token VARCHAR(255) NOT NULL,
        preset_token VARCHAR(255) NOT NULL,
        preset_name VARCHAR(255) NOT NULL,
        position JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        INDEX idx_device_preset (device_id, profile_token)
      )`,

            // Analytics events table
            `CREATE TABLE IF NOT EXISTS analytics_events (
        id VARCHAR(36) PRIMARY KEY,
        device_id VARCHAR(36) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        rule_name VARCHAR(255),
        confidence DECIMAL(5,2),
        metadata JSON,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        INDEX idx_device_event (device_id, event_type),
        INDEX idx_timestamp (timestamp)
      )`,

            // System logs table
            `CREATE TABLE IF NOT EXISTS system_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        level ENUM('error', 'warn', 'info', 'debug') NOT NULL,
        category VARCHAR(50),
        message TEXT NOT NULL,
        metadata JSON,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_level (level),
        INDEX idx_timestamp (timestamp),
        INDEX idx_category (category)
      )`
        ];

        for (const query of tables) {
            try {
                await this.connection.execute(query);
                const tableName = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
                logger.info(`✅ Table created/verified: ${tableName}`);
            } catch (error) {
                logger.error(`❌ Error creating table:`, error.message);
                throw error;
            }
        }
    }

    async seedDefaultData() {
        // Check if users exist
        const [users] = await this.connection.execute('SELECT COUNT(*) as count FROM users');

        if (users[0].count === 0) {
            const bcrypt = require('bcryptjs');

            const defaultUsers = [
                {
                    id: 'admin-001',
                    email: 'admin@vms.local',
                    password: await bcrypt.hash('admin123', 10),
                    name: 'System Administrator',
                    role: 'admin',
                    permissions: JSON.stringify(['all'])
                },
                {
                    id: 'operator-001',
                    email: 'operator@vms.local',
                    password: await bcrypt.hash('operator123', 10),
                    name: 'System Operator',
                    role: 'operator',
                    permissions: JSON.stringify(['view', 'control', 'record'])
                },
                {
                    id: 'viewer-001',
                    email: 'viewer@vms.local',
                    password: await bcrypt.hash('viewer123', 10),
                    name: 'System Viewer',
                    role: 'viewer',
                    permissions: JSON.stringify(['view'])
                }
            ];

            for (const user of defaultUsers) {
                await this.connection.execute(
                    'INSERT INTO users (id, email, password_hash, name, role, permissions) VALUES (?, ?, ?, ?, ?, ?)',
                    [user.id, user.email, user.password, user.name, user.role, user.permissions]
                );
                logger.info(`✅ Created default user: ${user.email}`);
            }
        }
    }

    async migrate() {
        try {
            await this.connect();
            logger.info('🚀 Starting MySQL migration...');

            await this.createTables();
            await this.seedDefaultData();

            logger.info('✅ MySQL migration completed successfully');
            await this.connection.end();
        } catch (error) {
            logger.error('❌ Migration failed:', error);
            if (this.connection) {
                await this.connection.end();
            }
            throw error;
        }
    }
}

// Run migration if executed directly
if (require.main === module) {
    const migration = new MySQLMigration();
    migration.migrate().catch(console.error);
}

module.exports = { MySQLMigration };