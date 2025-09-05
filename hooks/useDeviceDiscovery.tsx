import { useState, useCallback } from 'react'
import { Device } from '../types/device-types'
import { API_BASE_URL } from '../constants/device-constants'
import { getAuthHeaders, processDeviceListResponse } from '../utils/device-helpers'
import { frontendOnvifService } from '../services/frontend-onvif-service'

export function useDeviceDiscovery() {
  const [devices, setDevices] = useState<Device[]>([])
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoDiscoveryCompleted, setAutoDiscoveryCompleted] = useState(false)

  const loadDevices = useCallback(async () => {
    try {
      // Don't show loading for refreshes to prevent flickering
      if (devices.length === 0) {
        setIsLoading(true)
      }
      setError('')

      let response = await fetch(`${API_BASE_URL}/devices`)

      if (response.status === 401) {
        response = await fetch(`${API_BASE_URL}/devices`, {
          headers: getAuthHeaders()
        })
      }

      if (response.ok) {
        const data = await response.json()
        const deviceList = processDeviceListResponse(data)

        // Only update if there's a meaningful change to prevent flickering
        const hasChanged = JSON.stringify(devices) !== JSON.stringify(deviceList)
        if (hasChanged) {
          setDevices(deviceList)
          console.log('Loaded devices:', deviceList)
        }

        if (deviceList.length === 0 && !autoDiscoveryCompleted) {
          setError('No devices found. Starting automatic discovery...')
        } else if (deviceList.length > 0 && hasChanged) {
          setError(`Found ${deviceList.length} device(s)`)
          setTimeout(() => setError(''), 3000)
        }
      } else {
        if (response.status === 401) {
          setError('Authentication failed. Please login again.')
        } else {
          setError(`Failed to load devices: ${response.status} ${response.statusText}`)
        }
      }
    } catch (error) {
      console.error('Error loading devices:', error)
      setError('Network error: Unable to connect to server. Make sure the backend is running on port 3001.')
    } finally {
      setIsLoading(false)
    }
  }, [devices, autoDiscoveryCompleted])

  const discoverDevices = useCallback(async () => {
    try {
      setIsDiscovering(true)
      setError('Starting device discovery...')

      let response = await fetch(`${API_BASE_URL}/devices/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.status === 401) {
        response = await fetch(`${API_BASE_URL}/devices/discover`, {
          method: 'POST',
          headers: getAuthHeaders()
        })
      }

      if (response.ok) {
        const data = await response.json()
        console.log('Discovery response:', data)
        setError('Discovery completed. Refreshing device list...')
        
        // Clear ONVIF cache to ensure fresh discovery for new devices
        frontendOnvifService.clearAllCache()
        
        setTimeout(() => {
          loadDevices()
          setAutoDiscoveryCompleted(true)
        }, 2000)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        setError(errorData.error || `Discovery failed: ${response.status}`)
      }
    } catch (error) {
      console.error('Error discovering devices:', error)
      setError('Failed to discover devices. Check network connection and ensure backend is running.')
    } finally {
      setIsDiscovering(false)
    }
  }, [loadDevices])

  return {
    devices,
    isDiscovering,
    isLoading,
    error,
    autoDiscoveryCompleted,
    setError,
    loadDevices,
    discoverDevices
  }
}