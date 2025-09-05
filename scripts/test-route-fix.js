#!/usr/bin/env node

const fetch = require('node-fetch');

console.log('🧪 Testing Route Registration Fix...\n');

const API_BASE = 'http://localhost:3001';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const testEndpoints = [
  { path: '/', description: 'Root Endpoint' },
  { path: '/api/health', description: 'Health Check Endpoint' },
  { path: '/api/devices', description: 'Devices Endpoint' },
  { path: '/api/auth/status', description: 'Auth Status Endpoint' }
];

const testEndpoint = async (endpoint) => {
  try {
    console.log(`🔍 Testing ${endpoint.description}: ${API_BASE}${endpoint.path}`);
    
    const response = await fetch(`${API_BASE}${endpoint.path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    const status = response.status;
    const statusText = response.statusText;

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ SUCCESS (${status})`);
      
      if (endpoint.path === '/api/health' && data.health) {
        console.log(`      Status: ${data.health.status}`);
        console.log(`      Database: ${data.health.database}`);
        console.log(`      ONVIF Discovery: ${data.health.onvif_discovery}`);
      }
      
      return { success: true, status, endpoint: endpoint.path };
    } else {
      console.log(`   ❌ FAILED (${status} - ${statusText})`);
      
      if (status === 404) {
        console.log(`      ⚠️ Route not found - check route registration`);
      }
      
      return { success: false, status, endpoint: endpoint.path };
    }
  } catch (error) {
    if (error.message?.includes('ECONNREFUSED')) {
      console.log(`   ❌ CONNECTION REFUSED - Server not running`);
    } else if (error.message?.includes('timeout')) {
      console.log(`   ❌ TIMEOUT - Server too slow to respond`);
    } else {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
    
    return { success: false, error: error.message, endpoint: endpoint.path };
  }
};

const runRouteTest = async () => {
  console.log('📊 Route Registration Fix Test Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Wait for server to fully start
  console.log('⏳ Waiting for server to initialize...\n');
  await sleep(2000);

  const results = [];
  
  for (const endpoint of testEndpoints) {
    const result = await testEndpoint(endpoint);
    results.push(result);
    await sleep(500); // Small delay between tests
  }

  console.log('\n📋 Test Results Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const statusCode = result.status ? `(${result.status})` : '';
    console.log(`${status} ${result.endpoint} ${statusCode}`);
  });

  console.log(`\n📊 Results: ${successful} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\n🎉 All route tests PASSED!');
    console.log('✅ Routes are properly registered and responding');
    console.log('✅ Health endpoint working correctly');
    console.log('✅ No more 404 errors expected');
    console.log('\n💡 Your frontend should now connect successfully!');
    console.log('   Open: http://localhost:3000');
  } else {
    console.log('\n⚠️ Some route tests FAILED');
    console.log('❌ Routes may not be properly registered');
    
    const notFoundResults = results.filter(r => r.status === 404);
    if (notFoundResults.length > 0) {
      console.log('\n🔧 404 Errors Detected:');
      notFoundResults.forEach(result => {
        console.log(`   • ${result.endpoint} - Route not found`);
      });
      console.log('\n💡 This indicates routes are not being registered properly');
      console.log('   Check server logs for route initialization errors');
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
};

// Check if server is even running first
const checkServerRunning = async () => {
  try {
    console.log('🔍 Checking if server is running...');
    const response = await fetch(`${API_BASE}/`, { timeout: 3000 });
    console.log('✅ Server is responding\n');
    return true;
  } catch (error) {
    console.log('❌ Server is not responding');
    console.log('💡 Start the server with: cd server && npm run dev\n');
    return false;
  }
};

// Main execution
const main = async () => {
  const serverRunning = await checkServerRunning();
  
  if (serverRunning) {
    await runRouteTest();
  } else {
    console.log('🚫 Cannot run route tests - server not accessible');
    process.exit(1);
  }
};

main().catch(error => {
  console.error('❌ Route test failed:', error);
  process.exit(1);
});