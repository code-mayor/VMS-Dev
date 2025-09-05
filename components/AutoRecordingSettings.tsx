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
  // Auto-recording settings state (optimized for 4-second chunks as requested)
  const [settings, setSettings] = useState<RecordingSettings>({
    enabled: false,
    chunkDuration: 4, // minutes - increased to 4 minutes for better file sizes
    quality: 'medium',
    maxStorage: 100, // GB
    retentionPeriod: 30, // days
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

  useEffect(() => {
    loadSettings()
    loadStatistics()
    
    // Set up periodic refresh
    const interval = setInterval(() => {
      loadStatistics()
    }, 10000) // Update stats every 10 seconds
    
    // Reload settings when window gains focus (helps with persistence)
    const handleWindowFocus = () => {
      console.log('👁️ Window focused - checking for setting changes')
      loadSettings()
    }
    
    window.addEventListener('focus', handleWindowFocus)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, []) // Remove dependency on functions to prevent loops

  useEffect(() => {
    // Check for changes and persist draft
    if (initialSettings) {
      const currentSettingsStr = JSON.stringify(settings)
      const initialSettingsStr = JSON.stringify(initialSettings)
      const hasChanged = currentSettingsStr !== initialSettingsStr
      
      console.log('🔍 Settings change detection:', {
        hasChanged,
        currentSettings: settings.enabled,
        initialSettings: initialSettings.enabled,
        currentDevices: settings.enabledDevices.length,
        initialDevices: initialSettings.enabledDevices.length
      })
      
      setHasChanges(hasChanged)
      
      // Persist draft settings when changes are made (debounced)
      if (hasChanged) {
        const persistTimer = setTimeout(() => {
          console.log('💾 Persisting draft settings due to change')
          persistDraftSettings()
        }, 500) // 500ms debounce
        
        return () => clearTimeout(persistTimer)
      }
    }
  }, [settings, initialSettings])

  // Persist draft settings to localStorage with retry mechanism
  const persistDraftSettings = () => {
    try {
      const draftData = {
        settings,
        timestamp: Date.now(),
        version: '1.0'
      }
      localStorage.setItem('autoRecordingDraft', JSON.stringify(draftData))
      console.log('💾 Draft settings persisted to localStorage:', draftData)
    } catch (error) {
      console.warn('⚠️ Failed to persist draft settings:', error)
      // Try to clear corrupted data and retry once
      try {
        localStorage.removeItem('autoRecordingDraft')
        localStorage.setItem('autoRecordingDraft', JSON.stringify({
          settings,
          timestamp: Date.now(),
          version: '1.0'
        }))
        console.log('💾 Draft settings persisted after cleanup')
      } catch (retryError) {
        console.error('❌ Failed to persist draft settings after cleanup:', retryError)
      }
    }
  }



  // Clear persisted draft when settings are saved
  const clearPersistedDraft = () => {
    try {
      localStorage.removeItem('autoRecordingDraft')
    } catch (error) {
      console.warn('⚠️ Failed to clear persisted draft:', error)
    }
  }

  const loadSettings = async () => {
    setIsLoading(true)
    setError(null)

    try {
      console.log('⚙️ Loading auto-recording settings...')
      const currentSettings = await recordingService.getAutoRecordingSettings()
      
      console.log('✅ Settings loaded from server:', currentSettings)
      
      // Check localStorage for draft settings
      let finalSettings = currentSettings // Default to server settings
      let shouldUseDraft = false
      
      try {
        const draftData = localStorage.getItem('autoRecordingDraft')
        
        if (draftData) {
          const parsed = JSON.parse(draftData)
          const draftSettings = parsed.settings
          const timestamp = parsed.timestamp
          const version = parsed.version || '1.0'
          const ageMinutes = Math.round((Date.now() - timestamp) / (60 * 1000))
          const isRecent = ageMinutes < 120 // 2 hours
          
          console.log('📝 Found draft settings in localStorage:', {
            timestamp: new Date(timestamp).toLocaleString(),
            ageMinutes,
            version,
            isRecent,
            draftEnabled: draftSettings?.enabled,
            draftDevices: draftSettings?.enabledDevices?.length || 0,
            serverEnabled: currentSettings.enabled,
            serverDevices: currentSettings.enabledDevices?.length || 0
          })
          
          if (isRecent && draftSettings && version === '1.0') {
            // Use draft settings
            finalSettings = { ...draftSettings }
            shouldUseDraft = true
            console.log('✅ Using draft settings (recent and valid)')
          } else {
            // Clean up expired/invalid draft
            localStorage.removeItem('autoRecordingDraft')
            console.log('🗑️ Cleaned up expired/invalid draft settings')
          }
        } else {
          console.log('📭 No draft settings found - using server settings')
        }
      } catch (error) {
        console.warn('⚠️ Error reading draft settings:', error)
        localStorage.removeItem('autoRecordingDraft')
      }
      
      // Apply settings
      console.log('🔄 Applying settings:', {
        source: shouldUseDraft ? 'draft' : 'server',
        enabled: finalSettings.enabled,
        devices: finalSettings.enabledDevices?.length || 0,
        chunkDuration: finalSettings.chunkDuration
      })
      
      setSettings({ ...finalSettings })
      setInitialSettings({ ...currentSettings }) // Always track server state as initial
      
      // Determine if there are unsaved changes
      const hasUnsavedChanges = JSON.stringify(finalSettings) !== JSON.stringify(currentSettings)
      setHasChanges(hasUnsavedChanges)
      
      if (hasUnsavedChanges) {
        console.log('📊 Unsaved changes detected - will show save button')
      }
      
      console.log('🔄 Settings comparison:', {
        usingDraft: shouldUseDraft,
        hasChanges,
        current: shouldUseDraft ? 'draft' : 'server',
        server: currentSettings
      })
      
    } catch (err: any) {
      console.error('❌ Failed to load settings:', err)
      setError('Failed to load settings: ' + err.message)
      toast.error('Failed to load auto-recording settings')
    } finally {
      setIsLoading(false)
    }
  }

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
    setIsSaving(true)
    setError(null)

    try {
      console.log('💾 Saving auto-recording settings:', settings)
      
      // Validate settings
      if (settings.enabled && settings.enabledDevices.length === 0) {
        throw new Error('Please select at least one device for auto-recording')
      }

      if (settings.chunkDuration < 1 || settings.chunkDuration > 60) {
        throw new Error('Chunk duration must be between 1 and 60 minutes')
      }

      if (settings.maxStorage < 1 || settings.maxStorage > 10000) {
        throw new Error('Storage limit must be between 1 and 10,000 GB')
      }

      if (settings.retentionPeriod < 1 || settings.retentionPeriod > 365) {
        throw new Error('Retention period must be between 1 and 365 days')
      }

      // Add detailed debug logging for the save process
      console.log('🔍 DEBUG: Starting save process with settings:', JSON.stringify(settings, null, 2))
      
      // Test endpoint first for debugging
      try {
        const testResponse = await fetch('http://localhost:3001/api/recordings/auto-settings/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings })
        })
        const testResult = await testResponse.json()
        console.log('🧪 Test endpoint result:', testResult)
      } catch (testError) {
        console.warn('⚠️ Test endpoint failed:', testError)
      }
      
      // Save settings
      const updatedSettings = await recordingService.updateAutoRecordingSettings(settings)
      
      console.log('✅ Settings saved successfully:', updatedSettings)
      setSettings(updatedSettings)
      setInitialSettings(updatedSettings)
      setHasChanges(false)
      
      // Clear persisted draft since settings are now saved
      clearPersistedDraft()
      
      // Notify parent component
      onSettingsChange?.(updatedSettings)
      
      // Refresh statistics
      await loadStatistics()
      
      toast.success(
        settings.enabled 
          ? `Auto-recording enabled for ${settings.enabledDevices.length} device(s)`
          : 'Auto-recording disabled'
      )
      
    } catch (err: any) {
      console.error('❌ Failed to save settings:', err)
      setError('Failed to save settings: ' + err.message)
      toast.error('Failed to save auto-recording settings')
    } finally {
      setIsSaving(false)
    }
  }

  const resetSettings = () => {
    if (initialSettings) {
      setSettings(initialSettings)
      setHasChanges(false)
      setError(null)
      clearPersistedDraft() // Clear draft when resetting
      toast.info('Settings reset to last saved values')
    }
  }

  const toggleDeviceEnabled = (deviceId: string) => {
    const newEnabledDevices = settings.enabledDevices.includes(deviceId)
      ? settings.enabledDevices.filter(id => id !== deviceId)
      : [...settings.enabledDevices, deviceId]
    
    setSettings({
      ...settings,
      enabledDevices: newEnabledDevices
    })
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
            onClick={loadSettings}
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
              onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
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
                onChange={(e) => setSettings({ ...settings, chunkDuration: parseInt(e.target.value) || 2 })}
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
                onValueChange={(value) => setSettings({ ...settings, quality: value })}
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
                onChange={(e) => setSettings({ ...settings, maxStorage: parseInt(e.target.value) || 100 })}
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
                onChange={(e) => setSettings({ ...settings, retentionPeriod: parseInt(e.target.value) || 30 })}
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
          {authenticatedDevices.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No authenticated cameras available. Please authenticate at least one camera in the Device Discovery section.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {authenticatedDevices.map((device) => (
                <div key={device.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div>
                      <div className="font-medium">{device.name}</div>
                      <div className="text-sm text-gray-600">{device.ip_address}</div>
                    </div>
                    
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
          )}
          
          {settings.enabled && settings.enabledDevices.length === 0 && authenticatedDevices.length > 0 && (
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