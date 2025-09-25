import { useState, useEffect, useCallback, useRef } from 'react'
import { MotionAlert, MotionConfig, MotionEvent, MotionStatistics } from '../types/motion-types'
import { motionService } from '../services/motion-service'
import { toast } from 'sonner'

interface UseMotionDetectionOptions {
    deviceId?: string
    autoConnect?: boolean
    onAlert?: (alert: MotionAlert) => void
    onConfigUpdate?: (config: MotionConfig) => void
    cooldownPeriod?: number
}

interface UseMotionDetectionReturn {
    // State
    alerts: Map<string, MotionAlert>
    events: MotionEvent[]
    config: MotionConfig | null
    statistics: MotionStatistics | null
    isConnected: boolean
    isLoading: boolean
    error: string | null

    // Actions
    startDetection: (deviceId: string, config?: Partial<MotionConfig>) => Promise<void>
    stopDetection: (deviceId: string) => Promise<void>
    acknowledgeAlert: (alertId: string) => void
    clearAlerts: () => void
    updateConfig: (config: Partial<MotionConfig>) => Promise<void>
    refreshStatistics: () => Promise<void>

    // WebSocket
    connect: () => void
    disconnect: () => void
    subscribeToDevice: (deviceId: string) => void
    unsubscribeFromDevice: (deviceId: string) => void
}

