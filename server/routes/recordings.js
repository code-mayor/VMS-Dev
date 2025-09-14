const express = require('express')
const path = require('path')
const fs = require('fs')
const ffmpegManager = require('../utils/ffmpeg-manager')
const { spawn } = require('child_process')
const { v4: uuidv4 } = require('uuid')
const router = express.Router()

// Load default configuration
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config', 'auto-recording-defaults.json')
let defaultConfig = {}
try {
  defaultConfig = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'))
  console.log('📋 Loaded default configuration from:', DEFAULT_CONFIG_PATH)
} catch (error) {
  console.warn('⚠️ Could not load default config, using fallback defaults:', error.message)
  defaultConfig = {
    defaults: {
      enabled: false,
      chunkDuration: 1,
      quality: 'medium',
      maxStorage: 30,
      retentionPeriod: 1,
      enabledDevices: []
    }
  }
}

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

// Load auto-recording settings with proper defaults
function loadAutoRecordingSettings() {
  try {
    if (fs.existsSync(AUTO_RECORDING_CONFIG_PATH)) {
      const data = fs.readFileSync(AUTO_RECORDING_CONFIG_PATH, 'utf8')
      const settings = JSON.parse(data)
      console.log('📋 Loaded settings from file:', settings)

      // Add enabledDevices if missing (for backward compatibility)
      if (!settings.hasOwnProperty('enabledDevices')) {
        settings.enabledDevices = []
      }

      // Merge with defaults to ensure all fields exist
      const mergedSettings = {
        ...defaultConfig.defaults,
        ...settings,
        // CRITICAL: Ensure enabled is always a boolean
        enabled: settings.enabled === true,
        enabledDevices: settings.enabledDevices || []
      }

      // Validate types
      mergedSettings.chunkDuration = parseInt(mergedSettings.chunkDuration) || defaultConfig.defaults.chunkDuration
      mergedSettings.maxStorage = parseInt(mergedSettings.maxStorage) || defaultConfig.defaults.maxStorage
      mergedSettings.retentionPeriod = parseInt(mergedSettings.retentionPeriod) || defaultConfig.defaults.retentionPeriod

      return mergedSettings
    }
  } catch (error) {
    console.warn('⚠️ Could not load settings:', error.message)
  }

  // Return safe defaults from config file
  console.log('📋 No settings file - using defaults from config')
  return {
    ...defaultConfig.defaults,
    enabledDevices: []  // Add empty array here for runtime
  }
}

// Save auto-recording settings
function saveAutoRecordingSettings(settings) {
  try {
    // Ensure all required fields exist
    const settingsToSave = {
      enabled: Boolean(settings.enabled),
      chunkDuration: parseInt(settings.chunkDuration) || defaultConfig.defaults.chunkDuration,
      quality: settings.quality || defaultConfig.defaults.quality,
      maxStorage: parseInt(settings.maxStorage) || defaultConfig.defaults.maxStorage,
      retentionPeriod: parseInt(settings.retentionPeriod) || defaultConfig.defaults.retentionPeriod,
      enabledDevices: Array.isArray(settings.enabledDevices) ? settings.enabledDevices : []
    }

    const data = JSON.stringify(settingsToSave, null, 2)
    fs.writeFileSync(AUTO_RECORDING_CONFIG_PATH, data, 'utf8')
    console.log('💾 Saved auto-recording settings to file:', settingsToSave)
    return true
  } catch (error) {
    console.error('❌ Failed to save auto-recording settings:', error)
    return false
  }
}

// Initialize auto-recording settings
let autoRecordingSettings = loadAutoRecordingSettings()

let activeRecordings = new Map() // recordingId -> recordingInfo
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

