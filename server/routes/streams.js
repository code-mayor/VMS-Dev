const express = require('express');
const router = express.Router();
const { HLSStreamingService } = require('../services/hls-streaming-service');
const { logger } = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// HLS streaming service instance
const hlsService = new HLSStreamingService();

/**
 * GET /api/streams - Get all active streams
 */
router.get('/', async (req, res) => {
  try {
    const activeStreams = hlsService.getActiveStreams();

    res.json({
      success: true,
      streams: activeStreams,
      total: activeStreams.length,
      active: activeStreams.filter(s => s.status === 'active').length,
      hlsDir: path.join(__dirname, '..', 'public', 'hls')
    });

  } catch (error) {
    logger.error('❌ Failed to get streams:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get streams',
      details: error.message
    });
  }
});

/**
 * GET /api/streams/:streamId - Get specific stream info
 */
router.get('/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    const activeStreams = hlsService.getActiveStreams();
    const stream = activeStreams.find(s => s.streamId === streamId);

    if (!stream) {
      return res.status(404).json({
        success: false,
        error: 'Stream not found'
      });
    }

    res.json({
      success: true,
      stream
    });

  } catch (error) {
    logger.error('❌ Failed to get stream info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stream info',
      details: error.message
    });
  }
});

/**
 * POST /api/streams/start-hls - Start HLS streaming for device
 */
router.post('/start-hls', async (req, res) => {
  try {
    const { deviceId, rtspUrl } = req.body;

    if (!deviceId || !rtspUrl) {
      return res.status(400).json({
        success: false,
        error: 'Device ID and RTSP URL are required'
      });
    }

    console.log(`🚀 Starting HLS stream for device: ${deviceId}`);
    console.log(`📡 RTSP URL: ${rtspUrl.replace(/:.*@/, ':***@')}`); // Mask credentials

    // Get database connection - supports both MySQL and SQLite
    // Get database adapter for unified database access
    const dbAdapter = req.app.get('dbAdapter');

    if (!dbAdapter) {
      return res.status(500).json({
        success: false,
        error: 'Database connection not available'
      });
    }

    // Query device from database using unified adapter method
    const device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [deviceId]);

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Start HLS stream
    const result = await hlsService.startStreaming(device);

    if (result.success) {
      res.json({
        success: true,
        streamUrl: result.playlistUrl,
        streamId: result.streamId,
        message: 'HLS stream started successfully'
      });
    } else {
      throw new Error(result.error || 'Failed to start HLS stream');
    }

  } catch (error) {
    console.error('❌ HLS stream start failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start HLS stream'
    });
  }
});

/**
 * POST /api/streams/stop-hls - Stop HLS streaming
 */
router.post('/stop-hls', async (req, res) => {
  try {
    const { deviceId, streamId } = req.body;

    if (!deviceId && !streamId) {
      return res.status(400).json({
        success: false,
        error: 'Device ID or Stream ID is required'
      });
    }

    console.log(`ℹ️ Stopping HLS stream for device: ${deviceId || streamId}`);

    // Stop HLS stream
    const result = await hlsService.stopStreaming(streamId || deviceId);

    res.json({
      success: true,
      message: 'HLS stream stopped successfully'
    });

  } catch (error) {
    console.error('❌ HLS stream stop failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to stop HLS stream'
    });
  }
});

/**
 * POST /api/streams/:deviceId/start - Start streaming for device
 */
