import React, { useEffect, useState } from 'react'
import { AlertTriangle, Play, Pause, Wifi } from 'lucide-react'

interface WebRTCPlayerProps {
  src: string
  autoPlay?: boolean
  muted?: boolean
  onError?: (error: string) => void
  onConnect?: () => void
  className?: string
}

export function WebRTCPlayer({ 
  src, 
  autoPlay = false, 
  muted = false, 
  onError, 
  onConnect,
  className = "w-full h-full"
}: WebRTCPlayerProps) {
  const [isConnecting, setIsConnecting] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!src) return

    setIsConnecting(true)
    setError(null)

    // Simulate WebRTC connection
    const connectWebRTC = async () => {
      try {
        // Simulate WebRTC setup delay
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        setIsConnecting(false)
        setIsConnected(true)
        onConnect?.()
        
        if (autoPlay) {
          setIsPlaying(true)
        }
      } catch (err: any) {
        setError(`WebRTC connection failed: ${err.message}`)
        setIsConnecting(false)
        onError?.(err.message)
      }
    }

    connectWebRTC()
  }, [src, autoPlay, onError, onConnect])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  if (error) {
    return (
      <div className={`bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center text-white p-6">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-red-500" />
          <p className="text-sm">WebRTC Connection Error</p>
          <p className="text-xs opacity-75 mt-1">{error}</p>
          <p className="text-xs opacity-50 mt-2">WebRTC requires HTTPS in production</p>
        </div>
      </div>
    )
  }

  if (isConnecting) {
    return (
      <div className={`bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center text-white">
          <div className="animate-pulse">
            <Wifi className="w-8 h-8 mx-auto mb-3 text-blue-400" />
          </div>
          <p className="text-sm">Establishing WebRTC Connection...</p>
          <p className="text-xs opacity-75 mt-1">Setting up peer connection</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative bg-gray-900 ${className}`}>
      {/* Demo WebRTC stream display */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-blue-900/50">
        <div className="text-center text-white">
          <button
            onClick={handlePlayPause}
            className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4 mx-auto hover:bg-purple-500/30 transition-colors border-2 border-purple-500/30"
          >
            {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
          </button>
          
          <div className="space-y-2">
            <p className="text-lg font-medium">WebRTC Stream</p>
            <p className="text-sm opacity-75">Ultra-low latency streaming</p>
            <p className="text-xs opacity-50">
              {src.replace('ws://', 'wss://')}
            </p>
            
            <div className="flex items-center justify-center space-x-4 mt-4">
              <div className="flex items-center space-x-1 text-xs">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Real-time</span>
              </div>
              
              <div className="flex items-center space-x-1 text-xs">
                <Wifi className="w-3 h-3" />
                <span>P2P Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connection quality indicator */}
      <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-xs flex items-center space-x-1">
        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
        <span>WebRTC</span>
      </div>
    </div>
  )
}