import { CheckCircle, XCircle, AlertTriangle, Lock } from 'lucide-react'
import { frontendOnvifService } from '../services/frontend-onvif-service'
import { Device, NotificationType } from '../types/device-types'

export const getAuthToken = (): string => {
  const session = localStorage.getItem('onvif_session')
  if (session) {
    try {
      const parsed = JSON.parse(session)
      return parsed.accessToken
    } catch (error) {
      console.error('Error parsing session:', error)
    }
  }
  return localStorage.getItem('accessToken') || ''
}

export const getAuthHeaders = () => {
  const token = getAuthToken()
  const headers: any = {
    'Content-Type': 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export const getStatusIcon = (status: string, authenticated: boolean) => {
  if (authenticated || status === 'authenticated') {
    return <CheckCircle className="w-4 h-4 text-green-500" />
  }
  switch (status) {
    case 'connected':
    case 'online':
      return <CheckCircle className="w-4 h-4 text-blue-500" />
    case 'discovered':
      return <Lock className="w-4 h-4 text-yellow-500" />
    case 'offline':
      return <XCircle className="w-4 h-4 text-red-500" />
    default:
      return <AlertTriangle className="w-4 h-4 text-gray-500" />
  }
}

export const getStatusText = (status: string, authenticated: boolean) => {
  // Use enhanced authentication check from frontend service
  const enhancedAuth = frontendOnvifService.getAuthenticationStatus({ id: 'temp', ...status } as any)
  
  if (authenticated || status === 'authenticated' || enhancedAuth === 'valid') {
    return 'Authenticated'
  } else if (enhancedAuth === 'required') {
    return 'Auth Required'
  } else if (enhancedAuth === 'invalid') {
    return 'Invalid Creds'
  }
  
  switch (status) {
    case 'connected':
    case 'online':
      return 'Connected'
    case 'discovered':
      return 'Needs Auth'
    case 'offline':
      return 'Offline'
    default:
      return 'Unknown'
  }
}

export const isDeviceAuthenticated = (device: Device): boolean => {
  return frontendOnvifService.isDeviceAuthenticated(device)
}

export const createNotificationManager = (
  setError: (message: string) => void
) => {
  return (message: string, type: NotificationType = 'info') => {
    setError(message)
    setTimeout(() => {
      if (type === 'success' || type === 'info') {
        setError('')
      }
    }, 5000)
  }
}

export const processDeviceListResponse = (data: any): Device[] => {
  let deviceList: Device[] = []

  if (Array.isArray(data)) {
    deviceList = data
  } else if (data.success && data.devices) {
    deviceList = data.devices
  } else if (data.devices) {
    deviceList = data.devices
  } else if (data.data) {
    deviceList = data.data
  }

  return deviceList
}