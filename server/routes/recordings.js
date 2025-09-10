const express = require('express')
const path = require('path')
const fs = require('fs')
const ffmpegManager = require('../utils/ffmpeg-manager')
const { spawn } = require('child_process')
const { v4: uuidv4 } = require('uuid')
const router = express.Router()

// FFmpeg processes for active recordings
const ffmpegProcesses = new Map() // recordingId -> process

// Auto-recording settings with persistence
const AUTO_RECORDING_CONFIG_PATH = path.join(__dirname, '..', 'data', 'auto-recording-settings.json')

// Ensure data directory exists
const dataDir = path.dirname(AUTO_RECORDING_CONFIG_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
  console.log(`📁 Created data directory: ${dataDir}`)
}

// Ensure recordings directory exists with proper validation
const RECORDINGS_DIR = path.join(__dirname, '..', 'public', 'recordings')
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true })
  console.log(`📁 Created recordings directory: ${RECORDINGS_DIR}`)
}

// Directory validation function
const ensureRecordingsDirectory = async () => {
  try {
    // Check if directory exists
    if (!fs.existsSync(RECORDINGS_DIR)) {
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true, mode: 0o755 })
      console.log(`📁 Created recordings directory: ${RECORDINGS_DIR}`)
    }

    // Verify write permissions
    fs.accessSync(RECORDINGS_DIR, fs.constants.W_OK)
    console.log(`✅ Recordings directory validated: ${RECORDINGS_DIR}`)
    return { success: true, path: RECORDINGS_DIR }
  } catch (error) {
    console.error(`❌ Recordings directory error: ${error.message}`)
    return {
      success: false,
      error: error.message,
      path: RECORDINGS_DIR
    }
  }
}

// Initialize directory on module load
ensureRecordingsDirectory()

// Load auto-recording settings
function loadAutoRecordingSettings() {
  try {
    if (fs.existsSync(AUTO_RECORDING_CONFIG_PATH)) {
      const data = fs.readFileSync(AUTO_RECORDING_CONFIG_PATH, 'utf8')
      const settings = JSON.parse(data)
      console.log('📋 Loaded settings from file:', settings)

      // CRITICAL: Validate loaded settings
      if (typeof settings.enabled !== 'boolean') {
        settings.enabled = false; // Default to disabled
      }

      return settings
    }
  } catch (error) {
    console.warn('⚠️ Could not load settings:', error.message)
  }

  // Return safe defaults - everything disabled
  const defaultSettings = {
    enabled: false,  // MUST be false by default
    chunkDuration: 1,
    quality: 'medium',
    maxStorage: 30,
    retentionPeriod: 1,
    enabledDevices: []
  }

  console.log('📋 No settings file - using safe defaults (disabled)')
  return defaultSettings
}

// Single GET endpoint that preserves user settings while ensuring type safety
router.get('/auto-settings', (req, res) => {
  // Load settings if not already loaded
  if (!autoRecordingSettings) {
    autoRecordingSettings = loadAutoRecordingSettings()
  }

  // Type validation WITHOUT changing user values
  const validatedSettings = {
    // Preserve user's enabled choice - just ensure it's a boolean
    enabled: Boolean(autoRecordingSettings.enabled),

    // Preserve user's values - only use defaults if value is null/undefined
    chunkDuration: autoRecordingSettings.chunkDuration ?? 1,
    quality: autoRecordingSettings.quality || 'medium',
    maxStorage: autoRecordingSettings.maxStorage ?? 10,
    retentionPeriod: autoRecordingSettings.retentionPeriod ?? 1,

    // Ensure enabledDevices is an array
    enabledDevices: Array.isArray(autoRecordingSettings.enabledDevices)
      ? autoRecordingSettings.enabledDevices
      : []
  }

  console.log('📖 Returning auto-recording settings:', validatedSettings)
  res.json(validatedSettings)
})

// Save auto-recording settings
function saveAutoRecordingSettings(settings) {
  try {
    const data = JSON.stringify(settings, null, 2)
    fs.writeFileSync(AUTO_RECORDING_CONFIG_PATH, data, 'utf8')
    console.log('💾 Saved auto-recording settings to file:', settings)
    return true
  } catch (error) {
    console.error('❌ Failed to save auto-recording settings:', error)
    return false
  }
}

// Initialize auto-recording settings
let autoRecordingSettings = loadAutoRecordingSettings()

let activeRecordings = new Map() // deviceId -> recordingInfo
let recordingTimers = new Map() // deviceId -> timer

