#!/usr/bin/env node

const http = require('http');

console.log('🔍 Testing ONVIF VMS Server Health...\n');

// Test server health endpoint
function testHealthEndpoint(port = 3001) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/health',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.status === 'healthy') {
            console.log('✅ Server Health Check: PASSED');
            console.log(`📡 Server Status: ${response.status}`);
            console.log(`🕐 Server Time: ${response.timestamp}`);
            console.log(`📋 Server Info: ${response.server} v${response.version}\n`);
            resolve(true);
          } else {
            console.log('⚠️  Server Health Check: WARNING');
            console.log(`   Response: ${JSON.stringify(response, null, 2)}\n`);
            resolve(false);
          }
        } catch (error) {
          console.log('❌ Server Health Check: FAILED');
          console.log(`   Invalid JSON response: ${data}\n`);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Server Health Check: FAILED');
        console.log(`   Connection refused - server not running on port ${port}\n`);
        console.log('💡 To start the server:');
        console.log('   cd server');
        console.log('   npm run dev\n');
      } else {
        console.log('❌ Server Health Check: FAILED');
        console.log(`   Error: ${error.message}\n`);
      }
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('❌ Server Health Check: TIMEOUT');
      console.log(`   Server did not respond within 5 seconds\n`);
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Test API endpoint
function testAPIEndpoint(port = 3001) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/api/health',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 404) {
        console.log('✅ API Endpoints: ACCESSIBLE');
        console.log(`📊 API Base URL: http://localhost:${port}/api\n`);
        resolve(true);
      } else {
        console.log('⚠️  API Endpoints: WARNING');
        console.log(`   Status Code: ${res.statusCode}\n`);
        resolve(false);
      }
    });

    req.on('error', (error) => {
      console.log('❌ API Endpoints: FAILED');
      console.log(`   Error: ${error.message}\n`);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('❌ API Endpoints: TIMEOUT\n');
      reject(new Error('API request timeout'));
    });

    req.end();
  });
}

// Main test function
async function runHealthTest() {
  try {
    await testHealthEndpoint();
    await testAPIEndpoint();
    
    console.log('🎉 Server is running correctly!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Start frontend: npm run frontend');
    console.log('   2. Access app: http://localhost:3000');
    console.log('   3. Login with: admin@local.dev / admin123\n');
    
  } catch (error) {
    console.log('🛠️  Server needs to be started or fixed.');
    console.log('\n📋 Troubleshooting:');
    console.log('   1. cd server');
    console.log('   2. npm run dev');
    console.log('   3. Check for any error messages');
    console.log('   4. Run this test again: node scripts/test-server-health.js\n');
    process.exit(1);
  }
}

// Run the test
runHealthTest();