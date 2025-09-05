import React, { useRef, useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Play, Pause, RotateCcw, Volume2, VolumeX, AlertTriangle, Radio, Loader2 } from 'lucide-react'

interface HLSVideoPlayerProps {
  device: {
    id: string
    name: string
    ip_address: string
    rtsp_username?: string
    rtsp_password?: string
  }
  className?: string
  autoStart?: boolean
}

export function HLSVideoPlayer({ device, className = '', autoStart = false }: HLSVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [streamHealth, setStreamHealth] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (autoStart) {
      startHLSStream()
    }
    
    return () => {
      cleanup()
    }
  }, [device.id, autoStart])

  const cleanup = () => {
    if (videoRef.current) {
      videoRef.current.src = ''
      videoRef.current.load()
    }
    setIsStreaming(false)
    setIsConnecting(false)
    setStreamHealth('unknown')
  }

  const startHLSStream = async () => {
    try {
      setIsConnecting(true)
      setError('')
      setRetryCount(prev => prev + 1)
      
      console.log('🎥 Starting HLS stream for:', device.name)
      
      // Request HLS stream from backend
      const response = await fetch('http://localhost:3001/api/streams/start-hls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.id,
          rtspUrl: `rtsp://${device.rtsp_username}:${device.rtsp_password}@${device.ip_address}:554/profile1`
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start HLS stream')
      }

      console.log('✅ HLS stream started:', data.streamUrl)
      
      // Load HLS stream in video element
      if (videoRef.current && data.streamUrl) {
        videoRef.current.src = data.streamUrl
        videoRef.current.load()
        
        // Set up event listeners
        videoRef.current.onloadstart = () => {
          console.log('📺 HLS stream loading...')
          setStreamHealth('good')
        }
        
        videoRef.current.oncanplay = () => {
          console.log('📺 HLS stream ready to play')
          setIsConnecting(false)
          setIsStreaming(true)
          setStreamHealth('excellent')
          videoRef.current?.play().catch(console.error)
        }
        
        videoRef.current.onerror = (e) => {
          console.error('❌ HLS video error:', e)
          setError('Video playback error - stream may be unstable')
          setStreamHealth('poor')
        }
        
        videoRef.current.onstalled = () => {
          console.warn('⚠️ HLS stream stalled')
          setStreamHealth('poor')
        }
        
        videoRef.current.onwaiting = () => {
          console.log('⏳ HLS stream buffering...')
          setStreamHealth('good')
        }
        
        videoRef.current.onplaying = () => {
          console.log('▶️ HLS stream playing')
          setStreamHealth('excellent')
        }
      }
      
    } catch (error: any) {
      console.error('❌ HLS stream setup failed:', error)
      setError(`HLS streaming failed: ${error.message}`)
      setIsConnecting(false)
      setStreamHealth('poor')
      
      // Auto-retry logic for common issues
      if (retryCount < 3 && (
        error.message?.includes('timeout') || 
        error.message?.includes('network') ||
        error.message?.includes('connection')
      )) {
        console.log(`🔄 Auto-retrying HLS stream (${retryCount}/3)...`)
        setTimeout(() => startHLSStream(), 2000 * retryCount) // Exponential backoff
      }
    }
  }

  const stopStream = async () => {
    try {
      console.log('⏹️ Stopping HLS stream')
      
      // Stop backend stream
      await fetch('http://localhost:3001/api/streams/stop-hls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id })
      })
      
      cleanup()
      setError('')
      setRetryCount(0)
      
    } catch (error: any) {
      console.error('❌ Failed to stop HLS stream:', error)
      cleanup() // Clean up anyway
    }
  }

  const toggleAudio = () => {
    if (videoRef.current) {
      videoRef.current.muted = audioEnabled
      setAudioEnabled(!audioEnabled)
    }
  }

  const retryStream = () => {
    console.log('🔄 Manual HLS stream retry')
    cleanup()
    setError('')
    setRetryCount(0)
    setTimeout(() => startHLSStream(), 500)
  }

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'excellent': return 'text-green-600'
      case 'good': return 'text-yellow-600'
      case 'poor': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getHealthBadge = () => {
    const colors = {
      excellent: 'bg-green-100 text-green-800',
      good: 'bg-yellow-100 text-yellow-800', 
      poor: 'bg-red-100 text-red-800',
      unknown: 'bg-gray-100 text-gray-800'
    }

    return (
      <Badge className={colors[streamHealth]}>
        <Radio className="w-3 h-3 mr-1" />
        HLS {streamHealth}
      </Badge>
    )
  }

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted={!audioEnabled}
        controls={false}
      />
      
      {/* Loading Overlay */}
      {isConnecting && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium">Starting HLS Stream...</p>
            <p className="text-sm text-gray-300 mt-2">
              {retryCount > 1 ? `Attempt ${retryCount}/3` : 'Initializing stream'}
            </p>
          </div>
        </div>
      )}
      
      {/* Error Overlay */}
      {error && !isConnecting && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-md">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div>{error}</div>
                <div className="flex space-x-2">
                  <Button onClick={retryStream} size="sm" variant="outline">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Retry HLS
                  </Button>
                  {retryCount >= 3 && (
                    <Button onClick={() => setError('')} size="sm" variant="ghost">
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}
      
      {/* Control Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {!isStreaming && !isConnecting ? (
              <Button onClick={startHLSStream} size="sm" className="bg-green-600 hover:bg-green-700">
                <Play className="w-4 h-4 mr-2" />
                Start HLS
              </Button>
            ) : (
              <Button onClick={stopStream} size="sm" variant="destructive">
                <Pause className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
            
            <Button
              onClick={toggleAudio}
              size="sm"
              variant="outline"
              disabled={!isStreaming}
              className="text-white border-white hover:bg-white hover:text-black"
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            
            {error && retryCount < 3 && (
              <Button
                onClick={retryStream}
                size="sm"
                variant="outline"
                className="text-white border-white hover:bg-white hover:text-black"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {isStreaming && (
              <Badge variant="secondary" className="bg-green-600 text-white">
                <Radio className="w-3 h-3 mr-1" />
                HLS Live
              </Badge>
            )}
            {getHealthBadge()}
          </div>
        </div>
      </div>
    </div>
  )
}