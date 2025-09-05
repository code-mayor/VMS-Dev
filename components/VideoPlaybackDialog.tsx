import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Play, Pause, Download, Maximize2, Volume2, VolumeX } from 'lucide-react'

interface VideoPlaybackDialogProps {
  recording: any
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VideoPlaybackDialog({ recording, open, onOpenChange }: VideoPlaybackDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && recording && videoRef.current) {
      // Construct the video URL properly
      const videoUrl = `http://localhost:3001/api/recordings/${recording.id}/stream`
      console.log('Loading video:', videoUrl)

      videoRef.current.src = videoUrl
      videoRef.current.load()
      setIsLoading(true)
      setError(null)
    }
  }, [open, recording])

  const handlePlayPause = () => {
    if (!videoRef.current) return

    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play().catch(err => {
        console.error('Playback failed:', err)
        setError('Failed to play video. The file may be corrupted.')
      })
    }
    setIsPlaying(!isPlaying)
  }

  const handleMuteToggle = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const handleDownload = () => {
    const downloadUrl = `http://localhost:3001/api/recordings/${recording.id}/download`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = recording.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!recording) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Recording Playback - {recording.deviceName}</span>
            <div className="flex items-center space-x-2">
              <Badge variant="outline">{recording.type}</Badge>
              <Badge variant="secondary">{recording.quality}</Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Player */}
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                  <p>Loading video...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center">
                  <p className="text-red-500 mb-2">⚠️ {error}</p>
                  <Button variant="outline" onClick={() => {
                    setError(null)
                    setIsLoading(true)
                    // Re-attempt to load the video
                    if (videoRef.current && recording) {
                      videoRef.current.src = `http://localhost:3001/api/recordings/${recording.id}/stream`
                      videoRef.current.load()
                    }
                  }}>
                    Retry
                  </Button>
                </div>
              </div>
            )}

            <video
              ref={videoRef}
              className="w-full h-full"
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration)
                setIsLoading(false)
              }}
              onTimeUpdate={(e) => {
                setCurrentTime(e.currentTarget.currentTime)
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={(e) => {
                console.error('Video error:', e)
                setError('Failed to load video. Please try downloading the file.')
                setIsLoading(false)
              }}
            />
          </div>

          {/* Video Controls */}
          <div className="space-y-2">
            {/* Progress Bar */}
            <div className="flex items-center space-x-2">
              <span className="text-sm">{formatTime(currentTime)}</span>
              <input
                type="range"
                className="flex-1"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => {
                  const time = parseFloat(e.target.value)
                  if (videoRef.current) {
                    videoRef.current.currentTime = time
                    setCurrentTime(time)
                  }
                }}
              />
              <span className="text-sm">{formatTime(duration)}</span>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePlayPause}
                  disabled={isLoading || !!error}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMuteToggle}
                  disabled={isLoading || !!error}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownload}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (videoRef.current) {
                      if (document.fullscreenElement) {
                        document.exitFullscreen()
                      } else {
                        videoRef.current.requestFullscreen()
                      }
                    }
                  }}
                  disabled={isLoading || !!error}
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Recording Info */}
          <div className="text-sm text-gray-600">
            <div>File: {recording.filename}</div>
            <div>Size: {(recording.size / 1024 / 1024).toFixed(2)} MB</div>
            <div>Duration: {formatTime(recording.duration)}</div>
            <div>Recorded: {new Date(recording.startTime).toLocaleString()}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}