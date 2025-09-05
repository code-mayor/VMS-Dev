import React, { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Alert, AlertDescription } from '../ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'
import {
  Plus,
  Camera,
  Network,
  Settings,
  AlertTriangle,
  CheckCircle,
  Info,
  Eye,
  EyeOff
} from 'lucide-react'

interface ManualAddDeviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeviceAdded: (device: any) => void
}

export function ManualAddDeviceDialog({
  open,
  onOpenChange,
  onDeviceAdded
}: ManualAddDeviceDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [deviceData, setDeviceData] = useState({
    name: '',
    ip_address: '',
    port: '80',
    manufacturer: '',
    model: '',
    username: '',
    password: '',
    device_type: 'ip_camera'
  })

  const commonManufacturers = [
    'Hikvision',
    'Dahua',
    'Axis',
    'Honeywell',
    'Bosch',
    'Panasonic',
    'Sony',
    'Vivotek',
    'Uniview',
    'Lorex',
    'Amcrest',
    'Reolink',
    'Foscam',
    'Tyco',
    'Other'
  ]

  const commonPorts = [
    { value: '80', label: '80 (HTTP)', description: 'Standard web interface' },
    { value: '8080', label: '8080 (HTTP Alt)', description: 'Alternative HTTP port' },
    { value: '443', label: '443 (HTTPS)', description: 'Secure web interface' },
    { value: '554', label: '554 (RTSP)', description: 'RTSP streaming port' },
    { value: '8000', label: '8000 (Custom)', description: 'Custom camera port' },
    { value: '8554', label: '8554 (RTSP Alt)', description: 'Alternative RTSP port' }
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!deviceData.name || !deviceData.ip_address) {
      setError('Device name and IP address are required')
      return
    }

    // Validate IP address format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(deviceData.ip_address)) {
      setError('Please enter a valid IP address')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log('🔧 Adding device manually:', deviceData)

      const response = await fetch('http://localhost:3001/api/devices/manual-add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(deviceData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add device')
      }

      setSuccess('Device added successfully!')
      console.log('✅ Device added:', data.device)

      // Call parent callback
      onDeviceAdded(data.device)

      // Reset form
      setDeviceData({
        name: '',
        ip_address: '',
        port: '80',
        manufacturer: '',
        model: '',
        username: '',
        password: '',
        device_type: 'ip_camera'
      })

      // Close dialog after a delay
      setTimeout(() => {
        onOpenChange(false)
        setSuccess('')
      }, 1500)

    } catch (err: any) {
      console.error('❌ Failed to add device:', err)
      setError(err.message || 'Failed to add device')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFieldChange = (field: string, value: string) => {
    setDeviceData(prev => ({ ...prev, [field]: value }))

    // Auto-generate device name if IP is entered
    if (field === 'ip_address' && value && !deviceData.name) {
      setDeviceData(prev => ({
        ...prev,
        [field]: value,
        name: `Camera ${value}`
      }))
    }
  }

  const fillExampleData = () => {
    setDeviceData({
      name: 'Front Door Camera',
      ip_address: '192.168.1.100',
      port: '80',
      manufacturer: 'Hikvision',
      model: 'DS-2CD2142FE-I',
      username: 'admin',
      password: 'admin123',
      device_type: 'ip_camera'
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>Add Device Manually</span>
          </DialogTitle>
          <DialogDescription>
            Add a camera or device manually by providing its network details and credentials
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quick Example */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center space-x-2">
                <Info className="w-4 h-4" />
                <span>Quick Start</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Not sure what to enter? Use example data to get started.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fillExampleData}
                >
                  Fill Example
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error/Success Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {/* Basic Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center space-x-2">
                <Camera className="w-4 h-4" />
                <span>Basic Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="device-name">Device Name *</Label>
                  <Input
                    id="device-name"
                    placeholder="e.g., Front Door Camera"
                    value={deviceData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="device-type">Device Type</Label>
                  <Select
                    value={deviceData.device_type}
                    onValueChange={(value) => handleFieldChange('device_type', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ip_camera">IP Camera</SelectItem>
                      <SelectItem value="nvr">Network Video Recorder</SelectItem>
                      <SelectItem value="encoder">Video Encoder</SelectItem>
                      <SelectItem value="other">Other Device</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Select
                    value={deviceData.manufacturer}
                    onValueChange={(value) => handleFieldChange('manufacturer', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select manufacturer" />
                    </SelectTrigger>
                    <SelectContent>
                      {commonManufacturers.map(manufacturer => (
                        <SelectItem key={manufacturer} value={manufacturer}>
                          {manufacturer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    placeholder="e.g., DS-2CD2142FE-I"
                    value={deviceData.model}
                    onChange={(e) => handleFieldChange('model', e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Network Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center space-x-2">
                <Network className="w-4 h-4" />
                <span>Network Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="ip-address">IP Address *</Label>
                  <Input
                    id="ip-address"
                    placeholder="e.g., 192.168.1.100"
                    value={deviceData.ip_address}
                    onChange={(e) => handleFieldChange('ip_address', e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Select
                    value={deviceData.port}
                    onValueChange={(value) => handleFieldChange('port', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {commonPorts.map(port => (
                        <SelectItem key={port.value} value={port.value}>
                          <div>
                            <div className="font-medium">{port.label}</div>
                            <div className="text-xs text-gray-500">{port.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-blue-900 mb-1">Network Tips:</div>
                    <ul className="text-blue-700 space-y-1 text-xs">
                      <li>• Ensure the camera is on the same network as this server</li>
                      <li>• Test camera access by opening http://&lt;ip&gt;:&lt;port&gt; in browser</li>
                      <li>• Common IP ranges: 192.168.1.x, 192.168.0.x, 10.0.0.x</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Authentication */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center space-x-2">
                <Settings className="w-4 h-4" />
                <span>Authentication (Optional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="e.g., admin"
                    value={deviceData.username}
                    onChange={(e) => handleFieldChange('username', e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Device password"
                      value={deviceData.password}
                      onChange={(e) => handleFieldChange('password', e.target.value)}
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      ) : (
                        <Eye className="w-4 h-4 text-gray-400" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <Info className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-yellow-900 mb-1">Authentication Notes:</div>
                    <div className="text-yellow-700 text-xs">
                      Credentials are optional for initial setup. You can add them later when configuring streaming.
                      Common defaults: admin/admin, admin/12345, root/root.
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Badge variant="outline">Required fields marked with *</Badge>
            </div>

            <div className="flex items-center space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={isLoading || !deviceData.name || !deviceData.ip_address}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Adding Device...</span>
                  </div>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Device
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}