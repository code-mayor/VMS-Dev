// Motion Alert Types
export interface MotionAlert {
    id: string
    deviceId: string
    deviceName?: string
    timestamp: string
    type: 'motion' | 'object' | 'line-crossing' | 'intrusion' | 'loitering'
    confidence: number
    alertLevel: 'high' | 'medium' | 'low'
    summary: string
    acknowledged: boolean
    objects?: DetectedObjects
    recording?: boolean | string
    snapshot?: string
    zone?: string
    metadata?: Record<string, any>
}

// Motion Event (stored in database)
export interface MotionEvent extends MotionAlert {
    acknowledgedBy?: string
    acknowledgedAt?: string
    duration?: number
    videoPath?: string
    thumbnailPath?: string
    boundingBox?: BoundingBox
}

// Detected Objects Structure
export interface DetectedObjects {
    living?: {
        human?: DetectedObject[]
        animal?: DetectedObject[]
    }
    nonLiving?: {
        vehicle?: DetectedObject[]
        furniture?: DetectedObject[]
        electronics?: DetectedObject[]
        other?: DetectedObject[]
    }
}

export interface DetectedObject {
    class: string
    confidence: number
    bbox?: number[]
    trackingId?: string
    attributes?: Record<string, any>
}

// Bounding Box
export interface BoundingBox {
    x: number
    y: number
    width: number
    height: number
    confidence?: number
}

// Motion Configuration
export interface MotionConfig {
    // Basic settings
    enabled: boolean
    sensitivity: number // 0-100
    minConfidence: number // 0-100
    cooldownPeriod: number // milliseconds
    detectionInterval?: number // milliseconds

    // Object detection
    enableObjectDetection: boolean
    enableHumanDetection: boolean
    enableAnimalDetection: boolean
    enableVehicleDetection: boolean

    // Detection settings
    detectionMode?: 'motion' | 'object' | 'both'
    minObjectSize?: number // percentage of frame
    maxObjectSize?: number // percentage of frame

    // Alert settings
    alertSound: boolean
    alertNotifications: boolean
    emailAlerts?: boolean
    webhookUrl?: string

    // Recording settings
    autoRecord?: boolean
    autoSnapshot?: boolean
    recordingBuffer?: number // seconds before/after event
    recordingDuration?: number // max recording duration in seconds

    // Advanced settings
    zones?: MotionZone[]
    schedules?: DetectionSchedule[]
    excludeAreas?: ExcludeArea[]

    // Processing settings
    frameSkip?: number // process every Nth frame
    processingMode?: 'cpu' | 'gpu' | 'auto'
    maxConcurrentDetections?: number
}

// Motion Detection Zone
export interface MotionZone {
    id: string
    name: string
    enabled: boolean
    coordinates: Point[]
    sensitivity: number
    minObjectSize: number
    alertLevel?: 'high' | 'medium' | 'low'
    detectionTypes?: string[]
}

// Exclude Area
export interface ExcludeArea {
    id: string
    name: string
    coordinates: Point[]
    enabled: boolean
}

// Point for zone coordinates
export interface Point {
    x: number
    y: number
}

// Detection Schedule
export interface DetectionSchedule {
    id: string
    name: string
    enabled: boolean
    days: string[] // ['mon', 'tue', 'wed', etc.]
    startTime: string // HH:MM format
    endTime: string // HH:MM format
    config?: Partial<MotionConfig>
}

// Motion Statistics
export interface MotionStatistics {
    totalEvents: number
    acknowledgedEvents: number
    unacknowledgedEvents: number
    averageConfidence: number
    eventsByLevel: {
        high: number
        medium: number
        low: number
    }
    eventsByType: {
        human: number
        animal: number
        vehicle: number
        unknown: number
    }
    timeRange?: {
        start?: string
        end?: string
    }
    peakHours?: Array<{
        hour: number
        count: number
    }>
    deviceStatistics?: Array<{
        deviceId: string
        deviceName: string
        eventCount: number
        lastEvent?: string
    }>
}

// Motion Detection Status
export interface MotionDetectionStatus {
    deviceId: string
    enabled: boolean
    running: boolean
    lastDetection?: string
    detectionCount: number
    errorCount: number
    config: MotionConfig
}

// Motion Service Response Types
export interface MotionServiceResponse<T = any> {
    success: boolean
    data?: T
    error?: string
    message?: string
}

// WebSocket Message Types
export interface MotionWebSocketMessage {
    type: 'motion-alert' | 'config-updated' | 'status-changed' | 'error'
    deviceId?: string
    payload: any
    timestamp: string
}

// Motion Detection Capabilities
export interface MotionCapabilities {
    objectDetection: boolean
    zoneDetection: boolean
    linesCrossing: boolean
    loiteringDetection: boolean
    faceDetection: boolean
    licensePlateRecognition: boolean
    customModels: boolean
    maxZones: number
    maxConcurrentStreams: number
    supportedFormats: string[]
}

// Alert Priority Configuration
export interface AlertPriority {
    level: 'high' | 'medium' | 'low'
    conditions: AlertCondition[]
    actions: AlertAction[]
    cooldown?: number
}

export interface AlertCondition {
    type: 'object' | 'zone' | 'time' | 'confidence'
    operator: 'equals' | 'contains' | 'greater' | 'less' | 'between'
    value: any
}

export interface AlertAction {
    type: 'record' | 'snapshot' | 'email' | 'webhook' | 'sound' | 'notification'
    config?: Record<string, any>
}

// Export formats
export type ExportFormat = 'json' | 'csv' | 'pdf' | 'excel'

// Filter options for queries
export interface MotionEventFilter {
    deviceId?: string
    startDate?: string
    endDate?: string
    alertLevel?: 'high' | 'medium' | 'low'
    acknowledged?: boolean
    objectType?: string
    zone?: string
    limit?: number
    offset?: number
    sortBy?: 'timestamp' | 'confidence' | 'alertLevel'
    sortOrder?: 'asc' | 'desc'
}

// Batch operation types
export interface BatchMotionOperation {
    operation: 'start' | 'stop' | 'configure' | 'acknowledge'
    deviceIds: string[]
    config?: Partial<MotionConfig>
    filters?: MotionEventFilter
}