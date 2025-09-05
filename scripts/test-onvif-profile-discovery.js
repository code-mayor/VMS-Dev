#!/usr/bin/env node

console.log('🔍 Testing ONVIF Profile Discovery...\n');

// Test device configuration (replace with your actual camera details)
const testDevice = {
  id: 'test-device',
  name: 'Test Honeywell Camera',
  ip_address: '192.168.226.201',
  port: 80,
  username: 'test',  // Replace with actual username
  password: 'Test@123'  // Replace with actual password (with @ symbol URL encoded)
};

// Mock ONVIF service for testing
const { OnvifProfileDiscovery } = require('../services/onvif-profile-discovery');

async function testOnvifDiscovery() {
  console.log(`🎯 Testing ONVIF discovery for: ${testDevice.name} (${testDevice.ip_address})\n`);
  
  try {
    // Create discovery instance
    const discovery = new OnvifProfileDiscovery(testDevice);
    
    console.log('🔐 Setting credentials...');
    discovery.setCredentials(testDevice.username, testDevice.password);
    console.log(`   Username: ${testDevice.username}`);
    console.log(`   Password: ${testDevice.password.replace(/./g, '*')}\n`);
    
    console.log('🔍 Starting ONVIF capability discovery...');
    const capabilities = await discovery.discoverCapabilities();
    
    console.log('✅ ONVIF Discovery Results:');
    console.log('=' .repeat(50));
    
    // Device Information
    console.log('📱 DEVICE INFORMATION:');
    console.log(`   Manufacturer: ${capabilities.deviceInfo.manufacturer}`);
    console.log(`   Model: ${capabilities.deviceInfo.model}`);
    console.log(`   Firmware: ${capabilities.deviceInfo.firmwareVersion}`);
    console.log(`   Serial: ${capabilities.deviceInfo.serialNumber}`);
    console.log('');
    
    // Profiles
    console.log('📋 DISCOVERED PROFILES:');
    if (capabilities.profiles.length > 0) {
      capabilities.profiles.forEach((profile, index) => {
        console.log(`   ${index + 1}. ${profile.name} (Token: ${profile.token})`);
        console.log(`      RTSP URI: ${profile.rtspUri}`);
        if (profile.snapshotUri) {
          console.log(`      Snapshot URI: ${profile.snapshotUri}`);
        }
        if (profile.httpUri) {
          console.log(`      HTTP URI: ${profile.httpUri}`);
        }
        console.log('');
      });
    } else {
      console.log('   No profiles found');
    }
    
    // Capabilities
    console.log('⚙️ STREAMING CAPABILITIES:');
    console.log(`   RTSP Streaming: ${capabilities.streamingCapabilities.rtspStreaming ? '✅' : '❌'}`);
    console.log(`   HTTP Streaming: ${capabilities.streamingCapabilities.httpStreaming ? '✅' : '❌'}`);
    console.log(`   Snapshot URI: ${capabilities.streamingCapabilities.snapshotUri ? '✅' : '❌'}`);
    console.log('');
    
    console.log('🎮 PTZ CAPABILITIES:');
    console.log(`   PTZ Support: ${capabilities.ptzCapabilities.supportsPTZ ? '✅' : '❌'}`);
    console.log(`   Presets: ${capabilities.ptzCapabilities.presets ? '✅' : '❌'}`);
    console.log(`   Home Position: ${capabilities.ptzCapabilities.homePosition ? '✅' : '❌'}`);
    console.log('');
    
    // Generate stream profiles
    console.log('🎥 GENERATED STREAM PROFILES:');
    const streamProfiles = discovery.generateStreamProfiles(capabilities);
    streamProfiles.slice(0, 5).forEach((profile, index) => {
      console.log(`   ${index + 1}. ${profile.name} (Priority: ${profile.priority})`);
      console.log(`      Type: ${profile.type.toUpperCase()}`);
      console.log(`      Browser Compatible: ${profile.browserCompatible ? '✅' : '❌'}`);
      console.log(`      URL: ${profile.url}`);
      console.log('');
    });
    
    console.log('🎊 ONVIF DISCOVERY SUCCESSFUL!');
    console.log('');
    
    // Provide recommendations
    console.log('💡 RECOMMENDATIONS:');
    const rtspProfiles = capabilities.profiles.filter(p => p.rtspUri);
    const snapshotProfiles = capabilities.profiles.filter(p => p.snapshotUri);
    
    if (rtspProfiles.length > 0) {
      console.log(`📺 Best RTSP stream: ${rtspProfiles[0].rtspUri}`);
    }
    
    if (snapshotProfiles.length > 0) {
      console.log(`📸 Best snapshot: ${snapshotProfiles[0].snapshotUri}`);
    }
    
    console.log('🔧 Try these URLs in VLC Media Player:');
    rtspProfiles.slice(0, 3).forEach((profile, index) => {
      console.log(`   ${index + 1}. ${profile.rtspUri}`);
    });
    
  } catch (error) {
    console.error('❌ ONVIF Discovery Failed:');
    console.error(`   Error: ${error.message}`);
    console.error('');
    
    console.log('🔧 TROUBLESHOOTING:');
    console.log('1. Verify camera IP address and port');
    console.log('2. Check username and password');
    console.log('3. Ensure camera supports ONVIF');
    console.log('4. Check network connectivity');
    console.log('5. Try accessing camera web interface directly');
    console.log('');
    
    console.log('🌐 Test camera web interface:');
    console.log(`   http://${testDevice.ip_address}:${testDevice.port}`);
    console.log('');
    
    console.log('🎥 Fallback RTSP URLs to try:');
    console.log(`   rtsp://${testDevice.username}:${encodeURIComponent(testDevice.password)}@${testDevice.ip_address}:554/profile1`);
    console.log(`   rtsp://${testDevice.username}:${encodeURIComponent(testDevice.password)}@${testDevice.ip_address}:554/profile2`);
    console.log(`   rtsp://${testDevice.username}:${encodeURIComponent(testDevice.password)}@${testDevice.ip_address}:554/live`);
    console.log(`   rtsp://${testDevice.username}:${encodeURIComponent(testDevice.password)}@${testDevice.ip_address}:554/Streaming/Channels/101`);
  }
}

