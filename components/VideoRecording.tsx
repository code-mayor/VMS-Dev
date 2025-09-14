import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { MultiSelect } from './ui/multi-select'
import { VideoPlaybackDialog } from './VideoPlaybackDialog'
import {
  Play,
  Square,
  Clock,
  HardDrive,
  Download,
  Trash2,
  Camera,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Video,
  Calendar,
  Timer,
  PlayCircle,
  Disc
} from 'lucide-react'

interface Device {
  id: string
  name: string
  ip_address: string
  authenticated: boolean
  status: string
}

interface Recording {
  id: string
  deviceId: string
  deviceName: string
  filename: string
  startTime: string
  endTime: string | null
  duration: number
  size: number
  quality: string
  type: 'manual' | 'auto'
  status: 'recording' | 'completed'
  path: string
}

interface ActiveRecording {
  deviceId: string
  recordingId: string
  startTime: string
  type: string
  recording: Recording
}

interface StorageInfo {
  totalRecordings: number
  totalSize: number
  totalSizeFormatted: string
  usagePercentage: number
  freeSpaceFormatted: string
  maxStorage: number
  recentRecordings: number
  autoRecordingEnabled: boolean
  enabledDevices: number
  directoryStatus?: {
    success: boolean
    directory: string
    error?: string
    recommendations?: string[]
  }
}

interface VideoRecordingProps {
  devices: Device[]
  selectedDevice?: Device | null
  onDeviceSelect?: (device: Device) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

class VideoRecordingErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('VideoRecording Error Boundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2>Video Recording</h2>
              <p className="text-sm text-gray-600 mt-1">
                Recording management interface
              </p>
            </div>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium">Recording interface encountered an error</div>
                <div className="text-sm">
                  There was a problem loading the recording interface. This could be due to:
                </div>
                <ul className="text-sm list-disc list-inside space-y-1 ml-4">
                  <li>Backend service connectivity issues</li>
                  <li>Invalid recording data</li>
                  <li>Missing device information</li>
                </ul>
                <div className="flex space-x-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    Reload Page
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => this.setState({ hasError: false, error: null })}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )
    }
    return this.props.children
  }
}