// Helper function
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Helper to get device by ID from MySQL database
async function getDeviceById(deviceId, dbConnection) {
  const query = `
    SELECT 
      id, 
      name, 
      ip_address as ip,
      rtsp_username,
      rtsp_password,
      status
    FROM devices 
    WHERE id = ?
  `
  const device = await dbConnection.get(query, [deviceId])

  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  if (!device.rtsp_username || !device.rtsp_password) {
    throw new Error(`Device ${deviceId} (${device.name}) missing RTSP credentials`);
  }

  return {
    id: device.id,
    name: device.name || `Device ${deviceId}`,
    ip: device.ip,
    rtsp_username: device.rtsp_username,
    rtsp_password: device.rtsp_password,
    status: device.status
  };
}

// Check if auto-recording is enabled for device
function isAutoRecordingEnabled(deviceId) {
  return autoRecordingSettings.enabled && autoRecordingSettings.enabledDevices.includes(deviceId)
}

// Save recording metadata to MySQL database
async function saveRecordingMetadata(recording, dbConnection) {
  try {
    const query = `
      INSERT INTO recordings (
        id, device_id, filename, file_path, duration, file_size,
        recording_type, start_time, end_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `

    await dbConnection.run(query, [
      recording.id,
      recording.deviceId,
      recording.filename,
      recording.path,
      recording.duration,
      recording.size,
      recording.type || 'manual',
      recording.startTime,
      recording.endTime
    ])

    console.log(`💾 Saved recording metadata to MySQL: ${recording.id}`)
    return true
  } catch (error) {
    console.error(`❌ Failed to save recording metadata: ${recording.id}`, error)
    return false
  }
}

