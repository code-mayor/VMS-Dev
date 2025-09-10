const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const { logger } = require('../utils/logger');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function resetDatabase() {
    try {
        logger.info('🗑️ Starting database reset...');

        const dbType = process.env.DB_TYPE || 'sqlite';

        if (dbType === 'sqlite') {
            // SQLite reset
            const dbPath = path.join(__dirname, '../data/onvif_vms.db');
            const db = new sqlite3.Database(dbPath);

            await new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run('DELETE FROM recordings', (err) => {
                        if (err) logger.warn('Recordings table might not exist:', err.message);
                    });
                    db.run('DELETE FROM devices', (err) => {
                        if (err) logger.warn('Devices table might not exist:', err.message);
                    });
                    db.run('DELETE FROM streams', (err) => {
                        if (err) logger.warn('Streams table might not exist:', err.message);
                    });
                    db.run("DELETE FROM sqlite_sequence", (err) => {
                        if (err) logger.warn('Could not reset sequence:', err.message);
                    });
                    resolve();
                });
            });

            db.close();
            logger.info('✅ SQLite database reset complete');

        } else if (dbType === 'mysql') {
            // MySQL reset with foreign key handling
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'onvif_vms'
            });

            // Disable foreign key checks temporarily
            await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

            // Clear tables
            await connection.execute('TRUNCATE TABLE recordings');
            await connection.execute('TRUNCATE TABLE devices');

            // Try to truncate streams if it exists
            try {
                await connection.execute('TRUNCATE TABLE streams');
            } catch (err) {
                logger.warn('Streams table might not exist:', err.message);
            }

            // Re-enable foreign key checks
            await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

            await connection.end();
            logger.info('✅ MySQL database reset complete');
        }

        process.exit(0);

    } catch (error) {
        logger.error('❌ Database reset failed:', error);
        process.exit(1);
    }
}

// Run the reset
resetDatabase();