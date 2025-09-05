#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Comprehensive Backend Fix...');

async function fixBackend() {
  try {
    const serverDir = path.join(process.cwd(), 'server');
    
    // 1. Check server directory structure
    console.log('📁 Checking server directory structure...');
    if (!fs.existsSync(serverDir)) {
      console.error('❌ Server directory not found:', serverDir);
      process.exit(1);
    }

    // 2. Navigate to server directory
    process.chdir(serverDir);

    // 3. Install/update server dependencies
    console.log('📦 Installing server dependencies...');
    execSync('npm install uuid@9.0.1', { stdio: 'inherit' });
    console.log('✅ UUID dependency installed');

    // 4. Check if database directory exists
    const dbDir = path.join(serverDir, 'database');
    if (!fs.existsSync(dbDir)) {
      console.log('📁 Creating database directory...');
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 5. Verify all required files exist
    const requiredFiles = [
      'index.js',
      'database/init.js',
      'services/onvif-discovery.js',
      'utils/logger.js',
      'routes/auth.js',
      'routes/devices.js'
    ];

    console.log('🔍 Checking required server files...');
    const missingFiles = [];
    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(serverDir, file))) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      console.error('❌ Missing required server files:');
      missingFiles.forEach(file => console.error(`   - ${file}`));
      process.exit(1);
    }

    console.log('✅ All required server files present');

    // 6. Test database initialization
    console.log('🗄️  Testing database initialization...');
    const { DatabaseInitializer } = require('./database/init');
    console.log('✅ Database initializer imported successfully');

    // 7. Test ONVIF discovery service
    console.log('🔍 Testing ONVIF discovery service...');
    const { onvifDiscovery } = require('./services/onvif-discovery');
    console.log('✅ ONVIF discovery service imported successfully');

    // 8. Clean up any existing database for fresh start
    const dbPath = path.join(serverDir, '../onvif_vms.db');
    if (fs.existsSync(dbPath)) {
      console.log('🧹 Removing existing database for fresh start...');
      fs.unlinkSync(dbPath);
    }

    console.log('\n✅ Backend fix completed successfully!');
    console.log('\n🚀 Ready to start the server:');
    console.log('   npm run dev');
    console.log('\n🎯 Expected startup sequence:');
    console.log('   1. Database initialization ✓');
    console.log('   2. Server starts on port 3001 ✓');
    console.log('   3. ONVIF auto-discovery begins ✓');
    console.log('   4. Discovered devices saved to database ✓');

  } catch (error) {
    console.error('\n❌ Backend fix failed:', error.message);
    
    // Detailed troubleshooting
    console.error('\n🛠️  Troubleshooting steps:');
    console.error('1. Check Node.js version: node --version (should be >= 18)');
    console.error('2. Check server file structure');
    console.error('3. Clear node_modules and reinstall:');
    console.error('   cd server && rm -rf node_modules package-lock.json && npm install');
    console.error('4. Check for port conflicts: lsof -i:3001');
    
    process.exit(1);
  }
}

fixBackend();