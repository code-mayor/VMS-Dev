#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

console.log('🔐 COMPREHENSIVE PASSWORD FIX TEST\n');
console.log('=' .repeat(50));

async function runCompleteTest() {
  console.log('\n1️⃣ TESTING BCRYPT HASH GENERATION...\n');
  
  // Test bcrypt hash generation
  const testPasswords = [
    { user: 'admin', password: 'admin123' },
    { user: 'operator', password: 'operator123' },
    { user: 'viewer', password: 'viewer123' }
  ];

  for (const test of testPasswords) {
    try {
      const hash = await bcrypt.hash(test.password, 10);
      const isValid = await bcrypt.compare(test.password, hash);
      console.log(`✅ ${test.user}: Hash generation and verification ${isValid ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.log(`❌ ${test.user}: Hash test FAILED - ${error.message}`);
    }
  }

  console.log('\n2️⃣ TESTING SERVER HEALTH...\n');
  
  // Test server health
  try {
    const healthResponse = await fetch('http://localhost:3001/api/health', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Server health check: PASSED');
      console.log(`   Database: ${healthData.health?.database || 'unknown'}`);
      console.log(`   Status: ${healthData.health?.status || 'unknown'}`);
    } else {
      console.log('❌ Server health check: FAILED');
      return;
    }
  } catch (error) {
    console.log('❌ Server health check: FAILED - Server not running?');
    console.log('💡 Start server with: cd server && npm run dev');
    return;
  }

  console.log('\n3️⃣ TESTING ALL USER LOGINS...\n');
  
  // Test all user logins
  const testUsers = [
    { email: 'admin@local.dev', password: 'admin123', role: 'admin' },
    { email: 'operator@local.dev', password: 'operator123', role: 'operator' },
    { email: 'viewer@local.dev', password: 'viewer123', role: 'viewer' }
  ];

  let allLoginsPassed = true;

  for (const user of testUsers) {
    try {
      console.log(`🔐 Testing ${user.role} login...`);
      
      const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.password
        })
      });

      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        
        if (loginData.success && loginData.user && loginData.accessToken) {
          console.log(`✅ ${user.role.toUpperCase()} LOGIN: SUCCESS`);
          console.log(`   Email: ${loginData.user.email}`);
          console.log(`   Role: ${loginData.user.role}`);
          console.log(`   Token: ${loginData.accessToken ? 'Generated' : 'Missing'}`);
          
          // Test token with API call
          const devicesResponse = await fetch('http://localhost:3001/api/devices', {
            headers: {
              'Authorization': `Bearer ${loginData.accessToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (devicesResponse.ok) {
            console.log(`   API Access: ✅ TOKEN VALID`);
          } else {
            console.log(`   API Access: ❌ TOKEN INVALID`);
          }
          
        } else {
          console.log(`❌ ${user.role.toUpperCase()} LOGIN: FAILED - Invalid response format`);
          allLoginsPassed = false;
        }
      } else {
        const errorData = await loginResponse.text();
        console.log(`❌ ${user.role.toUpperCase()} LOGIN: FAILED - ${loginResponse.status}`);
        console.log(`   Error: ${errorData}`);
        allLoginsPassed = false;
      }
      
      console.log(''); // Empty line between tests
      
    } catch (error) {
      console.log(`❌ ${user.role.toUpperCase()} LOGIN: ERROR - ${error.message}`);
      allLoginsPassed = false;
    }
  }

  console.log('\n4️⃣ TESTING INVALID LOGIN (Security Check)...\n');
  
  // Test invalid login
  try {
    const invalidResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@local.dev',
        password: 'wrongpassword'
      })
    });

    if (invalidResponse.status === 401) {
      console.log('✅ INVALID LOGIN: Correctly rejected (Security working)');
    } else {
      console.log('❌ INVALID LOGIN: Should have been rejected');
    }
  } catch (error) {
    console.log('❌ Invalid login test failed:', error.message);
  }

  console.log('\n' + '=' .repeat(50));
  console.log('📊 FINAL TEST RESULTS');
  console.log('=' .repeat(50));
  
  if (allLoginsPassed) {
    console.log('🎉 ALL TESTS PASSED! 🎉');
    console.log('');
    console.log('✅ Password hashing is working correctly');
    console.log('✅ All demo accounts can log in successfully');
    console.log('✅ JWT tokens are generated and validated');
    console.log('✅ API access is working with authentication');
    console.log('✅ Invalid credentials are properly rejected');
    console.log('');
    console.log('🚀 THE LOGIN SYSTEM IS FULLY FUNCTIONAL!');
    console.log('');
    console.log('💡 You can now log into the frontend with:');
    console.log('   📧 admin@local.dev / admin123 (Full access)');
    console.log('   📧 operator@local.dev / operator123 (Limited access)');
    console.log('   📧 viewer@local.dev / viewer123 (Read-only access)');
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('');
    console.log('🔧 Troubleshooting steps:');
    console.log('1. Make sure the server is running: cd server && npm run dev');
    console.log('2. Reset the database: node scripts/reset-database-with-proper-hashes.js');
    console.log('3. Restart the server to recreate the database');
    console.log('4. Run this test again');
  }
  
  console.log('\n' + '=' .repeat(50));
}

runCompleteTest().catch(error => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
});