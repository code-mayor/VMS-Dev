import React, { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { PasswordReset } from './PasswordReset'
import { Toaster } from './ui/sonner'
import {
  Shield,
  User,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Server,
  Wifi,
  WifiOff,
  Clock,
  RefreshCw,
  UserPlus,
  LogIn,
  Key,
  Globe,
  WifiOff as OfflineIcon
} from 'lucide-react'
import authService, { type UserProfile } from '../services/local-auth-service'

interface LoginFormProps {
  onLogin: (user: UserProfile, accessToken: string) => void
}

interface ConnectivityStatus {
  connected: boolean
  latency: number
  lastCheck: Date | null
  error?: string
  offlineMode?: boolean
}

interface DemoUser {
  email: string
  password: string
  name: string
  role: string
}

export function LoginForm({ onLogin }: LoginFormProps) {
  // Loading and error states
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Server status
  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null)
  const [connectivity, setConnectivity] = useState<ConnectivityStatus>({
    connected: false,
    latency: 0,
    lastCheck: null,
    offlineMode: false
  })

  // Demo users
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([])
  const [loadingDemoUsers, setLoadingDemoUsers] = useState(false)

  // Form data
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  })
  const [signupData, setSignupData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    role: 'viewer'
  })

  // UI state
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [activeTab, setActiveTab] = useState('login')

  useEffect(() => {
    initializeApp()
  }, [])

  const initializeApp = async () => {
    console.log('🚀 Initializing ONVIF VMS Login...')

    // Always load demo users first (they work offline)
    await loadDemoUsers()

    // Check server status (non-blocking)
    await checkServerStatus()
  }

  const checkServerStatus = async () => {
    const startTime = Date.now()

    try {
      console.log('🏥 Checking server connectivity...')
      setConnectivity(prev => ({ ...prev, lastCheck: new Date() }))

      const healthy = await authService.checkServerHealth()
      const latency = Date.now() - startTime

      setServerHealthy(healthy)
      setConnectivity({
        connected: healthy,
        latency,
        lastCheck: new Date(),
        offlineMode: !healthy,
        error: healthy ? undefined : 'Server offline - using demo mode'
      })

      if (healthy) {
        console.log('✅ Server is online, full functionality available')
        setError('')
      } else {
        console.log('📴 Server offline, using demo mode with limited functionality')
        setError('')
      }
    } catch (err: any) {
      console.log('📴 Server unavailable, enabling offline mode')
      setServerHealthy(false)
      setConnectivity({
        connected: false,
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        offlineMode: true,
        error: 'Offline mode - demo accounts only'
      })
      setError('')
    }
  }

  const loadDemoUsers = async () => {
    setLoadingDemoUsers(true)
    try {
      console.log('👥 Loading demo users...')
      const users = await authService.checkDemoUsers()
      // Map the returned users to include password for demo display
      const demoUsersWithPasswords = users.map((user: any) => ({
        email: user.email,
        password: user.password || '', // password might be included for demo users
        name: user.name,
        role: user.role
      }))
      setDemoUsers(demoUsersWithPasswords)
      console.log(`✅ Loaded ${demoUsersWithPasswords.length} demo users`)
    } catch (error: any) {
      console.warn('⚠️ Failed to load demo users:', error)
      // Fallback demo users
      setDemoUsers([
        { email: 'admin@local.dev', password: 'admin123', name: 'Admin User', role: 'admin' },
        { email: 'operator@local.dev', password: 'operator123', name: 'Operator User', role: 'operator' },
        { email: 'viewer@local.dev', password: 'viewer123', name: 'Viewer User', role: 'viewer' }
      ])
    } finally {
      setLoadingDemoUsers(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginData.email || !loginData.password) {
      setError('Please enter both email and password')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log(`🔐 Attempting login for: ${loginData.email}`)

      const { user, accessToken } = await authService.signIn(loginData.email, loginData.password)
      // Always save under the canonical key that the app reads
      localStorage.setItem('vms_token', accessToken);

      const isDemo = accessToken.startsWith('demo_token_');
      localStorage.setItem('vms_session_mode', isDemo ? 'demo' : 'online');

      setSuccess(`Welcome back, ${user.name || user.email}!`)

      // Clear form
      setLoginData({ email: '', password: '' })

      // Call parent handler
      setTimeout(() => {
        onLogin(user, accessToken)
      }, 500)
    } catch (err: any) {
      console.error('❌ Login failed:', err)
      setError(err.message || 'Login failed. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!signupData.email || !signupData.password || !signupData.name) {
      setError('Please fill in all required fields')
      return
    }

    if (signupData.password !== signupData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (signupData.password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log(`📝 Attempting signup for: ${signupData.email}`)

      await authService.signUp(
        signupData.email,
        signupData.password,
        signupData.name,
        signupData.role
      )

      setSuccess('Account created successfully! Logging you in...')

      // Auto login after signup
      const { user, accessToken } = await authService.signIn(
        signupData.email,
        signupData.password
      )

      // Clear form
      setSignupData({
        email: '',
        password: '',
        confirmPassword: '',
        name: '',
        role: 'viewer'
      })

      // Call parent handler
      setTimeout(() => {
        onLogin(user, accessToken)
      }, 500)
    } catch (err: any) {
      console.error('❌ Signup failed:', err)
      setError(err.message || 'Signup failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDemoLogin = async (demoUser: DemoUser) => {
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log(`🎭 Demo login for: ${demoUser.email}`)

      // Fill in the login form with demo credentials
      setLoginData({ email: demoUser.email, password: demoUser.password })

      const { user, accessToken } = await authService.signIn(demoUser.email, demoUser.password)
      localStorage.setItem('vms_token', accessToken);

      const isDemo = accessToken.startsWith('demo_token_');
      localStorage.setItem('vms_session_mode', isDemo ? 'demo' : 'online');

      setSuccess(`Demo login successful as ${user.role}!`)

      setTimeout(() => {
        onLogin(user, accessToken)
      }, 500)
    } catch (err: any) {
      console.error('❌ Demo login failed:', err)
      setError(`Demo login failed: ${err.message || 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const getConnectivityIcon = () => {
    if (connectivity.offlineMode) {
      return <OfflineIcon className="w-4 h-4 text-orange-500" />
    } else if (connectivity.connected) {
      return <Wifi className="w-4 h-4 text-green-500" />
    } else {
      return <WifiOff className="w-4 h-4 text-red-500" />
    }
  }

  const getConnectivityStatus = () => {
    if (connectivity.offlineMode) {
      return (
        <Badge variant="outline" className="text-orange-700 border-orange-200">
          <OfflineIcon className="w-3 h-3 mr-1" />
          Offline Mode
        </Badge>
      )
    } else if (connectivity.connected) {
      return (
        <Badge variant="outline" className="text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Online ({connectivity.latency}ms)
        </Badge>
      )
    } else {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Server Offline
        </Badge>
      )
    }
  }

  if (showPasswordReset) {
    return <PasswordReset onBack={() => setShowPasswordReset(false)} />
  }

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ONVIF Video Management</h1>
            <p className="text-sm text-gray-600 mt-2">
              Professional surveillance system
            </p>
          </div>

          {/* Connection Status */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">
                  {connectivity.offlineMode ? 'Offline Mode' : connectivity.connected ? 'Server Online' : 'Server Offline'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {getConnectivityIcon()}
                {getConnectivityStatus()}
              </div>
            </div>

            {/* Offline Mode Notice */}
            {connectivity.offlineMode && (
              <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-start space-x-2">
                  <OfflineIcon className="w-4 h-4 text-orange-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-orange-900">Demo Mode Active</div>
                    <div className="text-orange-700 mt-1">
                      Server is not available. Only demo credentials will work.
                      Full functionality requires backend server.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {connectivity.lastCheck && (
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>Last checked: {connectivity.lastCheck.toLocaleTimeString()}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={checkServerStatus}
                  disabled={isLoading}
                  className="h-6 px-2"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Auth Forms */}
          <Card>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <CardHeader className="pb-3">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login" className="flex items-center space-x-1">
                    <LogIn className="w-4 h-4" />
                    <span>Login</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    className="flex items-center space-x-1"
                    disabled={connectivity.offlineMode}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Sign Up</span>
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              {/* Error/Success Messages */}
              {error && (
                <div className="px-6 pb-2">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </div>
              )}

              {success && (
                <div className="px-6 pb-2">
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription className="text-green-800">{success}</AlertDescription>
                  </Alert>
                </div>
              )}

              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} autoComplete="on">
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        name="email"
                        type="email"
                        placeholder="Enter your email"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        disabled={isLoading}
                        autoComplete="username email"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter your password"
                          value={loginData.password}
                          onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                          disabled={isLoading}
                          autoComplete="current-password"
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4 text-gray-400" />
                          ) : (
                            <Eye className="w-4 h-4 text-gray-400" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          <span>Signing in...</span>
                        </div>
                      ) : (
                        'Sign In'
                      )}
                    </Button>

                    <div className="text-center">
                      <Button
                        type="button"
                        variant="link"
                        className="text-sm text-blue-600"
                        onClick={() => setShowPasswordReset(true)}
                        disabled={isLoading || connectivity.offlineMode}
                      >
                        Forgot your password?
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignup} autoComplete="on">
                  <CardContent className="space-y-4">
                    {connectivity.offlineMode && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Account creation is not available in offline mode. Use demo accounts for testing.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Name</Label>
                      <Input
                        id="signup-name"
                        name="name"
                        type="text"
                        placeholder="Enter your full name"
                        value={signupData.name}
                        onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                        disabled={isLoading || connectivity.offlineMode}
                        autoComplete="name"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        name="email"
                        type="email"
                        placeholder="Enter your email"
                        value={signupData.email}
                        onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                        disabled={isLoading || connectivity.offlineMode}
                        autoComplete="email"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-role">Role</Label>
                      <Select
                        value={signupData.role}
                        onValueChange={(value) => setSignupData({ ...signupData, role: value })}
                        disabled={isLoading || connectivity.offlineMode}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="admin">Administrator</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          name="new-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Create a password"
                          value={signupData.password}
                          onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                          disabled={isLoading || connectivity.offlineMode}
                          autoComplete="new-password"
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading || connectivity.offlineMode}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4 text-gray-400" />
                          ) : (
                            <Eye className="w-4 h-4 text-gray-400" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          id="signup-confirm-password"
                          name="confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Confirm your password"
                          value={signupData.confirmPassword}
                          onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                          disabled={isLoading || connectivity.offlineMode}
                          autoComplete="new-password"
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          disabled={isLoading || connectivity.offlineMode}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-4 h-4 text-gray-400" />
                          ) : (
                            <Eye className="w-4 h-4 text-gray-400" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading || connectivity.offlineMode}
                    >
                      {isLoading ? (
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          <span>Creating account...</span>
                        </div>
                      ) : (
                        'Create Account'
                      )}
                    </Button>
                  </CardContent>
                </form>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Demo Users */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Demo Accounts</span>
                <Badge variant="outline" className="ml-2">
                  ✓ {demoUsers.length} available
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                {connectivity.offlineMode ?
                  'Demo accounts work in offline mode' :
                  'Quick access demo accounts for testing'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingDemoUsers ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  <span className="ml-2 text-sm text-gray-600">Loading demo users...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {demoUsers.map((user, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                          {user.role === 'admin' ? (
                            <Key className="w-4 h-4 text-red-500" />
                          ) : user.role === 'operator' ? (
                            <User className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Eye className="w-4 h-4 text-green-500" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}: {user.email}
                          </div>
                          <div className="text-xs text-gray-500">{user.name}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDemoLogin(user)}
                        disabled={isLoading}
                        className="text-xs"
                      >
                        {isLoading ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400" />
                        ) : (
                          'Try'
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Backend Setup Help */}
          {connectivity.offlineMode && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center space-x-2">
                  <Server className="w-4 h-4 text-orange-500" />
                  <span>Enable Full Features</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-600">
                  To enable account creation and full functionality, start the backend server:
                </div>
                <div className="bg-gray-100 p-3 rounded-lg">
                  <code className="text-sm">cd server && npm install && npm run dev</code>
                </div>
                <div className="text-xs text-gray-500">
                  Server should be accessible at http://localhost:3001
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Toast Notifications */}
      <Toaster />
    </>
  )
}