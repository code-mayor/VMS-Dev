import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Switch } from './ui/switch'
import { Slider } from './ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  Clock,
  Activity,
  Bell,
  BellOff,
  Settings,
  Camera,
  Zap
} from 'lucide-react'

interface MotionEvent {
  id: string
  device_id: string
  event_type: string
  confidence: number
  detected_at: string
  recording_id: string | null
  thumbnail_path: string
  acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
}

interface MotionDetectionProps {
  deviceId: string
  deviceName: string
  motionEnabled: boolean
  onToggleMotionDetection: (enabled: boolean) => Promise<void>
  onGetMotionEvents: () => Promise<MotionEvent[]>
  onAcknowledgeEvent: (eventId: string) => Promise<void>
  canManageMotion: boolean
}

export function MotionDetection({ 
  deviceId, 
  deviceName, 
  motionEnabled,
  onToggleMotionDetection,
  onGetMotionEvents,
  onAcknowledgeEvent,
  canManageMotion 
}: MotionDetectionProps) {
  const [motionEvents, setMotionEvents] = useState<MotionEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [sensitivity, setSensitivity] = useState([75])
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [liveDetection, setLiveDetection] = useState(false)

  useEffect(() => {
    loadMotionEvents()
    
    // Simulate live motion detection
    if (motionEnabled) {
      const interval = setInterval(() => {
        if (Math.random() > 0.95) { // 5% chance every 5 seconds
          simulateMotionEvent()
        }
      }, 5000)
      
      return () => clearInterval(interval)
    }
  }, [motionEnabled])

  const loadMotionEvents = async () => {
    try {
      const events = await onGetMotionEvents()
      const deviceEvents = events.filter(event => event.device_id === deviceId)
      setMotionEvents(deviceEvents)
    } catch (error) {
      console.error('Error loading motion events:', error)
      setError('Failed to load motion events')
    }
  }

  const simulateMotionEvent = () => {
    const confidence = Math.floor(Math.random() * 40) + 60 // 60-100%
    if (confidence >= sensitivity[0]) {
      setLiveDetection(true)
      setTimeout(() => setLiveDetection(false), 3000)
      
      // Add to events list
      const newEvent: MotionEvent = {
        id: crypto.randomUUID(),
        device_id: deviceId,
        event_type: 'motion_detected',
        confidence,
        detected_at: new Date().toISOString(),
        recording_id: Math.random() > 0.5 ? crypto.randomUUID() : null,
        thumbnail_path: `motion_thumbnails/${crypto.randomUUID()}.jpg`,
        acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null
      }
      
      setMotionEvents(prev => [newEvent, ...prev.slice(0, 49)]) // Keep latest 50
      
      if (alertsEnabled) {
        // Show notification (in a real app, this would be a proper notification)
        console.log(`Motion detected on ${deviceName} with ${confidence}% confidence`)
      }
    }
  }

  const handleToggleMotionDetection = async (enabled: boolean) => {
    if (!canManageMotion) {
      setError('You do not have permission to manage motion detection')
      return
    }

    setIsLoading(true)
    setError('')
    
    try {
      await onToggleMotionDetection(enabled)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to toggle motion detection')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAcknowledgeEvent = async (eventId: string) => {
    try {
      await onAcknowledgeEvent(eventId)
      setMotionEvents(prev => 
        prev.map(event => 
          event.id === eventId 
            ? { ...event, acknowledged: true, acknowledged_at: new Date().toISOString() }
            : event
        )
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to acknowledge event')
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-red-600'
    if (confidence >= 75) return 'text-orange-600'
    if (confidence >= 60) return 'text-yellow-600'
    return 'text-gray-600'
  }

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 90) return 'bg-red-100 text-red-800'
    if (confidence >= 75) return 'bg-orange-100 text-orange-800'
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-800'
  }

  const unacknowledgedEvents = motionEvents.filter(event => !event.acknowledged)

  return (
    <div className="space-y-6">
      {/* Motion Detection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5" />
              <span>Motion Detection - {deviceName}</span>
            </div>
            <div className="flex items-center space-x-2">
              {liveDetection && (
                <Badge className="bg-red-100 text-red-800 animate-pulse">
                  <Zap className="w-3 h-3 mr-1" />
                  Motion Detected!
                </Badge>
              )}
              <Badge variant={motionEnabled ? 'default' : 'secondary'}>
                {motionEnabled ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            {/* Main Controls */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={motionEnabled}
                    onCheckedChange={handleToggleMotionDetection}
                    disabled={isLoading || !canManageMotion}
                  />
                  <span className="font-medium">Enable Motion Detection</span>
                </div>
                <p className="text-sm text-gray-500">
                  Automatically detect movement and trigger alerts
                </p>
              </div>
              
              <Dialog open={showSettings} onOpenChange={setShowSettings}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Motion Detection Settings</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Detection Sensitivity: {sensitivity[0]}%
                      </label>
                      <Slider
                        value={sensitivity}
                        onValueChange={setSensitivity}
                        min={10}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-500">
                        Higher values = more sensitive detection
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">Alert Notifications</span>
                        <p className="text-sm text-gray-500">
                          Receive alerts when motion is detected
                        </p>
                      </div>
                      <Switch
                        checked={alertsEnabled}
                        onCheckedChange={setAlertsEnabled}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Live Status */}
            {motionEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="w-8 h-8 bg-green-500 rounded-full mx-auto mb-2"></div>
                  <h4 className="font-medium">Status</h4>
                  <p className="text-sm text-gray-600">Monitoring</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="w-8 h-8 bg-blue-500 rounded-full mx-auto mb-2"></div>
                  <h4 className="font-medium">Sensitivity</h4>
                  <p className="text-sm text-gray-600">{sensitivity[0]}%</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="w-8 h-8 bg-yellow-500 rounded-full mx-auto mb-2 flex items-center justify-center">
                    {alertsEnabled ? (
                      <Bell className="w-4 h-4 text-white" />
                    ) : (
                      <BellOff className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <h4 className="font-medium">Alerts</h4>
                  <p className="text-sm text-gray-600">
                    {alertsEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Motion Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Eye className="w-5 h-5" />
              <span>Motion Events</span>
            </div>
            {unacknowledgedEvents.length > 0 && (
              <Badge className="bg-red-100 text-red-800">
                {unacknowledgedEvents.length} Unacknowledged
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {motionEvents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Recording</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {motionEvents.slice(0, 20).map((event) => (
                  <TableRow 
                    key={event.id}
                    className={!event.acknowledged ? 'bg-red-50' : ''}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {new Date(event.detected_at).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(event.detected_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getConfidenceBadge(event.confidence)}>
                        {event.confidence}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {event.recording_id ? (
                        <Button size="sm" variant="outline">
                          <Camera className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {event.acknowledged ? (
                        <div className="flex items-center space-x-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">Acknowledged</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 text-red-600">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-sm">Needs Attention</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {!event.acknowledged && canManageMotion && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcknowledgeEvent(event.id)}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Motion Events</h3>
              <p>Enable motion detection to start monitoring</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}