async function startAutoRecording(deviceId, chunkDuration, dbConnection) {
  try {
    // Validate directory
    const dirCheck = await ensureRecordingsDirectory()
    if (!dirCheck.success) {
      throw new Error(`Recordings directory not accessible: ${dirCheck.error}`)
    }

    console.log(`🎬 Starting ${chunkDuration}min auto-recording chunk for device: ${deviceId}`)

    const device = await getDeviceById(deviceId, dbConnection)
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`)
    }

    // Generate recording ID
    const recordingId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `auto_${deviceId}_${timestamp}.mp4`
    const outputPath = path.resolve(RECORDINGS_DIR, filename)

    // Build RTSP URL
    const rtspUrl = `rtsp://${encodeURIComponent(device.rtsp_username)}:${encodeURIComponent(device.rtsp_password)}@${device.ip}:554/profile1`

    console.log(`📁 Output: ${outputPath}`)
    console.log(`🔑 Recording ID: ${recordingId}`)

    // FFmpeg args - FIXED for proper MP4 recording without corruption
    const ffmpegArgs = [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-c:v', 'copy',           // Copy video codec
      '-an',                     // No audio to prevent codec issues
      '-t', (chunkDuration * 60).toString(), // Duration in seconds
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof', // Important for streaming MP4
      '-y',
      outputPath
    ]

    console.log(`🔧 Starting FFmpeg with ${chunkDuration} minute duration`)

    // Start FFmpeg process
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    // Store recording info
    const recordingInfo = {
      process: ffmpegProcess,
      deviceId,
      recordingId,
      outputPath,
      filename,
      startTime: new Date(),
      duration: chunkDuration * 60,
      type: 'auto',
      pid: ffmpegProcess.pid
    }

    activeRecordings.set(recordingId, recordingInfo)
    ffmpegProcesses.set(recordingId, ffmpegProcess)

    // Save to database
    const startTime = new Date()
    await saveRecordingMetadata({
      id: recordingId.substring(0, 36),
      deviceId,
      filename,
      path: `/recordings/${filename}`,
      size: 0,
      duration: 0,
      startTime,
      endTime: null,
      type: 'auto',
      status: 'recording'
    }, dbConnection)

    // Handle process exit - schedule next chunk IMMEDIATELY
    ffmpegProcess.on('exit', async (code, signal) => {
      console.log(`🛑 Chunk ended for ${deviceId}: code=${code}, signal=${signal}`)

      // Update database
      try {
        const stats = await fs.promises.stat(outputPath).catch(() => ({ size: 0 }))
        const endTime = new Date()
        const actualDuration = Math.floor((endTime - startTime) / 1000)

        await dbConnection.run(
          `UPDATE recordings 
           SET end_time = ?, file_size = ?, duration = ?
           WHERE id = ?`,
          [endTime, stats.size, actualDuration, recordingId.substring(0, 36)]
        )

        console.log(`✅ Chunk saved: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
      } catch (error) {
        console.error(`❌ Failed to update recording: ${error.message}`)
      }

      activeRecordings.delete(recordingId)
      ffmpegProcesses.delete(recordingId)

      // IMMEDIATELY start next chunk if still enabled (no gap!)
      if (isAutoRecordingEnabled(deviceId)) {
        console.log(`🔄 Starting next chunk immediately for ${deviceId}`)
        // No delay - start immediately for continuous recording
        startAutoRecording(deviceId, chunkDuration, dbConnection)
      }
    })

    // Monitor stderr for errors but don't spam logs
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString()
      if (output.includes('Error') || output.includes('Invalid')) {
        console.error(`FFmpeg error for ${deviceId}: ${output}`)
      }
    })

    console.log(`✅ Auto-recording chunk started: ${recordingId}`)
    return recordingId

  } catch (error) {
    console.error(`💥 Auto-recording failed for ${deviceId}:`, error)
    throw error
  }
}

// CRITICAL FIX: User's TESTED Working FFmpeg command - prevents buffer overflow - RECORDS IN AVI!
function startFFmpegRecordingFixed(deviceId, outputPath, recording, dbConnection) {
  try {
    console.log('🎬 Starting AVI recording with USER-TESTED working FFmpeg commands for device:', deviceId)

    // Get device details from recording object or use defaults
    const rtspUsername = recording.rtsp_username || 'test'
    const rtspPassword = recording.rtsp_password || 'Test@123'
    const deviceIp = recording.ip || '192.168.226.201'

    const rtspUrl = `rtsp://${rtspUsername}:${rtspPassword}@${deviceIp}:554/profile1`

    console.log('📁 Final output path:', outputPath)
    console.log('📡 RTSP URL:', rtspUrl.replace(/(:[\w@]+@)/, ':***@'))

    // Calculate duration in seconds for 4-minute chunks
    const durationSeconds = autoRecordingSettings.chunkDuration * 60

    console.log('🔧 Building USER-TESTED working FFmpeg command (prevents buffer overflow) - AVI FORMAT')

    const command = [
      'ffmpeg',
      '-rtsp_transport', 'tcp',
      '-fflags', '+genpts',
      '-avoid_negative_ts', 'make_zero',
      '-analyzeduration', '10000000',
      '-probesize', '10000000',
      '-rw_timeout', '30000000',
      '-i', rtspUrl,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-t', durationSeconds.toString(),
      '-f', 'avi',
      '-threads', '2',
      '-y',
      outputPath
    ]

    console.log('🔧 USER-TESTED Working FFmpeg command (AVI):', command.join(' ').replace(rtspUrl, rtspUrl.replace(/(:[\w@]+@)/, ':***@')))

    const process = spawn(command[0], command.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    // Store process for tracking
    ffmpegProcesses.set(recording.id, process)

    console.log('✅ FFmpeg process started with PID:', process.pid)

    // Handle process events
    process.stderr.on('data', (data) => {
      const output = data.toString()
      // Only log errors, not normal progress to avoid spam
      if (output.includes('error') || output.includes('Error') || output.includes('failed')) {
        console.log('⚠️ FFmpeg stderr:', output.trim())
      }
    })

    process.on('close', async (code) => {
      console.log(`🛑 FFmpeg process ended for ${deviceId} with code ${code}`)
      ffmpegProcesses.delete(recording.id)

      // Update recording status in database
      if (activeRecordings.has(deviceId)) {
        const recordingInfo = activeRecordings.get(deviceId)
        const endTime = new Date()

        // Calculate file size
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath)
          const duration = Math.floor((endTime - new Date(recordingInfo.recording.startTime)) / 1000)

          // Update recording in MySQL database
          const updateQuery = `
            UPDATE recordings 
            SET end_time = ?, file_size = ?, duration = ?
            WHERE id = ?
          `

          try {
            await dbConnection.run(updateQuery, [
              endTime,
              stats.size,
              duration,
              recording.id
            ])

            console.log(`📊 AVI Recording completed: ${stats.size} bytes, ${duration} seconds`)
          } catch (error) {
            console.error('Error updating recording in database:', error)
          }
        } else {
          console.log('❌ Recording file not found after FFmpeg completion')
        }

        activeRecordings.delete(deviceId)
      }
    })

    process.on('error', (error) => {
      console.error('❌ FFmpeg process error:', error)
      ffmpegProcesses.delete(recording.id)
      if (activeRecordings.has(deviceId)) {
        activeRecordings.delete(deviceId)
      }
    })

    return true

  } catch (error) {
    console.error('❌ Failed to start FFmpeg recording:', error)
    return false
  }
}

// Legacy function name mapping
const startFFmpegRecording = startFFmpegRecordingFixed

async function stopRecording(recordingId, dbConnection) {
  try {
    console.log(`🛑 Stopping recording: ${recordingId}`)

    // Find the recording in database
    const query = `SELECT * FROM recordings WHERE id = ?`
    const recording = await dbConnection.get(query, [recordingId])

    if (!recording) {
      return { success: false, error: 'Recording not found' }
    }

    // Find active recording info
    const deviceEntry = Array.from(activeRecordings.entries())
      .find(([deviceId, info]) => info.recordingId === recordingId)

    if (!deviceEntry) {
      return { success: false, error: 'Active recording not found' }
    }

    const [deviceId, recordingInfo] = deviceEntry

    // Stop FFmpeg process
    const process = ffmpegProcesses.get(recordingId)
    if (process) {
      console.log('🛑 Terminating FFmpeg process...')
      process.kill('SIGTERM')

      // Force kill after 5 seconds if not terminated
      setTimeout(() => {
        if (ffmpegProcesses.has(recordingId)) {
          console.log('🔥 Force killing FFmpeg process')
          process.kill('SIGKILL')
          ffmpegProcesses.delete(recordingId)
        }
      }, 5000)
    }

    // Update recording in database
    const endTime = new Date()
    const startTime = new Date(recording.start_time)
    const duration = Math.floor((endTime - startTime) / 1000)

    // Check file size
    const filePath = path.join(RECORDINGS_DIR, recording.filename)
    let fileSize = 0
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      fileSize = stats.size
      console.log(`📊 Final recording: ${stats.size} bytes, ${duration} seconds`)
    } else {
      console.log('⚠️ Recording file not found')
    }

    // Update database
    const updateQuery = `
      UPDATE recordings 
      SET end_time = ?, duration = ?, file_size = ?
      WHERE id = ?
    `
    await dbConnection.run(updateQuery, [endTime, duration, fileSize, recordingId])

    // Remove from active recordings
    activeRecordings.delete(deviceId)

    console.log(`✅ Recording stopped: ${recordingId}`)

    return {
      success: true,
      message: 'Recording stopped successfully',
      recording: {
        ...recording,
        endTime,
        duration,
        size: fileSize,
        status: 'completed'
      }
    }

  } catch (error) {
    console.error('❌ Error stopping recording:', error)
    return {
      success: false,
      error: 'Failed to stop recording',
      details: error.message
    }
  }
}

function startAutoRecordingsForDevices(deviceIds, dbConnection) {
  console.log('🎬 Starting continuous auto-recordings for devices:', deviceIds)

  // Clear any existing timers
  recordingTimers.forEach((timer, deviceId) => {
    clearInterval(timer)
  })
  recordingTimers.clear()

  deviceIds.forEach(async (deviceId) => {
    try {
      // Check if device exists and is available
      const device = await getDeviceById(deviceId, dbConnection)
      if (!device) {
        console.warn(`⚠️ Device ${deviceId} not found, skipping`)
        return
      }

      // Start first chunk immediately
      console.log(`🎬 Starting continuous recording for ${device.name}`)
      await startAutoRecording(deviceId, autoRecordingSettings.chunkDuration, dbConnection)

    } catch (error) {
      console.error(`❌ Failed to start auto-recording for ${deviceId}:`, error)
    }
  })
}

function stopAllAutoRecordings(dbConnection) {
  console.log('ℹ️ Stopping all auto-recordings...')

  recordingTimers.forEach((timer, deviceId) => {
    console.log(`🛑 Clearing timer for device: ${deviceId}`)
    clearInterval(timer)
  })
  recordingTimers.clear()

  const autoRecordings = Array.from(activeRecordings.entries())
    .filter(([deviceId, info]) => info.type === 'auto')

  autoRecordings.forEach(async ([deviceId, info]) => {
    console.log(`🛑 Stopping auto-recording for device: ${deviceId}`)
    await stopRecording(info.recordingId, dbConnection)
  })

  console.log(`✅ Stopped ${autoRecordings.length} auto-recordings`)
}

// Routes
router.get('/storage-info', async (req, res) => {
  try {
    const dbConnection = req.app.get('dbConnection')
    const dbType = req.app.get('dbType') || 'sqlite'

    // Ensure settings are loaded
    if (!autoRecordingSettings) {
      autoRecordingSettings = loadAutoRecordingSettings()
    }

    const dirStatus = await ensureRecordingsDirectory()

    const stats = await dbConnection.get(`
      SELECT 
        COUNT(*) as totalRecordings,
        COALESCE(SUM(file_size), 0) as totalSize
      FROM recordings
      WHERE file_size > 0
    `) || { totalRecordings: 0, totalSize: 0 }

    let recentStats = { count: 0 }
    try {
      if (dbType === 'mysql') {
        recentStats = await dbConnection.get(`
          SELECT COUNT(*) as count
          FROM recordings
          WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
        `) || { count: 0 }
      } else {
        recentStats = await dbConnection.get(`
          SELECT COUNT(*) as count
          FROM recordings
          WHERE datetime(created_at) > datetime('now', '-1 day')
        `) || { count: 0 }
      }
    } catch (e) {
      console.warn('Could not get recent stats:', e.message)
    }

    const maxStorage = autoRecordingSettings.maxStorage || 30
    const maxStorageBytes = maxStorage * 1024 * 1024 * 1024
    const totalSize = parseInt(stats.totalSize) || 0
    const usagePercentage = totalSize > 0 && maxStorageBytes > 0
      ? (totalSize / maxStorageBytes) * 100
      : 0

    res.json({
      totalRecordings: parseInt(stats.totalRecordings) || 0,
      totalSize: totalSize,
      totalSizeFormatted: formatFileSize(totalSize),
      maxStorage: maxStorage,
      usagePercentage: Math.min(usagePercentage, 100),
      freeSpace: Math.max(maxStorageBytes - totalSize, 0),
      freeSpaceFormatted: formatFileSize(Math.max(maxStorageBytes - totalSize, 0)),
      recentRecordings: parseInt(recentStats.count) || 0,
      autoRecordingEnabled: autoRecordingSettings.enabled || false,
      enabledDevices: autoRecordingSettings.enabledDevices?.length || 0,
      directoryStatus: dirStatus
    })
  } catch (error) {
    console.error('❌ Storage info error:', error)
    res.json({
      totalRecordings: 0,
      totalSize: 0,
      totalSizeFormatted: '0 Bytes',
      maxStorage: 30,
      usagePercentage: 0,
      freeSpace: 30 * 1024 * 1024 * 1024,
      freeSpaceFormatted: '30 GB',
      recentRecordings: 0,
      autoRecordingEnabled: false,
      enabledDevices: 0,
      directoryStatus: { success: false }
    })
  }
})

// router.get('/auto-settings', (req, res) => {
//   res.json(autoRecordingSettings)
// })

router.put('/auto-settings', async (req, res) => {
  try {
    const dbConnection = req.app.get('dbConnection')

    // Get settings from request body
    let newSettings = req.body

    console.log('📥 Received settings update:', newSettings)

    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ error: 'Settings required' })
    }

    // Validate and ensure all fields
    const validatedSettings = {
      enabled: Boolean(newSettings.enabled),
      chunkDuration: parseInt(newSettings.chunkDuration) || 4,
      quality: newSettings.quality || 'medium',
      maxStorage: parseInt(newSettings.maxStorage) || 30,
      retentionPeriod: parseInt(newSettings.retentionPeriod) || 2,
      enabledDevices: Array.isArray(newSettings.enabledDevices) ? newSettings.enabledDevices : []
    }

    console.log('✅ Validated settings:', validatedSettings)

    // Store previous state
    const previousSettings = { ...autoRecordingSettings }

    // Update global settings FIRST
    autoRecordingSettings = validatedSettings

    // Save to file IMMEDIATELY
    const saved = saveAutoRecordingSettings(autoRecordingSettings)
    if (!saved) {
      throw new Error('Failed to save settings to file')
    }

    // Stop all recordings if settings changed
    if (previousSettings.enabled !== validatedSettings.enabled ||
      previousSettings.chunkDuration !== validatedSettings.chunkDuration ||
      JSON.stringify(previousSettings.enabledDevices) !== JSON.stringify(validatedSettings.enabledDevices)) {

      console.log('🛑 Settings changed, restarting auto-recordings...')
      stopAllAutoRecordings(dbConnection)

      // Start new recordings if enabled
      if (validatedSettings.enabled && validatedSettings.enabledDevices.length > 0) {
        console.log('🎬 Starting auto-recordings with new settings')
        setTimeout(() => {
          startAutoRecordingsForDevices(validatedSettings.enabledDevices, dbConnection)
        }, 1000)
      }
    }

    console.log('✅ Settings saved and applied:', autoRecordingSettings)
    res.json(autoRecordingSettings)

  } catch (error) {
    console.error('❌ Error updating settings:', error)
    res.status(500).json({
      error: 'Failed to update settings',
      details: error.message
    })
  }
})

