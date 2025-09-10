const express = require('express');
const router = express.Router();
const { EnhancedOnvifDiscovery } = require('../services/enhanced-onvif-discovery');
const { OnvifProfileDiscovery } = require('../services/onvif-profile-discovery');
const { HLSStreamingService } = require('../services/hls-streaming-service');
const { logger } = require('../utils/logger');

// Enhanced discovery instance with debouncing
const enhancedDiscovery = new EnhancedOnvifDiscovery();

// FIXED: Discovery debouncing to prevent concurrent processes
let isDiscoveryRunning = false;
let discoveryDebounceTimer = null;

const debouncedDiscovery = async () => {
  // Clear any existing debounce timer
  if (discoveryDebounceTimer) {
    clearTimeout(discoveryDebounceTimer);
  }

  // If discovery is already running, skip
  if (isDiscoveryRunning) {
    logger.info('🔄 Discovery already running, skipping duplicate request');
    return { success: false, message: 'Discovery already in progress' };
  }

  return new Promise((resolve) => {
    discoveryDebounceTimer = setTimeout(async () => {
      isDiscoveryRunning = true;
      try {
        logger.info('🔍 Starting debounced device discovery...');
        const devices = await enhancedDiscovery.discoverDevices();
        resolve({ success: true, devices });
      } catch (error) {
        logger.error('❌ Discovery error:', error);
        resolve({ success: false, error: error.message, devices: [] });
      } finally {
        isDiscoveryRunning = false;
        discoveryDebounceTimer = null;
      }
    }, 2000); // 2 second debounce
  });
};

// HLS streaming service instance
const hlsService = new HLSStreamingService();

// Helper function to get database adapter from request
const getDbAdapter = (req) => {
  return req.app.get('dbAdapter');
};

// Helper function to parse JSON fields safely
const parseJsonField = (field) => {
  if (!field) return null;
  if (typeof field === 'object') return field; // Already parsed (MySQL returns JSON as object)
  try {
    return JSON.parse(field);
  } catch (error) {
    logger.warn('Failed to parse JSON field:', error);
    return null;
  }
};

// Helper function to stringify JSON for storage
const stringifyForDb = (data, dbType) => {
  if (!data) return null;
  // MySQL can handle JSON directly, SQLite needs string
  return dbType === 'mysql' ? data : JSON.stringify(data);
};

/**
 * POST /api/devices/refresh - Force refresh devices from database
 */
