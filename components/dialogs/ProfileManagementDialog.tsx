import React, { useState, useEffect } from 'react'
import {
  RefreshCw,
  Camera,
  Monitor,
  CheckCircle,
  AlertTriangle,
  Video,
  Zap,
  Tag,
  Play,
  Signal,
  Waves,
  Mic,
  X
} from 'lucide-react'

interface ProfileManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: {
    id: string
    name: string
    ip_address: string
    port: number
    manufacturer: string
    model: string
    authenticated?: boolean
  } | null
  onProfilesConfigured?: (deviceId: string) => void
}

// Simple dialog component
const Dialog = ({ open, onClose, children }) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-6xl max-h-[90vh] w-full mx-4 flex flex-col">
        {children}
      </div>
    </div>
  )
}

// Simple card component
const Card = ({ children, className = '' }) => (
  <div className={`bg-white border rounded-lg ${className}`}>
    {children}
  </div>
)

const CardHeader = ({ children, className = '' }) => (
  <div className={`px-6 py-4 border-b ${className}`}>
    {children}
  </div>
)

const CardContent = ({ children, className = '' }) => (
  <div className={`px-6 py-4 ${className}`}>
    {children}
  </div>
)

const CardTitle = ({ children, className = '' }) => (
  <h3 className={`font-semibold ${className}`}>
    {children}
  </h3>
)

// Simple button component
const Button = ({ children, onClick, variant = 'primary', size = 'md', disabled = false, className = '' }) => {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    outline: 'border border-gray-300 hover:bg-gray-50',
    destructive: 'bg-red-600 hover:bg-red-700 text-white'
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3'
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        rounded-md font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {children}
    </button>
  )
}

// Simple badge component
const Badge = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-gray-100 text-gray-800',
    secondary: 'bg-blue-100 text-blue-800',
    outline: 'border border-gray-300'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

// Simple alert component
const Alert = ({ children, variant = 'default' }) => {
  const variants = {
    default: 'bg-blue-50 text-blue-800 border-blue-200',
    destructive: 'bg-red-50 text-red-800 border-red-200'
  }

  return (
    <div className={`p-4 rounded-lg border ${variants[variant]}`}>
      {children}
    </div>
  )
}

