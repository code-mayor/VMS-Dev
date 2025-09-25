import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Progress } from '../../components/ui/progress'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'
import { Slider } from '../../components/ui/slider'
import {
    Activity,
    AlertTriangle,
    Bell,
    Camera,
    Car,
    Cat,
    CheckCircle,
    Clock,
    Filter,
    Info,
    Monitor,
    Search,
    Settings,
    Shield,
    TrendingUp,
    User,
    Users,
    X,
    Zap,
    BarChart3,
    PieChart,
    Eye
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, PieChart as RePieChart, Pie, Cell, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts'

interface MotionEvent {
    id: string
    deviceId: string
    deviceName: string
    timestamp: string
    type: string
    confidence: number
    alertLevel: 'high' | 'medium' | 'low'
    acknowledged: boolean
    acknowledgedBy?: string
    acknowledgedAt?: string
    objects?: {
        living?: {
            human?: Array<{ class: string; confidence: number }>
            animal?: Array<{ class: string; confidence: number }>
        }
        nonLiving?: {
            vehicle?: Array<{ class: string; confidence: number }>
            other?: Array<{ class: string; confidence: number }>
        }
    }
    recording?: boolean
    snapshot?: string
}

interface DeviceMotionStats {
    deviceId: string
    deviceName: string
    totalEvents: number
    highAlerts: number
    mediumAlerts: number
    lowAlerts: number
    lastEvent?: string
    status: 'active' | 'inactive' | 'offline'
    motionEnabled: boolean
}

export default function MotionDetectionDashboard() {
    const [motionEvents, setMotionEvents] = useState<MotionEvent[]>([])
    const [deviceStats, setDeviceStats] = useState<DeviceMotionStats[]>([])
    const [selectedTimeRange, setSelectedTimeRange] = useState('24h')
    const [selectedAlertLevel, setSelectedAlertLevel] = useState('all')
    const [selectedObjectType, setSelectedObjectType] = useState('all')
    const [globalMotionEnabled, setGlobalMotionEnabled] = useState(true)
    const [autoAcknowledge, setAutoAcknowledge] = useState(false)
    const [alertSound, setAlertSound] = useState(true)

    // Statistics
    const [stats, setStats] = useState({
        totalEvents: 0,
        acknowledgedEvents: 0,
        pendingEvents: 0,
        highAlerts: 0,
        mediumAlerts: 0,
        lowAlerts: 0,
        humanDetections: 0,
        animalDetections: 0,
        vehicleDetections: 0,
        activeDevices: 0,
        totalDevices: 0
    })

    // Chart data
    const [timelineData, setTimelineData] = useState<any[]>([])
    const [objectTypeData, setObjectTypeData] = useState<any[]>([])
    const [deviceActivityData, setDeviceActivityData] = useState<any[]>([])

    // WebSocket connection
    const wsRef = useRef<WebSocket | null>(null)

    useEffect(() => {
        // Initialize sample data
        initializeSampleData()

        // Connect to WebSocket for real-time updates
        connectWebSocket()

        // Start simulation
        const interval = setInterval(simulateMotionEvent, 5000)

        return () => {
            clearInterval(interval)
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [])

    const initializeSampleData = () => {
        // Initialize sample devices
        const sampleDevices: DeviceMotionStats[] = [
            {
                deviceId: 'cam-001',
                deviceName: 'Front Entrance',
                totalEvents: 145,
                highAlerts: 12,
                mediumAlerts: 43,
                lowAlerts: 90,
                lastEvent: new Date(Date.now() - 5 * 60000).toISOString(),
                status: 'active',
                motionEnabled: true
            },
            {
                deviceId: 'cam-002',
                deviceName: 'Parking Lot',
                totalEvents: 287,
                highAlerts: 8,
                mediumAlerts: 120,
                lowAlerts: 159,
                lastEvent: new Date(Date.now() - 2 * 60000).toISOString(),
                status: 'active',
                motionEnabled: true
            },
            {
                deviceId: 'cam-003',
                deviceName: 'Warehouse',
                totalEvents: 67,
                highAlerts: 23,
                mediumAlerts: 20,
                lowAlerts: 24,
                lastEvent: new Date(Date.now() - 15 * 60000).toISOString(),
                status: 'active',
                motionEnabled: true
            },
            {
                deviceId: 'cam-004',
                deviceName: 'Back Gate',
                totalEvents: 98,
                highAlerts: 5,
                mediumAlerts: 33,
                lowAlerts: 60,
                lastEvent: new Date(Date.now() - 8 * 60000).toISOString(),
                status: 'inactive',
                motionEnabled: false
            }
        ]

        setDeviceStats(sampleDevices)

        // Generate sample motion events
        const sampleEvents: MotionEvent[] = []
        const eventTypes = [
            { type: 'human', level: 'high' as const },
            { type: 'vehicle', level: 'medium' as const },
            { type: 'animal', level: 'medium' as const },
            { type: 'motion', level: 'low' as const }
        ]

        for (let i = 0; i < 50; i++) {
            const device = sampleDevices[Math.floor(Math.random() * sampleDevices.length)]
            const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)]

            const event: MotionEvent = {
                id: `event-${Date.now()}-${i}`,
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60000).toISOString(),
                type: eventType.type,
                confidence: 60 + Math.floor(Math.random() * 40),
                alertLevel: eventType.level,
                acknowledged: Math.random() > 0.3,
                recording: Math.random() > 0.5
            }

            if (eventType.type === 'human') {
                event.objects = {
                    living: { human: [{ class: 'person', confidence: 0.85 }] }
                }
            } else if (eventType.type === 'animal') {
                const animals = ['cat', 'dog', 'bird']
                event.objects = {
                    living: { animal: [{ class: animals[Math.floor(Math.random() * animals.length)], confidence: 0.75 }] }
                }
            } else if (eventType.type === 'vehicle') {
                const vehicles = ['car', 'truck', 'motorcycle']
                event.objects = {
                    nonLiving: { vehicle: [{ class: vehicles[Math.floor(Math.random() * vehicles.length)], confidence: 0.9 }] }
                }
            }

            sampleEvents.push(event)
        }

        setMotionEvents(sampleEvents)
        updateStatistics(sampleEvents, sampleDevices)
        generateChartData(sampleEvents)
    }

    const connectWebSocket = () => {
        // Simulate WebSocket connection
        // In production, connect to actual WebSocket server
        console.log('Connecting to motion detection WebSocket...')
    }

    const simulateMotionEvent = () => {
        if (!globalMotionEnabled) return

        const devices = deviceStats.filter(d => d.motionEnabled)
        if (devices.length === 0) return

        const device = devices[Math.floor(Math.random() * devices.length)]
        const eventTypes = ['human', 'vehicle', 'animal', 'motion']
        const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)]

        const newEvent: MotionEvent = {
            id: `event-${Date.now()}`,
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            timestamp: new Date().toISOString(),
            type: eventType,
            confidence: 60 + Math.floor(Math.random() * 40),
            alertLevel: eventType === 'human' ? 'high' : eventType === 'motion' ? 'low' : 'medium',
            acknowledged: autoAcknowledge,
            recording: Math.random() > 0.5
        }

        setMotionEvents(prev => [newEvent, ...prev].slice(0, 100))

        // Update device stats
        setDeviceStats(prev => prev.map(d =>
            d.deviceId === device.deviceId
                ? {
                    ...d,
                    totalEvents: d.totalEvents + 1,
                    lastEvent: newEvent.timestamp,
                    status: 'active' as const
                }
                : d
        ))

        // Play alert sound if enabled
        if (alertSound && newEvent.alertLevel === 'high') {
            // Play sound effect
        }
    }

    const updateStatistics = (events: MotionEvent[], devices: DeviceMotionStats[]) => {
        const stats = {
            totalEvents: events.length,
            acknowledgedEvents: events.filter(e => e.acknowledged).length,
            pendingEvents: events.filter(e => !e.acknowledged).length,
            highAlerts: events.filter(e => e.alertLevel === 'high').length,
            mediumAlerts: events.filter(e => e.alertLevel === 'medium').length,
            lowAlerts: events.filter(e => e.alertLevel === 'low').length,
            humanDetections: events.filter(e => e.objects?.living?.human).length,
            animalDetections: events.filter(e => e.objects?.living?.animal).length,
            vehicleDetections: events.filter(e => e.objects?.nonLiving?.vehicle).length,
            activeDevices: devices.filter(d => d.status === 'active').length,
            totalDevices: devices.length
        }

        setStats(stats)
    }

    const generateChartData = (events: MotionEvent[]) => {
        // Timeline data (last 24 hours)
        const hourlyData = []
        for (let i = 23; i >= 0; i--) {
            const hour = new Date(Date.now() - i * 60 * 60000)
            const hourEvents = events.filter(e => {
                const eventHour = new Date(e.timestamp).getHours()
                return eventHour === hour.getHours()
            })

            hourlyData.push({
                hour: hour.getHours() + ':00',
                events: hourEvents.length,
                high: hourEvents.filter(e => e.alertLevel === 'high').length,
                medium: hourEvents.filter(e => e.alertLevel === 'medium').length,
                low: hourEvents.filter(e => e.alertLevel === 'low').length
            })
        }
        setTimelineData(hourlyData)

        // Object type distribution
        const objectTypes = [
            { name: 'Human', value: events.filter(e => e.objects?.living?.human).length, color: '#ef4444' },
            { name: 'Vehicle', value: events.filter(e => e.objects?.nonLiving?.vehicle).length, color: '#f59e0b' },
            { name: 'Animal', value: events.filter(e => e.objects?.living?.animal).length, color: '#10b981' },
            { name: 'Other', value: events.filter(e => !e.objects || (!e.objects.living?.human && !e.objects.living?.animal && !e.objects.nonLiving?.vehicle)).length, color: '#6b7280' }
        ]
        setObjectTypeData(objectTypes)

        // Device activity
        const deviceData = deviceStats.map(device => ({
            name: device.deviceName,
            events: device.totalEvents,
            high: device.highAlerts,
            medium: device.mediumAlerts,
            low: device.lowAlerts
        }))
        setDeviceActivityData(deviceData)
    }

    const acknowledgeEvent = (eventId: string) => {
        setMotionEvents(prev => prev.map(event =>
            event.id === eventId
                ? { ...event, acknowledged: true, acknowledgedAt: new Date().toISOString() }
                : event
        ))
    }

    const acknowledgeAll = () => {
        setMotionEvents(prev => prev.map(event => ({
            ...event,
            acknowledged: true,
            acknowledgedAt: new Date().toISOString()
        })))
    }

    const getFilteredEvents = () => {
        let filtered = motionEvents

        // Filter by alert level
        if (selectedAlertLevel !== 'all') {
            filtered = filtered.filter(e => e.alertLevel === selectedAlertLevel)
        }

        // Filter by object type
        if (selectedObjectType !== 'all') {
            filtered = filtered.filter(e => {
                switch (selectedObjectType) {
                    case 'human': return e.objects?.living?.human
                    case 'animal': return e.objects?.living?.animal
                    case 'vehicle': return e.objects?.nonLiving?.vehicle
                    default: return true
                }
            })
        }

        // Filter by time range
        const now = Date.now()
        const ranges = {
            '1h': 60 * 60000,
            '6h': 6 * 60 * 60000,
            '24h': 24 * 60 * 60000,
            '7d': 7 * 24 * 60 * 60000
        }

        if (selectedTimeRange !== 'all') {
            const range = ranges[selectedTimeRange] || 24 * 60 * 60000
            filtered = filtered.filter(e =>
                now - new Date(e.timestamp).getTime() <= range
            )
        }

        return filtered
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center">
                        <Activity className="w-6 h-6 mr-2" />
                        Motion Detection Dashboard
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Real-time monitoring across {stats.totalDevices} cameras
                    </p>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={globalMotionEnabled}
                            onCheckedChange={setGlobalMotionEnabled}
                        />
                        <span>Global Motion</span>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Bell className={alertSound ? "w-4 h-4" : "w-4 h-4 opacity-50"} />
                        <Switch
                            checked={alertSound}
                            onCheckedChange={setAlertSound}
                        />
                    </div>

                    <Button variant="outline" onClick={acknowledgeAll}>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Acknowledge All
                    </Button>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Total Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalEvents}</div>
                        <Progress value={(stats.acknowledgedEvents / stats.totalEvents) * 100} className="mt-2" />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Pending Alerts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{stats.pendingEvents}</div>
                        <div className="text-xs text-gray-500 mt-1">Requires attention</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">High Priority</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats.highAlerts}</div>
                        <div className="text-xs text-gray-500 mt-1">Human detected</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Active Cameras</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {stats.activeDevices}/{stats.totalDevices}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Motion enabled</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Detection Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {Math.round((stats.humanDetections + stats.vehicleDetections + stats.animalDetections) / stats.totalEvents * 100)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Object identified</div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content */}
            <Tabs defaultValue="events" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="events">Recent Events</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                    <TabsTrigger value="devices">Device Status</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="events" className="space-y-4">
                    {/* Filters */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center">
                                <Filter className="w-4 h-4 mr-2" />
                                Filters
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex space-x-4">
                                <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                                    <SelectTrigger className="w-40">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1h">Last Hour</SelectItem>
                                        <SelectItem value="6h">Last 6 Hours</SelectItem>
                                        <SelectItem value="24h">Last 24 Hours</SelectItem>
                                        <SelectItem value="7d">Last 7 Days</SelectItem>
                                        <SelectItem value="all">All Time</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select value={selectedAlertLevel} onValueChange={setSelectedAlertLevel}>
                                    <SelectTrigger className="w-40">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Levels</SelectItem>
                                        <SelectItem value="high">High Priority</SelectItem>
                                        <SelectItem value="medium">Medium Priority</SelectItem>
                                        <SelectItem value="low">Low Priority</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select value={selectedObjectType} onValueChange={setSelectedObjectType}>
                                    <SelectTrigger className="w-40">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Objects</SelectItem>
                                        <SelectItem value="human">Human</SelectItem>
                                        <SelectItem value="vehicle">Vehicle</SelectItem>
                                        <SelectItem value="animal">Animal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Events List */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Motion Events</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-96">
                                <div className="space-y-2">
                                    {getFilteredEvents().slice(0, 50).map(event => (
                                        <div key={event.id} className={`p-3 border rounded-lg ${event.acknowledged ? 'bg-gray-50' : 'bg-white'}`}>
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-2 mb-1">
                                                        <Badge className={
                                                            event.alertLevel === 'high' ? 'bg-red-100 text-red-700' :
                                                                event.alertLevel === 'medium' ? 'bg-orange-100 text-orange-700' :
                                                                    'bg-yellow-100 text-yellow-700'
                                                        }>
                                                            {event.alertLevel}
                                                        </Badge>
                                                        <span className="font-medium text-sm">{event.deviceName}</span>
                                                        {event.recording && (
                                                            <Badge variant="outline" className="text-xs">
                                                                Recording
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="text-sm text-gray-600">
                                                        {event.objects?.living?.human && <span className="mr-2">👤 Person detected</span>}
                                                        {event.objects?.living?.animal && <span className="mr-2">🐾 Animal detected</span>}
                                                        {event.objects?.nonLiving?.vehicle && <span className="mr-2">🚗 Vehicle detected</span>}
                                                        {!event.objects && <span>General motion</span>}
                                                    </div>

                                                    <div className="text-xs text-gray-400 mt-1">
                                                        {new Date(event.timestamp).toLocaleString()} • Confidence: {event.confidence}%
                                                    </div>
                                                </div>

                                                {!event.acknowledged && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => acknowledgeEvent(event.id)}
                                                    >
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Ack
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analytics" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Timeline Chart */}
                        <Card>
                            <CardHeader>
                                <CardTitle>24-Hour Timeline</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={timelineData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="hour" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="events" stroke="#3b82f6" strokeWidth={2} />
                                        <Line type="monotone" dataKey="high" stroke="#ef4444" strokeWidth={1} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        {/* Object Type Distribution */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Detection Types</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <RePieChart>
                                        <Pie
                                            data={objectTypeData}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={100}
                                            label
                                        >
                                            {objectTypeData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </RePieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        {/* Device Activity */}
                        <Card className="col-span-2">
                            <CardHeader>
                                <CardTitle>Device Activity</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={deviceActivityData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="high" stackId="a" fill="#ef4444" />
                                        <Bar dataKey="medium" stackId="a" fill="#f59e0b" />
                                        <Bar dataKey="low" stackId="a" fill="#eab308" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="devices" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Camera Motion Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {deviceStats.map(device => (
                                    <div key={device.deviceId} className="p-4 border rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                                <Camera className="w-5 h-5 text-gray-600" />
                                                <div>
                                                    <div className="font-medium">{device.deviceName}</div>
                                                    <div className="text-sm text-gray-500">
                                                        {device.totalEvents} events • Last: {
                                                            device.lastEvent
                                                                ? new Date(device.lastEvent).toLocaleTimeString()
                                                                : 'Never'
                                                        }
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-3">
                                                <Badge variant={device.status === 'active' ? 'default' : 'secondary'}>
                                                    {device.status}
                                                </Badge>
                                                <Switch
                                                    checked={device.motionEnabled}
                                                    onCheckedChange={(checked) => {
                                                        setDeviceStats(prev => prev.map(d =>
                                                            d.deviceId === device.deviceId
                                                                ? { ...d, motionEnabled: checked }
                                                                : d
                                                        ))
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Global Motion Detection Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label>Auto-acknowledge low priority alerts</label>
                                <Switch
                                    checked={autoAcknowledge}
                                    onCheckedChange={setAutoAcknowledge}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <label>Enable alert sounds</label>
                                <Switch
                                    checked={alertSound}
                                    onCheckedChange={setAlertSound}
                                />
                            </div>

                            <div className="space-y-2">
                                <label>Default Sensitivity</label>
                                <Slider defaultValue={[75]} min={0} max={100} step={5} />
                            </div>

                            <div className="space-y-2">
                                <label>Alert Cooldown Period (seconds)</label>
                                <Slider defaultValue={[5]} min={1} max={60} step={1} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}