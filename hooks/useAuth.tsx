import { useState, useEffect } from 'react'
import { authService, UserProfile } from '../services/local-auth-service'

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionWarning, setSessionWarning] = useState(false)

  useEffect(() => {
    checkAuthState()
    setupSessionCallbacks()
  }, [])

  const checkAuthState = async () => {
    try {
      const session = await authService.getCurrentSession()
      if (session) {
        setUser(session.user)
        setAccessToken(session.accessToken)
      }
    } catch (error) {
      console.error('Error checking auth state:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const setupSessionCallbacks = () => {
    authService.setSessionCallbacks(
      () => setSessionWarning(true),
      async () => {
        setSessionWarning(false)
        await handleLogout()
      }
    )
  }

  const handleLogin = (user: UserProfile, accessToken: string) => {
    setUser(user)
    setAccessToken(accessToken)
    setSessionWarning(false)
  }

  const handleLogout = async () => {
    try {
      await authService.signOut()
      setUser(null)
      setAccessToken(null)
      setSessionWarning(false)
    } catch (error) {
      console.error('Error logging out:', error)
    }
  }

  const handleExtendSession = async () => {
    if (!accessToken) return
    
    try {
      const extended = await authService.extendSession()
      if (extended) {
        setSessionWarning(false)
        const session = await authService.getCurrentSession()
        if (session) {
          setUser(session.user)
          setAccessToken(session.accessToken)
        }
      }
    } catch (error) {
      console.error('Error extending session:', error)
    }
  }

  const hasPermission = (resource: string, action: string): boolean => {
    if (!user) return false
    return authService.hasPermission(user, resource, action)
  }

  return {
    user,
    accessToken,
    isLoading,
    sessionWarning,
    handleLogin,
    handleLogout,
    handleExtendSession,
    hasPermission,
    setSessionWarning
  }
}