router.post('/start', async (req, res) => {
  try {
    const { deviceId, duration = 300, quality = 'medium', type = 'manual' } = req.body
    const dbConnection = req.app.get('dbConnection')

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' })
    }

    // Check for existing recording
    const existingRecording = Array.from(activeRecordings.values())
      .find(r => r.deviceId === deviceId)

    if (existingRecording) {
      return res.status(400).json({
        error: 'Device is already recording',
        recordingId: existingRecording.recordingId
      })
    }

    const device = await getDeviceById(deviceId, dbConnection)
    const recordingId = uuidv4().substring(0, 36)
    const startTime = new Date()
    const filename = `manual_${deviceId}_${startTime.toISOString().replace(/[:.]/g, '-')}.mp4`
    const outputPath = path.join(RECORDINGS_DIR, filename)

    // Build RTSP URL
    const rtspUrl = `rtsp://${device.rtsp_username}:${device.rtsp_password}@${device.ip}:554/profile1`

    // Start FFmpeg with audio disabled
    const ffmpegArgs = [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-c:v', 'copy',
      '-an',  // No audio
      '-t', duration.toString(),
      '-f', 'mp4',
      '-y', outputPath
    ]

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs)

    // Save to database
    await saveRecordingMetadata({
      id: recordingId,
      deviceId,
      filename,
      path: `/recordings/${filename}`,
      size: 0,
      duration: 0,
      startTime,
      endTime: null,
      type: 'manual',
      status: 'recording'
    }, dbConnection)

    activeRecordings.set(recordingId, {
      recordingId,
      deviceId,
      process: ffmpegProcess,
      startTime: startTime.toISOString(),
      type: 'manual'
    })

    // Auto-stop after duration
    if (duration > 0) {
      setTimeout(() => {
        stopRecording(recordingId, dbConnection)
      }, duration * 1000)
    }

    res.json({
      success: true,
      recordingId,
      message: 'Manual recording started',
      duration
    })

  } catch (error) {
    console.error('❌ Error starting recording:', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/stop', async (req, res) => {
  try {
    const { recordingId } = req.body
    const dbConnection = req.app.get('dbConnection')

    if (!recordingId) {
      return res.status(400).json({ error: 'Recording ID required' })
    }

    const result = await stopRecording(recordingId, dbConnection)

    if (result.success) {
      res.json(result)
    } else {
      res.status(404).json(result)
    }
  } catch (error) {
    console.error('❌ Error stopping recording:', error)
    res.status(500).json({ error: 'Failed to stop recording' })
  }
})

