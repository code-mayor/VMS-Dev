import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { ScrollArea } from '../ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Alert, AlertDescription } from '../ui/alert'
import { Separator } from '../ui/separator'
import { ProfileDialogErrorBoundary } from './ProfileDialogErrorBoundary'
import * as Icons from 'lucide-react'
import {
  RefreshCw,
  Camera,
  Monitor,
  Settings,
  CheckCircle,
  AlertTriangle as AlertTriangleIcon,
  Video,
  Zap,
  Tag,
  Play,
  Square,
  Info,
  Clock,
  HardDrive,
  Wifi,
  Signal
} from 'lucide-react'

// Resilient audio icon that tries multiple fallbacks
const AudioIcon: React.ElementType =
  (Icons as any).AudioLines ??
  (Icons as any).AudioWaveform ??
  (Icons as any).Mic ??
  (() => null)

interface VideoProfile {
  name: string
  token: string
  resolution: string
  fps: number
  codec: string
  bitrate: number
  width?: number
  height?: number
}

interface DeviceProfile {
  id: string
  token: string
  name: string
  video_profiles: VideoProfile[]
  quality_level: string
  category: string
  ptz_supported: boolean
  audio_supported: boolean
}

interface ProfileTag {
  profile_id: string
  tag: string
}

interface DiscoveredDevice {
  id: string
  name: string
  ip_address: string
  port: number
  manufacturer: string
  model: string
  authenticated?: boolean
}

interface ProfileManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: DiscoveredDevice | null
  onProfilesConfigured?: (deviceId: string) => void
}

