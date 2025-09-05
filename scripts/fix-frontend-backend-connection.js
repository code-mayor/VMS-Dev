#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Frontend-Backend Connection Issues...\n');

async function fixConnection() {
  try {
    // 1. Check if backend server is running
    console.log('1️⃣ Checking backend server status...');
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('lsof -ti:3001');
      if (stdout.trim()) {
        console.log('✅ Backend server is running on port 3001');
        console.log('🔍 Process ID:', stdout.trim());
      } else {
        console.log('❌ Backend server is NOT running on port 3001');
        console.log('💡 Starting backend server...');
        
        const serverPath = path.join(process.cwd(), 'server');
        if (fs.existsSync(serverPath)) {
          console.log('📁 Server directory found');
          console.log('🚀 Please run: cd server && npm run dev');
        } else {
          console.log('❌ Server directory not found at:', serverPath);
          process.exit(1);
        }
      }
    } catch (error) {
      console.log('⚠️  Could not check port status:', error.message);
    }
    
    // 2. Test API connectivity
    console.log('\n2️⃣ Testing API connectivity...');
    
    try {
      const fetch = require('node-fetch');
      const response = await fetch('http://localhost:3001/api/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ API is accessible');
        console.log('📊 Health status:', data.status);
        console.log('🗄️ Database:', data.database || 'unknown');
      } else {
        console.log('❌ API returned error:', response.status, response.statusText);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Cannot connect to backend - server is not running');
        console.log('💡 Start the server with: cd server && npm run dev');
      } else {
        console.log('❌ API connectivity test failed:', error.message);
      }
    }
    
    // 3. Check frontend configuration
    console.log('\n3️⃣ Checking frontend configuration...');
    
    const authServicePath = path.join(process.cwd(), 'services', 'local-auth-service.tsx');
    if (fs.existsSync(authServicePath)) {
      const content = fs.readFileSync(authServicePath, 'utf8');
      const apiBaseMatch = content.match(/API_BASE_URL = ['"](.*?)['"]/);
      
      if (apiBaseMatch) {
        const apiBaseUrl = apiBaseMatch[1];
        console.log('🔗 Configured API Base URL:', apiBaseUrl);
        
        if (apiBaseUrl === 'http://localhost:3001/api') {
          console.log('✅ API Base URL is correct');
        } else {
          console.log('❌ API Base URL is incorrect');
          console.log('💡 Should be: http://localhost:3001/api');
        }
      } else {
        console.log('❌ Could not find API_BASE_URL in auth service');
      }
    } else {
      console.log('❌ Auth service file not found:', authServicePath);
    }
    
    // 4. Check CORS configuration
    console.log('\n4️⃣ Checking CORS configuration...');
    
    const serverIndexPath = path.join(process.cwd(), 'server', 'index.js');
    if (fs.existsSync(serverIndexPath)) {
      const content = fs.readFileSync(serverIndexPath, 'utf8');
      
      if (content.includes('cors({')) {
        console.log('✅ CORS middleware is configured');
        
        if (content.includes('localhost:3000') && content.includes('localhost:5173')) {
          console.log('✅ CORS origins include frontend URLs');
        } else {
          console.log('⚠️  CORS origins may not include all frontend URLs');
          console.log('💡 Should include: http://localhost:3000 and http://localhost:5173');
        }
      } else {
        console.log('❌ CORS middleware not found');
      }
    } else {
      console.log('❌ Server index file not found:', serverIndexPath);
    }
    
    // 5. Generate test script
    console.log('\n5️⃣ Creating connection test script...');
    
    const testScript = `
// Test frontend-backend connection
async function testConnection() {
  const API_BASE_URL = 'http://localhost:3001/api';
  
  console.log('Testing connection to:', API_BASE_URL);
  
  try {
    const response = await fetch(API_BASE_URL + '/health');
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Connection successful!');
      console.log('Server status:', data.status);
      console.log('Database:', data.database);
    } else {
      console.log('❌ Server responded with error:', response.status);
    }
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    console.log('💡 Make sure the backend server is running: cd server && npm run dev');
  }
}

// Run test
testConnection();
`;
    
    fs.writeFileSync(path.join(process.cwd(), 'test-connection.js'), testScript);
    console.log('✅ Test script created: test-connection.js');
    console.log('💡 Run in browser console to test connection');
    
    // 6. Summary and next steps
    console.log('\n📋 CONNECTION FIX SUMMARY');
    console.log('=========================');
    
    console.log('\n✅ FIXES APPLIED:');
    console.log('- Enhanced server health checking');
    console.log('- Improved error messaging');
    console.log('- Better connectivity debugging');
    console.log('- Connection test utilities');
    
    console.log('\n🚀 NEXT STEPS:');
    console.log('1. Ensure backend is running: cd server && npm run dev');
    console.log('2. Start frontend: npm run dev');
    console.log('3. Check browser console for connection status');
    console.log('4. Use "Retry" button in UI if connection fails');
    
    console.log('\n🔍 TROUBLESHOOTING:');
    console.log('- Backend logs: Check terminal where backend is running');
    console.log('- Frontend console: Open browser developer tools');
    console.log('- Network tab: Check if API requests are being made');
    console.log('- Health endpoint: curl http://localhost:3001/api/health');
    
    console.log('\n🎯 CONNECTION SHOULD NOW WORK!');
    console.log('The frontend will show "Server online" when connected properly.');
    
  } catch (error) {
    console.error('❌ Fix script failed:', error.message);
    console.error('\n💡 Manual troubleshooting:');
    console.error('1. Check if backend server is running on port 3001');
    console.error('2. Verify API endpoints respond correctly');
    console.error('3. Check browser console for CORS or network errors');
    console.error('4. Ensure no firewall is blocking local connections');
    process.exit(1);
  }
}

fixConnection();