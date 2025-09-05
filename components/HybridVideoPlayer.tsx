import React, { useState, useRef, useEffect } from 'react'
import { HLSVideoPlayer } from './HLSVideoPlayer'
import { WebRTCVideoPlayer } from './WebRTCVideoPlayer'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings, 
  Wifi, 
  Radio, 
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react'

interface HybridVideoPlayerProps {
  device: {
    id: string
    name: string
    ip_address: string
    rtsp_username?: string
    rtsp_password?: string
    authenticated?: boolean
  }
  className?: string
  autoStart?: boolean
  preferredMode?: 'hls' | 'webrtc' | 'auto'
}

export function HybridVideoPlayer({ 
  device, 
  className = '', 
  autoStart = false,
  preferredMode = 'auto'
}: HybridVideoPlayerProps) {
  const [activeMode, setActiveMode] = useState<'hls' | 'webrtc'>('hls')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingError, setStreamingError] = useState('')
  const [streamQuality, setStreamQuality] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown')
  const [fallbackAttempted, setFallbackAttempted] = useState(false)

  useEffect(() => {
    // Determine initial mode based on preference and device capabilities
    if (preferredMode === 'auto') {
      // Auto-select based on device authentication and network conditions
      if (device.authenticated && device.rtsp_username) {
        setActiveMode('webrtc') // Try WebRTC first for authenticated devices
      } else {
        setActiveMode('hls') // Fall back to HLS
      }
    } else {
      setActiveMode(preferredMode)
    }
  }, [preferredMode, device.authenticated])

  const handleStreamStart = () => {
    setIsStreaming(true)
    setStreamingError('')
    setStreamQuality('good')
  }

  const handleStreamError = (error: string) => {
    console.warn(`⚠️ ${activeMode.toUpperCase()} streaming error:`, error)
    setStreamingError(error)
    setStreamQuality('poor')
    
    // Auto-fallback logic
    if (!fallbackAttempted) {
      setFallbackAttempted(true)
      
      if (activeMode === 'webrtc') {
        console.log('🔄 WebRTC failed, falling back to HLS...')
        setTimeout(() => {
          setActiveMode('hls')
          setStreamingError('')
        }, 1000)
      } else if (activeMode === 'hls') {
        console.log('🔄 HLS failed - no further fallback available')
        // Don't fallback to WebRTC since it's not implemented
        setStreamingError('Both streaming methods failed. Check device credentials and connectivity.')
      }
    }
  }

  const handleStreamStop = () => {
    setIsStreaming(false)
    setStreamingError('')
    setStreamQuality('unknown')
    setFallbackAttempted(false)
  }

  const handleModeSwitch = (newMode: 'hls' | 'webrtc') => {
    console.log(`🔄 Manually switching from ${activeMode} to ${newMode}`)
    setActiveMode(newMode)
    setStreamingError('')
    setFallbackAttempted(false)
    setStreamQuality('unknown')
  }

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'hls':
        return <Radio className="w-4 h-4" />
      case 'webrtc':
        return <Wifi className="w-4 h-4" />
      default:
        return <Play className="w-4 h-4" />
    }
  }

  const getModeDescription = (mode: string) => {
    switch (mode) {
      case 'hls':
        return 'HTTP Live Streaming - Reliable, higher latency'
      case 'webrtc':
        return 'WebRTC - Low latency, direct P2P connection'
      default:
        return 'Unknown streaming mode'
    }
  }

  const getQualityBadge = () => {
    const colors = {
      excellent: 'bg-green-100 text-green-800',
      good: 'bg-yellow-100 text-yellow-800',
      poor: 'bg-red-100 text-red-800',
      unknown: 'bg-gray-100 text-gray-800'
    }

    return (
      <Badge className={colors[streamQuality]}>
        {streamQuality === 'excellent' && <CheckCircle className="w-3 h-3 mr-1" />}
        {streamQuality === 'poor' && <AlertTriangle className="w-3 h-3 mr-1" />}
        {streamQuality === 'unknown' && <Clock className="w-3 h-3 mr-1" />}
        {streamQuality}
      </Badge>
    )
  }

  if (!device.authenticated) {
    return (
      <div className={`relative bg-gray-900 rounded-lg flex items-center justify-center ${className}`}>
        <div className="text-center text-white p-8">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
          <h3 className="text-xl font-medium mb-2">Device Not Authenticated</h3>
          <p className="text-gray-300 mb-4">
            Please authenticate this device to enable video streaming
          </p>
          <Button variant="outline" className="text-white border-white hover:bg-white hover:text-black">
            <Settings className="w-4 h-4 mr-2" />
            Authenticate Device
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Streaming Mode Tabs */}
      <Tabs value={activeMode} onValueChange={(value) => handleModeSwitch(value as 'hls' | 'webrtc')}>
        <div className="flex items-center justify-between">
          <TabsList className="grid w-auto grid-cols-2">
            <TabsTrigger value="webrtc" className="flex items-center space-x-2">
              {getModeIcon('webrtc')}
              <span>WebRTC</span>
            </TabsTrigger>
            <TabsTrigger value="hls" className="flex items-center space-x-2">
              {getModeIcon('hls')}
              <span>HLS</span>
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center space-x-2">
            {isStreaming && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Play className="w-3 h-3 mr-1" />
                Live
              </Badge>
            )}
            {getQualityBadge()}
          </div>
        </div>

        {/* WebRTC Player */}
        <TabsContent value="webrtc" className="space-y-4">
          <div className="text-sm text-gray-600 p-3 bg-blue-50 rounded border">
            <strong>WebRTC Mode:</strong> {getModeDescription('webrtc')}
            {fallbackAttempted && activeMode === 'webrtc' && (
              <span className="ml-2 text-blue-600">(Auto-fallback from HLS)</span>
            )}
          </div>
          
          <WebRTCVideoPlayer
            device={device}
            className="aspect-video"
            autoStart={autoStart}
          />
        </TabsContent>

        {/* HLS Player */}
        <TabsContent value="hls" className="space-y-4">
          <div className="text-sm text-gray-600 p-3 bg-green-50 rounded border">
            <strong>HLS Mode:</strong> {getModeDescription('hls')}
            {fallbackAttempted && activeMode === 'hls' && (
              <span className="ml-2 text-green-600">(Auto-fallback from WebRTC)</span>
            )}
          </div>
          
          <HLSVideoPlayer
            device={device}
            className="aspect-video"
            autoStart={autoStart}
          />
        </TabsContent>
      </Tabs>

      {/* Stream Status and Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="text-sm">
            <div className="font-medium">{device.name}</div>
            <div className="text-gray-600">{device.ip_address}</div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {streamingError && (
            <Alert variant="destructive" className="max-w-md">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {streamingError}
                {!fallbackAttempted && (
                  <Button 
                    onClick={() => handleModeSwitch(activeMode === 'hls' ? 'webrtc' : 'hls')}
                    size="sm" 
                    variant="outline" 
                    className="ml-2"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Try {activeMode === 'hls' ? 'WebRTC' : 'HLS'}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Mode Comparison Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
        <div className="p-3 bg-blue-50 rounded border">
          <div className="flex items-center space-x-2 mb-1">
            <Wifi className="w-4 h-4 text-blue-600" />
            <strong>WebRTC Benefits:</strong>
          </div>
          <ul className="space-y-1">
            <li>• Ultra-low latency (~100ms)</li>
            <li>• Direct P2P connection</li>
            <li>• Better for real-time monitoring</li>
          </ul>
        </div>
        
        <div className="p-3 bg-green-50 rounded border">
          <div className="flex items-center space-x-2 mb-1">
            <Radio className="w-4 h-4 text-green-600" />
            <strong>HLS Benefits:</strong>
          </div>
          <ul className="space-y-1">
            <li>• More reliable connection</li>
            <li>• Better for unstable networks</li>
            <li>• Standard HTTP streaming</li>
          </ul>
        </div>
      </div>
    </div>
  )
}