#!/usr/bin/env node

const fetch = require('node-fetch');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 ONVIF VMS System Status Check\n');

const API_BASE = 'http://localhost:3001/api';
const SERVER_PATH = path.join(__dirname, '../server');
const DB_PATH = path.join(SERVER_PATH, 'onvif_vms.db');

// Check if port is in use
const checkPort = (port) => {
  try {
    const result = execSync(`lsof -i:${port}`, { encoding: 'utf8', stdio: 'pipe' });
    return result.trim().split('\n').slice(1); // Remove header
  } catch (error) {
    return []; // Port not in use
  }
};

// Check server health
const checkServerHealth = async () => {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    if (response.ok) {
      const data = await response.json();
      return { status: 'healthy', data };
    } else {
      return { status: 'unhealthy', error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return { status: 'unreachable', error: error.message };
  }
};

// Check database file
const checkDatabase = () => {
  try {
    const stats = fs.statSync(DB_PATH);
    return {
      exists: true,
      size: stats.size,
      modified: stats.mtime.toISOString()
    };
  } catch (error) {
    return { exists: false, error: error.message };
  }
};

// Main status check
const runStatusCheck = async () => {
  console.log('📊 System Status Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Check Frontend Port (3000)
  console.log('🌐 Frontend Status (Port 3000):');
  const frontendProcesses = checkPort(3000);
  if (frontendProcesses.length > 0) {
    console.log('   ✅ Frontend server is running');
    frontendProcesses.forEach(proc => console.log(`      ${proc}`));
  } else {
    console.log('   ❌ Frontend server not detected');
    console.log('      💡 Start with: npm run frontend');
  }
  console.log();

  // 2. Check Backend Port (3001)
  console.log('🖥️ Backend Status (Port 3001):');
  const backendProcesses = checkPort(3001);
  if (backendProcesses.length > 0) {
    console.log('   ✅ Backend server is running');
    backendProcesses.forEach(proc => console.log(`      ${proc}`));
  } else {
    console.log('   ❌ Backend server not detected');
    console.log('      💡 Start with: cd server && npm run dev');
  }
  console.log();

  // 3. Check Server Health
  console.log('🏥 Server Health Check:');
  const health = await checkServerHealth();
  
  if (health.status === 'healthy') {
    console.log('   ✅ Server is healthy and responding');
    if (health.data?.health) {
      console.log(`      Database: ${health.data.health.database}`);
      console.log(`      ONVIF Discovery: ${health.data.health.onvif_discovery}`);
      console.log(`      Uptime: ${health.data.health.uptime}s`);
      console.log(`      Version: ${health.data.health.version}`);
    }
  } else {
    console.log(`   ❌ Server health check failed: ${health.status}`);
    console.log(`      Error: ${health.error}`);
  }
  console.log();

  // 4. Check Database
  console.log('🗄️ Database Status:');
  const dbStatus = checkDatabase();
  if (dbStatus.exists) {
    console.log('   ✅ Database file exists');
    console.log(`      Path: ${DB_PATH}`);
    console.log(`      Size: ${dbStatus.size} bytes`);
    console.log(`      Last Modified: ${dbStatus.modified}`);
  } else {
    console.log('   ❌ Database file not found');
    console.log(`      Expected: ${DB_PATH}`);
    console.log('      💡 Database will be created when server starts');
  }
  console.log();

  // 5. Check Node.js and npm
  console.log('🔧 Environment:');
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`   ✅ Node.js: ${nodeVersion}`);
    console.log(`   ✅ npm: ${npmVersion}`);
  } catch (error) {
    console.log('   ❌ Node.js/npm not found');
  }
  console.log();

  // 6. Summary and Recommendations
  console.log('📋 Summary & Recommendations:');
  
  const frontendRunning = frontendProcesses.length > 0;
  const backendRunning = backendProcesses.length > 0;
  const serverHealthy = health.status === 'healthy';
  
  if (frontendRunning && backendRunning && serverHealthy) {
    console.log('   🎉 System is fully operational!');
    console.log('   🌐 Access the application: http://localhost:3000');
    console.log('   📡 API available at: http://localhost:3001');
  } else {
    console.log('   ⚠️ System issues detected:');
    
    if (!frontendRunning) {
      console.log('   • Start frontend: npm run frontend');
    }
    
    if (!backendRunning) {
      console.log('   • Start backend: cd server && npm run dev');
    } else if (!serverHealthy) {
      console.log('   • Backend is running but unhealthy - check logs');
      console.log('   • Try restarting: cd server && npm run dev');
    }
    
    console.log('   • For auto-fix: node scripts/fix-connection-issue.js');
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Full system logs available in terminal where servers are running');
};

// Run the status check
runStatusCheck().catch(error => {
  console.error('❌ Status check failed:', error);
  process.exit(1);
});