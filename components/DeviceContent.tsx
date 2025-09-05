import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { OnvifDeviceDiscovery } from './OnvifDeviceDiscovery'
import { LiveView } from './LiveView'
import { PTZControls } from './PTZControls'
import { VideoRecording } from './VideoRecording'
import { MotionDetection } from './MotionDetection'
import { RTSPDiagnosticTool } from './RTSPDiagnosticTool'
import { AutoRecordingSettings } from './AutoRecordingSettings'
import {
  Settings,
  Monitor,
  Activity,
  Search,
  Camera,
  RefreshCw,
  AlertTriangle,
  Info,
  Plus,
  Play,
  Grid,
  Maximize,
  Eye,
  TestTube,
  HardDrive
} from 'lucide-react'
import { UserProfile } from '../services/local-auth-service'

interface DeviceContentProps {
  activeTask: string
  devices: any[]
  selectedDevice: any
  onDeviceSelect: (device: any) => void
  onDevicesChange: (devices: any[]) => void
  onDeviceUpdate?: (device: any) => void
  isLoading: boolean
  error: string
  user: UserProfile
  hasPermission: (resource: string, action: string) => boolean
  deviceOperations: {
    handlePTZCommand: (deviceId: string, command: string, params: any) => Promise<void>
    handleStartRecording: (deviceId: string, type: string) => Promise<any>
    handleStopRecording: (recordingId: string) => Promise<any>
    handleGetRecordings: (deviceId: string) => Promise<any>
    handleToggleMotionDetection: (deviceId: string, enabled: boolean) => Promise<void>
    handleGetMotionEvents: () => Promise<any>
    handleAcknowledgeEvent: (eventId: string) => Promise<void>
  }
  systemStatus: {
    server: string
    database: string
    discovery: string
    streaming: string
  }
  onRefresh?: () => void
}

