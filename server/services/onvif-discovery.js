const dgram = require('dgram');
const os = require('os');
const { logger } = require('../utils/logger');

class OnvifDiscovery {
  constructor() {
    this.discoveredDevices = new Map();
    this.discoveryTimeout = 15000; // 15 seconds
    this.periodicInterval = null;
    this.isDiscovering = false;
  }

  // Start periodic discovery (called from server startup)
  startPeriodicDiscovery(callback) {
    console.log('🔍 Starting ONVIF periodic discovery service...');
    
    // Run initial discovery
    this.discoverDevices()
      .then(devices => {
        console.log(`✅ Initial discovery completed. Found ${devices.length} device(s)`);
        if (callback) callback(devices);
      })
      .catch(error => {
        console.error('❌ Initial discovery failed:', error);
        if (callback) callback([]);
      });

    // Set up periodic discovery every 5 minutes
    this.periodicInterval = setInterval(async () => {
      try {
        console.log('🔄 Running periodic ONVIF discovery...');
        const devices = await this.discoverDevices();
        console.log(`📡 Periodic discovery found ${devices.length} device(s)`);
        if (callback) callback(devices);
      } catch (error) {
        console.error('❌ Periodic discovery error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    console.log('✅ ONVIF periodic discovery service started');
  }

  // Stop periodic discovery
  stopPeriodicDiscovery() {
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
      this.periodicInterval = null;
      console.log('🛑 ONVIF periodic discovery stopped');
    }
  }

  // Manual discovery trigger
  async discoverDevices() {
    if (this.isDiscovering) {
      console.log('⏳ Discovery already in progress, skipping...');
      return Array.from(this.discoveredDevices.values());
    }

    this.isDiscovering = true;
    console.log('🔍 Starting ONVIF device discovery...');
    
    try {
      // Clear previous discoveries
      this.discoveredDevices.clear();

      // Get network interfaces
      const interfaces = this.getNetworkInterfaces();
      console.log(`📡 Scanning ${interfaces.length} network interface(s)...`);

      // Create discovery promises for each interface
      const discoveryPromises = interfaces.map(iface => 
        this.discoverOnInterface(iface)
      );

      // Wait for all discoveries to complete with timeout
      await Promise.all(discoveryPromises);

      const devices = Array.from(this.discoveredDevices.values());
      console.log(`✅ ONVIF discovery completed. Found ${devices.length} device(s)`);
      
      return devices;

    } catch (error) {
      console.error('❌ ONVIF discovery failed:', error);
      throw error;
    } finally {
      this.isDiscovering = false;
    }
  }

  // Get available network interfaces
  getNetworkInterfaces() {
    const interfaces = [];
    const networkInterfaces = os.networkInterfaces();

    for (const [name, addresses] of Object.entries(networkInterfaces)) {
      if (!addresses) continue;

      for (const address of addresses) {
        // Skip loopback, internal, and IPv6 addresses
        if (address.internal || address.family !== 'IPv4') continue;
        
        interfaces.push({
          name,
          address: address.address,
          netmask: address.netmask
        });
      }
    }

    if (interfaces.length === 0) {
      console.warn('⚠️ No valid network interfaces found');
    } else {
      console.log(`📡 Available network interfaces: ${interfaces.map(i => `${i.name}(${i.address})`).join(', ')}`);
    }

    return interfaces;
  }

  // Discover devices on a specific network interface
  async discoverOnInterface(iface) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      let timeoutId;

      // Setup timeout
      timeoutId = setTimeout(() => {
        socket.close();
        resolve();
      }, this.discoveryTimeout);

      // Handle socket errors
      socket.on('error', (error) => {
        console.error(`❌ Socket error on ${iface.name}:`, error);
        clearTimeout(timeoutId);
        socket.close();
        resolve(); // Don't reject, just resolve empty
      });

      // Handle incoming messages
      socket.on('message', (message, remote) => {
        try {
          this.processOnvifResponse(message.toString(), remote);
        } catch (error) {
          console.error('❌ Error processing ONVIF response:', error);
        }
      });

      // Bind socket and start discovery
      socket.bind(() => {
        try {
          socket.setBroadcast(true);
          
          // Send WS-Discovery probe
          const probeMessage = this.createProbeMessage();
          const broadcastAddress = this.getBroadcastAddress(iface.address, iface.netmask);
          
          console.log(`📡 ONVIF Discovery listening on ${iface.name} (${iface.address}:3702)`);
          
          socket.send(probeMessage, 3702, broadcastAddress, (error) => {
            if (error) {
              console.error(`❌ Failed to send probe on ${iface.name}:`, error);
              clearTimeout(timeoutId);
              socket.close();
              resolve();
            }
          });

        } catch (error) {
          console.error(`❌ Error setting up discovery on ${iface.name}:`, error);
          clearTimeout(timeoutId);
          socket.close();
          resolve();
        }
      });

      // Cleanup when timeout occurs
      socket.on('close', () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }

  // Create WS-Discovery probe message
  createProbeMessage() {
    const uuid = this.generateUUID();
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" 
  xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery" 
  xmlns:tns="http://www.onvif.org/ver10/network/wsdl">
  <soap:Header>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>urn:uuid:${uuid}</wsa:MessageID>
    <wsa:ReplyTo>
      <wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address>
    </wsa:ReplyTo>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </soap:Header>
  <soap:Body>
    <wsd:Probe>
      <wsd:Types>tns:NetworkVideoTransmitter</wsd:Types>
    </wsd:Probe>
  </soap:Body>
</soap:Envelope>`;
  }

  // Process ONVIF discovery responses
  processOnvifResponse(message, remote) {
    try {
      // Simple XML parsing for device information
      const deviceMatch = message.match(/<wsa:EndpointReference><wsa:Address>(.*?)<\/wsa:Address>/);
      const typesMatch = message.match(/<wsd:Types>(.*?)<\/wsd:Types>/);
      const scopesMatch = message.match(/<wsd:Scopes>(.*?)<\/wsd:Scopes>/);

      if (deviceMatch) {
        const endpoint = deviceMatch[1];
        const types = typesMatch ? typesMatch[1] : '';
        const scopes = scopesMatch ? scopesMatch[1] : '';

        // Extract device information from scopes
        const deviceInfo = this.parseDeviceScopes(scopes);
        
        const device = {
          id: this.generateDeviceId(remote.address),
          name: deviceInfo.name || `ONVIF Device ${remote.address}`,
          ip_address: remote.address,
          port: remote.port || 80,
          endpoint: endpoint,
          manufacturer: deviceInfo.manufacturer || 'Unknown',
          model: deviceInfo.model || 'Unknown',
          hardware: deviceInfo.hardware || 'Unknown',
          location: deviceInfo.location || 'Unknown',
          onvif_profile: this.extractOnvifProfile(types),
          types: types,
          scopes: scopes,
          capabilities: {
            ptz: types.includes('PTZ') || scopes.includes('PTZ'),
            audio: types.includes('Audio') || scopes.includes('Audio'),
            video: types.includes('Video') || types.includes('NetworkVideoTransmitter'),
            analytics: types.includes('Analytics') || scopes.includes('Analytics')
          },
          status: 'discovered',
          discovered_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        };

        // Avoid duplicates
        if (!this.discoveredDevices.has(device.id)) {
          this.discoveredDevices.set(device.id, device);
          console.log(`📹 Discovered ONVIF device: ${device.name} at ${device.ip_address}`);
        }
      }
    } catch (error) {
      console.error('❌ Error parsing ONVIF response:', error);
    }
  }

  // Parse device information from scopes
  parseDeviceScopes(scopes) {
    const info = {
      name: null,
      manufacturer: null,
      model: null,
      hardware: null,
      location: null
    };

    if (!scopes) return info;

    // Extract name
    const nameMatch = scopes.match(/name\/([^\/\s]+)/);
    if (nameMatch) info.name = decodeURIComponent(nameMatch[1]);

    // Extract manufacturer
    const mfgMatch = scopes.match(/hardware\/([^\/\s]+)/);
    if (mfgMatch) info.manufacturer = decodeURIComponent(mfgMatch[1]);

    // Extract model
    const modelMatch = scopes.match(/model\/([^\/\s]+)/);
    if (modelMatch) info.model = decodeURIComponent(modelMatch[1]);

    // Extract hardware
    const hardwareMatch = scopes.match(/hardware\/([^\/\s]+)/);
    if (hardwareMatch) info.hardware = decodeURIComponent(hardwareMatch[1]);

    // Extract location
    const locationMatch = scopes.match(/location\/([^\/\s]+)/);
    if (locationMatch) info.location = decodeURIComponent(locationMatch[1]);

    return info;
  }

  // Extract ONVIF profile from types
  extractOnvifProfile(types) {
    if (types.includes('S')) return 'S';
    if (types.includes('T')) return 'T';
    if (types.includes('G')) return 'G';
    return 'S'; // Default to S profile
  }

  // Generate device ID based on IP address
  generateDeviceId(ipAddress) {
    return `device_${ipAddress.replace(/\./g, '_')}_${Date.now()}`;
  }

  // Generate UUID for WS-Discovery
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Calculate broadcast address
  getBroadcastAddress(address, netmask) {
    const addressParts = address.split('.').map(Number);
    const netmaskParts = netmask.split('.').map(Number);
    
    const broadcastParts = addressParts.map((part, index) => {
      return part | (255 - netmaskParts[index]);
    });
    
    return broadcastParts.join('.');
  }

  // Store discovered devices in database
  async storeDiscoveredDevices(devices, db) {
    if (!db || devices.length === 0) {
      return;
    }

    console.log(`💾 Storing ${devices.length} discovered device(s) in database...`);
    
    let newDevices = 0;
    let updatedDevices = 0;

    for (const device of devices) {
      try {
        // Check if device already exists
        const existingDevice = await new Promise((resolve, reject) => {
          db.get(
            'SELECT * FROM devices WHERE ip_address = ?',
            [device.ip_address],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });

        if (existingDevice) {
          // Update existing device
          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE devices SET 
                name = ?, manufacturer = ?, model = ?, hardware = ?, 
                endpoint = ?, onvif_profile = ?, types = ?, scopes = ?, 
                last_seen = ?, status = 'discovered'
               WHERE ip_address = ?`,
              [
                device.name, device.manufacturer, device.model, device.hardware,
                device.endpoint, device.onvif_profile, device.types, device.scopes,
                device.last_seen, device.ip_address
              ],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          updatedDevices++;
          console.log(`🔄 Updated existing device: ${device.name} (${device.ip_address})`);
        } else {
          // Insert new device
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO devices (
                id, name, ip_address, port, endpoint, manufacturer, model, hardware, location,
                onvif_profile, types, scopes, status, discovered_at, last_seen, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                device.id, device.name, device.ip_address, device.port, device.endpoint,
                device.manufacturer, device.model, device.hardware, device.location,
                device.onvif_profile, device.types, device.scopes, device.status,
                device.discovered_at, device.last_seen, new Date().toISOString()
              ],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          newDevices++;
          console.log(`➕ Added discovered device to database: ${device.name} (${device.ip_address})`);
        }
      } catch (error) {
        console.error(`❌ Error storing device ${device.ip_address}:`, error);
      }
    }

    console.log(`✅ Successfully processed ${newDevices} new device(s) and updated ${updatedDevices} existing device(s)`);
  }

  // Get current discovered devices
  getDiscoveredDevices() {
    return Array.from(this.discoveredDevices.values());
  }

  // Manual discovery trigger (for API endpoints)
  async manualDiscovery() {
    console.log('🔍 Manual ONVIF discovery triggered');
    return await this.discoverDevices();
  }
}

// Create singleton instance
const onvifDiscovery = new OnvifDiscovery();

module.exports = onvifDiscovery;