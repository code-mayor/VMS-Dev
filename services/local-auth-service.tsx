import axios from 'axios'

export interface UserProfile {
  id: string
  email: string
  name: string
  role: 'admin' | 'operator' | 'viewer'
  permissions?: any
  session_timeout?: number
  last_activity?: string
  created_at?: string
  last_login?: string
}

export interface AuthSession {
  user: UserProfile
  accessToken: string
  expiresAt: number
}

export interface LoginResponse {
  success: boolean
  user: UserProfile
  accessToken: string
  message?: string
  error?: string
}

export interface SignupResponse {
  success: boolean
  user: UserProfile
  message?: string
  error?: string
}

const AUTH_API = '/api/auth'
const TOKEN_KEY = 'vms_token'
const USER_KEY = 'vms_user'
const EXPIRY_KEY = 'vms_session_expiry'

// Fallback demo users for offline mode
const DEMO_USERS = [
  {
    id: 'demo-admin',
    email: 'admin@local.dev',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin' as const
  },
  {
    id: 'demo-operator',
    email: 'operator@local.dev',
    password: 'operator123',
    name: 'Operator User',
    role: 'operator' as const
  },
  {
    id: 'demo-viewer',
    email: 'viewer@local.dev',  
    password: 'viewer123',
    name: 'Viewer User',
    role: 'viewer' as const
  }
]

class AuthService {
  private isOfflineMode = false

