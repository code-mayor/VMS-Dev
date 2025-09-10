import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
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
  Calendar
} from 'lucide-react'
import { recordingService, AutoRecordingSettings as RecordingSettings } from '../services/recording-service'
import { toast } from 'sonner'

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
  // Auto-recording settings state (optimized for 1-minute chunks)
  const [settings, setSettings] = useState<RecordingSettings>({
    enabled: false,
    chunkDuration: 1, // minutes - 1 minute for testing
    quality: 'medium',
    maxStorage: 30, // GB
    retentionPeriod: 1, // days
    enabledDevices: []
  })

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [initialSettings, setInitialSettings] = useState<RecordingSettings | null>(null)

  // Statistics
  const [statistics, setStatistics] = useState({
    activeRecordings: 0,
    totalRecordings: 0,
    storageUsed: '0 MB'
  })

  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null)

  // Initial load only
  useEffect(() => {
    loadSettings()
    loadStatistics()
  }, []) // Empty dependency array - only run once

  // Periodic statistics refresh only (not settings)
  useEffect(() => {
    const interval = setInterval(() => {
      loadStatistics() // Only refresh statistics, NOT settings
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  // Simple change detection
  useEffect(() => {
    if (initialSettings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(initialSettings)
      setHasChanges(changed)
    }
  }, [settings, initialSettings])

  // Unified handler for all setting changes
  const handleSettingChange = (key: string, value: any) => {
    console.log(`🔍 Setting change: ${key} = ${value}`)

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      setSaveTimeout(null)
    }

    // Update settings immediately
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    setHasChanges(true)

    // NEVER auto-save these critical settings
    const criticalSettings = ['enabled', 'enabledDevices', 'chunkDuration']
    if (criticalSettings.includes(key)) {
      console.log('🔍 Critical setting changed - manual save required')
      return
    }

    // Auto-save only for non-critical settings after delay
    const timeout = setTimeout(() => {
      if (!isSaving) { // Don't auto-save if already saving
        saveSettings()
      }
    }, 3000)
    setSaveTimeout(timeout)
  }

  // Specific handlers using the unified function
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
      console.log('⏸️ Skipping load during save operation')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('⚙️ Loading auto-recording settings from server...')
      const currentSettings = await recordingService.getAutoRecordingSettings()

      console.log('✅ Settings loaded from server:', currentSettings)

      // Clear any drafts
      localStorage.removeItem('autoRecordingDraft')

      // Use the settings from the server as-is if they exist
      const validatedSettings = {
        enabled: currentSettings.enabled === true, // Respect server value
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
      console.error('❌ Failed to load settings:', err)
      setError('Failed to load settings: ' + err.message)

      // Use safe defaults on error
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

  // Fix device filtering - only show ONLINE authenticated devices
  const getAvailableDevices = () => {
    return devices.filter(device => {
      // Must be authenticated
      if (!device.authenticated) return false

      return true
    })
  }

  // Use this for device selection
  const availableDevices = getAvailableDevices()

  const loadStatistics = async () => {
    try {
      // Load storage info
      const response = await fetch('http://localhost:3001/api/recordings/storage-info')
      if (response.ok) {
        const storageInfo = await response.json()

        // Load active recordings
        const activeResponse = await fetch('http://localhost:3001/api/recordings/active')
        const activeData = activeResponse.ok ? await activeResponse.json() : { activeRecordings: [] }

        setStatistics({
          activeRecordings: activeData.activeRecordings?.length || 0,
          totalRecordings: storageInfo.totalRecordings || 0,
          storageUsed: storageInfo.totalSizeFormatted || '0 MB'
        })
      }
    } catch (err) {
      console.warn('⚠️ Failed to load statistics:', err)
    }
  }

  const saveSettings = async () => {
    if (isSaving) return

    setIsSaving(true)
    setError(null)

    try {
      console.log('💾 Saving settings to server:', settings)

      // Validate
      if (settings.enabled && settings.enabledDevices.length === 0) {
        throw new Error('Please select at least one device for auto-recording')
      }

      // Ensure chunk duration is valid
      const validChunkDuration = Math.max(1, Math.min(60, parseInt(String(settings.chunkDuration)) || 2))
      const settingsToSave = {
        ...settings,
        chunkDuration: validChunkDuration
      }

      // Send directly to server without wrapper
      const response = await fetch('http://localhost:3001/api/recordings/auto-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave)
      })

      if (!response.ok) {
        throw new Error(`Failed to save: ${response.statusText}`)
      }

      const savedSettings = await response.json()
      console.log('✅ Saved settings:', savedSettings)

      // Update local state with server response
      setSettings(savedSettings)
      setInitialSettings(savedSettings)
      setHasChanges(false)

      // Clear save timeout
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

      // Reload stats after saving
      setTimeout(() => {
        loadStatistics()
      }, 2000)

    } catch (err: any) {
      console.error('❌ Save failed:', err)
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
      localStorage.removeItem('autoRecordingDraft') // Clear draft when resetting
      toast.info('Settings reset to last saved values')
    }
  }

  const calculateEstimatedUsage = () => {
    if (!settings.enabled || settings.enabledDevices.length === 0) return '0 MB/day'

    // Rough estimation: 1 minute of medium quality video = ~10MB
    const mbPerMinute = settings.quality === 'low' ? 5 : settings.quality === 'high' ? 20 : 10
    const minutesPerDay = 24 * 60 // Full day recording
    const totalMbPerDay = settings.enabledDevices.length * minutesPerDay * mbPerMinute

    if (totalMbPerDay < 1024) {
      return `${Math.round(totalMbPerDay)} MB/day`
    } else {
      return `${(totalMbPerDay / 1024).toFixed(1)} GB/day`
    }
  }

  // Get authenticated devices only
  const authenticatedDevices = devices.filter(device => device.authenticated)

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2>Auto Recording Settings</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure automatic recording with customizable chunk duration for all authenticated cameras
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {hasChanges && (
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              Unsaved Changes
            </Badge>
          )}

          <Button
            variant="outline"
            onClick={() => loadSettings(true)}
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

      {/* Recording Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Recording Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure automatic recording settings and quality parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Auto Recording */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Enable Auto Recording</div>
              <div className="text-sm text-gray-600">
                Automatically record all enabled cameras in chunks
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
            {/* Chunk Duration */}
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
                File size estimation: ~{settings.chunkDuration * 10}MB per chunk (medium quality)
                <br />
                • ~{Math.round(settings.chunkDuration * 10 * 0.5)}MB per chunk (low quality)
                <br />
                • ~{Math.round(settings.chunkDuration * 10 * 2)}MB per chunk (high quality)
              </div>
            </div>

            {/* Recording Quality */}
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
                  <SelectItem value="low">Low Quality (480p) - Balanced</SelectItem>
                  <SelectItem value="medium">Medium Quality (720p) - Balanced</SelectItem>
                  <SelectItem value="high">High Quality (1080p) - Best</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Maximum Storage */}
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
                Automatic cleanup when storage limit is reached (oldest files deleted first)
              </div>
            </div>

            {/* Retention Period */}
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
                Automatically delete recordings older than this period
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

      {/* Camera Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Camera className="w-5 h-5" />
            <span>Camera Selection</span>
          </CardTitle>
          <CardDescription>
            Select which cameras to include in auto-recording
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            // Get available devices (authenticated ones)
            const availableDevices = getAvailableDevices()

            if (availableDevices.length === 0) {
              return (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No authenticated cameras available. Please authenticate at least one camera in the Device Discovery section.
                  </AlertDescription>
                </Alert>
              )
            }

            return (
              <div className="space-y-3">
                {availableDevices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div>
                        <div className="font-medium">{device.name}</div>
                        <div className="text-sm text-gray-600">{device.ip_address}</div>
                      </div>
                      {/* Don't show status badge here since it might be incorrect */}
                      <Badge variant="outline" className="text-green-600 border-green-300">
                        Authenticated
                      </Badge>
                    </div>
                    <Switch
                      checked={settings.enabledDevices.includes(device.id)}
                      onCheckedChange={() => toggleDeviceEnabled(device.id)}
                      disabled={isLoading || isSaving}
                    />
                  </div>
                ))}
              </div>
            )
          })()}

          {settings.enabled && settings.enabledDevices.length === 0 && getAvailableDevices().length > 0 && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Auto-recording is enabled but no cameras are selected. Please select at least one camera.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {settings.enabled && (
            <Badge variant="default" className="text-green-600 border-green-300 bg-green-50">
              <CheckCircle className="w-3 h-3 mr-1" />
              Auto Recording Enabled
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
    </div>
  )
}