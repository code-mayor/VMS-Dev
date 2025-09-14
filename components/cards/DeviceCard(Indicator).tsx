import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
  Video,
  CheckCircle,
  Key,
  Play,
  Settings,
  Edit,
  Trash2,
  Tag,
  Wifi,
  WifiOff,
  AlertCircle,
  Circle,
  Loader2,
  Lock
} from 'lucide-react'

interface DeviceCardProps {
  device: any
  onAuthenticate?: (device: any) => void
  onStream?: (device: any) => void
  onReauth?: (device: any) => void
  onEdit?: (device: any) => void
  onDelete?: (deviceId: string) => void
  onConfigureProfiles?: (device: any) => void
  onSelect?: (device: any) => void
  isSelected?: boolean
  onSelectionChange?: (selected: boolean) => void
  showSelection?: boolean
  compact?: boolean
}

// Unified status determination function
function getDeviceStatus(device: any, healthData: any) {
  // Not authenticated devices have unknown status
  if (!device.authenticated) {
    return {
      status: 'unknown',
      label: 'Not Auth',
      variant: 'secondary' as const,
      icon: null,
      color: 'text-gray-500'
    }
  }

  // If health check is still running
  if (healthData.health === 'checking') {
    return {
      status: 'checking',
      label: 'Checking...',
      variant: 'outline' as const,
      icon: Loader2,
      color: 'text-blue-500',
      animate: true
    }
  }

  // Determine final status based on both device.status and health check
  const isOnline = (
    device.status === 'discovered' ||
    device.status === 'online' ||
    healthData.health === 'healthy'
  )

  const isOffline = (
    device.status === 'offline' ||
    device.status === 'error' ||
    healthData.health === 'offline'
  )

  const isDegraded = (
    !isOnline &&
    !isOffline &&
    healthData.health === 'degraded'
  )

  if (isOnline) {
    return {
      status: 'online',
      label: 'Online',
      variant: 'default' as const,
      icon: Wifi,
      color: 'text-green-500'
    }
  }

  if (isOffline) {
    return {
      status: 'offline',
      label: 'Offline',
      variant: 'destructive' as const,
      icon: WifiOff,
      color: 'text-red-500'
    }
  }

  if (isDegraded) {
    return {
      status: 'degraded',
      label: 'Degraded',
      variant: 'secondary' as const,
      icon: AlertCircle,
      color: 'text-yellow-500'
    }
  }

  // Default to unknown if we can't determine status
  return {
    status: 'unknown',
    label: 'Unknown',
    variant: 'outline' as const,
    icon: null,
    color: 'text-gray-500'
  }
}

