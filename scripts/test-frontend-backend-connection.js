#!/usr/bin/env node

const fetch = require('node-fetch');

console.log('🔍 Testing Frontend-Backend Connection...\n');

async function testConnection() {
  const API_BASE_URL = 'http://localhost:3001/api';
  
  // Test 1: Basic connectivity
  console.log('1️⃣ Testing basic connectivity...');
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      timeout: 10000
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Server is reachable');
      console.log('📊 Response status:', response.status);
      console.log('📋 Health data:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Server responded with error:', response.status, response.statusText);
      const text = await response.text();
      console.log('📄 Response body:', text);
    }
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 This usually means the server is not running on port 3001');
    } else if (error.code === 'ENOTFOUND') {
      console.log('💡 DNS resolution failed - check hostname');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('💡 Connection timed out - server may be slow or overloaded');
    }
  }
  
  console.log('\n2️⃣ Testing CORS headers...');
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Origin': 'http://localhost:3000',
        'Content-Type': 'application/json'
      }
    });
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': response.headers.get('access-control-allow-origin'),
      'Access-Control-Allow-Methods': response.headers.get('access-control-allow-methods'),
      'Access-Control-Allow-Headers': response.headers.get('access-control-allow-headers'),
      'Access-Control-Allow-Credentials': response.headers.get('access-control-allow-credentials')
    };
    
    console.log('🔗 CORS Headers:', JSON.stringify(corsHeaders, null, 2));
    
    if (corsHeaders['Access-Control-Allow-Origin']) {
      console.log('✅ CORS is configured');
    } else {
      console.log('❌ CORS headers missing - this will cause frontend connection issues');
    }
  } catch (error) {
    console.log('❌ CORS test failed:', error.message);
  }
  
  console.log('\n3️⃣ Testing authentication endpoint...');
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({
        email: 'admin@local.dev',
        password: 'admin123'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Authentication endpoint working');
      console.log('👤 Login response:', JSON.stringify({
        success: data.success,
        user: data.user?.email || 'N/A',
        hasToken: !!data.accessToken
      }, null, 2));
    } else {
      console.log('❌ Authentication failed:', response.status, response.statusText);
      const text = await response.text();
      console.log('📄 Error response:', text);
    }
  } catch (error) {
    console.log('❌ Authentication test failed:', error.message);
  }
  
  console.log('\n4️⃣ Testing device endpoints...');
  try {
    const response = await fetch(`${API_BASE_URL}/devices`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Devices endpoint working');
      console.log('📱 Devices found:', data.devices?.length || 0);
    } else {
      console.log('❌ Devices endpoint failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.log('❌ Devices test failed:', error.message);
  }
  
  console.log('\n📊 CONNECTION TEST SUMMARY');
  console.log('========================');
  console.log('API Base URL:', API_BASE_URL);
  console.log('Expected Frontend URLs:', 'http://localhost:3000 or http://localhost:5173');
  
  console.log('\n🛠️ TROUBLESHOOTING GUIDE:');
  console.log('1. Ensure backend server is running: cd server && npm run dev');
  console.log('2. Check if port 3001 is available: lsof -i:3001');
  console.log('3. Verify server logs for errors');
  console.log('4. Test health endpoint directly: curl http://localhost:3001/api/health');
  console.log('5. Check firewall/antivirus blocking local connections');
}

testConnection().catch(error => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
});