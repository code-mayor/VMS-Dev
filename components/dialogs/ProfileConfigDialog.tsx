import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Separator } from '../ui/separator'
import { ScrollArea } from '../ui/scroll-area'
import { Alert, AlertDescription } from '../ui/alert'
import { toast } from 'sonner'

// Profile usage types
const PROFILE_USAGE_TYPES = [
  { value: 'main-stream', label: 'Main Stream', description: 'High quality stream for recording and live view' },
  { value: 'sub-stream', label: 'Sub Stream', description: 'Lower quality stream for efficient streaming' },
  { value: 'snapshot', label: 'Snapshot', description: 'Still image capture for thumbnails' },
  { value: 'motion-detection', label: 'Motion Detection', description: 'Low quality stream for motion analysis' },
  { value: 'recording', label: 'Recording', description: 'High quality stream for permanent storage' },
  { value: 'mobile-view', label: 'Mobile View', description: 'Optimized stream for mobile devices' },
  { value: 'web-preview', label: 'Web Preview', description: 'Browser-compatible preview stream' },
  { value: 'backup', label: 'Backup', description: 'Redundant stream for failover' },
  { value: 'custom', label: 'Custom', description: 'User-defined usage' }
]

interface ONVIFProfile {
  name: string
  token: string
  rtspUri?: string
  snapshotUri?: string
  videoEncoding: {
    encoding: string
    resolution: {
      width: number
      height: number
    }
    rateControl: {
      frameRateLimit: number
      bitrateLimit: number
    }
  }
  audioEncoder?: string
}

interface ProfileAssignment {
  profileToken: string
  profileName: string
  usage: string
  customUsage?: string
  priority: number
  enabled: boolean
  description?: string
}

interface ProfileConfigDialogProps {
  open: boolean
  onClose: () => void
  device: any
  onvifProfiles: ONVIFProfile[]
  onSave: (assignments: ProfileAssignment[]) => Promise<void>
}

