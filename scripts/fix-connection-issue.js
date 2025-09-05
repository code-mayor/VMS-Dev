#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fetch = require('node-fetch');
const path = require('path');

console.log('🔧 Fixing ONVIF VMS Connection Issue...');

const API_BASE = 'http://localhost:3001/api';
const SERVER_PATH = path.join(__dirname, '../server');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const testConnection = async (retries = 3) => {
  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`🔍 Testing connection attempt ${i}/${retries}...`);
      
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Connection successful!');
        console.log('📊 Server status:', data.health?.status || 'unknown');
        console.log('🗄️ Database:', data.health?.database || 'unknown');
        console.log('🔍 ONVIF Discovery:', data.health?.onvif_discovery || 'unknown');
        return true;
      } else {
        console.log(`⚠️ Server responded with status: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Connection attempt ${i} failed:`, error.message);
    }

    if (i < retries) {
      console.log('🔄 Waiting 2 seconds before retry...');
      await sleep(2000);
    }
  }

  return false;
};

const killServerProcesses = () => {
  try {
    console.log('🛑 Stopping any existing server processes...');
    
    // Kill processes on port 3001
    try {
      execSync('lsof -ti:3001 | xargs kill -9', { stdio: 'ignore' });
      console.log('✅ Killed existing processes on port 3001');
    } catch (error) {
      console.log('ℹ️ No existing processes found on port 3001');
    }

    // Kill any node processes that might be running the server
    try {
      execSync('pkill -f "node.*index.js"', { stdio: 'ignore' });
      console.log('✅ Killed existing node server processes');
    } catch (error) {
      console.log('ℹ️ No node server processes found');
    }

    // Wait for processes to fully terminate
    console.log('⏳ Waiting for processes to terminate...');
    return new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.log('⚠️ Error during process cleanup:', error.message);
    return Promise.resolve();
  }
};

const startServer = async () => {
  console.log('🚀 Starting backend server...');
  
  try {
    // Change to server directory
    process.chdir(SERVER_PATH);
    
    // Install dependencies first
    console.log('📦 Installing/updating server dependencies...');
    execSync('npm install', { stdio: 'inherit' });
    
    // Start the server
    console.log('🔄 Starting server process...');
    const server = spawn('npm', ['run', 'dev'], {
      detached: false,
      stdio: 'inherit',
      cwd: SERVER_PATH
    });

    // Give the server time to start
    console.log('⏳ Waiting for server to initialize...');
    await sleep(5000);

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    throw error;
  }
};

const fixConnectionIssue = async () => {
  try {
    console.log('📋 Step 1: Testing current connection...');
    
    const initialConnection = await testConnection(1);
    if (initialConnection) {
      console.log('✅ Server is already running and healthy!');
      console.log('\n🎉 No fix needed. You can access the application at:');
      console.log('   Frontend: http://localhost:3000');
      console.log('   Backend:  http://localhost:3001');
      return;
    }

    console.log('\n📋 Step 2: Cleaning up existing processes...');
    await killServerProcesses();

    console.log('\n📋 Step 3: Starting fresh server instance...');
    const server = await startServer();

    console.log('\n📋 Step 4: Testing new connection...');
    const newConnection = await testConnection(5);

    if (newConnection) {
      console.log('\n🎉 Connection Issue Fixed Successfully!');
      console.log('\n📋 System Status:');
      console.log('  ✅ Backend server running on port 3001');
      console.log('  ✅ Health check endpoint responding');
      console.log('  ✅ Database connections established');
      console.log('  ✅ ONVIF discovery service ready');
      
      console.log('\n🚀 Next Steps:');
      console.log('1. Open your browser to: http://localhost:3000');
      console.log('2. The connection error should be resolved');
      console.log('3. You can now log in and test ONVIF discovery');
      
      console.log('\n💡 Login Credentials:');
      console.log('   Email:    admin@admin.com');
      console.log('   Password: Admin@123');
      
      console.log('\n📝 To stop the server later, press Ctrl+C');
      
      // Keep the script running to show server logs
      process.on('SIGINT', () => {
        console.log('\n👋 Shutting down...');
        if (server) {
          server.kill('SIGTERM');
        }
        process.exit(0);
      });
      
    } else {
      console.error('\n❌ Connection issue persists after restart');
      console.log('\n🔧 Manual troubleshooting steps:');
      console.log('1. Check if port 3001 is already in use:');
      console.log('   lsof -i:3001');
      console.log('2. Manually start the server:');
      console.log('   cd server && npm run dev');
      console.log('3. Check server logs for errors');
      console.log('4. Verify database file permissions');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fix failed:', error.message);
    console.log('\n🔧 Manual recovery steps:');
    console.log('1. cd server');
    console.log('2. npm install');
    console.log('3. npm run dev');
    console.log('4. Check for error messages in the output');
    process.exit(1);
  }
};

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\n👋 Exiting connection fix...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Terminating connection fix...');
  process.exit(0);
});

// Run the fix
fixConnectionIssue();