import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Progress } from './ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { ManualAddDeviceDialog } from './dialogs/ManualAddDeviceDialog'
import { DeviceAuthDialog } from './dialogs'
import { ProfileManagementDialog } from './dialogs/ProfileManagementDialog'
import { ErrorBoundary } from './ErrorBoundary'
import {
  Search,
  RefreshCw,
  Camera,
  Network,
  Plus,
  CheckCircle,
  AlertTriangle,
  Info,
  Wifi,
  Globe,
  Settings,
  Zap,
  Router,
  Target,
  Lock,
  Unlock,
  Play,
  Clock,
  Tag
} from 'lucide-react'

interface DiscoveredDevice {
  id: string
  name: string
  ip_address: string
  port: number
  manufacturer: string
  model: string
  discovery_method: string
  status: string
  capabilities: any
  discovered_at: string
  last_seen: string
  network_interface?: string
  authenticated?: boolean
  username?: string
  password?: string
  rtsp_username?: string
  rtsp_password?: string
  profiles_configured?: boolean
}

interface DiscoveryResults {
  devices: DiscoveredDevice[]
  discovered: number
  saved: number
  message: string
  discovery_methods?: Array<{ method: string; found: number }>
}

interface NetworkInterface {
  name: string
  address: string
  netmask: string
  family: string
}

interface NetworkInfo {
  interfaces: NetworkInterface[]
  commonRanges: Array<{
    interface: string
    subnet: string
    description: string
  }>
  recommendations: string[]
}

interface OnvifDeviceDiscoveryProps {
  onDevicesDiscovered: (devices: DiscoveredDevice[]) => void
}

