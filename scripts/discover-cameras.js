#!/usr/bin/env node

import dgram from 'dgram';
import { randomUUID } from 'crypto';

console.log('🔍 Discovering ONVIF cameras on local network...\n');

const DISCOVERY_PORT = 3702;
const MULTICAST_ADDRESS = '239.255.255.250';
const DISCOVERY_TIMEOUT = 10000;

const discoveredDevices = new Map();

function createProbeMessage() {
  const messageId = randomUUID();
  const probeXml = `<?xml version="1.0" encoding="UTF-8"?>
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
</soap:Envelope>`;
  
  return Buffer.from(probeXml, 'utf8');
}

function parseDeviceScopes(scopes) {
  const deviceInfo = {
    manufacturer: 'Unknown',
    model: 'Unknown',
    name: 'Unknown',
    location: 'Unknown'
  };
  
  if (!scopes) return deviceInfo;
  
  const scopeList = scopes.split(' ');
  
  for (const scope of scopeList) {
    const decoded = decodeURIComponent(scope);
    
    if (decoded.includes('mf/')) {
      deviceInfo.manufacturer = decoded.split('mf/')[1];
    } else if (decoded.includes('model/')) {
      deviceInfo.model = decoded.split('model/')[1];
    } else if (decoded.includes('name/')) {
      deviceInfo.name = decoded.split('name/')[1];
    } else if (decoded.includes('location/')) {
      deviceInfo.location = decoded.split('location/')[1];
    }
  }
  
  return deviceInfo;
}

// Simple XML parser for ONVIF responses (avoiding external dependencies)
function parseXMLResponse(xmlString) {
  try {
    // Extract XAddrs
    const xAddrsMatch = xmlString.match(/<wsd:XAddrs>(.*?)<\/wsd:XAddrs>/);
    const xAddrs = xAddrsMatch ? xAddrsMatch[1] : null;
    
    // Extract Types
    const typesMatch = xmlString.match(/<wsd:Types>(.*?)<\/wsd:Types>/);
    const types = typesMatch ? typesMatch[1] : null;
    
    // Extract Scopes
    const scopesMatch = xmlString.match(/<wsd:Scopes>(.*?)<\/wsd:Scopes>/);
    const scopes = scopesMatch ? scopesMatch[1] : null;
    
    return { xAddrs, types, scopes };
  } catch (error) {
    return null;
  }
}

async function discoverDevices() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    socket.on('listening', () => {
      const address = socket.address();
      console.log(`📡 Listening on ${address.address}:${address.port}`);
      
      try {
        socket.addMembership(MULTICAST_ADDRESS);
        socket.setMulticastTTL(1);
        socket.setBroadcast(true);
        
        // Send probe message
        const probeMessage = createProbeMessage();
        socket.send(probeMessage, 0, probeMessage.length, DISCOVERY_PORT, MULTICAST_ADDRESS, (error) => {
          if (error) {
            console.error('❌ Error sending probe message:', error);
          } else {
            console.log('📤 Probe message sent to multicast group');
          }
        });
      } catch (error) {
        console.error('❌ Error setting up multicast:', error);
      }
    });

    socket.on('message', async (msg, rinfo) => {
      try {
        const xmlString = msg.toString('utf8');
        
        // Check if this is a ProbeMatch response
        if (xmlString.includes('wsd:ProbeMatches') && xmlString.includes('wsd:ProbeMatch')) {
          const parsedResponse = parseXMLResponse(xmlString);
          
          if (parsedResponse && parsedResponse.xAddrs) {
            const deviceId = rinfo.address; // Use IP as device ID for simplicity
            
            if (!discoveredDevices.has(deviceId)) {
              const deviceInfo = parseDeviceScopes(parsedResponse.scopes);
              
              const device = {
                id: deviceId,
                ip_address: rinfo.address,
                port: 80,
                endpoint: parsedResponse.xAddrs.split(' ')[0],
                types: parsedResponse.types || 'Unknown',
                scopes: parsedResponse.scopes || 'Unknown',
                manufacturer: deviceInfo.manufacturer,
                model: deviceInfo.model,
                name: deviceInfo.name,
                location: deviceInfo.location,
                discovered_at: new Date().toISOString()
              };
              
              discoveredDevices.set(deviceId, device);
              
              console.log(`📹 Found ONVIF device:`);
              console.log(`   IP: ${device.ip_address}`);
              console.log(`   Name: ${device.name}`);
              console.log(`   Manufacturer: ${device.manufacturer}`);
              console.log(`   Model: ${device.model}`);
              console.log(`   Endpoint: ${device.endpoint}`);
              console.log(`   Types: ${device.types}`);
              console.log('');
            }
          }
        }
      } catch (error) {
        // Ignore parsing errors for non-ONVIF responses
      }
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      reject(error);
    });

    socket.bind(DISCOVERY_PORT);
    
    // Stop discovery after timeout
    setTimeout(() => {
      socket.close();
      
      const devices = Array.from(discoveredDevices.values());
      console.log(`\n🎯 Discovery completed. Found ${devices.length} ONVIF device(s).`);
      
      if (devices.length === 0) {
        console.log('\n💡 Tips for troubleshooting:');
        console.log('   1. Make sure your cameras are powered on and connected to the network');
        console.log('   2. Check that cameras support ONVIF protocol');
        console.log('   3. Verify cameras are on the same subnet as this computer');
        console.log('   4. Some cameras may have ONVIF discovery disabled by default');
        console.log('   5. Try running this script with elevated privileges (sudo on Linux/Mac)');
      } else {
        console.log('\n✅ You can now start the application and these cameras should be discovered automatically!');
      }
      
      resolve(devices);
    }, DISCOVERY_TIMEOUT);
  });
}

discoverDevices().catch(console.error);