import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Video, CheckCircle, Key, Play, Settings, Edit, Trash2, Tag } from 'lucide-react'
import { Device } from '../../types/device-types'
import { getStatusIcon, getStatusText, isDeviceAuthenticated } from '../../utils/device-helpers'
import { frontendOnvifService } from '../../services/frontend-onvif-service'

interface DeviceCardProps {
  device: Device
  onAuthenticate: (device: Device) => void
  onStream: (device: Device) => void
  onReauth: (device: Device) => void
  onEdit: (device: Device) => void
  onDelete: (deviceId: string) => void
}

export function DeviceCard({
  device,
  onAuthenticate,
  onStream,
  onReauth,
  onEdit,
  onDelete
}: DeviceCardProps) {
  const authenticated = isDeviceAuthenticated(device)
  const authStatus = frontendOnvifService.getAuthenticationStatus(device)
  const [profileTagStatus, setProfileTagStatus] = useState<{
    total: number
    tagged: number
    streaming: number
    recording: number
  } | null>(null)

  // Load profile tag status for authenticated devices
  useEffect(() => {
    if (authenticated && device.id) {
      loadProfileTagStatus()
    } else {
      setProfileTagStatus(null)
    }
  }, [authenticated, device.id])

  const loadProfileTagStatus = async () => {
    try {
      console.log(`🏷️ Loading profile tag status for device: ${device.id}`)
      
      // First, get the profiles
      const profilesResponse = await fetch(`http://localhost:3001/api/devices/${device.id}/profiles`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (profilesResponse.ok) {
        const profilesData = await profilesResponse.json()
        const profiles = profilesData.profiles || []
        
        // Then get profile assignments
        const assignmentsResponse = await fetch(`http://localhost:3001/api/devices/${device.id}/profile-assignments`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })

        let assignments = []
        if (assignmentsResponse.ok) {
          const assignmentsData = await assignmentsResponse.json()
          assignments = assignmentsData.profile_assignments || []
        }

        // Calculate tag status
        const taggedCount = assignments.length
        const streamingCount = assignments.filter(tag => tag.enabled_for_streaming).length
        const recordingCount = assignments.filter(tag => tag.enabled_for_recording).length

        const status = {
          total: profiles.length,
          tagged: taggedCount,
          streaming: streamingCount,
          recording: recordingCount
        }

        console.log(`🏷️ Profile tag status for ${device.name}:`, status)
        setProfileTagStatus(status)
      } else {
        console.warn(`⚠️ Failed to load profiles for device ${device.id}`)
        setProfileTagStatus(null)
      }

    } catch (error) {
      console.error('❌ Error loading profile tag status:', error)
      setProfileTagStatus(null)
    }
  }

  const getProfileTagBadge = () => {
    if (!profileTagStatus || profileTagStatus.total === 0) {
      return null
    }

    const hasTaggedProfiles = profileTagStatus.tagged > 0
    const hasStreamingProfiles = profileTagStatus.streaming > 0
    const hasRecordingProfiles = profileTagStatus.recording > 0

    if (!hasTaggedProfiles) {
      return (
        <Badge variant="outline" className="text-xs">
          <Tag className="w-3 h-3 mr-1" />
          No Tags
        </Badge>
      )
    }

    const tagText = `${profileTagStatus.tagged}/${profileTagStatus.total} Tagged`
    
    if (hasStreamingProfiles || hasRecordingProfiles) {
      return (
        <Badge variant="default" className="text-xs">
          <Tag className="w-3 h-3 mr-1" />
          {tagText}
        </Badge>
      )
    } else {
      return (
        <Badge variant="secondary" className="text-xs">
          <Tag className="w-3 h-3 mr-1" />
          {tagText}
        </Badge>
      )
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow min-h-[320px] flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <Video className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium truncate">{device.name}</span>
          </div>
          <div className="flex items-center space-x-1 flex-shrink-0">
            {getStatusIcon(device.status, authenticated)}
            <Badge variant={authenticated ? 'default' : 'secondary'}>
              {getStatusText(device.status, authenticated)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 flex-1 flex flex-col">
        <div className="text-sm space-y-1 flex-1">
          <div className="flex justify-between">
            <span className="text-gray-600">IP Address:</span>
            <span className="font-mono">{device.ip_address}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Manufacturer:</span>
            <span>{device.manufacturer}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Model:</span>
            <span>{device.model}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Profile:</span>
            <span>{device.onvif_profile}</span>
          </div>
          
          {/* Show authentication status from frontend ONVIF service */}
          {authStatus !== 'unknown' && (
            <div className="flex justify-between">
              <span className="text-gray-600">ONVIF Status:</span>
              <Badge variant={authStatus === 'valid' ? 'default' : 'destructive'} className="text-xs">
                {authStatus}
              </Badge>
            </div>
          )}

          {/* Show profile tag status for authenticated devices */}
          {authenticated && profileTagStatus && (
            <div className="flex justify-between">
              <span className="text-gray-600">Profile Tags:</span>
              {getProfileTagBadge()}
            </div>
          )}
        </div>

        {device.capabilities && (
          <div className="flex flex-wrap gap-1">
            {device.capabilities.ptz && (
              <Badge variant="outline" className="text-xs">PTZ</Badge>
            )}
            {device.capabilities.audio && (
              <Badge variant="outline" className="text-xs">Audio</Badge>
            )}
            {device.capabilities.video && (
              <Badge variant="outline" className="text-xs">Video</Badge>
            )}
            {device.capabilities.analytics && (
              <Badge variant="outline" className="text-xs">Analytics</Badge>
            )}
          </div>
        )}

        {/* Show profile streaming/recording status */}
        {authenticated && profileTagStatus && profileTagStatus.tagged > 0 && (
          <div className="flex flex-wrap gap-1">
            {profileTagStatus.streaming > 0 && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">
                {profileTagStatus.streaming} Streaming
              </Badge>
            )}
            {profileTagStatus.recording > 0 && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                {profileTagStatus.recording} Recording
              </Badge>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-auto pt-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => onAuthenticate(device)}
              className="flex-1"
              variant={authenticated ? "default" : "outline"}
            >
              {authenticated ? (
                <>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Select
                </>
              ) : (
                <>
                  <Key className="w-3 h-3 mr-1" />
                  Auth
                </>
              )}
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStream(device)}
              disabled={!authenticated}
              className="flex-1"
            >
              <Play className="w-3 h-3 mr-1" />
              Stream
            </Button>
          </div>
          
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onReauth(device)}
              className="flex-1"
            >
              <Settings className="w-3 h-3 mr-1" />
              Creds
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(device)}
              className="flex-1"
            >
              <Edit className="w-3 h-3 mr-1" />
              Edit
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(device.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}