// Get all recordings from MySQL database
router.get('/', async (req, res) => {
  try {
    const { deviceId } = req.query
    const dbConnection = req.app.get('dbConnection')

    // Ensure recordings directory exists
    const dirCheck = await ensureRecordingsDirectory()
    if (!dirCheck.success) {
      console.warn(`⚠️ Recordings directory issue: ${dirCheck.error}`)
    }

    // Get recordings from database
    let query = `
      SELECT 
        r.id,
        r.device_id as deviceId,
        d.name as deviceName,
        r.filename,
        r.file_path as path,
        r.start_time as startTime,
        r.end_time as endTime,
        r.duration,
        r.file_size as size,
        r.recording_type as type,
        CASE 
          WHEN r.end_time IS NULL THEN 'recording'
          ELSE 'completed'
        END as status,
        r.created_at as createdAt
      FROM recordings r
      LEFT JOIN devices d ON r.device_id = d.id
    `

    const params = []
    if (deviceId) {
      query += ' WHERE r.device_id = ?'
      params.push(deviceId)
    }

    query += ' ORDER BY r.created_at DESC LIMIT 100'

    const recordings = await dbConnection.all(query, params)

    // Verify physical files exist
    const formattedRecordings = recordings.map(rec => {
      const filePath = path.join(RECORDINGS_DIR, rec.filename)
      const fileExists = fs.existsSync(filePath)

      return {
        ...rec,
        path: `/recordings/${rec.filename}`,
        quality: rec.quality || 'medium',
        fileExists,  // Add file existence flag
        warning: !fileExists ? 'File not found on disk' : null
      }
    })

    // Get active recordings
    const activeRecordingsList = Array.from(activeRecordings.entries()).map(([deviceId, info]) => ({
      deviceId,
      recordingId: info.recordingId,
      startTime: info.startTime,
      type: info.type,
      recording: info.recording
    }))

    res.json({
      success: true,
      recordings: formattedRecordings,
      total: formattedRecordings.length,
      activeRecordings: activeRecordingsList,
      directoryStatus: dirCheck  // Include directory status
    })
  } catch (error) {
    console.error('❌ Error loading recordings:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      recordings: [],
      activeRecordings: []
    })
  }
})

