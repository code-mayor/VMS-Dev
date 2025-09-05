import React, { useEffect, useState } from 'react'
import { AlertTriangle, Play, Pause, Settings } from 'lucide-react'

interface OnvifVideoStreamProps {
  device: any
  streamUrl: string
  autoPlay?: boolean
  onError?: (error: string) => void
  onConnect?: () => void
  className?: string
}

export function OnvifVideoStream({ 
  device, 
  streamUrl, 
  autoPlay = false, 
  onError, 
  onConnect,
  className = "w-full h-full"
}: OnvifVideoStreamProps) {
  const [isConnecting, setIsConnecting] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!streamUrl || !device) return

    setIsConnecting(true)
    setError(null)

    // Simulate ONVIF connection
    const connectToStream = async () => {
      try {
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        setIsConnecting(false)
        setIsConnected(true)
        onConnect?.()
        
        if (autoPlay) {
          setIsPlaying(true)
        }
      } catch (err: any) {
        setError(`ONVIF connection failed: ${err.message}`)
        setIsConnecting(false)
        onError?.(err.message)
      }
    }

    connectToStream()
  }, [streamUrl, device, autoPlay, onError, onConnect])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  if (error) {
    return (
      <div className={`bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center text-white p-6">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-red-500" />
          <p className="text-sm">ONVIF Stream Error</p>
          <p className="text-xs opacity-75 mt-1">{error}</p>
          <p className="text-xs opacity-50 mt-2">Check device credentials and network connectivity</p>
        </div>
      </div>
    )
  }

  if (isConnecting) {
    return (
      <div className={`bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent mx-auto mb-3"></div>
          <p className="text-sm">Connecting to ONVIF Device...</p>
          <p className="text-xs opacity-75 mt-1">{device.name}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative bg-gray-900 ${className}`}>
      {/* Demo ONVIF stream display */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
        <div className="text-center text-white">
          <button
            onClick={handlePlayPause}
            className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 mx-auto hover:bg-blue-500/30 transition-colors border-2 border-blue-500/30"
          >
            {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
          </button>
          
          <div className="space-y-2">
            <p className="text-lg font-medium">ONVIF Stream</p>
            <p className="text-sm opacity-75">{device.name}</p>
            <p className="text-xs opacity-50">
              {streamUrl.replace(/\/\/.*:.*@/, '//<credentials>@')}
            </p>
            
            <div className="flex items-center justify-center space-x-4 mt-4">
              <div className="flex items-center space-x-1 text-xs">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Connected</span>
              </div>
              
              <div className="flex items-center space-x-1 text-xs">
                <Settings className="w-3 h-3" />
                <span>ONVIF Profile</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
        {isPlaying ? 'LIVE' : 'PAUSED'}
      </div>
    </div>
  )
}