export function DeviceContent({
  activeTask,
  devices,
  selectedDevice,
  onDeviceSelect,
  onDevicesChange,
  onDeviceUpdate,
  isLoading,
  error,
  user,
  hasPermission,
  deviceOperations,
  systemStatus,
  onRefresh
}: DeviceContentProps) {
  const [localError, setLocalError] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid')

  const handleDevicesDiscovered = (discoveredDevices: any[]) => {
    console.log('🎉 Devices discovered in DeviceContent:', discoveredDevices.length)
    onDevicesChange(discoveredDevices)
    setLocalError('')
  }

  const refreshDevices = async () => {
    try {
      console.log('🔄 Refreshing devices list...')
      const response = await fetch('http://localhost:3001/api/devices')
      if (response.ok) {
        const data = await response.json()
        onDevicesChange(data.devices || [])
        console.log(`✅ Refreshed ${data.devices?.length || 0} devices`)
      }
    } catch (error: any) {
      console.error('❌ Failed to refresh devices:', error)
      setLocalError(`Failed to refresh devices: ${error.message}`)
    }
  }

  // Get authenticated devices for live view
  const authenticatedDevices = devices.filter(device => device.authenticated)
  const unauthenticatedDevices = devices.filter(device => !device.authenticated)

  // Show device discovery for discovery task OR when no devices exist
  if (activeTask === 'device-discovery' || (devices.length === 0 && !isLoading)) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-none">
          <OnvifDeviceDiscovery onDevicesDiscovered={handleDevicesDiscovered} />
        </div>
      </div>
    )
  }

  // Show live view - FIX: Use the standalone LiveView component properly
  if (activeTask === 'live-view') {
    console.log('🎥 Rendering Live View with devices:', authenticatedDevices.length)

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
            <LiveView
              devices={authenticatedDevices}
              selectedDevice={selectedDevice}
              onDeviceSelect={onDeviceSelect}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTask === 'ptz-controls') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
          {selectedDevice ? (
            <PTZControls
              deviceId={selectedDevice.id}
              deviceName={selectedDevice.name}
              ptzPresets={selectedDevice.ptz_presets || {}}
              onPTZCommand={(command, params) => deviceOperations.handlePTZCommand(selectedDevice.id, command, params)}
              disabled={!hasPermission('devices', 'ptz')}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>PTZ Camera Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Settings className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">No PTZ Camera Selected</h3>
                  <p className="text-gray-600 mb-4">
                    Select a PTZ-enabled camera from your devices to control it
                  </p>

                  {authenticatedDevices.filter(d => d.capabilities?.ptz).length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="font-medium">Available PTZ Cameras:</h4>
                      <div className="grid gap-2">
                        {authenticatedDevices.filter(d => d.capabilities?.ptz).map(device => (
                          <Button
                            key={device.id}
                            variant="outline"
                            onClick={() => onDeviceSelect(device)}
                            className="justify-start"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {device.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={refreshDevices}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add PTZ Cameras
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  if (activeTask === 'video-recording') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
            <VideoRecording
              selectedDevice={selectedDevice}
              devices={authenticatedDevices}
              onDeviceSelect={onDeviceSelect}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTask === 'motion-detection') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
          {selectedDevice ? (
            <MotionDetection
              deviceId={selectedDevice.id}
              deviceName={selectedDevice.name}
              motionEnabled={selectedDevice.motion_detection_enabled || false}
              onToggleMotionDetection={(enabled) => deviceOperations.handleToggleMotionDetection(selectedDevice.id, enabled)}
              onGetMotionEvents={deviceOperations.handleGetMotionEvents}
              onAcknowledgeEvent={deviceOperations.handleAcknowledgeEvent}
              canManageMotion={hasPermission('motion_events', 'write')}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Motion Detection</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Activity className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">No Camera Selected</h3>
                  <p className="text-gray-600 mb-4">
                    Select a camera from your devices to configure motion detection
                  </p>

                  {authenticatedDevices.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="font-medium">Available Cameras:</h4>
                      <div className="grid gap-2">
                        {authenticatedDevices.map(device => (
                          <Button
                            key={device.id}
                            variant="outline"
                            onClick={() => onDeviceSelect(device)}
                            className="justify-start"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {device.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={refreshDevices}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Cameras First
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  if (activeTask === 'camera-alerts') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Camera Alerts</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Alerts</h3>
                <p className="text-gray-600 mb-4">
                  Camera alerts and notifications will appear here when events are detected.
                </p>

                {authenticatedDevices.length === 0 ? (
                  <Button variant="outline" onClick={refreshDevices}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Cameras First
                  </Button>
                ) : (
                  <Badge variant="outline">
                    Monitoring {authenticatedDevices.length} device{authenticatedDevices.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (activeTask === 'auto-recording') {
    return (
      <div className="flex-1 overflow-y-auto">
        <AutoRecordingSettings
          devices={devices}
          onSettingsChange={(settings) => {
            console.log('🎬 Auto-recording settings updated:', settings)
            // Refresh devices to show updated recording status
            refreshDevices()
          }}
        />
      </div>
    )
  }

  if (activeTask === 'streaming-diagnostics') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Streaming Diagnostics</h2>
              <p className="text-gray-600 mt-1">
                Test RTSP connectivity and diagnose streaming issues
              </p>
            </div>

            <RTSPDiagnosticTool />

            {/* Streaming Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TestTube className="w-5 h-5" />
                  <span>Current Streaming Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span>Backend Server:</span>
                    <Badge variant={systemStatus.server === 'connected' ? 'default' : 'destructive'}>
                      {systemStatus.server}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Database:</span>
                    <Badge variant={systemStatus.database === 'connected' ? 'default' : 'destructive'}>
                      {systemStatus.database}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Discovery Service:</span>
                    <Badge variant={systemStatus.discovery === 'ready' ? 'default' : 'destructive'}>
                      {systemStatus.discovery}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Streaming Service:</span>
                    <Badge variant={systemStatus.streaming === 'ready' ? 'default' : 'destructive'}>
                      {systemStatus.streaming}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Fallback for unknown tasks
  return (
    <div className="flex-1 flex items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <div className="text-center">
            <Info className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Unknown Task</h3>
            <p className="text-gray-600">The requested task "{activeTask}" is not recognized.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}