// Download recording
router.get('/:recordingId/download', async (req, res) => {
  try {
    const { recordingId } = req.params
    const dbConnection = req.app.get('dbConnection')

    console.log(`📥 Download requested for recording: ${recordingId}`)

    // Get recording from database
    const query = `SELECT * FROM recordings WHERE id = ?`
    const recording = await dbConnection.get(query, [recordingId])

    if (!recording) {
      console.error(`Recording not found in database: ${recordingId}`)
      return res.status(404).json({
        success: false,
        error: 'Recording not found'
      })
    }

    const filePath = path.join(RECORDINGS_DIR, recording.filename)

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Recording file not found'
      })
    }

    const stats = fs.statSync(filePath)

    console.log(`✅ Sending file: ${recording.filename} (${stats.size} bytes)`)

    // Set headers for download
    res.setHeader('Content-Type', 'video/x-msvideo')
    res.setHeader('Content-Disposition', `attachment; filename="${recording.filename}"`)
    res.setHeader('Content-Length', stats.size)

    // Stream the file
    const readStream = fs.createReadStream(filePath)
    readStream.pipe(res)

  } catch (error) {
    console.error('Error downloading recording:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Stream recording for playback
router.get('/:recordingId/stream', async (req, res) => {
  try {
    const { recordingId } = req.params
    const dbConnection = req.app.get('dbConnection')

    // Get recording from database
    const query = `SELECT * FROM recordings WHERE id = ?`
    const recording = await dbConnection.get(query, [recordingId])

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found'
      })
    }

    const filePath = path.join(RECORDINGS_DIR, recording.filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Recording file not found'
      })
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const range = req.headers.range

    if (range) {
      // Support for video seeking
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunksize = (end - start) + 1

      const stream = fs.createReadStream(filePath, { start, end })
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/x-msvideo',
      }

      res.writeHead(206, head)
      stream.pipe(res)
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/x-msvideo',
      }
      res.writeHead(200, head)
      fs.createReadStream(filePath).pipe(res)
    }

  } catch (error) {
    console.error('Error streaming recording:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Delete recording
router.delete('/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params
    const dbConnection = req.app.get('dbConnection')

    // Get recording from database
    const query = `SELECT * FROM recordings WHERE id = ?`
    const recording = await dbConnection.get(query, [recordingId])

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found'
      })
    }

    // Delete file from filesystem
    const filePath = path.join(RECORDINGS_DIR, recording.filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`🗑️ Deleted recording file: ${recording.filename}`)
    }

    // Delete from database
    const deleteQuery = `DELETE FROM recordings WHERE id = ?`
    await dbConnection.run(deleteQuery, [recordingId])

    console.log(`🗑️ Deleted recording from database: ${recordingId}`)

    res.json({
      success: true,
      message: 'Recording deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting recording:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

router.get('/active', (req, res) => {
  try {
    const active = Array.from(activeRecordings.entries()).map(([recordingId, info]) => ({
      recordingId,
      deviceId: info.deviceId,
      startTime: info.startTime,
      type: info.type,
      filename: info.filename,
      duration: info.duration
    }))

    console.log(`📊 Active recordings: ${active.length}`)
    res.json({
      activeRecordings: active,
      total: active.length
    })
  } catch (error) {
    console.error('❌ Error getting active recordings:', error)
    res.status(500).json({
      error: 'Failed to get active recordings',
      activeRecordings: [],
      total: 0
    })
  }
})

// Test auto-recording settings
router.post('/auto-settings/test', async (req, res) => {
  try {
    const { settings } = req.body

    // Validate the settings
    const validationErrors = []

    if (typeof settings.enabled !== 'boolean') {
      validationErrors.push('enabled must be a boolean')
    }

    if (!Number.isInteger(settings.chunkDuration) || settings.chunkDuration < 1 || settings.chunkDuration > 60) {
      validationErrors.push('chunkDuration must be between 1 and 60 minutes')
    }

    if (!['low', 'medium', 'high'].includes(settings.quality)) {
      validationErrors.push('quality must be low, medium, or high')
    }

    if (!Number.isInteger(settings.maxStorage) || settings.maxStorage < 1) {
      validationErrors.push('maxStorage must be a positive integer (GB)')
    }

    if (!Number.isInteger(settings.retentionPeriod) || settings.retentionPeriod < 1) {
      validationErrors.push('retentionPeriod must be a positive integer (days)')
    }

    if (!Array.isArray(settings.enabledDevices)) {
      validationErrors.push('enabledDevices must be an array')
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors
      })
    }

    // Test if we can access the devices
    const deviceValidation = []
    for (const deviceId of settings.enabledDevices) {
      if (!deviceId || typeof deviceId !== 'string') {
        deviceValidation.push(`Invalid device ID: ${deviceId}`)
      }
    }

    res.json({
      success: true,
      message: 'Auto-recording settings validated successfully',
      warnings: deviceValidation.length > 0 ? deviceValidation : null,
      settings: {
        enabled: settings.enabled,
        chunkDuration: settings.chunkDuration,
        quality: settings.quality,
        maxStorage: settings.maxStorage,
        retentionPeriod: settings.retentionPeriod,
        enabledDevices: settings.enabledDevices
      }
    })

  } catch (error) {
    console.error('Error testing auto-recording settings:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error while testing settings'
    })
  }
})

