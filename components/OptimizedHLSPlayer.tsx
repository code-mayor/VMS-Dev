import React, { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  AlertTriangle,
  Wifi,
  WifiOff,
  RotateCcw,
  Loader2
} from 'lucide-react'

interface OptimizedHLSPlayerProps {
  src: string
  deviceName?: string
  autoPlay?: boolean
  isLive?: boolean
  onError?: (error: string) => void
  onLoadStart?: () => void
  onLoadEnd?: () => void
  className?: string
}

interface LiveStatus {
  isLive: boolean
  behindLive: number // seconds behind live
  bufferHealth: number // 0-100%
  segmentDuration: number
}

export function OptimizedHLSPlayer({
  src,
  deviceName = 'Camera',
  autoPlay = true,
  isLive = true,
  onError,
  onLoadStart,
  onLoadEnd,
  className = ''
}: OptimizedHLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({
    isLive: true,
    behindLive: 0,
    bufferHealth: 100,
    segmentDuration: 4 // Updated to 4 seconds as requested
  })
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error' | 'reconnecting'>('connecting')
  const [retryCount, setRetryCount] = useState(0)
  const [userPaused, setUserPaused] = useState(false)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  console.log('🎥 OptimizedHLSPlayer render:', {
    src,
    deviceName,
    isLive,
    connectionStatus,
    error
  })

  useEffect(() => {
    if (src) {
      initializePlayer()
    }
    return () => {
      destroyPlayer()
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }
  }, [src])

  useEffect(() => {
    if (isLive && !userPaused) {
      // Monitor live status every second
      const liveMonitor = setInterval(monitorLiveStatus, 1000)
      return () => clearInterval(liveMonitor)
    }
  }, [isLive, userPaused])

  const initializePlayer = async () => {
    const video = videoRef.current
    if (!video || !src) return

    console.log('🎥 Initializing HLS player for:', src)
    setIsLoading(true)
    setError(null)
    setConnectionStatus('connecting')
    onLoadStart?.()

    try {
      // First test if the HLS stream is accessible
      try {
        const testResponse = await fetch(src, { method: 'HEAD' })
        if (!testResponse.ok) {
          throw new Error(`Stream not accessible: ${testResponse.status}`)
        }
        console.log('✅ HLS stream accessibility test passed')
      } catch (fetchError) {
        console.warn('⚠️ HLS stream accessibility test failed:', fetchError)
        // Continue anyway - might be a CORS issue
      }

      // Check if HLS.js is available
      if (typeof window !== 'undefined' && (window as any).Hls) {
        const Hls = (window as any).Hls

        if (Hls.isSupported()) {
          console.log('🎥 Using HLS.js for optimized live streaming')

          const hls = new Hls({
            // IMPROVED HLS.js configuration for smoother playback
            enableWorker: true,
            lowLatencyMode: isLive,

            // Buffer settings optimized for smoothness vs latency (4-second chunks as requested)
            backBufferLength: isLive ? 8 : 30, // 4-second chunks x 2 for smoother playback
            maxBufferLength: isLive ? 16 : 30, // 4-second chunks x 4 for stability
            maxMaxBufferLength: isLive ? 24 : 60, // 4-second chunks x 6 for edge cases
            maxBufferSize: isLive ? 16 * 1000 * 1000 : 60 * 1000 * 1000, // 16MB for live streams (4-sec chunks)
            maxBufferHole: 1.0, // Increased tolerance for 4-second chunks

            // Buffer watchdog settings for stability
            highBufferWatchdogPeriod: 3, // Less aggressive buffer management
            nudgeOffset: 0.2, // Larger nudge for smoother seeking
            nudgeMaxRetry: 8, // More retry attempts

            // Live streaming optimizations (4-second chunks)
            liveSyncDurationCount: isLive ? 2 : 3, // 2 x 4-second segments = 8 seconds sync
            liveMaxLatencyDurationCount: isLive ? 4 : 10, // 4 x 4-second = 16 seconds max latency
            liveDurationInfinity: true,

            // ABR (Adaptive Bitrate) settings for stability
            abrEwmaFastLive: isLive ? 3 : 5, // Slower adaptation for stability
            abrEwmaSlowLive: isLive ? 10 : 20, // Much slower long-term adaptation
            abrMaxWithRealBitrate: true,
            abrBandWidthFactor: 0.8, // Conservative bandwidth estimation
            abrBandWidthUpFactor: 0.7, // Even more conservative for upgrades

            // Frame dropping and starvation prevention
            stretchShortVideoTrack: true,
            maxStarvationDelay: isLive ? 4 : 4, // Allow more time before considering starvation
            maxLoadingDelay: isLive ? 4 : 4,

            // Network recovery optimization
            levelLoadingTimeOut: 10000, // Longer timeout for level loading
            levelLoadingMaxRetry: 4,
            levelLoadingRetryDelay: 1000,

            // Fragment loading optimization
            fragLoadingTimeOut: 15000, // Increased timeout for stability
            fragLoadingMaxRetry: 6, // More retries
            fragLoadingRetryDelay: 1500,

            // Manifest loading optimization  
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 6,
            manifestLoadingRetryDelay: 1500,

            // Additional stability settings for 4-second chunks
            startFragPrefetch: true,
            testBandwidth: false, // Skip initial bandwidth test for faster startup
            capLevelToPlayerSize: false, // Don't limit quality to player size

            // Prevent "Too many packets buffered" error
            appendErrorMaxRetry: 3,
            loaderMaxRetry: 2,
            fragLoadingRetryMaxCount: 6, // More retries for 4-second chunks

            debug: false
          })

          // Enhanced event handlers for monitoring
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            console.log('🎥 HLS media attached')
          })

          hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log('🎥 HLS manifest parsed:', {
              levels: data.levels.length,
              firstLevel: data.firstLevel,
              duration: data.duration
            })
            setConnectionStatus('connected')
            setIsLoading(false)
            onLoadEnd?.()

            if (autoPlay && !userPaused) {
              video.play().catch(e => {
                console.warn('🎥 Autoplay failed, user interaction required')
                setIsPlaying(false)
              })
            }
          })

          hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
            console.log('🎥 Quality level switched:', data.level)
          })

          hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
            // Update live status on each fragment
            if (isLive) {
              updateLiveStatus()
            }
          })

          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('🎥 HLS error:', data)
            handleHLSError(data)
          })

          hls.on(Hls.Events.BUFFER_APPENDED, () => {
            if (isLive) {
              updateLiveStatus()
            }
          })

          // Handle network idle - common in live streams
          hls.on(Hls.Events.BUFFER_EOS, () => {
            console.log('🎥 End of stream reached')
            if (isLive) {
              // For live streams, this might be temporary
              setConnectionStatus('reconnecting')
            }
          })

          // Handle buffer stall events
          hls.on(Hls.Events.BUFFER_STALLED, () => {
            console.log('🎥 Buffer stalled - attempting recovery')
            if (isLive) {
              // For live streams, try to skip to live edge
              setTimeout(() => skipToLive(), 2000)
            }
          })

          hlsRef.current = hls
          hls.loadSource(src)
          hls.attachMedia(video)

        } else {
          throw new Error('HLS.js not supported in this browser')
        }
      } else {
        console.log('🎥 HLS.js not available, checking native HLS support')
        // Fallback to native HLS support
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          console.log('🎥 Using native HLS support')
          video.src = src
          setConnectionStatus('connected')
          setIsLoading(false)
          onLoadEnd?.()

          if (autoPlay && !userPaused) {
            video.play().catch(e => {
              console.warn('🎥 Autoplay failed')
            })
          }
        } else {
          // Try loading HLS.js dynamically
          console.log('🎥 Attempting to load HLS.js dynamically')
          await loadHLSJS()
          // Retry initialization after loading HLS.js
          setTimeout(() => initializePlayer(), 1000)
          return
        }
      }

    } catch (error: any) {
      console.error('🎥 Player initialization failed:', error)
      setError(error.message)
      setConnectionStatus('error')
      setIsLoading(false)
      onError?.(error.message)

      // Auto-retry for certain errors
      if (retryCount < 3 && (
        error.message.includes('not accessible') ||
        error.message.includes('network') ||
        error.message.includes('timeout')
      )) {
        console.log(`🔄 Auto-retrying initialization (attempt ${retryCount + 1}/3)`)
        retryTimeoutRef.current = setTimeout(() => {
          setRetryCount(prev => prev + 1)
          initializePlayer()
        }, 2000 * (retryCount + 1))
      }
    }
  }

  const loadHLSJS = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).Hls) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest'
      script.onload = () => {
        console.log('✅ HLS.js loaded dynamically')
        resolve()
      }
      script.onerror = () => {
        console.error('❌ Failed to load HLS.js')
        reject(new Error('Failed to load HLS.js'))
      }
      document.head.appendChild(script)
    })
  }

  const destroyPlayer = () => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy()
      } catch (error) {
        console.warn('⚠️ Error destroying HLS player:', error)
      }
      hlsRef.current = null
    }
  }

  const handleHLSError = (data: any) => {
    const { type, details, fatal } = data

    console.error('🎥 HLS Error Details:', { type, details, fatal })

    if (fatal) {
      switch (type) {
        case 'networkError':
          console.error('🎥 Network error, attempting recovery...')
          setConnectionStatus('reconnecting')
          if (retryCount < 5) {
            retryTimeoutRef.current = setTimeout(() => {
              if (hlsRef.current) {
                hlsRef.current.startLoad()
                setRetryCount(prev => prev + 1)
              }
            }, 3000 * (retryCount + 1)) // Longer delays between retries
          } else {
            setError('Network connection failed after multiple retries. Please check your connection.')
            setConnectionStatus('error')
          }
          break

        case 'mediaError':
          console.error('🎥 Media error, attempting recovery...')
          if (hlsRef.current) {
            hlsRef.current.recoverMediaError()
          }
          break

        default:
          setError(`Streaming error: ${details}`)
          setConnectionStatus('error')
          break
      }
    } else {
      console.warn('🎥 Non-fatal HLS error:', details)
    }
  }

  const monitorLiveStatus = () => {
    const video = videoRef.current
    const hls = hlsRef.current

    if (!video || !hls || !isLive) return

    try {
      const currentTime = video.currentTime
      const duration = video.duration

      if (duration && currentTime) {
        const behindLive = Math.max(0, duration - currentTime)
        const bufferEnd = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0
        const bufferHealth = Math.min(100, Math.max(0, ((bufferEnd - currentTime) / 6) * 100)) // Based on 6-second buffer

        setLiveStatus(prev => ({
          ...prev,
          isLive: behindLive < 6, // Consider live if less than 6 seconds behind
          behindLive,
          bufferHealth
        }))

        // Auto skip to live if too far behind (8 seconds for 4-second chunks, don't show "Loading" unless paused 8+ seconds)
        if (behindLive > 8 && !userPaused && !video.paused) {
          console.log('🎥 Auto-skipping to live edge, behind by:', behindLive)
          skipToLive()
        }

        // Only show loading indicator if paused for 8+ seconds (as requested)
        const shouldShowLoading = video.paused || Boolean(video.onwaiting) || (behindLive > 8 && !userPaused)
        if (shouldShowLoading !== isLoading) {
          setIsLoading(!!shouldShowLoading)
        }
      }
    } catch (error) {
      console.warn('🎥 Live status monitoring error:', error)
    }
  }

  const updateLiveStatus = () => {
    const video = videoRef.current
    if (!video || !isLive) return

    const bufferEnd = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0
    const currentTime = video.currentTime
    const bufferHealth = Math.min(100, Math.max(0, ((bufferEnd - currentTime) / 6) * 100))

    setLiveStatus(prev => ({
      ...prev,
      bufferHealth
    }))
  }

  const skipToLive = () => {
    const video = videoRef.current
    const hls = hlsRef.current

    if (!video || !hls || !isLive) return

    try {
      console.log('🎥 Skipping to live edge')

      // Get the live edge time
      const liveSyncPosition = hls.liveSyncPosition
      if (liveSyncPosition !== null && liveSyncPosition > 0) {
        video.currentTime = liveSyncPosition
      } else {
        // Fallback: jump to end of buffer with larger offset
        const bufferEnd = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0
        if (bufferEnd > 0) {
          video.currentTime = bufferEnd - 1 // 1 second offset from end for stability
        }
      }

      setLiveStatus(prev => ({ ...prev, isLive: true, behindLive: 0 }))

    } catch (error) {
      console.error('🎥 Skip to live failed:', error)
    }
  }

  const handlePlayPause = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      setUserPaused(false)
      video.play().then(() => {
        setIsPlaying(true)
      }).catch(error => {
        console.error('🎥 Play failed:', error)
      })
    } else {
      setUserPaused(true)
      video.pause()
      setIsPlaying(false)
    }
  }

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current
    if (!video) return

    setVolume(newVolume)
    video.volume = newVolume
    setIsMuted(newVolume === 0)
  }

  const handleMuteToggle = () => {
    const video = videoRef.current
    if (!video) return

    if (isMuted) {
      video.volume = volume
      setIsMuted(false)
    } else {
      video.volume = 0
      setIsMuted(true)
    }
  }

  const handleFullscreen = () => {
    const video = videoRef.current
    if (!video) return

    if (video.requestFullscreen) {
      video.requestFullscreen()
    }
  }

  const retryConnection = () => {
    setRetryCount(0)
    setError(null)
    initializePlayer()
  }

  // Event handlers
  const handleVideoPlay = () => setIsPlaying(true)
  const handleVideoPause = () => setIsPlaying(false)
  const handleVideoWaiting = () => setIsLoading(true)
  const handleVideoCanPlay = () => setIsLoading(false)

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-500" />
      case 'connecting':
      case 'reconnecting':
        return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
      case 'error':
        return <WifiOff className="w-4 h-4 text-red-500" />
      default:
        return <Wifi className="w-4 h-4 text-gray-500" />
    }
  }

  const getConnectionText = () => {
    switch (connectionStatus) {
      case 'connected':
        return liveStatus.isLive ? 'LIVE' : `${Math.round(liveStatus.behindLive)}s behind`
      case 'connecting':
        return 'Connecting...'
      case 'reconnecting':
        return 'Reconnecting...'
      case 'error':
        return 'Connection Error'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      {/* Status Bar */}
      <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Badge
            variant={connectionStatus === 'connected' && liveStatus.isLive ? 'destructive' : 'secondary'}
            className="text-xs flex items-center space-x-1"
          >
            {getConnectionIcon()}
            <span>{getConnectionText()}</span>
          </Badge>

          <Badge variant="outline" className="text-xs bg-black/50 text-white border-white/30">
            {deviceName}
          </Badge>
        </div>

        {isLive && !liveStatus.isLive && connectionStatus === 'connected' && (
          <Button
            onClick={skipToLive}
            size="sm"
            variant="destructive"
            className="text-xs h-6 px-2"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Go Live
          </Button>
        )}
      </div>

      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted={isMuted}
        onPlay={handleVideoPlay}
        onPause={handleVideoPause}
        onWaiting={handleVideoWaiting}
        onCanPlay={handleVideoCanPlay}
        style={{ aspectRatio: '16/9' }}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="text-white text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div className="text-sm">Loading stream...</div>
            {src && (
              <div className="text-xs opacity-75 mt-1 break-all max-w-xs">
                {src}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-10">
          <div className="text-white text-center max-w-md p-4">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
            <div className="text-sm mb-4">{error}</div>
            <div className="text-xs mb-4 opacity-75 break-all">
              Stream: {src}
            </div>
            <Button onClick={retryConnection} size="sm" variant="outline">
              Retry Connection
            </Button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 z-20">
        {/* Buffer Health Indicator */}
        {isLive && connectionStatus === 'connected' && (
          <div className="mb-2">
            <Progress
              value={liveStatus.bufferHealth}
              className="h-1 bg-white/20"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              onClick={handlePlayPause}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              disabled={connectionStatus === 'error'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>

            <div className="flex items-center space-x-2">
              <Button
                onClick={handleMuteToggle}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              <div className="w-20">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          <Button
            onClick={handleFullscreen}
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20"
          >
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}