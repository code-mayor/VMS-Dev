interface RecordingChunk {
  id: string
  deviceId: string
  profileToken: string
  filename: string
  startTime: Date
  endTime: Date
  duration: number
  fileSize: number
  filePath: string
  status: 'recording' | 'completed' | 'failed' | 'processing'
  chunkIndex: number
}

interface RecordingSession {
  sessionId: string
  deviceId: string
  profileToken: string
  rtspUrl: string
  username?: string
  password?: string
  isActive: boolean
  startTime: Date
  endTime?: Date
  chunks: RecordingChunk[]
  totalChunks: number
  recordingType: 'continuous' | 'motion' | 'manual'
  quality: 'low' | 'medium' | 'high'
}

interface ChunkRecordingConfig {
  deviceId: string
  profileToken: string
  rtspUrl: string
  username?: string
  password?: string
  chunkDuration: number // in milliseconds (15000 = 15 seconds)
  maxChunks?: number // maximum chunks to keep (for storage management)
  recordingType: 'continuous' | 'motion' | 'manual'
  quality: 'low' | 'medium' | 'high'
  outputDirectory?: string
}

export class ChunkedRecordingService {
  private activeSessions: Map<string, RecordingSession> = new Map()
  private chunkTimers: Map<string, NodeJS.Timeout> = new Map()
  private readonly DEFAULT_CHUNK_DURATION = 15000 // 15 seconds
  private readonly DEFAULT_MAX_CHUNKS = 240 // 1 hour of 15-second chunks
  private baseUrl: string
  private outputDirectory: string

  constructor(baseUrl: string = 'http://localhost:3001', outputDirectory: string = '/recordings') {
    this.baseUrl = baseUrl
    this.outputDirectory = outputDirectory
  }

  /**
   * Start chunked recording for a device
   */
  async startChunkedRecording(config: ChunkRecordingConfig): Promise<{ 
    success: boolean 
    sessionId?: string 
    error?: string 
  }> {
    const sessionId = `rec_${config.deviceId}_${config.profileToken}_${Date.now()}`
    
    try {
      console.log(`🎥 Starting chunked recording for device ${config.deviceId}, profile ${config.profileToken}`)

      // Check if recording is already active for this device/profile
      const existingSessionId = this.findActiveSession(config.deviceId, config.profileToken)
      if (existingSessionId) {
        console.log(`📹 Recording already active for device ${config.deviceId}, profile ${config.profileToken}`)
        return {
          success: true,
          sessionId: existingSessionId
        }
      }

      // Create recording session
      const session: RecordingSession = {
        sessionId,
        deviceId: config.deviceId,
        profileToken: config.profileToken,
        rtspUrl: config.rtspUrl,
        username: config.username,
        password: config.password,
        isActive: true,
        startTime: new Date(),
        chunks: [],
        totalChunks: 0,
        recordingType: config.recordingType,
        quality: config.quality
      }

      this.activeSessions.set(sessionId, session)

      // Start the first chunk immediately
      await this.startNewChunk(sessionId, config)

      // Set up recurring timer for chunk rotation
      const chunkTimer = setInterval(async () => {
        if (this.activeSessions.has(sessionId)) {
          await this.rotateChunk(sessionId, config)
        } else {
          clearInterval(chunkTimer)
          this.chunkTimers.delete(sessionId)
        }
      }, config.chunkDuration || this.DEFAULT_CHUNK_DURATION)

      this.chunkTimers.set(sessionId, chunkTimer)

      console.log(`✅ Chunked recording started: ${sessionId}`)
      return {
        success: true,
        sessionId
      }

    } catch (error) {
      console.error(`❌ Failed to start chunked recording:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Stop chunked recording
   */
  async stopChunkedRecording(sessionId: string): Promise<boolean> {
    try {
      console.log(`⏹️ Stopping chunked recording: ${sessionId}`)

      const session = this.activeSessions.get(sessionId)
      if (!session) {
        console.warn(`⚠️ Recording session not found: ${sessionId}`)
        return false
      }

      // Stop timer
      const timer = this.chunkTimers.get(sessionId)
      if (timer) {
        clearInterval(timer)
        this.chunkTimers.delete(sessionId)
      }

      // Stop current chunk
      await this.stopCurrentChunk(sessionId)

      // Update session
      session.isActive = false
      session.endTime = new Date()
      this.activeSessions.set(sessionId, session)

      // Notify backend to stop recording process
      await this.notifyBackendStopRecording(sessionId)

      console.log(`✅ Chunked recording stopped: ${sessionId}`)
      return true

    } catch (error) {
      console.error(`❌ Failed to stop chunked recording ${sessionId}:`, error)
      return false
    }
  }

  /**
   * Start a new recording chunk
   */
  private async startNewChunk(sessionId: string, config: ChunkRecordingConfig): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    const chunkId = `chunk_${sessionId}_${session.totalChunks.toString().padStart(4, '0')}`
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${config.deviceId}_${config.profileToken}_${timestamp}.mp4`
    const filePath = `${this.outputDirectory}/${config.deviceId}/${filename}`

    const chunk: RecordingChunk = {
      id: chunkId,
      deviceId: config.deviceId,
      profileToken: config.profileToken,
      filename,
      startTime: new Date(),
      endTime: new Date(),
      duration: config.chunkDuration || this.DEFAULT_CHUNK_DURATION,
      fileSize: 0,
      filePath,
      status: 'recording',
      chunkIndex: session.totalChunks
    }

    // Start FFmpeg recording process for this chunk
    const recordingStarted = await this.startFFmpegRecording(chunk, config)
    
    if (recordingStarted) {
      session.chunks.push(chunk)
      session.totalChunks++
      this.activeSessions.set(sessionId, session)

      console.log(`🎬 Started recording chunk: ${chunkId}`)
    } else {
      chunk.status = 'failed'
      console.error(`❌ Failed to start chunk recording: ${chunkId}`)
    }
  }

  /**
   * Rotate to a new chunk (stop current, start new)
   */
  private async rotateChunk(sessionId: string, config: ChunkRecordingConfig): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session || !session.isActive) return

    // Stop current chunk
    await this.stopCurrentChunk(sessionId)

    // Start new chunk
    await this.startNewChunk(sessionId, config)

    // Clean up old chunks if necessary
    await this.cleanupOldChunks(sessionId, config.maxChunks || this.DEFAULT_MAX_CHUNKS)
  }

