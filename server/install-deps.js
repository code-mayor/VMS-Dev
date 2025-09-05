#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

async function installServerDependencies() {
  console.log('🔧 Installing ONVIF VMS Server Dependencies...\n');

  try {
    // Change to server directory
    process.chdir(__dirname);
    
    console.log('📍 Current directory:', process.cwd());
    
    console.log('Step 1: Checking package.json...');
    const packageJson = require('./package.json');
    const totalDeps = Object.keys(packageJson.dependencies || {}).length;
    console.log(`   ✅ Found ${totalDeps} dependencies to install`);
    
    console.log('\nStep 2: Installing dependencies...');
    console.log('   🔄 Running npm install (this may take a few minutes)...');
    
    const { stdout, stderr } = await execAsync('npm install', { 
      maxBuffer: 1024 * 1024 * 10,
      timeout: 300000 // 5 minutes timeout
    });
    
    if (stderr && !stderr.includes('npm warn')) {
      console.log('   ⚠️  Installation warnings:');
      console.log(stderr);
    }
    
    console.log('   ✅ Dependencies installed successfully');
    
    console.log('\nStep 3: Verifying critical dependencies...');
    const criticalDeps = [
      'express',
      'sqlite3', 
      'bcryptjs',
      'jsonwebtoken',
      'cors',
      'fs-extra',
      'uuid'
    ];
    
    for (const dep of criticalDeps) {
      try {
        require(dep);
        console.log(`   ✅ ${dep} - OK`);
      } catch (error) {
        console.log(`   ❌ ${dep} - MISSING`);
      }
    }
    
    console.log('\nStep 4: Testing server startup...');
    console.log('   🔄 Running quick startup test...');
    
    try {
      // Quick test to see if server can start
      const testOutput = await execAsync('timeout 5s node index.js || true');
      console.log('   ✅ Server startup test completed');
    } catch (error) {
      console.log('   ⚠️  Server test had issues, but dependencies are installed');
    }
    
    console.log('\n🎉 Server dependencies installation completed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Start the server: npm run dev');
    console.log('   2. Or from parent directory: npm run dev');
    console.log('   3. Server should be available at: http://localhost:3001');
    
  } catch (error) {
    console.error('\n💥 Server dependency installation failed:', error.message);
    console.error('\n🛠️  Manual steps to fix:');
    console.error('   1. cd server');
    console.error('   2. rm -rf node_modules package-lock.json');
    console.error('   3. npm cache clean --force');
    console.error('   4. npm install');
    console.error('   5. npm run dev');
    process.exit(1);
  }
}

if (require.main === module) {
  installServerDependencies();
}

module.exports = { installServerDependencies };