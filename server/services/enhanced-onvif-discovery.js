const dgram = require('dgram');
const os = require('os');
const fetch = require('node-fetch');
const { logger } = require('../utils/logger');
const { DeviceStatusManager } = require('./device-status-manager');

class EnhancedOnvifDiscovery {
  constructor() {
    this.discoveredDevices = new Map();
    this.statusManager = new DeviceStatusManager();
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
      // Dynamic timeout based on environment
      this.onvifDiscoveryTimeout = parseInt(process.env.DISCOVERY_TIMEOUT) || 12000;
      this.networkScanTimeout = parseInt(process.env.NETWORK_SCAN_TIMEOUT) || 5000;

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
        const maxProbes = parseInt(process.env.DISCOVERY_PROBE_COUNT) || 3;

        // Store discovered IPs to probe alternative ports
        const discoveredIPs = new Set();

        socket.on('message', async (msg, rinfo) => {
          try {
            const message = msg.toString('utf8');

            // Track any responding IP
            discoveredIPs.add(rinfo.address);

            if (this.isValidOnvifResponse(message)) {
              logger.info(`🎯 Valid ONVIF response from ${rinfo.address}:${rinfo.port}`);
              const device = this.parseEnhancedOnvifResponse(message, rinfo);

              if (device && !devices.find(d => d.ip_address === device.ip_address)) {
                device.network_interface = iface.name;
                device.discovery_method = 'onvif';

                // Probe for actual service ports dynamically
                const actualPort = await this.findServicePort(device.ip_address);
                if (actualPort) {
                  device.port = actualPort;
                  device.endpoint = `http://${device.ip_address}:${actualPort}/onvif/device_service`;
                }

                devices.push(device);
                logger.info(`📹 ONVIF device discovered: ${device.name} at ${device.ip_address}:${device.port || 80}`);
              }
            }
          } catch (error) {
            logger.debug(`Processing response from ${rinfo.address}: ${error.message}`);
          }
        });

        socket.on('error', (err) => {
          logger.debug(`Socket error on ${iface.name}: ${err.message}`);
        });

        socket.bind(0, iface.address, () => {
          try {
            socket.setBroadcast(true);
            socket.setMulticastTTL(parseInt(process.env.MULTICAST_TTL) || 2);
            socket.setMulticastLoopback(true);

            // Join multicast group
            socket.addMembership('239.255.255.250', iface.address);

            const sendProbe = () => {
              if (probeCount >= maxProbes) {
                // After probes, check discovered IPs for cameras on non-standard ports
                setTimeout(async () => {
                  for (const ip of discoveredIPs) {
                    if (!devices.find(d => d.ip_address === ip)) {
                      const camera = await this.probeIPForCamera(ip, iface.name);
                      if (camera) {
                        devices.push(camera);
                      }
                    }
                  }
                }, 1000);
                return;
              }

              const probeMessage = this.createDynamicOnvifProbe(probeCount);

              socket.send(probeMessage, 3702, '239.255.255.250', (err) => {
                if (!err) {
                  probeCount++;
                  logger.debug(`Probe ${probeCount}/${maxProbes} sent on ${iface.name}`);
                  setTimeout(sendProbe, 2000);
                }
              });
            };

            sendProbe();

          } catch (error) {
            logger.debug(`Setup failed on ${iface.name}: ${error.message}`);
          }
        });

        setTimeout(() => {
          try {
            socket.close();
          } catch (error) {
            // Ignore
          }

          completedInterfaces++;
          if (completedInterfaces === interfaces.length) {
            logger.info(`✅ ONVIF discovery completed. Found ${devices.length} devices`);
            resolve(devices);
          }
        }, this.onvifDiscoveryTimeout);
      });

      setTimeout(() => {
        resolve(devices);
      }, this.onvifDiscoveryTimeout + 2000);
    });
  }

  // Add method to find actual service port
  async findServicePort(ipAddress) {
    const commonPorts = [
      80,    // HTTP
      8080,  // Alt HTTP
      81,    // Alt HTTP
      8000,  // Alt HTTP
      443,   // HTTPS
      8443,  // Alt HTTPS
      554,   // RTSP
      8554,  // Alt RTSP
      88,    // Some cameras
      7000,  // Some cameras
    ];

    for (const port of commonPorts) {
      try {
        const response = await fetch(`http://${ipAddress}:${port}/onvif/device_service`, {
          method: 'GET',
          signal: AbortSignal.timeout(500)
        });

        if (response.status === 200 || response.status === 401 || response.status === 405) {
          logger.info(`✅ Found ONVIF service on port ${port}`);
          return port;
        }
      } catch (error) {
        // Continue to next port
      }
    }

    return null;
  }

  // Add method to probe specific IP for camera
  async probeIPForCamera(ipAddress, interfaceName) {
    const rtspPorts = [554, 8554, 7070, 88];
    const httpPorts = [80, 8080, 8000, 81];

    // Check RTSP ports
    for (const port of rtspPorts) {
      if (await this.testPort(ipAddress, port)) {
        logger.info(`📹 Found camera service at ${ipAddress}:${port} (RTSP)`);
        return {
          id: `camera-${ipAddress.replace(/\./g, '-')}`,
          name: `Camera at ${ipAddress}`,
          ip_address: ipAddress,
          port: httpPorts[0], // Use default HTTP port for management
          rtsp_port: port,
          network_interface: interfaceName,
          discovery_method: 'port-probe',
          status: 'discovered',
          capabilities: { video: true, onvif: false },
          discovered_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        };
      }
    }

    return null;
  }

  // Add different probe variations
  createDynamicOnvifProbe(iteration) {
    const messageId = this.generateUuid();
    const probeTypes = [
      'tds:Device',
      'Device',
      'NetworkVideoTransmitter',
      ''  // Empty type for broader discovery
    ];

    const type = probeTypes[iteration] || probeTypes[0];

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
                    ${type ? `<Types>${type}</Types>` : ''}
                  </Probe>
                </soap:Body>
              </soap:Envelope>`;
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
              logger.info(`🔹 SSDP ONVIF device: ${device.name} at ${device.ip_address}`);
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
   * Enhanced ONVIF response parsing with dynamic capabilities
   */
  parseEnhancedOnvifResponse(message, rinfo) {
    try {
      const currentTime = new Date().toISOString();

      // Initialize with minimal default capabilities
      const capabilities = this.extractCapabilitiesFromResponse(message);

      const device = {
        id: `onvif-${rinfo.address.replace(/\./g, '-')}`,
        name: `ONVIF Device at ${rinfo.address}`,
        ip_address: rinfo.address,
        port: 80,
        manufacturer: 'Unknown',
        model: 'ONVIF Device',
        discovery_method: 'onvif',
        status: this.statusManager.getDiscoveryStatus({ last_seen: currentTime }),
        capabilities: capabilities,
        discovered_at: currentTime,
        last_seen: currentTime
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

          logger.info(`🔍 ONVIF endpoint: ${device.endpoint}`);
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

        // Update capabilities based on scopes
        const scopeCapabilities = this.extractCapabilitiesFromScopes(scopes);
        device.capabilities = { ...device.capabilities, ...scopeCapabilities };
      }

      // Extract Types for additional capability information
      const typesMatches = message.match(/<.*?Types.*?>(.*?)<\/.*?Types.*?>/i);
      if (typesMatches) {
        const types = typesMatches[1];
        const typeCapabilities = this.extractCapabilitiesFromTypes(types);
        device.capabilities = { ...device.capabilities, ...typeCapabilities };
      }

      return device;
    } catch (error) {
      logger.warn('⚠️ Error parsing enhanced ONVIF response:', error.message);
      return null;
    }
  }

  /**
   * Extract capabilities from ONVIF response message
   */
  extractCapabilitiesFromResponse(message) {
    const capabilities = {
      video: false,
      audio: false,
      ptz: false,
      onvif: false,
      analytics: false,
      events: false,
      recording: false,
      replay: false,
      metadata: false
    };

    const messageLower = message.toLowerCase();

    // Check for video capability (default for most cameras)
    if (messageLower.includes('networkvideotransmitter') ||
      messageLower.includes('media') ||
      messageLower.includes('video')) {
      capabilities.video = true;
    }

    // Check for ONVIF capability
    if (messageLower.includes('onvif') || messageLower.includes('device')) {
      capabilities.onvif = true;
    }

    // Check for audio capability
    if (messageLower.includes('audio') || messageLower.includes('backchannel')) {
      capabilities.audio = true;
    }

    // Check for PTZ capability
    if (messageLower.includes('ptz')) {
      capabilities.ptz = true;
    }

    // Check for analytics capability
    if (messageLower.includes('analytics') || messageLower.includes('videoanalytics')) {
      capabilities.analytics = true;
    }

    // Check for events capability
    if (messageLower.includes('event') || messageLower.includes('notification')) {
      capabilities.events = true;
    }

    // Check for recording capability
    if (messageLower.includes('recording') || messageLower.includes('storage')) {
      capabilities.recording = true;
    }

    // Check for replay capability
    if (messageLower.includes('replay') || messageLower.includes('playback')) {
      capabilities.replay = true;
    }

    // Check for metadata capability
    if (messageLower.includes('metadata')) {
      capabilities.metadata = true;
    }

    return capabilities;
  }

  /**
   * Extract capabilities from ONVIF scopes
   */
  extractCapabilitiesFromScopes(scopes) {
    const capabilities = {};
    const scopesLower = scopes.toLowerCase();

    // PTZ capability
    if (scopesLower.includes('ptz') || scopesLower.includes('pan') ||
      scopesLower.includes('tilt') || scopesLower.includes('zoom')) {
      capabilities.ptz = true;
    }

    // Audio capability
    if (scopesLower.includes('audio') || scopesLower.includes('backchannel') ||
      scopesLower.includes('speaker') || scopesLower.includes('microphone')) {
      capabilities.audio = true;
    }

    // Video capability
    if (scopesLower.includes('video') || scopesLower.includes('stream')) {
      capabilities.video = true;
    }

    // Analytics capability
    if (scopesLower.includes('analytics') || scopesLower.includes('motion') ||
      scopesLower.includes('detection')) {
      capabilities.analytics = true;
    }

    // Events capability
    if (scopesLower.includes('event')) {
      capabilities.events = true;
    }

    // Recording capability
    if (scopesLower.includes('record') || scopesLower.includes('storage')) {
      capabilities.recording = true;
    }

    return capabilities;
  }

  /**
   * Extract capabilities from ONVIF types
   */
  extractCapabilitiesFromTypes(types) {
    const capabilities = {};
    const typesLower = types.toLowerCase();

    // Network Video Transmitter usually means video capability
    if (typesLower.includes('networkvideotransmitter')) {
      capabilities.video = true;
      capabilities.onvif = true;
    }

    // Network Video Display
    if (typesLower.includes('networkvideodisplay')) {
      capabilities.video = true;
      capabilities.onvif = true;
    }

    // PTZ Device
    if (typesLower.includes('ptzdevice')) {
      capabilities.ptz = true;
    }

    // Analytics Device
    if (typesLower.includes('analyticsdevice')) {
      capabilities.analytics = true;
    }

    return capabilities;
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

      // Try to get capabilities if device info fails
      return await this.getDeviceCapabilities(device);
    } catch (error) {
      logger.warn(`⚠️ ONVIF validation failed for ${device.ip_address}:`, error.message);
      return null;
    }
  }

  /**
   * Get device capabilities through ONVIF GetCapabilities
   */
  async getDeviceCapabilities(device) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.deviceResponseTimeout);

      const response = await fetch(device.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': '"http://www.onvif.org/ver10/device/wsdl/GetCapabilities"'
        },
        body: this.createGetCapabilitiesRequest(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const responseText = await response.text();
        return this.parseCapabilitiesResponse(responseText, device);
      }

      return null;
    } catch (error) {
      logger.warn(`⚠️ Failed to get capabilities for ${device.ip_address}:`, error.message);
      return null;
    }
  }

  /**
   * Create GetCapabilities SOAP request
   */
  createGetCapabilitiesRequest() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <soap:Header/>
  <soap:Body>
    <tds:GetCapabilities>
      <tds:Category>All</tds:Category>
    </tds:GetCapabilities>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Parse GetCapabilities response
   */
  parseCapabilitiesResponse(responseText, device) {
    try {
      const capabilities = { ...device.capabilities };

      // Check for Media capability
      if (responseText.includes('Media') || responseText.includes('VideoSources')) {
        capabilities.video = true;
      }

      // Check for PTZ capability
      if (responseText.includes('PTZ') || responseText.includes('PanTilt')) {
        capabilities.ptz = true;
      }

      // Check for Analytics capability
      if (responseText.includes('Analytics') || responseText.includes('VideoAnalytics')) {
        capabilities.analytics = true;
      }

      // Check for Events capability
      if (responseText.includes('Events') || responseText.includes('EventService')) {
        capabilities.events = true;
      }

      // Check for Recording capability
      if (responseText.includes('Recording') || responseText.includes('RecordingConfiguration')) {
        capabilities.recording = true;
      }

      // Check for Replay capability
      if (responseText.includes('Replay') || responseText.includes('SearchService')) {
        capabilities.replay = true;
      }

      // Check for Audio capability
      if (responseText.includes('AudioSources') || responseText.includes('AudioOutputs')) {
        capabilities.audio = true;
      }

      // Check for Metadata capability
      if (responseText.includes('Metadata')) {
        capabilities.metadata = true;
      }

      device.capabilities = capabilities;
      device.status = this.statusManager.getDiscoveryStatus({
        last_seen: new Date().toISOString(),
        validated: true
      });

      return device;
    } catch (error) {
      logger.warn('⚠️ Error parsing capabilities response:', error.message);
      return device;
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
      device.status = this.statusManager.getDiscoveryStatus({
        last_seen: new Date().toISOString(),
        validated: true
      });

      // Try to get additional capabilities
      return this.getDeviceCapabilities(device) || device;
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
   * Enhanced SSDP response parsing with dynamic capabilities
   */
  parseEnhancedSsdpResponse(message, rinfo) {
    try {
      const currentTime = new Date().toISOString();

      // Extract capabilities from SSDP response
      const capabilities = this.extractCapabilitiesFromSsdp(message);

      const device = {
        id: `ssdp-onvif-${rinfo.address.replace(/\./g, '-')}`,
        name: `ONVIF Device at ${rinfo.address}`,
        ip_address: rinfo.address,
        port: 80,
        manufacturer: 'Unknown',
        model: 'ONVIF Device',
        discovery_method: 'ssdp_onvif',
        status: this.statusManager.getDiscoveryStatus({ last_seen: currentTime }),
        capabilities: capabilities,
        discovered_at: currentTime,
        last_seen: currentTime
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

        // Try to extract manufacturer from server string
        const manufacturerPatterns = [
          /(\w+)\s+ONVIF/i,
          /(\w+)\/[\d.]+/,
          /^(\w+)\s+/
        ];

        for (const pattern of manufacturerPatterns) {
          const match = server.match(pattern);
          if (match && match[1]) {
            device.manufacturer = match[1];
            device.name = `${device.manufacturer} Camera`;
            break;
          }
        }
      }

      // Extract USN for unique identification
      const usnMatch = message.match(/USN:\s*(.*)/i);
      if (usnMatch) {
        device.usn = usnMatch[1].trim();
      }

      // Extract ST (Search Target) for capability hints
      const stMatch = message.match(/ST:\s*(.*)/i);
      if (stMatch) {
        const st = stMatch[1].trim().toLowerCase();
        if (st.includes('networkvideotransmitter')) {
          device.capabilities.video = true;
          device.capabilities.onvif = true;
        }
        if (st.includes('mediamanagement')) {
          device.capabilities.video = true;
        }
      }

      return device;
    } catch (error) {
      logger.warn('⚠️ Error parsing enhanced SSDP response:', error.message);
      return null;
    }
  }

  /**
   * Extract capabilities from SSDP message
   */
  extractCapabilitiesFromSsdp(message) {
    const capabilities = {
      video: false,
      audio: false,
      ptz: false,
      onvif: false,
      analytics: false,
      events: false,
      recording: false,
      replay: false,
      metadata: false
    };

    const messageLower = message.toLowerCase();

    // Check for ONVIF capability
    if (messageLower.includes('onvif')) {
      capabilities.onvif = true;
      capabilities.video = true; // ONVIF devices typically have video
    }

    // Check for video capability
    if (messageLower.includes('networkvideotransmitter') ||
      messageLower.includes('mediamanagement') ||
      messageLower.includes('video')) {
      capabilities.video = true;
    }

    // Check for other capabilities in ST or Server headers
    if (messageLower.includes('ptz')) {
      capabilities.ptz = true;
    }

    if (messageLower.includes('audio')) {
      capabilities.audio = true;
    }

    if (messageLower.includes('analytics')) {
      capabilities.analytics = true;
    }

    if (messageLower.includes('event')) {
      capabilities.events = true;
    }

    return capabilities;
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
   * Quick camera detection for fallback scan with dynamic capabilities
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
        const currentTime = new Date().toISOString();

        // Extract capabilities from HTTP headers
        const capabilities = this.extractCapabilitiesFromHeaders(response.headers);

        const device = {
          id: `ip-${ip.replace(/\./g, '-')}-80`,
          name: `Camera at ${ip}`,
          ip_address: ip,
          port: 80,
          manufacturer: 'Unknown',
          model: 'IP Camera',
          discovery_method: 'ip_scan',
          network_interface: interfaceName,
          status: this.statusManager.getDiscoveryStatus({ last_seen: currentTime }),
          capabilities: capabilities,
          discovered_at: currentTime,
          last_seen: currentTime
        };

        // Quick manufacturer detection from headers
        const server = response.headers.get('server');
        if (server) {
          const serverLower = server.toLowerCase();

          // Check for known manufacturers
          const manufacturers = {
            'honeywell': { name: 'Honeywell', onvif: true },
            'hikvision': { name: 'Hikvision', onvif: true },
            'dahua': { name: 'Dahua', onvif: true },
            'axis': { name: 'Axis', onvif: true },
            'bosch': { name: 'Bosch', onvif: true },
            'panasonic': { name: 'Panasonic', onvif: true },
            'sony': { name: 'Sony', onvif: true },
            'pelco': { name: 'Pelco', onvif: true },
            'vivotek': { name: 'Vivotek', onvif: true },
            'hanwha': { name: 'Hanwha', onvif: true },
            'samsung': { name: 'Samsung', onvif: true }
          };

          for (const [key, info] of Object.entries(manufacturers)) {
            if (serverLower.includes(key)) {
              device.manufacturer = info.name;
              device.name = `${info.name} Camera at ${ip}`;
              if (info.onvif) {
                device.capabilities.onvif = true;
              }
              break;
            }
          }
        }

        // Check WWW-Authenticate header for authentication hints
        const authHeader = response.headers.get('www-authenticate');
        if (authHeader) {
          if (authHeader.toLowerCase().includes('digest')) {
            device.auth_type = 'digest';
          } else if (authHeader.toLowerCase().includes('basic')) {
            device.auth_type = 'basic';
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
   * Extract capabilities from HTTP headers
   */
  extractCapabilitiesFromHeaders(headers) {
    const capabilities = {
      video: true, // Default for IP cameras
      audio: false,
      ptz: false,
      onvif: false,
      analytics: false,
      events: false,
      recording: false,
      replay: false,
      metadata: false
    };

    // Check server header for ONVIF support
    const server = headers.get('server');
    if (server) {
      const serverLower = server.toLowerCase();
      if (serverLower.includes('onvif')) {
        capabilities.onvif = true;
      }

      // Some manufacturers include capability hints
      if (serverLower.includes('ptz')) {
        capabilities.ptz = true;
      }

      if (serverLower.includes('audio')) {
        capabilities.audio = true;
      }
    }

    // Check X-* headers that might indicate capabilities
    for (const [key, value] of headers.entries()) {
      const keyLower = key.toLowerCase();
      const valueLower = value.toLowerCase();

      if (keyLower.includes('onvif') || valueLower.includes('onvif')) {
        capabilities.onvif = true;
      }

      if (keyLower.includes('ptz') || valueLower.includes('ptz')) {
        capabilities.ptz = true;
      }

      if (keyLower.includes('audio') || valueLower.includes('audio')) {
        capabilities.audio = true;
      }

      if (keyLower.includes('analytics') || valueLower.includes('analytics')) {
        capabilities.analytics = true;
      }
    }

    return capabilities;
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
        // Merge capabilities and info, keeping ONVIF discovery as primary
        const existing = uniqueDevices.get(key);

        // If new device has better discovery method, use it as base
        if (device.discovery_method === 'onvif' && existing.discovery_method !== 'onvif') {
          uniqueDevices.set(key, {
            ...device,
            capabilities: {
              ...existing.capabilities,
              ...device.capabilities,
              onvif: true
            }
          });
        } else {
          // Otherwise merge capabilities into existing
          existing.capabilities = {
            ...existing.capabilities,
            ...device.capabilities
          };

          // Update manufacturer/model if better info found
          if (device.manufacturer !== 'Unknown' && existing.manufacturer === 'Unknown') {
            existing.manufacturer = device.manufacturer;
            existing.model = device.model;
            existing.name = device.name;
          }

          // Update endpoint if found
          if (device.endpoint && !existing.endpoint) {
            existing.endpoint = device.endpoint;
          }
        }
      }
    });

    return Array.from(uniqueDevices.values());
  }

  /**
   * Generate UUID for SOAP messages
   */
  generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

module.exports = { EnhancedOnvifDiscovery };