#!/usr/bin/env node

const fetch = require('node-fetch');

console.log('🧪 Testing Demo User Login Fix...\n');

const API_BASE = 'http://localhost:3001/api';

const demoUsers = [
  { email: 'admin@local.dev', password: 'admin123', role: 'admin' },
  { email: 'operator@local.dev', password: 'operator123', role: 'operator' },
  { email: 'viewer@local.dev', password: 'viewer123', role: 'viewer' }
];

const testLogin = async (email, password, expectedRole) => {
  try {
    console.log(`🔐 Testing login: ${email}`);
    
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      timeout: 10000
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log(`   ✅ LOGIN SUCCESS`);
      console.log(`      User: ${data.user.name} (${data.user.email})`);
      console.log(`      Role: ${data.user.role}`);
      console.log(`      Permissions: ${Object.keys(data.user.permissions).length} categories`);
      console.log(`      Token: ${data.accessToken ? 'Generated' : 'Missing'}`);
      
      return { success: true, user: data.user };
    } else {
      console.log(`   ❌ LOGIN FAILED`);
      console.log(`      Status: ${response.status}`);
      console.log(`      Error: ${data.error || 'Unknown error'}`);
      
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.log(`   ❌ CONNECTION ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const testDemoLogins = async () => {
  console.log('📊 Demo User Login Test Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let successCount = 0;
  let failureCount = 0;
  const results = [];

  for (const user of demoUsers) {
    const result = await testLogin(user.email, user.password, user.role);
    results.push({ ...user, ...result });
    
    if (result.success) {
      successCount++;
    } else {
      failureCount++;
    }
    
    console.log(); // Add spacing between tests
  }

  console.log('📋 Test Results Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Successful logins: ${successCount}`);
  console.log(`❌ Failed logins: ${failureCount}`);
  console.log(`📊 Total tests: ${successCount + failureCount}`);

  if (successCount === demoUsers.length) {
    console.log('\n🎉 All demo user logins SUCCESSFUL!');
    console.log('✅ Database seeding working correctly');
    console.log('✅ Password hashing and verification working');
    console.log('✅ User authentication fully operational');
    
    console.log('\n🔐 Available Demo Credentials:');
    results.forEach(result => {
      if (result.success) {
        console.log(`   ${result.role.padEnd(8)} | ${result.email.padEnd(20)} | ${result.password}`);
      }
    });
    
    console.log('\n💡 Frontend users can now:');
    console.log('   1. Open http://localhost:3000');
    console.log('   2. Click any "Try" button for demo credentials');
    console.log('   3. Or manually enter the credentials above');
    
  } else {
    console.log('\n⚠️ Some demo user logins FAILED');
    
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.log('\n❌ Failed Logins:');
      failures.forEach(failure => {
        console.log(`   ${failure.email}: ${failure.error}`);
      });
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure server is running: cd server && npm run dev');
    console.log('   2. Check database seeding completed successfully');
    console.log('   3. Verify no database connection issues');
    console.log('   4. Check server logs for detailed errors');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
};

// Check server first
const checkServer = async () => {
  try {
    console.log('🔍 Checking if server is running...');
    const response = await fetch(`${API_BASE}/health`, { timeout: 5000 });
    
    if (response.ok) {
      console.log('✅ Server is responding\n');
      return true;
    } else {
      console.log(`❌ Server responded with status: ${response.status}\n`);
      return false;
    }
  } catch (error) {
    console.log('❌ Server is not responding');
    console.log('💡 Start the server with: cd server && npm run dev\n');
    return false;
  }
};

// Main execution
const main = async () => {
  const serverRunning = await checkServer();
  
  if (serverRunning) {
    await testDemoLogins();
  } else {
    console.log('🚫 Cannot test logins - server not accessible');
    process.exit(1);
  }
};

main().catch(error => {
  console.error('❌ Login test failed:', error);
  process.exit(1);
});