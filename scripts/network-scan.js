#!/usr/bin/env node

import dgram from 'dgram';
import { randomUUID } from 'crypto';
import os from 'os';

console.log('🔍 Network Scanner for ONVIF Devices\n');

// Common camera IP ranges and ports
const commonRanges = [
  '192.168.1',
  '192.168.0',
  '192.168.236', // VM networks
  '10.0.0',
  '172.16.0'
];

const commonPorts = [80, 8080, 554, 3702];

function getLocalNetworks() {
  const interfaces = os.networkInterfaces();
  const networks = [];
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const subnet = addr.address.split('.').slice(0, 3).join('.');
        networks.push({
          name,
          subnet,
          address: addr.address,
          netmask: addr.netmask
        });
      }
    }
  }
  
  return networks;
}

function createProbeMessage() {
  const messageId = randomUUID();
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope 
    xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
    xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
    xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery"
    xmlns:wsdp="http://schemas.xmlsoap.org/ws/2006/02/devprof">
  <soap:Header>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>urn:uuid:${messageId}</wsa:MessageID>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </soap:Header>
  <soap:Body>
    <wsd:Probe>
      <wsd:Types>wsdp:Device</wsd:Types>
    </wsd:Probe>
  </soap:Body>
</soap:Envelope>`, 'utf8');
}

async function scanNetwork() {
  const networks = getLocalNetworks();
  
  console.log('📡 Local Network Interfaces:');
  networks.forEach(net => {
    console.log(`   ${net.name}: ${net.address}/${net.netmask} (subnet: ${net.subnet}.x)`);
  });
  console.log('');
  
  // Test ONVIF discovery on each interface
  console.log('🔍 Testing ONVIF Discovery...');
  
  for (const network of networks) {
    console.log(`\n📡 Testing on ${network.name} (${network.address}):`);
    
    try {
      const devices = await testOnvifDiscovery(network);
      if (devices.length > 0) {
        console.log(`   ✅ Found ${devices.length} device(s):`);
        devices.forEach(device => {
          console.log(`      📹 ${device.ip} - ${device.info}`);
        });
      } else {
        console.log(`   ❌ No ONVIF devices found on this interface`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  // Test direct connection to known IP
  console.log('\n🎯 Testing Direct Connection to 192.168.236.201...');
  try {
    const result = await testDirectConnection('192.168.236.201');
    if (result) {
      console.log('   ✅ Device responds to ONVIF probe');
    } else {
      console.log('   ❌ Device does not respond to ONVIF probe');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Test HTTP connectivity
  console.log('\n🌐 Testing HTTP Connectivity...');
  const testIPs = ['192.168.236.201'];
  
  for (const ip of testIPs) {
    console.log(`\n📡 Testing ${ip}:`);
    
    for (const port of commonPorts) {
      try {
        const reachable = await testHttpConnection(ip, port);
        console.log(`   Port ${port}: ${reachable ? '✅ Open' : '❌ Closed/Filtered'}`);
      } catch (error) {
        console.log(`   Port ${port}: ❌ Error - ${error.message}`);
      }
    }
  }
  
  console.log('\n💡 Troubleshooting Tips:');
  console.log('   1. Check if camera is powered on and connected');
  console.log('   2. Verify camera IP address in camera settings');
  console.log('   3. Check if ONVIF is enabled in camera settings');
  console.log('   4. Try accessing camera web interface directly');
  console.log('   5. Check firewall settings on both devices');
  console.log('   6. Ensure devices are on the same network/VLAN');
}

function testOnvifDiscovery(network) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const discoveredDevices = [];
    
    socket.on('listening', () => {
      try {
        socket.addMembership('239.255.255.250', network.address);
        socket.setMulticastTTL(1);
        socket.setMulticastInterface(network.address);
        
        const probeMessage = createProbeMessage();
        socket.send(probeMessage, 0, probeMessage.length, 3702, '239.255.255.250');
      } catch (error) {
        console.log(`      Warning: Multicast setup failed - ${error.message}`);
      }
    });
    
    socket.on('message', (msg, rinfo) => {
      try {
        const xmlString = msg.toString('utf8');
        if (xmlString.includes('wsd:ProbeMatches')) {
          const info = extractDeviceInfo(xmlString);
          discoveredDevices.push({
            ip: rinfo.address,
            info: info
          });
        }
      } catch (error) {
        // Ignore parsing errors
      }
    });
    
    socket.on('error', (error) => {
      resolve([]);
    });
    
    try {
      socket.bind(3702, network.address);
    } catch (error) {
      resolve([]);
      return;
    }
    
    setTimeout(() => {
      try {
        socket.close();
      } catch (e) {}
      resolve(discoveredDevices);
    }, 5000);
  });
}

function testDirectConnection(ip) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const probeMessage = createProbeMessage();
    let responded = false;
    
    socket.on('message', () => {
      responded = true;
      socket.close();
      resolve(true);
    });
    
    socket.on('error', () => {
      socket.close();
      resolve(false);
    });
    
    socket.send(probeMessage, 0, probeMessage.length, 3702, ip, (error) => {
      if (error) {
        socket.close();
        resolve(false);
      }
    });
    
    setTimeout(() => {
      if (!responded) {
        socket.close();
        resolve(false);
      }
    }, 3000);
  });
}

function testHttpConnection(ip, port) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    
    // Simple UDP test - not perfect but gives us an idea
    socket.send(Buffer.from('test'), 0, 4, port, ip, (error) => {
      socket.close();
      resolve(!error);
    });
    
    setTimeout(() => {
      socket.close();
      resolve(false);
    }, 2000);
  });
}

function extractDeviceInfo(xmlString) {
  try {
    const scopesMatch = xmlString.match(/<wsd:Scopes>(.*?)<\/wsd:Scopes>/);
    if (scopesMatch) {
      const scopes = scopesMatch[1];
      const mfMatch = scopes.match(/mf\/([^\/\s]+)/);
      const modelMatch = scopes.match(/model\/([^\/\s]+)/);
      
      const manufacturer = mfMatch ? decodeURIComponent(mfMatch[1]) : 'Unknown';
      const model = modelMatch ? decodeURIComponent(modelMatch[1]) : 'Unknown';
      
      return `${manufacturer} ${model}`;
    }
    return 'ONVIF Device';
  } catch (error) {
    return 'ONVIF Device';
  }
}

scanNetwork().catch(console.error);