  /**
   * Stop current recording chunk
   */
  private async stopCurrentChunk(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    // Find the current recording chunk
    const currentChunk = session.chunks.find(chunk => chunk.status === 'recording')
    if (currentChunk) {
      currentChunk.endTime = new Date()
      currentChunk.status = 'processing'

      // Notify backend to finalize chunk
      await this.finalizeChunk(currentChunk)

      console.log(`✅ Chunk recording stopped: ${currentChunk.id}`)
    }
  }

  /**
   * Start FFmpeg recording process for a chunk
   */
  private async startFFmpegRecording(chunk: RecordingChunk, config: ChunkRecordingConfig): Promise<boolean> {
    try {
      // Build RTSP URL with authentication
      let rtspUrl = config.rtspUrl
      if (config.username && config.password) {
        rtspUrl = rtspUrl.replace('rtsp://', `rtsp://${config.username}:${config.password}@`)
      }

      // Get quality settings
      const qualitySettings = this.getQualitySettings(config.quality)

      const response = await fetch('/api/recordings/start-chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chunkId: chunk.id,
          rtspUrl,
          outputPath: chunk.filePath,
          duration: chunk.duration / 1000, // Convert to seconds
          qualitySettings,
          config: {
            videoCodec: qualitySettings.videoCodec,
            audioCodec: qualitySettings.audioCodec,
            videoBitrate: qualitySettings.videoBitrate,
            audioBitrate: qualitySettings.audioBitrate,
            resolution: qualitySettings.resolution,
            frameRate: qualitySettings.frameRate
          }
        })
      })

      const result = await response.json()
      return result.success

    } catch (error) {
      console.error(`❌ Failed to start FFmpeg recording:`, error)
      return false
    }
  }

  /**
   * Finalize a recording chunk
   */
  private async finalizeChunk(chunk: RecordingChunk): Promise<void> {
    try {
      const response = await fetch('/api/recordings/finalize-chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chunkId: chunk.id,
          filePath: chunk.filePath
        })
      })

      const result = await response.json()
      
      if (result.success) {
        chunk.status = 'completed'
        chunk.fileSize = result.fileSize || 0
        console.log(`✅ Chunk finalized: ${chunk.id} (${chunk.fileSize} bytes)`)
      } else {
        chunk.status = 'failed'
        console.error(`❌ Failed to finalize chunk: ${chunk.id}`)
      }

    } catch (error) {
      console.error(`❌ Error finalizing chunk:`, error)
      chunk.status = 'failed'
    }
  }

  /**
   * Clean up old chunks to manage storage
   */
  private async cleanupOldChunks(sessionId: string, maxChunks: number): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    if (session.chunks.length > maxChunks) {
      const chunksToRemove = session.chunks.slice(0, session.chunks.length - maxChunks)
      
      for (const chunk of chunksToRemove) {
        await this.deleteChunk(chunk)
      }

      session.chunks = session.chunks.slice(chunksToRemove.length)
      this.activeSessions.set(sessionId, session)

      console.log(`🗑️ Cleaned up ${chunksToRemove.length} old chunks for session ${sessionId}`)
    }
  }

  /**
   * Delete a recording chunk
   */
  private async deleteChunk(chunk: RecordingChunk): Promise<void> {
    try {
      await fetch('/api/recordings/delete-chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chunkId: chunk.id,
          filePath: chunk.filePath
        })
      })

      console.log(`🗑️ Deleted chunk: ${chunk.id}`)

    } catch (error) {
      console.warn(`⚠️ Failed to delete chunk ${chunk.id}:`, error)
    }
  }

  /**
   * Get quality settings based on quality level
   */
  private getQualitySettings(quality: string) {
    const settings = {
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
        videoBitrate: '4000k',
        audioBitrate: '192k',
        resolution: '1920x1080',
        frameRate: 30
      }
    }

    return settings[quality as keyof typeof settings] || settings.medium
  }

  /**
   * Find active recording session for device/profile
   */
  private findActiveSession(deviceId: string, profileToken: string): string | null {
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.deviceId === deviceId && 
          session.profileToken === profileToken && 
          session.isActive) {
        return sessionId
      }
    }
    return null
  }

  /**
   * Notify backend to stop recording process
   */
  private async notifyBackendStopRecording(sessionId: string): Promise<void> {
    try {
      await fetch('/api/recordings/stop-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId })
      })
    } catch (error) {
      console.warn(`⚠️ Failed to notify backend about recording stop:`, error)
    }
  }

  /**
   * Get recording session status
   */
  getRecordingStatus(sessionId: string): RecordingSession | null {
    return this.activeSessions.get(sessionId) || null
  }

  /**
   * Get all active recording sessions
   */
  getActiveRecordings(): { [sessionId: string]: RecordingSession } {
    const activeRecordings: { [sessionId: string]: RecordingSession } = {}
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.isActive) {
        activeRecordings[sessionId] = session
      }
    }

    return activeRecordings
  }

  /**
   * Get recording chunks for a session
   */
  getRecordingChunks(sessionId: string): RecordingChunk[] {
    const session = this.activeSessions.get(sessionId)
    return session ? session.chunks : []
  }

  /**
   * Auto-start recording when device is authenticated
   */
  async autoStartRecording(device: any, profiles: any[]): Promise<{ [profileToken: string]: string }> {
    const recordingSessionIds: { [profileToken: string]: string } = {}

    console.log(`🚀 Auto-starting chunked recording for device: ${device.name}`)

    for (const profile of profiles) {
      if (profile.streamingOptions?.rtsp) {
        try {
          const config: ChunkRecordingConfig = {
            deviceId: device.id,
            profileToken: profile.token,
            rtspUrl: profile.streamingOptions.rtsp,
            username: device.username,
            password: device.password,
            chunkDuration: this.DEFAULT_CHUNK_DURATION,
            maxChunks: this.DEFAULT_MAX_CHUNKS,
            recordingType: 'continuous',
            quality: 'medium'
          }

          const result = await this.startChunkedRecording(config)
          
          if (result.success && result.sessionId) {
            recordingSessionIds[profile.token] = result.sessionId
            console.log(`✅ Auto-started recording for profile ${profile.token}`)
          }

        } catch (error) {
          console.warn(`⚠️ Failed to auto-start recording for profile ${profile.token}:`, error)
        }
      }
    }

    return recordingSessionIds
  }

  /**
   * Stop all active recordings
   */
  async stopAllRecordings(): Promise<void> {
    console.log('🛑 Stopping all active recordings')
    
    const stopPromises = Array.from(this.activeSessions.keys())
      .filter(sessionId => this.activeSessions.get(sessionId)?.isActive)
      .map(sessionId => this.stopChunkedRecording(sessionId))

    await Promise.all(stopPromises)
    console.log('✅ All recordings stopped')
  }
}

// Singleton instance
export const chunkedRecordingService = new ChunkedRecordingService()

// Helper functions for React components
export const startDeviceRecording = async (device: any, profiles: any[]) => {
  return await chunkedRecordingService.autoStartRecording(device, profiles)
}

export const stopDeviceRecording = async (sessionId: string) => {
  return await chunkedRecordingService.stopChunkedRecording(sessionId)
}

export const getRecordingStatus = (sessionId: string) => {
  return chunkedRecordingService.getRecordingStatus(sessionId)
}