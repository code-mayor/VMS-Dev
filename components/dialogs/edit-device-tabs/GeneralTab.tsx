import React from 'react'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Textarea } from '../../ui/textarea'
import { Badge } from '../../ui/badge'
import { Device, EditDeviceFormData } from '../../../types/edit-device-types'

interface GeneralTabProps {
  device: Device
  formData: EditDeviceFormData
  onFormDataChange: (data: EditDeviceFormData) => void
}

export function GeneralTab({ device, formData, onFormDataChange }: GeneralTabProps) {
  const handleInputChange = (field: keyof EditDeviceFormData, value: any) => {
    onFormDataChange({
      ...formData,
      [field]: value
    })
  }

  return (
    <div className="space-y-6 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Device Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => handleInputChange('location', e.target.value)}
            placeholder="e.g., Front Door, Parking Lot"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
          rows={3}
          placeholder="Optional description of this device"
        />
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Device Information</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Manufacturer:</span>
            <span className="ml-2 font-medium">{device.manufacturer || 'Unknown'}</span>
          </div>
          <div>
            <span className="text-gray-600">Model:</span>
            <span className="ml-2 font-medium">{device.model || 'Unknown'}</span>
          </div>
          <div>
            <span className="text-gray-600">Status:</span>
            <Badge variant={device.status === 'discovered' ? 'default' : 'secondary'} className="ml-2">
              {device.status}
            </Badge>
          </div>
          <div>
            <span className="text-gray-600">Capabilities:</span>
            <div className="ml-2 flex space-x-1">
              {device.capabilities?.video && <Badge variant="outline" className="text-xs">Video</Badge>}
              {device.capabilities?.audio && <Badge variant="outline" className="text-xs">Audio</Badge>}
              {device.capabilities?.ptz && <Badge variant="outline" className="text-xs">PTZ</Badge>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}