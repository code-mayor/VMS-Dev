import React, { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Alert, AlertDescription } from '../ui/alert'
import { Key, Eye, EyeOff, Copy, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { Device } from '../../types/device-types'

interface UpdateCredentialsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: Device | null
  onUpdateCredentials: (credentials: DeviceCredentials) => Promise<void>
  isLoading?: boolean
}

interface DeviceCredentials {
  onvifUsername: string
  onvifPassword: string
  rtspUsername: string
  rtspPassword: string
}

export function UpdateCredentialsDialog({
  open,
  onOpenChange,
  device,
  onUpdateCredentials,
  isLoading = false
}: UpdateCredentialsDialogProps) {
  const [credentials, setCredentials] = useState<DeviceCredentials>({
    onvifUsername: '',
    onvifPassword: '',
    rtspUsername: '',
    rtspPassword: ''
  })
  
  const [showPasswords, setShowPasswords] = useState({
    onvif: false,
    rtsp: false
  })
  
  const [error, setError] = useState('')
  const [copySuccess, setCopySuccess] = useState('')

  // Initialize credentials when device changes
  useEffect(() => {
    if (device) {
      setCredentials({
        onvifUsername: device.username || '',
        onvifPassword: device.password || '',
        rtspUsername: device.rtsp_username || device.username || '',
        rtspPassword: device.rtsp_password || device.password || ''
      })
      setError('')
    }
  }, [device])

  const handleSubmit = async () => {
    try {
      setError('')
      
      // Validate required fields
      if (!credentials.onvifUsername || !credentials.onvifPassword) {
        setError('ONVIF username and password are required')
        return
      }

      await onUpdateCredentials(credentials)
      onOpenChange(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update credentials')
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(`${label} copied!`)
      setTimeout(() => setCopySuccess(''), 2000)
    })
  }

  const useSameAsONVIF = () => {
    setCredentials(prev => ({
      ...prev,
      rtspUsername: prev.onvifUsername,
      rtspPassword: prev.onvifPassword
    }))
  }

  const generateSampleRTSPUrl = () => {
    if (!device || !credentials.rtspUsername || !credentials.rtspPassword) {
      return `rtsp://username:password@${device?.ip_address || '192.168.x.x'}:554/profile1`
    }
    
    const encodedUsername = encodeURIComponent(credentials.rtspUsername)
    const encodedPassword = encodeURIComponent(credentials.rtspPassword)
    return `rtsp://${encodedUsername}:${encodedPassword}@${device.ip_address}:554/profile1`
  }

  if (!device) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Key className="w-5 h-5" />
            <span>Update Device Credentials</span>
          </DialogTitle>
          <DialogDescription>
            Update credentials for ONVIF Device {device.ip_address} ({device.ip_address})
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* ONVIF Credentials Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <Label className="text-base font-medium">ONVIF Credentials</Label>
            </div>
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="onvif-username">Username</Label>
                <Input
                  id="onvif-username"
                  value={credentials.onvifUsername}
                  onChange={(e) => setCredentials(prev => ({ ...prev, onvifUsername: e.target.value }))}
                  placeholder="admin"
                  autoFocus
                />
              </div>
              
              <div>
                <Label htmlFor="onvif-password">Password</Label>
                <div className="relative">
                  <Input
                    id="onvif-password"
                    type={showPasswords.onvif ? 'text' : 'password'}
                    value={credentials.onvifPassword}
                    onChange={(e) => setCredentials(prev => ({ ...prev, onvifPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPasswords(prev => ({ ...prev, onvif: !prev.onvif }))}
                  >
                    {showPasswords.onvif ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* RTSP Credentials Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <Label className="text-base font-medium">RTSP Credentials (Optional)</Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={useSameAsONVIF}
                className="text-xs"
              >
                Use same as ONVIF
              </Button>
            </div>
            
            <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
              Leave RTSP fields empty to use the same credentials as ONVIF
            </div>
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="rtsp-username">RTSP Username</Label>
                <Input
                  id="rtsp-username"
                  value={credentials.rtspUsername}
                  onChange={(e) => setCredentials(prev => ({ ...prev, rtspUsername: e.target.value }))}
                  placeholder="test"
                />
              </div>
              
              <div>
                <Label htmlFor="rtsp-password">RTSP Password</Label>
                <div className="relative">
                  <Input
                    id="rtsp-password"
                    type={showPasswords.rtsp ? 'text' : 'password'}
                    value={credentials.rtspPassword}
                    onChange={(e) => setCredentials(prev => ({ ...prev, rtspPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPasswords(prev => ({ ...prev, rtsp: !prev.rtsp }))}
                  >
                    {showPasswords.rtsp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sample RTSP URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Sample RTSP URL with Credentials:</Label>
            <div className="relative">
              <Input
                value={generateSampleRTSPUrl()}
                readOnly
                className="text-xs font-mono bg-gray-50 pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => copyToClipboard(generateSampleRTSPUrl(), 'RTSP URL')}
                title="Copy RTSP URL"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {copySuccess && (
              <div className="flex items-center space-x-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span>{copySuccess}</span>
              </div>
            )}
          </div>

          {/* Common Credentials Info */}
          <div className="bg-gray-50 p-3 rounded-lg text-xs">
            <div className="flex items-start space-x-2">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-700 mb-1">Common Default Credentials:</p>
                <div className="space-y-1 text-gray-600">
                  <p>• admin / admin</p>
                  <p>• admin / 123456</p>
                  <p>• admin / password</p>
                  <p>• root / root</p>
                  <p>• admin / (empty password)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Updating Credentials...' : 'Update Credentials'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}