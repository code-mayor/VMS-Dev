interface HLSStreamConfig {
  deviceId: string
  profileToken: string
  rtspUrl: string
  username?: string
  password?: string
  segmentDuration: number
  playlistLength: number
  outputPath: string
  quality: 'low' | 'medium' | 'high' | 'auto'
}

interface HLSStreamStatus {
  isActive: boolean
  segmentsGenerated: number
  lastSegmentTime: Date | null
  playlistUrl: string
  error?: string
}

interface StreamingOptions {
  videoCodec: string
  audioCodec: string
  videoBitrate: string
  audioBitrate: string
  resolution: string
  frameRate: number
}

export class HLSStreamingService {
  private activeStreams: Map<string, HLSStreamStatus> = new Map()
  private streamProcesses: Map<string, any> = new Map()
  private baseUrl: string
  private outputDirectory: string

  constructor(baseUrl: string = 'http://localhost:3001', outputDirectory: string = '/hls') {
    this.baseUrl = baseUrl
    this.outputDirectory = outputDirectory
  }

  /**
   * Start HLS streaming for a device profile
   */
  async startHLSStream(config: HLSStreamConfig): Promise<{ success: boolean; playlistUrl?: string; error?: string }> {
    const streamId = `${config.deviceId}-${config.profileToken}`
    
    try {
      console.log(`🎬 Starting HLS stream for device ${config.deviceId}, profile ${config.profileToken}`)

      // Check if stream is already active
      if (this.activeStreams.has(streamId)) {
        const existingStream = this.activeStreams.get(streamId)!
        if (existingStream.isActive) {
          console.log(`📺 Stream ${streamId} is already active`)
          return {
            success: true,
            playlistUrl: existingStream.playlistUrl
          }
        }
      }

      // Validate RTSP URL
      if (!this.isValidRtspUrl(config.rtspUrl)) {
        throw new Error(`Invalid RTSP URL: ${config.rtspUrl}`)
      }

      // Create output directory
      const streamOutputPath = `${this.outputDirectory}/${streamId}`
      await this.ensureDirectoryExists(streamOutputPath)

      // Get streaming options based on quality
      const streamingOptions = this.getStreamingOptions(config.quality)

      // Start FFmpeg process for HLS generation
      const success = await this.startFFmpegProcess(streamId, config, streamingOptions, streamOutputPath)

      if (success) {
        const playlistUrl = `${this.baseUrl}/hls/${streamId}/playlist.m3u8`
        
        this.activeStreams.set(streamId, {
          isActive: true,
          segmentsGenerated: 0,
          lastSegmentTime: new Date(),
          playlistUrl
        })

        console.log(`✅ HLS stream started: ${playlistUrl}`)
        
        return {
          success: true,
          playlistUrl
        }
      } else {
        throw new Error('Failed to start FFmpeg process')
      }

    } catch (error) {
      console.error(`❌ Failed to start HLS stream for ${streamId}:`, error)
      
      this.activeStreams.set(streamId, {
        isActive: false,
        segmentsGenerated: 0,
        lastSegmentTime: null,
        playlistUrl: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Stop HLS streaming for a device profile
   */
  async stopHLSStream(deviceId: string, profileToken: string): Promise<boolean> {
    const streamId = `${deviceId}-${profileToken}`
    
    try {
      console.log(`⏹️ Stopping HLS stream: ${streamId}`)

      // Stop FFmpeg process
      const process = this.streamProcesses.get(streamId)
      if (process) {
        process.kill('SIGTERM')
        this.streamProcesses.delete(streamId)
      }

      // Update stream status
      const streamStatus = this.activeStreams.get(streamId)
      if (streamStatus) {
        streamStatus.isActive = false
        this.activeStreams.set(streamId, streamStatus)
      }

      // Clean up old segments (keep last 10 segments)
      await this.cleanupOldSegments(streamId, 10)

      console.log(`✅ HLS stream stopped: ${streamId}`)
      return true

    } catch (error) {
      console.error(`❌ Failed to stop HLS stream ${streamId}:`, error)
      return false
    }
  }

  /**
   * Get stream status
   */
  getStreamStatus(deviceId: string, profileToken: string): HLSStreamStatus | null {
    const streamId = `${deviceId}-${profileToken}`
    return this.activeStreams.get(streamId) || null
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): { [streamId: string]: HLSStreamStatus } {
    const activeStreams: { [streamId: string]: HLSStreamStatus } = {}
    
    for (const [streamId, status] of this.activeStreams.entries()) {
      if (status.isActive) {
        activeStreams[streamId] = status
      }
    }

    return activeStreams
  }

  /**
   * Auto-start HLS streaming when device credentials are added
   */
  async autoStartStreaming(device: any, profiles: any[]): Promise<{ [profileToken: string]: string }> {
    const playlistUrls: { [profileToken: string]: string } = {}

    console.log(`🚀 Auto-starting HLS streams for device: ${device.name}`)

    for (const profile of profiles) {
      if (profile.streamingOptions?.rtsp) {
        try {
          const config: HLSStreamConfig = {
            deviceId: device.id,
            profileToken: profile.token,
            rtspUrl: profile.streamingOptions.rtsp,
            username: device.username,
            password: device.password,
            segmentDuration: 6, // 6 second segments
            playlistLength: 5,  // Keep 5 segments in playlist
            outputPath: `${this.outputDirectory}/${device.id}-${profile.token}`,
            quality: 'medium'
          }

          const result = await this.startHLSStream(config)
          
          if (result.success && result.playlistUrl) {
            playlistUrls[profile.token] = result.playlistUrl
            console.log(`✅ Auto-started HLS for profile ${profile.token}`)
          }

        } catch (error) {
          console.warn(`⚠️ Failed to auto-start HLS for profile ${profile.token}:`, error)
        }
      }
    }

    return playlistUrls
  }

  /**
   * Start FFmpeg process for HLS conversion
   */
  private async startFFmpegProcess(
    streamId: string,
    config: HLSStreamConfig,
    options: StreamingOptions,
    outputPath: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Build RTSP URL with authentication
        let rtspUrl = config.rtspUrl
        if (config.username && config.password) {
          rtspUrl = rtspUrl.replace('rtsp://', `rtsp://${config.username}:${config.password}@`)
        }

        // FFmpeg command for HLS generation
        const ffmpegArgs = [
          '-y',  // Overwrite output files
          '-i', rtspUrl,  // Input RTSP stream
          '-c:v', options.videoCodec,  // Video codec
          '-c:a', options.audioCodec,  // Audio codec
          '-b:v', options.videoBitrate,  // Video bitrate
          '-b:a', options.audioBitrate,  // Audio bitrate
          '-s', options.resolution,  // Resolution
          '-r', options.frameRate.toString(),  // Frame rate
          '-g', (options.frameRate * 2).toString(),  // GOP size
          '-preset', 'ultrafast',  // Encoding preset for low latency
          '-tune', 'zerolatency',  // Tune for zero latency
          '-f', 'hls',  // Output format
          '-hls_time', config.segmentDuration.toString(),  // Segment duration
          '-hls_list_size', config.playlistLength.toString(),  // Playlist length
          '-hls_flags', 'delete_segments',  // Delete old segments
          '-hls_segment_filename', `${outputPath}/segment_%03d.ts`,  // Segment filename pattern
          `${outputPath}/playlist.m3u8`  // Playlist filename
        ]

        console.log('🔧 Starting FFmpeg with command:', 'ffmpeg', ffmpegArgs.join(' '))

        // Send request to backend to start FFmpeg process
        fetch('/api/streams/start-hls', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            streamId,
            rtspUrl,
            outputPath,
            ffmpegArgs,
            config
          })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            console.log(`✅ FFmpeg process started for stream ${streamId}`)
            resolve(true)
          } else {
            console.error(`❌ Failed to start FFmpeg process: ${data.error}`)
            resolve(false)
          }
        })
        .catch(error => {
          console.error(`❌ Error starting FFmpeg process:`, error)
          resolve(false)
        })

      } catch (error) {
        console.error(`❌ Error setting up FFmpeg process:`, error)
        resolve(false)
      }
    })
  }

  /**
   * Get streaming options based on quality setting
   */
  private getStreamingOptions(quality: string): StreamingOptions {
    const options = {
      low: {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoBitrate: '500k',
        audioBitrate: '64k',
        resolution: '640x480',
        frameRate: 15
      },
      medium: {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoBitrate: '1500k',
        audioBitrate: '128k',
        resolution: '1280x720',
        frameRate: 25
      },
      high: {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoBitrate: '3000k',
        audioBitrate: '192k',
        resolution: '1920x1080',
        frameRate: 30
      },
      auto: {
        videoCodec: 'copy',  // Copy original codec if possible
        audioCodec: 'copy',
        videoBitrate: '2000k',
        audioBitrate: '128k',
        resolution: '1280x720',
        frameRate: 25
      }
    }

    return options[quality as keyof typeof options] || options.medium
  }

  /**
   * Validate RTSP URL format
   */
  private isValidRtspUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url)
      return parsedUrl.protocol === 'rtsp:'
    } catch {
      return false
    }
  }

  /**
   * Ensure directory exists (simulated - actual implementation would be in backend)
   */
  private async ensureDirectoryExists(path: string): Promise<void> {
    // This would be handled by the backend
    console.log(`📁 Ensuring directory exists: ${path}`)
  }

  /**
   * Clean up old segment files
   */
  private async cleanupOldSegments(streamId: string, keepSegments: number): Promise<void> {
    try {
      await fetch('/api/streams/cleanup-segments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          streamId,
          keepSegments
        })
      })
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup segments for ${streamId}:`, error)
    }
  }

  /**
   * Generate HLS playlist manually (for testing)
   */
  generateTestPlaylist(streamId: string, segments: string[]): string {
    const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
${segments.map((segment, index) => 
  `#EXTINF:6.0,\n${segment}`
).join('\n')}
#EXT-X-ENDLIST`

    return playlist
  }

  /**
   * Stop all active streams
   */
  async stopAllStreams(): Promise<void> {
    console.log('🛑 Stopping all active HLS streams')
    
    const stopPromises = Array.from(this.activeStreams.keys()).map(streamId => {
      const [deviceId, profileToken] = streamId.split('-')
      return this.stopHLSStream(deviceId, profileToken)
    })

    await Promise.all(stopPromises)
    console.log('✅ All HLS streams stopped')
  }
}

// Singleton instance
export const hlsStreamingService = new HLSStreamingService()

// Helper functions for React components
export const startDeviceStreaming = async (device: any, profiles: any[]) => {
  return await hlsStreamingService.autoStartStreaming(device, profiles)
}

export const stopDeviceStreaming = async (deviceId: string, profileToken: string) => {
  return await hlsStreamingService.stopHLSStream(deviceId, profileToken)
}

export const getStreamingStatus = (deviceId: string, profileToken: string) => {
  return hlsStreamingService.getStreamStatus(deviceId, profileToken)
}