export function useMotionDetection(options: UseMotionDetectionOptions = {}): UseMotionDetectionReturn {
    const {
        deviceId,
        autoConnect = true,
        onAlert,
        onConfigUpdate,
        cooldownPeriod = 5000
    } = options

    // State
    const [alerts, setAlerts] = useState<Map<string, MotionAlert>>(new Map())
    const [events, setEvents] = useState<MotionEvent[]>([])
    const [config, setConfig] = useState<MotionConfig | null>(null)
    const [statistics, setStatistics] = useState<MotionStatistics | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Refs
    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
    const alertTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
    const subscribedDevicesRef = useRef<Set<string>>(new Set())

    // WebSocket connection
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected')
            return
        }

        try {
            const ws = new WebSocket(`ws://localhost:3001/motion`)

            ws.onopen = () => {
                console.log('Motion WebSocket connected')
                setIsConnected(true)
                setError(null)

                // Re-subscribe to previously subscribed devices
                subscribedDevicesRef.current.forEach(deviceId => {
                    ws.send(JSON.stringify({
                        type: 'subscribe-device',
                        deviceId
                    }))
                })
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    handleWebSocketMessage(data)
                } catch (err) {
                    console.error('Failed to parse WebSocket message:', err)
                }
            }

            ws.onerror = (error) => {
                console.error('WebSocket error:', error)
                setError('WebSocket connection error')
            }

            ws.onclose = () => {
                console.log('WebSocket disconnected')
                setIsConnected(false)
                wsRef.current = null

                // Auto-reconnect after 5 seconds
                if (autoConnect) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        console.log('Attempting to reconnect...')
                        connect()
                    }, 5000)
                }
            }

            wsRef.current = ws
        } catch (err) {
            console.error('Failed to connect WebSocket:', err)
            setError('Failed to connect to motion detection service')
        }
    }, [autoConnect])

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
        }

        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }

        setIsConnected(false)
    }, [])

    const handleWebSocketMessage = useCallback((data: any) => {
        switch (data.type) {
            case 'motion-alert':
                handleMotionAlert(data)
                break

            case 'alert-acknowledged':
                handleAlertAcknowledged(data)
                break

            case 'config-updated':
                handleConfigUpdated(data)
                break

            case 'statistics':
                setStatistics(data.statistics)
                break

            case 'pending-alerts':
                handlePendingAlerts(data)
                break

            default:
                console.log('Unknown WebSocket message type:', data.type)
        }
    }, [])

    const handleMotionAlert = useCallback((data: any) => {
        const alert: MotionAlert = {
            id: data.alertId || `alert-${Date.now()}`,
            deviceId: data.deviceId,
            deviceName: data.deviceName,
            timestamp: data.timestamp,
            type: data.type || 'motion',
            confidence: data.confidence,
            alertLevel: data.alertLevel,
            summary: data.summary || 'Motion detected',
            acknowledged: false,
            objects: data.objects,
            recording: data.recording,
            snapshot: data.snapshot
        }

        setAlerts(prev => {
            const newAlerts = new Map(prev)
            newAlerts.set(alert.id, alert)
            return newAlerts
        })

        // Add to events history
        const event: MotionEvent = {
            ...alert,
            acknowledgedBy: undefined,
            acknowledgedAt: undefined
        }
        setEvents(prev => [event, ...prev].slice(0, 100)) // Keep last 100 events

        // Call custom handler
        onAlert?.(alert)

        // Auto-dismiss alert after cooldown period
        const timeoutId = setTimeout(() => {
            setAlerts(prev => {
                const newAlerts = new Map(prev)
                newAlerts.delete(alert.id)
                return newAlerts
            })
            alertTimeoutsRef.current.delete(alert.id)
        }, cooldownPeriod)

        alertTimeoutsRef.current.set(alert.id, timeoutId)
    }, [onAlert, cooldownPeriod])

    const handleAlertAcknowledged = useCallback((data: any) => {
        const { alertId, acknowledgedBy } = data

        setAlerts(prev => {
            const newAlerts = new Map(prev)
            newAlerts.delete(alertId)
            return newAlerts
        })

        setEvents(prev => prev.map(event =>
            event.id === alertId
                ? {
                    ...event,
                    acknowledged: true,
                    acknowledgedBy,
                    acknowledgedAt: new Date().toISOString()
                }
                : event
        ))

        // Clear timeout if exists
        const timeoutId = alertTimeoutsRef.current.get(alertId)
        if (timeoutId) {
            clearTimeout(timeoutId)
            alertTimeoutsRef.current.delete(alertId)
        }
    }, [])

    const handleConfigUpdated = useCallback((data: any) => {
        const { deviceId, config } = data
        if (deviceId === deviceId) {
            setConfig(config)
            onConfigUpdate?.(config)
        }
    }, [deviceId, onConfigUpdate])

    const handlePendingAlerts = useCallback((data: any) => {
        const { alerts: pendingAlerts } = data

        if (pendingAlerts && pendingAlerts.length > 0) {
            pendingAlerts.forEach((alert: any) => {
                handleMotionAlert(alert)
            })
        }
    }, [handleMotionAlert])

    // Actions
    const startDetection = useCallback(async (deviceId: string, config?: Partial<MotionConfig>) => {
        setIsLoading(true)
        setError(null)

        try {
            await motionService.startDetection(deviceId, config)
            subscribeToDevice(deviceId)
            toast.success('Motion detection started')
        } catch (err: any) {
            setError(err.message)
            toast.error('Failed to start motion detection')
            throw err
        } finally {
            setIsLoading(false)
        }
    }, [])

    const stopDetection = useCallback(async (deviceId: string) => {
        setIsLoading(true)
        setError(null)

        try {
            await motionService.stopDetection(deviceId)
            unsubscribeFromDevice(deviceId)

            // Clear alerts for this device
            setAlerts(prev => {
                const newAlerts = new Map(prev)
                Array.from(newAlerts.entries()).forEach(([id, alert]) => {
                    if (alert.deviceId === deviceId) {
                        newAlerts.delete(id)

                        // Clear timeout
                        const timeoutId = alertTimeoutsRef.current.get(id)
                        if (timeoutId) {
                            clearTimeout(timeoutId)
                            alertTimeoutsRef.current.delete(id)
                        }
                    }
                })
                return newAlerts
            })

            toast.success('Motion detection stopped')
        } catch (err: any) {
            setError(err.message)
            toast.error('Failed to stop motion detection')
            throw err
        } finally {
            setIsLoading(false)
        }
    }, [])

    const acknowledgeAlert = useCallback((alertId: string) => {
        const alert = alerts.get(alertId)
        if (!alert) return

        // Send acknowledgement to server
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'acknowledge-alert',
                deviceId: alert.deviceId,
                alertId
            }))
        }

        // Update local state
        setAlerts(prev => {
            const newAlerts = new Map(prev)
            newAlerts.delete(alertId)
            return newAlerts
        })

        setEvents(prev => prev.map(event =>
            event.id === alertId
                ? {
                    ...event,
                    acknowledged: true,
                    acknowledgedAt: new Date().toISOString()
                }
                : event
        ))

        // Clear timeout
        const timeoutId = alertTimeoutsRef.current.get(alertId)
        if (timeoutId) {
            clearTimeout(timeoutId)
            alertTimeoutsRef.current.delete(alertId)
        }
    }, [alerts])

    const clearAlerts = useCallback(() => {
        // Clear all timeouts
        alertTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
        alertTimeoutsRef.current.clear()

        // Clear alerts
        setAlerts(new Map())
    }, [])

    const updateConfig = useCallback(async (config: Partial<MotionConfig>) => {
        if (!deviceId) {
            throw new Error('No device ID specified')
        }

        setIsLoading(true)
        setError(null)

        try {
            await motionService.updateConfig(deviceId, config)

            // Send config update via WebSocket
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'update-motion-config',
                    deviceId,
                    config
                }))
            }

            setConfig(prev => prev ? { ...prev, ...config } : null)
            toast.success('Configuration updated')
        } catch (err: any) {
            setError(err.message)
            toast.error('Failed to update configuration')
            throw err
        } finally {
            setIsLoading(false)
        }
    }, [deviceId])

    const refreshStatistics = useCallback(async () => {
        if (!deviceId) return

        setIsLoading(true)
        setError(null)

        try {
            const stats = await motionService.getStatistics(deviceId)
            setStatistics(stats)
        } catch (err: any) {
            setError(err.message)
            console.error('Failed to fetch statistics:', err)
        } finally {
            setIsLoading(false)
        }
    }, [deviceId])

    const subscribeToDevice = useCallback((deviceId: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'subscribe-device',
                deviceId
            }))
            subscribedDevicesRef.current.add(deviceId)
        }
    }, [])

    const unsubscribeFromDevice = useCallback((deviceId: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'unsubscribe-device',
                deviceId
            }))
            subscribedDevicesRef.current.delete(deviceId)
        }
    }, [])

    // Initialize
    useEffect(() => {
        if (autoConnect) {
            connect()
        }

        return () => {
            disconnect()

            // Clear all timeouts
            alertTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
            alertTimeoutsRef.current.clear()
        }
    }, [])

    // Subscribe to device if specified
    useEffect(() => {
        if (deviceId && isConnected) {
            subscribeToDevice(deviceId)

            // Load initial config
            motionService.getConfig(deviceId)
                .then(setConfig)
                .catch(err => console.error('Failed to load config:', err))

            // Load initial statistics
            refreshStatistics()
        }

        return () => {
            if (deviceId) {
                unsubscribeFromDevice(deviceId)
            }
        }
    }, [deviceId, isConnected])

    return {
        // State
        alerts,
        events,
        config,
        statistics,
        isConnected,
        isLoading,
        error,

        // Actions
        startDetection,
        stopDetection,
        acknowledgeAlert,
        clearAlerts,
        updateConfig,
        refreshStatistics,

        // WebSocket
        connect,
        disconnect,
        subscribeToDevice,
        unsubscribeFromDevice
    }
}