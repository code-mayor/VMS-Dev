import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Switch } from './ui/switch'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { toast } from 'sonner'
import {
    AlertTriangle,
    Bell,
    BellOff,
    Camera,
    Activity,
    Settings,
    RefreshCw,
    Download,
    Filter,
    Clock,
    Volume2,
    Mail,
    Smartphone,
    Monitor,
    Zap,
    Eye,
    ChevronRight
} from 'lucide-react'

interface CameraAlertsProps {
    devices: any[]
    onRefresh?: () => void
}

export function CameraAlerts({ devices, onRefresh }: CameraAlertsProps) {
    const [alerts, setAlerts] = useState<any[]>([])
    const [alertSettings, setAlertSettings] = useState({
        motionDetection: true,
        soundDetection: false,
        objectDetection: false,
        linesCrossing: false,
        tamperDetection: true,
        networkDisconnect: true
    })
    const [notifications, setNotifications] = useState({
        email: false,
        sms: false,
        push: true,
        sound: true
    })
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [selectedDevice, setSelectedDevice] = useState<string>('all')
    const [alertFilter, setAlertFilter] = useState<string>('all')

    // Simulate real-time alert monitoring
    useEffect(() => {
        if (isMonitoring) {
            const interval = setInterval(() => {
                checkForAlerts()
            }, 5000) // Check every 5 seconds

            return () => clearInterval(interval)
        }
    }, [isMonitoring, devices])

    const checkForAlerts = async () => {
        try {
            // In real implementation, this would call the backend API
            const response = await fetch('http://localhost:3001/api/alerts/check')
            if (response.ok) {
                const data = await response.json()
                if (data.newAlerts && data.newAlerts.length > 0) {
                    setAlerts(prev => [...data.newAlerts, ...prev].slice(0, 100))
                    handleNotification(data.newAlerts[0])
                }
            }
        } catch (error) {
            console.log('Alert check in progress...')
        }
    }

    const handleNotification = (alert: any) => {
        if (notifications.sound) {
            // Play alert sound
            const audio = new Audio('/alert-sound.mp3')
            audio.play().catch(() => { })
        }

        if (notifications.push) {
            toast.error(`Alert: ${alert.type} detected on ${alert.deviceName}`, {
                duration: 5000
            })
        }
    }

    const startMonitoring = () => {
        setIsMonitoring(true)
        toast.success('Alert monitoring started')

        // Create some sample alerts for demonstration
        setTimeout(() => {
            const sampleAlerts = [
                {
                    id: Date.now(),
                    type: 'Motion Detected',
                    deviceId: devices[0]?.id,
                    deviceName: devices[0]?.name || 'Camera 1',
                    timestamp: new Date().toISOString(),
                    severity: 'medium',
                    description: 'Motion detected in main entrance area'
                }
            ]
            setAlerts(sampleAlerts)
        }, 3000)
    }

    const stopMonitoring = () => {
        setIsMonitoring(false)
        toast.info('Alert monitoring stopped')
    }

    const clearAlerts = () => {
        setAlerts([])
        toast.success('All alerts cleared')
    }

    const exportAlerts = () => {
        const dataStr = JSON.stringify(alerts, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `alerts-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        toast.success('Alerts exported')
    }

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'high': return <Badge variant="destructive">High</Badge>
            case 'medium': return <Badge variant="secondary">Medium</Badge>
            case 'low': return <Badge variant="outline">Low</Badge>
            default: return <Badge variant="outline">Info</Badge>
        }
    }

    const filteredAlerts = alerts.filter(alert => {
        if (selectedDevice !== 'all' && alert.deviceId !== selectedDevice) return false
        if (alertFilter !== 'all' && alert.type.toLowerCase() !== alertFilter) return false
        return true
    })

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="flex items-center space-x-2">
                            <AlertTriangle className="w-5 h-5" />
                            <span>Camera Alerts & Notifications</span>
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Configure and monitor camera alerts in real-time
                        </p>
                    </div>

                    <div className="flex items-center space-x-3">
                        {alerts.length > 0 && (
                            <Badge variant="destructive" className="text-lg px-3 py-1">
                                {alerts.length} Active
                            </Badge>
                        )}

                        <Button
                            variant={isMonitoring ? "destructive" : "default"}
                            onClick={isMonitoring ? stopMonitoring : startMonitoring}
                        >
                            {isMonitoring ? (
                                <>
                                    <BellOff className="w-4 h-4 mr-2" />
                                    Stop Monitoring
                                </>
                            ) : (
                                <>
                                    <Bell className="w-4 h-4 mr-2" />
                                    Start Monitoring
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto p-6">
                <Tabs defaultValue="alerts" className="h-full">
                    <TabsList className="mb-4">
                        <TabsTrigger value="alerts">Active Alerts</TabsTrigger>
                        <TabsTrigger value="settings">Alert Settings</TabsTrigger>
                        <TabsTrigger value="notifications">Notifications</TabsTrigger>
                        <TabsTrigger value="history">Alert History</TabsTrigger>
                    </TabsList>

                    {/* Active Alerts Tab */}
                    <TabsContent value="alerts" className="space-y-4">
                        {/* Filters */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Devices</SelectItem>
                                        {devices.map(device => (
                                            <SelectItem key={device.id} value={device.id}>
                                                {device.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select value={alertFilter} onValueChange={setAlertFilter}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Alert Types</SelectItem>
                                        <SelectItem value="motion">Motion</SelectItem>
                                        <SelectItem value="sound">Sound</SelectItem>
                                        <SelectItem value="tamper">Tamper</SelectItem>
                                        <SelectItem value="network">Network</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center space-x-2">
                                <Button variant="outline" size="sm" onClick={clearAlerts}>
                                    Clear All
                                </Button>
                                <Button variant="outline" size="sm" onClick={exportAlerts}>
                                    <Download className="w-4 h-4 mr-2" />
                                    Export
                                </Button>
                            </div>
                        </div>

                        {/* Alerts List */}
                        {filteredAlerts.length === 0 ? (
                            <Card>
                                <CardContent className="text-center py-12">
                                    <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                                    <h3 className="font-medium text-gray-900 mb-2">
                                        {isMonitoring ? 'No Active Alerts' : 'Monitoring Stopped'}
                                    </h3>
                                    <p className="text-gray-600 mb-4">
                                        {isMonitoring
                                            ? 'Camera alerts will appear here when events are detected.'
                                            : 'Click "Start Monitoring" to begin detecting camera events.'}
                                    </p>
                                    {!isMonitoring && (
                                        <Button onClick={startMonitoring}>
                                            <Bell className="w-4 h-4 mr-2" />
                                            Start Monitoring
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {filteredAlerts.map(alert => (
                                    <Card key={alert.id} className="hover:shadow-md transition-shadow">
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-start space-x-3">
                                                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                                        <Activity className="w-5 h-5 text-red-600" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center space-x-2 mb-1">
                                                            <h4 className="font-medium">{alert.type}</h4>
                                                            {getSeverityBadge(alert.severity)}
                                                        </div>
                                                        <p className="text-sm text-gray-600 mb-1">{alert.description}</p>
                                                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                                                            <span className="flex items-center">
                                                                <Camera className="w-3 h-3 mr-1" />
                                                                {alert.deviceName}
                                                            </span>
                                                            <span className="flex items-center">
                                                                <Clock className="w-3 h-3 mr-1" />
                                                                {new Date(alert.timestamp).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Button variant="outline" size="sm">
                                                    <Eye className="w-4 h-4 mr-2" />
                                                    View
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {/* Alert Settings Tab */}
                    <TabsContent value="settings" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Alert Detection Settings</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {Object.entries(alertSettings).map(([key, value]) => (
                                    <div key={key} className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <Zap className="w-5 h-5 text-gray-500" />
                                            <div>
                                                <p className="font-medium">
                                                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    Detect and alert on {key.toLowerCase().replace(/([A-Z])/g, ' $1')} events
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={value}
                                            onCheckedChange={(checked) =>
                                                setAlertSettings(prev => ({ ...prev, [key]: checked }))
                                            }
                                        />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Notifications Tab */}
                    <TabsContent value="notifications" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Notification Channels</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Mail className="w-5 h-5 text-gray-500" />
                                        <div>
                                            <p className="font-medium">Email Notifications</p>
                                            <p className="text-sm text-gray-600">Send alerts to configured email</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={notifications.email}
                                        onCheckedChange={(checked) =>
                                            setNotifications(prev => ({ ...prev, email: checked }))
                                        }
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Smartphone className="w-5 h-5 text-gray-500" />
                                        <div>
                                            <p className="font-medium">SMS Notifications</p>
                                            <p className="text-sm text-gray-600">Send alerts via SMS</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={notifications.sms}
                                        onCheckedChange={(checked) =>
                                            setNotifications(prev => ({ ...prev, sms: checked }))
                                        }
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Monitor className="w-5 h-5 text-gray-500" />
                                        <div>
                                            <p className="font-medium">Push Notifications</p>
                                            <p className="text-sm text-gray-600">Browser push notifications</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={notifications.push}
                                        onCheckedChange={(checked) =>
                                            setNotifications(prev => ({ ...prev, push: checked }))
                                        }
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Volume2 className="w-5 h-5 text-gray-500" />
                                        <div>
                                            <p className="font-medium">Sound Alerts</p>
                                            <p className="text-sm text-gray-600">Play sound for new alerts</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={notifications.sound}
                                        onCheckedChange={(checked) =>
                                            setNotifications(prev => ({ ...prev, sound: checked }))
                                        }
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* History Tab */}
                    <TabsContent value="history">
                        <Card>
                            <CardContent className="text-center py-12">
                                <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                                <h3 className="font-medium text-gray-900 mb-2">Alert History</h3>
                                <p className="text-gray-600 mb-4">
                                    Historical alerts will be available here once monitoring is active.
                                </p>
                                <Button variant="outline">
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Load History
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}