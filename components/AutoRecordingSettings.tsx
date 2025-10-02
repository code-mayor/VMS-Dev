import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Switch } from './ui/switch'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import {
  Clock,
  HardDrive,
  Settings,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Save,
  Camera,
  Timer,
  Disc,
  Calendar,
  CalendarClock,
  Plus
} from 'lucide-react'
import { recordingService, AutoRecordingSettings as RecordingSettings } from '../services/recording-service'
import { toast } from 'sonner'
import { RecordingSchedules } from './RecordingSchedules'
import { DeviceSelector } from './DeviceSelector'

interface Device {
  id: string
  name: string
  ip_address: string
  authenticated: boolean
  status: string
}

interface AutoRecordingSettingsProps {
  devices: Device[]
  onSettingsChange?: (settings: RecordingSettings) => void
}

export function AutoRecordingSettings({ devices, onSettingsChange }: AutoRecordingSettingsProps) {
  // Auto-recording settings state
  const [settings, setSettings] = useState<RecordingSettings>({
    enabled: false,
    chunkDuration: 1,
    quality: 'medium',
    maxStorage: 30,
    retentionPeriod: 1,
    enabledDevices: []
  })

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [initialSettings, setInitialSettings] = useState<RecordingSettings | null>(null)
  const [activeTab, setActiveTab] = useState('configuration')

  // Statistics
  const [statistics, setStatistics] = useState({
    activeRecordings: 0,
    totalRecordings: 0,
    storageUsed: '0 MB'
  })

  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null)

  // Initial load
  useEffect(() => {
    loadSettings()
    loadStatistics()
  }, [])

  // Periodic statistics refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadStatistics()
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  // Change detection
  useEffect(() => {
    if (initialSettings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(initialSettings)
      setHasChanges(changed)
    }
  }, [settings, initialSettings])

  const handleSettingChange = (key: string, value: any) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      setSaveTimeout(null)
    }

    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    setHasChanges(true)

    // Never auto-save critical settings
    const criticalSettings = ['enabled', 'enabledDevices', 'chunkDuration']
    if (criticalSettings.includes(key)) {
      return
    }

    // Auto-save non-critical settings after delay
    const timeout = setTimeout(() => {
      if (!isSaving) {
        saveSettings()
      }
    }, 3000)
    setSaveTimeout(timeout)
  }

  const handleEnabledChange = (checked: boolean) => {
    handleSettingChange('enabled', checked)
  }

  const handleChunkDurationChange = (value: string) => {
    const numValue = parseInt(value) || 1
    handleSettingChange('chunkDuration', numValue)
  }

  const handleQualityChange = (value: string) => {
    handleSettingChange('quality', value)
  }

  const handleStorageChange = (value: string) => {
    const numValue = parseInt(value) || 30
    handleSettingChange('maxStorage', numValue)
  }

  const handleRetentionChange = (value: string) => {
    const numValue = parseInt(value) || 1
    handleSettingChange('retentionPeriod', numValue)
  }

  const toggleDeviceEnabled = (deviceId: string) => {
    const newEnabledDevices = settings.enabledDevices.includes(deviceId)
      ? settings.enabledDevices.filter(id => id !== deviceId)
      : [...settings.enabledDevices, deviceId]

    handleSettingChange('enabledDevices', newEnabledDevices)
  }

  const loadSettings = async (forceReload: boolean = false) => {
    if (isSaving) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const currentSettings = await recordingService.getAutoRecordingSettings()

      const validatedSettings = {
        enabled: currentSettings.enabled === true,
        chunkDuration: currentSettings.chunkDuration || 1,
        quality: currentSettings.quality || 'medium',
        maxStorage: currentSettings.maxStorage || 10,
        retentionPeriod: currentSettings.retentionPeriod || 1,
        enabledDevices: currentSettings.enabledDevices || []
      }

      setSettings(validatedSettings)
      setInitialSettings(validatedSettings)
      setHasChanges(false)

    } catch (err: any) {
      console.error('Failed to load settings:', err)
      setError('Failed to load settings: ' + err.message)

      const defaults = {
        enabled: false,
        chunkDuration: 1,
        quality: 'medium',
        maxStorage: 10,
        retentionPeriod: 1,
        enabledDevices: []
      }
      setSettings(defaults)
      setInitialSettings(defaults)
    } finally {
      setIsLoading(false)
    }
  }

  const getAvailableDevices = () => {
    return devices.filter(device => device.authenticated)
  }

  const availableDevices = getAvailableDevices()

  const loadStatistics = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/recordings/storage-info')
      if (response.ok) {
        const storageInfo = await response.json()

        const activeResponse = await fetch('http://localhost:3001/api/recordings/active')
        const activeData = activeResponse.ok ? await activeResponse.json() : { activeRecordings: [] }

        setStatistics({
          activeRecordings: activeData.activeRecordings?.length || 0,
          totalRecordings: storageInfo.totalRecordings || 0,
          storageUsed: storageInfo.totalSizeFormatted || '0 MB'
        })
      }
    } catch (err) {
      console.warn('Failed to load statistics:', err)
    }
  }

  const saveSettings = async () => {
    if (isSaving) return

    setIsSaving(true)
    setError(null)

    try {
      if (settings.enabled && settings.enabledDevices.length === 0) {
        throw new Error('Please select at least one device for auto-recording')
      }

      const validChunkDuration = Math.max(1, Math.min(60, parseInt(String(settings.chunkDuration)) || 2))
      const settingsToSave = {
        ...settings,
        chunkDuration: validChunkDuration
      }

      const response = await fetch('http://localhost:3001/api/recordings/auto-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave)
      })

      if (!response.ok) {
        throw new Error(`Failed to save: ${response.statusText}`)
      }

      const savedSettings = await response.json()

      setSettings(savedSettings)
      setInitialSettings(savedSettings)
      setHasChanges(false)

      if (saveTimeout) {
        clearTimeout(saveTimeout)
        setSaveTimeout(null)
      }

      onSettingsChange?.(savedSettings)

      toast.success(
        savedSettings.enabled
          ? `Auto-recording enabled: ${savedSettings.chunkDuration}min chunks for ${savedSettings.enabledDevices.length} device(s)`
          : 'Auto-recording disabled'
      )

      setTimeout(() => {
        loadStatistics()
      }, 2000)

    } catch (err: any) {
      console.error('Save failed:', err)
      setError(err.message)
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const resetSettings = () => {
    if (initialSettings) {
      setSettings(initialSettings)
      setHasChanges(false)
      setError(null)
      toast.info('Settings reset to last saved values')
    }
  }

  const calculateEstimatedUsage = () => {
    if (!settings.enabled || settings.enabledDevices.length === 0) return '0 MB/day'

    const mbPerMinute = settings.quality === 'low' ? 5 : settings.quality === 'high' ? 20 : 10
    const minutesPerDay = 24 * 60
    const totalMbPerDay = settings.enabledDevices.length * minutesPerDay * mbPerMinute

    if (totalMbPerDay < 1024) {
      return `${Math.round(totalMbPerDay)} MB/day`
    } else {
      return `${(totalMbPerDay / 1024).toFixed(1)} GB/day`
    }
  }

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2>Recording Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure continuous and scheduled recording for all authenticated cameras
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {hasChanges && activeTab === 'configuration' && (
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              Unsaved Changes
            </Badge>
          )}

          <Button
            variant="outline"
            onClick={() => {
              loadSettings(true)
              loadStatistics()
            }}
            disabled={isLoading || isSaving}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Disc className="w-5 h-5 text-red-500" />
              <div>
                <div className="text-sm text-gray-600">Active Recordings</div>
                <div className="text-xl font-semibold">{statistics.activeRecordings}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Timer className="w-5 h-5 text-green-500" />
              <div>
                <div className="text-sm text-gray-600">Chunk Duration</div>
                <div className="text-xl font-semibold">{settings.chunkDuration}m</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <HardDrive className="w-5 h-5 text-blue-500" />
              <div>
                <div className="text-sm text-gray-600">Storage Limit</div>
                <div className="text-xl font-semibold">{settings.maxStorage}GB</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-purple-500" />
              <div>
                <div className="text-sm text-gray-600">Retention Period</div>
                <div className="text-xl font-semibold">{settings.retentionPeriod}d</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="configuration" className="flex items-center space-x-2">
            <Settings className="w-4 h-4" />
            <span>Configuration</span>
          </TabsTrigger>
          <TabsTrigger value="schedules" className="flex items-center space-x-2">
            <CalendarClock className="w-4 h-4" />
            <span>Schedules</span>
          </TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center space-x-2">
            <Camera className="w-4 h-4" />
            <span>Devices ({settings.enabledDevices.length}/{availableDevices.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>Continuous Recording</span>
              </CardTitle>
              <CardDescription>
                Configure 24/7 automatic recording settings and quality parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable Auto Recording */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Enable Continuous Recording</div>
                  <div className="text-sm text-gray-600">
                    Record all enabled cameras 24/7 in chunks
                  </div>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={handleEnabledChange}
                  disabled={isLoading || isSaving}
                />
              </div>

              {/* Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="chunk-duration">Chunk Duration (minutes)</Label>
                  <Input
                    id="chunk-duration"
                    type="number"
                    value={settings.chunkDuration}
                    onChange={(e) => handleChunkDurationChange(e.target.value)}
                    min="1"
                    max="60"
                    disabled={isLoading || isSaving}
                  />
                  <div className="text-xs text-gray-500">
                    Estimated file size per chunk at medium quality: ~{settings.chunkDuration * 10}MB
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Recording Quality</Label>
                  <Select
                    value={settings.quality}
                    onValueChange={handleQualityChange}
                    disabled={isLoading || isSaving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low Quality (480p)</SelectItem>
                      <SelectItem value="medium">Medium Quality (720p)</SelectItem>
                      <SelectItem value="high">High Quality (1080p)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-storage">Maximum Storage (GB)</Label>
                  <Input
                    id="max-storage"
                    type="number"
                    value={settings.maxStorage}
                    onChange={(e) => handleStorageChange(e.target.value)}
                    min="1"
                    max="10000"
                    disabled={isLoading || isSaving}
                  />
                  <div className="text-xs text-gray-500">
                    Oldest recordings deleted first when limit reached
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retention-period">Retention Period (days)</Label>
                  <Input
                    id="retention-period"
                    type="number"
                    value={settings.retentionPeriod}
                    onChange={(e) => handleRetentionChange(e.target.value)}
                    min="1"
                    max="365"
                    disabled={isLoading || isSaving}
                  />
                  <div className="text-xs text-gray-500">
                    Auto-delete recordings older than this period
                  </div>
                </div>
              </div>

              {/* Estimated Usage */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2 mb-2">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-900">Estimated Storage Usage</span>
                </div>
                <div className="text-sm text-blue-800">
                  {calculateEstimatedUsage()} for {settings.enabledDevices.length} selected device(s)
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {settings.enabled && (
                <Badge variant="default" className="text-green-600 border-green-300 bg-green-50">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Continuous Recording Active
                </Badge>
              )}

              {statistics.activeRecordings > 0 && (
                <Badge variant="destructive">
                  <Disc className="w-3 h-3 mr-1" />
                  {statistics.activeRecordings} Recording Now
                </Badge>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  onClick={resetSettings}
                  disabled={isLoading || isSaving}
                >
                  Reset Changes
                </Button>
              )}

              <Button
                onClick={saveSettings}
                disabled={isLoading || isSaving || !hasChanges}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules" className="mt-6">
          <RecordingSchedules devices={availableDevices} />
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices" className="mt-6">
          <DeviceSelector
            devices={availableDevices}
            selectedDevices={settings.enabledDevices}
            onSelectionChange={(selectedIds) => {
              handleSettingChange('enabledDevices', selectedIds)
            }}
            disabled={isLoading || isSaving}
          />

          {settings.enabled && settings.enabledDevices.length === 0 && availableDevices.length > 0 && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Recording is enabled but no devices are selected. Select at least one device.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}