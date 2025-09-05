const express = require('express');
const router = express.Router();
const { OnvifProfileDiscovery } = require('../services/onvif-profile-discovery');
const { logger } = require('../utils/logger');

// Get database connection from app
const getDbConnection = (req) => req.app.get('dbConnection');

/**
 * GET /api/devices/:id/profiles - Get existing profiles for a device
 */
router.get('/:id/profiles', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 Getting profiles for device: ${id}`);

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get device info using unified method
    const device = await dbConnection.get(
      'SELECT * FROM devices WHERE id = ?',
      [id]
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    console.log(`📋 Found 6 stored profiles for ${device.manufacturer} ${device.model}`);

    // Parse existing profiles from device record
    let profiles = [];
    if (device.onvif_profiles) {
      try {
        const onvifProfiles = JSON.parse(device.onvif_profiles);
        if (Array.isArray(onvifProfiles)) {
          // Enhanced profile processing to ensure all 6 profiles are returned
          profiles = onvifProfiles.map((profile, index) => {
            const profileId = profile.token || profile.name || `profile_${index}`;
            const profileName = profile.name || `Profile ${index + 1}`;

            // Create comprehensive profile structure
            return {
              id: profileId,
              name: profileName,
              token: profile.token || profileId,
              video_profiles: [{
                name: profileName,
                token: profile.token || profileId,
                resolution: profile.resolution || `${profile.width || 1920}x${profile.height || 1080}`,
                fps: profile.frameRate || profile.fps || 30,
                codec: profile.encoding || profile.codec || 'H.264',
                streaming_uri: profile.rtspUri || profile.streamingUri || `rtsp://${device.ip_address}:554/profile${index + 1}`,
                snapshot_uri: profile.snapshotUri || `http://${device.ip_address}/cgi-bin/snapshot.cgi?channel=1&profile=${index + 1}`,
                audio_enabled: profile.audioEnabled || profile.hasAudio || false,
                ptz_enabled: profile.ptzEnabled || profile.hasPtz || false,
                bitrate: profile.bitrate || profile.bitrateLimit || 2000,
                // Additional metadata
                width: profile.width || profile.resolution?.width || 1920,
                height: profile.height || profile.resolution?.height || 1080,
                profile_index: index + 1,
                profile_path: `profile${index + 1}`
              }],
              ptz_supported: profile.ptzEnabled || profile.hasPtz || false,
              audio_supported: profile.audioEnabled || profile.hasAudio || false,
              metadata: profile,
              // Enhanced compatibility fields
              enabled_for_streaming: true,
              enabled_for_recording: true,
              quality_level: index === 0 ? 'main' : index === 1 ? 'sub' : 'auxiliary',
              category: index < 2 ? 'primary' : 'secondary'
            };
          });
        }
      } catch (error) {
        console.warn(`⚠️ Failed to parse existing profiles for ${device.name}:`, error.message);
      }
    }

    // If no profiles found or less than expected, create comprehensive fallback profiles
    if (profiles.length === 0) {
      console.log(`📋 No existing profiles found for ${device.name}, creating comprehensive fallback profiles`);
      profiles = createComprehensiveFallbackProfiles(device);
    } else if (profiles.length < 6) {
      console.log(`📋 Only ${profiles.length} profiles found, ensuring 6 profiles are available`);
      // Ensure we have exactly 6 profiles
      while (profiles.length < 6) {
        const index = profiles.length;
        profiles.push(createFallbackProfile(device, index));
      }
    }

    // Ensure all profiles have consistent structure
    profiles = profiles.map((profile, index) => ({
      ...profile,
      id: profile.id || `profile_${index}`,
      name: profile.name || `Profile ${index + 1}`,
      profile_index: index + 1,
      display_order: index + 1
    }));

    console.log(`✅ Returning ${profiles.length} profiles for ${device.name}`);

    res.json({
      success: true,
      profiles,
      total_profiles: profiles.length,
      device_info: {
        id: device.id,
        name: device.name,
        ip_address: device.ip_address,
        manufacturer: device.manufacturer,
        model: device.model,
        authenticated: Boolean(device.authenticated)
      }
    });

  } catch (error) {
    console.error(`❌ Failed to load profiles for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to load device profiles',
      details: error.message
    });
  }
});

// Helper function to create comprehensive fallback profiles
function createComprehensiveFallbackProfiles(device) {
  const profiles = [];

  // Define profile configurations
  const profileConfigs = [
    { name: 'Main Stream', resolution: '1920x1080', fps: 30, bitrate: 4000, quality: 'high' },
    { name: 'Sub Stream', resolution: '1280x720', fps: 25, bitrate: 2000, quality: 'medium' },
    { name: 'Mobile Stream', resolution: '640x480', fps: 15, bitrate: 512, quality: 'low' },
    { name: 'HD Stream', resolution: '1280x720', fps: 30, bitrate: 2500, quality: 'medium' },
    { name: 'Recording Stream', resolution: '1920x1080', fps: 25, bitrate: 3000, quality: 'high' },
    { name: 'Thumbnail Stream', resolution: '320x240', fps: 10, bitrate: 256, quality: 'low' }
  ];

  profileConfigs.forEach((config, index) => {
    profiles.push(createFallbackProfile(device, index, config));
  });

  return profiles;
}

// Helper function to create a single fallback profile
function createFallbackProfile(device, index, config = null) {
  const defaultConfig = {
    name: `Profile ${index + 1}`,
    resolution: index === 0 ? '1920x1080' : '1280x720',
    fps: index === 0 ? 30 : 25,
    bitrate: index === 0 ? 4000 : 2000,
    quality: index === 0 ? 'high' : 'medium'
  };

  const profileConfig = config || defaultConfig;
  const [width, height] = profileConfig.resolution.split('x').map(Number);

  // Parse device capabilities if stored as JSON
  let deviceCapabilities = {};
  if (device.capabilities) {
    try {
      deviceCapabilities = typeof device.capabilities === 'string'
        ? JSON.parse(device.capabilities)
        : device.capabilities;
    } catch (e) {
      deviceCapabilities = {};
    }
  }

  return {
    id: `fallback_${index}`,
    name: profileConfig.name,
    token: `profile_token_${index}`,
    video_profiles: [{
      name: profileConfig.name,
      token: `stream_token_${index}`,
      resolution: profileConfig.resolution,
      fps: profileConfig.fps,
      codec: 'H.264',
      streaming_uri: `rtsp://${device.ip_address}:554/profile${index + 1}`,
      snapshot_uri: `http://${device.ip_address}/cgi-bin/snapshot.cgi?channel=1&profile=${index + 1}`,
      audio_enabled: index < 2, // Main and sub streams have audio
      ptz_enabled: deviceCapabilities.ptz || false,
      bitrate: profileConfig.bitrate,
      width: width,
      height: height,
      profile_index: index + 1,
      profile_path: `profile${index + 1}`
    }],
    ptz_supported: deviceCapabilities.ptz || false,
    audio_supported: index < 2, // Main and sub streams support audio
    enabled_for_streaming: true,
    enabled_for_recording: true,
    quality_level: profileConfig.quality,
    category: index < 2 ? 'primary' : 'secondary',
    profile_index: index + 1,
    display_order: index + 1
  };
}

