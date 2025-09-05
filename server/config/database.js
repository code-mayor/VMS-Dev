const mysql = require('mysql2/promise');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { logger } = require('../utils/logger');
require('dotenv').config();

class DatabaseConnection {
    constructor() {
        this.connection = null;
        this.dbType = process.env.DB_TYPE || 'sqlite';
    }

    async connect() {
        if (this.dbType === 'mysql') {
            return this.connectMySQL();
        } else {
            return this.connectSQLite();
        }
    }

    async connectMySQL() {
        try {
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'onvif_vms',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 0
            });

            logger.info('✅ Connected to MySQL database');
            return this.connection;
        } catch (error) {
            logger.error('❌ MySQL connection error:', error);
            throw error;
        }
    }

    connectSQLite() {
        return new Promise((resolve, reject) => {
            const dbPath = path.join(__dirname, '..', 'onvif_vms.db');
            const db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    logger.error('❌ SQLite connection error:', err);
                    reject(err);
                } else {
                    logger.info('✅ Connected to SQLite database');
                    this.connection = db;
                    resolve(db);
                }
            });
        });
    }

    async query(sql, params = []) {
        if (this.dbType === 'mysql') {
            const [results] = await this.connection.execute(sql, params);
            return results;
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
        if (this.dbType === 'mysql') {
            const [results] = await this.connection.execute(sql, params);
            return results[0];
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
        if (this.dbType === 'mysql') {
            const [result] = await this.connection.execute(sql, params);
            return result;
        } else {
            return new Promise((resolve, reject) => {
                this.connection.run(sql, params, function (err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID, changes: this.changes });
                });
            });
        }
    }

    async close() {
        if (this.connection) {
            if (this.dbType === 'mysql') {
                await this.connection.end();
            } else {
                this.connection.close();
            }
            logger.info('Database connection closed');
        }
    }
}

module.exports = { DatabaseConnection };