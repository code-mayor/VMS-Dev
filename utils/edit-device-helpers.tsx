import { Device, EditDeviceFormData } from '../types/edit-device-types'
import { DEFAULT_FORM_DATA } from '../constants/edit-device-constants'

export const initializeFormData = (device: Device | null): EditDeviceFormData => {
  if (!device) return DEFAULT_FORM_DATA

  return {
    name: device.name || '',
    description: device.description || '',
    location: device.location || '',
    ip_address: device.ip_address || '',
    port: device.port || 80,
    username: device.username || '',
    password: device.password || '',
    rtsp_username: device.rtsp_username || '',
    rtsp_password: device.rtsp_password || '',
    recording_enabled: device.recording_enabled || false,
    motion_detection_enabled: device.motion_detection_enabled || false
  }
}

export const hasFormChanges = (
  formData: EditDeviceFormData, 
  originalData: EditDeviceFormData
): boolean => {
  return JSON.stringify(formData) !== JSON.stringify(originalData)
}

export const updateDevice = async (
  deviceId: string, 
  formData: EditDeviceFormData
): Promise<any> => {
  const response = await fetch(`http://localhost:3001/api/devices/${deviceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(formData)
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to update device')
  }

  return response.json()
}

export const testDeviceConnection = async (
  deviceId: string,
  connectionData: {
    ip_address: string
    port: number
    username: string
    password: string
  }
): Promise<void> => {
  const response = await fetch(`http://localhost:3001/api/devices/${deviceId}/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(connectionData)
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Connection test failed')
  }
}