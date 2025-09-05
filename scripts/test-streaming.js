#!/usr/bin/env node

const http = require('http');

console.log('🧪 Testing VMS Streaming Functionality...\n');

// Configuration
const SERVER_BASE = 'http://localhost:3001';
const FRONTEND_BASE = 'http://localhost:3000';

// Test functions
async function testServerHealth() {
  console.log('1️⃣ Testing server health...');
  
  try {
    const response = await fetch(`${SERVER_BASE}/health`);
    const data = await response.json();
    
    if (data.status === 'healthy') {
      console.log('   ✅ Server is healthy');
      console.log(`   📊 Server: ${data.server} v${data.version}`);
      console.log(`   🕐 Timestamp: ${data.timestamp}\n`);
      return true;
    } else {
      console.log('   ❌ Server health check failed');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Server health check failed: ${error.message}\n`);
    return false;
  }
}

async function testAuthentication() {
  console.log('2️⃣ Testing authentication...');
  
  try {
    const response = await fetch(`${SERVER_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@local.dev',
        password: 'admin123'
      })
    });
    
    const data = await response.json();
    
    if (data.success && data.accessToken) {
      console.log('   ✅ Authentication successful');
      console.log(`   👤 User: ${data.user.email} (${data.user.role})`);
      console.log(`   🔑 Token: ${data.accessToken.substring(0, 20)}...\n`);
      return data.accessToken;
    } else {
      console.log('   ❌ Authentication failed');
      console.log(`   📝 Response: ${JSON.stringify(data, null, 2)}\n`);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Authentication failed: ${error.message}\n`);
    return null;
  }
}

async function testDeviceList(token) {
  console.log('3️⃣ Testing device list...');
  
  try {
    const response = await fetch(`${SERVER_BASE}/api/devices`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.devices) {
      console.log(`   ✅ Found ${data.devices.length} device(s)`);
      data.devices.forEach((device, index) => {
        console.log(`   📷 Device ${index + 1}: ${device.name} (${device.ip_address})`);
        console.log(`      ID: ${device.id}`);
        console.log(`      Status: ${device.status}`);
        console.log(`      Credentials: ${device.username ? '✅' : '❌'}`);
      });
      console.log('');
      return data.devices;
    } else {
      console.log('   ❌ Failed to get device list');
      console.log(`   📝 Response: ${JSON.stringify(data, null, 2)}\n`);
      return [];
    }
  } catch (error) {
    console.log(`   ❌ Device list failed: ${error.message}\n`);
    return [];
  }
}

async function testStreamingAPI(token, devices) {
  console.log('4️⃣ Testing streaming API...');
  
  if (devices.length === 0) {
    console.log('   ⚠️  No devices available for streaming test\n');
    return false;
  }
  
  const device = devices[0];
  console.log(`   🎯 Testing with device: ${device.name} (${device.id})`);
  
  try {
    // Test stream URL endpoint
    const response = await fetch(`${SERVER_BASE}/api/streams/${device.id}/url`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.primary_stream_url) {
      console.log('   ✅ Stream API working');
      console.log(`   🔗 Primary URL: ${data.primary_stream_url}`);
      console.log(`   📦 Fallback URLs: ${data.fallback_stream_urls?.length || 0}`);
      console.log(`   🌐 WebSocket: ${data.websocket_url}`);
      console.log(`   📺 HLS: ${data.hls_url}`);
      console.log('');
      return true;
    } else {
      console.log('   ❌ Stream API failed');
      console.log(`   📝 Response: ${JSON.stringify(data, null, 2)}\n`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Stream API failed: ${error.message}\n`);
    return false;
  }
}

async function testFrontendConnectivity() {
  console.log('5️⃣ Testing frontend connectivity...');
  
  try {
    const response = await fetch(FRONTEND_BASE);
    
    if (response.ok) {
      console.log('   ✅ Frontend is accessible');
      console.log(`   🌐 URL: ${FRONTEND_BASE}`);
      console.log('   💡 You can now test streaming in the browser\n');
      return true;
    } else {
      console.log(`   ❌ Frontend returned status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Frontend connectivity failed: ${error.message}`);
    console.log('   💡 Make sure to run: npm run frontend\n');
    return false;
  }
}

// Main test execution
async function runTests() {
  console.log('🚀 Starting VMS Streaming Tests...\n');
  
  // Test 1: Server Health
  const serverHealthy = await testServerHealth();
  if (!serverHealthy) {
    console.log('❌ Server is not running. Please start it with: cd server && npm run dev');
    process.exit(1);
  }
  
  // Test 2: Authentication
  const token = await testAuthentication();
  if (!token) {
    console.log('❌ Authentication failed. Check server logs.');
    process.exit(1);
  }
  
  // Test 3: Device List
  const devices = await testDeviceList(token);
  
  // Test 4: Streaming API
  const streamingWorking = await testStreamingAPI(token, devices);
  
  // Test 5: Frontend
  const frontendWorking = await testFrontendConnectivity();
  
  // Summary
  console.log('📋 TEST SUMMARY:');
  console.log(`   Server Health: ${serverHealthy ? '✅' : '❌'}`);
  console.log(`   Authentication: ${token ? '✅' : '❌'}`);
  console.log(`   Device Discovery: ${devices.length > 0 ? '✅' : '⚠️'} (${devices.length} devices)`);
  console.log(`   Streaming API: ${streamingWorking ? '✅' : '❌'}`);
  console.log(`   Frontend Access: ${frontendWorking ? '✅' : '❌'}`);
  
  if (serverHealthy && token && streamingWorking) {
    console.log('\n🎉 ALL CORE FUNCTIONALITY WORKING!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Open browser: http://localhost:3000');
    console.log('   2. Login with: admin@local.dev / admin123');
    console.log('   3. Go to Devices tab');
    console.log('   4. Add credentials to your camera');
    console.log('   5. Click "Live View" to test streaming');
    console.log('\n🎯 Streaming should now work correctly!');
  } else {
    console.log('\n❌ Some issues found. Check the logs above for details.');
  }
}

// Helper function for fetch (if not available)
if (typeof fetch === 'undefined') {
  global.fetch = async (url, options = {}) => {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: async () => JSON.parse(data)
          });
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  };
}

// Run tests
runTests();