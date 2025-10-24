import React, { useRef, useEffect, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipForward,
  Wifi,
  WifiOff,
  Clock,
  Loader2
} from 'lucide-react'

const segmentLoadCounts = new Map<string, number>()

interface HLSPlayerProps {
  src: string
  deviceName?: string
  onError?: (error: string) => void
  onLoadStart?: () => void
  onLoadEnd?: () => void
  onCanPlay?: () => void
  autoPlay?: boolean
  muted?: boolean
  controls?: boolean
  className?: string
  isRecording?: boolean
  onStartRecording?: () => void
  onStopRecording?: () => void
  showRecordingControls?: boolean
}

export function HLSPlayer({
  src,
  deviceName = 'Unknown Device',
  onError,
  onLoadStart,
  onLoadEnd,
  onCanPlay,
  autoPlay = true,
  muted = false,
  controls = true,
  className = '',
  isRecording = false,
  onStartRecording,
  onStopRecording,
  showRecordingControls = false
}: HLSPlayerProps) {

  const hasLoggedRef = useRef(false);

  if (!hasLoggedRef.current) {
    console.log(`[HLSPlayer] Attempting to play: ${src} for device: ${deviceName}`);
    hasLoggedRef.current = true;
  }

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const freezeDetectionRef = useRef<NodeJS.Timeout | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(muted)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(true)
  const [liveLocked, setLiveLocked] = useState(false)
  const [hasShownSkipToLive, setHasShownSkipToLive] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [latency, setLatency] = useState(0)
  const [bufferStalled, setBufferStalled] = useState(false)
  const [lastSegmentLoadTime, setLastSegmentLoadTime] = useState(0)
  const [lastPlayTime, setLastPlayTime] = useState(0)
  const [showMinimalLoading, setShowMinimalLoading] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [maxRetries] = useState(5)
  const DEBUG_MODE = false // Set to true only when debugging
  const [streamHealth, setStreamHealth] = useState<'live' | 'warning' | 'error'>('live')
  const [lastSegmentTime, setLastSegmentTime] = useState<number>(Date.now())
  const [segmentLoadFailures, setSegmentLoadFailures] = useState(0)
  const [actualLatency, setActualLatency] = useState(0)

  // Then inside HLSPlayer component, replace useState with:
  const [segmentLoadCount, setSegmentLoadCountState] = useState(
    segmentLoadCounts.get(deviceName) || 0
  )

  // Create a wrapper to update both state and map
  const setSegmentLoadCount = (value: number | ((prev: number) => number)) => {
    setSegmentLoadCountState(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value
      segmentLoadCounts.set(deviceName, newValue)
      return newValue
    })
  }

  // Ultra-low latency HLS configuration for 1-second segments
  const hlsConfig = {
    // Buffer management - OPTIMIZED FOR LOW LATENCY
    maxBufferLength: 3,                    // ⚠️ Only 3 seconds buffer (was 8)
    maxBufferSize: 5 * 1024 * 1024,        // 5MB buffer
    maxBufferHole: 0.3,                    // Small hole tolerance

    // Quality selection
    startLevel: -1,                        // Auto-select
    maxMaxBufferLength: 6,                 // Max 6 seconds

    // Live streaming - ULTRA LOW LATENCY
    liveSyncDurationCount: 1,              // ⚠️ Stay only 1 segment behind (was 2)
    liveMaxLatencyDurationCount: 2,        // ⚠️ Max 2 segments latency (was 3)
    liveDurationInfinity: false,

    // Fragment loading - AGGRESSIVE
    manifestLoadingTimeOut: 3000,          // 3 seconds
    manifestLoadingMaxRetry: 3,
    manifestLoadingRetryDelay: 500,        // Faster retry

    levelLoadingTimeOut: 3000,
    levelLoadingMaxRetry: 3,
    levelLoadingRetryDelay: 500,

    fragLoadingTimeOut: 4000,              // 4 seconds for 1s segments
    fragLoadingMaxRetry: 3,
    fragLoadingRetryDelay: 500,

    // Buffer management
    lowLatencyMode: true,                  // ⚠️ ENABLE (was false)
    backBufferLength: 3,                   // Keep only 3 seconds back

    // Sync
    nudgeOffset: 0.05,                     // Smaller nudge
    nudgeMaxRetry: 3,
    maxSeekHole: 0.3,

    // Adaptation - FASTER
    abrEwmaFastLive: 3.0,
    abrEwmaSlowLive: 5.0,
    abrEwmaDefaultEstimate: 1000000,       // 1 Mbps estimate
    abrBandWidthFactor: 0.95,
    abrBandWidthUpFactor: 0.98,

    liveBackBufferLength: 2,               // Minimal back buffer

    // Debugging
    debug: false,
    enableWorker: true,                    // Enable worker for performance
    enableSoftwareAES: false
  }

  const clearAllTimeouts = () => {
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current)
      bufferTimeoutRef.current = null
    }
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current)
      loadingTimeoutRef.current = null
    }
    if (freezeDetectionRef.current) {
      clearTimeout(freezeDetectionRef.current)
      freezeDetectionRef.current = null
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current)
      retryIntervalRef.current = null
    }
    // ADD THIS:
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current)
      healthCheckIntervalRef.current = null
    }
  }

  const initializeHLS = () => {
    if (!src || src.trim() === '' || src === 'undefined' || src === 'null') {
      console.error('Invalid or empty HLS source URL provided:', src)
      setError('No stream URL available')
      setIsLoading(false)
      return
    }

    if (!videoRef.current) {
      console.log('Video element not ready, retrying...')
      setTimeout(initializeHLS, 100)
      return
    }

    const video = videoRef.current

    try {
      if (Hls.isSupported()) {
        console.log(`Initializing HLS for ${deviceName}:`, src)

        const hls = new Hls(hlsConfig)
        hlsRef.current = hls

        let manifestRetries = 0
        const maxManifestRetries = 30
        let manifestLoaded = false
        let firstFragLoaded = false

        // Attach media first
        hls.attachMedia(video)

        hls.on('hlsMediaAttached', () => {
          console.log('Media attached to HLS player')
          onLoadStart?.()
        })

        hls.on('hlsManifestParsed', (event: any, data: any) => {
          manifestRetries = 0
          manifestLoaded = true
          console.log('HLS manifest parsed successfully')

          // Important: Don't set loading to false yet - wait for first fragment
          setRetryCount(0)
        })

        hls.on('hlsFragLoaded', (event: any, data: any) => {
          if (!firstFragLoaded) {
            firstFragLoaded = true
            console.log('First fragment loaded - stream is ready!')

            setIsLoading(false)
            setBufferStalled(false)

            if (autoPlay && video.paused) {
              video.play().catch(e => {
                console.warn('Autoplay blocked:', e.message)
              })
            }
            console.log(`📺 ${deviceName}: Stream active (${src})`)
          }

          setSegmentLoadCount(prev => prev + 1)

          setLastSegmentTime(Date.now())
          setSegmentLoadFailures(0)
          setStreamHealth('live')

          clearAllTimeouts()
        })

        hls.on('hlsError', (event: any, data: any) => {

          const nonFatalErrors = [
            'bufferStalledError',
            'bufferSeekOverHole',
            'bufferNudgeOnStall'
          ]

          if (nonFatalErrors.includes(data.details) && !data.fatal) {
            // These are normal - HLS.js handles them automatically
            return
          }

          // Only log the first few attempts to reduce console spam
          if (manifestRetries < 3 || DEBUG_MODE) {
            console.log('HLS Error:', data.details, 'Fatal:', data.fatal)
          }

          // Only log the first few attempts to reduce console spam
          if (manifestRetries < 3) {
            console.log('HLS Error:', data.details, 'Fatal:', data.fatal)
          }

          // For manifest errors, keep retrying silently for 15 seconds
          if (data.details === 'manifestLoadError' || data.details === 'levelLoadError') {
            if (!manifestLoaded && manifestRetries < 15) {
              manifestRetries++

              // Only log progress occasionally
              if (manifestRetries % 5 === 0) {
                console.log(`Waiting for stream... ${manifestRetries}/15`)
              }

              // Exponential backoff to reduce request spam
              const retryDelay = Math.min(1000 * Math.pow(1.5, manifestRetries), 5000)

              setTimeout(() => {
                if (hlsRef.current && !manifestLoaded) {
                  hlsRef.current.loadSource(src)
                }
              }, retryDelay)

              // Don't show error until we've tried for 15 seconds
              if (manifestRetries < 15) {
                return
              }
            }
          }

          if (data.fatal) {
            switch (data.type) {
              case 'networkError':
                // Only log once
                if (!firstFragLoaded && manifestRetries < 3) {
                  console.log('Network error, retrying...')
                }
                if (!firstFragLoaded) {
                  // Exponential backoff here too
                  const retryDelay = Math.min(2000 * Math.pow(1.5, manifestRetries), 8000)
                  setTimeout(() => {
                    if (hlsRef.current) {
                      hlsRef.current.loadSource(src)
                    }
                  }, retryDelay)
                } else {
                  hls.startLoad()
                }
                break

              case 'mediaError':
                hls.recoverMediaError()
                break

              default:
                // Only show error after 15 seconds of trying
                if (manifestRetries >= 15) {
                  setError('Stream unavailable - backend may be starting')
                  setIsLoading(false)
                }
                break
            }
          }
        })

        healthCheckIntervalRef.current = setInterval(() => {
          const timeSinceLastSegment = Date.now() - lastSegmentTime

          // If no segments for 10 seconds, mark as error
          if (timeSinceLastSegment > 10000) {
            if (streamHealth !== 'error') {
              console.warn('No segments loaded for 10s - stream may be down')
              setStreamHealth('error')
            }
          }
          // If no segments for 5 seconds, show warning
          else if (timeSinceLastSegment > 5000) {
            if (streamHealth === 'live') {
              console.warn('Segment loading delayed - showing warning')
              setStreamHealth('warning')
            }
          }
        }, 2000)

        // Load source
        hls.loadSource(src)

        // Start checking for manifest availability with exponential backoff
        let checkCount = 0
        const checkInterval = setInterval(() => {
          if (manifestLoaded || manifestRetries >= 30) {
            clearInterval(checkInterval)
            return
          }

          checkCount++
          manifestRetries++

          // Only log every 5th check to reduce spam
          if (checkCount % 5 === 0) {
            console.log(`Checking for stream availability... ${manifestRetries}/30`)
          }

          if (hlsRef.current) {
            hlsRef.current.loadSource(src)
          }

          // Increase interval after first few attempts
          if (checkCount === 5) {
            clearInterval(checkInterval)
            // Switch to slower checking after initial attempts
            const slowInterval = setInterval(() => {
              if (manifestLoaded || manifestRetries >= 30) {
                clearInterval(slowInterval)
                return
              }

              manifestRetries++
              if (hlsRef.current) {
                hlsRef.current.loadSource(src)
              }
            }, 3000) // Check every 3 seconds instead of every second
          }
        }, 1000)

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        onLoadStart?.()
      } else {
        setError('HLS is not supported in this browser')
      }
    } catch (error: any) {
      console.error('Error initializing HLS:', error)
      setError(`HLS initialization failed: ${error.message}`)
    }
  }

  useEffect(() => {
    console.log('HLSPlayer useEffect:', { src, deviceName })

    if (!videoRef.current) {
      console.log('No video ref available')
      return
    }

    const video = videoRef.current

    video.muted = isMuted
    video.autoplay = autoPlay
    video.playsInline = true
    video.preload = 'auto'

    if ('webkitPreservesPitch' in video) {
      (video as any).webkitPreservesPitch = true
    }
    if ('mozPreservesPitch' in video) {
      (video as any).mozPreservesPitch = true
    }
    if ('preservesPitch' in video) {
      (video as any).preservesPitch = true
    }

    video.crossOrigin = 'anonymous'
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')

    const handleLoadStart = () => {
      if (DEBUG_MODE || segmentLoadCount < 1) {
        console.log('Video load started')
      }
      setIsLoading(true)
      setError(null)
      setBufferStalled(false)
      setShowMinimalLoading(false)

      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }

      loadingTimeoutRef.current = setTimeout(() => {
        console.log('Loading timeout reached, checking if still loading')
        if (!video.currentTime || video.readyState < 2) {
          setBufferStalled(true)
        }
      }, 8000)
    }

    const handleCanPlay = () => {
      if (segmentLoadCount < 2 && DEBUG_MODE) {
        console.log('Video can play')
      }
      setIsLoading(false)
      setBufferStalled(false)
      setShowMinimalLoading(false)
      clearAllTimeouts()
      onLoadEnd?.()
      onCanPlay?.()
    }

    const handlePlay = () => {
      if (DEBUG_MODE || segmentLoadCount < 2) {
        console.log('Video playing')
      }
      setIsPlaying(true)
      setBufferStalled(false)
      setIsLoading(false)
      setShowMinimalLoading(false)
      setLastPlayTime(video.currentTime)
      startFreezeDetection()
    }

    const handlePause = () => {
      if (DEBUG_MODE) {
        console.log('Video paused')
      }
      setIsPlaying(false)

      if (freezeDetectionRef.current) {
        clearTimeout(freezeDetectionRef.current)
        freezeDetectionRef.current = null
      }
    }

    const handleTimeUpdate = () => {
      const currentVideoTime = video.currentTime
      setCurrentTime(currentVideoTime)
      setDuration(video.duration || 0)

      if (Math.abs(currentVideoTime - lastPlayTime) > 0.1) {
        setLastPlayTime(currentVideoTime)
        setShowMinimalLoading(false)
      }

      // Calculate buffer distance (not live edge latency)
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1)
        const bufferDistance = bufferedEnd - currentVideoTime

        // Update displayed latency (this is buffer distance)
        setActualLatency(bufferDistance)

        // Determine if we're "live" based on buffer health
        let isCurrentlyLive = true

        if (liveLocked) {
          // User locked to live, stay live
          isCurrentlyLive = true
        } else {
          // Consider live if buffer distance is reasonable (<10s)
          // Note: Normal buffer is 2-5s, >10s means we're falling behind
          isCurrentlyLive = bufferDistance < 10

          // CRITICAL: Only log ONCE when we first detect falling behind
          // Use both hasShownSkipToLive AND a threshold check
          if (!isCurrentlyLive && !hasShownSkipToLive) {
            setHasShownSkipToLive(true)
            // Only log in debug mode or first time
            if (DEBUG_MODE) {
              console.log(`Stream buffer grew large (${bufferDistance.toFixed(1)}s)`)
            }
          }
        }

        setIsLive(isCurrentlyLive)

        // Update stream health based on buffer distance
        // Warning if buffer is building up (6-10s)
        // Error is set elsewhere based on segment loading failures
        if (streamHealth === 'live' && bufferDistance > 8 && bufferDistance < 15) {
          setStreamHealth('warning')
        } else if (streamHealth === 'warning' && bufferDistance < 6) {
          setStreamHealth('live')
        } else if (bufferDistance >= 15) {
          // Very large buffer suggests a problem
          setStreamHealth('warning')
        }
      }
    }

    const handleError = (e: Event) => {
      const videoError = (e.target as HTMLVideoElement)?.error
      const errorMsg = `Video error: ${videoError?.message || 'Unknown error'}`
      console.error(errorMsg)
      setError(errorMsg)
      setIsLoading(false)
      setBufferStalled(false)
      setShowMinimalLoading(false)
      clearAllTimeouts()
      onError?.(errorMsg)
    }

    const handleWaiting = () => {
      if (DEBUG_MODE) {
        console.log('Video waiting/buffering - checking if genuine stall...')
      }

      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
      }

      bufferTimeoutRef.current = setTimeout(() => {
        if (video.readyState < 3 && video.currentTime < 1 && !isPlaying) {
          if (DEBUG_MODE) {
            console.log('Genuine buffer stall confirmed')
          }
          setIsLoading(true)
          setBufferStalled(true)
        }
      }, 4000)
    }

    const handlePlaying = () => {
      if (segmentLoadCount < 1 && DEBUG_MODE) {
        console.log('Video playing smoothly')
      }
      setIsLoading(false)
      setBufferStalled(false)
      setShowMinimalLoading(false)
      clearAllTimeouts()
    }

    const handleProgress = () => {
      if (bufferStalled || isLoading || showMinimalLoading) {
        setBufferStalled(false)
        setIsLoading(false)
        setShowMinimalLoading(false)
      }
    }

    const startFreezeDetection = () => {
      if (freezeDetectionRef.current) {
        clearTimeout(freezeDetectionRef.current)
      }

      freezeDetectionRef.current = setTimeout(() => {
        if (isPlaying && Math.abs(video.currentTime - lastPlayTime) < 0.1) {
          console.log('Video freeze detected, showing minimal loading indicator')
          setShowMinimalLoading(true)

          setTimeout(() => {
            if (showMinimalLoading && isLive) {
              console.log('Auto-jumping to live due to freeze detection')
              jumpToLive()
            }
          }, 2000)
        }

        if (isPlaying) {
          startFreezeDetection()
        }
      }, 4000)
    }

    video.addEventListener('loadstart', handleLoadStart)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('error', handleError)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('progress', handleProgress)

    if (hlsRef.current) {
      console.log('Cleaning up previous HLS instance...')
      try {
        hlsRef.current.destroy()
        hlsRef.current = null
      } catch (e) {
        console.warn('Error cleaning up previous HLS instance:', e)
      }
    }

    if (video.src && video.src !== src) {
      console.log('Clearing video element...')
      video.src = ''
      video.load()
    }

    setLastSegmentLoadTime(0)
    setIsLive(true)
    setLiveLocked(false)
    setHasShownSkipToLive(false)
    setLastPlayTime(0)
    setShowMinimalLoading(false)
    setRetryCount(0)
    setStreamHealth('live')
    setLastSegmentTime(Date.now())

    const initTimer = setTimeout(() => {
      initializeHLS()
    }, retryCount === 0 ? 100 : 2000)

    return () => {
      console.log('HLS Player cleanup...')

      clearTimeout(initTimer)
      clearAllTimeouts()

      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current)
        retryIntervalRef.current = null
      }

      video.removeEventListener('loadstart', handleLoadStart)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('error', handleError)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('progress', handleProgress)

      if (hlsRef.current) {
        console.log('Destroying HLS instance...')
        try {
          hlsRef.current.destroy()
          hlsRef.current = null
        } catch (e) {
          console.warn('Error destroying HLS instance:', e)
        }
      }

      video.src = ''
      video.load()
    }
  }, [src, isMuted, autoPlay, liveLocked, retryCount])

  const togglePlay = () => {
    if (!videoRef.current) return

    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play().catch(e => {
        console.error('Play failed:', e)
        setError('Playback failed - try again')
      })
    }
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const toggleFullscreen = () => {
    if (!videoRef.current) return

    if (!isFullscreen) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen()
      } else if ((videoRef.current as any).webkitRequestFullscreen) {
        (videoRef.current as any).webkitRequestFullscreen()
      } else if ((videoRef.current as any).mozRequestFullScreen) {
        (videoRef.current as any).mozRequestFullScreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen()
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen()
      }
    }
    setIsFullscreen(!isFullscreen)
  }

  const jumpToLive = () => {
    if (!videoRef.current || !hlsRef.current) return

    console.log('Jumping to live edge and locking to LIVE mode')

    if (videoRef.current.buffered.length > 0) {
      const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1)
      videoRef.current.currentTime = bufferedEnd - 1.0
    }

    setIsLive(true)
    setLiveLocked(true)
    setShowMinimalLoading(false)

    console.log('Live mode locked')
  }

  const formatTime = (time: number) => {
    if (!isFinite(time)) return '--:--'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // Only show loading for genuinely new streams, not reconnections
  const shouldShowLoading = (isLoading || bufferStalled) &&
    (!isPlaying || (videoRef.current?.readyState ?? 0) < 2) &&
    segmentLoadCount < 2

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden w-full h-full ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        controls={false}
      />

      {showMinimalLoading && (
        <div className="absolute top-4 left-4">
          <div className="bg-black bg-opacity-60 rounded-full p-2">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        </div>
      )}

      {shouldShowLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <div className="text-sm">Initializing stream...</div>
          </div>
        </div>
      )}

      {error && segmentLoadCount > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 z-20">
          <div className="text-center text-white p-4">
            <WifiOff className="w-8 h-8 mx-auto mb-2" />
            <div className="text-sm mb-2">{error}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null)
                setRetryCount(0)
                setIsLoading(true)
                // Re-trigger initialization after clearing error
                setTimeout(() => {
                  if (src && src !== '') {
                    initializeHLS()
                  }
                }, 100)
              }}
              className="text-white border-white hover:bg-white hover:text-black"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {controls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center space-x-2 flex-wrap">
              {/* Smart tri-state badge based on streamHealth */}
              <Badge
                variant="default"
                className={`text-xs ${streamHealth === 'error' ? 'bg-red-600 text-white' :
                  streamHealth === 'warning' ? 'bg-yellow-500 text-black' :
                    'bg-green-600 text-white'
                  }`}
              >
                {streamHealth === 'error' ? (
                  <>
                    <WifiOff className="w-3 h-3 mr-1" />
                    ERROR
                  </>
                ) : streamHealth === 'warning' ? (
                  <>
                    <Clock className="w-3 h-3 mr-1" />
                    WARNING
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
                    LIVE
                  </>
                )}
              </Badge>

              {/* Only show buffer distance if >2s and not error */}
              {actualLatency > 2 && streamHealth !== 'error' && (
                <Badge variant="outline" className="text-xs text-white border-white">
                  <Clock className="w-3 h-3 mr-1" />
                  {actualLatency.toFixed(1)}s buffer
                </Badge>
              )}

              {liveLocked && (
                <Badge variant="outline" className="text-xs text-green-400 border-green-400">
                  Live Locked
                </Badge>
              )}

              {DEBUG_MODE && (
                <div className="text-xs text-gray-400">
                  Segments: {segmentLoadCount}
                </div>
              )}

              <div className="text-xs text-white opacity-75">
                {deviceName}
              </div>
            </div>

            {/* Show Skip to Live button when buffer is large */}
            {!liveLocked && !isLive && streamHealth !== 'error' && actualLatency > 10 && (
              <Button
                size="sm"
                onClick={jumpToLive}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <SkipForward className="w-4 h-4 mr-1" />
                Skip to Live
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlay}
                className="text-white hover:bg-white hover:bg-opacity-20"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="text-white hover:bg-white hover:bg-opacity-20"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </Button>

              <div className="text-sm text-white">
                {formatTime(currentTime)}
                {duration > 0 && ` / ${formatTime(duration)}`}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {showRecordingControls && (
                <div className="flex items-center space-x-2">
                  {isRecording ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={onStopRecording}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Stop Recording
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={onStartRecording}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      Record
                    </Button>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-1">
                {streamHealth === 'error' ? (
                  <WifiOff className="w-4 h-4 text-red-400" />
                ) : streamHealth === 'warning' ? (
                  <Wifi className="w-4 h-4 text-yellow-400" />
                ) : (
                  <Wifi className="w-4 h-4 text-green-400" />
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white hover:bg-opacity-20"
              >
                <Maximize className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}