router.post('/:deviceId/start', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { quality, profile } = req.body;

    // Get database connection
    const db = req.app.get('db');
    const dbAdapter = req.app.get('dbAdapter');

    // Get device from database
    let device;
    if (dbAdapter) {
      device = await dbAdapter.get('SELECT * FROM devices WHERE id = ?', [deviceId]);
    } else {
      device = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM devices WHERE id = ?', [deviceId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Check if device has RTSP credentials
    if (!device.rtsp_username || !device.rtsp_password) {
      return res.status(400).json({
        success: false,
        error: 'Device not authenticated - missing RTSP credentials'
      });
    }

    // Start the stream using HLS service
    const { HLSStreamingService } = require('../services/hls-streaming-service');
    const hlsService = new HLSStreamingService();

    const result = await hlsService.startStreaming(device);

    if (result.success) {
      res.json({
        success: true,
        streamId: result.streamId,
        url: result.url,
        message: 'Stream started successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to start stream',
        details: result.error || result.message
      });
    }

  } catch (error) {
    console.error('Stream start error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start streaming',
      details: error.message
    });
  }
});

/**
 * POST /api/streams/:streamId/stop - Stop streaming
 */
router.post('/:streamId/stop', async (req, res) => {
  try {
    const { streamId } = req.params;
    const result = await hlsService.stopStreaming(streamId);

    logger.info(`✅ Stopped streaming: ${streamId}`);
    res.json(result);

  } catch (error) {
    logger.error(`❌ Failed to stop streaming ${req.params.streamId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop streaming',
      details: error.message
    });
  }
});

/**
 * GET /api/streams/health - Streaming service health check
 */
router.get('/health', async (req, res) => {
  try {
    const activeStreams = hlsService.getActiveStreams();
    const hlsDir = path.join(__dirname, '..', 'public', 'hls');

    // Check if HLS directory exists and is writable
    let hlsStatus = 'ready';
    try {
      if (!fs.existsSync(hlsDir)) {
        fs.mkdirSync(hlsDir, { recursive: true });
      }

      // Test write access
      const testFile = path.join(hlsDir, 'write_test.tmp');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

    } catch (error) {
      hlsStatus = 'error';
      logger.error('❌ HLS directory not writable:', error.message);
    }

    res.json({
      success: true,
      status: 'healthy',
      activeStreams: activeStreams.length,
      hlsDirectory: hlsDir,
      hlsStatus,
      services: {
        ffmpeg: 'available', // We assume FFmpeg is available if we got this far
        hls: hlsStatus,
        recording: 'ready'
      }
    });

  } catch (error) {
    logger.error('❌ Streaming health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});

/**
 * GET /api/streams/:streamId/playlist - Get HLS playlist (redirect to static file)
 */
router.get('/:streamId/playlist', (req, res) => {
  try {
    const { streamId } = req.params;
    const playlistPath = `/hls/${streamId}/playlist.m3u8`;

    res.redirect(playlistPath);

  } catch (error) {
    logger.error('❌ Failed to serve playlist:', error);
    res.status(404).json({
      success: false,
      error: 'Playlist not found'
    });
  }
});

/**
 * POST /api/streams/test-rtsp - RTSP diagnostic route for debugging streaming issues
 */
router.post('/test-rtsp', async (req, res) => {
  try {
    const { rtspUrl, timeout = 15000, useSimpleCommand = false } = req.body;

    if (!rtspUrl) {
      return res.status(400).json({
        success: false,
        error: 'RTSP URL is required'
      });
    }

    console.log('🧪 RTSP diagnostic test requested');
    const maskedUrl = rtspUrl.replace(/\/\/.*:.*@/, '//***:***@');
    console.log(`🔍 Testing URL: ${maskedUrl}`);

    let validation;

    if (useSimpleCommand) {
      // Test with the exact same command that works manually
      validation = await testSimpleFFprobe(rtspUrl);
    } else {
      // Test the RTSP URL using our service
      validation = await hlsService.validateRTSPCredentials(rtspUrl, timeout);
    }

    console.log(`📊 RTSP test result: ${validation.valid ? 'SUCCESS' : 'FAILED'}`);

    res.json({
      success: true,
      rtspTest: {
        valid: validation.valid,
        error: validation.error || null,
        stderr: validation.stderr || null,
        exitCode: validation.exitCode || null,
        timeout: validation.timeout || false,
        method: useSimpleCommand ? 'simple-ffprobe' : 'service-validation'
      },
      maskedUrl,
      testDuration: timeout
    });

  } catch (error) {
    console.error('❌ RTSP diagnostic test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test RTSP URL'
    });
  }
});

/**
 * Test RTSP URL with simple FFprobe command (matches manual test)
 */
async function testSimpleFFprobe(rtspUrl) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');

    // Exact same command as manual test
    const ffprobeArgs = ['-rtsp_transport', 'tcp', '-i', rtspUrl];

    console.log(`🔧 Simple FFprobe test: ffprobe ${ffprobeArgs.join(' ').replace(rtspUrl, rtspUrl.replace(/\/\/.*:.*@/, '//***:***@'))}`);

    const ffprobeProcess = spawn('ffprobe', ffprobeArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    let stdout = '';

    ffprobeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(`📡 Simple FFprobe stderr: ${data.toString().trim()}`);
    });

    const timeout = setTimeout(() => {
      ffprobeProcess.kill('SIGTERM');
      resolve({
        valid: false,
        error: 'Simple FFprobe timeout',
        timeout: true
      });
    }, 15000);

    ffprobeProcess.on('close', (code) => {
      clearTimeout(timeout);

      console.log(`📊 Simple FFprobe exit code: ${code}`);

      // FFprobe reports stream info via stderr, so check for success indicators
      const hasStreamInfo = stderr.includes('Input #0') || stderr.includes('Stream #') || stderr.includes('Duration:');

      if (code === 0 || hasStreamInfo) {
        console.log('✅ Simple FFprobe validation successful');
        resolve({
          valid: true,
          stderr,
          stdout,
          exitCode: code,
          method: 'simple-ffprobe'
        });
      } else {
        console.log('❌ Simple FFprobe validation failed');
        resolve({
          valid: false,
          error: 'Simple FFprobe failed',
          stderr,
          stdout,
          exitCode: code
        });
      }
    });

    ffprobeProcess.on('error', (error) => {
      clearTimeout(timeout);
      console.error('❌ Simple FFprobe process error:', error);
      resolve({
        valid: false,
        error: `Simple FFprobe process error: ${error.message}`,
        processError: error.message
      });
    });
  });
}

/**
 * POST /api/streams/test-connectivity - Network connectivity test route
 */
router.post('/test-connectivity', async (req, res) => {
  try {
    const { ipAddress, port = 554 } = req.body;

    if (!ipAddress) {
      return res.status(400).json({
        success: false,
        error: 'IP address is required'
      });
    }

    console.log(`🌐 Network connectivity test: ${ipAddress}:${port}`);

    // Test network connectivity
    const connectivityTest = await hlsService.testDeviceConnectivity(ipAddress, port);

    console.log(`📊 Connectivity test result: ${connectivityTest.connected ? 'SUCCESS' : 'FAILED'}`);

    res.json({
      success: true,
      connectivity: connectivityTest,
      target: `${ipAddress}:${port}`
    });

  } catch (error) {
    console.error('❌ Connectivity test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test connectivity'
    });
  }
});

/**
 * POST /api/streams/cleanup - Force cleanup all HLS stream directories
 */
router.post('/cleanup', async (req, res) => {
  try {
    logger.info('🧹 Manual HLS cleanup requested');

    // Stop all active streams first
    const activeStreams = hlsService.getActiveStreams();
    logger.info(`ℹ️ Stopping ${activeStreams.length} active streams before cleanup`);

    for (const stream of activeStreams) {
      try {
        await hlsService.stopStreaming(stream.streamId);
        logger.info(`✅ Stopped stream: ${stream.streamId}`);
      } catch (stopError) {
        logger.warn(`⚠️ Failed to stop stream ${stream.streamId}: ${stopError.message}`);
      }
    }

    // Wait for streams to stop
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Force cleanup all directories
    hlsService.cleanupAllStreamDirectories();

    logger.info('✅ Manual HLS cleanup completed');

    res.json({
      success: true,
      message: 'HLS directories cleaned up successfully',
      stoppedStreams: activeStreams.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Manual HLS cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cleanup HLS directories'
    });
  }
});

/**
 * POST /api/streams/test-ffmpeg - Test FFmpeg command directly
 */
router.post('/test-ffmpeg', async (req, res) => {
  try {
    const { rtspUrl, duration = 5 } = req.body;

    if (!rtspUrl) {
      return res.status(400).json({
        success: false,
        error: 'RTSP URL is required'
      });
    }

    console.log('🧪 Direct FFmpeg test requested');
    const maskedUrl = rtspUrl.replace(/\/\/.*:.*@/, '//***:***@');
    console.log(`🔍 Testing FFmpeg command with: ${maskedUrl}`);

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    // Create test output directory
    const testDir = path.join(__dirname, '..', 'public', 'test_hls');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const playlistPath = path.join(testDir, 'test_playlist.m3u8');
    const segmentPath = path.join(testDir, 'test_segment%03d.ts');

    // Simple FFmpeg command that matches user's working test
    const ffmpegArgs = [
      '-y',
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-c:v', 'copy',
      '-c:a', 'copy',  // Changed from AAC transcoding to copy
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+independent_segments',
      '-hls_segment_filename', path.join(outputDir, 'segment%03d.ts'),
      '-hls_segment_type', 'mpegts',
      '-hls_allow_cache', '0',
      '-max_muxing_queue_size', '1024',  // Added to prevent buffer overflow
      '-vsync', '0',  // Added to handle timestamp issues
      path.join(outputDir, 'playlist.m3u8')
    ];

    console.log(`🔧 FFmpeg test command: ffmpeg ${ffmpegArgs.join(' ').replace(rtspUrl, maskedUrl)}`);

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let segmentsCreated = 0;

    ffmpegProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;

      // Count segments being created
      if (output.includes('Opening ') && output.includes('.ts')) {
        segmentsCreated++;
        console.log(`📹 Segment ${segmentsCreated} created`);
      }

      console.log(`📡 FFmpeg: ${output.trim()}`);
    });

    const testPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ffmpegProcess.kill('SIGTERM');
        reject(new Error('FFmpeg test timeout'));
      }, (duration + 10) * 1000);

      ffmpegProcess.on('close', (code) => {
        clearTimeout(timeout);

        // Check if playlist was created
        const playlistExists = fs.existsSync(playlistPath);
        let playlistContent = '';
        let segmentFiles = [];

        if (playlistExists) {
          playlistContent = fs.readFileSync(playlistPath, 'utf8');
          const files = fs.readdirSync(testDir);
          segmentFiles = files.filter(f => f.endsWith('.ts'));
        }

        resolve({
          success: code === 0 || segmentsCreated > 0,
          exitCode: code,
          segmentsCreated,
          playlistExists,
          segmentFiles: segmentFiles.length,
          playlistContent: playlistContent.substring(0, 500),
          stdout: stdout.substring(0, 500),
          stderr: stderr.substring(0, 1000)
        });
      });

      ffmpegProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    const result = await testPromise;

    console.log(`📊 FFmpeg test result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📹 Segments created: ${result.segmentsCreated}`);

    res.json({
      success: true,
      ffmpegTest: result,
      maskedUrl
    });

    // Cleanup test files
    setTimeout(() => {
      try {
        const files = fs.readdirSync(testDir);
        files.forEach(file => {
          fs.unlinkSync(path.join(testDir, file));
        });
        fs.rmdirSync(testDir);
        console.log('🧹 Cleaned up FFmpeg test files');
      } catch (error) {
        console.warn('⚠️ Cleanup warning:', error.message);
      }
    }, 5000);

  } catch (error) {
    console.error('❌ FFmpeg test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test FFmpeg'
    });
  }
});

module.exports = router;