const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

class OnvifProfileDiscovery {
  constructor(device) {
    this.device = device;
    this.onvifUsername = '';
    this.onvifPassword = '';
    this.rtspUsername = '';
    this.rtspPassword = '';
    this.baseUrl = `http://${device.ip_address}`;
    this.onvifPort = device.port || 80;
    this.serviceUrl = `${this.baseUrl}:${this.onvifPort}/onvif/device_service`;
  }

  setCredentials(username, password, rtspUsername = null, rtspPassword = null) {
    // Set ONVIF credentials
    this.onvifUsername = username;
    this.onvifPassword = password;
    
    // Set RTSP credentials (use explicitly provided credentials, fall back to device stored, then ONVIF)
    this.rtspUsername = rtspUsername || this.device.rtsp_username || username;
    this.rtspPassword = rtspPassword || this.device.rtsp_password || password;
    
    // Enhanced development-mode logging
    if (process.env.NODE_ENV === 'development') {
      logger.info(`🔑 Credentials set (DEVELOPMENT MODE):`);
      logger.info(`   ONVIF: ${username} / ${password}`);
      logger.info(`   RTSP: ${this.rtspUsername} / ${this.rtspPassword}`);
      logger.info(`   Source: RTSP ${rtspUsername ? 'Explicit' : (this.device.rtsp_username ? 'Device Stored' : 'ONVIF Fallback')}`);
    } else {
      logger.info(`🔑 Credentials set - ONVIF: ${username}, RTSP: ${this.rtspUsername}`);
    }
  }

  async discoverCapabilities() {
    let onvifCapabilities = null;
    let discoveryError = null;

    try {
      logger.info(`🔍 Starting ONVIF discovery for ${this.device.name} at ${this.device.ip_address}`);

      // Try ONVIF discovery with multiple endpoint variations
      onvifCapabilities = await this.tryOnvifDiscovery();
      
      if (onvifCapabilities) {
        logger.info(`✅ ONVIF discovery successful for ${this.device.name}`);
      }

    } catch (error) {
      logger.warn(`⚠️ ONVIF discovery failed for ${this.device.name}: ${error.message}`);
      discoveryError = error.message;
    }

    // Always generate enhanced profiles (ONVIF + verified camera-specific + browser-compatible)
    const enhancedProfiles = this.generateEnhancedStreamProfiles(onvifCapabilities);

    return {
      deviceInfo: onvifCapabilities?.deviceInfo || this.getBasicDeviceInfo(),
      profiles: onvifCapabilities?.profiles || [],
      streamingCapabilities: {
        rtspStreaming: true,
        httpStreaming: true,
        snapshotUri: true
      },
      ptzCapabilities: onvifCapabilities?.ptzCapabilities || { supportsPTZ: false, presets: false, homePosition: false },
      enhancedProfiles,
      error: discoveryError
    };
  }