router.post('/refresh', async (req, res) => {
  try {
    logger.info('🔄 Force refreshing devices list...');
    const dbAdapter = getDbAdapter(req);

    const devices = await dbAdapter.all('SELECT * FROM devices ORDER BY created_at DESC');

    // Process devices based on database type
    const processedDevices = devices.map(device => ({
      ...device,
      capabilities: parseJsonField(device.capabilities) || {},
      onvif_profiles: parseJsonField(device.onvif_profiles),
      profile_assignments: parseJsonField(device.profile_assignments),
      authenticated: Boolean(device.authenticated)
    }));

    logger.info(`✅ Refreshed ${devices.length} devices from database`);
    res.json({
      success: true,
      devices: processedDevices,
      count: devices.length,
      message: 'Devices refreshed successfully'
    });
  } catch (error) {
    logger.error('❌ Error refreshing devices:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * GET /api/devices - Get all devices
 */
router.get('/', async (req, res) => {
  try {
    const dbAdapter = getDbAdapter(req);
    const devices = await dbAdapter.all('SELECT * FROM devices ORDER BY created_at DESC');

    // Process devices with proper JSON parsing
    const processedDevices = devices.map(device => ({
      ...device,
      capabilities: parseJsonField(device.capabilities) || {},
      onvif_profiles: parseJsonField(device.onvif_profiles),
      profile_assignments: parseJsonField(device.profile_assignments),
      authenticated: Boolean(device.authenticated)
    }));

    logger.info(`Retrieved ${devices.length} devices`);
    res.json({
      success: true,
      devices: processedDevices,
      count: devices.length
    });
  } catch (error) {
    logger.error('❌ Error in GET /devices:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/discover - Enhanced device discovery with debouncing
 */
router.post('/discover', async (req, res) => {
  try {
    logger.info('🔍 Enhanced device discovery triggered');
    console.log('🔍 Enhanced ONVIF discovery triggered');

    const dbAdapter = getDbAdapter(req);
    const dbType = req.app.get('dbType');

    // Use debounced discovery to prevent concurrent processes
    const discoveryResult = await debouncedDiscovery();

    if (!discoveryResult.success) {
      return res.json({
        success: true,
        devices: [],
        message: discoveryResult.message || 'Discovery process is already running',
        discovery_methods: [
          'ONVIF WS-Discovery',
          'Network IP Scanning',
          'SSDP/UPnP Discovery'
        ]
      });
    }

    const discoveredDevices = discoveryResult.devices;

    if (discoveredDevices.length === 0) {
      logger.info('📡 Enhanced discovery found 0 device(s)');
      return res.json({
        success: true,
        devices: [],
        message: 'No devices discovered. Check network connectivity and ensure cameras support ONVIF/UPnP.',
        discovery_methods: [
          'ONVIF WS-Discovery',
          'Network IP Scanning',
          'SSDP/UPnP Discovery'
        ]
      });
    }

    // Save discovered devices to database
    const savedDevices = [];

    logger.info(`🔍 Discovered devices with statuses: ${discoveredDevices.map(d => `${d.ip_address}:${d.status}`).join(', ')}`);

    for (const device of discoveredDevices) {
      try {
        // Check if device already exists
        const existing = await dbAdapter.get(
          'SELECT id, name FROM devices WHERE ip_address = ?',
          [device.ip_address]
        );

        if (existing) {
          // Update existing device
          const updateQuery = `
            UPDATE devices 
            SET last_seen = ?, discovery_method = ?, network_interface = ?,
            capabilities = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE ip_address = ?
          `;

          logger.info(`📊 Updating device ${device.ip_address}: status="${device.status}", last_seen="${device.last_seen}"`);

          await dbAdapter.run(updateQuery, [
            device.last_seen,
            device.discovery_method,
            device.network_interface,
            stringifyForDb(device.capabilities, dbType),
            device.status,
            device.ip_address
          ]);

          savedDevices.push({
            ...device,
            id: existing.id,
            name: existing.name
          });
          logger.info(`✅ Updated existing device: ${device.ip_address} (ID: ${existing.id})`);
        } else {
          // Insert new device
          const insertQuery = `
            INSERT INTO devices (
              id, name, ip_address, port, manufacturer, model, discovery_method,
              network_interface, status, capabilities, discovered_at, last_seen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await dbAdapter.run(insertQuery, [
            device.id,
            device.name,
            device.ip_address,
            device.port,
            device.manufacturer,
            device.model,
            device.discovery_method,
            device.network_interface,
            device.status,
            stringifyForDb(device.capabilities, dbType),
            device.discovered_at,
            device.last_seen
          ]);

          savedDevices.push(device);
          logger.info(`✅ Added new device: ${device.name} at ${device.ip_address}`);
        }
      } catch (error) {
        logger.error(`❌ Failed to save device ${device.ip_address}:`, error.message);
      }
    }

    logger.info(`✅ Enhanced discovery completed. Saved ${savedDevices.length}/${discoveredDevices.length} devices`);

    res.json({
      success: true,
      devices: savedDevices,
      discovered: discoveredDevices.length,
      saved: savedDevices.length,
      message: `Found ${discoveredDevices.length} devices using enhanced discovery methods`
    });

  } catch (error) {
    logger.error('❌ Enhanced discovery failed:', error);
    res.status(500).json({
      success: false,
      error: 'Enhanced discovery failed',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/manual-add - Manually add a device
 */
router.post('/manual-add', async (req, res) => {
  try {
    const { name, ip_address, port = 80, username, password, manufacturer, model } = req.body;
    const dbAdapter = getDbAdapter(req);
    const dbType = req.app.get('dbType');

    if (!name || !ip_address) {
      return res.status(400).json({
        success: false,
        error: 'Name and IP address are required'
      });
    }

    logger.info(`🔧 Manual device addition: ${name} at ${ip_address}`);

    // Check if device already exists
    const existing = await dbAdapter.get(
      'SELECT id FROM devices WHERE ip_address = ?',
      [ip_address]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Device with this IP address already exists'
      });
    }

    // Create device object
    const device = {
      id: `manual-${ip_address.replace(/\./g, '-')}-${Date.now()}`,
      name,
      ip_address,
      port: parseInt(port),
      manufacturer: manufacturer || 'Unknown',
      model: model || 'Unknown',
      username: username || null,
      password: password || null,
      discovery_method: 'manual',
      status: 'added',
      capabilities: { video: true, audio: false, ptz: false },
      discovered_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };

    // Insert into database
    const insertQuery = `
      INSERT INTO devices (
        id, name, ip_address, port, manufacturer, model, username, password,
        discovery_method, status, capabilities, discovered_at, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await dbAdapter.run(insertQuery, [
      device.id, device.name, device.ip_address, device.port,
      device.manufacturer, device.model, device.username, device.password,
      device.discovery_method, device.status,
      stringifyForDb(device.capabilities, dbType),
      device.discovered_at, device.last_seen
    ]);

    logger.info(`✅ Manually added device: ${device.name}`);

    res.json({
      success: true,
      device,
      message: 'Device added successfully'
    });

  } catch (error) {
    logger.error('❌ Manual device addition failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add device',
      details: error.message
    });
  }
});

/**
 * PUT /api/devices/:id - Update device
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const dbAdapter = getDbAdapter(req);

    logger.info(`🔧 Updating device: ${id}`);

    // Build dynamic update query
    const allowedFields = ['name', 'ip_address', 'port', 'manufacturer', 'model',
      'username', 'password', 'rtsp_username', 'rtsp_password'];
    const updateFields = [];
    const updateValues = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);

    const updateQuery = `UPDATE devices SET ${updateFields.join(', ')} WHERE id = ?`;
    await dbAdapter.run(updateQuery, updateValues);

    // Fetch updated device
    const updatedDevice = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [id]);

    if (!updatedDevice) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    logger.info(`✅ Device updated: ${updatedDevice.name}`);

    res.json({
      success: true,
      device: {
        ...updatedDevice,
        capabilities: parseJsonField(updatedDevice.capabilities) || {},
        authenticated: Boolean(updatedDevice.authenticated)
      },
      message: 'Device updated successfully'
    });

  } catch (error) {
    logger.error('❌ Device update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update device',
      details: error.message
    });
  }
});

/**
 * DELETE /api/devices/:id - Delete device
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dbAdapter = getDbAdapter(req);

    logger.info(`🗑️ Deleting device: ${id}`);

    // Stop any active HLS streaming for this device
    try {
      const streamId = `${id}_hls`;
      await hlsService.stopStreaming(streamId);
    } catch (error) {
      logger.warn(`⚠️ Failed to stop HLS streaming for deleted device: ${error.message}`);
    }

    const result = await dbAdapter.run('DELETE FROM devices WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    logger.info(`✅ Device deleted: ${id}`);

    res.json({
      success: true,
      message: 'Device deleted successfully'
    });

  } catch (error) {
    logger.error('❌ Device deletion failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete device',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/authenticate - Authenticate device with automatic HLS streaming
 */
router.post('/:id/authenticate', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, rtsp_username, rtsp_password } = req.body;
    const dbAdapter = getDbAdapter(req);
    const dbType = req.app.get('dbType');

    logger.info(`🔐 Authentication request received for device ID: ${id}`);
    logger.info(`📊 Request body keys: ${Object.keys(req.body).join(', ')}`);
    logger.info(`🔑 Credential details: ONVIF=${username ? 'SET' : 'MISSING'}, RTSP=${rtsp_username ? 'SET' : 'MISSING'}`);

    if (!username || !password) {
      logger.error(`❌ Missing credentials in request for device ${id}`);
      return res.status(400).json({
        success: false,
        error: 'ONVIF username and password are required'
      });
    }

    // Get device info
    const device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [id]);

    if (!device) {
      logger.error(`❌ Device not found for authentication: ${id}`);
      return res.status(404).json({
        success: false,
        error: `Device not found with ID: "${id}"`
      });
    }

    logger.info(`🔍 Found device: ${device.name} at ${device.ip_address}`);

    // Use provided RTSP credentials, fallback to ONVIF credentials if not provided
    const finalRtspUsername = rtsp_username || username;
    const finalRtspPassword = rtsp_password || password;

    logger.info(`💾 Credential Processing Details:`);
    if (process.env.NODE_ENV === 'development') {
      logger.info(`   Final ONVIF: ${username} / ${password || '[EMPTY]'}`);
      logger.info(`   Final RTSP: ${finalRtspUsername} / ${finalRtspPassword || '[EMPTY]'}`);
    } else {
      logger.info(`   Final ONVIF: ${username} / ${password ? '[***]' : '[EMPTY]'}`);
      logger.info(`   Final RTSP: ${finalRtspUsername} / ${finalRtspPassword ? '[***]' : '[EMPTY]'}`);
    }

    // Test ONVIF authentication and get capabilities
    let onvifCapabilities = null;
    let authenticationError = null;

    try {
      const profileDiscovery = new OnvifProfileDiscovery(device);
      profileDiscovery.setCredentials(username, password, finalRtspUsername, finalRtspPassword);

      logger.info(`🔑 Testing ONVIF authentication with credentials: ${username}`);

      onvifCapabilities = await profileDiscovery.discoverCapabilities();

      logger.info(`✅ ONVIF authentication successful for ${device.name}`);

    } catch (authError) {
      logger.warn(`⚠️ ONVIF authentication failed for ${device.name}:`, authError.message);
      authenticationError = authError.message;
    }

    // Save credentials to database
    try {
      const updateQuery = `
        UPDATE devices 
        SET username = ?, password = ?, rtsp_username = ?, rtsp_password = ?, 
            authenticated = ?, onvif_profiles = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await dbAdapter.run(updateQuery, [
        username,
        password,
        finalRtspUsername,
        finalRtspPassword,
        onvifCapabilities ? 1 : 0,
        stringifyForDb(onvifCapabilities?.enhancedProfiles || [], dbType),
        id
      ]);

      logger.info(`💾 Credentials saved for ${device.name}`);

    } catch (dbError) {
      logger.error(`❌ Failed to save credentials for ${device.name}:`, dbError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to save device credentials',
        details: dbError.message
      });
    }

    // Get updated device info for streaming
    const updatedDevice = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [id]);

    // Verify credentials were saved correctly
    if (updatedDevice) {
      logger.info(`🔍 Verification - Device credentials in database:`);
      if (process.env.NODE_ENV === 'development') {
        logger.info(`   ONVIF: ${updatedDevice.username} / ${updatedDevice.password || '[EMPTY]'}`);
        logger.info(`   RTSP: ${updatedDevice.rtsp_username} / ${updatedDevice.rtsp_password || '[EMPTY]'}`);
      } else {
        logger.info(`   ONVIF: ${updatedDevice.username} / ${updatedDevice.password ? '[***]' : '[EMPTY]'}`);
        logger.info(`   RTSP: ${updatedDevice.rtsp_username} / ${updatedDevice.rtsp_password ? '[***]' : '[EMPTY]'}`);
      }
      logger.info(`   Authenticated: ${updatedDevice.authenticated}`);
    }

    // Automatically start HLS streaming after successful credential save with retry logic
    let streamingResult = null;
    if (updatedDevice && (updatedDevice.rtsp_username && updatedDevice.rtsp_password)) {
      try {
        logger.info(`🎥 Starting automatic HLS streaming for ${device.name}`);

        streamingResult = await hlsService.startStreamingWithRetry(updatedDevice, 3, 2000);
        logger.info(`✅ HLS streaming started for ${device.name}: ${streamingResult.url}`);

        // Auto-start streaming for this device using stream manager
        const streamManager = require('../services/stream-manager');
        await streamManager.startStreamForDevice(updatedDevice);
        logger.info(`✅ Stream manager auto-start initiated for ${device.name}`);

      } catch (streamError) {
        logger.error(`❌ Failed to start HLS streaming for ${device.name}: ${streamError.message}`);
        streamingResult = {
          success: false,
          error: streamError.message
        };
      }
    } else {
      logger.warn(`⚠️ Cannot start HLS streaming for ${device.name}: Missing RTSP credentials`);
      streamingResult = {
        success: false,
        error: 'No RTSP credentials for streaming'
      };
    }

    // Process updated device for response
    const processedDevice = {
      ...updatedDevice,
      capabilities: parseJsonField(updatedDevice.capabilities) || {},
      onvif_profiles: parseJsonField(updatedDevice.onvif_profiles) || [],
      authenticated: Boolean(updatedDevice.authenticated)
    };

    // Return response based on authentication result
    if (onvifCapabilities && !authenticationError) {
      res.json({
        success: true,
        message: 'Device authenticated and streaming started successfully',
        onvifAuthentication: true,
        capabilities: onvifCapabilities,
        profiles: onvifCapabilities.enhancedProfiles || [],
        streaming: streamingResult,
        device: {
          ...processedDevice,
          authenticated: true,
          capabilities: onvifCapabilities
        }
      });
    } else {
      res.json({
        success: true,
        message: 'Credentials saved. ONVIF authentication failed but RTSP streaming may still work.',
        onvifAuthentication: false,
        onvifError: authenticationError,
        credentialsSaved: true,
        streaming: streamingResult,
        device: processedDevice
      });
    }

  } catch (error) {
    logger.error(`❌ Device authentication process failed for ${id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Authentication process failed',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/start-stream - Start HLS streaming
 */
router.post('/:id/start-stream', async (req, res) => {
  try {
    const { id } = req.params;
    const dbAdapter = getDbAdapter(req);

    // Get device info
    const device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [id]);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.rtsp_username || !device.rtsp_password) {
      return res.status(400).json({
        success: false,
        error: 'Device not authenticated - RTSP credentials required'
      });
    }

    const result = await hlsService.startStreamingWithRetry(device, 3, 2000);
    res.json(result);

  } catch (error) {
    logger.error(`❌ Failed to start streaming for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to start streaming',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/stop-stream - Stop HLS streaming
 */
router.post('/:id/stop-stream', async (req, res) => {
  try {
    const { id } = req.params;
    const streamId = `${id}_hls`;

    const result = await hlsService.stopStreaming(streamId);
    res.json(result);

  } catch (error) {
    logger.error(`❌ Failed to stop streaming for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop streaming',
      details: error.message
    });
  }
});

/**
 * GET /api/devices/:id/verify - Verify device exists
 */
router.get('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const dbAdapter = getDbAdapter(req);

    logger.info(`🔍 Verifying device exists: ${id}`);

    const device = await dbAdapter.get(
      'SELECT id, name, ip_address, manufacturer, discovery_method, authenticated FROM devices WHERE id = ?',
      [id]
    );

    if (!device) {
      // Get all devices for debugging
      const allDevices = await dbAdapter.all(
        'SELECT id, name, ip_address FROM devices LIMIT 10'
      );

      logger.warn(`⚠️ Device verification failed for ID: ${id}`);
      logger.warn(`📋 Available devices: ${allDevices.map(d => d.id).join(', ')}`);

      return res.status(404).json({
        success: false,
        error: 'Device not found',
        searchedId: id,
        availableDevices: allDevices.slice(0, 5).map(d => ({ id: d.id, name: d.name }))
      });
    }

    logger.info(`✅ Device verification successful: ${device.name} at ${device.ip_address}`);

    res.json({
      success: true,
      device: {
        id: device.id,
        name: device.name,
        ip_address: device.ip_address,
        manufacturer: device.manufacturer,
        discovery_method: device.discovery_method,
        authenticated: Boolean(device.authenticated)
      },
      message: 'Device verified successfully'
    });

  } catch (error) {
    logger.error(`❌ Device verification error for ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Device verification failed',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/test-rtsp - Test RTSP connection for a device
 */
router.post('/:id/test-rtsp', async (req, res) => {
  try {
    const { id } = req.params;
    const dbAdapter = getDbAdapter(req);

    logger.info(`🧪 Testing RTSP connection for device: ${id}`);

    // Get device info
    const device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [id]);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.rtsp_username || !device.rtsp_password) {
      return res.status(400).json({
        success: false,
        error: 'Device not authenticated - RTSP credentials required'
      });
    }

    // Test RTSP connection using HLS service
    const rtspResult = await hlsService.getBestRTSPUrl(device);

    res.json({
      success: rtspResult.success,
      device: {
        name: device.name,
        ip_address: device.ip_address,
        rtsp_username: device.rtsp_username
      },
      rtspTest: rtspResult,
      message: rtspResult.success ? 'RTSP connection successful' : 'RTSP connection failed'
    });

  } catch (error) {
    logger.error(`❌ RTSP test failed for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'RTSP test failed',
      details: error.message
    });
  }
});

/**
 * GET /api/devices/:id/profiles - Get device profiles
 */
router.get('/:id/profiles', async (req, res) => {
  try {
    const { id } = req.params;
    const dbAdapter = getDbAdapter(req);

    logger.info(`📋 Getting profiles for device: ${id}`);

    // Get device from database
    const device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [id]);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Parse stored profiles
    let profiles = parseJsonField(device.onvif_profiles) || [];

    // If no stored profiles and device is authenticated, try to generate them
    if (profiles.length === 0 && device.authenticated && device.username && device.password) {
      try {
        logger.info(`🎯 Generating enhanced profiles for ${device.ip_address}`);

        const profileDiscovery = new OnvifProfileDiscovery(device);
        profileDiscovery.setCredentials(
          device.username,
          device.password,
          device.rtsp_username || device.username,
          device.rtsp_password || device.password
        );

        const capabilities = await profileDiscovery.discoverCapabilities();
        profiles = capabilities.enhancedProfiles || [];

        // Save generated profiles back to database
        if (profiles.length > 0) {
          const dbType = req.app.get('dbType');
          await dbAdapter.run(
            'UPDATE devices SET onvif_profiles = ? WHERE id = ?',
            [stringifyForDb(profiles, dbType), id]
          );
          logger.info(`💾 Saved ${profiles.length} generated profiles for ${device.name}`);
        }

      } catch (error) {
        logger.warn(`⚠️ Failed to generate profiles for ${device.name}:`, error.message);
        profiles = generateFallbackProfiles(device);
      }
    } else if (profiles.length === 0) {
      // Generate fallback profiles if no stored profiles and can't generate
      profiles = generateFallbackProfiles(device);
    }

    res.json({
      success: true,
      profiles,
      count: profiles.length,
      device: {
        id: device.id,
        name: device.name,
        ip_address: device.ip_address,
        authenticated: Boolean(device.authenticated)
      }
    });

  } catch (error) {
    logger.error(`❌ Failed to get profiles for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device profiles',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/profiles/discover - Discover device profiles
 */
router.post('/:id/profiles/discover', async (req, res) => {
  try {
    const { id } = req.params;
    const dbAdapter = getDbAdapter(req);
    const dbType = req.app.get('dbType');

    logger.info(`🔍 Starting profile discovery for device: ${id}`);

    // Get device from database
    const device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [id]);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.username || !device.password) {
      return res.status(400).json({
        success: false,
        error: 'Device not authenticated - credentials required for profile discovery'
      });
    }

    // Discover profiles using ONVIF
    const profileDiscovery = new OnvifProfileDiscovery(device);
    profileDiscovery.setCredentials(
      device.username,
      device.password,
      device.rtsp_username || device.username,
      device.rtsp_password || device.password
    );

    const capabilities = await profileDiscovery.discoverCapabilities();
    const profiles = capabilities.enhancedProfiles || [];

    // Save discovered profiles to database
    await dbAdapter.run(
      'UPDATE devices SET onvif_profiles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [stringifyForDb(profiles, dbType), id]
    );

    logger.info(`✅ Discovered and saved ${profiles.length} profiles for ${device.name}`);

    res.json({
      success: true,
      profiles,
      count: profiles.length,
      discovery_method: capabilities.discovery_method || 'ONVIF',
      device: {
        id: device.id,
        name: device.name,
        ip_address: device.ip_address
      }
    });

  } catch (error) {
    logger.error(`❌ Profile discovery failed for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Profile discovery failed',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/profiles/:token/test - Test specific profile
 */
router.post('/:id/profiles/:token/test', async (req, res) => {
  try {
    const { id, token } = req.params;
    const dbAdapter = getDbAdapter(req);

    logger.info(`🧪 Testing profile ${token} for device ${id}`);

    // Get device from database
    const device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [id]);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Parse profiles and find the requested one
    const profiles = parseJsonField(device.onvif_profiles) || [];
    const profile = profiles.find(p => p.token === token || p.id === token);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    // Test the profile using HLS service
    const testResult = await hlsService.testProfileConnectivity(device, profile);

    res.json({
      success: true,
      test_result: testResult,
      profile: {
        token: profile.token || profile.id,
        name: profile.name
      },
      device: {
        id: device.id,
        name: device.name,
        ip_address: device.ip_address
      }
    });

  } catch (error) {
    logger.error(`❌ Profile test failed for ${req.params.token}:`, error);
    res.status(500).json({
      success: false,
      error: 'Profile test failed',
      details: error.message
    });
  }
});

/**
 * GET /api/devices/:id/profile-assignments - Get profile assignments
 */
router.get('/:id/profile-assignments', async (req, res) => {
  try {
    const { id } = req.params;
    const dbAdapter = getDbAdapter(req);

    logger.info(`📋 Loading profile assignments for device: ${id}`);

    // Get device from database
    const device = await dbAdapter.get(
      'SELECT profile_assignments FROM devices WHERE id = ?',
      [id]
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Parse profile assignments
    const profileAssignments = parseJsonField(device.profile_assignments) || [];

    res.json({
      success: true,
      profile_assignments: profileAssignments,
      count: profileAssignments.length
    });

  } catch (error) {
    logger.error(`❌ Failed to get profile assignments for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile assignments',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/configure-profiles - Configure device profiles
 */
router.post('/:id/configure-profiles', async (req, res) => {
  try {
    const { id } = req.params;
    const { profileAssignments, profile_tags } = req.body;
    const dbAdapter = getDbAdapter(req);
    const dbType = req.app.get('dbType');

    // Support both parameter names for backwards compatibility
    const assignments = profileAssignments || profile_tags;

    logger.info(`🔧 Profile configuration request for device: ${id}`);
    logger.info(`📊 Profile assignments: ${JSON.stringify(assignments, null, 2)}`);

    if (!assignments || !Array.isArray(assignments)) {
      return res.status(400).json({
        success: false,
        error: 'Profile assignments must be provided as an array'
      });
    }

    // Get device info
    const device = await dbAdapter.get('SELECT id, name FROM devices WHERE id = ?', [id]);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Save profile assignments to database
    await dbAdapter.run(
      'UPDATE devices SET profile_assignments = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [stringifyForDb(assignments, dbType), id]
    );

    logger.info(`💾 Profile assignments saved for device: ${device.name}`);

    // Build response summary
    const validAssignments = assignments.filter(assignment =>
      assignment.enabled &&
      assignment.usage &&
      (assignment.profileToken || assignment.token) &&
      (assignment.profileName || assignment.name)
    );

    const summary = {
      totalProfiles: assignments.length,
      enabledProfiles: validAssignments.length,
      usageAssignments: validAssignments.reduce((acc, assignment) => {
        acc[assignment.usage] = assignment.profileName || assignment.name;
        return acc;
      }, {}),
      mainStreamProfile: validAssignments.find(a => a.usage === 'main-stream')?.profileName ||
        validAssignments.find(a => a.usage === 'main-stream')?.name || null,
      subStreamProfile: validAssignments.find(a => a.usage === 'sub-stream')?.profileName ||
        validAssignments.find(a => a.usage === 'sub-stream')?.name || null
    };

    res.json({
      success: true,
      message: 'Profile configuration saved successfully',
      summary,
      assignments,
      device: {
        id: device.id,
        name: device.name
      }
    });

  } catch (error) {
    logger.error(`❌ Profile configuration failed for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to save profile configuration',
      details: error.message
    });
  }
});

/**
 * GET /api/devices/network-scan - Network scanning utility
 */
router.get('/network-scan', async (req, res) => {
  try {
    logger.info('🌐 Network scanning utility requested');

    const interfaces = enhancedDiscovery.getNetworkInterfaces();
    const scanResults = {
      interfaces,
      recommendations: [],
      commonRanges: []
    };

    // Add recommendations based on interfaces
    for (const iface of interfaces) {
      const subnet = enhancedDiscovery.getSubnet(iface.address, iface.netmask);
      scanResults.commonRanges.push({
        interface: iface.name,
        subnet,
        description: `Scan ${subnet} on ${iface.name}`
      });
    }

    scanResults.recommendations = [
      'Check if cameras are on the same network subnet',
      'Ensure cameras have ONVIF enabled',
      'Verify camera IP addresses are in expected ranges',
      'Test camera web interfaces manually first'
    ];

    res.json({
      success: true,
      scanResults,
      message: 'Network scan information retrieved'
    });

  } catch (error) {
    logger.error('❌ Network scan utility error:', error);
    res.status(500).json({
      success: false,
      error: 'Network scan utility failed',
      details: error.message
    });
  }
});

/**
 * Generate fallback profiles for a device
 * This creates standard ONVIF profiles that work with most cameras
 */
function generateFallbackProfiles(device) {
  logger.info(`🎯 Generating fallback profiles for ${device.name} (${device.ip_address})`);

  // Parse capabilities safely
  let capabilities = { ptz: false, audio: false, video: true };
  if (device.capabilities) {
    const parsed = parseJsonField(device.capabilities);
    if (parsed) capabilities = parsed;
  }

  const profiles = [
    {
      id: 'profile_1',
      name: 'Main Profile',
      token: 'profile_1',
      video_profiles: [
        {
          name: 'Main Stream',
          token: 'main_stream',
          resolution: '1920x1080',
          fps: 30,
          codec: 'H.264',
          streaming_uri: `rtsp://${device.ip_address}:554/profile1`,
          snapshot_uri: `http://${device.ip_address}/onvif/snapshot?profile=1`,
          audio_enabled: capabilities.audio || true,
          ptz_enabled: capabilities.ptz || false
        }
      ],
      ptz_supported: capabilities.ptz || false,
      audio_supported: capabilities.audio || true
    },
    {
      id: 'profile_2',
      name: 'Sub Profile',
      token: 'profile_2',
      video_profiles: [
        {
          name: 'Sub Stream',
          token: 'sub_stream',
          resolution: '1280x720',
          fps: 25,
          codec: 'H.264',
          streaming_uri: `rtsp://${device.ip_address}:554/profile2`,
          snapshot_uri: `http://${device.ip_address}/onvif/snapshot?profile=2`,
          audio_enabled: false,
          ptz_enabled: false
        }
      ],
      ptz_supported: false,
      audio_supported: false
    },
    {
      id: 'profile_hd',
      name: 'HD Profile',
      token: 'profile_hd',
      video_profiles: [
        {
          name: 'HD Stream',
          token: 'hd_stream',
          resolution: '1280x720',
          fps: 25,
          codec: 'H.264',
          streaming_uri: `rtsp://${device.ip_address}:554/profile1`,
          snapshot_uri: `http://${device.ip_address}/onvif/snapshot?profile=hd`,
          audio_enabled: capabilities.audio || true,
          ptz_enabled: capabilities.ptz || false
        }
      ],
      ptz_supported: capabilities.ptz || false,
      audio_supported: capabilities.audio || true
    }
  ];

  logger.info(`✅ Generated ${profiles.length} fallback profiles with correct paths`);

  return profiles;
}

module.exports = router;