// Main component
export function ProfileManagementDialog({
  open,
  onOpenChange,
  device,
  onProfilesConfigured
}: ProfileManagementDialogProps) {
  const [profiles, setProfiles] = useState([])
  const [profileTags, setProfileTags] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && device) {
      loadDeviceProfiles()
      loadProfileAssignments() // Load saved tags
    }
  }, [open, device])

  const loadDeviceProfiles = async () => {
    if (!device) return

    setLoading(true)
    setError(null)

    try {
      // Fetch actual profiles from the API
      const response = await fetch(`http://localhost:3001/api/devices/${device.id}/profiles`)

      if (!response.ok) {
        throw new Error('Failed to load profiles')
      }

      const data = await response.json()

      if (data.success && data.profiles) {
        setProfiles(data.profiles)
        // Don't initialize tags here - load them separately
      } else {
        // Fallback to discovery if no profiles exist
        const discoverResponse = await fetch(`http://localhost:3001/api/devices/${device.id}/profiles/discover`, {
          method: 'POST'
        })

        if (discoverResponse.ok) {
          const discoverData = await discoverResponse.json()
          if (discoverData.profiles) {
            setProfiles(discoverData.profiles)
          }
        }
      }
    } catch (err) {
      setError('Failed to load profiles')
      console.error('Error loading profiles:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadProfileAssignments = async () => {
    if (!device) return

    try {
      // Load saved profile assignments
      const response = await fetch(`http://localhost:3001/api/devices/${device.id}/profile-assignments`)

      if (response.ok) {
        const data = await response.json()

        if (data.success && data.profile_assignments && data.profile_assignments.length > 0) {
          console.log('📋 Loaded saved profile assignments:', data.profile_assignments)
          // Ensure profile_id consistency
          const mappedAssignments = data.profile_assignments.map(assignment => ({
            ...assignment,
            profile_id: assignment.profile_id || assignment.id
          }))
          setProfileTags(mappedAssignments)
        } else if (profiles.length > 0) {
          // Only initialize default tags if no saved assignments exist
          console.log('📋 No saved assignments, initializing defaults')
          initializeProfileTags(profiles)
        }
      }
    } catch (err) {
      console.error('Error loading profile assignments:', err)
      // Fall back to initialization if loading fails
      if (profiles.length > 0) {
        initializeProfileTags(profiles)
      }
    }
  }

  // Modified to only be called when no saved tags exist
  const initializeProfileTags = (profileList) => {
    const tags = profileList.map((profile, index) => ({
      profile_id: profile.id,
      tag: profile.name || `Profile ${index + 1}`,
      enabled_for_streaming: true,
      enabled_for_recording: index === 0
    }))
    setProfileTags(tags)
  }

  // Effect to load assignments after profiles are loaded
  useEffect(() => {
    if (profiles.length > 0 && profileTags.length === 0) {
      loadProfileAssignments()
    }
  }, [profiles])

  const updateProfileTag = (profileId, field, value) => {
    setProfileTags(prev =>
      prev.map(tag =>
        tag.profile_id === profileId
          ? { ...tag, [field]: value }
          : tag
      )
    )
  }

  const getProfileTag = (profileId) => {
    return profileTags.find(tag => tag.profile_id === profileId) || {
      profile_id: profileId,
      tag: '',
      enabled_for_streaming: false,
      enabled_for_recording: false
    }
  }

  const saveProfileConfiguration = async () => {
    if (!device) return

    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`http://localhost:3001/api/devices/${device.id}/configure-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_tags: profileTags
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save configuration')
      }

      const result = await response.json()
      console.log('✅ Profile configuration saved:', result)

      // Notify parent component to refresh device list
      if (onProfilesConfigured) {
        onProfilesConfigured(device.id)
      }

      // Show success message briefly before closing
      setTimeout(() => {
        onOpenChange(false)
      }, 1000)

    } catch (err) {
      setError('Failed to save configuration')
      console.error('Error saving profile configuration:', err)
    } finally {
      setSaving(false)
    }
  }

  const getQualityBadgeColor = (quality) => {
    const q = quality?.toLowerCase() || ''
    if (q.includes('high')) return 'bg-green-100 text-green-800 border-green-200'
    if (q.includes('medium')) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    if (q.includes('low')) return 'bg-orange-100 text-orange-800 border-orange-200'
    return 'bg-gray-100 text-gray-800 border-gray-200'
  }

  if (!device) {
    return (
      <Dialog open={open} onClose={() => onOpenChange(false)}>
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-2">Profile Management</h2>
          <p className="text-gray-600">Please select a device to configure profiles.</p>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Profile Management
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure streaming and recording profiles for <strong>{device.name}</strong> ({device.ip_address})
          </p>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Device Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Device Information
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
                <div>{device.ip_address}:{device.port || 80}</div>
              </div>
              <div>
                <span className="font-medium text-gray-600">Manufacturer:</span>
                <div>{device.manufacturer || 'Unknown'}</div>
              </div>
              <div>
                <span className="font-medium text-gray-600">Status:</span>
                <div className="flex items-center gap-1">
                  {device.authenticated ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-600">Authenticated</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
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
            <CardContent className="py-8">
              <div className="flex items-center justify-center gap-3">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Loading device profiles...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && !loading && (
          <Alert variant="destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 mt-0.5" />
              <div className="flex-1">
                <div>{error}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDeviceProfiles}
                  className="mt-2"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Profiles */}
        {!loading && profiles.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Video className="w-5 h-5" />
                Profiles ({profiles.length})
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadDeviceProfiles()
                  loadProfileAssignments()
                }}
                disabled={loading}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>

            {profiles.map((profile, index) => {
              const profileTag = getProfileTag(profile.id)

              return (
                <Card key={profile.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Play className="w-4 h-4" />
                        {profile.name || `Profile ${index + 1}`}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge className={getQualityBadgeColor(profile.quality_level)}>
                          {profile.quality_level || 'Standard'}
                        </Badge>
                        {profile.ptz_supported && <Badge variant="secondary">PTZ</Badge>}
                        {profile.audio_supported && (
                          <Badge variant="secondary">
                            <Waves className="w-3 h-3 mr-1" />
                            Audio
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Profile Configuration */}
                    <div className="space-y-4">
                      <div>
                        <label className="flex items-center gap-1 text-sm font-medium mb-1">
                          <Tag className="w-3 h-3" />
                          Profile Tag
                        </label>
                        <input
                          type="text"
                          value={profileTag.tag}
                          onChange={(e) => updateProfileTag(profile.id, 'tag', e.target.value)}
                          placeholder="Enter profile tag (e.g., Main, Sub, Recording)"
                          className="w-full max-w-md px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={profileTag.enabled_for_streaming}
                            onChange={(e) => updateProfileTag(profile.id, 'enabled_for_streaming', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">Enable for Streaming</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={profileTag.enabled_for_recording}
                            onChange={(e) => updateProfileTag(profile.id, 'enabled_for_recording', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">Enable for Recording</span>
                        </label>
                      </div>
                    </div>

                    {/* Video Details */}
                    {profile.video_profiles?.map((vp, vIndex) => (
                      <div key={vIndex} className="p-3 bg-gray-50 rounded border">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="font-medium text-gray-600">Resolution:</span>
                            <div className="flex items-center gap-1">
                              <Monitor className="w-3 h-3" />
                              {vp.resolution}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">Frame Rate:</span>
                            <div className="flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              {vp.fps} fps
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">Codec:</span>
                            <div>{vp.codec}</div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">Bitrate:</span>
                            <div className="flex items-center gap-1">
                              <Signal className="w-3 h-3" />
                              {vp.bitrate} kbps
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {profiles.length > 0 && (
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {profileTags.length > 0 && profileTags.some(t => t.tag) ? (
              <span className="text-green-600">
                ✓ {profileTags.filter(t => t.tag).length} profile(s) tagged
              </span>
            ) : (
              <span>Configure profile tags for recording and streaming identification</span>
            )}
          </div>
          <div className="flex gap-3">
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
    </Dialog>
  )
}

export default ProfileManagementDialog