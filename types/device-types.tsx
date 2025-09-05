export interface Device {
  id: string
  name: string
  ip_address: string
  port: number
  endpoint: string
  manufacturer: string
  model: string
  hardware?: string
  location?: string
  onvif_profile: string
  types?: string
  scopes?: string
  capabilities: {
    ptz: boolean
    audio: boolean
    video: boolean
    analytics: boolean
  }
  status: 'discovered' | 'connected' | 'offline' | 'online' | 'authenticated'
  recording_enabled?: boolean
  motion_detection_enabled?: boolean
  last_seen?: string
  discovered_at?: string
  created_at?: string
  updated_at?: string
  username?: string
  password?: string
  rtsp_username?: string
  rtsp_password?: string
  authenticated?: boolean
}

export interface Credentials {
  username: string
  password: string
}

export interface EnhancedCredentials {
  onvifUsername: string
  onvifPassword: string
  rtspUsername: string
  rtspPassword: string
}

export interface ManualDevice {
  name: string
  ip_address: string
  port: number
  username: string
  password: string
  rtspUsername?: string
  rtspPassword?: string
}

export interface OnvifDeviceDiscoveryProps {
  user: any
  onDeviceSelect?: (device: Device) => void
}

export type NotificationType = 'success' | 'error' | 'info'

// Enhanced device authentication result
export interface DeviceAuthResult {
  success: boolean
  device?: Device
  credentials?: EnhancedCredentials
  error?: string
  profilesFound?: number
  streamingCapabilities?: {
    rtspStreaming: boolean
    httpStreaming: boolean
    snapshotUri: boolean
  }
}

// Stream profile information
export interface StreamProfile {
  name: string
  url: string
  type: 'rtsp' | 'http' | 'mjpeg' | 'web'
  description: string
  browserCompatible: boolean
  priority: number
  category?: string
  verified?: boolean
  onvifProfile?: any
}

// Device credential update payload
export interface DeviceCredentialUpdate {
  deviceId: string
  onvifCredentials: {
    username: string
    password: string
  }
  rtspCredentials: {
    username: string
    password: string
  }
  autoSync?: boolean
}