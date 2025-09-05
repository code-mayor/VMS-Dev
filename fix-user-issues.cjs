#!/usr/bin/env node

/**
 * Fix User Management Issues Script
 * Diagnoses and fixes:
 * 1. Missing user management endpoints
 * 2. Authentication issues
 * 3. Demo user duplicates
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 ONVIF VMS User Management Fix Script\n');
console.log('========================================\n');

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkServerRunning() {
  log('\n📡 Checking if backend server is running...', 'blue');
  
  try {
    const response = await fetch('http://localhost:3001/api/health');
    if (response.ok) {
      log('✅ Backend server is running', 'green');
      return true;
    }
  } catch (error) {
    log('❌ Backend server is not running', 'red');
    log('   Start it with: cd server && npm run dev', 'yellow');
    return false;
  }
  return false;
}

async function testAuthEndpoints() {
  log('\n🔐 Testing authentication endpoints...', 'blue');
  
  const endpoints = [
    { method: 'GET', path: '/api/auth/status', requiresAuth: false },
    { method: 'POST', path: '/api/auth/login', requiresAuth: false },
    { method: 'GET', path: '/api/auth/users', requiresAuth: true },
    { method: 'GET', path: '/api/auth/debug/users', requiresAuth: false }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const options = {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      if (endpoint.requiresAuth) {
        // Try with a dummy token to see if endpoint exists
        options.headers['Authorization'] = 'Bearer test-token';
      }
      
      if (endpoint.method === 'POST' && endpoint.path.includes('login')) {
        options.body = JSON.stringify({
          email: 'test@test.com',
          password: 'test123'
        });
      }
      
      const response = await fetch(`http://localhost:3001${endpoint.path}`, options);
      
      if (response.status === 404) {
        log(`   ❌ ${endpoint.method} ${endpoint.path} - NOT FOUND`, 'red');
      } else if (response.status === 401 && endpoint.requiresAuth) {
        log(`   ✅ ${endpoint.method} ${endpoint.path} - EXISTS (auth required)`, 'green');
      } else if (response.status >= 200 && response.status < 500) {
        log(`   ✅ ${endpoint.method} ${endpoint.path} - EXISTS`, 'green');
      } else {
        log(`   ⚠️  ${endpoint.method} ${endpoint.path} - Status ${response.status}`, 'yellow');
      }
    } catch (error) {
      log(`   ❌ ${endpoint.method} ${endpoint.path} - ERROR: ${error.message}`, 'red');
    }
  }
}

async function testDemoLogin() {
  log('\n👤 Testing demo user login...', 'blue');
  
  const demoUsers = [
    { email: 'admin@local.dev', password: 'admin123' },
    { email: 'operator@local.dev', password: 'operator123' },
    { email: 'viewer@local.dev', password: 'viewer123' }
  ];
  
  for (const user of demoUsers) {
    try {
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(user)
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        log(`   ✅ ${user.email} - LOGIN SUCCESS`, 'green');
        
        // Test /users endpoint with this token
        if (data.accessToken) {
          const usersResponse = await fetch('http://localhost:3001/api/auth/users', {
            headers: {
              'Authorization': `Bearer ${data.accessToken}`
            }
          });
          
          if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            log(`      ✅ Can fetch users list (${usersData.users?.length || 0} users)`, 'green');
          } else {
            const errorData = await usersResponse.json().catch(() => ({}));
            log(`      ❌ Cannot fetch users: ${errorData.error || usersResponse.status}`, 'red');
          }
        }
      } else {
        log(`   ❌ ${user.email} - LOGIN FAILED: ${data.error || 'Unknown error'}`, 'red');
      }
    } catch (error) {
      log(`   ❌ ${user.email} - ERROR: ${error.message}`, 'red');
    }
  }
}

async function checkDatabaseUsers() {
  log('\n💾 Checking database for duplicate users...', 'blue');
  
  try {
    const response = await fetch('http://localhost:3001/api/auth/debug/users');
    if (response.ok) {
      const data = await response.json();
      const users = data.users || [];
      
      log(`   Found ${users.length} total users in database`, 'blue');
      
      // Check for duplicates
      const emailCounts = {};
      users.forEach(user => {
        emailCounts[user.email] = (emailCounts[user.email] || 0) + 1;
      });
      
      const duplicates = Object.entries(emailCounts).filter(([email, count]) => count > 1);
      
      if (duplicates.length > 0) {
        log('\n   ⚠️  Duplicate users found:', 'yellow');
        duplicates.forEach(([email, count]) => {
          log(`      ${email}: ${count} instances`, 'yellow');
        });
      } else {
        log('   ✅ No duplicate users found', 'green');
      }
      
      // List all users
      log('\n   Current users:', 'blue');
      users.forEach(user => {
        log(`      - ${user.email} (${user.role}) - ${user.name}`, 'blue');
      });
      
    } else {
      log('   ❌ Could not fetch users from database', 'red');
    }
  } catch (error) {
    log(`   ❌ Error checking database: ${error.message}`, 'red');
  }
}

async function createMissingEndpoints() {
  log('\n🔨 Checking if auth.js needs updating...', 'blue');
  
  const authPath = path.join(__dirname, 'server', 'routes', 'auth.js');
  
  if (!fs.existsSync(authPath)) {
    log('   ❌ auth.js file not found at ' + authPath, 'red');
    return;
  }
  
  const authContent = fs.readFileSync(authPath, 'utf8');
  
  // Check if user management endpoints exist
  const hasUsersEndpoint = authContent.includes("router.get('/users'");
  const hasRegisterEndpoint = authContent.includes("router.post('/register'");
  const hasUpdateEndpoint = authContent.includes("router.put('/users/:userId'");
  const hasDeleteEndpoint = authContent.includes("router.delete('/users/:userId'");
  
  const missing = [];
  if (!hasUsersEndpoint) missing.push('GET /users');
  if (!hasRegisterEndpoint) missing.push('POST /register');
  if (!hasUpdateEndpoint) missing.push('PUT /users/:userId');
  if (!hasDeleteEndpoint) missing.push('DELETE /users/:userId');
  
  if (missing.length > 0) {
    log('   ⚠️  Missing endpoints in auth.js:', 'yellow');
    missing.forEach(endpoint => {
      log(`      - ${endpoint}`, 'yellow');
    });
    log('\n   📝 To fix this, update server/routes/auth.js with the complete version', 'yellow');
    log('      that includes all user management endpoints.', 'yellow');
  } else {
    log('   ✅ All user management endpoints found in auth.js', 'green');
  }
}

async function runDiagnostics() {
  log('Starting diagnostics...', 'green');
  
  // Check if server is running
  const serverRunning = await checkServerRunning();
  
  if (!serverRunning) {
    log('\n⚠️  Please start the backend server first:', 'yellow');
    log('   cd server && npm run dev', 'yellow');
    return;
  }
  
  // Check auth endpoints
  await testAuthEndpoints();
  
  // Check demo logins
  await testDemoLogin();
  
  // Check database users
  await checkDatabaseUsers();
  
  // Check if endpoints need to be added
  await createMissingEndpoints();
  
  log('\n========================================', 'blue');
  log('📋 RECOMMENDATIONS:', 'green');
  log('\n1. If endpoints are missing (404 errors):', 'yellow');
  log('   - Update server/routes/auth.js with the complete version', 'blue');
  log('   - Restart the backend server', 'blue');
  
  log('\n2. If authentication fails:', 'yellow');
  log('   - Check that JWT token is being stored and sent correctly', 'blue');
  log('   - Verify localStorage has vms_token after login', 'blue');
  
  log('\n3. If duplicate users exist:', 'yellow');
  log('   - Clear the database and restart: rm server/vms.db', 'blue');
  log('   - The server will recreate demo users on startup', 'blue');
  
  log('\n4. To manually test:', 'yellow');
  log('   - Login as admin@local.dev / admin123', 'blue');
  log('   - Navigate to User Management page', 'blue');
  log('   - Check browser console for errors', 'blue');
  
  log('\n========================================\n', 'blue');
}

// Run the diagnostics
runDiagnostics().catch(error => {
  log(`\n❌ Script error: ${error.message}`, 'red');
  process.exit(1);
});