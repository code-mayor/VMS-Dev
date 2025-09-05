import React from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Key, Eye, EyeOff } from 'lucide-react'
import { Device, Credentials } from '../../types/device-types'

interface DeviceReauthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: Device | null
  credentials: Credentials
  rtspCredentials: Credentials
  onCredentialsChange: (credentials: Credentials) => void
  onRtspCredentialsChange: (credentials: Credentials) => void
  showPassword: boolean
  onShowPasswordChange: (show: boolean) => void
  onUpdate: () => void
  isLoading?: boolean
}

export function DeviceReauthDialog({
  open,
  onOpenChange,
  device,
  credentials,
  rtspCredentials,
  onCredentialsChange,
  onRtspCredentialsChange,
  showPassword,
  onShowPasswordChange,
  onUpdate,
  isLoading = false
}: DeviceReauthDialogProps) {
  if (!device) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Key className="w-5 h-5" />
            <span>Update Device Credentials</span>
          </DialogTitle>
          <DialogDescription>
            Update credentials for {device.name} ({device.ip_address})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3">
            <h4 className="text-sm font-medium">ONVIF Credentials</h4>
            <div>
              <Label htmlFor="reauth-username">Username</Label>
              <Input
                id="reauth-username"
                value={credentials.username}
                onChange={(e) => onCredentialsChange({ ...credentials, username: e.target.value })}
                placeholder="ONVIF username"
              />
            </div>
            <div>
              <Label htmlFor="reauth-password">Password</Label>
              <div className="relative">
                <Input
                  id="reauth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={credentials.password}
                  onChange={(e) => onCredentialsChange({ ...credentials, password: e.target.value })}
                  placeholder="ONVIF password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => onShowPasswordChange(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium">RTSP Credentials (Optional)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rtsp-username">RTSP Username</Label>
                <Input
                  id="rtsp-username"
                  value={rtspCredentials.username}
                  onChange={(e) => onRtspCredentialsChange({ ...rtspCredentials, username: e.target.value })}
                  placeholder="Same as ONVIF"
                />
              </div>
              <div>
                <Label htmlFor="rtsp-password">RTSP Password</Label>
                <Input
                  id="rtsp-password"
                  type={showPassword ? 'text' : 'password'}
                  value={rtspCredentials.password}
                  onChange={(e) => onRtspCredentialsChange({ ...rtspCredentials, password: e.target.value })}
                  placeholder="Same as ONVIF"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Leave RTSP fields empty to use the same credentials as ONVIF
            </p>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onUpdate} disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update Credentials'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}