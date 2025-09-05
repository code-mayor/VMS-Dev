import { useState } from 'react'

const API_BASE_URL = 'http://localhost:3001/api'

export function useDeviceOperations(accessToken: string | null) {
  const [selectedDevice, setSelectedDevice] = useState<any>(null)

  // PTZ Functions
  const handlePTZCommand = async (deviceId: string, command: string, params: any) => {
    if (!accessToken) throw new Error('Not authenticated')
    
    const response = await fetch(`${API_BASE_URL}/devices/${deviceId}/ptz/${command}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(params)
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'PTZ command failed')
    }
  }

  // Recording Functions
  const handleStartRecording = async (deviceId: string, recordingType: string) => {
    if (!accessToken) throw new Error('Not authenticated')
    
    const response = await fetch(`${API_BASE_URL}/recordings/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ device_id: deviceId, recording_type: recordingType })
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to start recording')
    }

    return data.recording
  }

  const handleStopRecording = async (recordingId: string) => {
    if (!accessToken) throw new Error('Not authenticated')
    
    const response = await fetch(`${API_BASE_URL}/recordings/${recordingId}/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to stop recording')
    }

    return data.recording
  }

  const handleGetRecordings = async (deviceId: string) => {
    if (!accessToken) throw new Error('Not authenticated')
    
    const response = await fetch(`${API_BASE_URL}/recordings/device/${deviceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to get recordings')
    }

    return data.recordings
  }

  // Motion Detection Functions
  const handleToggleMotionDetection = async (deviceId: string, enabled: boolean) => {
    if (!accessToken) throw new Error('Not authenticated')
    
    const response = await fetch(`${API_BASE_URL}/devices/${deviceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ motion_detection_enabled: enabled })
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to toggle motion detection')
    }
  }

  const handleGetMotionEvents = async () => {
    if (!accessToken) throw new Error('Not authenticated')
    
    const response = await fetch(`${API_BASE_URL}/motion/events`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to get motion events')
    }

    return data.motion_events
  }

  const handleAcknowledgeEvent = async (eventId: string) => {
    if (!accessToken) throw new Error('Not authenticated')
    
    const response = await fetch(`${API_BASE_URL}/motion/events/${eventId}/acknowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to acknowledge event')
    }
  }

  return {
    selectedDevice,
    setSelectedDevice,
    handlePTZCommand,
    handleStartRecording,
    handleStopRecording,
    handleGetRecordings,
    handleToggleMotionDetection,
    handleGetMotionEvents,
    handleAcknowledgeEvent
  }
}