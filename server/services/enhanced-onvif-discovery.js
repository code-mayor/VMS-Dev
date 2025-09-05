const dgram = require('dgram');
const os = require('os');
const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

class EnhancedOnvifDiscovery {
  constructor() {
    this.discoveredDevices = new Map();
    // More aggressive ONVIF discovery timeouts
    this.onvifDiscoveryTimeout = 12000; // 12 seconds for proper ONVIF discovery
    this.networkScanTimeout = 5000; // 5 seconds for IP scan fallback
    this.deviceResponseTimeout = 2000; // Device response timeout
  }

  /**
   * Main discovery method with enhanced ONVIF detection
   */
  async discoverDevices() {
    logger.info('🔍 Starting enhanced ONVIF device discovery...');
    
    const results = {
      onvifDevices: [],
      ipCameras: [],
      networkDevices: [],
      totalFound: 0,
      methods: []
    };

    try {
      // Priority 1: Enhanced ONVIF WS-Discovery (most important)
      logger.info('📡 Priority 1: Enhanced ONVIF WS-Discovery');
      results.onvifDevices = await this.enhancedOnvifDiscovery();

      // Priority 2: SSDP ONVIF Discovery
      logger.info('📡 Priority 2: SSDP ONVIF Discovery');  
      results.networkDevices = await this.enhancedSsdpDiscovery();

      // Priority 3: Only use IP scanning if no ONVIF devices found
      if (results.onvifDevices.length === 0 && results.networkDevices.length === 0) {
        logger.info('📡 Priority 3: Network IP scanning (fallback only)');
        results.ipCameras = await this.scanNetworkForCameras();
      } else {
        logger.info('✅ ONVIF devices found, skipping IP scan fallback');
      }

      results.methods = [
        { method: 'ONVIF WS-Discovery', found: results.onvifDevices.length },
        { method: 'SSDP/UPnP', found: results.networkDevices.length },
        { method: 'Network IP Scan', found: results.ipCameras.length }
      ];

      // Combine and deduplicate (ONVIF has highest priority)
      const allDevices = this.combineAndDeduplicateDevices([
        ...results.onvifDevices,
        ...results.networkDevices,
        ...results.ipCameras
      ]);

      results.totalFound = allDevices.length;

      logger.info(`✅ Enhanced discovery completed. Found ${results.totalFound} devices:`);
      results.methods.forEach(method => {
        logger.info(`   • ${method.method}: ${method.found} devices`);
      });

      return allDevices;

    } catch (error) {
      logger.error('❌ Enhanced discovery failed:', error);
      return [];
    }
  }

