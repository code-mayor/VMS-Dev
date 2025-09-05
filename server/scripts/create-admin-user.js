const path = require('path');
const fs = require('fs');

// Initialize database first
require('../database/init');

const bcrypt = require('bcrypt');
const { logger } = require('../utils/logger');

// Database file path
const dbPath = path.join(__dirname, '../database/users.json');

// Default admin user
const DEFAULT_ADMIN = {
  id: 'admin-001',
  email: 'admin@local.dev',
  password: 'admin123', // Will be hashed
  name: 'System Administrator',
  role: 'admin',
  permissions: ['read', 'write', 'delete', 'admin'],
  createdAt: new Date().toISOString(),
  lastLogin: null,
  active: true
};

async function createAdminUser() {
  try {
    console.log('🔧 Creating default admin user...\n');

    // Create database directory if it doesn't exist
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('📁 Created database directory');
    }

    // Load existing users or create empty array
    let users = [];
    if (fs.existsSync(dbPath)) {
      try {
        const data = fs.readFileSync(dbPath, 'utf8');
        users = JSON.parse(data);
        console.log(`📊 Found ${users.length} existing users`);
      } catch (error) {
        console.log('⚠️  Could not read existing users file, creating new one');
        users = [];
      }
    } else {
      console.log('📄 Creating new users database file');
    }

    // Check if admin user already exists
    const existingAdmin = users.find(user => user.email === DEFAULT_ADMIN.email);
    if (existingAdmin) {
      console.log('✅ Admin user already exists!');
      console.log(`📧 Email: ${existingAdmin.email}`);
      console.log(`👤 Role: ${existingAdmin.role}`);
      console.log(`🔑 Password: admin123`);
      console.log('\n🚀 You can now login with these credentials!');
      return;
    }

    // Hash the password
    console.log('🔐 Hashing admin password...');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, saltRounds);

    // Create admin user with hashed password
    const adminUser = {
      ...DEFAULT_ADMIN,
      password: hashedPassword
    };

    // Add to users array
    users.push(adminUser);

    // Save to file
    fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));

    console.log('✅ Admin user created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log(`   📧 Email: ${DEFAULT_ADMIN.email}`);
    console.log(`   🔑 Password: ${DEFAULT_ADMIN.password}`);
    console.log(`   👤 Role: ${DEFAULT_ADMIN.role}`);
    console.log('\n🎯 Database Location:');
    console.log(`   📁 File: ${dbPath}`);
    console.log(`   👥 Total Users: ${users.length}`);

    // Log to audit
    logger.audit(`Admin user created: ${DEFAULT_ADMIN.email}`);

    console.log('\n🚀 Ready to login!');
    console.log('   1. Go to: http://localhost:3000');
    console.log(`   2. Email: ${DEFAULT_ADMIN.email}`);
    console.log(`   3. Password: ${DEFAULT_ADMIN.password}`);

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createAdminUser();
}

module.exports = { createAdminUser, DEFAULT_ADMIN };