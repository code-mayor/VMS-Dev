#!/usr/bin/env node

const fetch = require('node-fetch');

console.log('🧪 Testing User Registration Fix...\n');

const API_BASE = 'http://localhost:3001/api';

const testRegistration = async (userData, expectSuccess = true) => {
  try {
    console.log(`📝 Testing registration: ${userData.email} (${userData.role})`);
    
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
      timeout: 10000
    });

    const data = await response.json();

    if (expectSuccess) {
      if (response.ok && data.success) {
        console.log(`   ✅ REGISTRATION SUCCESS`);
        console.log(`      User: ${data.user.name} (${data.user.email})`);
        console.log(`      Role: ${data.user.role}`);
        console.log(`      ID: ${data.user.id}`);
        console.log(`      Message: ${data.message || 'Account created'}`);
        
        return { success: true, user: data.user };
      } else {
        console.log(`   ❌ REGISTRATION FAILED (Expected Success)`);
        console.log(`      Status: ${response.status}`);
        console.log(`      Error: ${data.error || 'Unknown error'}`);
        
        return { success: false, error: data.error, expectedSuccess: true };
      }
    } else {
      if (!response.ok || !data.success) {
        console.log(`   ✅ REGISTRATION CORRECTLY FAILED (Expected)`);
        console.log(`      Status: ${response.status}`);
        console.log(`      Error: ${data.error || 'Unknown error'}`);
        
        return { success: true, expectedFailure: true };
      } else {
        console.log(`   ❌ REGISTRATION SUCCEEDED (Expected Failure)`);
        console.log(`      User: ${data.user.name} (${data.user.email})`);
        
        return { success: false, error: 'Should have failed', expectedFailure: true };
      }
    }
  } catch (error) {
    console.log(`   ❌ CONNECTION ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const testLogin = async (email, password) => {
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

const checkExistingUsers = async () => {
  try {
    console.log('📊 Checking existing users...');
    
    const response = await fetch(`${API_BASE}/auth/debug/users`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Found ${data.count} existing users:`);
      
      data.users.forEach(user => {
        console.log(`      - ${user.email} (${user.name}, ${user.role})`);
      });
      
      return data.users;
    } else {
      console.log(`   ⚠️ Could not fetch users (Status: ${response.status})`);
      return [];
    }
  } catch (error) {
    console.log(`   ❌ Error checking users: ${error.message}`);
    return [];
  }
};