export function ProfileManagementDialog({ open, onOpenChange, device, onProfilesConfigured }: ProfileManagementDialogProps) {
  const [profiles, setProfiles] = useState<DeviceProfile[]>([])
  const [profileTags, setProfileTags] = useState<ProfileTag[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isValidDevice = device && device.id && device.name

  useEffect(() => {
    if (open && isValidDevice) {
      loadDeviceProfiles()
    }
  }, [open, isValidDevice])

  // FIXED: Remove invalid device notification - just return empty dialog content
  if (!isValidDevice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 p-6 pb-0">
            <DialogTitle>Profile Management</DialogTitle>
            <DialogDescription>
              Please select a device to configure profiles.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-6">
            <div className="text-center py-8">
              <p className="text-sm text-gray-600">
                Please select a device from the discovery page to configure profiles.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const loadDeviceProfiles = async () => {
    if (!isValidDevice) {
      console.warn('Cannot load profiles: invalid device')
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log(`📋 Loading profiles for device: ${device.id}`)

      // FIXED: Try profile discovery endpoint first since that's what the backend logs show working
      const response = await fetch(`http://localhost:3001/api/devices/${device.id}/profiles/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        // Fallback to GET profiles if discover fails
        console.log('Profile discovery failed, trying to load existing profiles...')
        const fallbackResponse = await fetch(`http://localhost:3001/api/devices/${device.id}/profiles`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })

        if (!fallbackResponse.ok) {
          throw new Error(`Failed to load profiles: ${fallbackResponse.status} ${fallbackResponse.statusText}`)
        }

        const fallbackData = await fallbackResponse.json()
        if (fallbackData.success && Array.isArray(fallbackData.profiles)) {
          setProfiles(fallbackData.profiles || [])
          console.log(`✅ Loaded ${(fallbackData.profiles || []).length} existing profiles`)

          if (profileTags.length === 0) {
            initializeProfileTags(fallbackData.profiles || [])
          }
        } else {
          console.warn('Invalid profile data received from fallback:', fallbackData)
          setProfiles([])
        }
        return
      }

      const data = await response.json()
      console.log('📋 Profile discovery response:', data)

      if (data.success && Array.isArray(data.profiles)) {
        setProfiles(data.profiles || [])
        console.log(`✅ Discovered ${(data.profiles || []).length} profiles`)

        if (profileTags.length === 0) {
          initializeProfileTags(data.profiles || [])
        }
      } else {
        console.warn('Invalid profile data received from discovery:', data)
        // Try to generate fallback profiles if discovery returns no profiles
        if (!data.profiles || data.profiles.length === 0) {
          console.log('Generating fallback profiles for device...')
          const fallbackProfiles = [
            {
              id: 'profile1',
              token: 'profile1',
              name: 'Main Profile',
              video_profiles: [{
                name: 'Main Profile',
                token: 'profile1',
                resolution: '1280x720',
                fps: 25,
                codec: 'H.264',
                bitrate: 2000,
                width: 1280,
                height: 720
              }],
              quality_level: 'High',
              category: 'Main',
              ptz_supported: false,
              audio_supported: true
            },
            {
              id: 'profile2',
              token: 'profile2',
              name: 'Secondary Profile',
              video_profiles: [{
                name: 'Secondary Profile',
                token: 'profile2',
                resolution: '640x480',
                fps: 15,
                codec: 'H.264',
                bitrate: 1000,
                width: 640,
                height: 480
              }],
              quality_level: 'Medium',
              category: 'Secondary',
              ptz_supported: false,
              audio_supported: false
            }
          ]
          setProfiles(fallbackProfiles)
          initializeProfileTags(fallbackProfiles)
        } else {
          setProfiles([])
        }
      }

    } catch (error: any) {
      console.error('❌ Failed to load device profiles:', error)
      setError(error.message || 'Failed to load profiles')
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }

  const initializeProfileTags = (profileList: DeviceProfile[]) => {
    const defaultTags: ProfileTag[] = profileList.map((profile, index) => ({
      profile_id: profile.id,
      tag: profile.category || `Profile ${index + 1}`
    }))
    setProfileTags(defaultTags)
  }

  const updateProfileTag = (profileId: string, newTag: string) => {
    setProfileTags(prev =>
      prev.map(tag =>
        tag.profile_id === profileId
          ? { ...tag, tag: newTag }
          : tag
      )
    )
  }

  const getProfileTag = (profileId: string) => {
    return profileTags.find(tag => tag.profile_id === profileId)?.tag || ''
  }

  const saveProfileConfiguration = async () => {
    if (!isValidDevice) return

    setSaving(true)
    setError(null)

    try {
      console.log('💾 Saving profile configuration...')
      console.log('💾 Profile tags to save:', profileTags)

      const response = await fetch(`http://localhost:3001/api/devices/${device.id}/profiles/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_tags: profileTags,
          device_id: device.id
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to save profile configuration: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Profile configuration saved:', result)

      // Notify parent component of successful configuration
      if (onProfilesConfigured && device?.id) {
        onProfilesConfigured(device.id)
      }

      // Close dialog on successful save
      onOpenChange(false)

    } catch (error: any) {
      console.error('❌ Failed to save profile configuration:', error)
      setError(error.message || 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const getQualityBadgeColor = (quality: string) => {
    switch (quality?.toLowerCase()) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-orange-100 text-orange-800 border-orange-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <ProfileDialogErrorBoundary>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 p-6 pb-0">
            <DialogTitle className="flex items-center space-x-2">
              <Camera className="w-5 h-5" />
              <span>Profile Management</span>
            </DialogTitle>
            <DialogDescription>
              Configure streaming and recording profiles for <strong>{device.name}</strong> ({device.ip_address})
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-6 p-6">
                {/* Device Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <Monitor className="w-5 h-5" />
                      <span>Device Information</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Name:</span>
                        <div>{device.name}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">IP:</span>
                        <div>{device.ip_address}:{device.port}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Manufacturer:</span>
                        <div>{device.manufacturer}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Status:</span>
                        <div className="flex items-center space-x-1">
                          {device.authenticated ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-green-600">Authenticated</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangleIcon className="w-4 h-4 text-orange-500" />
                              <span className="text-orange-600">Not Authenticated</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Loading State */}
                {loading && (
                  <Card>
                    <CardContent className="flex items-center justify-center py-8">
                      <div className="flex items-center space-x-3">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Loading device profiles...</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Error State */}
                {error && (
                  <Alert variant="destructive">
                    <AlertTriangleIcon className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Error loading profiles:</strong> {error}
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={loadDeviceProfiles}
                          className="text-xs"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Profiles */}
                {!loading && !error && profiles.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium flex items-center space-x-2">
                        <Video className="w-5 h-5" />
                        <span>Profiles ({profiles.length})</span>
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadDeviceProfiles}
                        disabled={loading}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                      </Button>
                    </div>

                    <div className="grid gap-4">
                      {profiles.map((profile, index) => (
                        <Card key={profile.id || index} className="hover:shadow-md transition-shadow">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base flex items-center space-x-2">
                                <Play className="w-4 h-4" />
                                <span>{profile.name || `Profile ${index + 1}`}</span>
                              </CardTitle>
                              <div className="flex items-center space-x-2">
                                <Badge
                                  variant="outline"
                                  className={getQualityBadgeColor(profile.quality_level)}
                                >
                                  {profile.quality_level}
                                </Badge>
                                {profile.ptz_supported && (
                                  <Badge variant="secondary">PTZ</Badge>
                                )}
                                {profile.audio_supported && (
                                  <Badge variant="secondary">
                                    <AudioIcon className="w-3 h-3 mr-1" />
                                    Audio
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Profile Tag Input */}
                            <div className="space-y-2">
                              <Label htmlFor={`tag-${profile.id}`} className="flex items-center space-x-1">
                                <Tag className="w-3 h-3" />
                                <span>Profile Tag</span>
                              </Label>
                              <Input
                                id={`tag-${profile.id}`}
                                value={getProfileTag(profile.id)}
                                onChange={(e) => updateProfileTag(profile.id, e.target.value)}
                                placeholder="Enter profile tag (e.g., 'Main Camera', 'Recording')"
                                className="max-w-md"
                              />
                            </div>

                            {/* Video Profiles */}
                            {profile.video_profiles && profile.video_profiles.length > 0 && (
                              <div className="space-y-3">
                                <h4 className="font-medium text-sm flex items-center space-x-1">
                                  <Video className="w-4 h-4" />
                                  <span>Video Configuration</span>
                                </h4>

                                <div className="grid gap-3">
                                  {profile.video_profiles.map((videoProfile, vIndex) => (
                                    <div key={vIndex} className="p-3 bg-gray-50 rounded border">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                        <div>
                                          <span className="font-medium text-gray-600">Resolution:</span>
                                          <div className="flex items-center space-x-1">
                                            <Monitor className="w-3 h-3" />
                                            <span>{videoProfile.resolution}</span>
                                          </div>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-600">Frame Rate:</span>
                                          <div className="flex items-center space-x-1">
                                            <Zap className="w-3 h-3" />
                                            <span>{videoProfile.fps} fps</span>
                                          </div>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-600">Codec:</span>
                                          <div>{videoProfile.codec}</div>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-600">Bitrate:</span>
                                          <div className="flex items-center space-x-1">
                                            <Signal className="w-3 h-3" />
                                            <span>{videoProfile.bitrate} kbps</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Profiles State */}
                {!loading && !error && profiles.length === 0 && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Video className="w-16 h-16 text-gray-400 mb-4" />
                      <h3 className="text-xl font-medium text-gray-900 mb-2">No Profiles Found</h3>
                      <p className="text-gray-600 text-center mb-6 max-w-md">
                        No ONVIF profiles were discovered for this device. This could indicate:
                      </p>
                      <ul className="text-sm text-gray-600 space-y-1 mb-6">
                        <li>• Device may not support ONVIF Media profiles</li>
                        <li>• Authentication issues preventing profile access</li>
                        <li>• Network connectivity problems</li>
                      </ul>
                      <Button onClick={loadDeviceProfiles} disabled={loading}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Footer Actions */}
          {profiles.length > 0 && (
            <div className="flex-shrink-0 flex items-center justify-between space-x-3 p-6 border-t bg-gray-50">
              <div className="text-sm text-gray-600">
                Configure profile tags for recording and streaming identification
              </div>
              <div className="flex space-x-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  onClick={saveProfileConfiguration}
                  disabled={saving || profileTags.length === 0}
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Save Configuration
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ProfileDialogErrorBoundary>
  )
}