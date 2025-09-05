const express = require('express')
const path = require('path')
const fs = require('fs')
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

// Ensure recordings directory exists
const RECORDINGS_DIR = path.join(__dirname, '..', 'public', 'recordings')
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true })
  console.log(`📁 Created recordings directory: ${RECORDINGS_DIR}`)
}

// Load auto-recording settings
function loadAutoRecordingSettings() {
  try {
    if (fs.existsSync(AUTO_RECORDING_CONFIG_PATH)) {
      const data = fs.readFileSync(AUTO_RECORDING_CONFIG_PATH, 'utf8')
      const settings = JSON.parse(data)
      console.log('📋 Loaded auto-recording settings from file:', settings)
      return settings
    }
  } catch (error) {
    console.warn('⚠️ Could not load auto-recording settings:', error.message)
  }

  // Return default settings (optimized for 4-minute chunks to prevent 0-byte files)
  return {
    enabled: false,
    chunkDuration: 4, // minutes - increased from 2 to 4 for better stability
    quality: 'medium',
    maxStorage: 100, // GB
    retentionPeriod: 30, // days
    enabledDevices: []
  }
}

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
  try {
    const query = `
      SELECT 
        id, 
        name, 
        ip_address as ip,
        rtsp_username,
        rtsp_password
      FROM devices 
      WHERE id = ?
    `
    const device = await dbConnection.get(query, [deviceId])

    if (device) {
      return {
        id: device.id,
        name: device.name || `Device ${deviceId}`,
        ip: device.ip,
        rtsp_username: device.rtsp_username || 'test',
        rtsp_password: device.rtsp_password || 'Test@123'
      }
    }

    // Fallback for testing
    return {
      id: deviceId,
      name: `Device ${deviceId}`,
      ip: '192.168.226.201',
      rtsp_username: 'test',
      rtsp_password: 'Test@123'
    }
  } catch (error) {
    console.error('Error fetching device from database:', error)
    // Return fallback device data
    return {
      id: deviceId,
      name: `Device ${deviceId}`,
      ip: '192.168.226.201',
      rtsp_username: 'test',
      rtsp_password: 'Test@123'
    }
  }
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

