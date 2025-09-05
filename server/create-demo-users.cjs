#!/usr/bin/env node

/**
 * Setup demo users for MySQL database
 * Run once to create demo users
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DEMO_USERS = [
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

async function setupUsers() {
  let connection;

  try {
    // Connect to MySQL
    console.log('Connecting to MySQL...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'onvif_vms'
    });

    console.log('✅ Connected to MySQL database\n');

    // Check existing users
    const [existingUsers] = await connection.execute(
      'SELECT email, role FROM users WHERE email LIKE ?',
      ['%@local.dev']
    );

    console.log(`Found ${existingUsers.length} existing demo users\n`);

    // Process each demo user
    for (const user of DEMO_USERS) {
      const existing = existingUsers.find(u => u.email === user.email);

      if (existing) {
        console.log(`⚠️  ${user.email} already exists`);

        // Ask if we should update password
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise(resolve => {
          readline.question(`   Reset password for ${user.email}? (y/n): `, resolve);
        });
        readline.close();

        if (answer.toLowerCase() === 'y') {
          const passwordHash = await bcrypt.hash(user.password, 10);
          await connection.execute(
            'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE email = ?',
            [passwordHash, user.email]
          );
          console.log(`   ✅ Password updated for ${user.email}\n`);
        } else {
          console.log(`   Skipped ${user.email}\n`);
        }
      } else {
        // Create new user
        const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const passwordHash = await bcrypt.hash(user.password, 10);

        // Generate permissions based on role
        const permissions = getPermissionsByRole(user.role);

        await connection.execute(
          `INSERT INTO users (
            id, email, password_hash, name, role, permissions,
            created_at, updated_at, active, failed_login_attempts
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), 1, 0)`,
          [
            userId,
            user.email,
            passwordHash,
            user.name,
            user.role,
            JSON.stringify(permissions)
          ]
        );

        console.log(`✅ Created ${user.email} (${user.role})\n`);
      }
    }

    // Verify users can login
    console.log('\n🧪 Testing password verification...\n');

    for (const user of DEMO_USERS) {
      const [rows] = await connection.execute(
        'SELECT password_hash FROM users WHERE email = ?',
        [user.email]
      );

      if (rows.length > 0) {
        const valid = await bcrypt.compare(user.password, rows[0].password_hash);
        if (valid) {
          console.log(`   ✅ ${user.email} - password correct`);
        } else {
          console.log(`   ❌ ${user.email} - password incorrect`);
        }
      } else {
        console.log(`   ⚠️  ${user.email} - not found`);
      }
    }

    console.log('\n=========================');
    console.log('📝 Demo User Credentials:\n');

    for (const user of DEMO_USERS) {
      console.log(`   ${user.role.padEnd(8)} | ${user.email.padEnd(20)} | ${user.password}`);
    }

    console.log('\n=========================');
    console.log('✅ Setup complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

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

// Run the setup
setupUsers();