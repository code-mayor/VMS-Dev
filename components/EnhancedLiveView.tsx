import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { useStreamState } from './StreamStateManager'
import { HLSPlayer } from './HLSPlayer'
import { PTZOverlay } from './PTZOverlay'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import {
  Camera,
  Play,
  Square,
  Settings,
  Maximize2,
  Minimize2,
  AlertTriangle,
  RefreshCw,
  Monitor,
  Wifi,
  WifiOff,
  Video,
  Clock,
  Volume2,
  VolumeX,
  Download,
  Image,
  Grid as Grid3X3,
  Grid as Grid2X2,
  LayoutGrid,
  Circle,
  Eye,
  Pause,
  SkipForward,
  Rewind,
  Save,
  Folder,
  Move,
  Activity,
  User,
  Cat,
  Car,
  X,
  Bell,
  BellOff,
  Shield,
  ShieldAlert
} from 'lucide-react'

interface Device {
  id: string
  name: string
  ip_address: string
  manufacturer?: string
  model?: string
  authenticated: boolean
  status: string
  capabilities?: {
    ptz?: boolean
  } | string
  motion_detection_enabled?: boolean
}

interface EnhancedLiveViewProps {
  devices: Device[]
  selectedDevice?: Device | null
  onDeviceSelect?: (device: Device | null) => void
  onRefreshDevices?: () => void
}

interface StreamState {
  deviceId: string
  url: string
  status: 'connected' | 'connecting' | 'error' | 'stopped'
  error?: string
  audioEnabled: boolean
  recording: boolean
}

interface Screenshot {
  id: string
  deviceId: string
  deviceName: string
  timestamp: string
  url: string
  filename: string
}

interface MotionAlert {
  id: string
  deviceId: string
  timestamp: string
  type: string
  confidence: number
  alertLevel: 'high' | 'medium' | 'low'
  summary: string
  acknowledged: boolean
  objects?: {
    living?: {
      human?: Array<{ class: string; confidence: number }>
      animal?: Array<{ class: string; confidence: number }>
    }
    nonLiving?: {
      vehicle?: Array<{ class: string; confidence: number }>
      other?: Array<{ class: string; confidence: number }>
    }
  }
}

interface MotionConfig {
  enabled: boolean
  sensitivity: number
  minConfidence: number
  cooldownPeriod: number
  enableObjectDetection: boolean
  enableHumanDetection: boolean
  enableAnimalDetection: boolean
  enableVehicleDetection: boolean
  alertSound: boolean
  alertNotifications: boolean
}

