import { projectId, publicAnonKey } from '../utils/supabase/info'

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-097734f5`

export interface OnvifDevice {
  id: string
  name: string
  ip_address: string
  port: number
  manufacturer: string
  model: string
  onvif_profile: string
  capabilities: {
    ptz: boolean
    audio: boolean
    video: boolean
    analytics: boolean
  }
  stream_urls: {
    main: string
    sub: string
  }
  status: 'online' | 'offline' | 'authenticated' | 'error'
  created_at: string
  updated_at: string
}

export interface StreamInfo {
  id: string
  device_id: string
  stream_type: string
  protocol: string
  url: string
  status: string
  viewers: number
  created_at: string
}

class OnvifService {
  private headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${publicAnonKey}`
  }

  async discoverDevices(): Promise<OnvifDevice[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/devices/discover`, {
        method: 'POST',
        headers: this.headers
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to discover devices')
      }

      return data.devices
    } catch (error) {
      console.error('Error discovering ONVIF devices:', error)
      throw error
    }
  }

  async getAllDevices(): Promise<OnvifDevice[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/devices`, {
        method: 'GET',
        headers: this.headers
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to get devices')
      }

      return data.devices
    } catch (error) {
      console.error('Error getting devices:', error)
      throw error
    }
  }

  async authenticateDevice(deviceId: string, username: string, password: string): Promise<OnvifDevice> {
    try {
      const response = await fetch(`${API_BASE_URL}/devices/${deviceId}/authenticate`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to authenticate device')
      }

      return data.device
    } catch (error) {
      console.error('Error authenticating device:', error)
      throw error
    }
  }

  async createWebRTCStream(deviceId: string, streamType: string = 'main'): Promise<StreamInfo> {
    try {
      const response = await fetch(`${API_BASE_URL}/streams/create`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ deviceId, streamType })
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to create stream')
      }

      return data.stream
    } catch (error) {
      console.error('Error creating WebRTC stream:', error)
      throw error
    }
  }

  async getDeviceStreams(deviceId: string): Promise<StreamInfo[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/devices/${deviceId}/streams`, {
        method: 'GET',
        headers: this.headers
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to get streams')
      }

      return data.streams
    } catch (error) {
      console.error('Error getting device streams:', error)
      throw error
    }
  }
}

export const onvifService = new OnvifService()