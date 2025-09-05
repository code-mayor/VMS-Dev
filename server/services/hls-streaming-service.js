const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

class HLSStreamingService {
  constructor() {
    this.activeStreams = new Map();
    this.hlsOutputDir = path.join(__dirname, '..', 'public', 'hls');
    this.recordingDir = path.join(__dirname, '..', 'public', 'recordings');
    // Optimized segment configuration for 2-second segments (faster startup)
    this.segmentDuration = 2; // 2-second segments for faster HLS startup
    this.maxSegments = 10; // Keep 10 segments (20 seconds buffer)

    this.ensureDirectories();
  }

  ensureDirectories() {
    try {
      if (!fs.existsSync(this.hlsOutputDir)) {
        fs.mkdirSync(this.hlsOutputDir, { recursive: true, mode: 0o755 });
        logger.info(`📁 Created HLS output directory: ${this.hlsOutputDir}`);
      }

      if (!fs.existsSync(this.recordingDir)) {
        fs.mkdirSync(this.recordingDir, { recursive: true, mode: 0o755 });
        logger.info(`📁 Created recordings directory: ${this.recordingDir}`);
      }
    } catch (error) {
      logger.error('❌ Failed to create HLS directories:', error.message);
    }
  }

  /**
   * Validate RTSP credentials by testing connection - Ultra compatible version
   */
  async validateRTSPCredentials(rtspUrl, timeoutMs = 15000) {
    return new Promise((resolve) => {
      try {
        // Simple FFprobe arguments that match working manual command
        const ffprobeArgs = [
          '-rtsp_transport', 'tcp', // Use TCP for RTSP
          '-i', rtspUrl             // Input URL
        ];

        logger.info(`🧪 Testing RTSP URL with simplified ffprobe (${timeoutMs}ms timeout)`);

        // Development mode: Show the actual command and URL
        if (process.env.NODE_ENV === 'development') {
          const maskedUrl = rtspUrl.replace(/\/\/.*:.*@/, '//***:***@');
          logger.info(`🔍 DEV MODE - Testing: ${maskedUrl}`);
          logger.info(`🔍 DEV MODE - Actual URL: ${rtspUrl}`);
          logger.info(`🔍 DEV MODE - FFprobe command: ffprobe ${ffprobeArgs.join(' ').replace(rtspUrl, maskedUrl)}`);
        }

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
          // Real-time stderr logging for debugging
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔍 FFprobe stderr (real-time): ${data.toString().trim()}`);
          }
        });

        const timeout = setTimeout(() => {
          ffprobeProcess.kill('SIGTERM');
          resolve({
            valid: false,
            error: 'Connection timeout - device may be unreachable or credentials invalid',
            timeout: true
          });
        }, timeoutMs);

        ffprobeProcess.on('close', (code) => {
          clearTimeout(timeout);

          logger.info(`🔍 FFprobe exit code: ${code}`);
          if (stderr) {
            logger.info(`🔍 FFprobe stderr (first 800 chars): ${stderr.substring(0, 800)}`);
            // Look for specific success indicators in stderr
            if (stderr.includes('Input #0') || stderr.includes('Stream #')) {
              logger.info(`🎯 Found stream info in stderr - this indicates successful connection`);
            }
          }
          if (stdout) {
            logger.info(`🔍 FFprobe stdout: ${stdout.substring(0, 200)}`);
          }

          // For RTSP validation, code 0 means success
          // Also accept stderr containing stream info as success (FFprobe often reports info via stderr)
          if (code === 0 || (stderr && (stderr.includes('Input #0') || stderr.includes('Stream #') || stderr.includes('rtsp')))) {
            logger.info('✅ FFprobe validation successful');
            resolve({ valid: true });
          } else {
            let errorMessage = 'RTSP connection failed';

            // Parse stderr for specific error types
            const stderrLower = stderr.toLowerCase();

            if (stderrLower.includes('401') || stderrLower.includes('unauthorized')) {
              errorMessage = 'Authentication failed - incorrect username or password';
            } else if (stderrLower.includes('404') || stderrLower.includes('not found')) {
              errorMessage = 'Stream path not found - check profile/path in URL';
            } else if (stderrLower.includes('403') || stderrLower.includes('forbidden')) {
              errorMessage = 'Access forbidden - check user permissions';
            } else if (stderrLower.includes('connection refused')) {
              errorMessage = 'Connection refused - check IP address and port';
            } else if (stderrLower.includes('timeout') || stderrLower.includes('timed out')) {
              errorMessage = 'Connection timeout - device may be unreachable';
            } else if (stderrLower.includes('no route to host')) {
              errorMessage = 'No route to host - check network connectivity';
            } else if (stderrLower.includes('network is unreachable')) {
              errorMessage = 'Network unreachable - check network configuration';
            } else if (stderrLower.includes('invalid argument') || stderrLower.includes('invalid url')) {
              errorMessage = 'Invalid RTSP URL format';
            } else if (stderrLower.includes('rtsp') && stderrLower.includes('error')) {
              errorMessage = 'RTSP protocol error - check camera RTSP settings';
            } else if (stderrLower.includes('option not found')) {
              errorMessage = 'FFprobe configuration error - unsupported option';
            } else if (stderr.trim()) {
              // Use first meaningful line of stderr as error message
              const lines = stderr.split('\n').filter(line => line.trim());
              if (lines.length > 0) {
                errorMessage = lines[0].trim();
              }
            }

            logger.warn(`❌ FFprobe validation failed: ${errorMessage}`);

            resolve({
              valid: false,
              error: errorMessage,
              stderr: stderr.substring(0, 500),
              exitCode: code
            });
          }
        });

        ffprobeProcess.on('error', (error) => {
          clearTimeout(timeout);

          let errorMessage = 'FFprobe process error';

          if (error.code === 'ENOENT') {
            errorMessage = 'FFprobe not found - install FFmpeg';
          } else if (error.code === 'EACCES') {
            errorMessage = 'FFprobe permission denied';
          } else {
            errorMessage = `FFprobe process error: ${error.message}`;
          }

          logger.error(`❌ FFprobe process error: ${errorMessage}`);

          resolve({
            valid: false,
            error: errorMessage,
            processError: error.message
          });
        });

      } catch (error) {
        logger.error(`❌ FFprobe validation setup error: ${error.message}`);
        resolve({
          valid: false,
          error: `RTSP validation setup error: ${error.message}`
        });
      }
    });
  }

  /**
   * Start stream with custom configuration (used by new API endpoints)
   */
  async startStream(device, options = {}) {
    try {
      const { rtspUrl, username, password } = options;

      // Use provided RTSP URL or build one
      let finalRtspUrl = rtspUrl;

      if (!finalRtspUrl) {
        const rtspUrlResult = await this.getBestRTSPUrl(device);
        if (!rtspUrlResult.success) {
          throw new Error(rtspUrlResult.error);
        }
        finalRtspUrl = rtspUrlResult.url;
      }

      // Override device credentials with provided ones if available
      const deviceWithCredentials = {
        ...device,
        rtsp_username: username || device.rtsp_username,
        rtsp_password: password || device.rtsp_password
      };

      // Start streaming using the internal method
      const result = await this.startStreaming(deviceWithCredentials);

      return {
        success: true,
        streamId: result.streamId,
        playlistUrl: result.url,
        message: 'HLS stream started successfully'
      };

    } catch (error) {
      console.error(`❌ Failed to start stream for ${device.name}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build the EXACT working FFmpeg command from manual test with process-safe options
   */
  buildWorkingFFmpegCommand(rtspUrl, outputDir) {
    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment%03d.ts');

    // Robust transcoding that handles timing issues and audio
    return [
      '-y',
      '-rtsp_transport', 'tcp',
      '-fflags', '+genpts+discardcorrupt+igndts',
      '-use_wallclock_as_timestamps', '1',
      '-analyzeduration', '5000000',
      '-probesize', '5000000',
      '-max_delay', '5000000',
      '-i', rtspUrl,
      // Video transcoding with frame rate control
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-b:v', '1000k',
      '-maxrate', '1500k',
      '-bufsize', '2000k',
      '-pix_fmt', 'yuv420p',
      '-g', '30',
      // Fix frame duplication with vsync
      '-vsync', '1',  // Duplicate frames when needed for constant frame rate
      '-r', '25',     // Force output to 25fps
      // Audio - handle pcm_alaw
      // '-c:a', 'aac',
      // '-b:a', '64k',
      // '-ar', '22050',
      // '-ac', '1',
      '-an',  // No audio
      // Map streams with optional audio
      '-map', '0:v:0',
      '-map', '0:a:0?',
      // HLS output
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '3',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', segmentPattern,
      '-hls_segment_type', 'mpegts',
      '-start_number', '0',
      playlistPath
    ];
  }

  /**
   * Start HLS streaming using the working copy-based approach
   */
  async startStreaming(device) {
    try {
      // Ensure consistent stream ID format
      const streamId = device.id.includes('_hls')
        ? device.id
        : `${device.id}_hls`;

      // Clean up any existing stream directory first
      const streamDir = path.join(this.hlsOutputDir, streamId);
      if (fs.existsSync(streamDir)) {
        logger.info(`🧹 Cleaning up existing stream directory for fresh start: ${streamDir}`);
        try {
          this.cleanupStreamDirectory(streamDir);
          // Wait a moment for filesystem operations
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (cleanupError) {
          logger.warn(`⚠️ Failed to cleanup existing directory: ${cleanupError.message}`);
        }
      }

      if (this.activeStreams.has(streamId)) {
        logger.info(`🎥 HLS stream already active for ${device.name}, stopping first for clean restart`);
        await this.stopStreaming(streamId);
        // Wait for complete cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info(`🚀 Starting fresh HLS stream for ${device.name} at ${device.ip_address}`);

      // Get the best RTSP URL for streaming
      const rtspUrlResult = await this.getBestRTSPUrl(device);
      if (!rtspUrlResult.success) {
        throw new Error(rtspUrlResult.error);
      }

      const rtspUrl = rtspUrlResult.url;
      const maskedUrl = rtspUrl.replace(/\/\/.*:.*@/, '//***:***@');
      logger.info(`📡 Using validated RTSP URL: ${maskedUrl}`);

      // Create fresh HLS output directory for this stream 
      if (!fs.existsSync(streamDir)) {
        fs.mkdirSync(streamDir, { recursive: true, mode: 0o755 });
        logger.info(`📁 Created fresh stream directory: ${streamDir}`);
      }

      // Build the working command (matches manual test exactly)
      const ffmpegArgs = this.buildWorkingFFmpegCommand(rtspUrl, streamDir);
      const playlistPath = path.join(streamDir, 'playlist.m3u8');

      logger.info('🔧 Starting FFmpeg with transcoding (H.264/AAC output)');
      logger.info(`📝 FFmpeg command: ffmpeg ${ffmpegArgs.join(' ').replace(rtspUrl, maskedUrl)}`);

      // Critical fix: Proper process execution with explicit options to prevent hanging
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin to prevent blocking
        env: {
          ...process.env,
          FFREPORT: 'file=/tmp/ffmpeg-report.log:level=16' // Enable detailed logging
        },
        detached: false,  // Don't detach from parent process
        shell: false      // Don't use shell (direct execution)
      });

      let hasStartedSuccessfully = false;
      let outputReceived = false;

      // Handle FFmpeg process events with enhanced monitoring
      ffmpegProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        outputReceived = true;
        if (output) {
          logger.info(`📡 FFmpeg stdout: ${output}`);
        }
      });

      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        outputReceived = true;

        // Check for successful start indicators
        if (output.includes('Opening ') && output.includes('.ts')) {
          hasStartedSuccessfully = true;
          logger.info(`✅ FFmpeg started successfully - creating HLS segments`);
        }

        // Don't treat timestamp warnings as errors - they're NORMAL for this camera
        if (output.includes('Timestamps are unset') ||
          output.includes('Non-monotonic DTS') ||
          output.includes('duration 0') ||
          output.includes('Stream mapping') ||
          output.includes('Input #0') ||
          output.includes('Output #0') ||
          output.includes('Opening ')) {
          logger.info(`📡 FFmpeg (normal): ${output}`);
        } else if (output.toLowerCase().includes('error') &&
          !output.includes('Timestamps are unset') &&
          !output.includes('Non-monotonic DTS')) {
          logger.warn(`⚠️ FFmpeg stderr: ${output.substring(0, 300)}`);
        } else if (output.trim()) {
          logger.info(`📡 FFmpeg: ${output}`);
        }
      });

      ffmpegProcess.on('close', (code) => {
        logger.info(`🏁 FFmpeg process ended for ${device.name} with code ${code}`);
        this.activeStreams.delete(streamId);

        // Clean up stream directory only if it failed badly
        if (code !== 0 && code !== null) {
          try {
            this.cleanupStreamDirectory(streamDir);
          } catch (error) {
            logger.warn(`⚠️ Failed to cleanup stream directory: ${error.message}`);
          }
        }
      });

      ffmpegProcess.on('error', (error) => {
        logger.error(`❌ FFmpeg process error for ${device.name}:`, error.message);
        this.activeStreams.delete(streamId);
      });

      // Critical fix: Force FFmpeg to start by properly handling stdin
      try {
        // Close stdin immediately to prevent FFmpeg from waiting for input
        if (ffmpegProcess.stdin) {
          ffmpegProcess.stdin.end();
        }
      } catch (e) {
        // Ignore stdin errors - this is expected
        logger.info('📝 Stdin closed (expected for non-interactive mode)');
      }

      // Store stream info
      this.activeStreams.set(streamId, {
        device,
        process: ffmpegProcess,
        startTime: new Date(),
        rtspUrl,
        playlistPath,
        streamDir,
        status: 'starting'
      });

      // Wait for initial segments to be created with enhanced monitoring
      await this.waitForPlaylistWithProcessMonitoring(playlistPath, ffmpegProcess, 15000); // 15 seconds with process monitoring

      // Update stream status
      const streamInfo = this.activeStreams.get(streamId);
      if (streamInfo) {
        streamInfo.status = 'active';
        this.activeStreams.set(streamId, streamInfo);
      }

      logger.info(`✅ HLS stream started successfully for ${device.name}`);

      return {
        success: true,
        streamId,
        url: `/hls/${streamId}/playlist.m3u8`,
        playlistPath,
        message: 'HLS streaming started successfully'
      };

    } catch (error) {
      logger.error(`❌ Failed to start HLS streaming for ${device.name}:`, error.message);
      throw new Error(`HLS streaming failed: ${error.message}`);
    }
  }

