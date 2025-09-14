import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import {
  Play,
  Pause,
  Download,
  Maximize2,
  Volume2,
  VolumeX,
  AlertTriangle,
  Monitor,
  PlayCircle,
  ExternalLink
} from 'lucide-react'

interface VideoPlaybackDialogProps {
  recording: any
  open: boolean
  onOpenChange: (open: boolean) => void
}

// VLC Icon Component
const VLCIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L3 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="#ff8800" />
    <path d="M12 6L7 8.5v6c0 2.8 2 5.5 5 6 3-.5 5-3.2 5-6v-6L12 6z" fill="white" />
  </svg>
)

export function VideoPlaybackDialog({ recording, open, onOpenChange }: VideoPlaybackDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [videoSource, setVideoSource] = useState<string>('')
  const [playerMode, setPlayerMode] = useState<'embedded' | 'native'>('embedded')
  const autoPlayAttempted = useRef(false)
  const [vlcInstalled, setVlcInstalled] = useState<boolean | null>(null)

  useEffect(() => {
    if (open && recording) {
      const streamUrl = `http://localhost:3001/api/recordings/${recording.id}/stream`
      const directUrl = `http://localhost:3001/recordings/${recording.filename}`

      console.log('Loading video:', { streamUrl, directUrl })

      // Use direct URL for better compatibility
      setVideoSource(directUrl)
      setPlayerMode('embedded')
      setIsLoading(false)
      setError(null)
      autoPlayAttempted.current = false
    }
  }, [open, recording])

  useEffect(() => {
    // Auto-play when video element is ready
    if (open && videoRef.current && !autoPlayAttempted.current && playerMode === 'embedded') {
      const attemptAutoPlay = async () => {
        try {
          // Set muted first to bypass browser autoplay restrictions
          videoRef.current!.muted = true
          await videoRef.current!.play()
          setIsPlaying(true)
          setIsMuted(true)
          autoPlayAttempted.current = true
          console.log('Auto-play started successfully (muted)')
        } catch (err) {
          console.log('Auto-play failed, user interaction required')
        }
      }

      // Small delay to ensure video is loaded
      const timer = setTimeout(attemptAutoPlay, 200)
      return () => clearTimeout(timer)
    }
  }, [open, playerMode])

  const playInVLC = async () => {
    const vlcUrl = videoSource

    // Method 1: Try Web Intent API (if available)
    if ('launchQueue' in window) {
      try {
        // @ts-ignore
        await window.launchQueue.setConsumer((launchParams) => {
          window.open(`vlc://${vlcUrl}`, '_blank')
        })
      } catch (e) {
        console.log('Web Intent API not available')
      }
    }

    // Method 2: Try ActiveX for Windows (Internet Explorer/Edge legacy)
    // Use type assertion to access ActiveXObject
    if ((window as any).ActiveXObject || 'ActiveXObject' in window) {
      try {
        const vlc = new (window as any).ActiveXObject('VideoLAN.VLCPlugin.2')
        if (vlc) {
          vlc.playlist.add(vlcUrl)
          vlc.playlist.play()
          return
        }
      } catch (e) {
        console.log('ActiveX VLC not available')
      }
    }

    // Method 3: Download M3U playlist with auto-open
    const playlistContent = `#EXTM3U
#EXTINF:-1,${recording.filename}
${vlcUrl}`

    const blob = new Blob([playlistContent], { type: 'application/vnd.apple.mpegurl' })
    const url = URL.createObjectURL(blob)

    // Create link with proper MIME type
    const a = document.createElement('a')
    a.href = url
    a.download = `play_${recording.filename.replace('.mp4', '')}.m3u`
    a.type = 'application/vnd.apple.mpegurl'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100)

    // Method 4: Also try vlc:// protocol
    setTimeout(() => {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = `vlc://${vlcUrl.replace('http://', '')}`
      document.body.appendChild(iframe)
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 200)
  }

  const switchToNative = () => {
    setPlayerMode('native')
    setError(null)
    setIsLoading(true)
    autoPlayAttempted.current = false

    // Use direct file URL for native player
    const directUrl = `http://localhost:3001/recordings/${recording.filename}`
    setVideoSource(directUrl)

    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.src = directUrl
        videoRef.current.load()
      }
    }, 100)
  }

  const handlePlayClick = async () => {
    if (!videoRef.current) return

    try {
      if (isPlaying) {
        videoRef.current.pause()
        setIsPlaying(false)
      } else {
        // Try unmuted first
        videoRef.current.muted = false
        await videoRef.current.play()
        setIsPlaying(true)
        setIsMuted(false)
      }
    } catch (err) {
      // If unmuted fails, try muted
      try {
        videoRef.current!.muted = true
        await videoRef.current!.play()
        setIsPlaying(true)
        setIsMuted(true)
      } catch (finalErr) {
        console.error('Playback failed:', finalErr)
      }
    }
  }

  const handleMuteToggle = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const handleDownload = () => {
    const downloadUrl = `http://localhost:3001/api/recordings/${recording.id}/download`
    window.open(downloadUrl, '_blank')
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!recording) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span>Recording Playback - {recording.deviceName}</span>
              <Badge variant="outline">{recording.type}</Badge>
              <Badge variant="secondary">{recording.quality}</Badge>
            </div>
            {/* Move badge away from close button */}
            <div className="mr-8">
              <Badge variant={playerMode === 'embedded' ? 'default' : 'outline'}>
                {playerMode === 'embedded' ? 'Embedded' : 'Native'}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Streamlined Controls */}
          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center space-x-2">
              {/* VLC Button - Default styling */}
              <Button
                variant="outline"
                onClick={playInVLC}
                className="flex items-center space-x-2"
              >
                <VLCIcon />
                <span>Play in VLC</span>
              </Button>

              {/* Download Button */}
              <Button
                variant="outline"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>

              {/* Switch to Native Player */}
              {playerMode === 'embedded' ? (
                <Button
                  variant="outline"
                  onClick={switchToNative}
                  size="sm"
                >
                  Try Native
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPlayerMode('embedded')
                    setError(null)
                    autoPlayAttempted.current = false
                    // Reset to embedded with direct URL
                    const directUrl = `http://localhost:3001/recordings/${recording.filename}`
                    setVideoSource(directUrl)
                  }}
                  size="sm"
                >
                  Use Embedded
                </Button>
              )}
            </div>

            <div className="text-sm text-gray-600">
              {isMuted && isPlaying && '🔇 Auto-muted for autoplay | '}
              Using {playerMode === 'embedded' ? 'embedded' : 'native HTML5'} player
            </div>
          </div>

          {/* Video Player Area */}
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            {/* Play button overlay for initial play if autoplay failed */}
            {!isPlaying && !isLoading && !error && playerMode === 'embedded' && (
              <div
                className="absolute inset-0 flex items-center justify-center z-20 cursor-pointer bg-black/30"
                onClick={handlePlayClick}
              >
                <div className="bg-white/90 rounded-full p-4 hover:bg-white transition-colors">
                  <PlayCircle className="w-16 h-16 text-gray-800" />
                </div>
              </div>
            )}

            {/* Loading indicator for native player */}
            {isLoading && playerMode === 'native' && (
              <div className="absolute inset-0 flex items-center justify-center text-white z-10">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                  <p>Loading native player...</p>
                </div>
              </div>
            )}

            {/* Error display for native player */}
            {error && playerMode === 'native' && (
              <div className="absolute inset-0 flex items-center justify-center text-white z-10 bg-black/80">
                <div className="text-center p-4">
                  <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <p className="text-yellow-400 mb-4">{error}</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPlayerMode('embedded')
                      setError(null)
                      autoPlayAttempted.current = false
                    }}
                  >
                    Use Embedded Player
                  </Button>
                </div>
              </div>
            )}

            {/* Video Element */}
            <video
              ref={videoRef}
              src={videoSource}
              className="w-full h-full"
              controls
              playsInline
              preload="auto"
              muted={isMuted}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedData={() => {
                if (playerMode === 'native') {
                  setIsLoading(false)
                }
                // Try autoplay for embedded player
                if (!autoPlayAttempted.current && videoRef.current && playerMode === 'embedded') {
                  videoRef.current.muted = true
                  videoRef.current.play().then(() => {
                    setIsPlaying(true)
                    setIsMuted(true)
                    autoPlayAttempted.current = true
                  }).catch(() => {
                    console.log('Autoplay prevented')
                  })
                }
              }}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration)
                if (playerMode === 'native') {
                  setError(null)
                  // Try autoplay for native
                  if (!autoPlayAttempted.current && videoRef.current) {
                    videoRef.current.muted = true
                    videoRef.current.play().then(() => {
                      setIsPlaying(true)
                      setIsMuted(true)
                      autoPlayAttempted.current = true
                    }).catch(() => {
                      console.log('Native autoplay prevented')
                    })
                  }
                }
              }}
              onVolumeChange={(e) => {
                setIsMuted(e.currentTarget.muted)
              }}
              onTimeUpdate={(e) => {
                setCurrentTime(e.currentTarget.currentTime)
              }}
              onError={(e) => {
                if (playerMode === 'native') {
                  const video = e.currentTarget
                  let errorMessage = 'Native player cannot play this video. '

                  if (video.error) {
                    switch (video.error.code) {
                      case 1:
                        errorMessage = 'Video loading was aborted.'
                        break
                      case 2:
                        errorMessage = 'Network error while loading video.'
                        break
                      case 3:
                        errorMessage = 'Video codec not supported by native player.'
                        break
                      case 4:
                        errorMessage = 'Video format not supported by native player.'
                        break
                    }
                  }

                  setError(errorMessage)
                  setIsLoading(false)
                }
              }}
            />
          </div>

          {/* Quick Status Bar */}
          <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded">
            <div className="flex items-center space-x-4">
              <span>{isPlaying ? '▶ Playing' : '⏸ Paused'}</span>
              <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              <span>{isMuted ? '🔇 Muted' : '🔊 Sound On'}</span>
            </div>
            <div className="flex items-center space-x-4">
              <span>{recording.filename}</span>
              <span>{(recording.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          </div>

          {/* VLC Help */}
          <Alert>
            <AlertDescription className="text-xs">
              <strong>VLC:</strong> Click "Play in VLC" to download a playlist file (.m3u) that opens in VLC.
              If VLC doesn't open automatically: 1) Find the downloaded .m3u file, 2) Double-click to open in VLC.
              <br />
              <strong>Alternative:</strong> Open VLC → Media → Open Network Stream → Paste: {videoSource}
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  )
}