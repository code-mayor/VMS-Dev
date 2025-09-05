const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixColumns() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'onvif_vms'
    });

    try {
        // Add missing columns
        console.log('Adding missing columns...');

        try {
            await connection.execute('ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0');
            console.log('✅ Added failed_login_attempts column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('✓ failed_login_attempts column already exists');
            } else {
                console.error('Error:', e.message);
            }
        }

        try {
            await connection.execute('ALTER TABLE users ADD COLUMN locked_until TIMESTAMP NULL DEFAULT NULL');
            console.log('✅ Added locked_until column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('✓ locked_until column already exists');
            } else {
                console.error('Error:', e.message);
            }
        }

        // Verify structure
        const [columns] = await connection.execute('SHOW COLUMNS FROM users');
        console.log('\nCurrent users table structure:');
        columns.forEach(col => {
            console.log(`  - ${col.Field}: ${col.Type}`);
        });

        console.log('\n✅ Database structure fixed');

    } finally {
        await connection.end();
    }
}

fixColumns();