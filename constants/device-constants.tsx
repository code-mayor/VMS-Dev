export const API_BASE_URL = 'http://localhost:3001/api'

export const DEFAULT_MANUAL_DEVICE = {
  name: '',
  ip_address: '',
  port: 80,
  username: '',
  password: ''
}

export const DEFAULT_CREDENTIALS = {
  username: '',
  password: ''
}

export const DEVICE_STATUS = {
  DISCOVERED: 'discovered' as const,
  CONNECTED: 'connected' as const,
  OFFLINE: 'offline' as const,
  ONLINE: 'online' as const,
  AUTHENTICATED: 'authenticated' as const
}

export const AUTH_STATUS = {
  UNKNOWN: 'unknown' as const,
  VALID: 'valid' as const,
  INVALID: 'invalid' as const,
  REQUIRED: 'required' as const
}

export const NOTIFICATION_TYPES = {
  SUCCESS: 'success' as const,
  ERROR: 'error' as const,
  INFO: 'info' as const
}

export const COMMON_CREDENTIALS = [
  { label: 'admin / admin', username: 'admin', password: 'admin' },
  { label: 'admin / password', username: 'admin', password: 'password' },
  { label: 'admin / 123456', username: 'admin', password: '123456' }
]

export const NETWORK_RANGES = [
  '192.168.1.x (Home networks)',
  '192.168.0.x (Router default)', 
  '192.168.226.x (Your current subnet)',
  '10.0.0.x (Corporate networks)'
]

export const REFRESH_INTERVALS = {
  DEVICE_LIST: 60000, // 60 seconds
  AUTO_DISCOVERY_DELAY: 2000 // 2 seconds
}