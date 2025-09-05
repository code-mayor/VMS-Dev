import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
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
  onDeviceSelect?: (device: Device) => void
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

export function EnhancedLiveView({ devices, selectedDevice, onDeviceSelect }: EnhancedLiveViewProps) {
  const [gridLayout, setGridLayout] = useState<'1x1' | '2x2' | '3x3' | '4x4'>('2x2')
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)
  const [streamStates, setStreamStates] = useState<Map<string, StreamState>>(new Map())
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [showScreenshotGallery, setShowScreenshotGallery] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get authenticated devices for streaming
  const authenticatedDevices = devices.filter(d => d.authenticated)

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
    const currentState = streamStates.get(device.id)
    if (currentState?.status === 'connecting' || currentState?.status === 'connected') {
      console.log(`Stream already ${currentState.status} for ${device.name}`)
      return
    }

    console.log(`Starting HLS stream for device: ${device.name} (${device.id})`)

    // Build URL immediately
    const streamId = `${device.id}_hls`
    const hlsUrl = `http://localhost:3001/hls/${streamId}/playlist.m3u8`

    console.log(`Pre-constructed URL for ${device.name}: ${hlsUrl}`)

    // Set connecting state
    setStreamStates(prev => {
      const newMap = new Map(prev)
      newMap.set(device.id, {
        deviceId: device.id,
        url: '', // Empty during connecting
        status: 'connecting',
        audioEnabled: false,
        recording: false
      })
      return newMap
    })

    try {
      const startResponse = await fetch(`http://localhost:3001/api/streams/${device.id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quality: 'auto',
          profile: 'auto'
        })
      })

      if (!startResponse.ok) {
        throw new Error(`Failed to start stream: ${startResponse.status}`)
      }

      const data = await startResponse.json()
      console.log(`Backend responded for ${device.name}`)

      // IMMEDIATELY set connected state with URL - don't wait
      setStreamStates(prev => {
        const newMap = new Map(prev)
        newMap.set(device.id, {
          deviceId: device.id,
          url: hlsUrl, // SET THE URL HERE
          status: 'connected',
          audioEnabled: false,
          recording: false
        })
        console.log(`URL set for ${device.name}: ${hlsUrl}`)
        return newMap
      })

      toast.success(`Live stream started for ${device.name}`)

    } catch (err: any) {
      console.error(`Failed to start streaming for ${device.name}:`, err)
      setStreamStates(prev => {
        const newMap = new Map(prev)
        newMap.set(device.id, {
          deviceId: device.id,
          url: '',
          status: 'error',
          error: err.message,
          audioEnabled: false,
          recording: false
        })
        return newMap
      })
      toast.error(`Failed to start stream for ${device.name}: ${err.message}`)
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

    setStreamStates(prev => {
      const newMap = new Map(prev)
      newMap.delete(deviceId)
      return newMap
    })
  }

  const toggleAudio = (deviceId: string) => {
    setStreamStates(prev => {
      const current = prev.get(deviceId)
      if (current) {
        const newState = {
          ...current,
          audioEnabled: !current.audioEnabled
        }
        console.log(`🔊 Audio ${newState.audioEnabled ? 'enabled' : 'disabled'} for device: ${deviceId}`)
        return new Map(prev.set(deviceId, newState))
      }
      return prev
    })
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

      setStreamStates(prev => new Map(prev.set(deviceId, {
        ...current,
        recording: !current.recording
      })))
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
    await stopStream(deviceId)
    const device = authenticatedDevices.find(d => d.id === deviceId)
    if (device) {
      setTimeout(() => startStream(device), 1000)
    }
  }

  // Auto-start streams for visible devices
  useEffect(() => {
    const visibleDevices = authenticatedDevices.slice(0, getGridSize())

    // Add delay between starting multiple streams to avoid race conditions
    visibleDevices.forEach((device, index) => {
      if (!streamStates.has(device.id)) {
        setTimeout(() => {
          startStream(device)
        }, index * 1000) // Stagger starts by 1 second
      }
    })

    // Cleanup streams for devices no longer visible
    const visibleDeviceIds = new Set(visibleDevices.map(d => d.id))
    streamStates.forEach((state, deviceId) => {
      if (!visibleDeviceIds.has(deviceId)) {
        stopStream(deviceId)
      }
    })
  }, [gridLayout, authenticatedDevices.length])

  // Cleanup all streams on unmount
  useEffect(() => {
    return () => {
      streamStates.forEach((_, deviceId) => {
        stopStream(deviceId)
      })
    }
  }, [])

  const renderStreamTile = (device: Device, index: number) => {
    const streamState = streamStates.get(device.id)
    const isExpanded = expandedDevice === device.id

    return (
      <Card key={device.id} className={`relative overflow-hidden ${isExpanded ? 'col-span-2 row-span-2' : ''}`} data-device-id={device.id}>
        <div className="relative aspect-video bg-black">
          {/* Stream Player */}
          {streamState?.url && streamState.url !== '' && streamState.status === 'connected' ? (
            <>
              {console.log(`Rendering HLSPlayer for ${device.name} with URL: ${streamState.url}`)}
              <HLSPlayer
                src={streamState.url}
                deviceName={device.name}
                autoPlay={true}
                muted={!streamState.audioEnabled}
                controls={false}
                className="w-full h-full"
                onError={(error) => {
                  console.error(`HLS Player error for ${device.name}:`, error)
                  setStreamStates(prev => {
                    const newMap = new Map(prev)
                    const current = newMap.get(device.id)
                    if (current) {
                      newMap.set(device.id, {
                        ...current,
                        status: 'error',
                        error: error
                      })
                    }
                    return newMap
                  })
                }}
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {streamState?.status === 'connecting' ? (
                <div className="text-center text-white">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                  <p className="text-sm">Connecting...</p>
                </div>
              ) : streamState?.status === 'error' ? (
                <div className="text-center text-red-400" style={{ pointerEvents: 'auto', zIndex: 10 }}>
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">Stream Error</p>
                  <p className="text-xs mt-1">{streamState.error}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      restartStream(device.id)
                    }}
                    className="mt-2 text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                </div>
              ) : (
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
              )}
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
                  {streamState?.status === 'connected' ? 'LIVE' : streamState?.status || 'OFF'}
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
              <Button onClick={() => window.location.reload()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
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