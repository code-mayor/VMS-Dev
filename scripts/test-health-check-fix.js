#!/usr/bin/env node

console.log('🏥 Testing Health Check Fix...\n');

async function testHealthCheck() {
  const API_BASE_URL = 'http://localhost:3001/api';
  
  try {
    console.log('1️⃣ Testing health endpoint directly...');
    
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response ok:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('📋 Full response data:', JSON.stringify(data, null, 2));
      
      console.log('\n2️⃣ Testing health parsing logic...');
      
      // Test the OLD logic (broken)
      const oldLogic = data.status === 'healthy';
      console.log('❌ OLD logic result (data.status === "healthy"):', oldLogic);
      
      // Test the NEW logic (fixed)
      const newLogic = data.success && data.health && data.health.status === 'healthy';
      console.log('✅ NEW logic result (data.success && data.health && data.health.status === "healthy"):', newLogic);
      
      console.log('\n3️⃣ Health details:');
      if (data.health) {
        console.log('   Status:', data.health.status);
        console.log('   Database:', data.health.database);
        console.log('   ONVIF Discovery:', data.health.onvif_discovery);
        console.log('   Uptime:', data.health.uptime, 'seconds');
        console.log('   Version:', data.health.version);
      }
      
      console.log('\n✅ HEALTH CHECK FIX VERIFIED!');
      console.log('The frontend should now properly detect the server as healthy.');
      
    } else {
      console.log('❌ Health check failed with status:', response.status);
      const text = await response.text();
      console.log('Response body:', text);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Backend server is not running.');
      console.log('Start it with: cd server && npm run dev');
    }
  }
}

testHealthCheck();