import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Switch } from '../ui/switch'
import { Slider } from '../ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Separator } from '../ui/separator'
import { Alert, AlertDescription } from '../ui/alert'
import {
    Activity,
    User,
    Cat,
    Car,
    Settings,
    Bell,
    Volume2,
    Save,
    RotateCcw,
    Info,
    Shield,
    Zap,
    Clock,
    Filter,
    Eye,
    EyeOff,
    Camera,
    AlertTriangle,
    X
} from 'lucide-react'
import { MotionConfig, MotionZone, DetectionSchedule } from '../../types/motion-types'
import { toast } from 'sonner'

interface MotionConfigPanelProps {
    deviceId: string
    deviceName: string
    config: MotionConfig
    onConfigUpdate: (config: Partial<MotionConfig>) => void
    onSave?: () => Promise<void>
    onReset?: () => void
    showAdvanced?: boolean
    className?: string
}

export function MotionConfigPanel({
    deviceId,
    deviceName,
    config,
    onConfigUpdate,
    onSave,
    onReset,
    showAdvanced = true,
    className
}: MotionConfigPanelProps) {
    const [localConfig, setLocalConfig] = useState<MotionConfig>(config)
    const [hasChanges, setHasChanges] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('general')

    // Motion zones for advanced configuration
    const [zones, setZones] = useState<MotionZone[]>(config.zones || [])
    const [selectedZone, setSelectedZone] = useState<string | null>(null)

    // Schedule configuration
    const [schedules, setSchedules] = useState<DetectionSchedule[]>(config.schedules || [])

    useEffect(() => {
        setLocalConfig(config)
        setZones(config.zones || [])
        setSchedules(config.schedules || [])
    }, [config])

    useEffect(() => {
        const hasConfigChanges = JSON.stringify(localConfig) !== JSON.stringify(config)
        setHasChanges(hasConfigChanges)
    }, [localConfig, config])

    const handleConfigChange = (key: keyof MotionConfig, value: any) => {
        const updatedConfig = { ...localConfig, [key]: value }
        setLocalConfig(updatedConfig)
        onConfigUpdate({ [key]: value })
    }

    const handleSave = async () => {
        if (!onSave) return

        setIsSaving(true)
        try {
            await onSave()
            setHasChanges(false)
            toast.success('Motion detection settings saved')
        } catch (error) {
            toast.error('Failed to save settings')
            console.error('Failed to save motion config:', error)
        } finally {
            setIsSaving(false)
        }
    }

    const handleReset = () => {
        if (onReset) {
            onReset()
            setLocalConfig(config)
            setHasChanges(false)
            toast.info('Settings reset to defaults')
        }
    }

    const addZone = () => {
        const newZone: MotionZone = {
            id: `zone-${Date.now()}`,
            name: `Zone ${zones.length + 1}`,
            enabled: true,
            coordinates: [],
            sensitivity: 75,
            minObjectSize: 10
        }
        const updatedZones = [...zones, newZone]
        setZones(updatedZones)
        handleConfigChange('zones', updatedZones)
    }

    const updateZone = (zoneId: string, updates: Partial<MotionZone>) => {
        const updatedZones = zones.map(zone =>
            zone.id === zoneId ? { ...zone, ...updates } : zone
        )
        setZones(updatedZones)
        handleConfigChange('zones', updatedZones)
    }

    const deleteZone = (zoneId: string) => {
        const updatedZones = zones.filter(zone => zone.id !== zoneId)
        setZones(updatedZones)
        handleConfigChange('zones', updatedZones)
    }

    const addSchedule = () => {
        const newSchedule: DetectionSchedule = {
            id: `schedule-${Date.now()}`,
            name: `Schedule ${schedules.length + 1}`,
            enabled: true,
            days: ['mon', 'tue', 'wed', 'thu', 'fri'],
            startTime: '09:00',
            endTime: '18:00',
            config: {
                sensitivity: 80,
                enableObjectDetection: true
            }
        }
        const updatedSchedules = [...schedules, newSchedule]
        setSchedules(updatedSchedules)
        handleConfigChange('schedules', updatedSchedules)
    }

    const updateSchedule = (scheduleId: string, updates: Partial<DetectionSchedule>) => {
        const updatedSchedules = schedules.map(schedule =>
            schedule.id === scheduleId ? { ...schedule, ...updates } : schedule
        )
        setSchedules(updatedSchedules)
        handleConfigChange('schedules', updatedSchedules)
    }

    const deleteSchedule = (scheduleId: string) => {
        const updatedSchedules = schedules.filter(schedule => schedule.id !== scheduleId)
        setSchedules(updatedSchedules)
        handleConfigChange('schedules', updatedSchedules)
    }

    return (
        <div className={className}>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center space-x-2">
                                <Activity className="w-5 h-5" />
                                <span>Motion Detection Configuration</span>
                            </CardTitle>
                            <CardDescription>{deviceName} - {deviceId}</CardDescription>
                        </div>

                        <div className="flex items-center space-x-2">
                            {hasChanges && (
                                <Badge variant="secondary">Unsaved Changes</Badge>
                            )}
                            <Badge variant={localConfig.enabled ? 'default' : 'secondary'}>
                                {localConfig.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                        </div>
                    </div>
                </CardHeader>

                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid grid-cols-5 w-full">
                            <TabsTrigger value="general">General</TabsTrigger>
                            <TabsTrigger value="detection">Detection</TabsTrigger>
                            <TabsTrigger value="alerts">Alerts</TabsTrigger>
                            {showAdvanced && (
                                <>
                                    <TabsTrigger value="zones">Zones</TabsTrigger>
                                    <TabsTrigger value="schedule">Schedule</TabsTrigger>
                                </>
                            )}
                        </TabsList>

                        <TabsContent value="general" className="space-y-6 mt-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="motion-enabled">Enable Motion Detection</Label>
                                        <p className="text-sm text-gray-500">
                                            Activate motion detection for this camera
                                        </p>
                                    </div>
                                    <Switch
                                        id="motion-enabled"
                                        checked={localConfig.enabled}
                                        onCheckedChange={(checked) => handleConfigChange('enabled', checked)}
                                    />
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    <Label htmlFor="sensitivity">
                                        Detection Sensitivity: {localConfig.sensitivity}%
                                    </Label>
                                    <Slider
                                        id="sensitivity"
                                        value={[localConfig.sensitivity]}
                                        onValueChange={([value]) => handleConfigChange('sensitivity', value)}
                                        min={0}
                                        max={100}
                                        step={5}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500">
                                        Higher values detect smaller movements
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="confidence">
                                        Minimum Confidence: {localConfig.minConfidence}%
                                    </Label>
                                    <Slider
                                        id="confidence"
                                        value={[localConfig.minConfidence]}
                                        onValueChange={([value]) => handleConfigChange('minConfidence', value)}
                                        min={0}
                                        max={100}
                                        step={5}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500">
                                        Minimum confidence level to trigger alerts
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="cooldown">
                                        Cooldown Period: {localConfig.cooldownPeriod / 1000}s
                                    </Label>
                                    <Slider
                                        id="cooldown"
                                        value={[localConfig.cooldownPeriod / 1000]}
                                        onValueChange={([value]) => handleConfigChange('cooldownPeriod', value * 1000)}
                                        min={1}
                                        max={60}
                                        step={1}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500">
                                        Time between consecutive alerts
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="detection-interval">Detection Interval (ms)</Label>
                                        <Input
                                            id="detection-interval"
                                            type="number"
                                            value={localConfig.detectionInterval || 500}
                                            onChange={(e) => handleConfigChange('detectionInterval', parseInt(e.target.value))}
                                            min={100}
                                            max={5000}
                                            step={100}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="recording-buffer">Recording Buffer (s)</Label>
                                        <Input
                                            id="recording-buffer"
                                            type="number"
                                            value={localConfig.recordingBuffer || 5}
                                            onChange={(e) => handleConfigChange('recordingBuffer', parseInt(e.target.value))}
                                            min={0}
                                            max={30}
                                        />
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="detection" className="space-y-6 mt-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="object-detection">Enable Object Detection</Label>
                                        <p className="text-sm text-gray-500">
                                            Use AI to identify objects in motion
                                        </p>
                                    </div>
                                    <Switch
                                        id="object-detection"
                                        checked={localConfig.enableObjectDetection}
                                        onCheckedChange={(checked) => handleConfigChange('enableObjectDetection', checked)}
                                    />
                                </div>

                                {localConfig.enableObjectDetection && (
                                    <>
                                        <Separator />

                                        <div className="space-y-4">
                                            <h4 className="text-sm font-medium">Object Types</h4>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-2">
                                                    <User className="w-4 h-4" />
                                                    <Label htmlFor="detect-human">Detect Humans</Label>
                                                </div>
                                                <Switch
                                                    id="detect-human"
                                                    checked={localConfig.enableHumanDetection}
                                                    onCheckedChange={(checked) => handleConfigChange('enableHumanDetection', checked)}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-2">
                                                    <Cat className="w-4 h-4" />
                                                    <Label htmlFor="detect-animal">Detect Animals</Label>
                                                </div>
                                                <Switch
                                                    id="detect-animal"
                                                    checked={localConfig.enableAnimalDetection}
                                                    onCheckedChange={(checked) => handleConfigChange('enableAnimalDetection', checked)}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-2">
                                                    <Car className="w-4 h-4" />
                                                    <Label htmlFor="detect-vehicle">Detect Vehicles</Label>
                                                </div>
                                                <Switch
                                                    id="detect-vehicle"
                                                    checked={localConfig.enableVehicleDetection}
                                                    onCheckedChange={(checked) => handleConfigChange('enableVehicleDetection', checked)}
                                                />
                                            </div>
                                        </div>

                                        <Separator />

                                        <div className="space-y-2">
                                            <Label>Detection Mode</Label>
                                            <Select
                                                value={localConfig.detectionMode || 'motion'}
                                                onValueChange={(value) => handleConfigChange('detectionMode', value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="motion">Motion Only</SelectItem>
                                                    <SelectItem value="object">Object Only</SelectItem>
                                                    <SelectItem value="both">Motion + Object</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="min-object-size">
                                                Minimum Object Size: {localConfig.minObjectSize || 10}%
                                            </Label>
                                            <Slider
                                                id="min-object-size"
                                                value={[localConfig.minObjectSize || 10]}
                                                onValueChange={([value]) => handleConfigChange('minObjectSize', value)}
                                                min={1}
                                                max={50}
                                                step={1}
                                                className="w-full"
                                            />
                                            <p className="text-xs text-gray-500">
                                                Ignore objects smaller than this percentage of frame
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="alerts" className="space-y-6 mt-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <Volume2 className="w-4 h-4" />
                                        <Label htmlFor="alert-sound">Alert Sound</Label>
                                    </div>
                                    <Switch
                                        id="alert-sound"
                                        checked={localConfig.alertSound}
                                        onCheckedChange={(checked) => handleConfigChange('alertSound', checked)}
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <Bell className="w-4 h-4" />
                                        <Label htmlFor="notifications">Push Notifications</Label>
                                    </div>
                                    <Switch
                                        id="notifications"
                                        checked={localConfig.alertNotifications}
                                        onCheckedChange={(checked) => handleConfigChange('alertNotifications', checked)}
                                    />
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    <Label>Alert Priority Levels</Label>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between p-3 border rounded-lg">
                                            <div className="flex items-center space-x-2">
                                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                                <span className="text-sm font-medium">High Priority</span>
                                            </div>
                                            <p className="text-sm text-gray-500">Human detected</p>
                                        </div>

                                        <div className="flex items-center justify-between p-3 border rounded-lg">
                                            <div className="flex items-center space-x-2">
                                                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                                                <span className="text-sm font-medium">Medium Priority</span>
                                            </div>
                                            <p className="text-sm text-gray-500">Vehicle or animal</p>
                                        </div>

                                        <div className="flex items-center justify-between p-3 border rounded-lg">
                                            <div className="flex items-center space-x-2">
                                                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                                <span className="text-sm font-medium">Low Priority</span>
                                            </div>
                                            <p className="text-sm text-gray-500">General motion</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Alert Actions</Label>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id="auto-record"
                                                checked={localConfig.autoRecord || false}
                                                onChange={(e) => handleConfigChange('autoRecord', e.target.checked)}
                                                className="rounded"
                                            />
                                            <Label htmlFor="auto-record">Start recording on motion</Label>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id="auto-snapshot"
                                                checked={localConfig.autoSnapshot || false}
                                                onChange={(e) => handleConfigChange('autoSnapshot', e.target.checked)}
                                                className="rounded"
                                            />
                                            <Label htmlFor="auto-snapshot">Capture snapshot on motion</Label>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                id="email-alert"
                                                checked={localConfig.emailAlerts || false}
                                                onChange={(e) => handleConfigChange('emailAlerts', e.target.checked)}
                                                className="rounded"
                                            />
                                            <Label htmlFor="email-alert">Send email alerts</Label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {showAdvanced && (
                            <>
                                <TabsContent value="zones" className="space-y-6 mt-6">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-medium">Detection Zones</h4>
                                                <p className="text-sm text-gray-500">
                                                    Define specific areas for motion detection
                                                </p>
                                            </div>
                                            <Button size="sm" onClick={addZone}>
                                                Add Zone
                                            </Button>
                                        </div>

                                        {zones.length === 0 ? (
                                            <Alert>
                                                <Info className="h-4 w-4" />
                                                <AlertDescription>
                                                    No detection zones configured. The entire frame will be monitored.
                                                </AlertDescription>
                                            </Alert>
                                        ) : (
                                            <div className="space-y-3">
                                                {zones.map((zone) => (
                                                    <div key={zone.id} className="p-3 border rounded-lg space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <Input
                                                                value={zone.name}
                                                                onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                                                                className="max-w-[200px]"
                                                            />
                                                            <div className="flex items-center space-x-2">
                                                                <Switch
                                                                    checked={zone.enabled}
                                                                    onCheckedChange={(checked) => updateZone(zone.id, { enabled: checked })}
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => deleteZone(zone.id)}
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <Label className="text-xs">Sensitivity</Label>
                                                                <Slider
                                                                    value={[zone.sensitivity]}
                                                                    onValueChange={([value]) => updateZone(zone.id, { sensitivity: value })}
                                                                    min={0}
                                                                    max={100}
                                                                    step={5}
                                                                />
                                                            </div>

                                                            <div className="space-y-1">
                                                                <Label className="text-xs">Min Object Size</Label>
                                                                <Slider
                                                                    value={[zone.minObjectSize]}
                                                                    onValueChange={([value]) => updateZone(zone.id, { minObjectSize: value })}
                                                                    min={1}
                                                                    max={50}
                                                                    step={1}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                <TabsContent value="schedule" className="space-y-6 mt-6">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-medium">Detection Schedule</h4>
                                                <p className="text-sm text-gray-500">
                                                    Configure when motion detection is active
                                                </p>
                                            </div>
                                            <Button size="sm" onClick={addSchedule}>
                                                Add Schedule
                                            </Button>
                                        </div>

                                        {schedules.length === 0 ? (
                                            <Alert>
                                                <Info className="h-4 w-4" />
                                                <AlertDescription>
                                                    No schedules configured. Motion detection is always active.
                                                </AlertDescription>
                                            </Alert>
                                        ) : (
                                            <div className="space-y-3">
                                                {schedules.map((schedule) => (
                                                    <div key={schedule.id} className="p-3 border rounded-lg space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <Input
                                                                value={schedule.name}
                                                                onChange={(e) => updateSchedule(schedule.id, { name: e.target.value })}
                                                                className="max-w-[200px]"
                                                            />
                                                            <div className="flex items-center space-x-2">
                                                                <Switch
                                                                    checked={schedule.enabled}
                                                                    onCheckedChange={(checked) => updateSchedule(schedule.id, { enabled: checked })}
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => deleteSchedule(schedule.id)}
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <Label className="text-xs">Start Time</Label>
                                                                <Input
                                                                    type="time"
                                                                    value={schedule.startTime}
                                                                    onChange={(e) => updateSchedule(schedule.id, { startTime: e.target.value })}
                                                                />
                                                            </div>

                                                            <div className="space-y-1">
                                                                <Label className="text-xs">End Time</Label>
                                                                <Input
                                                                    type="time"
                                                                    value={schedule.endTime}
                                                                    onChange={(e) => updateSchedule(schedule.id, { endTime: e.target.value })}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap gap-2">
                                                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                                                                <Badge
                                                                    key={day}
                                                                    variant={schedule.days?.includes(day.toLowerCase().slice(0, 3)) ? 'default' : 'outline'}
                                                                    className="cursor-pointer"
                                                                    onClick={() => {
                                                                        const dayCode = day.toLowerCase().slice(0, 3)
                                                                        const currentDays = schedule.days || []
                                                                        const newDays = currentDays.includes(dayCode)
                                                                            ? currentDays.filter(d => d !== dayCode)
                                                                            : [...currentDays, dayCode]
                                                                        updateSchedule(schedule.id, { days: newDays })
                                                                    }}
                                                                >
                                                                    {day}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                            </>
                        )}
                    </Tabs>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between mt-6 pt-6 border-t">
                        <Button
                            variant="outline"
                            onClick={handleReset}
                            disabled={!hasChanges || isSaving}
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reset
                        </Button>

                        <div className="flex items-center space-x-2">
                            {hasChanges && (
                                <p className="text-sm text-orange-600">
                                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                                    Unsaved changes
                                </p>
                            )}

                            <Button
                                onClick={handleSave}
                                disabled={!hasChanges || isSaving || !onSave}
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}