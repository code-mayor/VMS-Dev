import React, { useState } from 'react'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Button } from '../../ui/button'
import { Switch } from '../../ui/switch'
import { Alert, AlertDescription } from '../../ui/alert'
import { EditDeviceFormData } from '../../../types/edit-device-types'
import { Eye, EyeOff, RotateCcw, Shield, Key } from 'lucide-react'

interface CredentialsTabProps {
  formData: EditDeviceFormData
  originalData: EditDeviceFormData
  onFormDataChange: (data: EditDeviceFormData) => void
  onResetCredentials: () => void
}

export function CredentialsTab({ 
  formData, 
  originalData, 
  onFormDataChange, 
  onResetCredentials 
}: CredentialsTabProps) {
  const [showPasswords, setShowPasswords] = useState(false)
  const [useSeperateRTSP, setUseSeparateRTSP] = useState(
    !!(formData.rtsp_username || formData.rtsp_password)
  )

  const handleInputChange = (field: keyof EditDeviceFormData, value: any) => {
    onFormDataChange({
      ...formData,
      [field]: value
    })
  }

  const handleRTSPToggle = (enabled: boolean) => {
    setUseSeparateRTSP(enabled)
    if (!enabled) {
      // Clear RTSP credentials when disabled
      onFormDataChange({
        ...formData,
        rtsp_username: '',
        rtsp_password: ''
      })
    }
  }

  return (
    <div className="space-y-6 p-4">
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Device credentials are used for ONVIF authentication and RTSP streaming. 
          Keep these secure and update them if the device password changes.
        </AlertDescription>
      </Alert>

      {/* ONVIF Credentials */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Shield className="w-4 h-4 text-blue-600" />
          <h4 className="font-medium">ONVIF Authentication</h4>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="Device username"
            />
          </div>
          
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPasswords ? "text" : "password"}
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Device password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPasswords(!showPasswords)}
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* RTSP Credentials */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-green-600" />
            <h4 className="font-medium">RTSP Streaming Credentials</h4>
          </div>
          <div className="flex items-center space-x-2">
            <Label htmlFor="rtsp-toggle" className="text-sm">Use separate RTSP credentials</Label>
            <Switch
              id="rtsp-toggle"
              checked={useSeperateRTSP}
              onCheckedChange={handleRTSPToggle}
            />
          </div>
        </div>

        {useSeperateRTSP ? (
          <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
            <div>
              <Label htmlFor="rtsp_username">RTSP Username</Label>
              <Input
                id="rtsp_username"
                value={formData.rtsp_username}
                onChange={(e) => handleInputChange('rtsp_username', e.target.value)}
                placeholder="RTSP username (if different)"
              />
            </div>
            
            <div>
              <Label htmlFor="rtsp_password">RTSP Password</Label>
              <div className="relative">
                <Input
                  id="rtsp_password"
                  type={showPasswords ? "text" : "password"}
                  value={formData.rtsp_password}
                  onChange={(e) => handleInputChange('rtsp_password', e.target.value)}
                  placeholder="RTSP password (if different)"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              RTSP will use the same credentials as ONVIF authentication above.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onResetCredentials}
          className="flex items-center space-x-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset to Original</span>
        </Button>
        
        <div className="text-xs text-gray-500">
          {formData.username !== originalData.username || 
           formData.password !== originalData.password ||
           formData.rtsp_username !== originalData.rtsp_username ||
           formData.rtsp_password !== originalData.rtsp_password ? (
            <span className="text-orange-600">Credentials modified</span>
          ) : (
            <span>No changes made</span>
          )}
        </div>
      </div>
    </div>
  )
}