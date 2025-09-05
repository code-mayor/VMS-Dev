import React, { useRef, useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Play, Pause, RotateCcw, Volume2, VolumeX, AlertTriangle, Wifi } from 'lucide-react'

interface WebRTCVideoPlayerProps {
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

export function WebRTCVideoPlayer({ device, className = '', autoStart = false }: WebRTCVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  
  const [isConnecting, setIsConnecting] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown')

  useEffect(() => {
    if (autoStart) {
      startWebRTCStream()
    }
    
    return () => {
      cleanup()
    }
  }, [device.id, autoStart])

  const cleanup = () => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    
    setIsStreaming(false)
    setIsConnecting(false)
  }

  const startWebRTCStream = async () => {
    try {
      setIsConnecting(true)
      setError('')
      
      console.log('🎥 Starting WebRTC stream for:', device.name)
      
      // Create WebRTC peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      })
      
      pcRef.current = pc
      
      // Setup event handlers
      pc.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', pc.iceConnectionState)
        
        switch (pc.iceConnectionState) {
          case 'connected':
          case 'completed':
            setConnectionQuality('excellent')
            setIsStreaming(true)
            setIsConnecting(false)
            break
          case 'disconnected':
            setConnectionQuality('poor')
            break
          case 'failed':
            setError('WebRTC connection failed - falling back to HLS')
            cleanup()
            break
        }
      }
      
      pc.ontrack = (event) => {
        console.log('📺 Received WebRTC track:', event.track.kind)
        
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0]
          videoRef.current.play().catch(console.error)
        }
      }
      
      // Add transceiver for receiving video
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })
      
      // Create WebSocket connection to signaling server
      const ws = new WebSocket(`ws://localhost:3001/webrtc/signal/${device.id}`)
      wsRef.current = ws
      
      ws.onopen = async () => {
        console.log('📡 WebSocket connected for WebRTC signaling')
        
        // Create offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        // Send offer with device credentials
        ws.send(JSON.stringify({
          type: 'offer',
          sdp: offer,
          deviceId: device.id,
          rtspUrl: `rtsp://${device.rtsp_username}:${device.rtsp_password}@${device.ip_address}:554/profile1`
        }))
      }
      
      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data)
        
        if (message.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(message))
        } else if (message.type === 'ice-candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate))
        } else if (message.type === 'webrtc-error') {
          console.warn('⚠️ WebRTC not available:', message.error)
          setError(`WebRTC unavailable: ${message.error}`)
          cleanup()
        } else if (message.type === 'webrtc-warning') {
          console.warn('⚠️ WebRTC warning:', message.message)
          // Don't stop the stream, just log the warning
        } else if (message.type === 'error') {
          setError(`WebRTC Error: ${message.error}`)
          cleanup()
        }
      }
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        setError('WebRTC signaling failed - check server connection')
        cleanup()
      }
      
      ws.onclose = () => {
        console.log('📡 WebSocket closed')
        if (isStreaming) {
          setError('WebRTC connection lost')
          cleanup()
        }
      }
      
    } catch (error: any) {
      console.error('❌ WebRTC setup failed:', error)
      setError(`WebRTC setup failed: ${error.message}`)
      setIsConnecting(false)
    }
  }

  const stopStream = () => {
    console.log('⏹️ Stopping WebRTC stream')
    cleanup()
    setError('')
  }

  const toggleAudio = () => {
    if (videoRef.current) {
      videoRef.current.muted = audioEnabled
      setAudioEnabled(!audioEnabled)
    }
  }

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-green-600'
      case 'good': return 'text-yellow-600'
      case 'poor': return 'text-red-600'
      default: return 'text-gray-600'
    }
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
            <p className="text-lg font-medium">Connecting WebRTC Stream...</p>
            <p className="text-sm text-gray-300 mt-2">Establishing P2P connection</p>
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
                <Button onClick={startWebRTCStream} size="sm" variant="outline">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Retry WebRTC
                </Button>
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
              <Button onClick={startWebRTCStream} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Play className="w-4 h-4 mr-2" />
                Start WebRTC
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
          </div>
          
          <div className="flex items-center space-x-2">
            {isStreaming && (
              <>
                <Badge variant="secondary" className="bg-green-600 text-white">
                  <Wifi className="w-3 h-3 mr-1" />
                  WebRTC Live
                </Badge>
                
                <Badge variant="outline" className={`${getQualityColor(connectionQuality)} border-current`}>
                  {connectionQuality}
                </Badge>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}