export function EnhancedLiveView({ devices, selectedDevice, onDeviceSelect, onRefreshDevices }: EnhancedLiveViewProps) {
  const [gridLayout, setGridLayout] = useState<'1x1' | '2x2' | '3x3' | '4x4'>('2x2')
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)

  // Add PTZ control states
  const [showPTZControls, setShowPTZControls] = useState<Record<string, boolean>>({})
  const [expandedPTZ, setExpandedPTZ] = useState<Record<string, boolean>>({})

  // Motion detection states
  const [motionAlerts, setMotionAlerts] = useState<Map<string, MotionAlert>>(new Map())
  const [deviceConfigs, setDeviceConfigs] = useState<Map<string, MotionConfig>>(new Map())
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [selectedDeviceConfig, setSelectedDeviceConfig] = useState<string | null>(null)

  // Add null check for context
  let streamContext = null;
  try {
    streamContext = useStreamState();
  } catch (error) {
    console.error('StreamState context not available:', error);
    return (
      <div className="flex items-center justify-center h-full">
        <p>Stream state context not initialized</p>
      </div>
    );
  }

  const { streamStates, setStreamState, removeStreamState } = streamContext;

  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [showScreenshotGallery, setShowScreenshotGallery] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add ref to persist state across re-renders
  const streamStatesRef = useRef<Map<string, StreamState>>(new Map())

  // Update the ref whenever streamStates changes
  useEffect(() => {
    streamStatesRef.current = streamStates
  }, [streamStates])

  // Add recovery mechanism
  useEffect(() => {
    // On mount, check if we have previous streams to restore
    if (streamStatesRef.current.size > 0 && streamStates.size === 0) {
      console.log('Restoring previous stream states')
      // Restore each stream state individually
      streamStatesRef.current.forEach((state, deviceId) => {
        setStreamState(deviceId, state)
      })
    }
  }, [])

  // Get authenticated devices for streaming
  const authenticatedDevices = devices.filter(d => d.authenticated)

  // Initialize device motion configurations
  useEffect(() => {
    const configs = new Map<string, MotionConfig>()
    authenticatedDevices.forEach(device => {
      configs.set(device.id, {
        enabled: device.motion_detection_enabled || false,
        sensitivity: 75,
        minConfidence: 60,
        cooldownPeriod: 5000,
        enableObjectDetection: true,
        enableHumanDetection: true,
        enableAnimalDetection: true,
        enableVehicleDetection: true,
        alertSound: true,
        alertNotifications: true
      })
    })
    setDeviceConfigs(configs)
  }, [devices])

  const socketRef = useRef<Socket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Connect to motion detection WebSocket
  useEffect(() => {
    connectToMotionWebSocket()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, []) // Empty dependency array is fine for initial connection

  // Separate effect to handle device subscriptions when they change
  useEffect(() => {
    if (socketRef.current && socketRef.current.connected) {
      // Subscribe to new devices
      authenticatedDevices.forEach(device => {
        socketRef.current!.emit('subscribe-device', device.id)
      })
    }
  }, [authenticatedDevices]) // Re-subscribe when devices change

  const connectToMotionWebSocket = () => {
    try {
      const socket = io('http://localhost:3001', {
        transports: ['websocket', 'polling'],
        auth: {
          token: localStorage.getItem('token') || ''
        }
      })

      socket.on('connect', () => {
        console.log('Connected to motion detection Socket.IO')

        // Authenticate
        socket.emit('authenticate', {
          userId: localStorage.getItem('userId') || 'local-user',
          token: localStorage.getItem('token') || ''
        })
      })

      socket.on('auth-success', () => {
        console.log('Motion detection authenticated')

        // Subscribe to currently authenticated devices
        authenticatedDevices.forEach(device => {
          socket.emit('subscribe-device', device.id)
        })
      })

      socket.on('motion-alert', (data) => {
        handleMotionAlert(data)
      })

      socket.on('error', (error) => {
        console.error('Socket.IO error:', error)
      })

      socket.on('disconnect', () => {
        console.log('Socket.IO connection closed')
        // Auto-reconnect is handled by Socket.IO client by default
      })

      socketRef.current = socket
    } catch (error) {
      console.error('Failed to connect to Socket.IO:', error)
      // Retry connection after 5 seconds
      setTimeout(connectToMotionWebSocket, 5000)
    }
  }

  const handleMotionAlert = (alert: any) => {
    const motionAlert: MotionAlert = {
      id: `alert-${Date.now()}`,
      deviceId: alert.deviceId,
      timestamp: alert.timestamp,
      type: alert.type,
      confidence: alert.confidence,
      alertLevel: alert.alertLevel,
      summary: alert.summary || 'Motion detected',
      acknowledged: false,
      objects: alert.objects
    }

    setMotionAlerts(prev => {
      const newAlerts = new Map(prev)
      newAlerts.set(alert.deviceId, motionAlert)
      return newAlerts
    })

    // Play alert sound if enabled
    const config = deviceConfigs.get(alert.deviceId)
    if (config?.alertSound && alert.alertLevel === 'high' && audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e))
    }

    // Auto-dismiss after cooldown period
    setTimeout(() => {
      setMotionAlerts(prev => {
        const newAlerts = new Map(prev)
        if (newAlerts.get(alert.deviceId)?.id === motionAlert.id) {
          newAlerts.delete(alert.deviceId)
        }
        return newAlerts
      })
    }, config?.cooldownPeriod || 5000)
  }

  const acknowledgeAlert = (deviceId: string) => {
    setMotionAlerts(prev => {
      const newAlerts = new Map(prev)
      newAlerts.delete(deviceId)
      return newAlerts
    })

    // Send acknowledgement via Socket.IO
    if (socketRef.current && socketRef.current.connected) {
      const alert = motionAlerts.get(deviceId)
      if (alert) {
        socketRef.current.emit('acknowledge-alert', {
          deviceId,
          alertId: alert.id
        })
      }
    }
  }

  const startMotionDetection = async (deviceId: string) => {
    try {

      // ADD THESE DEBUG LINES:
      console.log('Starting motion detection for device:', deviceId)
      const device = devices.find(d => d.id === deviceId)
      console.log('Device object:', device)
      console.log('All devices:', devices)

      const config = deviceConfigs.get(deviceId)
      const token = localStorage.getItem('token') || localStorage.getItem('vms_token') // Check both possible token keys

      const response = await fetch(`http://localhost:3001/api/motion/${deviceId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ config })
      })

      if (!response.ok) throw new Error('Failed to start motion detection')

      // Update config
      setDeviceConfigs(prev => {
        const newConfigs = new Map(prev)
        const config = newConfigs.get(deviceId)
        if (config) {
          config.enabled = true
          newConfigs.set(deviceId, config)
        }
        return newConfigs
      })

      toast.success('Motion detection started')
    } catch (error) {
      console.error('Failed to start motion detection:', error)
      toast.error('Failed to start motion detection')
    }
  }

  const stopMotionDetection = async (deviceId: string) => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('vms_token')

      await fetch(`http://localhost:3001/api/motion/${deviceId}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}` // Add this header
        }
      })

      // Update config
      setDeviceConfigs(prev => {
        const newConfigs = new Map(prev)
        const config = newConfigs.get(deviceId)
        if (config) {
          config.enabled = false
          newConfigs.set(deviceId, config)
        }
        return newConfigs
      })

      toast.success('Motion detection stopped')
    } catch (error) {
      console.error('Failed to stop motion detection:', error)
      toast.error('Failed to stop motion detection')
    }
  }

  const updateDeviceConfig = (deviceId: string, config: Partial<MotionConfig>) => {
    setDeviceConfigs(prev => {
      const newConfigs = new Map(prev)
      const currentConfig = newConfigs.get(deviceId)
      if (currentConfig) {
        newConfigs.set(deviceId, { ...currentConfig, ...config })
      }
      return newConfigs
    })

    // Send config update via Socket.IO
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('update-motion-config', {
        deviceId,
        config
      })
    }
  }

  useEffect(() => {
    const activeStreams: any[] = []
    streamStates.forEach((state, deviceId) => {
      if (state.status === 'connected') {
        activeStreams.push({ deviceId, ...state })
      }
    })
    if (activeStreams.length > 0) {
      sessionStorage.setItem('activeStreams', JSON.stringify(activeStreams))
    }
  }, [streamStates])

  // Restore streams on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('activeStreams')
    if (stored) {
      try {
        const activeStreams = JSON.parse(stored)
        activeStreams.forEach((stream: any) => {
          if (!streamStates.has(stream.deviceId)) {
            setStreamState(stream.deviceId, {
              deviceId: stream.deviceId,
              url: stream.url,
              status: 'connected',
              audioEnabled: stream.audioEnabled,
              recording: stream.recording
            })
          }
        })
      } catch (err) {
        console.error('Failed to restore streams:', err)
      }
    }
  }, [])

  // Calculate grid size based on layout and available devices
  const getGridSize = () => {
    const maxDevices = {
      '1x1': 1,
      '2x2': 4,
      '3x3': 9,
      '4x4': 16
    }[gridLayout]

    return Math.min(authenticatedDevices.length, maxDevices)
  }

  const getGridCols = () => {
    switch (gridLayout) {
      case '1x1': return 'grid-cols-1'
      case '2x2': return 'grid-cols-2'
      case '3x3': return 'grid-cols-3'
      case '4x4': return 'grid-cols-4'
      default: return 'grid-cols-2'
    }
  }

  // Enhanced stream management with better error handling
  const startStream = async (device: Device) => {
  console.log(`[startStream] Checking stream for ${device.name}`)
  
  const currentState = streamStates.get(device.id)
  if (currentState?.status === 'connected') {
    console.log(`[startStream] Already connected`)
    return
  }

  // Build the expected HLS URL
  const streamId = `${device.id}_hls`
  const hlsUrl = `http://localhost:3001/hls/${streamId}/playlist.m3u8`

  // Set connecting state
  setStreamState(device.id, {
    deviceId: device.id,
    url: '',
    status: 'connecting',
    audioEnabled: false,
    recording: false
  })

  try {
    // First check if stream is already running on backend
    console.log(`Checking if stream already exists at: ${hlsUrl}`)
    const checkResponse = await fetch(hlsUrl, { method: 'HEAD' })
    
    if (checkResponse.ok) {
      console.log(`✅ Stream already running on backend for ${device.name}`)
      
      // Stream exists, just connect to it
      setStreamState(device.id, {
        deviceId: device.id,
        url: hlsUrl,
        status: 'connected',
        audioEnabled: false,
        recording: false
      })
      
      toast.success(`Connected to existing stream: ${device.name}`)
      return
    }

    // Stream doesn't exist, start it
    console.log(`Stream not found, starting new stream for ${device.id}`)
    
    const response = await fetch(`http://localhost:3001/api/streams/${device.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quality: 'auto', profile: 'auto' })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('Backend stream response:', data)

    // Use the URL from backend
    const finalUrl = `http://localhost:3001${data.url}`
    
    // Wait a bit for FFmpeg to initialize
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Set connected state
    setStreamState(device.id, {
      deviceId: device.id,
      url: finalUrl,
      status: 'connected',
      audioEnabled: false,
      recording: false
    })

    console.log(`✅ New stream started for ${device.name}`)
    toast.success(`Stream started: ${device.name}`)

  } catch (err: any) {
    console.error(`Failed to start stream for ${device.name}:`, err)
    setStreamState(device.id, {
      deviceId: device.id,
      url: '',
      status: 'error',
      audioEnabled: false,
      recording: false,
      error: err.message
    })
    
    toast.error(`Stream error: ${err.message}`)
  }
}

  const stopStream = async (deviceId: string) => {
    try {
      await fetch(`http://localhost:3001/api/streams/${deviceId}/stop`, {
        method: 'POST'
      })
      console.log(`🛑 Stream stopped for device: ${deviceId}`)
    } catch (err) {
      console.warn('Failed to stop stream:', err)
    }

    removeStreamState(deviceId)
  }

  const restartStreamWithRetry = async (deviceId: string, maxRetries = 3) => {
    const device = authenticatedDevices.find(d => d.id === deviceId)
    if (!device) return

    console.log(`Restarting stream for ${device.name} with retry logic`)

    // First stop the existing stream
    await stopStream(deviceId)

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Try to restart with retries
    let lastError = null
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Restart attempt ${attempt}/${maxRetries} for ${device.name}`)
        await startStream(device)
        console.log(`Successfully restarted ${device.name}`)
        return // Success
      } catch (err: any) {
        lastError = err
        console.error(`Restart attempt ${attempt} failed:`, err)

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
          console.log(`Waiting ${delay}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    // All retries failed
    console.error(`Failed to restart ${device.name} after ${maxRetries} attempts`)
    toast.error(`Unable to restart stream: ${device.name}`)
  }

  const toggleAudio = (deviceId: string) => {
    const current = streamStates.get(deviceId)
    if (current) {
      const newState = {
        ...current,
        audioEnabled: !current.audioEnabled
      }
      console.log(`🔊 Audio ${newState.audioEnabled ? 'enabled' : 'disabled'} for device: ${deviceId}`)
      setStreamState(deviceId, newState)
    }
  }

  const toggleRecording = async (deviceId: string) => {
    const current = streamStates.get(deviceId)
    if (!current) return

    try {
      if (current.recording) {
        // Stop recording
        await fetch(`http://localhost:3001/api/recordings/${deviceId}/stop`, {
          method: 'POST'
        })
        toast.success('Recording stopped')
      } else {
        // Start recording
        await fetch(`http://localhost:3001/api/recordings/${deviceId}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'manual',
            duration: 3600 // 1 hour default
          })
        })
        toast.success('Recording started')
      }

      setStreamState(deviceId, {
        ...current,
        recording: !current.recording
      })
    } catch (err: any) {
      console.error('❌ Recording operation failed:', err)
      setError(`Recording operation failed: ${err.message}`)
      toast.error(`Recording failed: ${err.message}`)
    }
  }

  const takeScreenshot = async (deviceId: string) => {
    const device = authenticatedDevices.find(d => d.id === deviceId)
    if (!device) return

    try {
      // For now, simulate screenshot capture from video element
      const videoElements = document.querySelectorAll('video')
      let targetVideo: HTMLVideoElement | null = null

      // Find the video element for this device
      videoElements.forEach(video => {
        if (video.closest(`[data-device-id="${deviceId}"]`)) {
          targetVideo = video as HTMLVideoElement
        }
      })

      if (targetVideo && targetVideo.readyState >= 2) {
        // Create canvas and capture frame
        const canvas = document.createElement('canvas')
        canvas.width = targetVideo.videoWidth
        canvas.height = targetVideo.videoHeight
        const ctx = canvas.getContext('2d')

        if (ctx) {
          ctx.drawImage(targetVideo, 0, 0)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95)

          const screenshot: Screenshot = {
            id: `${deviceId}_${Date.now()}`,
            deviceId,
            deviceName: device.name,
            timestamp: new Date().toISOString(),
            url: dataUrl,
            filename: `${device.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}_${Date.now()}.jpg`
          }

          setScreenshots(prev => [screenshot, ...prev])
          toast.success(`Screenshot captured: ${device.name}`)
          console.log('📸 Screenshot saved:', screenshot.filename)
          return
        }
      }

      // Fallback to API if canvas capture fails
      const response = await fetch(`http://localhost:3001/api/devices/${deviceId}/snapshot`, {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()
        const screenshot: Screenshot = {
          id: `${deviceId}_${Date.now()}`,
          deviceId,
          deviceName: device.name,
          timestamp: new Date().toISOString(),
          url: data.url || `http://localhost:3001/snapshots/${deviceId}_${Date.now()}.jpg`,
          filename: `${device.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}_${Date.now()}.jpg`
        }

        setScreenshots(prev => [screenshot, ...prev])
        toast.success(`Screenshot captured: ${device.name}`)
      } else {
        throw new Error('Failed to capture screenshot')
      }
    } catch (err: any) {
      console.error('❌ Screenshot failed:', err)
      toast.error(`Screenshot failed: ${err.message}`)
    }
  }

  const downloadScreenshot = (screenshot: Screenshot) => {
    const link = document.createElement('a')
    link.href = screenshot.url
    link.download = screenshot.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success(`Downloaded: ${screenshot.filename}`)
  }

  const handleDeviceExpand = (deviceId: string) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId)
  }

  const restartStream = async (deviceId: string) => {
    await restartStreamWithRetry(deviceId, 3)
  }

  const startAllVisibleStreams = async () => {
    const visibleDevices = authenticatedDevices.slice(0, getGridSize())

    // Start all streams in parallel
    const startPromises = visibleDevices.map(async (device) => {
      const currentState = streamStates.get(device.id)
      if (!currentState || currentState.status !== 'connected') {
        try {
          await startStream(device)
        } catch (error) {
          console.error(`Failed to start ${device.name}:`, error)
        }
      }
    })

    await Promise.all(startPromises)
  }

  // Auto-start streams with proper delay and sequencing
  useEffect(() => {
    if (authenticatedDevices.length === 0) {
      console.log('No authenticated devices to auto-start')
      return
    }

    const autoStartStreams = async () => {
      const visibleDevices = authenticatedDevices.slice(0, getGridSize())
      console.log(`Auto-starting streams for ${visibleDevices.length} visible devices`)

      for (const device of visibleDevices) {
        const currentState = streamStates.get(device.id)

        // Only start if not already connected or connecting
        if (!currentState || currentState.status === 'stopped' || currentState.status === 'error' || currentState.status === undefined) {
          console.log(`Auto-starting stream for ${device.name} (${device.id})`)

          try {
            // Call the startStream function directly
            await startStream(device)

            // Wait between starting multiple streams to avoid overwhelming the backend
            if (visibleDevices.length > 1) {
              await new Promise(resolve => setTimeout(resolve, 2000))
            }
          } catch (error) {
            console.error(`Failed to auto-start stream for ${device.name}:`, error)
          }
        } else {
          console.log(`Stream already ${currentState.status} for ${device.name}`)
        }
      }
    }

    // Delay initial auto-start to ensure component is fully mounted
    const timer = setTimeout(() => {
      console.log('Component mounted, triggering auto-start...')
      autoStartStreams()
    }, 1500)

    return () => {
      clearTimeout(timer)
    }
  }, [authenticatedDevices.length, gridLayout]) // Re-run when devices or layout changes

  // Debug: Monitor stream states
  useEffect(() => {
    console.log('Current stream states:')
    streamStates.forEach((state, deviceId) => {
      console.log(`  ${deviceId}: status=${state.status}, url=${state.url || 'NO URL'}`)
    })
  }, [streamStates])

  // Health check for active streams
  useEffect(() => {
    const interval = setInterval(() => {
      streamStates.forEach((state, deviceId) => {
        if (state.status === 'connected' && state.url) {
          // Check if playlist is accessible
          fetch(state.url, { method: 'HEAD' })
            .then(response => {
              if (!response.ok && state.status === 'connected') {
                console.warn(`Stream health check failed for ${deviceId}`)
                // Don't automatically restart - just log for now
              }
            })
            .catch(err => {
              console.warn(`Stream health check error for ${deviceId}:`, err)
            })
        }
      })
    }, 10000) // Check every 10 seconds

    return () => clearInterval(interval)
  }, [streamStates])

  // Don't cleanup streams on unmount - they persist globally
  useEffect(() => {
    return () => {
      // Only log, don't actually stop streams
      console.log('EnhancedLiveView unmounting, but preserving global stream states')
    }
  }, [])

  const getAlertIcon = (alert: MotionAlert) => {
    if (alert.objects?.living?.human) return <User className="w-3 h-3" />
    if (alert.objects?.living?.animal) return <Cat className="w-3 h-3" />
    if (alert.objects?.nonLiving?.vehicle) return <Car className="w-3 h-3" />
    return <Activity className="w-3 h-3" />
  }

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-500'
      case 'medium': return 'bg-orange-500'
      case 'low': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const renderStreamTile = (device: Device, index: number) => {
    const streamState = streamStates.get(device.id)
    const isExpanded = expandedDevice === device.id
    const motionAlert = motionAlerts.get(device.id)
    const motionConfig = deviceConfigs.get(device.id)

    // Check if device has PTZ capability
    const hasPTZ = (() => {
      if (typeof device?.capabilities === 'string') {
        try {
          const caps = JSON.parse(device.capabilities)
          return caps.ptz === true
        } catch {
          return false
        }
      }
      return device?.capabilities?.ptz === true
    })()

    return (
      <Card key={device.id} className={`relative overflow-hidden ${isExpanded ? 'col-span-2 row-span-2' : ''}`} data-device-id={device.id}>
        <div className="relative aspect-video bg-black">
          {/* Stream Player */}
          {streamState && streamState.url ? (
            <HLSPlayer
              src={streamState.url}
              deviceName={device.name}
              autoPlay={true}
              muted={!streamState.audioEnabled}
              controls={false}
              className="w-full h-full"
              onError={(error) => {
                console.error(`HLS Player error for ${device.name}:`, error)
                // Update state to error if stream fails
                const current = streamStates.get(device.id)
                if (current) {
                  setStreamState(device.id, {
                    ...current,
                    status: 'error',
                    error: error
                  })
                }
              }}
            />
          ) : streamState?.status === 'error' ? (
            // Keep the error state with retry button
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-red-400" style={{ pointerEvents: 'auto', zIndex: 10 }}>
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">Stream Error</p>
                <p className="text-xs mt-1">{streamState.error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async (e) => {
                    e.stopPropagation()
                    removeStreamState(device.id)
                    await new Promise(resolve => setTimeout(resolve, 500))
                    await startStream(device)
                  }}
                  className="mt-2 text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            // No signal state
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-gray-400" style={{ pointerEvents: 'auto', zIndex: 10 }}>
                <Video className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No Signal</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    startStream(device)
                  }}
                  className="mt-2 text-xs"
                >
                  <Play className="w-3 h-3 mr-1" />
                  Start
                </Button>
              </div>
            </div>
          )}

          {/* Motion Alert Overlay */}
          {motionAlert && !motionAlert.acknowledged && (
            <div className={`absolute top-2 right-2 ${getAlertColor(motionAlert.alertLevel)} text-white p-2 rounded-lg shadow-lg animate-pulse max-w-xs z-20`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <div className="text-xs">
                    <div className="font-semibold flex items-center space-x-1">
                      {getAlertIcon(motionAlert)}
                      <span>{motionAlert.summary}</span>
                    </div>
                    <div className="opacity-90">
                      Confidence: {motionAlert.confidence}%
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="p-0 h-5 w-5 text-white hover:bg-white/20 ml-2"
                  onClick={() => acknowledgeAlert(device.id)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}

          {/* PTZ Overlay - shows when activated */}
          {hasPTZ && showPTZControls[device.id] && (
            <PTZOverlay
              device={device}
              position="bottom-right"
              expanded={expandedPTZ[device.id] || false}
              onToggleExpand={() =>
                setExpandedPTZ({ ...expandedPTZ, [device.id]: !expandedPTZ[device.id] })
              }
              onClose={() => {
                setShowPTZControls({ ...showPTZControls, [device.id]: false })
                setExpandedPTZ({ ...expandedPTZ, [device.id]: false })
              }}
            />
          )}

          {/* Stream Overlay */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-medium text-sm">{device.name}</h3>
                <p className="text-white/80 text-xs">{device.ip_address}</p>
              </div>
              <div className="flex items-center space-x-1">
                {hasPTZ && (
                  <Badge variant="outline" className="text-xs bg-blue-600/20 border-blue-400/50 text-blue-300">
                    <Move className="w-3 h-3 mr-1" />
                    PTZ
                  </Badge>
                )}
                {motionConfig?.enabled && (
                  <Badge className="bg-green-500/80 text-white text-xs">
                    <Activity className="w-3 h-3 mr-1" />
                    Motion
                  </Badge>
                )}
                {streamState?.recording && (
                  <div className="flex items-center space-x-1 bg-red-600 px-2 py-1 rounded text-xs text-white">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    <span>REC</span>
                  </div>
                )}
                <Badge variant={streamState?.status === 'connected' ? 'default' : 'secondary'} className="text-xs">
                  {streamState?.status === 'connected' ? (
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse"></div>
                      LIVE
                    </div>
                  ) : (
                    streamState?.status || 'OFF'
                  )}
                </Badge>
              </div>
            </div>
          </div>

          {/* Stream Controls - with proper z-index and pointer events */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3" style={{ pointerEvents: 'auto', zIndex: 10 }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {/* PTZ Control Button - shows when device has PTZ capability */}
                {hasPTZ && !showPTZControls[device.id] && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowPTZControls({ ...showPTZControls, [device.id]: true })
                    }}
                    className="bg-blue-600/50 hover:bg-blue-600/70 text-white border-blue-400/20"
                    title="PTZ Controls"
                  >
                    <Move className="w-3 h-3" />
                  </Button>
                )}

                {/* Motion Detection Toggle */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation()
                    const config = deviceConfigs.get(device.id)
                    if (config?.enabled) {
                      stopMotionDetection(device.id)
                    } else {
                      startMotionDetection(device.id)
                    }
                  }}
                  className={motionConfig?.enabled
                    ? "bg-green-600/50 hover:bg-green-600/70 text-white border-green-400/20"
                    : "bg-gray-600/50 hover:bg-gray-600/70 text-white border-gray-400/20"
                  }
                  title={motionConfig?.enabled ? "Disable motion detection" : "Enable motion detection"}
                >
                  <Activity className="w-3 h-3" />
                </Button>

                {/* Motion Settings */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedDeviceConfig(device.id)
                    setShowConfigDialog(true)
                  }}
                  className="bg-black/50 hover:bg-black/70 text-white border-white/20"
                  title="Motion detection settings"
                >
                  <Settings className="w-3 h-3" />
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleAudio(device.id)
                  }}
                  className="bg-black/50 hover:bg-black/70 text-white border-white/20"
                  title={streamState?.audioEnabled ? "Mute audio" : "Enable audio"}
                >
                  {streamState?.audioEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation()
                    takeScreenshot(device.id)
                  }}
                  className="bg-black/50 hover:bg-black/70 text-white border-white/20"
                  title="Take screenshot"
                >
                  <Image className="w-3 h-3" />
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleRecording(device.id)
                  }}
                  className={`border-white/20 ${streamState?.recording
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-black/50 hover:bg-black/70 text-white'
                    }`}
                  title={streamState?.recording ? "Stop recording" : "Start recording"}
                >
                  <Circle className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeviceExpand(device.id)
                  }}
                  className="bg-black/50 hover:bg-black/70 text-white border-white/20"
                  title={isExpanded ? "Minimize" : "Expand"}
                >
                  {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Click to expand - only on safe areas */}
          <div
            className="absolute inset-0"
            onClick={(e) => {
              // Only expand if clicking on video area, not controls
              const target = e.target as HTMLElement
              const isControlArea = target.closest('button') || target.closest('.absolute.bottom-0') || target.closest('.absolute.top-0')
              if (!isControlArea) {
                handleDeviceExpand(device.id)
              }
            }}
            style={{ cursor: 'pointer' }}
          />
        </div>
      </Card>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <Monitor className="w-5 h-5" />
              <span>Live View Grid</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Multi-camera live streaming with motion detection and AI object classification
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Badge variant="outline">
              {authenticatedDevices.length} Cameras Ready
            </Badge>

            <Badge variant="secondary">
              {screenshots.length} Screenshots
            </Badge>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowScreenshotGallery(true)}
              disabled={screenshots.length === 0}
            >
              <Folder className="w-4 h-4 mr-2" />
              Gallery
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setIsLoading(true)
                const visibleDevices = authenticatedDevices.slice(0, getGridSize())

                for (const device of visibleDevices) {
                  try {
                    // First, actually start the stream on the backend
                    const response = await fetch(`http://localhost:3001/api/streams/${device.id}/start`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ quality: 'auto', profile: 'auto' })
                    })

                    if (!response.ok) {
                      console.error(`Failed to start stream for ${device.name}:`, await response.text())
                      continue
                    }

                    // Wait for backend to initialize
                    await new Promise(resolve => setTimeout(resolve, 2000))

                    // Then update frontend state
                    const state = streamStates.get(device.id)
                    if (!state || state.status === 'stopped' || state.status === 'error') {
                      await startStream(device)
                    }
                  } catch (error) {
                    console.error(`Failed to start ${device.name}:`, error)
                  }
                }
                setIsLoading(false)
                toast.success(`Started ${visibleDevices.length} streams`)
              }}
              disabled={isLoading}
            >
              <Play className="w-4 h-4 mr-2" />
              {isLoading ? 'Starting...' : 'Start All'}
            </Button>

            <Select value={gridLayout} onValueChange={(value: any) => setGridLayout(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1x1">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-4 h-4" />
                    <span>1×1</span>
                  </div>
                </SelectItem>
                <SelectItem value="2x2">
                  <div className="flex items-center space-x-2">
                    <Grid2X2 className="w-4 h-4" />
                    <span>2×2</span>
                  </div>
                </SelectItem>
                <SelectItem value="3x3">
                  <div className="flex items-center space-x-2">
                    <Grid3X3 className="w-4 h-4" />
                    <span>3×3</span>
                  </div>
                </SelectItem>
                <SelectItem value="4x4">
                  <div className="flex items-center space-x-2">
                    <LayoutGrid className="w-4 h-4" />
                    <span>4×4</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex-shrink-0 p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setError(null)}
                className="ml-2"
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Live View Grid */}
      <div className="flex-1 overflow-auto p-6">
        {authenticatedDevices.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="font-medium text-gray-900 mb-2">No Cameras Available</h3>
              <p className="text-gray-600 mb-4">
                Please authenticate cameras in the Device Discovery section to view live streams.
              </p>
              <Button onClick={async () => {
                if (onRefreshDevices) {
                  await onRefreshDevices();
                  // After devices are refreshed, start all streams
                  setTimeout(() => startAllVisibleStreams(), 500);
                } else {
                  await startAllVisibleStreams();
                }
              }}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Devices
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className={`grid ${getGridCols()} gap-4 auto-rows-fr`}>
            {authenticatedDevices.slice(0, getGridSize()).map((device, index) =>
              renderStreamTile(device, index)
            )}
          </div>
        )}
      </div>

      {/* Motion Configuration Dialog */}
      {showConfigDialog && selectedDeviceConfig && (
        <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Motion Detection Settings - {devices.find(d => d.id === selectedDeviceConfig)?.name}
              </DialogTitle>
            </DialogHeader>

            {(() => {
              const config = deviceConfigs.get(selectedDeviceConfig)
              if (!config) return null

              return (
                <Tabs defaultValue="general">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="detection">Detection</TabsTrigger>
                    <TabsTrigger value="alerts">Alerts</TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label>Enable Motion Detection</label>
                      <Switch
                        checked={config.enabled}
                        onCheckedChange={(checked) => {
                          updateDeviceConfig(selectedDeviceConfig, { enabled: checked })
                          if (checked) {
                            startMotionDetection(selectedDeviceConfig)
                          } else {
                            stopMotionDetection(selectedDeviceConfig)
                          }
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <label>Sensitivity: {config.sensitivity}%</label>
                      <Slider
                        value={[config.sensitivity]}
                        onValueChange={([value]) =>
                          updateDeviceConfig(selectedDeviceConfig, { sensitivity: value })
                        }
                        min={0}
                        max={100}
                        step={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <label>Min Confidence: {config.minConfidence}%</label>
                      <Slider
                        value={[config.minConfidence]}
                        onValueChange={([value]) =>
                          updateDeviceConfig(selectedDeviceConfig, { minConfidence: value })
                        }
                        min={0}
                        max={100}
                        step={5}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="detection" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label>Enable Object Detection</label>
                      <Switch
                        checked={config.enableObjectDetection}
                        onCheckedChange={(checked) =>
                          updateDeviceConfig(selectedDeviceConfig, { enableObjectDetection: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center">
                        <User className="w-4 h-4 mr-2" />
                        Detect Humans
                      </label>
                      <Switch
                        checked={config.enableHumanDetection}
                        onCheckedChange={(checked) =>
                          updateDeviceConfig(selectedDeviceConfig, { enableHumanDetection: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center">
                        <Cat className="w-4 h-4 mr-2" />
                        Detect Animals
                      </label>
                      <Switch
                        checked={config.enableAnimalDetection}
                        onCheckedChange={(checked) =>
                          updateDeviceConfig(selectedDeviceConfig, { enableAnimalDetection: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center">
                        <Car className="w-4 h-4 mr-2" />
                        Detect Vehicles
                      </label>
                      <Switch
                        checked={config.enableVehicleDetection}
                        onCheckedChange={(checked) =>
                          updateDeviceConfig(selectedDeviceConfig, { enableVehicleDetection: checked })
                        }
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="alerts" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label>Alert Sound</label>
                      <Switch
                        checked={config.alertSound}
                        onCheckedChange={(checked) =>
                          updateDeviceConfig(selectedDeviceConfig, { alertSound: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label>Push Notifications</label>
                      <Switch
                        checked={config.alertNotifications}
                        onCheckedChange={(checked) =>
                          updateDeviceConfig(selectedDeviceConfig, { alertNotifications: checked })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label>Cooldown Period: {config.cooldownPeriod / 1000}s</label>
                      <Slider
                        value={[config.cooldownPeriod / 1000]}
                        onValueChange={([value]) =>
                          updateDeviceConfig(selectedDeviceConfig, { cooldownPeriod: value * 1000 })
                        }
                        min={1}
                        max={60}
                        step={1}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              )
            })()}
          </DialogContent>
        </Dialog>
      )}

      {/* Screenshot Gallery Dialog */}
      <Dialog open={showScreenshotGallery} onOpenChange={setShowScreenshotGallery}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Image className="w-5 h-5" />
              <span>Screenshot Gallery</span>
              <Badge variant="secondary">{screenshots.length} images</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {screenshots.length === 0 ? (
              <div className="text-center py-12">
                <Image className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="font-medium text-gray-900 mb-2">No Screenshots</h3>
                <p className="text-gray-600">
                  Take screenshots using the camera controls in the live view.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group screenshots by device */}
                {Object.entries(
                  screenshots.reduce((acc, screenshot) => {
                    if (!acc[screenshot.deviceName]) {
                      acc[screenshot.deviceName] = []
                    }
                    acc[screenshot.deviceName].push(screenshot)
                    return acc
                  }, {} as Record<string, Screenshot[]>)
                ).map(([deviceName, deviceScreenshots]) => (
                  <div key={deviceName} className="space-y-3">
                    <div className="flex items-center space-x-2 border-b pb-2">
                      <Camera className="w-4 h-4 text-gray-600" />
                      <h4 className="font-medium">{deviceName}</h4>
                      <Badge variant="outline" className="text-xs">
                        {deviceScreenshots.length} screenshot{deviceScreenshots.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {deviceScreenshots.map((screenshot) => (
                        <Card key={screenshot.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                          <div className="aspect-video bg-gray-100 relative group">
                            <img
                              src={screenshot.url}
                              alt={screenshot.filename}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => downloadScreenshot(screenshot)}
                                className="bg-white text-black hover:bg-gray-200"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Download
                              </Button>
                            </div>
                          </div>
                          <CardContent className="p-2">
                            <div className="text-xs text-gray-500 truncate">
                              {new Date(screenshot.timestamp).toLocaleString()}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden audio element for alerts */}
      <audio ref={audioRef} src="/alert-sound.mp3" />
    </div>
  )
}