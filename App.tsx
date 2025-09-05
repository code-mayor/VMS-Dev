import React, { useState, useEffect } from 'react'
import { LoginForm } from './components/LoginForm'
import { MainNavigation } from './components/MainNavigation'
import { MainContent } from './components/MainContent'
import { Sidebar } from './components/Sidebar'
import { UserProfile, authService } from './services/local-auth-service'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import { Toaster } from './components/ui/sonner'
import ErrorBoundary from './components/ErrorBoundary'

// Simple icons to avoid import issues
const LogOutIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
)

const UserIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const ServerIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
  </svg>
)

const DatabaseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
  </svg>
)

const WifiIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
  </svg>
)

const AlertTriangle = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
)

const RefreshCw = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8.002 8.002 0 0115.356 2m-15.356-2H4" />
  </svg>
)

interface ServerStatus {
  connected: boolean
  loading: boolean
  error?: string
  backend?: boolean
  database?: boolean
  discovery?: boolean
}

function App() {
  // Server connectivity state
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    connected: false,
    loading: true,
    backend: false,
    database: false,
    discovery: false
  })

  // Authentication state
  const [user, setUser] = useState<UserProfile | null>(null)
  const [accessToken, setAccessToken] = useState<string>('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // App state
  const [activeTab, setActiveTab] = useState('devices')
  const [activeTask, setActiveTask] = useState('device-discovery')
  const [selectedDevice, setSelectedDevice] = useState<any>(null)
  const [deviceCount, setDeviceCount] = useState(0)

  useEffect(() => {
    initializeApp()
  }, [])

  const initializeApp = async () => {
    console.log('🚀 Initializing ONVIF VMS Application...')

    // Check server first
    const serverOk = await checkServerHealth()
    if (serverOk) {
      // Then check for existing session
      await checkExistingSession()
    }

    // Set up periodic health checks
    const healthCheckInterval = setInterval(checkServerHealth, 30000)

    // Cleanup on unmount
    return () => clearInterval(healthCheckInterval)
  }

  const checkServerHealth = async (): Promise<boolean> => {
    try {
      console.log('🏥 Checking server connectivity...')

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const backendResponse = await fetch('http://localhost:3001/api/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (backendResponse.ok) {
        const healthData = await backendResponse.json()
        console.log('✅ Backend health check passed:', healthData)

        // Enhanced status checking
        const dbStatus = healthData.database === 'connected' ||
          healthData.status === 'healthy' ||
          healthData.db === 'connected' ||
          (healthData.components && healthData.components.database === 'connected')

        const discoveryStatus = healthData.discovery === 'ready' ||
          healthData.onvif === 'ready' ||
          healthData.status === 'healthy' ||
          (healthData.components && healthData.components.discovery === 'ready')

        console.log('📊 Health Data Analysis:', {
          rawData: healthData,
          dbStatus,
          discoveryStatus
        })

        setServerStatus({
          connected: true,
          loading: false,
          backend: true,
          database: dbStatus,
          discovery: discoveryStatus
        })

        // Load device count
        try {
          const devicesResponse = await fetch('http://localhost:3001/api/devices')
          if (devicesResponse.ok) {
            const devicesData = await devicesResponse.json()
            setDeviceCount(devicesData.devices?.length || 0)
            console.log(`📊 Device count: ${devicesData.devices?.length || 0}`)
          }
        } catch (error) {
          console.warn('⚠️ Could not load device count:', error)
        }

        return true
      } else {
        throw new Error(`Backend responded with status: ${backendResponse.status}`)
      }
    } catch (error: any) {
      let errorMessage = 'Cannot connect to backend server'

      if (error.name === 'AbortError') {
        errorMessage = 'Connection timeout - server may not be running'
      } else if (error.message && error.message.includes('Failed to fetch')) {
        errorMessage = 'Backend server not running - start with: cd server && npm run dev'
      } else {
        errorMessage = error.message || errorMessage
      }

      console.error('❌ Server health check failed:', errorMessage)
      setServerStatus({
        connected: false,
        loading: false,
        error: errorMessage,
        backend: false,
        database: false,
        discovery: false
      })
      return false
    }
  }

  const checkExistingSession = async () => {
    try {
      const session = await authService.getCurrentSession()
      if (session && session.user) {
        console.log('🔐 Restored session for:', session.user.email)
        setUser(session.user)
        setAccessToken(session.accessToken)
        setIsAuthenticated(true)
      }
    } catch (error) {
      console.warn('⚠️ Could not restore session:', error)
    }
  }

  const handleLogin = (userProfile: UserProfile, token: string) => {
    console.log('🎉 Login successful for:', userProfile.email)
    setUser(userProfile)
    setAccessToken(token)
    setIsAuthenticated(true)
  }

  const handleLogout = async () => {
    try {
      console.log('👋 Logging out...')
      await authService.signOut()
      setUser(null)
      setAccessToken('')
      setIsAuthenticated(false)
      setActiveTab('devices')
      setActiveTask('device-discovery')
      setSelectedDevice(null)
      console.log('✅ Logout completed')
    } catch (error) {
      console.error('❌ Logout error:', error)
    }
  }

  const hasPermission = (resource: string, action: string): boolean => {
    if (!user) return false
    return authService.hasPermission(user, resource, action)
  }

  const handleRetryConnection = () => {
    console.log('🔄 Retrying server connection...')
    setServerStatus({
      connected: false,
      loading: true,
      backend: false,
      database: false,
      discovery: false
    })
    checkServerHealth()
  }

  const handleTaskChange = (task: string) => {
    console.log('🔄 Task changed to:', task)
    setActiveTask(task)

    if (task === 'device-discovery') {
      setSelectedDevice(null)
    }

    // Force refresh device count when switching to relevant tasks
    if (task === 'device-discovery' || task === 'live-view') {
      setTimeout(() => {
        checkServerHealth()
      }, 500)
    }
  }

  const handleDeviceSelect = (device: any) => {
    console.log('📱 Device selected:', device?.name || 'none')
    setSelectedDevice(device)

    // Debug device selection
    if (device) {
      console.log('📱 Selected device details:')
      console.log(`   Name: ${device.name}`)
      console.log(`   ID: ${device.id}`)
      console.log(`   IP: ${device.ip_address}`)
      console.log(`   Authenticated: ${device.authenticated}`)
      console.log(`   Current task: ${activeTask}`)
      console.log(`   Active tab: ${activeTab}`)

      // Only auto-switch to live view from device discovery, not from other tabs
      if (device.authenticated && activeTask === 'device-discovery' && activeTab === 'devices') {
        console.log('🎥 Auto-switching to live view for authenticated device from discovery')
        setActiveTask('live-view')
      } else {
        console.log('📍 Device selected but staying in current context:', {
          activeTab,
          activeTask,
          reason: activeTab !== 'devices' ? 'not in devices tab' : 'not from discovery'
        })
      }
    }
  }

  // Device operations for child components
  const deviceOperations = {
    selectedDevice,
    setSelectedDevice: handleDeviceSelect,
    handlePTZCommand: async (deviceId: string, command: string, params: any) => {
      console.log('PTZ Command:', deviceId, command, params)
    },
    handleStartRecording: async (deviceId: string, recordingType: string) => {
      console.log('Start Recording:', deviceId, recordingType)
    },
    handleStopRecording: async (recordingId: string) => {
      console.log('Stop Recording:', recordingId)
    },
    handleGetRecordings: async (deviceId: string) => {
      console.log('Get Recordings:', deviceId)
      return []
    },
    handleToggleMotionDetection: async (deviceId: string, enabled: boolean) => {
      console.log('Toggle Motion Detection:', deviceId, enabled)
    },
    handleGetMotionEvents: async () => {
      console.log('Get Motion Events')
      return []
    },
    handleAcknowledgeEvent: async (eventId: string) => {
      console.log('Acknowledge Event:', eventId)
    }
  }

  // Loading screen
  if (serverStatus.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md p-6">
          <div className="mb-6">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            ONVIF Video Management System
          </h1>
          <p className="text-gray-600 mb-4">
            Initializing system components...
          </p>
          <div className="text-sm text-gray-500 space-y-1">
            <div>• Connecting to backend server</div>
            <div>• Verifying database connection</div>
            <div>• Checking ONVIF discovery service</div>
          </div>
        </div>
      </div>
    )
  }

  // Server connection error
  if (!serverStatus.connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-lg mx-auto p-6">
          <div className="mb-6">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <ServerIcon />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Backend Connection Error
          </h1>
          <p className="text-gray-600 mb-6">
            {serverStatus.error}
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="text-sm text-gray-700">
              <div className="font-medium mb-3">🔧 Quick Fix Instructions:</div>

              <div className="space-y-3">
                <div>
                  <div className="font-medium text-gray-900 mb-2">1. Start the Backend Server:</div>
                  <div className="bg-black text-green-400 p-3 rounded font-mono text-sm">
                    <div>cd server</div>
                    <div>npm install</div>
                    <div>npm run dev</div>
                  </div>
                </div>

                <div>
                  <div className="font-medium text-gray-900 mb-2">2. Verify Server Status:</div>
                  <div className="text-xs space-y-1">
                    <div>• Server should start on <code className="bg-gray-200 px-1 rounded">localhost:3001</code></div>
                    <div>• Look for "✅ All systems operational" message</div>
                    <div>• Database and demo users will be created automatically</div>
                  </div>
                </div>

                <div>
                  <div className="font-medium text-gray-900 mb-2">3. Common Issues:</div>
                  <div className="text-xs space-y-1">
                    <div>• Port 3001 in use: Kill existing process or change port</div>
                    <div>• Permission denied: Run as administrator/sudo if needed</div>
                    <div>• Module errors: Delete node_modules and reinstall</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-3">
            <Button onClick={handleRetryConnection} className="flex items-center space-x-2">
              <WifiIcon />
              <span>Retry Connection</span>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Login screen
  if (!isAuthenticated || !user) {
    return <LoginForm onLogin={handleLogin} />
  }

  // Main VMS Application
  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col bg-gray-50">
        {/* System Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold text-gray-900">ONVIF VMS</h1>
              <div className="text-sm text-gray-500">
                Professional Video Management
              </div>
            </div>

            {/* System Status */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <DatabaseIcon />
                <Badge variant={serverStatus.database ? "default" : "destructive"} className="text-xs">
                  {serverStatus.database ? "DB Connected" : "DB Error"}
                </Badge>
              </div>

              <div className="flex items-center space-x-2">
                <WifiIcon />
                <Badge variant={serverStatus.discovery ? "default" : "secondary"} className="text-xs">
                  {serverStatus.discovery ? "Discovery Ready" : "Discovery Offline"}
                </Badge>
              </div>

              {deviceCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {deviceCount} Device{deviceCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <UserIcon />
              <span className="text-gray-700">{user.name || user.email}</span>
              <Badge variant="secondary" className="text-xs">
                {user.role.toUpperCase()}
              </Badge>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900"
            >
              <LogOutIcon />
              <span className="ml-1">Logout</span>
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <MainNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Main Layout */}
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            activeTask={activeTask}
            onTaskChange={handleTaskChange}
            onAddDevice={() => setActiveTask('device-discovery')}
            onEditDevice={() => console.log('Edit device')}
            onDeleteDevice={() => console.log('Delete device')}
            onRefreshStatus={() => checkServerHealth()}
          />

          <div className="flex-1 overflow-hidden bg-gray-50">
            <ErrorBoundary
              fallback={
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md p-6">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="font-medium text-gray-900 mb-2">Application Error</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Something went wrong with the main application. Please try refreshing the application state.
                    </p>
                    <Button onClick={() => {
                      // Reset application state instead of reloading page
                      setServerStatus({
                        connected: false,
                        loading: true,
                        backend: false,
                        database: false,
                        discovery: false
                      });
                      setActiveTab('devices');
                      setActiveTask('device-discovery');
                      setSelectedDevice(null);
                      // Re-initialize the app
                      checkServerHealth().then(() => {
                        checkExistingSession();
                      });
                    }}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reset Application
                    </Button>
                  </div>
                </div>
              }
            >
              <MainContent
                activeTab={activeTab}
                activeTask={activeTask}
                user={user}
                accessToken={accessToken}
                selectedDevice={selectedDevice}
                onDeviceSelect={handleDeviceSelect}
                hasPermission={hasPermission}
                deviceOperations={deviceOperations}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <Toaster />
    </ErrorBoundary>
  )
}

export default App