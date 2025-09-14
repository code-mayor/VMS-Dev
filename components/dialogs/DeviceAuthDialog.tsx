import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Switch } from '../ui/switch'
import { Separator } from '../ui/separator'
import {
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Loader2,
  Network,
  Camera,
  Key,
  Settings
} from 'lucide-react'

interface DeviceAuthDialogProps {
  device: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthSuccess: (deviceId: string) => void
}

interface AuthForm {
  onvif_username: string
  onvif_password: string
  rtsp_username: string
  rtsp_password: string
  auto_sync: boolean
}

// Add debug mode flag - set to false in production
const DEBUG_MODE = false

export function DeviceAuthDialog({ device, open, onOpenChange, onAuthSuccess }: DeviceAuthDialogProps) {
  const [formData, setFormData] = useState<AuthForm>({
    onvif_username: '',
    onvif_password: '',
    rtsp_username: '',
    rtsp_password: '',
    auto_sync: true
  })

  const [showPasswords, setShowPasswords] = useState({
    onvif: false,
    rtsp: false
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'credentials' | 'testing' | 'success'>('credentials')
  const [authResult, setAuthResult] = useState<any>(null)

  useEffect(() => {
    // Only process if dialog is open AND device exists
    if (open && device) {
      if (DEBUG_MODE) {
        console.log('🔓 DeviceAuthDialog opened for device:', device?.name)
      }
      setStep('credentials')
      setError('')
      setAuthResult(null)

      // Reset form with any existing credentials
      setFormData({
        onvif_username: device?.username || '',
        onvif_password: device?.password || '',
        rtsp_username: device?.rtsp_username || device?.username || '',
        rtsp_password: device?.rtsp_password || device?.password || '',
        auto_sync: !device?.rtsp_username || device?.rtsp_username === device?.username
      })
    }
  }, [open, device])

  // Handle auto-sync of credentials
  useEffect(() => {
    if (formData.auto_sync) {
      setFormData(prev => ({
        ...prev,
        rtsp_username: prev.onvif_username,
        rtsp_password: prev.onvif_password
      }))
    }
  }, [formData.auto_sync, formData.onvif_username, formData.onvif_password])

  const handleClose = () => {
    if (!isLoading) {
      if (DEBUG_MODE) {
        console.log('🔓 Closing DeviceAuthDialog')
      }
      onOpenChange(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.onvif_username || !formData.onvif_password) {
      setError('ONVIF username and password are required')
      return
    }

    if (!device?.id) {
      setError('Device ID is required')
      return
    }

    try {
      setIsLoading(true)
      setError('')
      setStep('testing')

      if (DEBUG_MODE) {
        console.log('🔓 Starting authentication for device:', device.name)
      }

      const authData = {
        username: formData.onvif_username,
        password: formData.onvif_password,
        rtsp_username: formData.rtsp_username,
        rtsp_password: formData.rtsp_password
      }

      const response = await fetch(`http://localhost:3001/api/devices/${device.id}/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(authData)
      })

      const result = await response.json()

      if (DEBUG_MODE) {
        console.log('🔓 Authentication response:', {
          status: response.status,
          success: result.success,
          hasProfiles: !!result.profiles,
          profileCount: result.profiles?.length
        })
      }

      if (response.ok && result.success) {
        setStep('success')
        setAuthResult(result)

        // Call success callback after a short delay - Pass only the device ID
        setTimeout(() => {
          if (DEBUG_MODE) {
            console.log('✅ Authentication successful, calling onAuthSuccess with device ID:', device.id)
          }
          onAuthSuccess(device.id)

          // Close dialog after callback
          setTimeout(() => {
            handleClose()
          }, 1000)
        }, 1500)

      } else {
        const errorMessage = result.error || result.message || 'Authentication failed'
        if (DEBUG_MODE) {
          console.error('❌ Authentication failed:', errorMessage)
        }
        throw new Error(errorMessage)
      }
    } catch (error: any) {
      if (DEBUG_MODE) {
        console.error('❌ Authentication error:', error)
      }
      setError(error.message || 'Authentication failed')
      setStep('credentials')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFieldChange = (field: keyof AuthForm, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  const generateRtspUrl = () => {
    if (!device || !formData.rtsp_username) return ''
    return `rtsp://${formData.rtsp_username}:***@${device.ip_address}:554/profile1`
  }

  const copyRtspUrl = () => {
    const url = `rtsp://${formData.rtsp_username}:${formData.rtsp_password}@${device.ip_address}:554/profile1`
    navigator.clipboard.writeText(url)
    if (DEBUG_MODE) {
      console.log('📋 RTSP URL copied to clipboard')
    }
  }

  // Early return if no device - prevents rendering the dialog without proper data
  // This should prevent the warning from appearing
  if (!device) {
    // Only show warning once when dialog attempts to open without device
    if (open && DEBUG_MODE) {
      console.warn('⚠️ DeviceAuthDialog: Attempted to open without device')
    }
    return null
  }

  // Additional check - don't render if dialog is not open
  if (!open) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center space-x-2">
            <Key className="w-5 h-5" />
            <span>Enter Credentials for {device.name}</span>
          </DialogTitle>
          <DialogDescription>
            Configure ONVIF and RTSP credentials for {device.ip_address}
          </DialogDescription>
        </DialogHeader>

        {step === 'credentials' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Device Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-700">Device found and ready for authentication</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Device ID:</span>
                  <div className="text-gray-600">{device.id}</div>
                </div>
                <div>
                  <span className="font-medium">IP Address:</span>
                  <div className="text-gray-600">{device.ip_address}:{device.port || 80}</div>
                </div>
                <div>
                  <span className="font-medium">Manufacturer:</span>
                  <div className="text-gray-600">{device.manufacturer || 'Unknown'}</div>
                </div>
                <div>
                  <span className="font-medium">Discovery Method:</span>
                  <div className="text-gray-600">{device.discovery_method || 'ONVIF'}</div>
                </div>
              </div>
            </div>

            {/* ONVIF Credentials */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Network className="w-4 h-4 text-blue-500" />
                <h3 className="font-medium">ONVIF Credentials</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="onvif_username">Username</Label>
                  <Input
                    id="onvif_username"
                    type="text"
                    value={formData.onvif_username}
                    onChange={(e) => handleFieldChange('onvif_username', e.target.value)}
                    placeholder="admin"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onvif_password">Password</Label>
                  <div className="relative">
                    <Input
                      id="onvif_password"
                      type={showPasswords.onvif ? 'text' : 'password'}
                      value={formData.onvif_password}
                      onChange={(e) => handleFieldChange('onvif_password', e.target.value)}
                      placeholder="password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1 h-8 w-8 p-0"
                      onClick={() => setShowPasswords(prev => ({ ...prev, onvif: !prev.onvif }))}
                    >
                      {showPasswords.onvif ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* RTSP Credentials */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Camera className="w-4 h-4 text-green-500" />
                  <h3 className="font-medium">RTSP Streaming Credentials</h3>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.auto_sync}
                    onCheckedChange={(checked) => handleFieldChange('auto_sync', checked)}
                  />
                  <Label className="text-sm">Auto-sync with ONVIF</Label>
                </div>
              </div>

              {!formData.auto_sync && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-700">Auto-sync disabled</span>
                  </div>
                  <p className="text-xs text-amber-600">
                    RTSP credentials are independent from ONVIF credentials. You can use different credentials for RTSP streaming.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rtsp_username">RTSP Username</Label>
                  <Input
                    id="rtsp_username"
                    type="text"
                    value={formData.rtsp_username}
                    onChange={(e) => handleFieldChange('rtsp_username', e.target.value)}
                    placeholder="test"
                    disabled={formData.auto_sync}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rtsp_password">RTSP Password</Label>
                  <div className="relative">
                    <Input
                      id="rtsp_password"
                      type={showPasswords.rtsp ? 'text' : 'password'}
                      value={formData.rtsp_password}
                      onChange={(e) => handleFieldChange('rtsp_password', e.target.value)}
                      placeholder="password"
                      disabled={formData.auto_sync}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1 h-8 w-8 p-0"
                      onClick={() => setShowPasswords(prev => ({ ...prev, rtsp: !prev.rtsp }))}
                    >
                      {showPasswords.rtsp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* RTSP URL Preview */}
              {formData.rtsp_username && (
                <div className="space-y-2">
                  <Label>Sample RTSP URL Preview:</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={generateRtspUrl()}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyRtspUrl}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4 mr-2" />
                    Authenticate Device
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {step === 'testing' && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-500" />
            <h3 className="text-lg font-medium mb-2">Testing Authentication...</h3>
            <p className="text-gray-600 mb-4">
              Verifying credentials and discovering camera profiles
            </p>
            <div className="text-sm text-gray-500 space-y-1">
              <div>• Testing ONVIF connection</div>
              <div>• Validating RTSP credentials</div>
              <div>• Discovering video profiles</div>
              <div>• Starting HLS streaming</div>
            </div>
          </div>
        )}

        {step === 'success' && authResult && (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium mb-2">Authentication Successful!</h3>
            <p className="text-gray-600 mb-6">
              Device authenticated and profiles discovered
            </p>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>ONVIF Authentication:</span>
                  <Badge variant="default">Success</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>ONVIF Profiles Found:</span>
                  <Badge variant="secondary">{authResult.profiles?.length || 0} profiles</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Credentials Saved:</span>
                  <Badge variant="default">Yes</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>HLS Streaming:</span>
                  <Badge variant="default">Started</Badge>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              Opening profile configuration...
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Default export for compatibility
export default DeviceAuthDialog