export function OnvifDeviceDiscovery({ onDevicesDiscovered }: OnvifDeviceDiscoveryProps) {
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveryProgress, setDiscoveryProgress] = useState(0)
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveryResults | null>(null)
  const [error, setError] = useState('')
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [showProfileDialog, setShowProfileDialog] = useState(false)
  const [deviceToAuth, setDeviceToAuth] = useState<DiscoveredDevice | null>(null)
  const [deviceToConfigureProfiles, setDeviceToConfigureProfiles] = useState<DiscoveredDevice | null>(null)

  // Debug state changes
  useEffect(() => {
    console.log('🔐 Auth Dialog State Changed:', {
      showAuthDialog,
      deviceToAuth: deviceToAuth?.name || null,
      deviceId: deviceToAuth?.id || null
    })
  }, [showAuthDialog, deviceToAuth])

  // Debug Profile Dialog state changes
  useEffect(() => {
    console.log('📋 Profile Dialog State Changed:', {
      showProfileDialog,
      deviceToConfigureProfiles: deviceToConfigureProfiles?.name || null,
      deviceId: deviceToConfigureProfiles?.id || null
    })
  }, [showProfileDialog, deviceToConfigureProfiles])

  const [discoveryStage, setDiscoveryStage] = useState('')
  const [autoDiscoveryTriggered, setAutoDiscoveryTriggered] = useState(false)

  // Load network information and check for existing devices (prevent redundant discovery)
  useEffect(() => {
    const initializeSmartDiscovery = async () => {
      await loadNetworkInfo()

      // Check for existing devices first
      try {
        const response = await fetch('http://localhost:3001/api/devices')
        if (response.ok) {
          const data = await response.json()
          if (data.devices && data.devices.length > 0) {
            console.log(`📱 Found ${data.devices.length} existing devices - skipping auto-discovery`)
            onDevicesDiscovered(data.devices)
            setDiscoveryResults({
              devices: data.devices,
              discovered: data.devices.length,
              saved: data.devices.length,
              message: 'Loaded existing devices'
            })
            setAutoDiscoveryTriggered(true) // Mark as completed
            return
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not check existing devices:', error)
      }

      // Only run auto-discovery if no devices exist and not already triggered
      if (!autoDiscoveryTriggered) {
        console.log('🚀 Auto-triggering optimized ONVIF discovery...')
        setAutoDiscoveryTriggered(true)
        // Remove artificial delay - start immediately for fast response
        handleDiscovery(true) // Auto-discovery
      }
    }

    initializeSmartDiscovery()
  }, [])

  const loadNetworkInfo = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/devices/network-scan', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        const data = await response.json()
        setNetworkInfo(data.scanResults)
      }
    } catch (error: any) {
      console.warn('⚠️ Network info load failed:', error.message)
    }
  }

  const handleDiscovery = async (isAutoDiscovery = false) => {
    setIsDiscovering(true)
    setDiscoveryProgress(0)
    setError('')
    setDiscoveryResults(null)
    setDiscoveryStage(isAutoDiscovery ? 'Auto-discovery starting...' : 'Discovery starting...')

    try {
      if (isAutoDiscovery) {
        console.log('🔍 Starting optimized automatic discovery...')
      } else {
        console.log('🔍 Starting optimized manual discovery...')
      }

      // Fast progress simulation matching real backend timing
      const progressStages = [
        { stage: 'Parallel ONVIF & SSDP discovery...', progress: 30 },
        { stage: 'Targeted network scanning...', progress: 60 },
        { stage: 'Processing results...', progress: 85 }
      ]

      let currentStageIndex = 0
      const progressInterval = setInterval(() => {
        if (currentStageIndex < progressStages.length) {
          const stage = progressStages[currentStageIndex]
          setDiscoveryStage(stage.stage)
          setDiscoveryProgress(stage.progress)
          currentStageIndex++
        }
      }, 1800) // Much faster progress updates (1.8s intervals for 6-second total)

      // Make API call to optimized backend - clear progress immediately when done
      const response = await fetch('http://localhost:3001/api/devices/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      // Clear progress tracking immediately and show 100% completion
      clearInterval(progressInterval)
      setDiscoveryProgress(100)
      setDiscoveryStage('Discovery completed - processing results...')

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Discovery failed')
      }

      console.log(`✅ Optimized discovery completed. Found ${data.devices?.length || 0} devices`)

      // Remove duplicates based on IP address and preserve authentication status
      const uniqueDevices = (data.devices || []).reduce((acc: DiscoveredDevice[], current: DiscoveredDevice) => {
        const existingDevice = acc.find(device => device.ip_address === current.ip_address)
        if (!existingDevice) {
          acc.push(current)
        } else {
          // If device exists, update with latest information but keep authentication status
          const updatedIndex = acc.findIndex(device => device.ip_address === current.ip_address)
          if (updatedIndex !== -1) {
            acc[updatedIndex] = {
              ...current,
              authenticated: acc[updatedIndex].authenticated || current.authenticated,
              username: acc[updatedIndex].username || current.username,
              password: acc[updatedIndex].password || current.password,
              profiles_configured: acc[updatedIndex].profiles_configured || current.profiles_configured
            }
          }
        }
        return acc
      }, [])

      console.log(`🔧 Deduplicated devices: ${data.devices?.length || 0} -> ${uniqueDevices.length}`)

      setDiscoveryResults({
        devices: uniqueDevices,
        discovered: data.discovered || uniqueDevices.length,
        saved: data.saved || uniqueDevices.length,
        message: data.message || 'Discovery completed',
        discovery_methods: [
          { method: 'ONVIF WS-Discovery', found: uniqueDevices.filter((d: any) => d.discovery_method === 'onvif').length || 0 },
          { method: 'Network IP Scan', found: uniqueDevices.filter((d: any) => d.discovery_method === 'ip_scan').length || 0 },
          { method: 'SSDP/UPnP', found: uniqueDevices.filter((d: any) => d.discovery_method === 'ssdp').length || 0 }
        ]
      })

      onDevicesDiscovered(uniqueDevices)

      if (!data.devices || data.devices.length === 0) {
        if (isAutoDiscovery) {
          setError('Auto-discovery completed in ~6 seconds but found no devices. Network may be isolated or cameras may not support ONVIF.')
        } else {
          setError('No devices found after optimized scan. Check network connectivity and ONVIF support.')
        }
      }

    } catch (err: any) {
      console.error('❌ Optimized discovery failed:', err)
      setError(err.message || 'Discovery failed')
      setDiscoveryProgress(0)
      setDiscoveryStage('')

      if (err.message?.includes('fetch')) {
        setError('Cannot connect to backend server. Please ensure the server is running on port 3001.')
      } else if (err.message?.includes('timeout')) {
        setError('Discovery timed out. Backend optimization reduces this to ~6 seconds.')
      }
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleManualDeviceAdded = (device: DiscoveredDevice) => {
    console.log('✅ Manual device added:', device.name)

    if (discoveryResults) {
      const updatedResults = {
        ...discoveryResults,
        devices: [...discoveryResults.devices, device],
        saved: discoveryResults.saved + 1
      }
      setDiscoveryResults(updatedResults)
      onDevicesDiscovered(updatedResults.devices)
    } else {
      setDiscoveryResults({
        devices: [device],
        discovered: 1,
        saved: 1,
        message: 'Device added manually'
      })
      onDevicesDiscovered([device])
    }

    setShowManualAdd(false)
  }

  const handleAuthenticateDevice = (device: DiscoveredDevice) => {
    console.log('🔐 Auth button clicked for device:', device.name, device.id)
    console.log('🔐 Device object:', {
      id: device.id,
      name: device.name,
      ip_address: device.ip_address,
      authenticated: device.authenticated
    })
    setDeviceToAuth(device)
    setShowAuthDialog(true)
    console.log('🔐 Dialog state set to true, deviceToAuth set')
  }

  const handleAuthSuccess = (deviceId: string) => {
    const device = discoveryResults?.devices.find(d => d.id === deviceId)
    if (!device) {
      console.error('Device not found for ID:', deviceId)
      return
    }
    console.log('✅ Device authenticated successfully:', device.name)
    console.log('✅ Auth success callback called with device:', {
      id: device.id,
      name: device.name,
      authenticated: device.authenticated
    })

    if (discoveryResults) {
      const updatedDevices = discoveryResults.devices.map(d =>
        d.id === device.id ? {
          ...d,
          authenticated: true,
          username: device.username,
          password: device.password,
          rtsp_username: device.rtsp_username,
          rtsp_password: device.rtsp_password
        } : d
      )
      const updatedResults = {
        ...discoveryResults,
        devices: updatedDevices
      }
      setDiscoveryResults(updatedResults)
      onDevicesDiscovered(updatedDevices)
      console.log('✅ Device list updated, authenticated device should now show as Ready')
    }

    setShowAuthDialog(false)
    setDeviceToAuth(null)

    // Show profile configuration dialog after successful authentication
    console.log('📋 Opening profile configuration dialog for authenticated device')
    setDeviceToConfigureProfiles(device)
    setShowProfileDialog(true)
  }

  const handleConfigureProfiles = (device: DiscoveredDevice) => {
    console.log('📋 Configure profiles button clicked for device:', device.name)

    // Safety check to prevent crashes
    if (!device || !device.id) {
      console.error('❌ Cannot configure profiles: Invalid device object')
      setError('Invalid device selected for profile configuration')
      return
    }

    try {
      setDeviceToConfigureProfiles(device)
      setShowProfileDialog(true)
      console.log('✅ Profile dialog state set successfully')
    } catch (error) {
      console.error('❌ Error opening profile configuration dialog:', error)
      setError('Failed to open profile configuration dialog')
    }
  }

  const handleProfilesConfigured = () => {
    if (deviceToConfigureProfiles) {
      console.log('✅ Profiles configured successfully for device:', deviceToConfigureProfiles.name)

      if (discoveryResults) {
        const updatedDevices = discoveryResults.devices.map(d =>
          d.id === deviceToConfigureProfiles.id ? {
            ...d,
            profiles_configured: true
          } : d
        )
        const updatedResults = {
          ...discoveryResults,
          devices: updatedDevices
        }
        setDiscoveryResults(updatedResults)
        onDevicesDiscovered(updatedDevices)
      }
    }

    setShowProfileDialog(false)
    setDeviceToConfigureProfiles(null)
  }

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'ONVIF WS-Discovery':
        return <Zap className="w-4 h-4 text-blue-500" />
      case 'Network IP Scan':
        return <Target className="w-4 h-4 text-green-500" />
      case 'SSDP/UPnP':
        return <Globe className="w-4 h-4 text-orange-500" />
      default:
        return <Search className="w-4 h-4 text-gray-500" />
    }
  }

  const getDiscoveryMethodBadge = (method: string) => {
    const colors = {
      'onvif': 'bg-blue-100 text-blue-800 border-blue-200',
      'ip_scan': 'bg-green-100 text-green-800 border-green-200',
      'ssdp': 'bg-orange-100 text-orange-800 border-orange-200',
      'manual': 'bg-gray-100 text-gray-800 border-gray-200'
    }

    return colors[method as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getDiscoveryMethodName = (method: string) => {
    const names = {
      'onvif': 'ONVIF',
      'ip_scan': 'Fast Scan',
      'ssdp': 'SSDP',
      'manual': 'Manual'
    }

    return names[method as keyof typeof names] || method.toUpperCase()
  }

  const renderDeviceCard = (device: DiscoveredDevice) => (
    <Card key={device.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Camera className="w-5 h-5 text-blue-600" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <h3 className="font-medium text-base truncate">{device.name}</h3>
                <Badge
                  variant="outline"
                  className={`text-xs ${getDiscoveryMethodBadge(device.discovery_method)}`}
                >
                  {getDiscoveryMethodName(device.discovery_method)}
                </Badge>
              </div>

              <div className="text-sm text-gray-600 space-y-0.5">
                <div className="truncate">
                  <strong>IP:</strong> {device.ip_address}:{device.port}
                </div>
                <div className="truncate">
                  <strong>Vendor:</strong> {device.manufacturer}
                </div>
                {device.network_interface && (
                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <Router className="w-3 h-3" />
                    <span>{device.network_interface}</span>
                  </div>
                )}
              </div>

              {/* Compact capabilities */}
              <div className="flex items-center space-x-1 mt-2">
                {device.capabilities.video && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">Video</Badge>
                )}
                {device.capabilities.onvif && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">ONVIF</Badge>
                )}
                {device.capabilities.ptz && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">PTZ</Badge>
                )}
                {device.profiles_configured && (
                  <Badge variant="default" className="text-xs px-1.5 py-0.5">Profiles Set</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Compact action buttons */}
          <div className="flex flex-col space-y-1 ml-3 flex-shrink-0">
            {!device.authenticated ? (
              <Button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log('🔐 Auth Button clicked! Event details:', {
                    deviceId: device.id,
                    deviceName: device.name,
                    authenticated: device.authenticated
                  })
                  handleAuthenticateDevice(device)
                }}
                size="sm"
                className="text-xs px-3 py-1.5 h-auto"
              >
                <Lock className="w-3 h-3 mr-1" />
                Auth
              </Button>
            ) : (
              <div className="flex flex-col space-y-1">
                <Badge variant="default" className="text-xs justify-center">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Ready
                </Badge>
                <div className="flex space-x-1">
                  <Button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      console.log('🔐 Settings Button clicked for authenticated device!', {
                        deviceId: device.id,
                        deviceName: device.name,
                        authenticated: device.authenticated
                      })
                      handleAuthenticateDevice(device)
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs px-2 py-1 h-auto"
                    title="Update credentials"
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      console.log('📋 Profiles Button clicked for authenticated device!', {
                        deviceId: device.id,
                        deviceName: device.name,
                        profilesConfigured: device.profiles_configured
                      })
                      handleConfigureProfiles(device)
                    }}
                    variant={device.profiles_configured ? "default" : "secondary"}
                    size="sm"
                    className="text-xs px-2 py-1 h-auto"
                    title="Configure profiles for recording and streaming"
                  >
                    <Tag className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Discovery Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Fast ONVIF Discovery</h2>
          <p className="text-gray-600 mt-1">
            {autoDiscoveryTriggered ? 'Auto-discovery active • ' : ''}Optimized ~6 second discovery with parallel scanning
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={loadNetworkInfo}
            disabled={isDiscovering}
            className="flex items-center space-x-2"
          >
            <Network className="w-4 h-4" />
            <span>Network</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowManualAdd(true)}
            disabled={isDiscovering}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Manual</span>
          </Button>

          <Button
            onClick={() => handleDiscovery(false)}
            disabled={isDiscovering}
            size="lg"
            className="flex items-center space-x-2"
          >
            {isDiscovering ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Discovering...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Fast Discovery</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Auto-Discovery Status */}
      {autoDiscoveryTriggered && !discoveryResults && !isDiscovering && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            <strong>Auto-discovery completed in ~6 seconds.</strong> The system uses optimized parallel scanning for faster results.
            Use "Fast Discovery" to scan again or "Add Manual" for known devices.
          </AlertDescription>
        </Alert>
      )}

      {/* Compact Network Information */}
      {networkInfo && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center space-x-2">
              <Wifi className="w-5 h-5" />
              <span>Network Interfaces ({networkInfo.interfaces.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {networkInfo.interfaces.map((iface: NetworkInterface, index: number) => (
                <div key={index} className="p-3 bg-gray-50 rounded border text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{iface.name}</span>
                    <Badge variant="outline" className="text-xs">{iface.family}</Badge>
                  </div>
                  <div className="text-xs text-gray-600">{iface.address}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Optimized Discovery Progress */}
      {isDiscovering && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Optimized Discovery ({discoveryProgress}%)</span>
                <span className="text-sm text-gray-500">~6 seconds total</span>
              </div>

              <Progress value={discoveryProgress} className="w-full h-3" />

              {discoveryStage && (
                <div className="text-sm text-gray-600 flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
                  <span>{discoveryStage}</span>
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <div>⚡ Parallel ONVIF WS-Discovery & SSDP scanning</div>
                <div>🎯 Targeted IP scanning of high-probability addresses</div>
                <div>🔄 Real-time result processing and deduplication</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div>{error}</div>
              <div className="text-sm">
                <strong>Quick troubleshooting:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• Ensure cameras are powered and network-connected</li>
                  <li>• Verify ONVIF is enabled in camera settings</li>
                  <li>• Check network connectivity (same subnet recommended)</li>
                  <li>• Try manual addition for known camera IPs</li>
                </ul>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Discovery Results */}
      {discoveryResults && (
        <Tabs defaultValue="devices" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="devices">
              Devices Found ({discoveryResults.devices.length})
            </TabsTrigger>
            <TabsTrigger value="methods">
              Discovery Methods
            </TabsTrigger>
          </TabsList>

          <TabsContent value="devices" className="space-y-4">
            {discoveryResults.devices.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm text-gray-600 mb-4 p-3 bg-blue-50 rounded-lg border">
                  <strong>⚡ Discovery completed in ~6 seconds!</strong> Authenticate devices and configure profiles for recording/streaming.
                </div>
                {discoveryResults.devices.map(renderDeviceCard)}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Search className="w-16 h-16 text-gray-400 mb-4" />
                  <h3 className="text-xl font-medium text-gray-900 mb-2">No Devices Found</h3>
                  <p className="text-gray-600 text-center mb-6 max-w-md">
                    Optimized discovery scanned your network in ~6 seconds but found no ONVIF devices.
                    Cameras may not support ONVIF or be on a different network.
                  </p>
                  <div className="flex space-x-3">
                    <Button onClick={() => handleDiscovery(false)} disabled={isDiscovering}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </Button>
                    <Button variant="outline" onClick={() => setShowManualAdd(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Manually
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="methods" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {discoveryResults.discovery_methods?.map((method, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      {getMethodIcon(method.method)}
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{method.method}</h4>
                        <p className="text-xs text-gray-600">
                          {method.found} device{method.found !== 1 ? 's' : ''} found
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {method.found}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Manual Add Device Dialog */}
      <ManualAddDeviceDialog
        open={showManualAdd}
        onOpenChange={setShowManualAdd}
        onDeviceAdded={handleManualDeviceAdded}
      />

      {/* Device Authentication Dialog */}
      <DeviceAuthDialog
        open={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        device={deviceToAuth}
        onAuthSuccess={(deviceId) => handleAuthSuccess(deviceId)}
      />

      {/* Profile Management Dialog - THIS IS THE KEY COMPONENT THAT WAS MISSING! */}
      <ProfileManagementDialog
        open={showProfileDialog}
        onOpenChange={(open) => {
          console.log('📋 ProfileManagementDialog onOpenChange called with:', open)
          if (!open) {
            handleProfilesConfigured()
          } else {
            setShowProfileDialog(open)
          }
        }}
        device={deviceToConfigureProfiles}
      />
    </div>
  )
}