  /**
   * Enhanced ONVIF WS-Discovery with proper multicast handling
   */
  async enhancedOnvifDiscovery() {
    return new Promise((resolve) => {
      const devices = [];
      const interfaces = this.getNetworkInterfaces();
      let completedInterfaces = 0;

      if (interfaces.length === 0) {
        logger.warn('⚠️ No suitable network interfaces for ONVIF discovery');
        return resolve([]);
      }

      logger.info(`📡 Enhanced ONVIF discovery on ${interfaces.length} interface(s)...`);
      
      interfaces.forEach(iface => {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        let probeCount = 0;
        const maxProbes = 3; // More thorough probing
        
        socket.on('message', (msg, rinfo) => {
          try {
            const message = msg.toString('utf8');
            
            if (this.isValidOnvifResponse(message)) {
              logger.info(`🎯 Valid ONVIF response from ${rinfo.address}`);
              const device = this.parseEnhancedOnvifResponse(message, rinfo);
              if (device && !devices.find(d => d.ip_address === device.ip_address)) {
                device.network_interface = iface.name;
                device.discovery_method = 'onvif';
                devices.push(device);
                logger.info(`📹 ONVIF device discovered: ${device.name} at ${device.ip_address}`);
                
                // Immediately try to validate ONVIF capabilities
                this.validateOnvifDevice(device).then(validatedDevice => {
                  if (validatedDevice) {
                    Object.assign(device, validatedDevice);
                    logger.info(`✅ ONVIF device validated: ${device.name}`);
                  }
                });
              }
            }
          } catch (error) {
            logger.warn(`⚠️ Error processing ONVIF response from ${rinfo.address}:`, error.message);
          }
        });

        socket.on('error', (err) => {
          logger.warn(`⚠️ ONVIF socket error on ${iface.name}:`, err.message);
        });

        socket.bind(0, iface.address, () => {
          try {
            socket.setBroadcast(true);
            socket.setMulticastTTL(2); // Increase TTL for better reach
            socket.setMulticastLoopback(true);
            
            // Join ONVIF multicast group
            socket.addMembership('239.255.255.250', iface.address);
            
            logger.info(`✅ ONVIF socket bound to ${iface.name} (${iface.address})`);

            // Enhanced probe sequence with different message variations
            const sendEnhancedProbe = () => {
              if (probeCount >= maxProbes) return;
              
              // Try different ONVIF probe messages for better compatibility
              const probeMessages = [
                this.createStandardOnvifProbe(),
                this.createEnhancedOnvifProbe(),
                this.createCompatibilityOnvifProbe()
              ];
              
              const probeMessage = probeMessages[probeCount] || probeMessages[0];
              
              socket.send(probeMessage, 3702, '239.255.255.250', (err) => {
                if (!err) {
                  probeCount++;
                  logger.info(`📡 Enhanced ONVIF probe ${probeCount}/${maxProbes} sent on ${iface.name}`);
                  
                  // Stagger probes for better response handling
                  if (probeCount < maxProbes) {
                    setTimeout(sendEnhancedProbe, 2000); // 2 second intervals
                  }
                } else {
                  logger.warn(`⚠️ Failed to send ONVIF probe on ${iface.name}:`, err.message);
                }
              });
            };

            // Start probing immediately
            sendEnhancedProbe();
            
          } catch (error) {
            logger.warn(`⚠️ ONVIF setup failed on ${iface.name}:`, error.message);
          }
        });

        // Enhanced cleanup with proper timeout
        setTimeout(() => {
          try {
            socket.close();
          } catch (error) {
            // Ignore cleanup errors
          }
          
          completedInterfaces++;
          if (completedInterfaces === interfaces.length) {
            logger.info(`✅ Enhanced ONVIF discovery completed. Found ${devices.length} ONVIF devices`);
            resolve(devices);
          }
        }, this.onvifDiscoveryTimeout);
      });

      // Safety timeout
      setTimeout(() => {
        logger.info(`⚡ Enhanced ONVIF discovery timeout, returning ${devices.length} devices`);
        resolve(devices);
      }, this.onvifDiscoveryTimeout + 2000);
    });
  }

  /**
   * Enhanced SSDP discovery specifically for ONVIF devices
   */
  async enhancedSsdpDiscovery() {
    return new Promise((resolve) => {
      const devices = [];
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      socket.on('message', (msg, rinfo) => {
        try {
          const message = msg.toString('utf8');
          if (this.isOnvifSsdpResponse(message)) {
            logger.info(`🎯 ONVIF SSDP response from ${rinfo.address}`);
            const device = this.parseEnhancedSsdpResponse(message, rinfo);
            if (device && !devices.find(d => d.ip_address === device.ip_address)) {
              device.discovery_method = 'ssdp_onvif';
              devices.push(device);
              logger.info(`📹 SSDP ONVIF device: ${device.name} at ${device.ip_address}`);
            }
          }
        } catch (error) {
          logger.warn(`⚠️ Error processing SSDP response from ${rinfo.address}:`, error.message);
        }
      });

      socket.on('error', (err) => {
        logger.warn('⚠️ SSDP socket error:', err.message);
      });

      socket.bind(0, () => {
        socket.setBroadcast(true);
        socket.setMulticastTTL(2);
        socket.setMulticastLoopback(true);
        
        try {
          socket.addMembership('239.255.255.250');
          
          // Enhanced ONVIF-specific SSDP searches
          const onvifSsdpSearches = [
            'urn:schemas-onvif-org:device:NetworkVideoTransmitter:1',
            'urn:schemas-onvif-org:service:DeviceManagement:1',
            'urn:schemas-onvif-org:service:MediaManagement:1',
            'urn:schemas-onvif-org:device:NetworkVideoDisplay:1',
            'upnp:rootdevice'
          ];

          onvifSsdpSearches.forEach((searchTarget, index) => {
            setTimeout(() => {
              const ssdpMessage = this.createEnhancedSsdpMessage(searchTarget);
              socket.send(ssdpMessage, 1900, '239.255.255.250', (err) => {
                if (!err) {
                  logger.info(`📡 Enhanced SSDP search: ${searchTarget}`);
                } else {
                  logger.warn(`⚠️ Failed to send SSDP search for ${searchTarget}:`, err.message);
                }
              });
            }, index * 1000); // 1 second intervals
          });
          
        } catch (error) {
          logger.warn('⚠️ SSDP multicast setup failed:', error.message);
        }
      });

      setTimeout(() => {
        try {
          socket.close();
        } catch (error) {
          // Ignore cleanup errors
        }
        logger.info(`✅ Enhanced SSDP discovery completed. Found ${devices.length} devices`);
        resolve(devices);
      }, this.onvifDiscoveryTimeout);
    });
  }