export function DeviceCard({
  device,
  onAuthenticate,
  onStream,
  onReauth,
  onEdit,
  onDelete,
  onConfigureProfiles,
  onSelect,
  isSelected = false,
  onSelectionChange,
  showSelection = false,
  compact = false
}: DeviceCardProps) {
  const [deviceHealth, setDeviceHealth] = useState<{
    health: 'healthy' | 'degraded' | 'offline' | 'checking' | 'unknown'
    network: string
    rtsp: string
    latency?: number
  }>({
    health: device.authenticated ? 'checking' : 'unknown',
    network: 'unknown',
    rtsp: 'unknown'
  })

  const [profileTagStatus, setProfileTagStatus] = useState<{
    total: number
    tagged: number
    streaming: number
    recording: number
  } | null>(null)

  // Get unified status
  const deviceStatus = getDeviceStatus(device, deviceHealth)

  // Health check for authenticated devices
  useEffect(() => {
    if (device.authenticated && device.id) {
      checkDeviceHealth()
      const interval = setInterval(checkDeviceHealth, 30000)
      return () => clearInterval(interval)
    } else {
      setDeviceHealth({
        health: 'unknown',
        network: 'unknown',
        rtsp: 'unknown'
      })
    }
  }, [device.authenticated, device.id, device.status])

  const checkDeviceHealth = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/health/devices')
      if (response.ok) {
        const data = await response.json()
        const health = data.devices?.find((d: any) => d.id === device.id)
        if (health) {
          setDeviceHealth({
            health: health.health || 'unknown',
            network: health.network || 'unknown',
            rtsp: health.rtsp || 'unknown',
            latency: health.latency
          })
        } else {
          // If no health data, derive from device.status
          const derivedHealth = device.status === 'discovered' || device.status === 'online' ? 'healthy' :
            device.status === 'offline' || device.status === 'error' ? 'offline' :
              'unknown'
          setDeviceHealth(prev => ({
            ...prev,
            health: derivedHealth,
            network: derivedHealth === 'healthy' ? 'reachable' :
              derivedHealth === 'offline' ? 'unreachable' : 'unknown'
          }))
        }
      }
    } catch (error) {
      console.error('Health check failed:', error)
      // On error, derive from device.status
      const derivedHealth = device.status === 'discovered' || device.status === 'online' ? 'healthy' :
        device.status === 'offline' || device.status === 'error' ? 'offline' :
          'unknown'
      setDeviceHealth(prev => ({
        ...prev,
        health: derivedHealth,
        network: derivedHealth === 'healthy' ? 'reachable' :
          derivedHealth === 'offline' ? 'unreachable' : 'unknown'
      }))
    }
  }

  // Load profile tag status for authenticated devices
  useEffect(() => {
    if (device.authenticated && device.id) {
      loadProfileTagStatus()
    } else {
      setProfileTagStatus(null)
    }
  }, [device.authenticated, device.id])

  const loadProfileTagStatus = async () => {
    try {
      const profilesResponse = await fetch(`http://localhost:3001/api/devices/${device.id}/profiles`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (profilesResponse.ok) {
        const profilesData = await profilesResponse.json()
        const profiles = profilesData.profiles || []

        const assignmentsResponse = await fetch(`http://localhost:3001/api/devices/${device.id}/profile-assignments`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })

        let assignments = []
        if (assignmentsResponse.ok) {
          const assignmentsData = await assignmentsResponse.json()
          assignments = assignmentsData.profile_assignments || []
        }

        setProfileTagStatus({
          total: profiles.length,
          tagged: assignments.length,
          streaming: assignments.filter((tag: any) => tag.enabled_for_streaming).length,
          recording: assignments.filter((tag: any) => tag.enabled_for_recording).length
        })
      }
    } catch (error) {
      console.error('Error loading profile tag status:', error)
      setProfileTagStatus(null)
    }
  }

  const isOffline = deviceStatus.status === 'offline'

  // Render status indicator component
  const StatusIndicator = () => {
    if (!device.authenticated) return null

    const StatusIcon = deviceStatus.icon
    if (!StatusIcon) return null

    return (
      <StatusIcon
        className={`w-4 h-4 ${deviceStatus.color} ${deviceStatus.animate ? 'animate-spin' : ''}`}
      />
    )
  }

  // Compact card for discovery/list views
  if (compact) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1 min-w-0">
              {showSelection && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={onSelectionChange}
                />
              )}

              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-blue-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h3 className="font-medium text-sm truncate">{device.name}</h3>
                  <Badge variant="outline" className="text-xs">
                    {device.discovery_method?.toUpperCase() || 'MANUAL'}
                  </Badge>
                  {/* Status indicator with proper visibility */}
                  {device.authenticated && (
                    <div className="flex items-center">
                      <StatusIndicator />
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-600 space-y-0.5">
                  <div className="truncate">
                    <strong>IP:</strong> {device.ip_address}:{device.port || 80}
                  </div>
                  <div className="truncate">
                    <strong>Vendor:</strong> {device.manufacturer} {device.model}
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    {/* Show device discovery status */}
                    <Badge
                      variant={device.status === 'discovered' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {device.status}
                    </Badge>
                    {device.authenticated && (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Auth
                      </Badge>
                    )}
                    {device.profiles_configured && (
                      <Badge variant="default" className="text-xs">
                        <Tag className="w-3 h-3 mr-1" />
                        Profiles
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col space-y-1 ml-3">
              {!device.authenticated ? (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAuthenticate?.(device)
                  }}
                  className="text-xs px-3 py-1 h-auto"
                >
                  <Lock className="w-3 h-3 mr-1" />
                  Auth
                </Button>
              ) : (
                <div className="flex space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onReauth ? onReauth(device) : onAuthenticate?.(device)
                    }}
                    className="text-xs px-2 py-1 h-auto"
                    title="Update credentials"
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                  <Button
                    variant={device.profiles_configured ? "default" : "secondary"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onConfigureProfiles?.(device)
                    }}
                    className="text-xs px-2 py-1 h-auto"
                    title="Configure profiles"
                  >
                    <Tag className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Full card for device management view
  return (
    <Card className={`hover:shadow-lg transition-all duration-200 min-h-[380px] flex flex-col ${isOffline ? 'opacity-60 bg-gray-50' : ''}`}>
      <CardHeader className="pb-3 space-y-2">
        {/* Title Row with Status Indicators */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <Video className={`w-5 h-5 flex-shrink-0 ${isOffline ? 'text-gray-400' : 'text-gray-600'}`} />
            <h3 className={`font-semibold text-base truncate ${isOffline ? 'text-gray-500' : ''}`}>
              {device.name}
            </h3>
          </div>

          {/* Status Badge and Icon - Single unified display */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusIndicator />
            <Badge
              variant={deviceStatus.variant}
              className="text-xs"
            >
              {deviceStatus.label}
            </Badge>
          </div>
        </div>

        {/* IP Address */}
        <div className={`rounded-md px-2.5 py-1.5 ${isOffline ? 'bg-gray-100' : 'bg-gray-50 dark:bg-gray-800'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">IP</span>
            <code className="font-mono text-xs font-medium">{device.ip_address}</code>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 flex-1 flex flex-col pt-0">
        {/* Device Info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500 block">Manufacturer</span>
            <span className={`font-medium truncate block ${isOffline ? 'text-gray-500' : ''}`}>
              {device.manufacturer}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block">Model</span>
            <span className={`font-medium truncate block ${isOffline ? 'text-gray-500' : ''}`}>
              {device.model}
            </span>
          </div>
        </div>

        {/* Connection Status - Only show if authenticated and has data */}
        {device.authenticated && deviceStatus.status !== 'checking' && deviceStatus.status !== 'unknown' && (
          <div className={`rounded-md p-2 space-y-1.5 ${isOffline ? 'bg-gray-100' : 'bg-gray-50 dark:bg-gray-800'}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Network</span>
              <span className={`font-medium ${deviceHealth.network === 'reachable' ? 'text-green-600' :
                deviceHealth.network === 'unreachable' ? 'text-red-600' :
                  'text-gray-500'
                }`}>
                {deviceHealth.network}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">RTSP Port</span>
              <span className={`font-medium ${deviceHealth.rtsp === 'open' ? 'text-green-600' :
                deviceHealth.rtsp === 'closed' ? 'text-red-600' :
                  'text-gray-500'
                }`}>
                {deviceHealth.rtsp === 'unknown' ? 'Not tested' : `554: ${deviceHealth.rtsp}`}
              </span>
            </div>
            {deviceHealth.latency && deviceStatus.status === 'online' && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Latency</span>
                <span className="font-medium text-gray-700">{Math.round(deviceHealth.latency)}ms</span>
              </div>
            )}
          </div>
        )}

        {/* Capabilities & Profile Tags */}
        <div className="space-y-2">
          {device.capabilities && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(device.capabilities).map(([key, value]) =>
                value && (
                  <Badge key={key} variant="outline" className="text-xs py-0">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Badge>
                )
              )}
            </div>
          )}

          {device.authenticated && profileTagStatus && profileTagStatus.total > 0 && (
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs py-0">
                <Tag className="w-3 h-3 mr-1" />
                {profileTagStatus.tagged}/{profileTagStatus.total} Tags
              </Badge>
              {profileTagStatus.streaming > 0 && (
                <Badge variant="outline" className="text-xs py-0 text-blue-600 border-blue-200">
                  {profileTagStatus.streaming} Stream
                </Badge>
              )}
              {profileTagStatus.recording > 0 && (
                <Badge variant="outline" className="text-xs py-0 text-green-600 border-green-200">
                  {profileTagStatus.recording} Record
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 mt-auto pt-2 border-t">
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              onClick={() => onAuthenticate?.(device)}
              variant={device.authenticated ? "default" : "outline"}
              disabled={isOffline}
              className="w-full h-8 text-xs"
            >
              {device.authenticated ? (
                <>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Select
                </>
              ) : (
                <>
                  <Key className="w-3 h-3 mr-1" />
                  Authenticate
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onStream?.(device)}
              disabled={!device.authenticated || isOffline}
              className="w-full h-8 text-xs"
            >
              <Play className="w-3 h-3 mr-1" />
              Stream
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onReauth ? onReauth(device) : onAuthenticate?.(device)}
              disabled={isOffline}
              className="w-full h-7 text-xs px-1"
            >
              <Settings className="w-3 h-3 mr-0.5" />
              Config
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit?.(device)}
              className="w-full h-7 text-xs px-1"
            >
              <Edit className="w-3 h-3 mr-0.5" />
              Edit
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete?.(device.id)}
              className="w-full h-7 text-xs px-1 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3 mr-0.5" />
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}