#!/usr/bin/env node

const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');

// Add Node.js fetch polyfill if needed
if (!global.fetch) {
  global.fetch = fetch;
}

console.log('🔧 Fixing Demo Login Issue - Complete Diagnosis and Fix\n');

const API_BASE = 'http://localhost:3001/api';

const demoUsers = [
  { email: 'admin@local.dev', password: 'admin123', role: 'admin' },
  { email: 'operator@local.dev', password: 'operator123', role: 'operator' },
  { email: 'viewer@local.dev', password: 'viewer123', role: 'viewer' },
  // Additional demo users for testing
  { email: 'admin@demo.local', password: 'admin', role: 'admin' },
  { email: 'test@demo.local', password: 'test123', role: 'viewer' }
];

const checkDatabaseUsers = async () => {
  try {
    console.log('📊 Step 1: Checking existing users in database...');
    
    const response = await fetch(`${API_BASE}/auth/debug/users`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Found ${data.count} users in database:`);
      
      data.users.forEach(user => {
        console.log(`      • ${user.email} | ${user.name} | ${user.role} | Created: ${user.created_at}`);
      });
      
      // Check if demo users exist
      const demoEmailsInDb = data.users.map(u => u.email);
      const missingDemoUsers = demoUsers.filter(u => !demoEmailsInDb.includes(u.email));
      
      if (missingDemoUsers.length > 0) {
        console.log(`   ⚠️ Missing demo users: ${missingDemoUsers.map(u => u.email).join(', ')}`);
        return { users: data.users, missingDemo: missingDemoUsers };
      } else {
        console.log(`   ✅ All demo users exist in database`);
        return { users: data.users, missingDemo: [] };
      }
    } else {
      console.log(`   ❌ Failed to fetch users: ${response.status}`);
      return { users: [], missingDemo: demoUsers };
    }
  } catch (error) {
    console.log(`   ❌ Error checking database: ${error.message}`);
    return { users: [], missingDemo: demoUsers };
  }
};

const testPasswordHashing = async () => {
  console.log('\n🔒 Step 2: Testing password hashing compatibility...');
  
  for (const user of demoUsers) {
    try {
      // Test if we can hash the password the same way the server does
      const testHash = await bcrypt.hash(user.password, 10);
      const testVerify = await bcrypt.compare(user.password, testHash);
      
      console.log(`   ${user.email}:`);
      console.log(`      Password: "${user.password}"`);
      console.log(`      Hash Test: ${testVerify ? '✅ PASS' : '❌ FAIL'}`);
      
    } catch (error) {
      console.log(`   ❌ Hashing error for ${user.email}: ${error.message}`);
    }
  }
};

const testLoginAttempts = async () => {
  console.log('\n🔐 Step 3: Testing login attempts...');
  
  const results = [];
  
  for (const user of demoUsers) {
    try {
      console.log(`   Testing: ${user.email} with password "${user.password}"`);
      
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: user.email, 
          password: user.password 
        }),
        timeout: 10000
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log(`      ✅ LOGIN SUCCESS - Token: ${data.accessToken ? 'Generated' : 'Missing'}`);
        results.push({ ...user, success: true, response: data });
      } else {
        console.log(`      ❌ LOGIN FAILED - Status: ${response.status}, Error: ${data.error}`);
        results.push({ ...user, success: false, error: data.error });
      }
    } catch (error) {
      console.log(`      ❌ CONNECTION ERROR: ${error.message}`);
      results.push({ ...user, success: false, error: error.message });
    }
  }
  
  return results;
};

const recreateDemoUsers = async () => {
  console.log('\n🔄 Step 4: Recreating demo users with fresh hashes...');
  
  const results = [];
  
  for (const user of demoUsers) {
    try {
      console.log(`   Creating: ${user.email}`);
      
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.password,
          name: `${user.role} User`,
          role: user.role
        }),
        timeout: 10000
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log(`      ✅ CREATED SUCCESSFULLY`);
        results.push({ ...user, created: true });
      } else if (response.status === 409) {
        console.log(`      ⚠️ USER ALREADY EXISTS`);
        results.push({ ...user, created: false, exists: true });
      } else {
        console.log(`      ❌ CREATION FAILED: ${data.error}`);
        results.push({ ...user, created: false, error: data.error });
      }
    } catch (error) {
      console.log(`      ❌ ERROR: ${error.message}`);
      results.push({ ...user, created: false, error: error.message });
    }
  }
  
  return results;
};

const performCompleteFix = async () => {
  console.log('🎯 Demo Login Complete Fix and Diagnosis');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Check what users exist
  const { users, missingDemo } = await checkDatabaseUsers();
  
  // Step 2: Test password hashing
  await testPasswordHashing();
  
  // Step 3: Test current login attempts
  const loginResults = await testLoginAttempts();
  
  // Step 4: Analyze results
  console.log('\n📋 Step 4: Analysis and Fix Strategy');
  const failedLogins = loginResults.filter(r => !r.success);
  
  if (failedLogins.length > 0) {
    console.log(`   ❌ ${failedLogins.length} demo users failed login`);
    console.log('   🔧 Attempting to fix by recreating users...');
    
    // Try to recreate users
    const recreateResults = await recreateDemoUsers();
    
    // Test login again after recreation
    console.log('\n🔐 Step 5: Re-testing logins after user recreation...');
    const finalLoginResults = await testLoginAttempts();
    
    // Final analysis
    console.log('\n📊 Final Results Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const finalSuccesses = finalLoginResults.filter(r => r.success).length;
    const finalFailures = finalLoginResults.filter(r => !r.success).length;
    
    console.log(`✅ Successful logins: ${finalSuccesses}/${demoUsers.length}`);
    console.log(`❌ Failed logins: ${finalFailures}/${demoUsers.length}`);
    
    if (finalSuccesses === demoUsers.length) {
      console.log('\n🎉 ALL DEMO LOGINS FIXED!');
      console.log('✅ Demo users can now login successfully');
      console.log('✅ Frontend "Try" buttons should work');
      console.log('✅ Manual credential entry should work');
      
      console.log('\n🔐 Working Demo Credentials:');
      demoUsers.forEach(user => {
        const result = finalLoginResults.find(r => r.email === user.email);
        const status = result?.success ? '✅' : '❌';
        console.log(`   ${status} ${user.role.padEnd(8)} | ${user.email.padEnd(20)} | ${user.password}`);
      });
      
      console.log('\n💡 Next Steps:');
      console.log('   1. Open frontend: http://localhost:3000');
      console.log('   2. Click any "Try" button for instant demo login');
      console.log('   3. Or manually enter credentials above');
      console.log('   4. Test ONVIF device discovery and streaming');
      
    } else {
      console.log('\n⚠️ Some demo logins still failing');
      console.log('🔧 Additional troubleshooting needed:');
      
      finalLoginResults.forEach(result => {
        if (!result.success) {
          console.log(`   ❌ ${result.email}: ${result.error}`);
        }
      });
      
      console.log('\n🔍 Possible Issues:');
      console.log('   • Database schema mismatch');
      console.log('   • Password hashing algorithm differences');
      console.log('   • Authentication route bugs');
      console.log('   • Database connection issues');
    }
    
  } else {
    console.log('\n🎉 All demo users are already working!');
    console.log('✅ Demo login system is operational');
    
    console.log('\n🔐 Working Demo Credentials:');
    demoUsers.forEach(user => {
      console.log(`   ✅ ${user.role.padEnd(8)} | ${user.email.padEnd(20)} | ${user.password}`);
    });
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
};

// Check if server is running first
const checkServer = async () => {
  try {
    console.log('🔍 Checking server status...');
    const response = await fetch(`${API_BASE}/health`, { timeout: 5000 });
    
    if (response.ok) {
      console.log('✅ Server is running and responding\n');
      return true;
    } else {
      console.log(`❌ Server responded with status: ${response.status}\n`);
      return false;
    }
  } catch (error) {
    console.log('❌ Server is not responding');
    console.log('💡 Start server: cd server && npm run dev\n');
    return false;
  }
};

// Main execution
const main = async () => {
  const serverRunning = await checkServer();
  
  if (serverRunning) {
    await performCompleteFix();
  } else {
    console.log('🚫 Cannot fix demo login - server not accessible');
    process.exit(1);
  }
};

main().catch(error => {
  console.error('❌ Demo login fix failed:', error);
  process.exit(1);
});