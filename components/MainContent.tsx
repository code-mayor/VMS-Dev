import React, { useState, useEffect } from 'react'
import { DeviceContent } from './DeviceContent'
import { UserManagement } from './UserManagement'
import { CustomEvent } from './CustomEvent'
import { authFetch } from './auth';
import { EnhancedLiveView } from './EnhancedLiveView'
import { StreamStateProvider } from './StreamStateManager'
import { OptimizedDeviceDiscovery } from './OptimizedDeviceDiscovery'
import { UserProfile } from '../services/local-auth-service'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { toast } from 'sonner'
import {
  Construction,
  Info,
  Camera,
  Users,
  Activity,
  Settings,
  Server,
  Shield,
  Zap,
  FileText,
  BarChart,
  Key,
  Database,
  Wifi,
  WifiOff,
  AlertCircle,
  HardDrive,
  RefreshCw
} from 'lucide-react'

interface MainContentProps {
  activeTab: string
  activeTask: string
  user: UserProfile
  accessToken: string
  selectedDevice: any
  onDeviceSelect: (device: any) => void
  hasPermission: (resource: string, action: string) => boolean
  deviceOperations: any
}

export function MainContent({
  activeTab,
  activeTask,
  user,
  accessToken,
  selectedDevice,
  onDeviceSelect,
  hasPermission,
  deviceOperations
}: MainContentProps) {
  // Persistent devices state with sessionStorage backup
  const [devices, setDevices] = useState<any[]>(() => {
    const saved = sessionStorage.getItem('onvif-main-devices')
    return saved ? JSON.parse(saved) : []
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Fetch real system status from backend
  const [systemStatus, setSystemStatus] = useState({
    server: 'checking',
    database: 'checking',
    discovery: 'checking',
    streaming: 'checking'
  })

  // Session guard: skip auth status checks in demo/offline mode
  useEffect(() => {
    const mode = localStorage.getItem('vms_session_mode') || 'online';
    const token = localStorage.getItem('vms_token');

    if (mode === 'demo') {
      console.info('MainContent: DEMO/OFFLINE mode — skipping /api/auth/status.');
      return;
    }
    if (!token) return;

    (async () => {
      try {
        const res = await fetch('http://localhost:3001/api/auth/status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) {
          console.warn('Auth status 401 — clearing session');
          localStorage.removeItem('vms_token');
          localStorage.removeItem('vms_user');
          localStorage.removeItem('vms_session_expiry');
          localStorage.removeItem('vms_session_mode');
          // navigate to login here if you have routing
        }
      } catch (e) {
        console.warn('Status check failed (probably offline):', (e as any)?.message);
      }
    })();
  }, []);


  // Fetch system health status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/health')
        if (response.ok) {
          const data = await response.json()
          console.log('Health check response:', data)

          setSystemStatus({
            server: data.status === 'healthy' ? 'connected' : 'degraded',
            database: data.database === 'connected' ? 'connected' : 'disconnected',
            discovery: data.discovery || 'ready',
            streaming: data.components?.streaming || 'ready'
          })
        } else {
          throw new Error('Health check failed')
        }
      } catch (err) {
        console.warn('Health check failed:', err)
        setSystemStatus({
          server: 'disconnected',
          database: 'disconnected',
          discovery: 'error',
          streaming: 'error'
        })
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Persist devices to sessionStorage whenever they change
  useEffect(() => {
    if (devices.length > 0) {
      sessionStorage.setItem('onvif-main-devices', JSON.stringify(devices))
    }
  }, [devices])

  // Load devices when component mounts or when switching to devices tab
  useEffect(() => {
    if (activeTab === 'devices') {
      // Only reload if we don't have devices or it's been more than 5 minutes
      const shouldReload = devices.length === 0 ||
        (lastRefresh && Date.now() - lastRefresh.getTime() > 5 * 60 * 1000)

      if (shouldReload) {
        loadDevices()
      }
    }
  }, [activeTab])

  const loadDevices = async () => {
    try {
      setIsLoading(true)
      setError('')

      console.log('🔄 Loading devices from backend...')
      const response = await fetch('http://localhost:3001/api/devices')

      if (response.ok) {
        const data = await response.json()
        const loadedDevices = data.devices || []
        setDevices(loadedDevices)
        setLastRefresh(new Date())
        console.log(`✅ Loaded ${loadedDevices.length} devices`)

        if (loadedDevices.length > 0) {
          toast.success(`Loaded ${loadedDevices.length} device${loadedDevices.length !== 1 ? 's' : ''}`)
        }
      } else {
        throw new Error(`Failed to load devices: ${response.status}`)
      }
    } catch (err: any) {
      console.error('❌ Failed to load devices:', err)
      setError(err.message || 'Failed to load devices')
      toast.error(`Failed to load devices: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDevicesChange = (newDevices: any[]) => {
    console.log('📱 Devices updated:', newDevices.length)
    setDevices(newDevices)
    setLastRefresh(new Date())

    // Update sessionStorage immediately
    sessionStorage.setItem('onvif-main-devices', JSON.stringify(newDevices))
  }

  const handleDeviceUpdate = (updatedDevice: any) => {
    setDevices(prev => prev.map(d =>
      d.id === updatedDevice.id ? { ...d, ...updatedDevice } : d
    ))
  }

  const refreshDevices = () => {
    setLastRefresh(null) // Force reload
    loadDevices()
  }

  function DiagnosticsTab() {
    const [deviceHealth, setDeviceHealth] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      loadHealthData()
      const interval = setInterval(loadHealthData, 10000)
      return () => clearInterval(interval)
    }, [])

    const loadHealthData = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/health/devices')
        if (response.ok) {
          const data = await response.json()
          setDeviceHealth(data.devices || [])
        }
      } catch (error) {
        console.error('Failed to load health data:', error)
      } finally {
        setLoading(false)
      }
    }

    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Device Diagnostics</h2>

        {loading ? (
          <div>Loading diagnostics...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deviceHealth.map(device => (
              <Card key={device.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{device.name}</span>
                    <Badge variant={
                      device.health === 'healthy' ? 'default' :
                        device.health === 'degraded' ? 'secondary' : 'destructive'
                    }>
                      {device.health}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>IP Address:</span>
                      <span className="font-mono">{device.ip}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Network:</span>
                      <Badge variant={device.network === 'reachable' ? 'outline' : 'destructive'}>
                        {device.network}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>RTSP Port:</span>
                      <Badge variant={device.rtsp === 'open' ? 'outline' : 'secondary'}>
                        {device.rtsp}
                      </Badge>
                    </div>
                    {device.latency && (
                      <div className="flex justify-between">
                        <span>Latency:</span>
                        <span>{device.latency}ms</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Get device statistics
  const deviceStats = {
    total: devices.length,
    authenticated: devices.filter(d => d.authenticated).length,
    online: devices.filter(d => d.status === 'discovered').length,
    recording: devices.filter(d => d.recording_enabled).length
  }

  // Handle different tabs
  switch (activeTab) {
    case 'devices':
      // Handle device subtasks based on activeTask
      if (activeTask === 'live-view') {
        return (
          <StreamStateProvider>
            <EnhancedLiveView
              devices={devices}
              selectedDevice={selectedDevice}
              onDeviceSelect={onDeviceSelect}
              onRefreshDevices={() => {
                // This should trigger a re-fetch of devices
                // The exact implementation depends on your parent component
                loadDevices(); // or whatever function fetches the device list
              }}
            />
          </StreamStateProvider>
        )
      } else if (activeTask === 'device-discovery') {
        return (
          <OptimizedDeviceDiscovery
            onDevicesDiscovered={handleDevicesChange}
          />
        )
      } else {
        return (
          <DeviceContent
            activeTask={activeTask}
            devices={devices}
            selectedDevice={selectedDevice}
            onDeviceSelect={onDeviceSelect}
            onDevicesChange={handleDevicesChange}
            onDeviceUpdate={handleDeviceUpdate}
            isLoading={isLoading}
            error={error}
            user={user}
            hasPermission={hasPermission}
            deviceOperations={deviceOperations}
            systemStatus={systemStatus}
            onRefresh={refreshDevices}
          />
        )
      }

    case 'applications':
      return <ApplicationsTab />

    case 'custom-event':
      return <CustomEvent />

    case 'user-management':
      return <UserManagement currentUser={user} hasPermission={hasPermission} />

    case 'server-logs':
      return <ServerLogsTab />

    case 'health-check':
      return <HealthCheckTab deviceStats={deviceStats} />

    case 'diagnostics':
      return <DiagnosticsTab />

    case 'settings':
      return <SettingsTab />

    case 'product-activation':
      return <ProductActivationTab />

    default:
      return (
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <Info className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Unknown Tab</h3>
                <p className="text-gray-600">The requested tab "{activeTab}" is not recognized.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )
  }
}

// Individual tab components with enhanced functionality
function ApplicationsTab() {
  const applications = [
    {
      id: 'video-analytics',
      name: 'Video Analytics',
      description: 'AI-powered motion detection and object recognition',
      icon: Activity,
      status: 'active',
      version: '2.1.0'
    },
    {
      id: 'facial-recognition',
      name: 'Facial Recognition',
      description: 'Advanced facial detection and identification system',
      icon: Users,
      status: 'inactive',
      version: '1.5.2'
    },
    {
      id: 'license-plate',
      name: 'License Plate Recognition',
      description: 'Automatic license plate detection and logging',
      icon: Camera,
      status: 'active',
      version: '1.8.1'
    }
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <Zap className="w-5 h-5" />
              <span>Applications</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage system applications and integrations
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Badge variant="outline">
              {applications.filter(app => app.status === 'active').length} Active
            </Badge>
            <Badge variant="secondary">
              {applications.length} Total
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {applications.map((app) => {
            const Icon = app.icon
            return (
              <Card key={app.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{app.name}</CardTitle>
                      <div className="flex items-center space-x-2">
                        <Badge variant={app.status === 'active' ? 'default' : 'secondary'}>
                          {app.status}
                        </Badge>
                        <span className="text-sm text-gray-500">v{app.version}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">{app.description}</p>
                  <div className="flex space-x-2">
                    <Button size="sm" variant={app.status === 'active' ? 'outline' : 'default'}>
                      {app.status === 'active' ? 'Configure' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="outline">
                      Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ServerLogsTab() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate loading logs
    setTimeout(() => {
      setLogs([
        { id: 1, timestamp: new Date().toISOString(), level: 'INFO', message: 'Device discovery completed', source: 'discovery' },
        { id: 2, timestamp: new Date(Date.now() - 60000).toISOString(), level: 'WARN', message: 'High CPU usage detected', source: 'system' },
        { id: 3, timestamp: new Date(Date.now() - 120000).toISOString(), level: 'ERROR', message: 'Failed to connect to device 192.168.1.100', source: 'network' },
        { id: 4, timestamp: new Date(Date.now() - 180000).toISOString(), level: 'INFO', message: 'User login: admin@local.dev', source: 'auth' },
        { id: 5, timestamp: new Date(Date.now() - 240000).toISOString(), level: 'INFO', message: 'Stream started for Camera-001', source: 'streaming' }
      ])
      setLoading(false)
    }, 1000)
  }, [])

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR': return <Badge variant="destructive">{level}</Badge>
      case 'WARN': return <Badge variant="secondary">{level}</Badge>
      case 'INFO': return <Badge variant="outline">{level}</Badge>
      default: return <Badge variant="outline">{level}</Badge>
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <FileText className="w-5 h-5" />
              <span>Server Logs</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              System logs and diagnostic information
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Badge variant="outline">{logs.length} Entries</Badge>
            <Button variant="outline" size="sm">
              <Server className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading logs...</p>
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          {getLevelBadge(log.level)}
                          <span className="text-sm text-gray-500">{log.source}</span>
                          <span className="text-xs text-gray-400">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900">{log.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function HealthCheckTab({ deviceStats }: { deviceStats?: any }) {
  const healthData = [
    { name: 'Database', status: 'healthy', value: '99.9%', icon: Database },
    { name: 'Network', status: 'healthy', value: '28ms', icon: Wifi },
    { name: 'Storage', status: 'warning', value: '85%', icon: HardDrive },
    { name: 'CPU Usage', status: 'healthy', value: '32%', icon: BarChart },
    { name: 'Memory', status: 'healthy', value: '64%', icon: BarChart },
    { name: 'Active Streams', status: 'healthy', value: deviceStats?.authenticated || '0', icon: Camera }
  ]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy': return <Badge variant="default">Healthy</Badge>
      case 'warning': return <Badge variant="secondary">Warning</Badge>
      case 'error': return <Badge variant="destructive">Error</Badge>
      default: return <Badge variant="outline">Unknown</Badge>
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <Activity className="w-5 h-5" />
              <span>System Health</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Monitor system performance and health metrics
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Badge variant="default">All Systems Operational</Badge>
            <Button variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {healthData.map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.name}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-medium">{item.name}</h3>
                        <p className="text-2xl font-bold text-gray-900">{item.value}</p>
                      </div>
                    </div>
                    <div>
                      {getStatusBadge(item.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SettingsTab() {
  const settingsCategories = [
    {
      id: 'general',
      name: 'General Settings',
      description: 'Basic system configuration',
      icon: Settings,
      settings: ['System Name', 'Time Zone', 'Language', 'Auto-discovery']
    },
    {
      id: 'network',
      name: 'Network Configuration',
      description: 'Network and connectivity settings',
      icon: Wifi,
      settings: ['IP Configuration', 'Port Settings', 'Firewall Rules', 'SSL Certificates']
    },
    {
      id: 'storage',
      name: 'Storage Management',
      description: 'Storage and recording settings',
      icon: HardDrive,
      settings: ['Storage Locations', 'Retention Policies', 'Auto-cleanup', 'Backup Settings']
    },
    {
      id: 'security',
      name: 'Security Settings',
      description: 'Authentication and security configuration',
      icon: Shield,
      settings: ['Password Policy', 'Session Timeout', 'Two-Factor Auth', 'Audit Logging']
    }
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>System Settings</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Configure system preferences and behavior
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsCategories.map((category) => {
            const Icon = category.icon
            return (
              <Card key={category.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      <p className="text-sm text-gray-600">{category.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {category.settings.map((setting) => (
                      <div key={setting} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                        <span className="text-sm">{setting}</span>
                        <Button variant="ghost" size="sm">
                          Configure
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ProductActivationTab() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <Key className="w-5 h-5" />
              <span>Product Activation</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage licenses and product activation
            </p>
          </div>

          <Badge variant="default">Licensed</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span>License Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Product</label>
                  <p className="font-medium">ONVIF VMS Professional</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Version</label>
                  <p className="font-medium">2.1.0</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">License Type</label>
                  <p className="font-medium">Commercial</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Expires</label>
                  <p className="font-medium">December 31, 2025</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Max Cameras</label>
                  <p className="font-medium">Unlimited</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Max Users</label>
                  <p className="font-medium">50</p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex space-x-3">
                  <Button>
                    <Key className="w-4 h-4 mr-2" />
                    Update License
                  </Button>
                  <Button variant="outline">
                    Export License Info
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}