// FIXED: Enhanced auto-recording function with proper 0-byte file prevention
async function startAutoRecording(deviceId, chunkDuration = 4, dbConnection) {
  try {
    console.log(`🎬 Starting ${chunkDuration}min auto-recording chunk for device: ${deviceId}`)

    const device = await getDeviceById(deviceId, dbConnection)
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`)
    }

    if (!device.rtsp_username || !device.rtsp_password) {
      throw new Error(`RTSP credentials missing for device: ${deviceId}`)
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `auto_${deviceId}_${timestamp}.mp4`
    const outputPath = path.resolve(RECORDINGS_DIR, filename)

    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(outputPath), {
      recursive: true,
      mode: 0o755
    })

    // Build RTSP URL with proper encoding
    const rtspUrl = `rtsp://${encodeURIComponent(device.rtsp_username)}:${encodeURIComponent(device.rtsp_password)}@${device.ip}:554/profile1`

    console.log(`📁 Output path: ${outputPath}`)
    console.log(`📡 RTSP URL: rtsp://${device.rtsp_username}:***@${device.ip}:554/profile1`)

    // Fixed FFmpeg command with proper codec handling
    const ffmpegArgs = [
      '-rtsp_transport', 'tcp',
      '-rtsp_flags', 'prefer_tcp',
      '-use_wallclock_as_timestamps', '1',
      '-fflags', '+genpts+discardcorrupt',
      '-avoid_negative_ts', 'make_zero',
      '-analyzeduration', '10000000',
      '-probesize', '10000000',
      '-timeout', '30000000',
      '-stimeout', '30000000',
      '-i', rtspUrl,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', (chunkDuration * 60).toString(),
      '-f', 'mp4',
      '-movflags', '+faststart+frag_keyframe+empty_moov',
      '-threads', '2',
      '-y', outputPath
    ]

    console.log(`🔧 FFmpeg command: ffmpeg ${ffmpegArgs.join(' ').replace(rtspUrl, 'rtsp://***:***@' + device.ip + ':554/profile1')}`)

    // Start FFmpeg process with proper error handling
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    })

    const recordingId = `auto_${deviceId}_${Date.now()}`

    // Store recording info BEFORE process starts
    activeRecordings.set(recordingId, {
      process: ffmpegProcess,
      deviceId,
      outputPath,
      startTime: Date.now(),
      duration: chunkDuration * 60 * 1000,
      type: 'auto',
      pid: ffmpegProcess.pid
    })

    // Monitor stderr for errors and progress
    let hasStartedWriting = false
    let errorBuffer = ''

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString()
      errorBuffer += output

      // Check if FFmpeg has started writing
      if (!hasStartedWriting && output.includes('Output #0')) {
        hasStartedWriting = true
        console.log(`✅ FFmpeg started writing to file for ${deviceId}`)
      }

      // Log progress
      if (output.includes('time=')) {
        const match = output.match(/time=(\S+)/)
        if (match) {
          console.log(`📡 Recording progress for ${deviceId}: ${match[1]}`)
        }
      }

      // Check for errors
      if (output.toLowerCase().includes('error')) {
        console.error(`❌ FFmpeg error for ${deviceId}: ${output}`)
      }
    })

    ffmpegProcess.on('error', (error) => {
      console.error(`❌ FFmpeg spawn error for ${deviceId}:`, error)
      activeRecordings.delete(recordingId)
    })

    ffmpegProcess.on('exit', async (code, signal) => {
      console.log(`🛑 Auto-recording FFmpeg process ended: code=${code}, signal=${signal}`)

      // Wait for file system to sync
      await new Promise(resolve => setTimeout(resolve, 1000))

      try {
        const stats = await fs.promises.stat(outputPath)
        if (stats.size > 0) {
          console.log(`✅ Auto-recording completed: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)

          // Save recording metadata to database
          await saveRecordingMetadata({
            id: recordingId,
            deviceId,
            filename,
            path: outputPath,
            size: stats.size,
            duration: chunkDuration * 60,
            startTime: new Date(Date.now() - (chunkDuration * 60 * 1000)),
            endTime: new Date(),
            type: 'continuous',
            status: 'completed'
          }, dbConnection)
        } else {
          console.error(`❌ Auto-recording file is empty: ${filename}`)
          console.error('FFmpeg error output:', errorBuffer)
          await fs.promises.unlink(outputPath).catch(() => { })
        }
      } catch (error) {
        console.error(`❌ Auto-recording file check failed: ${filename}`, error)
      }

      activeRecordings.delete(recordingId)

      // Schedule next chunk if auto-recording is still enabled
      if (isAutoRecordingEnabled(deviceId)) {
        console.log(`🔄 Scheduling next auto-recording chunk for ${deviceId}`)
        setTimeout(() => {
          startAutoRecording(deviceId, chunkDuration, dbConnection)
        }, 1000) // Small delay before starting next chunk
      }
    })

    // Verify process started within timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ffmpegProcess.kill('SIGTERM')
        reject(new Error('FFmpeg process failed to start within 10 seconds'))
      }, 10000)

      ffmpegProcess.once('spawn', () => {
        clearTimeout(timeout)
        console.log(`✅ FFmpeg process spawned with PID: ${ffmpegProcess.pid}`)
        resolve()
      })

      ffmpegProcess.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
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
  console.log('🎬 Starting auto-recordings for devices:', deviceIds)

  deviceIds.forEach(deviceId => {
    if (recordingTimers.has(deviceId)) {
      clearInterval(recordingTimers.get(deviceId))
    }

    const startChunk = async () => {
      console.log(`🎬 Starting ${autoRecordingSettings.chunkDuration}min auto-recording chunk for device: ${deviceId}`)

      if (activeRecordings.has(deviceId)) {
        console.log(`⚠️ Device ${deviceId} already recording, skipping chunk`)
        return
      }

      // Use the enhanced auto-recording function
      try {
        await startAutoRecording(deviceId, autoRecordingSettings.chunkDuration, dbConnection)
      } catch (error) {
        console.error(`❌ Enhanced auto-recording failed for ${deviceId}:`, error)
      }
    }

    startChunk()

    const chunkIntervalMs = (autoRecordingSettings.chunkDuration * 60 + 15) * 1000
    const timer = setInterval(() => {
      try {
        startChunk()
      } catch (error) {
        console.error(`❌ Auto-recording chunk error for device ${deviceId}:`, error)
      }
    }, chunkIntervalMs)
    recordingTimers.set(deviceId, timer)

    console.log(`✅ Auto-recording scheduled for device ${deviceId}: ${autoRecordingSettings.chunkDuration} min chunks (MP4)`)
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

    // Get recording statistics from MySQL
    const query = `
      SELECT 
        COUNT(*) as totalRecordings,
        COALESCE(SUM(file_size), 0) as totalSize
      FROM recordings
    `
    const stats = await dbConnection.get(query)

    const recentQuery = `
      SELECT COUNT(*) as count
      FROM recordings
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
    `
    const recentStats = await dbConnection.get(recentQuery)

    const maxStorageBytes = autoRecordingSettings.maxStorage * 1024 * 1024 * 1024
    const usagePercentage = (stats.totalSize / maxStorageBytes) * 100

    res.json({
      totalRecordings: stats.totalRecordings,
      totalSize: stats.totalSize,
      totalSizeFormatted: formatFileSize(stats.totalSize),
      maxStorage: autoRecordingSettings.maxStorage,
      usagePercentage: Math.min(usagePercentage, 100),
      freeSpace: Math.max(maxStorageBytes - stats.totalSize, 0),
      freeSpaceFormatted: formatFileSize(Math.max(maxStorageBytes - stats.totalSize, 0)),
      recentRecordings: recentStats.count,
      autoRecordingEnabled: autoRecordingSettings.enabled,
      enabledDevices: autoRecordingSettings.enabledDevices.length
    })
  } catch (error) {
    console.error('❌ Error getting storage info:', error)
    res.status(500).json({ error: 'Failed to get storage information' })
  }
})

router.get('/auto-settings', (req, res) => {
  res.json(autoRecordingSettings)
})

router.put('/auto-settings', (req, res) => {
  try {
    const dbConnection = req.app.get('dbConnection')
    let settings = req.body.settings || req.body

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings required' })
    }

    const validatedSettings = {
      enabled: Boolean(settings.enabled),
      chunkDuration: Math.max(parseInt(settings.chunkDuration) || 4, 4),
      quality: settings.quality || 'medium',
      maxStorage: parseInt(settings.maxStorage) || 100,
      retentionPeriod: parseInt(settings.retentionPeriod) || 30,
      enabledDevices: Array.isArray(settings.enabledDevices) ? settings.enabledDevices : []
    }

    const previousSettings = { ...autoRecordingSettings }
    autoRecordingSettings = { ...autoRecordingSettings, ...validatedSettings }
    saveAutoRecordingSettings(autoRecordingSettings)

    if (previousSettings.enabled !== validatedSettings.enabled ||
      JSON.stringify(previousSettings.enabledDevices) !== JSON.stringify(validatedSettings.enabledDevices)) {
      stopAllAutoRecordings(dbConnection)
    }

    if (validatedSettings.enabled && validatedSettings.enabledDevices?.length > 0) {
      startAutoRecordingsForDevices(validatedSettings.enabledDevices, dbConnection)
    } else if (!validatedSettings.enabled) {
      stopAllAutoRecordings(dbConnection)
    }

    res.json({ success: true, settings: autoRecordingSettings })
  } catch (error) {
    console.error('❌ Error updating auto-recording settings:', error)
    res.status(500).json({ error: 'Failed to update settings', details: error.message })
  }
})

router.post('/start', async (req, res) => {
  try {
    const { deviceId, duration = 300, quality = 'medium', type = 'manual' } = req.body
    const dbConnection = req.app.get('dbConnection')

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' })
    }

    if (activeRecordings.has(deviceId)) {
      const existingRecording = activeRecordings.get(deviceId)
      return res.status(400).json({
        error: 'Device is already recording',
        existingRecording: existingRecording.recording
      })
    }

    // Get device from database
    const device = await getDeviceById(deviceId, dbConnection)

    const recordingId = uuidv4()
    const startTime = new Date()
    const filename = `recording_${deviceId}_${startTime.toISOString().replace(/[:.]/g, '-')}.avi`
    const recordingPath = path.join(RECORDINGS_DIR, filename)

    // Create recording object
    const recording = {
      id: recordingId,
      deviceId,
      deviceName: device.name,
      filename,
      startTime: startTime.toISOString(),
      endTime: null,
      duration: 0,
      size: 0,
      quality,
      type,
      status: 'recording',
      path: `/recordings/${filename}`,
      // Include device details for FFmpeg
      ip: device.ip,
      rtsp_username: device.rtsp_username,
      rtsp_password: device.rtsp_password
    }

    // Save recording to MySQL database
    await saveRecordingMetadata({
      id: recordingId,
      deviceId,
      filename,
      path: recording.path,
      size: 0,
      duration: 0,
      startTime,
      endTime: null,
      type: type === 'manual' ? 'manual' : 'scheduled',
      status: 'recording'
    }, dbConnection)

    activeRecordings.set(deviceId, {
      recordingId,
      startTime: startTime.toISOString(),
      type,
      recording
    })

    const recordingsDir = path.dirname(recordingPath)
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true })
    }

    if (!startFFmpegRecording(deviceId, recordingPath, recording, dbConnection)) {
      // Remove from database if FFmpeg fails
      const deleteQuery = `DELETE FROM recordings WHERE id = ?`
      await dbConnection.run(deleteQuery, [recordingId])

      activeRecordings.delete(deviceId)

      return res.status(500).json({
        error: 'Failed to start recording process',
        details: 'FFmpeg could not be started'
      })
    }

    if (type === 'manual' && duration > 0) {
      setTimeout(() => {
        stopRecording(recordingId, dbConnection)
      }, duration * 1000)
    }

    res.json({ success: true, recordingId, message: `${type} recording started (AVI format)`, recording })
  } catch (error) {
    console.error('❌ Error starting recording:', error)
    res.status(500).json({ error: 'Failed to start recording' })
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
    if (!fs.existsSync(RECORDINGS_DIR)) {
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true })
    }

    // Build query based on filters
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

    query += ' ORDER BY r.created_at DESC'

    const recordings = await dbConnection.query(query, params)

    // Format recordings for response
    const formattedRecordings = recordings.map(rec => ({
      ...rec,
      path: `/recordings/${rec.filename}`,
      quality: 'medium'
    }))

    // Get active recordings
    const activeRecordingsList = Array.from(activeRecordings.entries()).map(([deviceId, info]) => ({
      deviceId,
      ...info
    }))

    res.json({
      success: true,
      recordings: formattedRecordings,
      total: formattedRecordings.length,
      activeRecordings: activeRecordingsList,
      downloadFormats: ['avi', 'mp4'],
      nativeFormat: 'avi'
    })
  } catch (error) {
    console.error('❌ Error loading recordings:', error)
    res.status(500).json({
      success: false,
      error: error.message
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
    const active = Array.from(activeRecordings.entries()).map(([deviceId, info]) => ({
      deviceId,
      ...info
    }))
    res.json({ activeRecordings: active, total: active.length })
  } catch (error) {
    console.error('❌ Error getting active recordings:', error)
    res.status(500).json({ error: 'Failed to get active recordings' })
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