async function stopRecording(recordingId, dbConnection) {
  try {
    console.log(`🛑 Stopping recording: ${recordingId}`)

    // Find the recording in activeRecordings map
    const recordingInfo = activeRecordings.get(recordingId)

    if (!recordingInfo) {
      // Try to find by checking all active recordings
      for (const [id, info] of activeRecordings.entries()) {
        if (info.recordingId === recordingId) {
          recordingInfo = info
          break
        }
      }

      if (!recordingInfo) {
        return { success: false, error: 'Active recording not found' }
      }
    }

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
    const startTime = recordingInfo.startTime
    const duration = Math.floor((endTime - startTime) / 1000)

    // Check file size
    let fileSize = 0
    if (fs.existsSync(recordingInfo.outputPath)) {
      const stats = fs.statSync(recordingInfo.outputPath)
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
    await dbConnection.run(updateQuery, [endTime, duration, fileSize, recordingId.substring(0, 36)])

    // Remove from active recordings
    activeRecordings.delete(recordingId)

    console.log(`✅ Recording stopped: ${recordingId}`)

    return {
      success: true,
      message: 'Recording stopped successfully',
      recording: {
        id: recordingId,
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

  // Stop any existing auto recordings for these devices
  const existingAutoRecordings = Array.from(activeRecordings.entries())
    .filter(([id, info]) => info.type === 'auto' && deviceIds.includes(info.deviceId))

  existingAutoRecordings.forEach(([id, info]) => {
    console.log(`🛑 Stopping existing auto-recording: ${id}`)
    stopRecording(id, dbConnection)
  })

  // Start new recordings after a short delay to ensure cleanup
  setTimeout(() => {
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
  }, 1000)
}

function stopAllAutoRecordings(dbConnection) {
  console.log('ℹ️ Stopping all auto-recordings...')

  recordingTimers.forEach((timer, deviceId) => {
    console.log(`🛑 Clearing timer for device: ${deviceId}`)
    clearInterval(timer)
  })
  recordingTimers.clear()

  const autoRecordings = Array.from(activeRecordings.entries())
    .filter(([id, info]) => info.type === 'auto')

  autoRecordings.forEach(async ([id, info]) => {
    console.log(`🛑 Stopping auto-recording: ${id}`)
    await stopRecording(id, dbConnection)
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

    const maxStorage = autoRecordingSettings.maxStorage || defaultConfig.defaults.maxStorage
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
      maxStorage: defaultConfig.defaults.maxStorage,
      usagePercentage: 0,
      freeSpace: defaultConfig.defaults.maxStorage * 1024 * 1024 * 1024,
      freeSpaceFormatted: `${defaultConfig.defaults.maxStorage} GB`,
      recentRecordings: 0,
      autoRecordingEnabled: false,
      enabledDevices: 0,
      directoryStatus: { success: false }
    })
  }
})

router.get('/auto-settings', (req, res) => {
  // Reload settings to ensure we have the latest
  autoRecordingSettings = loadAutoRecordingSettings()

  console.log('📖 Returning auto-recording settings:', autoRecordingSettings)
  res.json(autoRecordingSettings)
})

router.put('/auto-settings', async (req, res) => {
  try {
    const dbConnection = req.app.get('dbConnection')

    // Get settings from request body
    let newSettings = req.body

    console.log('📥 Received settings update:', newSettings)

    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ error: 'Settings required' })
    }

    // Validate and ensure all fields with defaults from config
    const validatedSettings = {
      enabled: Boolean(newSettings.enabled),
      chunkDuration: parseInt(newSettings.chunkDuration) || defaultConfig.defaults.chunkDuration,
      quality: newSettings.quality || defaultConfig.defaults.quality,
      maxStorage: parseInt(newSettings.maxStorage) || defaultConfig.defaults.maxStorage,
      retentionPeriod: parseInt(newSettings.retentionPeriod) || defaultConfig.defaults.retentionPeriod,
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
      // Rollback on save failure
      autoRecordingSettings = previousSettings
      throw new Error('Failed to save settings to file')
    }

    // Handle auto-recording state changes
    const needsRestart = previousSettings.enabled !== validatedSettings.enabled ||
      previousSettings.chunkDuration !== validatedSettings.chunkDuration ||
      JSON.stringify(previousSettings.enabledDevices) !== JSON.stringify(validatedSettings.enabledDevices)

    if (needsRestart) {
      console.log('🛑 Settings changed, restarting auto-recordings...')

      // Stop all existing auto-recordings
      stopAllAutoRecordings(dbConnection)

      // Start new recordings if enabled
      if (validatedSettings.enabled && validatedSettings.enabledDevices.length > 0) {
        console.log('🎬 Starting auto-recordings with new settings')
        // Delay to ensure cleanup completes
        setTimeout(() => {
          startAutoRecordingsForDevices(validatedSettings.enabledDevices, dbConnection)
        }, 2000)
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
      .find(r => r.deviceId === deviceId && r.type === 'manual')

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

    const recordingInfo = {
      recordingId,
      deviceId,
      process: ffmpegProcess,
      startTime: startTime,
      outputPath,
      filename,
      duration,
      type: 'manual'
    }

    activeRecordings.set(recordingId, recordingInfo)
    ffmpegProcesses.set(recordingId, ffmpegProcess)

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

    // Get active recordings with proper format
    const activeRecordingsList = Array.from(activeRecordings.entries()).map(([recordingId, info]) => ({
      deviceId: info.deviceId,
      recordingId: info.recordingId,
      startTime: info.startTime instanceof Date ? info.startTime.toISOString() : info.startTime,
      type: info.type,
      duration: info.duration,
      filename: info.filename
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
    res.setHeader('Content-Type', 'video/mp4')
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
        'Content-Type': 'video/mp4',
      }

      res.writeHead(206, head)
      stream.pipe(res)
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
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
      recordingId: info.recordingId || recordingId,
      deviceId: info.deviceId,
      startTime: info.startTime instanceof Date ? info.startTime.toISOString() : info.startTime,
      type: info.type || 'auto',
      filename: info.filename || `Recording_${recordingId}`,
      duration: info.duration || 0
    }))

    console.log(`📊 Active recordings: ${active.length}`)
    console.log('📊 Active recording details:', active)

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

// Initialize auto-recording on startup if enabled
setTimeout(() => {
  if (autoRecordingSettings.enabled && autoRecordingSettings.enabledDevices.length > 0) {
    console.log('🚀 Auto-recording enabled on startup, waiting for database connection...')
    // Will be started when database is ready
  }
}, 2000)

// Export router as default
module.exports = router

// Add functions as properties of the router
router.startAutoRecordingsForDevices = startAutoRecordingsForDevices
router.stopAllAutoRecordings = stopAllAutoRecordings
router.autoRecordingSettings = autoRecordingSettings