  /**
   * Network scanning fallback (only when no ONVIF devices found)
   */
  async scanNetworkForCameras() {
    logger.info('🔍 Starting network IP scan (fallback only)...');
    
    const devices = [];
    const interfaces = this.getNetworkInterfaces();
    
    // Only scan primary interface
    const primaryInterface = interfaces[0];
    if (!primaryInterface) {
      logger.warn('⚠️ No network interface for scan');
      return devices;
    }

    try {
      const subnet = this.getSubnet(primaryInterface.address, primaryInterface.netmask);
      logger.info(`🌐 Fallback scanning subnet: ${subnet}`);
      
      // Quick scan of high-probability IPs
      const targetIPs = this.getHighProbabilityCameraIPs(subnet);
      
      const promises = targetIPs.map(ip => 
        this.quickCheckIpForCamera(ip, primaryInterface.name)
      );
      
      const results = await Promise.allSettled(promises);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          devices.push(result.value);
        }
      }
      
    } catch (error) {
      logger.warn(`⚠️ Network scan failed:`, error.message);
    }

    logger.info(`✅ Network scan completed. Found ${devices.length} potential cameras`);
    return devices;
  }

  /**
   * Create standard ONVIF WS-Discovery probe
   */
  createStandardOnvifProbe() {
    const messageId = this.generateUuid();
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <soap:Header>
    <wsa:Action mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>uuid:${messageId}</wsa:MessageID>
    <wsa:ReplyTo mustUnderstand="1">
      <wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address>
    </wsa:ReplyTo>
    <wsa:To mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </soap:Header>
  <soap:Body>
    <Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
      <Types>tds:Device</Types>
      <Scopes>onvif://www.onvif.org/type/NetworkVideoTransmitter</Scopes>
    </Probe>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Create enhanced ONVIF probe with broader scope
   */
  createEnhancedOnvifProbe() {
    const messageId = this.generateUuid();
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <soap:Header>
    <wsa:Action mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>uuid:${messageId}</wsa:MessageID>
    <wsa:ReplyTo mustUnderstand="1">
      <wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address>
    </wsa:ReplyTo>
    <wsa:To mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </soap:Header>
  <soap:Body>
    <Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
      <Types>tds:Device</Types>
    </Probe>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Create compatibility ONVIF probe for older devices
   */
  createCompatibilityOnvifProbe() {
    const messageId = this.generateUuid();
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">
  <soap:Header>
    <wsa:Action mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>uuid:${messageId}</wsa:MessageID>
    <wsa:ReplyTo mustUnderstand="1">
      <wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address>
    </wsa:ReplyTo>
    <wsa:To mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </soap:Header>
  <soap:Body>
    <Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
      <Types>Device</Types>
    </Probe>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Create enhanced SSDP message
   */
  createEnhancedSsdpMessage(searchTarget) {
    return [
      'M-SEARCH * HTTP/1.1',
      'HOST: 239.255.255.250:1900',
      'MAN: "ssdp:discover"',
      `ST: ${searchTarget}`,
      'MX: 3',
      'USER-AGENT: ONVIF-VMS/1.0',
      '', ''
    ].join('\r\n');
  }

  /**
   * Enhanced validation of ONVIF responses
   */
  isValidOnvifResponse(message) {
    // Check for ProbeMatches response
    if (!message.includes('ProbeMatches')) {
      return false;
    }

    // Must contain ONVIF-related content
    const onvifIndicators = [
      'onvif',
      'Device',
      'NetworkVideoTransmitter',
      'tds:Device',
      'XAddrs',
      'EndpointReference'
    ];

    return onvifIndicators.some(indicator => 
      message.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Enhanced ONVIF response parsing
   */
  parseEnhancedOnvifResponse(message, rinfo) {
    try {
      const device = {
        id: `onvif-${rinfo.address.replace(/\./g, '-')}`,
        name: `ONVIF Device at ${rinfo.address}`,
        ip_address: rinfo.address,
        port: 80,
        manufacturer: 'Unknown',
        model: 'ONVIF Device',
        discovery_method: 'onvif',
        status: 'discovered',
        capabilities: { video: true, audio: false, ptz: false, onvif: true },
        discovered_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };

      // Enhanced endpoint extraction
      const endpointMatches = message.match(/<.*?XAddrs.*?>(.*?)<\/.*?XAddrs.*?>/i);
      if (endpointMatches) {
        const endpoints = endpointMatches[1].trim();
        const urlMatches = endpoints.match(/http:\/\/([^:\/\s]+):?(\d+)?([^\s]*)/);
        if (urlMatches) {
          device.ip_address = urlMatches[1];
          device.port = urlMatches[2] ? parseInt(urlMatches[2]) : 80;
          device.endpoint = `http://${device.ip_address}:${device.port}${urlMatches[3] || '/onvif/device_service'}`;
          
          logger.info(`📍 ONVIF endpoint: ${device.endpoint}`);
        }
      }

      // Enhanced scope parsing
      const scopeMatches = message.match(/<.*?Scopes.*?>(.*?)<\/.*?Scopes.*?>/i);
      if (scopeMatches) {
        const scopes = scopeMatches[1];
        device.scopes = scopes;
        
        // Extract manufacturer
        const hwMatches = scopes.match(/hardware\/([^\/\s]+)/i);
        if (hwMatches) {
          device.manufacturer = decodeURIComponent(hwMatches[1]).replace(/[^a-zA-Z0-9\s]/g, '');
          if (device.manufacturer) {
            device.name = `${device.manufacturer} Camera`;
          }
        }
        
        // Extract device name
        const nameMatches = scopes.match(/name\/([^\/\s]+)/i);
        if (nameMatches) {
          const deviceName = decodeURIComponent(nameMatches[1]).replace(/[^a-zA-Z0-9\s\-_]/g, '');
          if (deviceName) {
            device.name = `${device.manufacturer} ${deviceName}`.trim();
          }
        }

        // Check for PTZ capability
        if (scopes.toLowerCase().includes('ptz')) {
          device.capabilities.ptz = true;
        }

        // Check for audio capability
        if (scopes.toLowerCase().includes('audio')) {
          device.capabilities.audio = true;
        }
      }

      return device;
    } catch (error) {
      logger.warn('⚠️ Error parsing enhanced ONVIF response:', error.message);
      return null;
    }
  }

  /**
   * Validate ONVIF device by attempting to connect to device service
   */
  async validateOnvifDevice(device) {
    try {
      if (!device.endpoint && device.ip_address) {
        device.endpoint = `http://${device.ip_address}:${device.port}/onvif/device_service`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.deviceResponseTimeout);

      const response = await fetch(device.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': '"http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation"'
        },
        body: this.createGetDeviceInfoRequest(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const responseText = await response.text();
        return this.parseDeviceInfoResponse(responseText, device);
      }

      return null;
    } catch (error) {
      logger.warn(`⚠️ ONVIF validation failed for ${device.ip_address}:`, error.message);
      return null;
    }
  }

  /**
   * Create GetDeviceInformation SOAP request
   */
  createGetDeviceInfoRequest() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <soap:Header/>
  <soap:Body>
    <tds:GetDeviceInformation/>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Parse GetDeviceInformation response
   */
  parseDeviceInfoResponse(responseText, device) {
    try {
      const manufacturerMatch = responseText.match(/<tds:Manufacturer>(.*?)<\/tds:Manufacturer>/);
      const modelMatch = responseText.match(/<tds:Model>(.*?)<\/tds:Model>/);
      const firmwareMatch = responseText.match(/<tds:FirmwareVersion>(.*?)<\/tds:FirmwareVersion>/);
      const serialMatch = responseText.match(/<tds:SerialNumber>(.*?)<\/tds:SerialNumber>/);

      if (manufacturerMatch) device.manufacturer = manufacturerMatch[1];
      if (modelMatch) device.model = modelMatch[1];
      if (firmwareMatch) device.firmware_version = firmwareMatch[1];
      if (serialMatch) device.serial_number = serialMatch[1];

      if (device.manufacturer && device.model) {
        device.name = `${device.manufacturer} ${device.model}`;
      }

      device.capabilities.onvif = true;
      device.status = 'validated';

      return device;
    } catch (error) {
      logger.warn('⚠️ Error parsing device info response:', error.message);
      return device;
    }
  }

  /**
   * Check if SSDP response is ONVIF-related
   */
  isOnvifSsdpResponse(message) {
    if (!message.includes('HTTP/1.1 200 OK') || !message.includes('LOCATION:')) {
      return false;
    }

    const onvifKeywords = [
      'onvif',
      'NetworkVideoTransmitter', 
      'MediaManagement',
      'DeviceManagement'
    ];

    return onvifKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Enhanced SSDP response parsing
   */
  parseEnhancedSsdpResponse(message, rinfo) {
    try {
      const device = {
        id: `ssdp-onvif-${rinfo.address.replace(/\./g, '-')}`,
        name: `ONVIF Device at ${rinfo.address}`,
        ip_address: rinfo.address,
        port: 80,
        manufacturer: 'Unknown',
        model: 'ONVIF Device',
        discovery_method: 'ssdp_onvif',
        status: 'discovered',
        capabilities: { video: true, audio: false, ptz: false, onvif: true },
        discovered_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };

      const locationMatch = message.match(/LOCATION:\s*(.*)/i);
      if (locationMatch) {
        const location = locationMatch[1].trim();
        const urlMatch = location.match(/http:\/\/([^:\/]+):?(\d+)?/);
        if (urlMatch) {
          device.ip_address = urlMatch[1];
          device.port = urlMatch[2] ? parseInt(urlMatch[2]) : 80;
          device.endpoint = location;
        }
      }

      // Extract additional SSDP headers for better device identification
      const serverMatch = message.match(/SERVER:\s*(.*)/i);
      if (serverMatch) {
        const server = serverMatch[1].trim();
        if (server.toLowerCase().includes('onvif')) {
          device.capabilities.onvif = true;
        }
      }

      return device;
    } catch (error) {
      logger.warn('⚠️ Error parsing enhanced SSDP response:', error.message);
      return null;
    }
  }

  /**
   * High-probability camera IP addresses (only used as fallback)
   */
  getHighProbabilityCameraIPs(subnet) {
    const [baseIp] = subnet.split('/');
    const [a, b, c] = baseIp.split('.').map(Number);
    
    return [
      `${a}.${b}.${c}.201`, `${a}.${b}.${c}.200`, `${a}.${b}.${c}.202`,
      `${a}.${b}.${c}.100`, `${a}.${b}.${c}.101`, `${a}.${b}.${c}.102`,
      `${a}.${b}.${c}.10`, `${a}.${b}.${c}.11`, `${a}.${b}.${c}.12`
    ];
  }

  /**
   * Quick camera detection for fallback scan
   */
  async quickCheckIpForCamera(ip, interfaceName) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      
      const response = await fetch(`http://${ip}:80`, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok || response.status === 401 || response.status === 403) {
        const device = {
          id: `ip-${ip.replace(/\./g, '-')}-80`,
          name: `Camera at ${ip}`,
          ip_address: ip,
          port: 80,
          manufacturer: 'Unknown',
          model: 'IP Camera',
          discovery_method: 'ip_scan',
          network_interface: interfaceName,
          status: 'discovered',
          capabilities: { video: true, audio: false, ptz: false },
          discovered_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        };

        // Quick manufacturer detection
        const server = response.headers.get('server');
        if (server) {
          const serverLower = server.toLowerCase();
          if (serverLower.includes('honeywell')) {
            device.manufacturer = 'Honeywell';
            device.name = `Honeywell Camera at ${ip}`;
            device.capabilities.onvif = true; // Honeywell usually supports ONVIF
          }
        }

        return device;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get network interfaces with enhanced filtering
   */
  getNetworkInterfaces() {
    const interfaces = [];
    const networkInterfaces = os.networkInterfaces();

    for (const [name, addrs] of Object.entries(networkInterfaces)) {
      if (!addrs) continue;
      
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && addr.address !== '127.0.0.1') {
          // Enhanced filtering for real interfaces
          if (!name.toLowerCase().includes('docker') && 
              !name.toLowerCase().includes('veth') &&
              !name.toLowerCase().includes('br-') &&
              !name.toLowerCase().includes('virbr') &&
              !name.toLowerCase().includes('vmnet') &&
              !addr.address.startsWith('169.254.') &&
              !addr.address.startsWith('172.17.')) {
            interfaces.push({
              name,
              address: addr.address,
              netmask: addr.netmask,
              family: addr.family
            });
          }
        }
      }
    }

    // Prioritize wired connections
    interfaces.sort((a, b) => {
      const aWired = a.name.includes('eth') || a.name.includes('eno') || a.name.includes('en0');
      const bWired = b.name.includes('eth') || b.name.includes('eno') || b.name.includes('en0');
      if (aWired && !bWired) return -1;
      if (bWired && !aWired) return 1;
      return 0;
    });

    logger.info(`📡 Enhanced interfaces: ${interfaces.map(i => `${i.name}(${i.address})`).join(', ')}`);
    return interfaces;
  }

  /**
   * Get subnet from IP and netmask
   */
  getSubnet(ip, netmask) {
    const ipParts = ip.split('.').map(Number);
    const maskParts = netmask.split('.').map(Number);
    
    const networkParts = ipParts.map((part, i) => part & maskParts[i]);
    const cidr = maskParts.reduce((count, part) => {
      return count + part.toString(2).split('1').length - 1;
    }, 0);

    return `${networkParts.join('.')}/${cidr}`;
  }

  /**
   * Combine and deduplicate devices with ONVIF priority
   */
  combineAndDeduplicateDevices(devices) {
    const uniqueDevices = new Map();
    
    // Sort by discovery method priority
    const sortedDevices = devices.sort((a, b) => {
      const priorityOrder = ['onvif', 'ssdp_onvif', 'ssdp', 'ip_scan'];
      return priorityOrder.indexOf(a.discovery_method) - priorityOrder.indexOf(b.discovery_method);
    });
    
    sortedDevices.forEach(device => {
      const key = device.ip_address;
      
      if (!uniqueDevices.has(key)) {
        uniqueDevices.set(key, device);
      } else {
        // Merge capabilities, keeping ONVIF discovery as primary
        const existing = uniqueDevices.get(key);
        if (device.discovery_method === 'onvif' && existing.discovery_method !== 'onvif') {
          uniqueDevices.set(key, {
            ...existing,
            ...device,
            capabilities: {
              ...existing.capabilities,
              ...device.capabilities,
              onvif: true
            }
          });
        }
      }
    });

    return Array.from(uniqueDevices.values());
  }

  /**
   * Generate UUID for SOAP messages
   */
  generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

module.exports = { EnhancedOnvifDiscovery };