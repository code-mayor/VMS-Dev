import React from 'react'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { EditDeviceFormData } from '../../../types/edit-device-types'
import { Wifi, WifiOff } from 'lucide-react'

interface NetworkTabProps {
  formData: EditDeviceFormData
  onFormDataChange: (data: EditDeviceFormData) => void
  onTestConnection: () => void
  loading: boolean
}

export function NetworkTab({ 
  formData, 
  onFormDataChange, 
  onTestConnection, 
  loading 
}: NetworkTabProps) {
  const handleInputChange = (field: keyof EditDeviceFormData, value: any) => {
    onFormDataChange({
      ...formData,
      [field]: value
    })
  }

  const isValidIP = (ip: string) => {
    const pattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
    return pattern.test(ip)
  }

  const isValidPort = (port: number) => {
    return port >= 1 && port <= 65535
  }

  return (
    <div className="space-y-6 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ip_address">IP Address *</Label>
          <Input
            id="ip_address"
            value={formData.ip_address}
            onChange={(e) => handleInputChange('ip_address', e.target.value)}
            required
            pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"
            className={!isValidIP(formData.ip_address) && formData.ip_address ? 'border-red-300' : ''}
          />
          {!isValidIP(formData.ip_address) && formData.ip_address && (
            <p className="text-xs text-red-600 mt-1">Invalid IP address format</p>
          )}
        </div>
        
        <div>
          <Label htmlFor="port">Port</Label>
          <Input
            id="port"
            type="number"
            value={formData.port}
            onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 80)}
            min={1}
            max={65535}
            className={!isValidPort(formData.port) ? 'border-red-300' : ''}
          />
          {!isValidPort(formData.port) && (
            <p className="text-xs text-red-600 mt-1">Port must be between 1 and 65535</p>
          )}
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-blue-900">Connection Test</h4>
            <p className="text-sm text-blue-700">
              Test connectivity to the device with current network settings
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onTestConnection}
            disabled={loading || !isValidIP(formData.ip_address) || !isValidPort(formData.port)}
            className="bg-white"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2" />
                Testing...
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 mr-2" />
                Test Connection
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Network Information</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Current URL:</span>
            <code className="bg-white px-2 py-1 rounded text-xs">
              http://{formData.ip_address}:{formData.port}
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">ONVIF Endpoint:</span>
            <code className="bg-white px-2 py-1 rounded text-xs">
              http://{formData.ip_address}:{formData.port}/onvif/device_service
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Connection Status:</span>
            <Badge variant="outline">
              <WifiOff className="w-3 h-3 mr-1" />
              Needs Testing
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}