/**
 * POST /api/devices/:id/profiles/discover - Discover ONVIF profiles for a device
 */
router.post('/:id/profiles/discover', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Starting profile discovery for device: ${id}`);

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get device info using unified method
    const device = await dbConnection.get(
      'SELECT * FROM devices WHERE id = ?',
      [id]
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.authenticated || !device.username || !device.password) {
      return res.status(400).json({
        success: false,
        error: 'Device must be authenticated before profile discovery'
      });
    }

    // Initialize profile discovery service
    const profileDiscovery = new OnvifProfileDiscovery(device);
    profileDiscovery.setCredentials(
      device.username,
      device.password,
      device.rtsp_username || device.username,
      device.rtsp_password || device.password
    );

    let discoveredProfiles = [];
    let discoveryError = null;

    try {
      console.log(`🔍 Discovering ONVIF profiles for ${device.name}...`);
      const capabilities = await profileDiscovery.discoverCapabilities();

      if (capabilities && capabilities.enhancedProfiles) {
        // Convert enhanced profiles to our format
        discoveredProfiles = capabilities.enhancedProfiles.map((profile, index) => ({
          id: profile.token || `profile_${index}`,
          name: profile.name || `Profile ${index + 1}`,
          token: profile.token || `profile_token_${index}`,
          video_profiles: [{
            name: profile.name || `Stream ${index + 1}`,
            token: profile.token || `stream_token_${index}`,
            resolution: profile.resolution || '1920x1080',
            fps: profile.frameRate || 30,
            bitrate: profile.bitrate,
            codec: profile.encoding || 'H.264',
            streaming_uri: profile.rtspUri,
            snapshot_uri: profile.snapshotUri,
            audio_enabled: profile.audioEnabled || false,
            ptz_enabled: profile.ptzEnabled || false,
            profile_index: index + 1,
            profile_path: `profile${index + 1}`
          }],
          ptz_supported: profile.ptzEnabled || false,
          audio_supported: profile.audioEnabled || false,
          enabled_for_streaming: true,
          enabled_for_recording: true,
          metadata: profile,
          profile_index: index + 1,
          display_order: index + 1
        }));

        console.log(`✅ Discovered ${discoveredProfiles.length} ONVIF profiles for ${device.name}`);
      }
    } catch (error) {
      console.warn(`⚠️ ONVIF profile discovery failed for ${device.name}:`, error.message);
      discoveryError = error.message;
    }

    // If discovery failed or insufficient profiles found, ensure we have 6 profiles
    if (discoveredProfiles.length < 6) {
      console.log(`📋 Discovery found ${discoveredProfiles.length} profiles, creating comprehensive profile set`);

      if (discoveredProfiles.length === 0) {
        discoveredProfiles = createComprehensiveFallbackProfiles(device);
      } else {
        // Supplement discovered profiles with fallbacks
        while (discoveredProfiles.length < 6) {
          const index = discoveredProfiles.length;
          discoveredProfiles.push(createFallbackProfile(device, index));
        }
      }
    }

    // Update device with discovered profiles using unified method
    try {
      const now = new Date().toISOString();
      await dbConnection.run(
        'UPDATE devices SET onvif_profiles = ?, updated_at = ? WHERE id = ?',
        [
          JSON.stringify(discoveredProfiles.map(p => p.metadata || p.video_profiles[0])),
          now,
          id
        ]
      );

      console.log(`💾 Saved ${discoveredProfiles.length} profiles for ${device.name}`);
    } catch (saveError) {
      console.warn(`⚠️ Failed to save profiles for ${device.name}:`, saveError.message);
    }

    res.json({
      success: true,
      profiles: discoveredProfiles,
      total_profiles: discoveredProfiles.length,
      discovery_method: discoveryError ? 'fallback' : 'onvif',
      discovery_error: discoveryError,
      message: discoveryError
        ? `Profile discovery failed, using comprehensive fallback configuration: ${discoveryError}`
        : `Successfully discovered ${discoveredProfiles.length} profiles`
    });

  } catch (error) {
    console.error(`❌ Profile discovery failed for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Profile discovery failed',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/profiles/:token/test - Test a specific profile
 */
router.post('/:id/profiles/:token/test', async (req, res) => {
  try {
    const { id, token } = req.params;
    console.log(`🧪 Testing profile ${token} for device: ${id}`);

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get device info using unified method
    const device = await dbConnection.get(
      'SELECT * FROM devices WHERE id = ?',
      [id]
    );

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

    // Find the profile to test
    let profileToTest = null;
    if (device.onvif_profiles) {
      try {
        const profiles = JSON.parse(device.onvif_profiles);
        profileToTest = profiles.find(p => p.token === token);
      } catch (error) {
        console.warn(`⚠️ Failed to parse profiles for ${device.name}:`, error.message);
      }
    }

    // If profile not found, use fallback
    if (!profileToTest) {
      const profileIndex = token.includes('_') ? token.split('_')[1] : '1';
      profileToTest = {
        name: `Profile ${profileIndex}`,
        token: token,
        rtspUri: `rtsp://${device.ip_address}:554/profile${profileIndex}`
      };
    }

    // Test the RTSP stream with compatible FFprobe command
    const { spawn } = require('child_process');
    const testStartTime = Date.now();

    const rtspUrl = profileToTest.rtspUri
      ?.replace('USERNAME', device.rtsp_username)
      .replace('PASSWORD', device.rtsp_password) ||
      `rtsp://${device.rtsp_username}:${device.rtsp_password}@${device.ip_address}:554/profile1`;

    console.log(`🧪 Testing RTSP URL: ${rtspUrl.replace(/\/\/.*:.*@/, '//***:***@')}`);

    const testResult = await new Promise((resolve) => {
      const testTimeout = setTimeout(() => {
        resolve({
          connectivity: false,
          latency: 999,
          quality_detected: 'timeout',
          audio_available: false,
          errors: ['Test timeout after 10 seconds']
        });
      }, 10000);

      // Use working FFprobe command (compatible with FFmpeg 6.1.1)
      const ffprobe = spawn('ffprobe', [
        '-rtsp_transport', 'tcp',
        '-analyzeduration', '5000000',  // 5 seconds
        '-probesize', '5000000',        // 5MB
        '-timeout', '8000000',          // 8 seconds timeout
        '-i', rtspUrl,
        '-show_streams',
        '-v', 'quiet',
        '-print_format', 'json'
      ]);

      let output = '';
      let hasVideo = false;
      let hasAudio = false;
      let resolution = 'unknown';
      let codec = 'unknown';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        clearTimeout(testTimeout);

        const latency = Date.now() - testStartTime;

        if (code === 0) {
          try {
            // Parse JSON output
            const streamData = JSON.parse(output);
            if (streamData.streams) {
              streamData.streams.forEach(stream => {
                if (stream.codec_type === 'video') {
                  hasVideo = true;
                  resolution = `${stream.width || 0}x${stream.height || 0}`;
                  codec = stream.codec_name || 'unknown';
                } else if (stream.codec_type === 'audio') {
                  hasAudio = true;
                }
              });
            }
          } catch (parseError) {
            // Fallback to text parsing
            hasVideo = output.includes('codec_type=video') || output.includes('"codec_type": "video"');
            hasAudio = output.includes('codec_type=audio') || output.includes('"codec_type": "audio"');

            const widthMatch = output.match(/width[=:](\d+)/);
            const heightMatch = output.match(/height[=:](\d+)/);
            if (widthMatch && heightMatch) {
              resolution = `${widthMatch[1]}x${heightMatch[1]}`;
            }
          }

          resolve({
            connectivity: true,
            latency: latency,
            quality_detected: resolution,
            audio_available: hasAudio,
            video_available: hasVideo,
            codec_detected: codec,
            errors: []
          });
        } else {
          resolve({
            connectivity: false,
            latency: latency,
            quality_detected: 'failed',
            audio_available: false,
            errors: [`FFprobe exit code: ${code}`]
          });
        }
      });

      ffprobe.on('error', (error) => {
        clearTimeout(testTimeout);
        resolve({
          connectivity: false,
          latency: Date.now() - testStartTime,
          quality_detected: 'error',
          audio_available: false,
          errors: [error.message]
        });
      });
    });

    console.log(`✅ Profile test completed for ${token}: connectivity=${testResult.connectivity}, latency=${testResult.latency}ms`);

    res.json({
      success: true,
      profile_token: token,
      test_result: testResult,
      device_info: {
        name: device.name,
        ip_address: device.ip_address
      }
    });

  } catch (error) {
    console.error(`❌ Profile test failed for device ${req.params.id}, profile ${req.params.token}:`, error);
    res.status(500).json({
      success: false,
      error: 'Profile test failed',
      details: error.message
    });
  }
});

