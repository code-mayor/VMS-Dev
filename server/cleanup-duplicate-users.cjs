#!/usr/bin/env node

/**
 * Clean up duplicate demo users from MySQL database
 * Keeps only the @local.dev users and removes @vms.local duplicates
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function cleanupDuplicates() {
    let connection;

    try {
        // Connect to MySQL
        console.log('🔗 Connecting to MySQL...');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'onvif_vms'
        });

        console.log('✅ Connected to MySQL database\n');

        // Get all demo users
        const [allUsers] = await connection.execute(
            `SELECT id, email, name, role 
       FROM users 
       WHERE email LIKE '%@local.dev' 
          OR email LIKE '%@vms.local'
          OR email LIKE '%@vms.com'
       ORDER BY email`
        );

        console.log(`📊 Found ${allUsers.length} demo users:\n`);
        allUsers.forEach(user => {
            console.log(`   - ${user.email} (${user.role}) - ${user.name}`);
        });

        console.log('\n' + '='.repeat(50) + '\n');

        // Ask user what to do
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('Choose an option:');
        console.log('1. Keep only @local.dev users (recommended)');
        console.log('2. Keep only @vms.local users');
        console.log('3. Remove all demo users');
        console.log('4. Cancel\n');

        const choice = await new Promise(resolve => {
            readline.question('Enter choice (1-4): ', resolve);
        });
        readline.close();

        let deletePattern = '';
        let keepPattern = '';

        switch (choice) {
            case '1':
                deletePattern = '%@vms.%';
                keepPattern = '@local.dev';
                break;
            case '2':
                deletePattern = '%@local.dev';
                keepPattern = '@vms.local';
                break;
            case '3':
                deletePattern = 'all';
                keepPattern = 'none';
                break;
            case '4':
                console.log('\n❌ Operation cancelled');
                return;
            default:
                console.log('\n❌ Invalid choice');
                return;
        }

        // Delete duplicates
        if (deletePattern === 'all') {
            // Delete all demo users
            const [result] = await connection.execute(
                `DELETE FROM users 
         WHERE email LIKE '%@local.dev' 
            OR email LIKE '%@vms.local'
            OR email LIKE '%@vms.com'`
            );
            console.log(`\n✅ Deleted ${result.affectedRows} demo users`);

        } else {
            // Delete specific pattern
            const [result] = await connection.execute(
                `DELETE FROM users WHERE email LIKE ?`,
                [deletePattern]
            );
            console.log(`\n✅ Deleted ${result.affectedRows} users matching ${deletePattern}`);
        }

        // Show remaining users
        const [remainingUsers] = await connection.execute(
            `SELECT email, role, name 
       FROM users 
       WHERE email LIKE '%@local.dev' 
          OR email LIKE '%@vms.local'
          OR email LIKE '%@vms.com'
       ORDER BY email`
        );

        if (remainingUsers.length > 0) {
            console.log('\n📋 Remaining demo users:');
            remainingUsers.forEach(user => {
                console.log(`   ✅ ${user.email} (${user.role})`);
            });
        } else {
            console.log('\n📋 No demo users remaining in database');
        }

        // If we kept @local.dev users, show credentials
        if (keepPattern === '@local.dev' && remainingUsers.length > 0) {
            console.log('\n' + '='.repeat(50));
            console.log('📝 Demo User Credentials:\n');
            console.log('   admin    | admin@local.dev    | admin123');
            console.log('   operator | operator@local.dev | operator123');
            console.log('   viewer   | viewer@local.dev   | viewer123');
        }

        console.log('\n' + '='.repeat(50));
        console.log('✅ Cleanup complete!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run cleanup
cleanupDuplicates();