  /**
   * Sign in user with email and password
   */
  async signIn(email: string, password: string): Promise<{ user: UserProfile; accessToken: string }> {
    console.log(`🔐 Attempting login for: ${email}`)

    // Check if this is a demo user login
    const demoUser = DEMO_USERS.find(u => u.email === email && u.password === password)
    if (demoUser) {
      console.log(`🎭 Demo user login: ${email}`)
      
      const user: UserProfile = {
        id: demoUser.id,
        email: demoUser.email,
        name: demoUser.name,
        role: demoUser.role,
        session_timeout: 86400 // 24 hours
      }

      const accessToken = `demo_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // Store session data
      const expiryTime = Date.now() + 86400 * 1000 // 24 hours
      localStorage.setItem(TOKEN_KEY, accessToken)
      localStorage.setItem(USER_KEY, JSON.stringify(user))
      localStorage.setItem(EXPIRY_KEY, expiryTime.toString())

      console.log(`✅ Demo login successful: ${user.email} (${user.role})`)
      return { user, accessToken }
    }

    // Try server authentication if not offline
    if (!this.isOfflineMode) {
      try {
        const response = await axios.post<LoginResponse>(`${AUTH_API}/login`, {
          email,
          password
        })

        if (response.data.success) {
          const { user, accessToken } = response.data
          
          // Calculate expiry time (default 24 hours)
          const expiryTime = Date.now() + (user.session_timeout || 86400) * 1000

          // Store session data
          localStorage.setItem(TOKEN_KEY, accessToken)
          localStorage.setItem(USER_KEY, JSON.stringify(user))
          localStorage.setItem(EXPIRY_KEY, expiryTime.toString())

          console.log(`✅ Server login successful: ${user.email} (${user.role})`)
          return { user, accessToken }
        } else {
          throw new Error(response.data.error || 'Login failed')
        }
      } catch (error: any) {
        console.warn(`⚠️ Server login failed, checking demo users...`, error.message)
        
        // Fall back to demo user if server fails
        if (demoUser) {
          return this.signIn(email, password) // Recursive call will hit demo user path
        }
        
        // Set offline mode for future requests
        this.isOfflineMode = true
        
        if (error.response?.status === 401) {
          throw new Error('Invalid email or password')
        } else {
          throw new Error('Server unavailable. Only demo credentials work in offline mode.')
        }
      }
    }

    throw new Error('Invalid credentials. Try demo accounts: admin@local.dev/admin123, operator@local.dev/operator123, viewer@local.dev/viewer123')
  }

  /**
   * Sign up new user
   */
  async signUp(email: string, password: string, name: string, role: string = 'viewer'): Promise<UserProfile> {
    console.log(`📝 Attempting signup for: ${email} (${role})`)

    if (this.isOfflineMode) {
      throw new Error('Account creation is not available in offline mode. Use demo accounts for testing.')
    }

    try {
      const response = await axios.post<SignupResponse>(`${AUTH_API}/signup`, {
        email,
        password,
        name,
        role
      })

      if (response.data.success) {
        console.log(`✅ Signup successful: ${email}`)
        return response.data.user
      } else {
        throw new Error(response.data.error || 'Signup failed')
      }
    } catch (error: any) {
      console.error(`❌ Signup failed for ${email}:`, error)
      
      // Set offline mode
      this.isOfflineMode = true
      
      if (error.response?.status === 409) {
        throw new Error('A user with this email already exists')
      } else {
        throw new Error('Server unavailable. Account creation requires backend server.')
      }
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    console.log('👋 Signing out user...')
    
    // Try to notify server (optional, don't fail if server is down)
    if (!this.isOfflineMode) {
      try {
        await axios.post(`${AUTH_API}/logout`)
      } catch (error) {
        console.warn('⚠️ Server logout notification failed (offline mode):', error)
        this.isOfflineMode = true
      }
    }

    // Clear local storage
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(EXPIRY_KEY)

    console.log('✅ User signed out successfully')
  }

  /**
   * Get current user token
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  }

  /**
   * Get current user profile
   */
  getCurrentUser(): UserProfile | null {
    const userJson = localStorage.getItem(USER_KEY)
    if (!userJson) return null
    
    try {
      return JSON.parse(userJson)
    } catch (error) {
      console.error('❌ Error parsing user data:', error)
      return null
    }
  }

  /**
   * Get current user role
   */
  getUserRole(): string | null {
    const user = this.getCurrentUser()
    return user?.role || null
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getToken()
    const expiry = localStorage.getItem(EXPIRY_KEY)
    
    if (!token || !expiry) return false
    
    return Date.now() < Number(expiry)
  }

  /**
   * Check if session is expired
   */
  isSessionExpired(): boolean {
    const expiry = localStorage.getItem(EXPIRY_KEY)
    return expiry ? Date.now() > Number(expiry) : true
  }

  /**
   * Get current session if valid
   */
  async getCurrentSession(): Promise<AuthSession | null> {
    if (!this.isAuthenticated()) {
      return null
    }

    const user = this.getCurrentUser()
    const token = this.getToken()
    const expiry = localStorage.getItem(EXPIRY_KEY)

    if (!user || !token || !expiry) {
      return null
    }

    return {
      user,
      accessToken: token,
      expiresAt: Number(expiry)
    }
  }

  /**
   * Check server health (works in offline mode)
   */
  async checkServerHealth(): Promise<boolean> {
    try {
      console.log('🏥 Checking server health...')
      
      const response = await axios.get('/api/health', {
        timeout: 3000 // Short timeout
      })
      
      const isHealthy = response.status === 200
      console.log(`${isHealthy ? '✅' : '❌'} Server health: ${isHealthy ? 'healthy' : 'unhealthy'}`)
      
      this.isOfflineMode = !isHealthy
      return isHealthy
    } catch (error: any) {
      console.warn('⚠️ Server health check failed, enabling offline mode:', error.message)
      this.isOfflineMode = true  
      return false
    }
  }

  /**
   * Check demo users availability (always works)
   */
  async checkDemoUsers(): Promise<UserProfile[]> {
    console.log('👥 Loading demo users...')

    // Always return demo users - they work offline
    const demoUserProfiles = DEMO_USERS.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      password: user.password // Include password for demo display
    }))

    // Try to get additional users from server if available
    if (!this.isOfflineMode) {
      try {
        const response = await axios.get(`${AUTH_API}/debug/users`, { timeout: 2000 })
        
        if (response.data?.success && Array.isArray(response.data.users)) {
          const serverUsers = response.data.users.filter((user: any) => 
            user.email?.includes('demo') || 
            user.email?.includes('local') ||
            user.email?.includes('test')
          )
          
          console.log(`✅ Found ${serverUsers.length} additional demo users from server`)
          return [...demoUserProfiles, ...serverUsers]
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch server demo users, using offline demo users')
        this.isOfflineMode = true
      }
    }

    console.log(`📦 Using ${demoUserProfiles.length} offline demo users`)
    return demoUserProfiles
  }

  /**
   * Check user permissions
   */
  hasPermission(user: UserProfile, resource: string, action: string): boolean {
    if (!user || !user.role) return false

    // Admin has all permissions
    if (user.role === 'admin') return true

    // Check role-based permissions
    const rolePermissions = {
      admin: {
        devices: ['read', 'write', 'delete', 'ptz', 'record'],
        users: ['read', 'write', 'delete'],
        streams: ['read', 'write', 'delete'],
        recordings: ['read', 'write', 'delete'],
        motion_events: ['read', 'write', 'delete'],
        settings: ['read', 'write']
      },
      operator: {
        devices: ['read', 'write', 'ptz', 'record'],
        users: ['read'],
        streams: ['read', 'write'],
        recordings: ['read', 'write'],
        motion_events: ['read', 'write'],
        settings: ['read']
      },
      viewer: {
        devices: ['read'],
        users: [],
        streams: ['read'],
        recordings: ['read'],
        motion_events: ['read'],
        settings: []
      }
    }

    const permissions = rolePermissions[user.role as keyof typeof rolePermissions]
    if (!permissions || !permissions[resource as keyof typeof permissions]) {
      return false
    }

    return permissions[resource as keyof typeof permissions].includes(action)
  }

  /**
   * Refresh authentication token (offline mode compatible)
   */
  async refreshToken(): Promise<string | null> {
    if (this.isOfflineMode) {
      // In offline mode, just extend the current token
      const currentToken = this.getToken()
      if (currentToken && this.isAuthenticated()) {
        const expiryTime = Date.now() + 86400 * 1000 // Extend by 24 hours
        localStorage.setItem(EXPIRY_KEY, expiryTime.toString())
        console.log('🔄 Extended offline session')
        return currentToken
      }
      return null
    }

    try {
      const response = await axios.post(`${AUTH_API}/refresh`)
      
      if (response.data?.success && response.data.accessToken) {
        const newToken = response.data.accessToken
        const expiryTime = Date.now() + 86400 * 1000 // 24 hours
        
        localStorage.setItem(TOKEN_KEY, newToken)
        localStorage.setItem(EXPIRY_KEY, expiryTime.toString())
        
        return newToken
      }
      
      return null
    } catch (error) {
      console.warn('⚠️ Token refresh failed, switching to offline mode:', error)
      this.isOfflineMode = true
      return null
    }
  }

  /**
   * Get offline mode status
   */
  isOffline(): boolean {
    return this.isOfflineMode
  }

  /**
   * Force offline mode (useful for testing)
   */
  setOfflineMode(offline: boolean = true): void {
    this.isOfflineMode = offline
    console.log(`${offline ? '📴' : '📶'} ${offline ? 'Offline' : 'Online'} mode ${offline ? 'enabled' : 'disabled'}`)
  }
}

// Create singleton instance
const authService = new AuthService()

// Setup axios interceptor for automatic token injection (when online)
axios.interceptors.request.use(
  (config) => {
    const token = authService.getToken()
    if (token && authService.isAuthenticated() && !authService.isOffline()) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Setup axios interceptor for handling auth errors (when online)
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && authService.isAuthenticated() && !authService.isOffline()) {
      console.warn('⚠️ Authentication token expired, attempting refresh...')
      
      const newToken = await authService.refreshToken()
      if (newToken) {
        // Retry the original request with new token
        error.config.headers.Authorization = `Bearer ${newToken}`
        return axios.request(error.config)
      } else {
        // Refresh failed, sign out user
        await authService.signOut()
        console.warn('🚪 Session expired, user signed out')
      }
    }
    
    return Promise.reject(error)
  }
)

export { authService }
export default authService