import { MotionConfig, MotionEvent, MotionStatistics, MotionAlert } from '../types/motion-types'

class MotionService {
    private baseUrl: string
    private token: string | null

    constructor() {
        this.baseUrl = 'http://localhost:3001/api/motion'
        this.token = localStorage.getItem('vms_token')
    }

    private getHeaders(): HeadersInit {
        return {
            'Content-Type': 'application/json',
            ...(this.token && { 'Authorization': `Bearer ${this.token}` })
        }
    }

    private async handleResponse<T>(response: Response): Promise<T> {
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(error.error || `Request failed: ${response.status}`)
        }
        return response.json()
    }

    // Device motion detection management
    async startDetection(deviceId: string, config?: Partial<MotionConfig>): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${deviceId}/start`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ config })
        })

        await this.handleResponse(response)
    }

    async stopDetection(deviceId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${deviceId}/stop`, {
            method: 'POST',
            headers: this.getHeaders()
        })

        await this.handleResponse(response)
    }

    async getConfig(deviceId: string): Promise<MotionConfig> {
        const response = await fetch(`${this.baseUrl}/${deviceId}/config`, {
            headers: this.getHeaders()
        })

        const data = await this.handleResponse<{ config: MotionConfig }>(response)
        return data.config
    }

    async updateConfig(deviceId: string, config: Partial<MotionConfig>): Promise<void> {
        const response = await fetch(`${this.baseUrl}/${deviceId}/config`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(config)
        })

        await this.handleResponse(response)
    }

    // Motion events
    async getEvents(params?: {
        deviceId?: string
        limit?: number
        offset?: number
        startDate?: string
        endDate?: string
        alertLevel?: 'high' | 'medium' | 'low'
        acknowledged?: boolean
    }): Promise<{ events: MotionEvent[], total: number }> {
        const queryParams = new URLSearchParams()

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    queryParams.append(key, String(value))
                }
            })
        }

        const url = params?.deviceId
            ? `${this.baseUrl}/events/device/${params.deviceId}?${queryParams}`
            : `${this.baseUrl}/events?${queryParams}`

        const response = await fetch(url, {
            headers: this.getHeaders()
        })

        const data = await this.handleResponse<{ motion_events: any[], total: number }>(response)

        return {
            events: data.motion_events.map(this.mapEventFromApi),
            total: data.total
        }
    }

    async getEvent(eventId: string): Promise<MotionEvent> {
        const response = await fetch(`${this.baseUrl}/events/${eventId}`, {
            headers: this.getHeaders()
        })

        const data = await this.handleResponse<{ motion_event: any }>(response)
        return this.mapEventFromApi(data.motion_event)
    }

    async acknowledgeEvent(eventId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/events/${eventId}/acknowledge`, {
            method: 'POST',
            headers: this.getHeaders()
        })

        await this.handleResponse(response)
    }

    async deleteEvent(eventId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/events/${eventId}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        })

        await this.handleResponse(response)
    }

    // Statistics
    async getStatistics(deviceId?: string, params?: {
        startDate?: string
        endDate?: string
    }): Promise<MotionStatistics> {
        const queryParams = new URLSearchParams()

        if (deviceId) {
            queryParams.append('device_id', deviceId)
        }

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value) {
                    queryParams.append(key === 'startDate' ? 'start_date' : 'end_date', value)
                }
            })
        }

        const response = await fetch(`${this.baseUrl}/stats?${queryParams}`, {
            headers: this.getHeaders()
        })

        const data = await this.handleResponse<{ statistics: any }>(response)
        return this.mapStatisticsFromApi(data.statistics)
    }

    async getGlobalStatistics(): Promise<{
        motionDetection: any[]
        websocket: {
            activeConnections: number
            subscribedDevices: number
            pendingAlerts: number
            totalAlerts: number
        }
    }> {
        const response = await fetch(`${this.baseUrl}/stats/all`, {
            headers: this.getHeaders()
        })

        return this.handleResponse(response)
    }

    // Batch operations
    async startBatchDetection(deviceIds: string[], config?: Partial<MotionConfig>): Promise<void> {
        const response = await fetch(`${this.baseUrl}/batch/start`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ deviceIds, config })
        })

        await this.handleResponse(response)
    }

    async stopBatchDetection(deviceIds: string[]): Promise<void> {
        const response = await fetch(`${this.baseUrl}/batch/stop`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ deviceIds })
        })

        await this.handleResponse(response)
    }

    // Helper methods
    private mapEventFromApi(apiEvent: any): MotionEvent {
        return {
            id: apiEvent.id,
            deviceId: apiEvent.device_id,
            deviceName: apiEvent.device_name,
            timestamp: apiEvent.created_at || apiEvent.detected_at,
            type: apiEvent.event_type || 'motion',
            confidence: apiEvent.confidence || 0,
            alertLevel: this.determineAlertLevel(apiEvent),
            summary: this.generateSummary(apiEvent),
            acknowledged: Boolean(apiEvent.acknowledged),
            acknowledgedBy: apiEvent.acknowledged_by || apiEvent.acknowledged_by_name,
            acknowledgedAt: apiEvent.acknowledged_at,
            objects: this.parseObjects(apiEvent.bounding_box || apiEvent.object_classification),
            recording: apiEvent.recording_id || apiEvent.video_path,
            snapshot: apiEvent.thumbnail_path
        }
    }

    private mapStatisticsFromApi(apiStats: any): MotionStatistics {
        return {
            totalEvents: apiStats.total_events || 0,
            acknowledgedEvents: apiStats.acknowledged_events || 0,
            unacknowledgedEvents: apiStats.unacknowledged_events || 0,
            averageConfidence: apiStats.avg_confidence || 0,
            eventsByLevel: {
                high: apiStats.high_alerts || 0,
                medium: apiStats.medium_alerts || 0,
                low: apiStats.low_alerts || 0
            },
            eventsByType: {
                human: apiStats.human_detections || 0,
                animal: apiStats.animal_detections || 0,
                vehicle: apiStats.vehicle_detections || 0,
                unknown: apiStats.unknown_detections || 0
            },
            timeRange: {
                start: apiStats.filters?.start_date,
                end: apiStats.filters?.end_date
            }
        }
    }

    private determineAlertLevel(event: any): 'high' | 'medium' | 'low' {
        // Check if we have object classification data
        if (event.object_classification || event.alert_level) {
            return event.alert_level || 'low'
        }

        // Determine based on confidence
        if (event.confidence >= 80) return 'high'
        if (event.confidence >= 60) return 'medium'
        return 'low'
    }

    private generateSummary(event: any): string {
        if (event.summary) return event.summary

        const objects = this.parseObjects(event.bounding_box || event.object_classification)
        if (!objects) return 'Motion detected'

        const summaryParts: string[] = []

        if (objects.living?.human?.length) {
            summaryParts.push(`${objects.living.human.length} person(s)`)
        }
        if (objects.living?.animal?.length) {
            const animals = objects.living.animal.map(a => a.class).join(', ')
            summaryParts.push(`animal(s): ${animals}`)
        }
        if (objects.nonLiving?.vehicle?.length) {
            summaryParts.push(`${objects.nonLiving.vehicle.length} vehicle(s)`)
        }

        return summaryParts.length > 0
            ? `Detected: ${summaryParts.join(', ')}`
            : 'Motion detected'
    }

    private parseObjects(data: any): MotionEvent['objects'] | undefined {
        if (!data) return undefined

        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data
            return parsed
        } catch (error) {
            console.error('Failed to parse object data:', error)
            return undefined
        }
    }

    // Real-time alert formatting
    formatAlert(alert: MotionAlert): string {
        const time = new Date(alert.timestamp).toLocaleTimeString()
        const level = alert.alertLevel.toUpperCase()
        const device = alert.deviceName || `Device ${alert.deviceId}`

        return `[${time}] ${level}: ${alert.summary} at ${device} (${alert.confidence}% confidence)`
    }

    // Export/Import functions
    async exportEvents(deviceId?: string, format: 'json' | 'csv' = 'json'): Promise<Blob> {
        const { events } = await this.getEvents({ deviceId, limit: 10000 })

        if (format === 'json') {
            const json = JSON.stringify(events, null, 2)
            return new Blob([json], { type: 'application/json' })
        } else {
            const csv = this.eventsToCSV(events)
            return new Blob([csv], { type: 'text/csv' })
        }
    }

    private eventsToCSV(events: MotionEvent[]): string {
        const headers = [
            'ID', 'Device ID', 'Device Name', 'Timestamp', 'Type',
            'Confidence', 'Alert Level', 'Summary', 'Acknowledged',
            'Acknowledged By', 'Acknowledged At'
        ]

        const rows = events.map(event => [
            event.id,
            event.deviceId,
            event.deviceName,
            event.timestamp,
            event.type,
            event.confidence,
            event.alertLevel,
            event.summary,
            event.acknowledged ? 'Yes' : 'No',
            event.acknowledgedBy || '',
            event.acknowledgedAt || ''
        ])

        return [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n')
    }
}

// Create singleton instance
export const motionService = new MotionService()