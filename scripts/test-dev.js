#!/usr/bin/env node

// Simple test script to debug development startup issues

console.log('🧪 Testing Development Environment...\n');

async function testStartup() {
  try {
    console.log('Step 1: Testing ES module imports...');
    
    try {
      const { killProcessOnPort, findAvailablePort } = await import('./kill-port.js');
      console.log('   ✅ kill-port.js imported successfully');
    } catch (error) {
      console.log('   ❌ kill-port.js import failed:', error.message);
      throw error;
    }
    
    console.log('\nStep 2: Testing Node.js environment...');
    console.log(`   Node.js version: ${process.version}`);
    console.log(`   Current directory: ${process.cwd()}`);
    console.log(`   Script path: ${import.meta.url}`);
    
    console.log('\nStep 3: Testing child process...');
    const { spawn } = await import('child_process');
    console.log('   ✅ child_process imported successfully');
    
    console.log('\nStep 4: Testing port availability...');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      const { stdout } = await execAsync('lsof -ti:3000').catch(() => ({ stdout: '' }));
      if (stdout.trim()) {
        console.log(`   ⚠️  Port 3000 is in use by PID: ${stdout.trim()}`);
      } else {
        console.log('   ✅ Port 3000 is available');
      }
    } catch (error) {
      console.log('   ✅ Port 3000 is available (lsof check failed, which means available)');
    }
    
    console.log('\nStep 5: Testing package.json scripts...');
    const fs = await import('fs');
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    
    const requiredScripts = ['frontend', 'backend', 'cleanup'];
    for (const script of requiredScripts) {
      if (packageJson.scripts[script]) {
        console.log(`   ✅ Script "${script}" found: ${packageJson.scripts[script]}`);
      } else {
        console.log(`   ❌ Script "${script}" missing`);
      }
    }
    
    console.log('\n🎉 Environment test completed successfully!');
    console.log('\n💡 Try these commands to start the frontend:');
    console.log('   npm run frontend    # Frontend only');
    console.log('   npm run dev-simple  # Both frontend and backend');
    console.log('   npx vite           # Direct Vite start');
    
  } catch (error) {
    console.error('\n💥 Environment test failed:', error.message);
    console.error('\n🛠️  Troubleshooting steps:');
    console.error('   1. Check Node.js version: node --version (should be >= 18)');
    console.error('   2. Check if scripts exist: cat package.json | grep scripts -A 20');
    console.error('   3. Try direct frontend start: npx vite');
    console.error('   4. Check for missing dependencies: npm list --depth=0');
    process.exit(1);
  }
}

testStartup();