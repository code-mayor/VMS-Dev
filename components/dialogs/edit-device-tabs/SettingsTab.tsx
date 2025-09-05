import React from 'react'
import { Label } from '../../ui/label'
import { Switch } from '../../ui/switch'
import { Badge } from '../../ui/badge'
import { Alert, AlertDescription } from '../../ui/alert'
import { EditDeviceFormData } from '../../../types/edit-device-types'
import { Camera, Settings as SettingsIcon, Play, Square } from 'lucide-react'

interface SettingsTabProps {
  formData: EditDeviceFormData
  onFormDataChange: (data: EditDeviceFormData) => void
}

export function SettingsTab({ formData, onFormDataChange }: SettingsTabProps) {
  const handleInputChange = (field: keyof EditDeviceFormData, value: any) => {
    onFormDataChange({
      ...formData,
      [field]: value
    })
  }

  return (
    <div className="space-y-6 p-4">
      <Alert>
        <SettingsIcon className="h-4 w-4" />
        <AlertDescription>
          Configure device-specific settings for recording, motion detection, and other features.
        </AlertDescription>
      </Alert>

      {/* Recording Settings */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Camera className="w-4 h-4 text-blue-600" />
          <h4 className="font-medium">Recording Settings</h4>
        </div>
        
        <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="recording-enabled">Auto Recording</Label>
              <p className="text-xs text-gray-600">
                Enable automatic recording for this device
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="recording-enabled"
                checked={formData.recording_enabled}
                onCheckedChange={(checked) => handleInputChange('recording_enabled', checked)}
              />
              <Badge variant={formData.recording_enabled ? 'default' : 'secondary'}>
                {formData.recording_enabled ? <Play className="w-3 h-3 mr-1" /> : <Square className="w-3 h-3 mr-1" />}
                {formData.recording_enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>

          {formData.recording_enabled && (
            <div className="bg-white p-3 rounded border">
              <h5 className="font-medium text-sm mb-2">Recording Configuration</h5>
              <div className="space-y-2 text-xs text-gray-600">
                <div>• Continuous recording will be enabled</div>
                <div>• Files will be stored in segments for better management</div>
                <div>• Default quality: Auto (based on device capabilities)</div>
                <div>• Retention: As per system settings</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Motion Detection Settings */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <SettingsIcon className="w-4 h-4 text-green-600" />
          <h4 className="font-medium">Motion Detection</h4>
        </div>
        
        <div className="space-y-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="motion-detection-enabled">Motion Detection</Label>
              <p className="text-xs text-gray-600">
                Enable motion-triggered recording and alerts
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="motion-detection-enabled"
                checked={formData.motion_detection_enabled}
                onCheckedChange={(checked) => handleInputChange('motion_detection_enabled', checked)}
              />
              <Badge variant={formData.motion_detection_enabled ? 'default' : 'secondary'}>
                {formData.motion_detection_enabled ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {formData.motion_detection_enabled && (
            <div className="bg-white p-3 rounded border">
              <h5 className="font-medium text-sm mb-2">Motion Detection Configuration</h5>
              <div className="space-y-2 text-xs text-gray-600">
                <div>• Sensitivity: Medium (configurable in device profile)</div>
                <div>• Detection zones: Full frame (customizable)</div>
                <div>• Recording duration: 5 minutes after motion stops</div>
                <div>• Notifications: Enabled for admin users</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature Summary */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Current Configuration</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Auto Recording:</span>
            <Badge variant={formData.recording_enabled ? 'default' : 'outline'} className="ml-2">
              {formData.recording_enabled ? 'On' : 'Off'}
            </Badge>
          </div>
          <div>
            <span className="text-gray-600">Motion Detection:</span>
            <Badge variant={formData.motion_detection_enabled ? 'default' : 'outline'} className="ml-2">
              {formData.motion_detection_enabled ? 'On' : 'Off'}
            </Badge>
          </div>
        </div>
        
        {(formData.recording_enabled || formData.motion_detection_enabled) && (
          <div className="mt-3 p-2 bg-blue-100 rounded text-xs text-blue-800">
            <strong>Note:</strong> Changes will take effect after saving. The device may need to be re-authenticated for some features.
          </div>
        )}
      </div>
    </div>
  )
}