  /**
   * Wait for HLS playlist with enhanced process monitoring
   */
  async waitForPlaylistWithProcessMonitoring(playlistPath, ffmpegProcess, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let segmentCount = 0;
      let segmentsSeen = 0;

      const checkPlaylist = () => {
        try {
          // Check if FFmpeg process is still running
          if (ffmpegProcess.killed || ffmpegProcess.exitCode !== null) {
            reject(new Error(`FFmpeg process ended unexpectedly (code: ${ffmpegProcess.exitCode})`));
            return;
          }

          // Check for playlist file
          if (fs.existsSync(playlistPath)) {
            const content = fs.readFileSync(playlistPath, 'utf8');

            // Check for valid playlist content
            if (content.includes('#EXTM3U')) {
              // Count segments in playlist
              const segments = content.split('\n').filter(line => line.endsWith('.ts'));
              segmentCount = segments.length;

              if (segmentCount >= 2) {
                logger.info(`📺 HLS playlist ready with ${segmentCount} segment(s)`);
                // Show created files
                try {
                  const streamDir = path.dirname(playlistPath);
                  const files = fs.readdirSync(streamDir);
                  logger.info(`📁 Created files: ${files.join(', ')}`);
                } catch (e) {
                  // Ignore file listing errors
                }
                resolve();
                return;
              }
            }
          }

          // Check for segment files even if playlist isn't ready yet
          try {
            const streamDir = path.dirname(playlistPath);
            if (fs.existsSync(streamDir)) {
              const files = fs.readdirSync(streamDir);
              const tsFiles = files.filter(f => f.endsWith('.ts'));
              if (tsFiles.length > segmentsSeen) {
                segmentsSeen = tsFiles.length;
                logger.info(`🎬 Found ${tsFiles.length} segment files: ${tsFiles.join(', ')}`);
              }
            }
          } catch (e) {
            // Directory might not exist yet
          }

          const elapsed = Date.now() - startTime;
          if (elapsed >= timeoutMs) {
            // Show FFmpeg report if available for debugging
            try {
              if (fs.existsSync('/tmp/ffmpeg-report.log')) {
                const report = fs.readFileSync('/tmp/ffmpeg-report.log', 'utf8');
                logger.info(`📋 FFmpeg report (last 500 chars): ${report.slice(-500)}`);
              }
            } catch (e) {
              // Ignore report read errors
            }

            reject(new Error(`Timeout waiting for HLS playlist after ${Math.round(elapsed / 1000)}s. Segments seen: ${segmentsSeen}`));
            return;
          }

          // Log progress every 2 seconds with more detail
          if (elapsed % 2000 < 500) {
            logger.info(`⏳ Still waiting for HLS playlist... ${Math.round(elapsed / 1000)}s elapsed (segments: ${segmentsSeen})`);

            // Show current directory contents for debugging
            try {
              const streamDir = path.dirname(playlistPath);
              if (fs.existsSync(streamDir)) {
                const files = fs.readdirSync(streamDir);
                if (files.length > 0) {
                  logger.info(`📁 Current files: ${files.join(', ')}`);
                } else {
                  logger.info(`📁 Directory is empty`);
                }
              }
            } catch (e) {
              logger.info(`📁 Cannot read directory: ${e.message}`);
            }
          }

          setTimeout(checkPlaylist, 500); // Check every 500ms

        } catch (error) {
          reject(new Error(`Failed to check HLS playlist: ${error.message}`));
        }
      };

      checkPlaylist();
    });
  }

  /**
   * Start HLS streaming with retry logic
   */
  async startStreamingWithRetry(device, maxRetries = 3, retryDelay = 2000) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`🔄 Starting streaming attempt ${attempt}/${maxRetries} for ${device.name}`);

        const result = await this.startStreaming(device);

        logger.info(`✅ Streaming started successfully on attempt ${attempt} for ${device.name}`);
        return result;

      } catch (error) {
        lastError = error;
        logger.warn(`⚠️ Streaming attempt ${attempt}/${maxRetries} failed for ${device.name}: ${error.message}`);

        if (attempt < maxRetries) {
          logger.info(`⏱️ Waiting ${retryDelay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    logger.error(`❌ All ${maxRetries} streaming attempts failed for ${device.name}`);
    throw lastError;
  }

  /**
   * Stop HLS streaming for a device
   */
  async stopStreaming(streamId) {
    try {
      const streamInfo = this.activeStreams.get(streamId);

      if (!streamInfo) {
        logger.warn(`⚠️ No active stream found for ID: ${streamId}`);
        return { success: false, message: 'Stream not found' };
      }

      logger.info(`🛑 Stopping HLS stream: ${streamId}`);

      // Terminate FFmpeg process
      if (streamInfo.process && !streamInfo.process.killed) {
        streamInfo.process.kill('SIGTERM');

        // Force kill after 5 seconds if graceful termination fails
        setTimeout(() => {
          if (!streamInfo.process.killed) {
            logger.warn(`⚠️ Force killing FFmpeg process for ${streamId}`);
            streamInfo.process.kill('SIGKILL');
          }
        }, 5000);
      }

      // Clean up stream directory
      if (streamInfo.streamDir && fs.existsSync(streamInfo.streamDir)) {
        this.cleanupStreamDirectory(streamInfo.streamDir);
      }

      // Remove from active streams
      this.activeStreams.delete(streamId);

      logger.info(`✅ HLS stream stopped: ${streamId}`);

      return {
        success: true,
        message: 'Stream stopped successfully'
      };

    } catch (error) {
      logger.error(`❌ Failed to stop HLS streaming for ${streamId}:`, error.message);
      return {
        success: false,
        message: `Failed to stop stream: ${error.message}`
      };
    }
  }

  /**
   * Comprehensive stream directory cleanup to prevent stale segments
   */
  cleanupStreamDirectory(streamDir) {
    try {
      if (!fs.existsSync(streamDir)) {
        logger.info(`📁 Directory doesn't exist, no cleanup needed: ${streamDir}`);
        return;
      }

      logger.info(`🧹 Cleaning up stream directory: ${streamDir}`);

      // Get all files in directory
      const files = fs.readdirSync(streamDir);
      logger.info(`📋 Found ${files.length} files to clean up: ${files.join(', ')}`);

      // Delete all files individually for better error handling
      let deletedFiles = 0;
      let errors = 0;

      files.forEach(file => {
        const filePath = path.join(streamDir, file);
        try {
          const stats = fs.statSync(filePath);
          fs.unlinkSync(filePath);
          deletedFiles++;
          logger.info(`🗑️ Deleted ${stats.isFile() ? 'file' : 'directory'}: ${file} (${stats.size} bytes)`);
        } catch (deleteError) {
          errors++;
          logger.warn(`⚠️ Failed to delete ${file}: ${deleteError.message}`);
        }
      });

      // Try to remove the directory itself if it's empty
      try {
        fs.rmdirSync(streamDir);
        logger.info(`📁 Removed empty stream directory: ${streamDir}`);
      } catch (dirError) {
        // Directory might not be empty or might not exist - this is fine
        logger.info(`📁 Directory cleanup note: ${dirError.message}`);
      }

      logger.info(`✅ Stream cleanup completed: ${deletedFiles} files deleted, ${errors} errors`);

    } catch (error) {
      logger.error(`❌ Failed to cleanup stream directory ${streamDir}: ${error.message}`);
    }
  }

  /**
   * Force cleanup all HLS directories (maintenance function)
   */
  cleanupAllStreamDirectories() {
    try {
      logger.info(`🧹 Starting comprehensive HLS directory cleanup...`);

      if (!fs.existsSync(this.hlsOutputDir)) {
        logger.info(`📁 HLS output directory doesn't exist: ${this.hlsOutputDir}`);
        return;
      }

      const directories = fs.readdirSync(this.hlsOutputDir);
      logger.info(`📋 Found ${directories.length} stream directories to check`);

      let cleanedDirs = 0;

      directories.forEach(dirName => {
        const dirPath = path.join(this.hlsOutputDir, dirName);
        const stats = fs.statSync(dirPath);

        if (stats.isDirectory()) {
          logger.info(`🔍 Checking directory: ${dirName}`);
          this.cleanupStreamDirectory(dirPath);
          cleanedDirs++;
        }
      });

      logger.info(`✅ Comprehensive cleanup completed: ${cleanedDirs} directories processed`);

    } catch (error) {
      logger.error(`❌ Failed to cleanup all stream directories: ${error.message}`);
    }
  }

  /**
   * Test basic network connectivity to device
   */
  async testDeviceConnectivity(ipAddress, port = 554) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          connected: false,
          error: `Connection timeout to ${ipAddress}:${port}`
        });
      }, 3000);

      socket.connect(port, ipAddress, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          connected: true,
          message: `Successfully connected to ${ipAddress}:${port}`
        });
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          connected: false,
          error: `Connection failed to ${ipAddress}:${port} - ${error.message}`
        });
      });
    });
  }

  /**
   * Get the best RTSP URL for a device with dynamic profile assignments
   */
  async getBestRTSPUrl(device) {
    // Check if device has RTSP credentials
    if (!device.rtsp_username || !device.rtsp_password) {
      logger.warn(`⚠️ Device ${device.name} missing RTSP credentials`);
      return {
        success: false,
        error: 'Missing RTSP credentials - please authenticate device first'
      };
    }

    const { ip_address, rtsp_username, rtsp_password } = device;

    // Clean and validate credentials
    const cleanUsername = String(rtsp_username).trim();
    const cleanPassword = String(rtsp_password).trim();

    if (!cleanUsername || !cleanPassword) {
      logger.error(`❌ Invalid RTSP credentials for ${device.name}: username="${cleanUsername}", password="${cleanPassword ? '[SET]' : '[EMPTY]'}"`);
      return {
        success: false,
        error: 'Invalid RTSP credentials format'
      };
    }

    logger.info(`🔧 Building dynamic RTSP URL for ${device.name}:`);
    logger.info(`   IP: ${ip_address}`);
    logger.info(`   Username: ${cleanUsername}`);

    // Development mode: Show actual password for debugging
    if (process.env.NODE_ENV === 'development') {
      logger.info(`   Password (DEV MODE): ${cleanPassword || '[EMPTY]'}`);
    } else {
      logger.info(`   Password: ${cleanPassword ? '[***]' : '[EMPTY]'}`);
    }

    // Build RTSP URL with proper credential encoding
    let encodedUsername = cleanUsername;
    let encodedPassword = cleanPassword;

    // Only encode if contains special characters that would break URL parsing
    if (cleanUsername.includes('@') || cleanUsername.includes(':') || cleanUsername.includes('/')) {
      encodedUsername = encodeURIComponent(cleanUsername);
    }
    if (cleanPassword.includes('@') || cleanPassword.includes(':') || cleanPassword.includes('/')) {
      encodedPassword = encodeURIComponent(cleanPassword);
    }

    const rtspUrls = [];

    // PRIORITY 1: Use configured profile assignments if available
    if (device.profile_assignments) {
      try {
        const profileAssignments = JSON.parse(device.profile_assignments);
        const enabledAssignments = profileAssignments.filter(assignment => assignment.enabled);

        // Sort by priority (higher priority first)
        enabledAssignments.sort((a, b) => b.priority - a.priority);

        logger.info(`📋 Found ${enabledAssignments.length} configured profile assignment(s)`);

        // Add main stream profile first
        const mainStreamProfile = enabledAssignments.find(assignment => assignment.usage === 'main-stream');
        if (mainStreamProfile) {
          const profileUrl = this.buildProfileRtspUrl(encodedUsername, encodedPassword, ip_address, mainStreamProfile);
          if (profileUrl) {
            rtspUrls.push(profileUrl);
            logger.info(`🎯 Added main stream profile: ${mainStreamProfile.profileName}`);
          }
        }

        // Add other configured profiles
        enabledAssignments.forEach(assignment => {
          if (assignment.usage !== 'main-stream') {
            const profileUrl = this.buildProfileRtspUrl(encodedUsername, encodedPassword, ip_address, assignment);
            if (profileUrl && !rtspUrls.includes(profileUrl)) {
              rtspUrls.push(profileUrl);
              logger.info(`📹 Added ${assignment.usage} profile: ${assignment.profileName}`);
            }
          }
        });

      } catch (error) {
        logger.warn(`⚠️ Failed to parse profile assignments for ${device.name}: ${error.message}`);
      }
    }

    // PRIORITY 2: Use ONVIF discovered profiles if available and no assignments configured
    if (rtspUrls.length === 0 && device.onvif_profiles) {
      try {
        const profiles = JSON.parse(device.onvif_profiles);
        profiles.forEach(profile => {
          if (profile.url && profile.type === 'rtsp') {
            // Properly inject credentials into ONVIF profile URLs, avoiding duplication
            let profileUrl = profile.url;

            // Remove any existing credentials from the URL first
            profileUrl = profileUrl.replace(/rtsp:\/\/[^@]*@/, 'rtsp://');

            // Now inject our credentials
            profileUrl = profileUrl.replace('rtsp://', `rtsp://${encodedUsername}:${encodedPassword}@`);

            rtspUrls.push(profileUrl);
            logger.info(`🔍 Added ONVIF discovered profile: ${profile.name || 'Unknown'}`);
          }
        });
      } catch (error) {
        logger.warn(`⚠️ Failed to parse ONVIF profiles for ${device.name}: ${error.message}`);
      }
    }

    // PRIORITY 3: Fallback to common RTSP URL patterns if no configuration available
    if (rtspUrls.length === 0) {
      logger.info(`⚠️ No configured profiles found, using fallback RTSP patterns`);
      const fallbackUrls = [
        `rtsp://${encodedUsername}:${encodedPassword}@${ip_address}:554/profile1`,
        `rtsp://${encodedUsername}:${encodedPassword}@${ip_address}:554/profile2`,
        `rtsp://${encodedUsername}:${encodedPassword}@${ip_address}:554/stream1`,
        `rtsp://${encodedUsername}:${encodedPassword}@${ip_address}:554/stream2`,
        `rtsp://${encodedUsername}:${encodedPassword}@${ip_address}:554/main`,
        `rtsp://${encodedUsername}:${encodedPassword}@${ip_address}:554/sub`,
        `rtsp://${encodedUsername}:${encodedPassword}@${ip_address}:554/`
      ];

      // Add fallback URLs
      fallbackUrls.forEach(url => {
        if (!rtspUrls.includes(url)) {
          rtspUrls.push(url);
        }
      });

      logger.info(`🔍 Added ${fallbackUrls.length} fallback RTSP patterns`);
    }

    // Test connectivity first
    logger.info(`🌐 Testing network connectivity to ${ip_address}:554...`);
    const connectivityTest = await this.testDeviceConnectivity(ip_address, 554);

    if (!connectivityTest.connected) {
      logger.error(`❌ Network connectivity test failed: ${connectivityTest.error}`);
      return {
        success: false,
        error: `Network connectivity failed: ${connectivityTest.error}`
      };
    }

    logger.info(`✅ Network connectivity test passed: ${connectivityTest.message}`);

    // Test each RTSP URL until we find a working one
    logger.info(`🔍 Testing ${rtspUrls.length} RTSP URL(s) for ${device.name}...`);

    for (let i = 0; i < rtspUrls.length; i++) {
      const rtspUrl = rtspUrls[i];
      const maskedUrl = rtspUrl.replace(/\/\/.*:.*@/, '//***:***@');

      logger.info(`   ${i + 1}/${rtspUrls.length}: Testing ${maskedUrl}`);

      // Development mode: Show actual URL for debugging
      if (process.env.NODE_ENV === 'development') {
        logger.info(`   DEV MODE - Full URL: ${rtspUrl}`);
      }

      const validation = await this.validateRTSPCredentials(rtspUrl, 25000);

      if (validation.valid) {
        logger.info(`✅ RTSP URL validated successfully: ${maskedUrl}`);
        return {
          success: true,
          url: rtspUrl,
          message: `RTSP connection successful using ${maskedUrl}`
        };
      } else {
        logger.warn(`❌ RTSP URL failed: ${maskedUrl} - ${validation.error}`);

        // Continue to next URL unless it's a critical auth error
        if (validation.error && validation.error.includes('Authentication failed')) {
          logger.error(`🔒 Authentication failed - credentials may be invalid`);
          // Still continue to try other patterns in case auth is path-specific
        }
      }

      // Brief pause between tests to avoid overwhelming the device
      if (i < rtspUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // All URLs failed
    logger.error(`❌ All ${rtspUrls.length} RTSP URL(s) failed for ${device.name}`);
    return {
      success: false,
      error: `No working RTSP URL found. Tested ${rtspUrls.length} patterns. Check device credentials and network connectivity.`
    };
  }

  buildProfileRtspUrl(username, password, ipAddress, assignment) {
    try {
      if (!assignment.rtspPath && !assignment.profilePath) {
        return null;
      }

      const path = assignment.rtspPath || assignment.profilePath;
      const cleanPath = path.startsWith('/') ? path : `/${path}`;

      return `rtsp://${username}:${password}@${ipAddress}:554${cleanPath}`;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get active stream info
   */
  getStreamInfo(streamId) {
    return this.activeStreams.get(streamId) || null;
  }

  /**
   * Test profile connectivity (for ProfileManagementDialog)
   */
  async testProfileConnectivity(device, profile) {
    try {
      logger.info(`🧪 Testing profile connectivity: ${profile.name || profile.token}`);

      // Build RTSP URL for this specific profile
      const rtspCredentials = device.rtsp_username && device.rtsp_password
        ? `${device.rtsp_username}:${encodeURIComponent(device.rtsp_password)}@`
        : '';

      // Use profile-specific streaming URI if available, otherwise construct URL
      let rtspUrl;
      if (profile.video_profiles && profile.video_profiles[0] && profile.video_profiles[0].streaming_uri) {
        rtspUrl = profile.video_profiles[0].streaming_uri;
        // Add credentials if not already present
        if (rtspCredentials && !rtspUrl.includes('@')) {
          rtspUrl = rtspUrl.replace('rtsp://', `rtsp://${rtspCredentials}`);
        }
      } else {
        // Construct URL using profile token/path
        const profilePath = profile.profile_path || profile.token || 'profile1';
        rtspUrl = `rtsp://${rtspCredentials}${device.ip_address}:554/${profilePath}`;
      }

      // Test the RTSP connection
      const validationResult = await this.validateRTSPCredentials(rtspUrl, 10000);

      if (validationResult.valid) {
        return {
          connectivity: true,
          quality_detected: profile.video_profiles?.[0]?.resolution || 'Unknown',
          latency: 150, // Estimated latency
          audio_available: profile.audio_supported || false,
          video_available: true,
          codec_detected: profile.video_profiles?.[0]?.codec || 'H.264',
          rtsp_url_tested: rtspUrl.replace(/:\/\/.*:.*@/, '://***:***@')
        };
      } else {
        return {
          connectivity: false,
          errors: [validationResult.error || 'Connection failed'],
          rtsp_url_tested: rtspUrl.replace(/:\/\/.*:.*@/, '://***:***@')
        };
      }

    } catch (error) {
      logger.error(`❌ Profile connectivity test failed:`, error);
      return {
        connectivity: false,
        errors: [error.message || 'Test failed']
      };
    }
  }

  /**
   * Get all active streams
   */
  getAllActiveStreams() {
    const streams = [];
    for (const [streamId, streamInfo] of this.activeStreams) {
      streams.push({
        streamId,
        deviceName: streamInfo.device.name,
        deviceId: streamInfo.device.id,
        startTime: streamInfo.startTime,
        status: streamInfo.status,
        audioDisabled: streamInfo.audioDisabled || false
      });
    }
    return streams;
  }

  /**
   * Get stream status for all active streams
   */
  getStreamStatus() {
    const status = [];

    for (const [streamId, streamInfo] of this.activeStreams.entries()) {
      const uptime = Date.now() - streamInfo.startTime.getTime();

      status.push({
        streamId,
        deviceName: streamInfo.device.name,
        deviceIp: streamInfo.device.ip_address,
        status: streamInfo.status,
        uptime: Math.round(uptime / 1000), // seconds
        playlistUrl: `/hls/${streamId}/playlist.m3u8`,
        audioDisabled: streamInfo.audioDisabled || false
      });
    }

    return {
      activeStreams: status.length,
      streams: status,
      hlsOutputDir: this.hlsOutputDir
    };
  }

  /**
   * Check if stream is active
   */
  isStreamActive(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return false;

    // Check if process is still running
    if (stream.process.killed || stream.process.exitCode !== null) {
      this.activeStreams.delete(streamId);
      return false;
    }

    // Check if playlist exists and is recent
    if (fs.existsSync(stream.playlistPath)) {
      const stats = fs.statSync(stream.playlistPath);
      const age = Date.now() - stats.mtime.getTime();
      return age < 10000; // Active if updated in last 10 seconds
    }

    return false;
  }

  /**
   * Get all active streams for external access
   */
  getActiveStreams() {
    return this.getAllActiveStreams();
  }

  /**
   * Cleanup all streams on shutdown
   */
  async cleanup() {
    logger.info(`🧹 Cleaning up ${this.activeStreams.size} active streams...`);

    const promises = Array.from(this.activeStreams.keys()).map(streamId =>
      this.stopStreaming(streamId)
    );

    await Promise.all(promises);
    logger.info(`✅ All streams cleaned up`);
  }
}

module.exports = { HLSStreamingService };