  async tryOnvifDiscovery() {
    // Try multiple ONVIF endpoint variations
    const endpointVariations = [
      `/onvif/device_service`,
      `/onvif/device`,
      `/device_service`,
      `/ONVIF/device_service`,
      `/Device/device_service`
    ];

    for (const endpoint of endpointVariations) {
      try {
        logger.info(`🧪 Trying ONVIF endpoint: ${this.baseUrl}:${this.onvifPort}${endpoint}`);
        this.serviceUrl = `${this.baseUrl}:${this.onvifPort}${endpoint}`;
        
        // Step 1: Get device information
        const deviceInfo = await this.getDeviceInformation();
        
        // Step 2: Get capabilities
        const capabilities = await this.getCapabilities();
        
        // Step 3: Get media service URL
        const mediaServiceUrl = this.extractMediaServiceUrl(capabilities);
        
        // Step 4: Get profiles with detailed information
        const profiles = await this.getMediaProfiles(mediaServiceUrl);
        
        // Step 5: Get stream URIs for each profile
        const profilesWithUris = await this.getStreamUris(profiles, mediaServiceUrl);

        // If we got this far, ONVIF is working
        logger.info(`✅ ONVIF discovery successful via ${endpoint}`);
        
        return {
          deviceInfo,
          profiles: profilesWithUris,
          ptzCapabilities: await this.getPTZCapabilities(capabilities)
        };

      } catch (error) {
        logger.warn(`❌ ONVIF endpoint ${endpoint} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error('All ONVIF endpoints failed');
  }

  getBasicDeviceInfo() {
    return {
      manufacturer: this.device.manufacturer || 'Unknown',
      model: this.device.model || 'Unknown',
      firmwareVersion: 'Unknown',
      serialNumber: 'Unknown',
      hardwareId: 'Unknown'
    };
  }

  async getDeviceInformation() {
    const soapBody = `
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <soap:Body>
          <tds:GetDeviceInformation/>
        </soap:Body>
      </soap:Envelope>
    `;

    const response = await this.sendSoapRequest(this.serviceUrl, soapBody);
    const info = this.parseDeviceInformation(response);
    logger.info(`📋 Device Info: ${info.manufacturer} ${info.model} (${info.firmwareVersion})`);
    return info;
  }

  async getCapabilities() {
    const soapBody = `
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <soap:Body>
          <tds:GetCapabilities>
            <tds:Category>All</tds:Category>
          </tds:GetCapabilities>
        </soap:Body>
      </soap:Envelope>
    `;

    const response = await this.sendSoapRequest(this.serviceUrl, soapBody);
    return response;
  }

  async getMediaProfiles(mediaServiceUrl) {
    const soapBody = `
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
        <soap:Body>
          <trt:GetProfiles/>
        </soap:Body>
      </soap:Envelope>
    `;

    const response = await this.sendSoapRequest(mediaServiceUrl, soapBody);
    const profiles = this.parseMediaProfiles(response);
    logger.info(`📊 Found ${profiles.length} ONVIF media profiles`);
    return profiles;
  }

  async getStreamUris(profiles, mediaServiceUrl) {
    const profilesWithUris = [];

    for (const profile of profiles) {
      try {
        // Get RTSP URI
        const rtspUri = await this.getStreamUri(profile.token, mediaServiceUrl, 'RTP-Unicast');
        
        // Get snapshot URI
        const snapshotUri = await this.getSnapshotUri(profile.token, mediaServiceUrl);

        profilesWithUris.push({
          ...profile,
          rtspUri,
          snapshotUri
        });
      } catch (error) {
        logger.warn(`⚠️ Failed to get URIs for profile ${profile.name}: ${error.message}`);
        profilesWithUris.push(profile);
      }
    }

    return profilesWithUris;
  }

  async getStreamUri(profileToken, mediaServiceUrl, protocol = 'RTP-Unicast') {
    const soapBody = `
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
        <soap:Body>
          <trt:GetStreamUri>
            <trt:StreamSetup>
              <tt:Stream>RTP-Unicast</tt:Stream>
              <tt:Transport>
                <tt:Protocol>${protocol}</tt:Protocol>
              </tt:Transport>
            </trt:StreamSetup>
            <trt:ProfileToken>${profileToken}</trt:ProfileToken>
          </trt:GetStreamUri>
        </soap:Body>
      </soap:Envelope>
    `;

    const response = await this.sendSoapRequest(mediaServiceUrl, soapBody);
    return this.parseStreamUri(response);
  }

  async getSnapshotUri(profileToken, mediaServiceUrl) {
    const soapBody = `
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
        <soap:Body>
          <trt:GetSnapshotUri>
            <trt:ProfileToken>${profileToken}</trt:ProfileToken>
          </trt:GetSnapshotUri>
        </soap:Body>
      </soap:Envelope>
    `;

    const response = await this.sendSoapRequest(mediaServiceUrl, soapBody);
    return this.parseSnapshotUri(response);
  }

  async getPTZCapabilities(capabilitiesResponse) {
    try {
      const ptzMatch = capabilitiesResponse.match(/<tds:PTZ[^>]*>[\s\S]*?<\/tds:PTZ>/);
      if (ptzMatch) {
        return {
          supportsPTZ: true,
          presets: capabilitiesResponse.includes('GetPresets'),
          homePosition: capabilitiesResponse.includes('GotoHomePosition')
        };
      }
    } catch (error) {
      logger.warn(`Failed to parse PTZ capabilities: ${error.message}`);
    }

    return {
      supportsPTZ: false,
      presets: false,
      homePosition: false
    };
  }

  extractMediaServiceUrl(capabilitiesResponse) {
    try {
      const mediaMatch = capabilitiesResponse.match(/<tds:Media[^>]*>[\s\S]*?<tds:XAddr>(.*?)<\/tds:XAddr>[\s\S]*?<\/tds:Media>/);
      if (mediaMatch && mediaMatch[1]) {
        const mediaUrl = mediaMatch[1].trim();
        logger.info(`📡 Found media service URL: ${mediaUrl}`);
        return mediaUrl;
      }
    } catch (error) {
      logger.warn(`Failed to extract media service URL: ${error.message}`);
    }

    // Try multiple media service fallbacks
    const mediaEndpoints = [
      `/onvif/media_service`,
      `/onvif/media`,
      `/media_service`,
      `/ONVIF/media_service`
    ];

    for (const endpoint of mediaEndpoints) {
      const fallbackUrl = `${this.baseUrl}:${this.onvifPort}${endpoint}`;
      logger.info(`🔄 Trying fallback media service URL: ${fallbackUrl}`);
      return fallbackUrl;
    }
  }

  parseDeviceInformation(response) {
    const info = {
      manufacturer: 'Unknown',
      model: 'Unknown',
      firmwareVersion: 'Unknown',
      serialNumber: 'Unknown',
      hardwareId: 'Unknown'
    };

    try {
      const manufacturerMatch = response.match(/<tds:Manufacturer>(.*?)<\/tds:Manufacturer>/);
      if (manufacturerMatch) info.manufacturer = manufacturerMatch[1];

      const modelMatch = response.match(/<tds:Model>(.*?)<\/tds:Model>/);
      if (modelMatch) info.model = modelMatch[1];

      const firmwareMatch = response.match(/<tds:FirmwareVersion>(.*?)<\/tds:FirmwareVersion>/);
      if (firmwareMatch) info.firmwareVersion = firmwareMatch[1];

      const serialMatch = response.match(/<tds:SerialNumber>(.*?)<\/tds:SerialNumber>/);
      if (serialMatch) info.serialNumber = serialMatch[1];

      const hardwareMatch = response.match(/<tds:HardwareId>(.*?)<\/tds:HardwareId>/);
      if (hardwareMatch) info.hardwareId = hardwareMatch[1];
    } catch (error) {
      logger.warn(`Failed to parse device information: ${error.message}`);
    }

    return info;
  }

  parseMediaProfiles(response) {
    const profiles = [];

    try {
      const profileMatches = response.match(/<trt:Profiles[^>]*>[\s\S]*?<\/trt:Profiles>/g);
      if (!profileMatches) {
        logger.warn('No profiles found in ONVIF response');
        return profiles;
      }

      profileMatches.forEach((profileXml, index) => {
        try {
          const profile = this.parseProfile(profileXml, index);
          if (profile) {
            profiles.push(profile);
          }
        } catch (error) {
          logger.warn(`Failed to parse profile ${index + 1}: ${error.message}`);
        }
      });
    } catch (error) {
      logger.error(`Failed to parse media profiles: ${error.message}`);
    }

    return profiles;
  }

  parseProfile(profileXml, index) {
    const profile = {
      name: `Profile ${index + 1}`,
      token: '',
      videoSource: '',
      videoEncoder: '',
      audioSource: '',
      audioEncoder: '',
      videoEncoding: {
        encoding: 'Unknown',
        resolution: { width: 0, height: 0 },
        rateControl: { frameRateLimit: 0, bitrateLimit: 0 }
      }
    };

    try {
      const tokenMatch = profileXml.match(/token="([^"]+)"/);
      if (tokenMatch) profile.token = tokenMatch[1];

      const nameMatch = profileXml.match(/<tt:Name>(.*?)<\/tt:Name>/);
      if (nameMatch) profile.name = nameMatch[1];

      const videoSourceMatch = profileXml.match(/<tt:VideoSourceConfiguration[^>]*>[\s\S]*?<\/tt:VideoSourceConfiguration>/);
      if (videoSourceMatch) {
        const sourceTokenMatch = videoSourceMatch[0].match(/token="([^"]+)"/);
        if (sourceTokenMatch) profile.videoSource = sourceTokenMatch[1];
      }

      const videoEncoderMatch = profileXml.match(/<tt:VideoEncoderConfiguration[^>]*>[\s\S]*?<\/tt:VideoEncoderConfiguration>/);
      if (videoEncoderMatch) {
        const encoderXml = videoEncoderMatch[0];
        
        const encodingMatch = encoderXml.match(/<tt:Encoding>(.*?)<\/tt:Encoding>/);
        if (encodingMatch) profile.videoEncoding.encoding = encodingMatch[1];

        const resolutionMatch = encoderXml.match(/<tt:Resolution>[\s\S]*?<tt:Width>(\d+)<\/tt:Width>[\s\S]*?<tt:Height>(\d+)<\/tt:Height>[\s\S]*?<\/tt:Resolution>/);
        if (resolutionMatch) {
          profile.videoEncoding.resolution = {
            width: parseInt(resolutionMatch[1]),
            height: parseInt(resolutionMatch[2])
          };
        }

        const rateControlMatch = encoderXml.match(/<tt:RateControl>[\s\S]*?<\/tt:RateControl>/);
        if (rateControlMatch) {
          const frameRateMatch = rateControlMatch[0].match(/<tt:FrameRateLimit>(\d+)<\/tt:FrameRateLimit>/);
          if (frameRateMatch) profile.videoEncoding.rateControl.frameRateLimit = parseInt(frameRateMatch[1]);

          const bitrateMatch = rateControlMatch[0].match(/<tt:BitrateLimit>(\d+)<\/tt:BitrateLimit>/);
          if (bitrateMatch) profile.videoEncoding.rateControl.bitrateLimit = parseInt(bitrateMatch[1]);
        }

        const encoderTokenMatch = encoderXml.match(/token="([^"]+)"/);
        if (encoderTokenMatch) profile.videoEncoder = encoderTokenMatch[1];
      }

      const audioEncoderMatch = profileXml.match(/<tt:AudioEncoderConfiguration[^>]*>[\s\S]*?<\/tt:AudioEncoderConfiguration>/);
      if (audioEncoderMatch) {
        const audioTokenMatch = audioEncoderMatch[0].match(/token="([^"]+)"/);
        if (audioTokenMatch) profile.audioEncoder = audioTokenMatch[1];
      }

      logger.info(`📹 Parsed ONVIF profile: ${profile.name} (${profile.videoEncoding.resolution.width}x${profile.videoEncoding.resolution.height}, ${profile.videoEncoding.rateControl.frameRateLimit}fps, ${profile.videoEncoding.encoding})`);

    } catch (error) {
      logger.warn(`Failed to parse profile details: ${error.message}`);
    }

    return profile;
  }

  parseStreamUri(response) {
    try {
      const uriMatch = response.match(/<trt:Uri>(.*?)<\/trt:Uri>/);
      if (uriMatch) {
        return uriMatch[1];
      }
    } catch (error) {
      logger.warn(`Failed to parse stream URI: ${error.message}`);
    }
    return null;
  }

  parseSnapshotUri(response) {
    try {
      const uriMatch = response.match(/<trt:Uri>(.*?)<\/trt:Uri>/);
      if (uriMatch) {
        return uriMatch[1];
      }
    } catch (error) {
      logger.warn(`Failed to parse snapshot URI: ${error.message}`);
    }
    return null;
  }

  async sendSoapRequest(url, soapBody) {
    const headers = {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'SOAPAction': ''
    };

    if (this.onvifUsername && this.onvifPassword) {
      const auth = Buffer.from(`${this.onvifUsername}:${this.onvifPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: soapBody,
        timeout: 10000 // Reduced timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      
      // Check for SOAP faults
      if (responseText.includes('soap:Fault') || responseText.includes('SOAP-ENV:Fault')) {
        const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
        const faultCode = faultMatch ? faultMatch[1] : 'Unknown SOAP fault';
        throw new Error(`SOAP Fault: ${faultCode}`);
      }

      return responseText;

    } catch (error) {
      if (error.message.includes('timeout') || error.code === 'ECONNRESET') {
        throw new Error('Connection timeout - check device network connectivity');
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        throw new Error('Authentication failed - check username and password');
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        throw new Error('Access forbidden - check user permissions');
      } else if (error.message.includes('404') || error.message.includes('Not Found')) {
        throw new Error('ONVIF service not found - device may not support ONVIF');
      } else {
        throw error;
      }
    }
  }

  // ENHANCED STREAM PROFILE GENERATION - FIXED CREDENTIAL USAGE
  generateEnhancedStreamProfiles(onvifCapabilities) {
    const profiles = [];
    const { ip_address } = this.device;
    
    // CRITICAL FIX: Use ONVIF credentials for HTTP/MJPEG, RTSP credentials for RTSP streams
    const onvifEncodedCreds = this.onvifUsername && this.onvifPassword 
      ? `${encodeURIComponent(this.onvifUsername)}:${encodeURIComponent(this.onvifPassword)}@`
      : '';
    
    const rtspEncodedCreds = this.rtspUsername && this.rtspPassword 
      ? `${encodeURIComponent(this.rtspUsername)}:${encodeURIComponent(this.rtspPassword)}@`
      : '';

    let priority = 100;

    logger.info(`🎯 Generating enhanced profiles for ${ip_address}`);
    logger.info(`🔑 ONVIF credentials: ${this.onvifUsername ? 'Yes' : 'No'} | RTSP credentials: ${this.rtspUsername ? 'Yes' : 'No'}`);

    // 1. PRIORITY: Add ONVIF-discovered profiles first (if available)
    if (onvifCapabilities && onvifCapabilities.profiles) {
      onvifCapabilities.profiles.forEach((profile, index) => {
        if (profile.rtspUri) {
          profiles.push({
            name: `${profile.name} (ONVIF RTSP)`,
            url: profile.rtspUri,
            type: 'rtsp',
            description: `ONVIF Profile: ${profile.videoEncoding.resolution.width}x${profile.videoEncoding.resolution.height} at ${profile.videoEncoding.rateControl.frameRateLimit}fps, ${profile.videoEncoding.encoding}`,
            browserCompatible: false,
            priority: priority--,
            category: 'ONVIF RTSP',
            onvifProfile: profile
          });
        }

        if (profile.snapshotUri) {
          profiles.push({
            name: `${profile.name} (ONVIF Snapshot)`,
            url: profile.snapshotUri,
            type: 'http',
            description: `ONVIF Snapshot: ${profile.videoEncoding.resolution.width}x${profile.videoEncoding.resolution.height}`,
            browserCompatible: true,
            priority: priority--,
            category: 'ONVIF Snapshot',
            onvifProfile: profile
          });
        }
      });
    }

    // 2. BROWSER-COMPATIBLE STREAMS (using ONVIF credentials for HTTP access)
    profiles.push(
      {
        name: 'Profile 1 Snapshot (HTTP) 🌐',
        url: `http://${onvifEncodedCreds}${ip_address}/cgi-bin/snapshot.cgi?channel=1&profile=1`,
        type: 'http',
        description: 'HTTP snapshot for Profile 1 - Browser compatible',
        browserCompatible: true,
        priority: priority--,
        category: 'Browser HTTP'
      },
      {
        name: 'MJPEG Profile 1 Stream 🌐',
        url: `http://${onvifEncodedCreds}${ip_address}/video.mjpg?channel=1&profile=1`,
        type: 'mjpeg',
        description: 'MJPEG live stream for Profile 1 - Browser compatible',
        browserCompatible: true,
        priority: priority--,
        category: 'Browser MJPEG'
      },
      {
        name: 'Profile 2 Snapshot (HTTP) 🌐',
        url: `http://${onvifEncodedCreds}${ip_address}/cgi-bin/snapshot.cgi?channel=1&profile=2`,
        type: 'http',
        description: 'HTTP snapshot for Profile 2 - Browser compatible',
        browserCompatible: true,
        priority: priority--,
        category: 'Browser HTTP'
      }
    );

    // 3. VERIFIED WORKING RTSP PROFILE URLs (using RTSP credentials)
    profiles.push(
      {
        name: 'Camera Profile 1 (RTSP) ✅',
        url: `rtsp://${rtspEncodedCreds}${ip_address}:554/profile1`,
        type: 'rtsp',
        description: 'Camera Profile 1 - Main stream (verified working in VLC)',
        browserCompatible: false,
        priority: priority--,
        category: 'Verified RTSP',
        verified: true
      },
      {
        name: 'Camera Profile 2 (RTSP)',
        url: `rtsp://${rtspEncodedCreds}${ip_address}:554/profile2`,
        type: 'rtsp',
        description: 'Camera Profile 2 - Secondary stream',
        browserCompatible: false,
        priority: priority--,
        category: 'Camera RTSP'
      }
    );

    // 4. Manufacturer-specific profiles (reduced to essential ones only)
    const isHoneywell = this.device.manufacturer?.toLowerCase().includes('honeywell') || 
                       this.device.manufacturer?.toLowerCase().includes('hikvision');

    if (isHoneywell) {
      profiles.push(
        {
          name: 'Honeywell ISAPI Snapshot 🌐',
          url: `http://${onvifEncodedCreds}${ip_address}/ISAPI/Streaming/channels/1/picture`,
          type: 'http',
          description: 'Honeywell ISAPI snapshot endpoint - Browser compatible',
          browserCompatible: true,
          priority: priority--,
          category: 'Honeywell HTTP'
        },
        {
          name: 'Honeywell ISAPI Channel 1 (RTSP)',
          url: `rtsp://${rtspEncodedCreds}${ip_address}:554/Streaming/Channels/1`,
          type: 'rtsp',
          description: 'Honeywell ISAPI Channel 1 main stream',
          browserCompatible: false,
          priority: priority--,
          category: 'Honeywell RTSP'
        }
      );
    }

    // 5. Essential generic fallback profiles only
    profiles.push(
      {
        name: 'Generic Snapshot 🌐',
        url: `http://${onvifEncodedCreds}${ip_address}/jpg/image.jpg`,
        type: 'http',
        description: 'Generic snapshot URL - Browser compatible',
        browserCompatible: true,
        priority: priority--,
        category: 'Generic HTTP'
      }
    );

    const sortedProfiles = profiles.sort((a, b) => b.priority - a.priority);
    
    const browserCompatibleCount = sortedProfiles.filter(p => p.browserCompatible).length;
    const rtspCount = sortedProfiles.filter(p => p.type === 'rtsp').length;
    
    logger.info(`🎬 Generated ${sortedProfiles.length} total profiles: ${browserCompatibleCount} browser-compatible, ${rtspCount} RTSP`);
    logger.info(`✅ HTTP/MJPEG URLs use ONVIF credentials: ${this.onvifUsername}`);
    logger.info(`✅ RTSP URLs use RTSP credentials: ${this.rtspUsername}`);

    return sortedProfiles;
  }

  // Legacy method for backward compatibility
  generateStreamProfiles(onvifCapabilities) {
    return this.generateEnhancedStreamProfiles(onvifCapabilities);
  }
}

module.exports = { OnvifProfileDiscovery };