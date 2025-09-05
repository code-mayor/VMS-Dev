#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing backend server startup issues...');

try {
  // Check if server directory exists
  const serverDir = path.join(process.cwd(), 'server');
  if (!fs.existsSync(serverDir)) {
    console.error('❌ Server directory not found:', serverDir);
    process.exit(1);
  }

  // Change to server directory
  process.chdir(serverDir);

  // Check if package.json exists
  if (!fs.existsSync('package.json')) {
    console.error('❌ Server package.json not found');
    process.exit(1);
  }

  // Install server dependencies
  console.log('📦 Installing server dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Server dependencies installed successfully');
  } catch (error) {
    console.error('❌ Failed to install server dependencies:', error.message);
    throw error;
  }

  // Check if database directory exists
  const dbDir = path.join(serverDir, 'database');
  if (!fs.existsSync(dbDir)) {
    console.log('📁 Creating database directory...');
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Verify key files exist
  const keyFiles = [
    'index.js',
    'database/init.js',
    'utils/logger.js',
    'routes/auth.js',
    'routes/devices.js',
    'routes/streams.js'
  ];

  const missingFiles = [];
  for (const file of keyFiles) {
    if (!fs.existsSync(path.join(serverDir, file))) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    console.error('❌ Missing critical server files:');
    missingFiles.forEach(file => console.error(`   - ${file}`));
    console.error('\n💡 Please ensure all server files are in place');
    process.exit(1);
  }

  // Test database initialization
  try {
    console.log('🗄️  Testing database initialization...');
    const { DatabaseInitializer } = require('./database/init');
    const dbInit = new DatabaseInitializer();
    
    // Test if we can create the initializer (don't actually initialize yet)
    console.log('✅ Database initializer loaded successfully');
  } catch (error) {
    console.error('❌ Database initialization test failed:', error.message);
    throw error;
  }

  // Test server file syntax
  try {
    console.log('🔍 Testing server file syntax...');
    require('./index.js'); // This will load but not start the server
    console.log('✅ Server file syntax is valid');
  } catch (error) {
    console.error('❌ Server file syntax error:', error.message);
    throw error;
  }

  console.log('\n✅ Backend startup fix completed successfully!');
  console.log('\n🚀 Ready to start the server:');
  console.log('   cd server && npm run dev');
  
} catch (error) {
  console.error('\n❌ Backend startup fix failed:', error.message);
  console.error('\n🛠️  Manual troubleshooting:');
  console.error('   1. Check server file structure');
  console.error('   2. Verify all dependencies are installed');
  console.error('   3. Check for syntax errors in server files');
  console.error('   4. Review database initialization code');
  process.exit(1);
}