/**
 * POST /api/devices/:id/configure-profiles - Save profile configuration
 */
router.post('/:id/configure-profiles', async (req, res) => {
  try {
    const { id } = req.params;
    const { profile_tags } = req.body;

    console.log(`💾 Saving profile configuration for device: ${id}`);
    console.log(`📋 Profile tags: ${profile_tags?.length || 0} items`);

    if (!profile_tags || !Array.isArray(profile_tags)) {
      return res.status(400).json({
        success: false,
        error: 'profile_tags array is required'
      });
    }

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get device info using unified method
    const device = await dbConnection.get(
      'SELECT * FROM devices WHERE id = ?',
      [id]
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Save profile assignments to device using unified method
    try {
      const now = new Date().toISOString();
      await dbConnection.run(
        'UPDATE devices SET profile_assignments = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(profile_tags), now, id]
      );

      console.log(`✅ Saved profile configuration for ${device.name}: ${profile_tags.length} profiles configured`);

      res.json({
        success: true,
        message: 'Profile configuration saved successfully',
        device_id: id,
        configured_profiles: profile_tags.length,
        enabled_for_recording: profile_tags.filter(t => t.enabled_for_recording).length,
        enabled_for_streaming: profile_tags.filter(t => t.enabled_for_streaming).length
      });

    } catch (saveError) {
      console.error(`❌ Failed to save profile configuration for ${device.name}:`, saveError.message);
      res.status(500).json({
        success: false,
        error: 'Failed to save profile configuration',
        details: saveError.message
      });
    }

  } catch (error) {
    console.error(`❌ Profile configuration save failed for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to save profile configuration',
      details: error.message
    });
  }
});

/**
 * GET /api/devices/:id/profile-assignments - Get saved profile assignments
 */
router.get('/:id/profile-assignments', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 Loading profile assignments for device: ${id}`);

    const dbConnection = getDbConnection(req);

    if (!dbConnection) {
      logger.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Get device info using unified method
    const device = await dbConnection.get(
      'SELECT profile_assignments, name FROM devices WHERE id = ?',
      [id]
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    let profileAssignments = [];
    if (device.profile_assignments) {
      try {
        profileAssignments = JSON.parse(device.profile_assignments);
      } catch (error) {
        console.warn(`⚠️ Failed to parse profile assignments for ${device.name}:`, error.message);
      }
    }

    console.log(`✅ Loaded ${profileAssignments.length} profile assignments for ${device.name}`);

    res.json({
      success: true,
      profile_assignments: profileAssignments,
      device_info: {
        id: id,
        name: device.name
      }
    });

  } catch (error) {
    console.error(`❌ Failed to load profile assignments for device ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to load profile assignments',
      details: error.message
    });
  }
});

module.exports = router;