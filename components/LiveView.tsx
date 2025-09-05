import React, { useState, useEffect, useCallback } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { HLSPlayer } from './HLSPlayer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { 
  Camera, 
  Play, 
  Square,
  Settings,
  Maximize2,
  AlertTriangle,
  RefreshCw,
  Monitor,
  Wifi,
  WifiOff,
  Video,
  Clock
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
    audio?: boolean
    video?: boolean
    analytics?: boolean
  }
}

interface LiveViewProps {
  devices: Device[]
  selectedDevice?: Device | null
  onDeviceSelect?: (device: Device) => void
}

interface StreamInfo {
  quality: string
  url: string
  status: 'connected' | 'connecting' | 'error' | 'stopped'
  error?: string
}

export function LiveView({ devices, selectedDevice, onDeviceSelect }: LiveViewProps) {
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamQuality, setStreamQuality] = useState('auto')
  const [isRecording, setIsRecording] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string>('')
  const [connectionAttempts, setConnectionAttempts] = useState(0)
  const [lastStreamCheck, setLastStreamCheck] = useState<Date | null>(null)

  // Get authenticated devices for selection
  const authenticatedDevices = devices.filter(d => d.authenticated)

  useEffect(() => {
    if (selectedDevice && selectedDevice.authenticated) {
      console.log('🎥 Selected device changed:', selectedDevice.name)
      startStreaming(selectedDevice)
    } else if (selectedDevice && !selectedDevice.authenticated) {
      setError('Device must be authenticated before viewing live stream')
      setStreamUrl('')
      setStreamInfo(null)
    } else {
      // No device selected
      setStreamUrl('')
      setStreamInfo(null)
      setError(null)
    }
  }, [selectedDevice])

  const startStreaming = async (device: Device) => {
    if (!device.authenticated) {
      setError('Device must be authenticated before streaming')
      return
    }

    setIsLoading(true)
    setError(null)
    setConnectionAttempts(prev => prev + 1)
    setLastStreamCheck(new Date())
    
    try {
      console.log(`🎬 Starting HLS stream for device: ${device.name}`)
      
      // Build HLS stream URL
      const hlsUrl = `http://localhost:3001/hls/${device.id}_hls/playlist.m3u8`
      console.log(`📡 HLS URL: ${hlsUrl}`)
      
      // Test if stream is available
      const streamResponse = await fetch(hlsUrl, { 
        method: 'HEAD',
        cache: 'no-cache'
      })
      
      if (streamResponse.ok) {
        console.log('✅ HLS stream is available')
        setStreamUrl(hlsUrl)
        setStreamInfo({
          quality: streamQuality,
          url: hlsUrl,
          status: 'connected'
        })
      } else {
        console.log('⚠️ HLS stream not ready, attempting to start...')
        
        // Try to start the stream
        const startResponse = await fetch(`http://localhost:3001/api/streams/${device.id}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            quality: streamQuality,
            profile: 'auto'
          })
        })
        
        if (startResponse.ok) {
          const data = await startResponse.json()
          console.log('✅ Stream start response:', data)
          
          // Wait a moment for stream to initialize, then set URL
          setTimeout(() => {
            setStreamUrl(hlsUrl)
            setStreamInfo({
              quality: streamQuality,
              url: hlsUrl,
              status: 'connecting'
            })
          }, 2000)
        } else {
          throw new Error(`Failed to start stream: ${startResponse.status}`)
        }
      }
      
    } catch (err: any) {
      console.error('❌ Failed to start streaming:', err)
      setError(`Failed to start streaming: ${err.message}`)
      setStreamInfo({
        quality: streamQuality,
        url: '',
        status: 'error',
        error: err.message
      })
    } finally {
      setIsLoading(false)
    }
  }

  const stopStreaming = async () => {
    if (!selectedDevice) return
    
    try {
      console.log(`⏹️ Stopping stream for device: ${selectedDevice.name}`)
      
      const response = await fetch(`http://localhost:3001/api/streams/${selectedDevice.id}/stop`, {
        method: 'POST'
      })
      
      if (response.ok) {
        console.log('✅ Stream stopped successfully')
      } else {
        console.warn('⚠️ Failed to stop stream properly')
      }
      
    } catch (err: any) {
      console.warn('⚠️ Error stopping stream:', err)
    } finally {
      setStreamUrl('')
      setStreamInfo(null)
      setError(null)
    }
  }

  const refreshStream = () => {
    if (selectedDevice) {
      console.log('🔄 Refreshing stream...')
      stopStreaming()
      setTimeout(() => {
        startStreaming(selectedDevice)
      }, 1000)
    }
  }

  const handleDeviceChange = (deviceId: string) => {
    const device = authenticatedDevices.find(d => d.id === deviceId)
    if (device && onDeviceSelect) {
      console.log('📱 Device selection changed:', device.name)
      stopStreaming() // Stop current stream first
      onDeviceSelect(device)
    }
  }

  const handlePlayerError = (errorMessage: string) => {
    console.error('🎥 Player error:', errorMessage)
    setError(`Player error: ${errorMessage}`)
    setStreamInfo(prev => prev ? {
      ...prev,
      status: 'error',
      error: errorMessage
    } : null)
  }

  const handlePlayerLoadStart = () => {
    console.log('🎥 Player load started')
    setStreamInfo(prev => prev ? {
      ...prev,
      status: 'connecting'
    } : null)
    setError(null)
  }

  const handlePlayerCanPlay = () => {
    console.log('✅ Player can play')
    setStreamInfo(prev => prev ? {
      ...prev,
      status: 'connected'
    } : null)
    setError(null)
  }

  const formatLastCheck = (date: Date | null) => {
    if (!date) return 'Never'
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="flex items-center space-x-2">
              <Video className="w-5 h-5" />
              <span>Live Video Streaming</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              View live streams from your authenticated devices • Camera ready
            </p>
          </div>
          
          <div className="flex items-center space-x-3 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {authenticatedDevices.length} Device{authenticatedDevices.length !== 1 ? 's' : ''} Ready
            </Badge>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={refreshStream}
              disabled={isLoading || !selectedDevice}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Device Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Camera className="w-5 h-5" />
                <span>Camera Selection</span>
              </CardTitle>
              <CardDescription>
                Choose a camera to view its live stream
              </CardDescription>
            </CardHeader>
            <CardContent>
              {authenticatedDevices.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No authenticated cameras available. Please authenticate at least one camera in the Device Discovery section.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Select Camera</label>
                      <Select
                        value={selectedDevice?.id || ''}
                        onValueChange={handleDeviceChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a camera" />
                        </SelectTrigger>
                        <SelectContent>
                          {authenticatedDevices.map((device) => (
                            <SelectItem key={device.id} value={device.id}>
                              <div className="flex items-center space-x-2">
                                <span>{device.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {device.status}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Stream Quality</label>
                      <Select
                        value={streamQuality}
                        onValueChange={setStreamQuality}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (Balanced)</SelectItem>
                          <SelectItem value="high">High (1080p)</SelectItem>
                          <SelectItem value="medium">Medium (720p)</SelectItem>
                          <SelectItem value="low">Low (480p)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {selectedDevice && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{selectedDevice.name}</div>
                          <div className="text-sm text-gray-600">
                            {selectedDevice.ip_address} • {selectedDevice.manufacturer} {selectedDevice.model}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="flex items-center space-x-1">
                            {streamInfo?.status === 'connected' ? (
                              <Wifi className="w-4 h-4 text-green-500" />
                            ) : (
                              <WifiOff className="w-4 h-4 text-gray-400" />
                            )}
                            <Badge variant={
                              streamInfo?.status === 'connected' ? 'default' : 
                              streamInfo?.status === 'connecting' ? 'secondary' : 
                              'destructive'
                            }>
                              {streamInfo?.status || 'disconnected'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      
                      {lastStreamCheck && (
                        <div className="text-xs text-gray-500 mt-2 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Last check: {formatLastCheck(lastStreamCheck)} • Attempts: {connectionAttempts}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Live Stream */}
          {selectedDevice && streamUrl && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <Monitor className="w-5 h-5" />
                      <span>Live Stream - {selectedDevice.name}</span>
                    </CardTitle>
                    <CardDescription>
                      {selectedDevice.ip_address} • Quality: {streamQuality} • Profile: auto
                    </CardDescription>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Badge variant={streamInfo?.status === 'connected' ? 'default' : 'secondary'}>
                      {streamInfo?.status === 'connected' ? 'LIVE' : streamInfo?.status || 'disconnected'}
                    </Badge>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={stopStreaming}
                      disabled={isLoading}
                    >
                      <Square className="w-4 h-4 mr-1" />
                      Stop
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <HLSPlayer
                    src={streamUrl}
                    deviceName={selectedDevice.name}
                    onError={handlePlayerError}
                    onLoadStart={handlePlayerLoadStart}
                    onCanPlay={handlePlayerCanPlay}
                    autoPlay={true}
                    muted={false}
                    controls={true}
                    isRecording={isRecording}
                    onStartRecording={() => setIsRecording(true)}
                    onStopRecording={() => setIsRecording(false)}
                    showRecordingControls={false}
                    className="w-full h-full"
                  />
                </div>
                
                {streamInfo && (
                  <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center space-x-4">
                      <div>Stream URL: <code className="text-xs bg-gray-100 px-1 rounded">{streamInfo.url}</code></div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        {streamInfo.status === 'connected' ? (
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        ) : (
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                        )}
                        <span className="capitalize">{streamInfo.status}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* No Device Selected State */}
          {!selectedDevice && authenticatedDevices.length > 0 && (
            <Card>
              <CardContent className="text-center py-12">
                <Monitor className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="font-medium text-gray-900 mb-2">Select a Camera</h3>
                <p className="text-gray-600 mb-4">
                  Choose an authenticated camera from the dropdown above to start viewing its live stream.
                </p>
                <div className="text-sm text-gray-500">
                  {authenticatedDevices.length} camera{authenticatedDevices.length !== 1 ? 's' : ''} available for streaming
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}