async function testBasicConnectivity() {
  console.log('🌐 Testing basic connectivity...\n');
  
  // Test if camera web interface is accessible
  try {
    const response = await fetch(`http://${testDevice.ip_address}:${testDevice.port}`, {
      method: 'HEAD',
      timeout: 5000
    });
    
    if (response.ok) {
      console.log('✅ Camera web interface is accessible');
    } else {
      console.log(`⚠️ Camera web interface returned: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Cannot reach camera web interface: ${error.message}`);
  }
  
  // Test ONVIF device service endpoint
  try {
    const onvifEndpoint = `http://${testDevice.ip_address}:${testDevice.port}/onvif/device_service`;
    const response = await fetch(onvifEndpoint, {
      method: 'HEAD',
      timeout: 5000
    });
    
    if (response.ok) {
      console.log('✅ ONVIF device service endpoint is accessible');
    } else {
      console.log(`⚠️ ONVIF device service returned: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Cannot reach ONVIF device service: ${error.message}`);
  }
  
  console.log('');
}

// Main test execution
async function runTests() {
  console.log('🚀 ONVIF Profile Discovery Test Suite');
  console.log('=' .repeat(50));
  console.log('');
  
  // Update these values for your camera
  console.log('📝 Test Configuration:');
  console.log(`   Camera IP: ${testDevice.ip_address}`);
  console.log(`   Port: ${testDevice.port}`);
  console.log(`   Username: ${testDevice.username}`);
  console.log(`   Password: ${testDevice.password.replace(/./g, '*')}`);
  console.log('');
  
  console.log('⚠️  IMPORTANT: Update the testDevice configuration above with your actual camera details!');
  console.log('');
  
  // Test basic connectivity first
  await testBasicConnectivity();
  
  // Test ONVIF discovery
  await testOnvifDiscovery();
  
  console.log('🏁 Test completed!');
}

// Check if xml2js is available (required for ONVIF)
try {
  require('xml2js');
  runTests().catch(console.error);
} catch (error) {
  console.log('❌ Missing dependency: xml2js');
  console.log('');
  console.log('📦 Install required dependencies:');
  console.log('   npm install xml2js');
  console.log('   npm install node-fetch');
  console.log('');
  console.log('Then run this test again.');
}