function VideoRecordingContent({ devices, selectedDevice, onDeviceSelect }: VideoRecordingProps) {
  // Recording state
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [activeRecordings, setActiveRecordings] = useState<ActiveRecording[]>([])
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Manual recording controls - now supporting multiple devices
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(selectedDevice?.id ? [selectedDevice.id] : [])
  const [recordingDuration, setRecordingDuration] = useState('300') // 5 minutes default
  const [recordingQuality, setRecordingQuality] = useState('medium')

  // Filter and pagination
  const [filterDevice, setFilterDevice] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')

  // Playback state
  const [playbackRecording, setPlaybackRecording] = useState<Recording | null>(null)
  const [showPlaybackDialog, setShowPlaybackDialog] = useState(false)

  useEffect(() => {
    loadRecordings()
    loadStorageInfo()

    // Set up periodic refresh for active recordings
    const interval = setInterval(() => {
      loadRecordings()
      loadStorageInfo()
    }, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedDevice?.id && !selectedDeviceIds.includes(selectedDevice.id)) {
      setSelectedDeviceIds([selectedDevice.id])
    }
  }, [selectedDevice])

  const loadRecordings = async () => {
    try {
      console.log('📹 Loading recordings...')

      // Load completed recordings
      const response = await fetch('http://localhost:3001/api/recordings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Load active recordings separately
      const activeResponse = await fetch('http://localhost:3001/api/recordings/active')
      let activeRecordingsList = []

      if (activeResponse.ok) {
        const activeData = await activeResponse.json()
        activeRecordingsList = activeData.activeRecordings || []

        // Convert active recordings to recording format for display
        const activeAsRecordings = activeRecordingsList.map(ar => ({
          id: ar.recordingId,
          deviceId: ar.deviceId,
          deviceName: devices.find(d => d.id === ar.deviceId)?.name || ar.deviceId,
          filename: ar.filename || 'Recording in progress...',
          startTime: ar.startTime,
          endTime: null,
          duration: ar.duration || 0,
          size: 0,
          quality: 'medium',
          type: ar.type || 'auto',
          status: 'recording' as const,
          path: ''
        }))

        // Combine active and completed recordings
        const allRecordings = [...activeAsRecordings, ...(data.recordings || [])]

        // Remove duplicates based on ID
        const uniqueRecordings = Array.from(
          new Map(allRecordings.map(r => [r.id, r])).values()
        )

        setRecordings(uniqueRecordings)
        setActiveRecordings(activeRecordingsList)
      } else {
        setRecordings(data.recordings || [])
        setActiveRecordings([])
      }

      setError(null)

    } catch (err: any) {
      console.error('❌ Failed to load recordings:', err)
      setError('Failed to load recordings: ' + err.message)
      setRecordings([])
      setActiveRecordings([])
    }
  }

  const loadStorageInfo = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/recordings/storage-info')
      if (!response.ok) {
        console.warn('Storage info not available:', response.status)
        return
      }

      const data = await response.json()
      setStorageInfo(data)

    } catch (err: any) {
      console.warn('⚠️ Could not load storage info:', err)
      // Don't show error for storage info - it's not critical
    }
  }

  const startRecording = async () => {
    if (selectedDeviceIds.length === 0) {
      setError('Please select at least one device to record from')
      return
    }

    const selectedDevices = devices.filter(d => selectedDeviceIds.includes(d.id))
    const unauthenticatedDevices = selectedDevices.filter(d => !d.authenticated)

    if (unauthenticatedDevices.length > 0) {
      setError(`The following devices must be authenticated before recording: ${unauthenticatedDevices.map(d => d.name).join(', ')}`)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log(`🔴 Starting recording for ${selectedDeviceIds.length} devices`)

      // Start recording on all selected devices
      const recordingPromises = selectedDeviceIds.map(async (deviceId) => {
        const device = devices.find(d => d.id === deviceId)
        console.log(`🔴 Starting recording for device: ${device?.name || deviceId}`)

        const response = await fetch('http://localhost:3001/api/recordings/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            deviceId,
            duration: parseInt(recordingDuration),
            quality: recordingQuality,
            type: 'manual'
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(`${device?.name || deviceId}: ${errorData.error || `HTTP ${response.status}`}`)
        }

        const data = await response.json()
        console.log(`✅ Recording started for ${device?.name || deviceId}:`, data.recordingId)
        return data
      })

      await Promise.all(recordingPromises)

      // Refresh recordings to show the new active recordings
      await loadRecordings()
      await loadStorageInfo()

    } catch (err: any) {
      console.error('❌ Failed to start recording:', err)
      setError('Failed to start recording: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const stopRecording = async (recordingId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      console.log(`⏹️ Stopping recording: ${recordingId}`)

      const response = await fetch('http://localhost:3001/api/recordings/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recordingId })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Recording stopped:', data.recordingId || recordingId)

      // Refresh recordings
      await loadRecordings()
      await loadStorageInfo()

    } catch (err: any) {
      console.error('❌ Failed to stop recording:', err)
      setError('Failed to stop recording: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const playRecording = (recording: Recording) => {
    console.log('▶️ Playing recording:', recording.id)
    setPlaybackRecording(recording)
    setShowPlaybackDialog(true)
  }

  const downloadRecording = async (recording: Recording) => {
    try {
      console.log(`📥 Downloading recording: ${recording.id}`)

      // Create a download link that opens in a new tab/window
      const downloadUrl = `http://localhost:3001/api/recordings/${recording.id}/download`
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = recording.filename
      link.target = '_blank' // Open in new tab
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

    } catch (err: any) {
      console.error('❌ Failed to download recording:', err)
      setError('Failed to download recording: ' + err.message)
    }
  }

  const deleteRecording = async (recordingId: string) => {
    if (!confirm('Are you sure you want to delete this recording?')) {
      return
    }

    try {
      console.log(`🗑️ Deleting recording: ${recordingId}`)

      const response = await fetch(`http://localhost:3001/api/recordings/${recordingId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      console.log('✅ Recording deleted')

      // Refresh recordings
      await loadRecordings()
      await loadStorageInfo()

    } catch (err: any) {
      console.error('❌ Failed to delete recording:', err)
      setError('Failed to delete recording: ' + err.message)
    }
  }

  const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`
    }
  }

  const formatFileSize = (bytes: number) => {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'Unknown'
    try {
      const date = new Date(dateString)
      return date.toLocaleString()
    } catch (error) {
      return 'Invalid Date'
    }
  }

  // Filter recordings
  const filteredRecordings = recordings.filter(recording => {
    if (filterDevice !== 'all' && recording.deviceId !== filterDevice) return false
    if (filterType !== 'all' && recording.type !== filterType) return false
    return true
  })

  // Check if any selected devices are currently recording
  const selectedDevicesRecording = activeRecordings.filter(ar => selectedDeviceIds.includes(ar.deviceId))

  // Get authenticated devices
  const authenticatedDevices = devices.filter(d => d.authenticated)

  // FIXED: Prepare device options for multi-select with proper null checks
  const deviceOptions = authenticatedDevices.map(device => ({
    value: device.id || '',  // Add fallback
    label: device.name || 'Unknown Device',  // Add fallback
    description: device.ip_address ? `${device.ip_address} - ${device.status || 'unknown'}` : 'No IP address',
    disabled: activeRecordings.some(ar => ar && ar.deviceId === device.id)
  }))

  return (
    <>
      <div className="space-y-6 max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2>Video Recording</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manual and scheduled recording controls for your cameras
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => { loadRecordings(); loadStorageInfo(); }}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Directory Status Alert */}
        {(!storageInfo || storageInfo.directoryStatus?.success === false) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium">Recordings Directory Issue</div>
                <div className="text-sm">
                  The recordings directory may not be properly configured. This could prevent recordings from being saved.
                </div>
                <div className="text-sm text-gray-600">
                  Directory: {storageInfo?.directoryStatus?.directory || '/public/recordings'}
                </div>
                {storageInfo?.directoryStatus?.recommendations && (
                  <ul className="text-sm list-disc list-inside mt-2">
                    {storageInfo.directoryStatus.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Storage Info */}
        {storageInfo && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Video className="w-5 h-5 text-blue-500" />
                  <div>
                    <div className="text-sm text-gray-600">Total Recordings</div>
                    <div className="text-xl font-semibold">{storageInfo.totalRecordings || 0}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-5 h-5 text-green-500" />
                  <div>
                    <div className="text-sm text-gray-600">Storage Used</div>
                    <div className="text-xl font-semibold">{storageInfo.totalSizeFormatted || '0 Bytes'}</div>
                    <div className="text-xs text-gray-500">{(storageInfo.usagePercentage || 0).toFixed(1)}% of {storageInfo.maxStorage || 0}GB</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-purple-500" />
                  <div>
                    <div className="text-sm text-gray-600">Recent (24h)</div>
                    <div className="text-xl font-semibold">{storageInfo.recentRecordings || 0}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Timer className="w-5 h-5 text-orange-500" />
                  <div>
                    <div className="text-sm text-gray-600">Auto Recording</div>
                    <div className="text-xl font-semibold">
                      {storageInfo.autoRecordingEnabled ? 'ON' : 'OFF'}
                    </div>
                    <div className="text-xs text-gray-500">{storageInfo.enabledDevices || 0} devices</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeRecordings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Disc className="w-5 h-5 text-red-500 animate-pulse" />
                <span>Active Recordings</span>
                <Badge variant="destructive">{activeRecordings.length} Recording</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeRecordings.map((recording: any) => {
                  const device = devices.find(d => d.id === recording.deviceId)
                  const elapsedTime = recording.startTime
                    ? Math.floor((Date.now() - new Date(recording.startTime).getTime()) / 1000)
                    : 0

                  return (
                    <div key={recording.recordingId} className="flex items-center justify-between p-3 border rounded-lg bg-red-50">
                      <div className="flex items-center space-x-3">
                        <Disc className="w-4 h-4 text-red-500 animate-pulse" />
                        <div>
                          <div className="font-medium">{device?.name || recording.deviceId}</div>
                          <div className="text-sm text-gray-600">
                            Type: {recording.type} | Started: {formatDateTime(recording.startTime)}
                          </div>
                          <div className="text-sm text-gray-600">
                            Elapsed: {formatDuration(elapsedTime)} / Target: {formatDuration(recording.duration || 0)}
                          </div>
                        </div>
                        <Badge variant={recording.type === 'auto' ? 'secondary' : 'default'}>
                          {recording.type}
                        </Badge>
                      </div>

                      {recording.type === 'manual' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => stopRecording(recording.recordingId)}
                          disabled={isLoading}
                        >
                          <Square className="w-4 h-4 mr-1" />
                          Stop
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manual Recording Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Camera className="w-5 h-5" />
              <span>Manual Recording</span>
            </CardTitle>
            <CardDescription>
              Start and stop recordings manually for one or multiple cameras
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Active Recording Status */}
            {activeRecordings.length > 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {activeRecordings.length} device{activeRecordings.length > 1 ? 's' : ''} currently recording
                  {selectedDevicesRecording.length > 0 && (
                    <span className="ml-2 text-red-600 font-medium">
                      ({selectedDevicesRecording.length} of your selected devices)
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Device Selection - Now Multi-Select */}
              <div className="space-y-2 md:col-span-2 lg:col-span-1">
                <Label>Select Cameras</Label>
                <MultiSelect
                  options={deviceOptions}
                  value={selectedDeviceIds}
                  onChange={setSelectedDeviceIds}
                  placeholder="Choose cameras to record from"
                  searchPlaceholder="Search cameras..."
                  disabled={isLoading}
                  className="w-full"
                />
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <Label>Duration (seconds)</Label>
                <Input
                  type="number"
                  value={recordingDuration}
                  onChange={(e) => setRecordingDuration(e.target.value)}
                  min="30"
                  max="3600"
                  disabled={selectedDevicesRecording.length > 0}
                />
              </div>

              {/* Quality */}
              <div className="space-y-2">
                <Label>Quality</Label>
                <Select
                  value={recordingQuality}
                  onValueChange={setRecordingQuality}
                  disabled={selectedDevicesRecording.length > 0}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (480p)</SelectItem>
                    <SelectItem value="medium">Medium (720p) - Balanced</SelectItem>
                    <SelectItem value="high">High (1080p)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                {selectedDevicesRecording.length > 0 ? (
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        selectedDevicesRecording.forEach(recording => {
                          stopRecording(recording.recordingId)
                        })
                      }}
                      disabled={isLoading}
                      variant="destructive"
                      className="mr-2"
                    >
                      <Square className="w-4 h-4 mr-1" />
                      Stop Recording ({selectedDevicesRecording.length})
                    </Button>
                    <div className="text-sm text-gray-600">
                      Recording on: {selectedDevicesRecording.map(r => {
                        const device = devices.find(d => d.id === r.deviceId)
                        return device?.name || r.deviceId
                      }).join(', ')}
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={startRecording}
                    disabled={isLoading || selectedDeviceIds.length === 0 || authenticatedDevices.length === 0}
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Start Recording {selectedDeviceIds.length > 1 ? `(${selectedDeviceIds.length} cameras)` : ''}
                  </Button>
                )}
              </div>

              {selectedDeviceIds.length > 0 && (
                <div className="text-sm text-gray-600 ml-4">
                  {selectedDeviceIds.length} camera{selectedDeviceIds.length > 1 ? 's' : ''} selected
                </div>
              )}
            </div>

            {/* Device Requirements */}
            {authenticatedDevices.length === 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No authenticated cameras available. Please authenticate at least one camera in the Device Discovery section.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Recordings List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recorded Videos</CardTitle>
                <CardDescription>
                  View, download, and manage your recorded videos
                </CardDescription>
              </div>

              {/* Filters */}
              <div className="flex space-x-2">
                <Select value={filterDevice} onValueChange={setFilterDevice}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Devices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Devices</SelectItem>
                    {devices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredRecordings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <div>No recordings found</div>
                <div className="text-sm">Start recording to see videos here</div>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredRecordings.map((recording) => (
                  <div key={recording.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div>
                          <div className="font-medium">{recording.deviceName || 'Unknown Device'}</div>
                          <div className="text-sm text-gray-600">
                            {formatDateTime(recording.startTime)}
                            {recording.endTime && ` - ${formatDateTime(recording.endTime)}`}
                          </div>
                        </div>

                        <Badge variant={recording.type === 'manual' ? 'default' : 'secondary'}>
                          {recording.type || 'unknown'}
                        </Badge>

                        <Badge variant={recording.status === 'recording' ? 'destructive' : 'outline'}>
                          {recording.status || 'unknown'}
                        </Badge>
                      </div>

                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatDuration(recording.duration || 0)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <HardDrive className="w-4 h-4" />
                          <span>{formatFileSize(recording.size || 0)}</span>
                        </div>
                        <div>Quality: {recording.quality || 'unknown'}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {recording.status === 'completed' && (recording.size || 0) > 0 && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => playRecording(recording)}
                            className="flex items-center space-x-1"
                          >
                            <PlayCircle className="w-4 h-4" />
                            <span>Play</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadRecording(recording)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteRecording(recording.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Video Playback Dialog */}
      <VideoPlaybackDialog
        recording={playbackRecording}
        open={showPlaybackDialog}
        onOpenChange={setShowPlaybackDialog}
      />
    </>
  )
}

// Main export with Error Boundary wrapper  
export function VideoRecording(props: VideoRecordingProps) {
  return (
    <VideoRecordingErrorBoundary>
      <VideoRecordingContent {...props} />
    </VideoRecordingErrorBoundary>
  )
}