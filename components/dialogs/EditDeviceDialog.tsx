import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Alert, AlertDescription } from '../ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { GeneralTab } from './edit-device-tabs/GeneralTab'
import { NetworkTab } from './edit-device-tabs/NetworkTab'
import { CredentialsTab } from './edit-device-tabs/CredentialsTab'
import { SettingsTab } from './edit-device-tabs/SettingsTab'
import { Device, EditDeviceFormData, EditDeviceDialogProps } from '../../types/edit-device-types'
import { EDIT_DEVICE_TABS } from '../../constants/edit-device-constants'
import { 
  initializeFormData, 
  hasFormChanges, 
  updateDevice, 
  testDeviceConnection 
} from '../../utils/edit-device-helpers'
import { 
  Save, 
  AlertTriangle, 
  CheckCircle,
  X
} from 'lucide-react'

export function EditDeviceDialog({
  open,
  onOpenChange,
  device,
  onDeviceUpdated
}: EditDeviceDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('general')
  const [formData, setFormData] = useState<EditDeviceFormData>(initializeFormData(null))
  const [originalData, setOriginalData] = useState<EditDeviceFormData>(initializeFormData(null))

  // Initialize form data when device changes
  useEffect(() => {
    if (device) {
      const data = initializeFormData(device)
      setFormData(data)
      setOriginalData(data)
      setError('')
    }
  }, [device])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!device) return
    
    setLoading(true)
    setError('')

    try {
      await updateDevice(device.id, formData)
      onDeviceUpdated({ ...device, ...formData })
      onOpenChange(false)
      
      console.log('✅ Device updated successfully:', device.name)
    } catch (err: any) {
      setError(err.message)
      console.error('❌ Failed to update device:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!device) return
    
    setLoading(true)
    setError('')

    try {
      await testDeviceConnection(device.id, {
        ip_address: formData.ip_address,
        port: formData.port,
        username: formData.username,
        password: formData.password
      })
      
      alert('Connection test successful!')
    } catch (err: any) {
      setError(`Connection test failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleResetCredentials = () => {
    if (confirm('Reset credentials to original values?')) {
      setFormData(prev => ({
        ...prev,
        username: originalData.username,
        password: originalData.password,
        rtsp_username: originalData.rtsp_username,
        rtsp_password: originalData.rtsp_password
      }))
    }
  }

  const hasChanges = hasFormChanges(formData, originalData)

  if (!device) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              <span>Edit Device - {device.name}</span>
              {device.authenticated && (
                <Badge variant="default">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Authenticated
                </Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex-1 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              {EDIT_DEVICE_TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger 
                    key={tab.id} 
                    value={tab.id} 
                    className="flex items-center space-x-2"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <div className="flex-1 overflow-auto">
              <TabsContent value="general">
                <GeneralTab
                  device={device}
                  formData={formData}
                  onFormDataChange={setFormData}
                />
              </TabsContent>

              <TabsContent value="network">
                <NetworkTab
                  formData={formData}
                  onFormDataChange={setFormData}
                  onTestConnection={handleTestConnection}
                  loading={loading}
                />
              </TabsContent>

              <TabsContent value="credentials">
                <CredentialsTab
                  formData={formData}
                  originalData={originalData}
                  onFormDataChange={setFormData}
                  onResetCredentials={handleResetCredentials}
                />
              </TabsContent>

              <TabsContent value="settings">
                <SettingsTab
                  formData={formData}
                  onFormDataChange={setFormData}
                />
              </TabsContent>
            </div>
          </Tabs>

          {/* Error Display */}
          {error && (
            <div className="flex-shrink-0 p-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {error}
                  <Button 
                    type="button"
                    variant="outline" 
                    size="sm" 
                    onClick={() => setError('')}
                    className="ml-2"
                  >
                    <X className="w-3 h-3" />
                    Dismiss
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-t">
            <div className="flex items-center space-x-2">
              {hasChanges && (
                <Badge variant="secondary" className="text-xs">
                  Unsaved changes
                </Badge>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              
              <Button 
                type="submit" 
                disabled={loading || !hasChanges}
                className="flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
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