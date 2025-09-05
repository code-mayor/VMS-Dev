#!/usr/bin/env node

const fetch = require('node-fetch');

console.log('🔍 Verifying Server Fix...\n');

const API_BASE = 'http://localhost:3001/api';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const testEndpoint = async (endpoint, description) => {
  try {
    console.log(`🧪 Testing ${description}...`);
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ ${description} - SUCCESS (${response.status})`);
      
      if (endpoint === '/health' && data.health) {
        console.log(`      Database: ${data.health.database}`);
        console.log(`      ONVIF Discovery: ${data.health.onvif_discovery}`);
        console.log(`      Status: ${data.health.status}`);
      }
      
      return true;
    } else {
      console.log(`   ❌ ${description} - FAILED (${response.status})`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ ${description} - ERROR: ${error.message}`);
    return false;
  }
};

const verifyServerFix = async () => {
  console.log('📊 Server Fix Verification Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Wait a moment for server to fully start
  console.log('⏳ Waiting for server to initialize...\n');
  await sleep(3000);

  const tests = [
    { endpoint: '/health', description: 'Health Check Endpoint' },
    { endpoint: '/devices', description: 'Devices Endpoint' },
    { endpoint: '/auth/status', description: 'Auth Status Endpoint' },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await testEndpoint(test.endpoint, test.description);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    await sleep(500); // Small delay between tests
  }

  console.log('\n📋 Test Results Summary:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total:  ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 Server fix verification PASSED!');
    console.log('✅ All endpoints are responding correctly');
    console.log('✅ No more 404 errors expected');
    console.log('✅ Routes are properly initialized');
    console.log('\n💡 You can now:');
    console.log('   1. Open http://localhost:3000 in your browser');
    console.log('   2. Login with: admin@admin.com / Admin@123');
    console.log('   3. Test ONVIF device discovery');
  } else {
    console.log('\n⚠️ Server fix verification had issues');
    console.log('❌ Some endpoints are still not working');
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check server logs for errors');
    console.log('   2. Restart the server: cd server && npm run dev');
    console.log('   3. Verify all routes are loading correctly');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
};

// Run verification
verifyServerFix().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});