// Start auto-recording
router.post('/auto/start', async (req, res) => {
  try {
    const { deviceIds, duration, quality } = req.body
    const dbConnection = req.app.get('dbConnection')

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'deviceIds must be a non-empty array'
      })
    }

    // Validate devices exist in database
    const devices = []
    for (const deviceId of deviceIds) {
      const device = await getDeviceById(deviceId, dbConnection)
      if (device) {
        devices.push(device)
      }
    }

    // Start auto-recordings using existing function
    try {
      startAutoRecordingsForDevices(deviceIds, dbConnection)

      const startedRecordings = devices.map(device => ({
        deviceId: device.id,
        deviceName: device.name,
        status: 'started'
      }))

      res.json({
        success: true,
        message: `Auto-recording started for ${startedRecordings.length} device(s)`,
        started: startedRecordings,
        format: 'MP4',
        chunkDuration: autoRecordingSettings.chunkDuration
      })

    } catch (error) {
      console.error('Error starting auto-recordings:', error)
      res.status(500).json({
        success: false,
        error: 'Failed to start auto-recordings',
        details: error.message
      })
    }

  } catch (error) {
    console.error('Error in auto-recording start endpoint:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// Directory health check endpoint
router.get('/health/directory', async (req, res) => {
  try {
    const dirStatus = await ensureRecordingsDirectory()

    // Get directory stats
    let stats = null
    let files = []
    let totalSize = 0

    if (dirStatus.success) {
      try {
        const dirContents = fs.readdirSync(RECORDINGS_DIR)
        stats = fs.statSync(RECORDINGS_DIR)

        for (const file of dirContents) {
          const filePath = path.join(RECORDINGS_DIR, file)
          const fileStats = fs.statSync(filePath)
          if (fileStats.isFile()) {
            files.push(file)
            totalSize += fileStats.size
          }
        }
      } catch (err) {
        console.warn('Warning reading directory contents:', err.message)
      }
    }

    res.json({
      success: dirStatus.success,
      directory: RECORDINGS_DIR,
      exists: fs.existsSync(RECORDINGS_DIR),
      writable: dirStatus.success,
      fileCount: files.length,
      totalSize: formatFileSize(totalSize),
      error: dirStatus.error || null,
      recommendations: dirStatus.success ? [] : [
        'Check directory permissions',
        'Ensure the parent directory exists',
        `Try manually creating: mkdir -p ${RECORDINGS_DIR}`,
        'Check disk space availability'
      ]
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      directory: RECORDINGS_DIR
    })
  }
})

// Stop auto-recording
router.post('/auto/stop', async (req, res) => {
  try {
    const { deviceIds } = req.body
    const dbConnection = req.app.get('dbConnection')

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'deviceIds must be a non-empty array'
      })
    }

    const stoppedRecordings = []

    for (const deviceId of deviceIds) {
      if (recordingTimers.has(deviceId)) {
        clearInterval(recordingTimers.get(deviceId))
        recordingTimers.delete(deviceId)
        console.log(`🛑 Stopped auto-recording timer for device: ${deviceId}`)

        // Stop any active recording for this device
        const activeRecording = Array.from(activeRecordings.entries())
          .find(([id, info]) => info.deviceId === deviceId && info.type === 'auto')

        if (activeRecording) {
          await stopRecording(activeRecording[1].recordingId, dbConnection)
        }

        stoppedRecordings.push({
          deviceId,
          deviceName: `Device ${deviceId}`,
          status: 'stopped'
        })
      }
    }

    res.json({
      success: true,
      message: `Auto-recording stopped for ${stoppedRecordings.length} device(s)`,
      stopped: stoppedRecordings
    })

  } catch (error) {
    console.error('Error stopping auto-recordings:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to stop auto-recordings',
      details: error.message
    })
  }
})

module.exports = router