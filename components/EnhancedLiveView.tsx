import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { useStreamState } from './StreamStateManager'
import { HLSPlayer } from './HLSPlayer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
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
  Folder
} from 'lucide-react'

interface Device {
  id: string
  name: string
  ip_address: string
  manufacturer?: string
  model?: string
  authenticated: boolean
  status: string
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

export function EnhancedLiveView({ devices, selectedDevice, onDeviceSelect, onRefreshDevices }: EnhancedLiveViewProps) {
  const [gridLayout, setGridLayout] = useState<'1x1' | '2x2' | '3x3' | '4x4'>('2x2')
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)

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
  }, []) // Only on mount

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
    console.log(`[startStream] Starting stream for ${device.name}`)

    const currentState = streamStates.get(device.id)
    if (currentState?.status === 'connecting' || currentState?.status === 'connected') {
      console.log(`[startStream] Already ${currentState.status}`)
      return
    }

    const ipForStream = device.ip_address.replace(/\./g, '-')
    const streamId = `onvif-${ipForStream}_hls`
    const hlsUrl = `http://localhost:3001/hls/${streamId}/playlist.m3u8`

    // Check if stream is already running on backend
    try {
      const checkResponse = await fetch(hlsUrl, { method: 'HEAD' })
      if (checkResponse.ok) {
        console.log(`Stream already running on backend for ${device.name}`)
        // Stream exists, just update state
        setStreamState(device.id, {
          deviceId: device.id,
          url: hlsUrl,
          status: 'connected',
          audioEnabled: false,
          recording: false
        })
        return
      }
    } catch (err) {
      // Stream doesn't exist yet, continue with starting it
    }

    // Set state and start stream as before...
    setStreamState(device.id, {
      deviceId: device.id,
      url: hlsUrl,
      status: 'connected',
      audioEnabled: false,
      recording: false
    })

    // Fire backend start request...
    fetch(`http://localhost:3001/api/streams/${device.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quality: 'auto', profile: 'auto' })
    }).catch(err => {
      console.log(`Backend request for ${device.name}:`, err)
    })
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

  // Auto-start streams for visible devices
  // useEffect(() => {
  //   // Add a delay to ensure component is fully mounted
  //   const startupDelay = setTimeout(() => {
  //     const initializeStreams = async () => {
  //       const visibleDevices = authenticatedDevices.slice(0, getGridSize())

  //       if (visibleDevices.length === 0) {
  //         console.log('No authenticated devices to initialize')
  //         return
  //       }

  //       console.log(`Initializing ${visibleDevices.length} streams...`)

  //       for (const device of visibleDevices) {
  //         const currentState = streamStates.get(device.id)

  //         // Only start if not already started
  //         if (!currentState || currentState.status === 'stopped') {
  //           console.log(`Auto-starting stream for ${device.name}`)
  //           try {
  //             await startStream(device)
  //             // Give FFmpeg time to initialize
  //             await new Promise(resolve => setTimeout(resolve, 2000))
  //           } catch (error) {
  //             console.error(`Failed to auto-start ${device.name}:`, error)
  //           }
  //         }
  //       }
  //     }

  //     initializeStreams()
  //   }, 1000) // 1 second delay for component mount

  //   return () => {
  //     clearTimeout(startupDelay)
  //   }
  // }, [gridLayout, authenticatedDevices.length])

  // Auto-start streams with proper delay and sequencing
  useEffect(() => {
    if (authenticatedDevices.length === 0) return

    const checkAndRestoreStreams = async () => {
      const visibleDevices = authenticatedDevices.slice(0, getGridSize())

      for (const device of visibleDevices) {
        const currentState = streamStates.get(device.id)

        // Check if stream exists on backend
        const ipForStream = device.ip_address.replace(/\./g, '-')
        const streamId = `onvif-${ipForStream}_hls`
        const hlsUrl = `http://localhost:3001/hls/${streamId}/playlist.m3u8`

        try {
          const response = await fetch(hlsUrl, { method: 'HEAD' })
          if (response.ok) {
            // Stream is running on backend, just restore state
            if (!currentState || currentState.status !== 'connected') {
              console.log(`Restoring existing stream for ${device.name}`)
              setStreamState(device.id, {
                deviceId: device.id,
                url: hlsUrl,
                status: 'connected',
                audioEnabled: currentState?.audioEnabled || false,
                recording: currentState?.recording || false
              })
            }
          } else if (!currentState || currentState.status === 'stopped' || currentState.status === 'error') {
            // Stream not running, start it
            console.log(`Starting new stream for ${device.name}`)
            await startStream(device)
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
        } catch (err) {
          // Backend check failed, try starting if not already connected
          if (!currentState || currentState.status === 'stopped' || currentState.status === 'error') {
            await startStream(device)
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
        }
      }
    }

    const timer = setTimeout(checkAndRestoreStreams, 500) // Quick check on mount
    return () => clearTimeout(timer)
  }, [gridLayout, authenticatedDevices.length])

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

  // Cleanup all streams on unmount - but only if actually unmounting
  // Don't cleanup streams on unmount - they persist globally
  useEffect(() => {
    return () => {
      // Only log, don't actually stop streams
      console.log('EnhancedLiveView unmounting, but preserving global stream states')
    }
  }, [])

  const renderStreamTile = (device: Device, index: number) => {
    const streamState = streamStates.get(device.id)
    const isExpanded = expandedDevice === device.id

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

          {/* Stream Overlay */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-medium text-sm">{device.name}</h3>
                <p className="text-white/80 text-xs">{device.ip_address}</p>
              </div>
              <div className="flex items-center space-x-1">
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
              Multi-camera live streaming with expandable feeds and controls
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
                  const state = streamStates.get(device.id)
                  if (!state || state.status === 'stopped' || state.status === 'error') {
                    await startStream(device)
                    // Critical: Add delay between starts to allow FFmpeg initialization
                    await new Promise(resolve => setTimeout(resolve, 2500))
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
    </div>
  )
}