const runRegistrationTests = async () => {
  console.log('📊 User Registration Fix Test Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check existing users first
  const existingUsers = await checkExistingUsers();
  console.log();

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);

  const testCases = [
    // Valid registration cases
    {
      name: 'New Admin User',
      data: {
        email: `admin${randomId}@test.local`,
        password: 'Test@123',
        name: 'Test Admin',
        role: 'admin'
      },
      expectSuccess: true
    },
    {
      name: 'New Operator User',
      data: {
        email: `operator${randomId}@test.local`,
        password: 'Test@456',
        name: 'Test Operator',
        role: 'operator'
      },
      expectSuccess: true
    },
    {
      name: 'New Viewer User',
      data: {
        email: `viewer${randomId}@test.local`,
        password: 'Test@789',
        name: 'Test Viewer',
        role: 'viewer'
      },
      expectSuccess: true
    },
    
    // Invalid registration cases
    {
      name: 'Duplicate Email (Demo User)',
      data: {
        email: 'admin@local.dev',
        password: 'Test@123',
        name: 'Duplicate Admin',
        role: 'admin'
      },
      expectSuccess: false
    },
    {
      name: 'Invalid Email Format',
      data: {
        email: 'invalid-email',
        password: 'Test@123',
        name: 'Invalid User',
        role: 'viewer'
      },
      expectSuccess: false
    },
    {
      name: 'Short Password',
      data: {
        email: `short${randomId}@test.local`,
        password: '123',
        name: 'Short Password User',
        role: 'viewer'
      },
      expectSuccess: false
    },
    {
      name: 'Invalid Role',
      data: {
        email: `invalid${randomId}@test.local`,
        password: 'Test@123',
        name: 'Invalid Role User',
        role: 'invalid'
      },
      expectSuccess: false
    },
    {
      name: 'Missing Required Fields',
      data: {
        email: `missing${randomId}@test.local`,
        password: '',
        name: '',
        role: 'viewer'
      },
      expectSuccess: false
    }
  ];

  const results = [];
  const createdUsers = [];

  for (const testCase of testCases) {
    console.log(`\n🧪 Test Case: ${testCase.name}`);
    const result = await testRegistration(testCase.data, testCase.expectSuccess);
    results.push({ ...testCase, result });
    
    if (result.success && testCase.expectSuccess && result.user) {
      createdUsers.push({
        email: testCase.data.email,
        password: testCase.data.password,
        user: result.user
      });
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Test login for successfully created users
  console.log('\n🔐 Testing Login for New Users');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const loginResults = [];
  for (const createdUser of createdUsers) {
    const loginResult = await testLogin(createdUser.email, createdUser.password);
    loginResults.push({ ...createdUser, loginResult });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n📋 Test Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const validTests = results.filter(r => r.expectSuccess);
  const invalidTests = results.filter(r => !r.expectSuccess);
  
  const validSuccesses = validTests.filter(r => r.result.success).length;
  const invalidSuccesses = invalidTests.filter(r => r.result.success).length;
  
  const loginSuccesses = loginResults.filter(r => r.loginResult.success).length;

  console.log(`\n📊 Registration Tests:`);
  console.log(`✅ Valid registrations successful: ${validSuccesses}/${validTests.length}`);
  console.log(`✅ Invalid registrations correctly failed: ${invalidSuccesses}/${invalidTests.length}`);
  console.log(`\n🔐 Login Tests:`);
  console.log(`✅ New user logins successful: ${loginSuccesses}/${createdUsers.length}`);

  // Detailed results
  console.log(`\n📋 Detailed Results:`);
  results.forEach(testCase => {
    const status = testCase.result.success ? '✅' : '❌';
    const expected = testCase.expectSuccess ? 'Should succeed' : 'Should fail';
    console.log(`${status} ${testCase.name} (${expected})`);
    
    if (testCase.result.error && !testCase.result.expectedFailure) {
      console.log(`     Error: ${testCase.result.error}`);
    }
  });

  if (createdUsers.length > 0) {
    console.log(`\n👥 Successfully Created Users:`);
    createdUsers.forEach(user => {
      const loginStatus = loginResults.find(r => r.email === user.email)?.loginResult.success ? '🔐✅' : '🔐❌';
      console.log(`   ${loginStatus} ${user.user.name} (${user.email}) - ${user.user.role}`);
    });
  }

  const allTestsPassed = validSuccesses === validTests.length && 
                        invalidSuccesses === invalidTests.length && 
                        loginSuccesses === createdUsers.length;

  if (allTestsPassed) {
    console.log('\n🎉 All registration tests PASSED!');
    console.log('✅ User registration system is working correctly');
    console.log('✅ Validation rules are properly enforced');
    console.log('✅ New users can login successfully');
    console.log('\n💡 Frontend users can now:');
    console.log('   1. Open http://localhost:3000');
    console.log('   2. Go to "Sign Up" tab');
    console.log('   3. Click refresh button for sample data');
    console.log('   4. Create new accounts with unique emails');
    console.log('   5. Login with newly created accounts');
  } else {
    console.log('\n⚠️ Some registration tests FAILED');
    console.log('❌ User registration system needs attention');
    
    console.log('\n🔧 Check the following:');
    console.log('   1. Server logs for detailed error messages');
    console.log('   2. Database schema and constraints');
    console.log('   3. Authentication route implementation');
    console.log('   4. Frontend form validation');
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
    await runRegistrationTests();
  } else {
    console.log('🚫 Cannot test registration - server not accessible');
    process.exit(1);
  }
};

main().catch(error => {
  console.error('❌ Registration test failed:', error);
  process.exit(1);
});