export function ProfileConfigDialog({ 
  open, 
  onClose, 
  device, 
  onvifProfiles, 
  onSave 
}: ProfileConfigDialogProps) {
  const [assignments, setAssignments] = useState<ProfileAssignment[]>([])
  const [loading, setLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  useEffect(() => {
    if (open && onvifProfiles.length > 0) {
      initializeAssignments()
    }
  }, [open, onvifProfiles])

  const initializeAssignments = () => {
    // Create initial assignments for each discovered profile
    const initialAssignments = onvifProfiles.map((profile, index) => ({
      profileToken: profile.token,
      profileName: profile.name,
      usage: index === 0 ? 'main-stream' : index === 1 ? 'sub-stream' : '',
      priority: onvifProfiles.length - index,
      enabled: index < 2, // Enable first two profiles by default
      description: `${profile.videoEncoding.resolution.width}x${profile.videoEncoding.resolution.height} @ ${profile.videoEncoding.rateControl.frameRateLimit}fps`
    }))

    setAssignments(initialAssignments)
  }

  const updateAssignment = (index: number, field: keyof ProfileAssignment, value: any) => {
    const newAssignments = [...assignments]
    newAssignments[index] = {
      ...newAssignments[index],
      [field]: value
    }
    setAssignments(newAssignments)
    validateAssignments(newAssignments)
  }

  const validateAssignments = (currentAssignments: ProfileAssignment[]) => {
    const errors: string[] = []
    const usages = new Set()
    
    const enabledAssignments = currentAssignments.filter(a => a.enabled)
    
    // Check for duplicate usage assignments
    enabledAssignments.forEach(assignment => {
      if (assignment.usage && assignment.usage !== 'custom') {
        if (usages.has(assignment.usage)) {
          errors.push(`Duplicate usage assignment: ${assignment.usage}`)
        }
        usages.add(assignment.usage)
      }
    })

    // Ensure at least one main stream
    if (!enabledAssignments.some(a => a.usage === 'main-stream')) {
      errors.push('At least one profile must be assigned as "Main Stream"')
    }

    // Check for missing usage on enabled profiles
    enabledAssignments.forEach(assignment => {
      if (!assignment.usage || assignment.usage === '') {
        errors.push(`Profile "${assignment.profileName}" is enabled but has no usage assigned`)
      }
    })

    setValidationErrors(errors)
  }

  const handleSave = async () => {
    if (validationErrors.length > 0) {
      toast.error('Please fix validation errors before saving')
      return
    }

    setLoading(true)
    try {
      await onSave(assignments)
      toast.success('Profile configuration saved successfully')
      onClose()
    } catch (error: any) {
      toast.error(`Failed to save profile configuration: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const getUsageLabel = (usage: string) => {
    const usageType = PROFILE_USAGE_TYPES.find(t => t.value === usage)
    return usageType ? usageType.label : usage
  }

  const getUsageDescription = (usage: string) => {
    const usageType = PROFILE_USAGE_TYPES.find(t => t.value === usage)
    return usageType ? usageType.description : ''
  }

  const getStreamTypeIcon = (profile: ONVIFProfile) => {
    const { width, height } = profile.videoEncoding.resolution
    const fps = profile.videoEncoding.rateControl.frameRateLimit
    const encoding = profile.videoEncoding.encoding

    if (width >= 1920) return '🎬' // High resolution
    if (width >= 1280) return '📹' // Medium resolution  
    if (fps >= 30) return '⚡' // High frame rate
    if (encoding === 'JPEG') return '📸' // JPEG encoding
    return '📺' // Default
  }

  const getQualityBadge = (profile: ONVIFProfile) => {
    const { width, height } = profile.videoEncoding.resolution
    const fps = profile.videoEncoding.rateControl.frameRateLimit
    const bitrate = profile.videoEncoding.rateControl.bitrateLimit

    if (width >= 1920 && fps >= 25) return { variant: 'default' as const, text: 'High Quality' }
    if (width >= 1280 && fps >= 15) return { variant: 'secondary' as const, text: 'Medium Quality' }
    return { variant: 'outline' as const, text: 'Low Quality' }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Configure ONVIF Profiles</DialogTitle>
          <div className="text-sm text-muted-foreground">
            Assign usage and priority to discovered ONVIF profiles for <strong>{device?.name}</strong>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-96 pr-4">
          <div className="space-y-4">
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="space-y-1">
                    {validationErrors.map((error, index) => (
                      <div key={index}>• {error}</div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Profile Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Device Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>Name:</strong> {device?.name}</div>
                  <div><strong>IP:</strong> {device?.ip_address}</div>
                  <div><strong>Manufacturer:</strong> {device?.manufacturer || 'Unknown'}</div>
                  <div><strong>Model:</strong> {device?.model || 'Unknown'}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Discovery Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>Profiles Found:</strong> {onvifProfiles.length}</div>
                  <div><strong>Enabled:</strong> {assignments.filter(a => a.enabled).length}</div>
                  <div><strong>Configured:</strong> {assignments.filter(a => a.enabled && a.usage).length}</div>
                  <div><strong>Status:</strong> 
                    <Badge variant={validationErrors.length === 0 ? "default" : "destructive"} className="ml-2">
                      {validationErrors.length === 0 ? "Valid" : "Errors"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Profile Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Profile Assignments</h3>
              
              {assignments.map((assignment, index) => {
                const profile = onvifProfiles[index]
                if (!profile) return null

                const qualityBadge = getQualityBadge(profile)

                return (
                  <Card key={profile.token} className={assignment.enabled ? 'border-primary' : 'border-muted'}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">{getStreamTypeIcon(profile)}</span>
                          <div>
                            <CardTitle className="text-base">{profile.name}</CardTitle>
                            <CardDescription>
                              Token: <code className="text-xs bg-muted px-1 rounded">{profile.token}</code>
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant={qualityBadge.variant}>
                            {qualityBadge.text}
                          </Badge>
                          <Badge variant={assignment.enabled ? "default" : "secondary"}>
                            {assignment.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Profile Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <Label className="text-xs text-muted-foreground">Resolution</Label>
                          <div>{profile.videoEncoding.resolution.width}x{profile.videoEncoding.resolution.height}</div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Frame Rate</Label>
                          <div>{profile.videoEncoding.rateControl.frameRateLimit} fps</div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Encoding</Label>
                          <div>{profile.videoEncoding.encoding}</div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Bitrate</Label>
                          <div>{profile.videoEncoding.rateControl.bitrateLimit || 'Auto'}</div>
                        </div>
                      </div>

                      <Separator />

                      {/* Configuration */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`enabled-${index}`}>Enable Profile</Label>
                          <div className="flex items-center space-x-2">
                            <input
                              id={`enabled-${index}`}
                              type="checkbox"
                              checked={assignment.enabled}
                              onChange={(e) => updateAssignment(index, 'enabled', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm text-muted-foreground">
                              {assignment.enabled ? 'Profile is active' : 'Profile is disabled'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`usage-${index}`}>Usage Assignment</Label>
                          <Select
                            value={assignment.usage}
                            onValueChange={(value) => updateAssignment(index, 'usage', value)}
                            disabled={!assignment.enabled}
                          >
                            <SelectTrigger id={`usage-${index}`}>
                              <SelectValue placeholder="Select usage..." />
                            </SelectTrigger>
                            <SelectContent>
                              {PROFILE_USAGE_TYPES.map((usage) => (
                                <SelectItem key={usage.value} value={usage.value}>
                                  <div>
                                    <div>{usage.label}</div>
                                    <div className="text-xs text-muted-foreground">{usage.description}</div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {assignment.usage && (
                            <div className="text-xs text-muted-foreground">
                              {getUsageDescription(assignment.usage)}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`priority-${index}`}>Priority</Label>
                          <Input
                            id={`priority-${index}`}
                            type="number"
                            min="1"
                            max="10"
                            value={assignment.priority}
                            onChange={(e) => updateAssignment(index, 'priority', parseInt(e.target.value))}
                            disabled={!assignment.enabled}
                            className="w-full"
                          />
                          <div className="text-xs text-muted-foreground">
                            Higher numbers = higher priority
                          </div>
                        </div>
                      </div>

                      {/* Custom Usage */}
                      {assignment.usage === 'custom' && assignment.enabled && (
                        <div className="space-y-2">
                          <Label htmlFor={`custom-${index}`}>Custom Usage Name</Label>
                          <Input
                            id={`custom-${index}`}
                            value={assignment.customUsage || ''}
                            onChange={(e) => updateAssignment(index, 'customUsage', e.target.value)}
                            placeholder="Enter custom usage name..."
                          />
                        </div>
                      )}

                      {/* Stream URIs */}
                      {assignment.enabled && (
                        <div className="space-y-2">
                          <Label className="text-sm">Stream Endpoints</Label>
                          <div className="space-y-1 text-xs">
                            {profile.rtspUri && (
                              <div className="flex items-center space-x-2">
                                <Badge variant="outline" className="text-xs">RTSP</Badge>
                                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                                  {profile.rtspUri.replace(/\/\/.*:.*@/, '//***:***@')}
                                </code>
                              </div>
                            )}
                            {profile.snapshotUri && (
                              <div className="flex items-center space-x-2">
                                <Badge variant="outline" className="text-xs">Snapshot</Badge>
                                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                                  {profile.snapshotUri.replace(/\/\/.*:.*@/, '//***:***@')}
                                </code>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Usage Summary */}
            {assignments.filter(a => a.enabled && a.usage).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuration Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    {assignments
                      .filter(a => a.enabled && a.usage)
                      .sort((a, b) => b.priority - a.priority)
                      .map((assignment, index) => (
                        <div key={assignment.profileToken} className="space-y-1">
                          <div className="font-medium">{assignment.profileName}</div>
                          <Badge variant="outline" className="text-xs">
                            {getUsageLabel(assignment.usage)}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            Priority: {assignment.priority}
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || validationErrors.length > 0}
          >
            {loading ? 'Saving...' : 'Save Configuration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}