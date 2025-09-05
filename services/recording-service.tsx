export interface AutoRecordingSettings {
  enabled: boolean
  chunkDuration: number // minutes
  quality: string
  maxStorage: number // GB
  retentionPeriod: number // days
  enabledDevices: string[]
}

class RecordingService {
  private baseUrl = 'http://localhost:3001/api'

  async getAutoRecordingSettings(): Promise<AutoRecordingSettings> {
    try {
      console.log('📖 Getting auto-recording settings...')
      
      const response = await fetch(`${this.baseUrl}/recordings/auto-settings`)
      
      if (!response.ok) {
        throw new Error(`Failed to get settings: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('📖 Retrieved settings:', data)
      
      return data.settings || {
        enabled: false,
        chunkDuration: 2,
        quality: 'medium',
        maxStorage: 100,
        retentionPeriod: 30,
        enabledDevices: []
      }
      
    } catch (error: any) {
      console.error('❌ Failed to get auto-recording settings:', error)
      throw error
    }
  }

  async updateAutoRecordingSettings(settings: AutoRecordingSettings): Promise<AutoRecordingSettings> {
    try {
      console.log('💾 Updating auto-recording settings:', settings)
      
      // If auto recording is being disabled, stop all active auto recordings first
      if (!settings.enabled) {
        console.log('⏹️ Auto recording disabled - stopping all active auto recordings')
        await this.stopAllAutoRecordings()
      }
      
      const response = await fetch(`${this.baseUrl}/recordings/auto-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to update settings: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('✅ Settings updated successfully:', data)
      
      // If auto recording is enabled, start recordings for enabled devices
      if (settings.enabled && settings.enabledDevices.length > 0) {
        console.log('🎬 Auto recording enabled - starting recordings for enabled devices')
        await this.startAutoRecordingsForDevices(settings.enabledDevices, settings)
      }
      
      return data.settings
      
    } catch (error: any) {
      console.error('❌ Failed to update auto-recording settings:', error)
      throw error
    }
  }

  private async stopAllAutoRecordings(): Promise<void> {
    try {
      console.log('⏹️ Stopping all active auto recordings...')
      
      // Get all active recordings
      const response = await fetch(`${this.baseUrl}/recordings/active`)
      if (response.ok) {
        const data = await response.json()
        const autoRecordings = data.activeRecordings?.filter((recording: any) => 
          recording.type === 'auto' || recording.type === 'auto-chunk'
        ) || []
        
        console.log(`⏹️ Found ${autoRecordings.length} active auto recordings to stop`)
        
        // Stop each auto recording
        for (const recording of autoRecordings) {
          try {
            const stopResponse = await fetch(`${this.baseUrl}/recordings/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recordingId: recording.recordingId })
            })
            
            if (stopResponse.ok) {
              console.log(`✅ Stopped auto recording: ${recording.recordingId}`)
            } else {
              console.warn(`⚠️ Failed to stop recording ${recording.recordingId}`)
            }
          } catch (error) {
            console.error(`❌ Error stopping recording ${recording.recordingId}:`, error)
          }
        }
      }
      
      // Also call the dedicated stop endpoint if available
      const stopAllResponse = await fetch(`${this.baseUrl}/recordings/auto/stop-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (stopAllResponse.ok) {
        console.log('✅ Called stop-all auto recordings endpoint')
      } else {
        console.warn('⚠️ Stop-all endpoint not available or failed')
      }
      
    } catch (error) {
      console.error('❌ Failed to stop all auto recordings:', error)
      // Don't throw - this is a cleanup operation
    }
  }

  private async startAutoRecordingsForDevices(deviceIds: string[], settings: AutoRecordingSettings): Promise<void> {
    try {
      console.log(`🎬 Starting auto recordings for ${deviceIds.length} devices`)
      
      for (const deviceId of deviceIds) {
        try {
          const response = await fetch(`${this.baseUrl}/recordings/auto/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId,
              chunkDuration: settings.chunkDuration,
              quality: settings.quality,
              type: 'auto'
            })
          })
          
          if (response.ok) {
            const data = await response.json()
            console.log(`✅ Started auto recording for device ${deviceId}:`, data.recordingId)
          } else {
            console.warn(`⚠️ Failed to start auto recording for device ${deviceId}`)
          }
        } catch (error) {
          console.error(`❌ Error starting auto recording for device ${deviceId}:`, error)
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to start auto recordings:', error)
      // Don't throw - partial success is acceptable
    }
  }

  async startRecording(deviceId: string, duration: number, quality: string, type: 'manual' | 'auto' = 'manual') {
    try {
      console.log(`🎬 Starting ${type} recording for device:`, deviceId)
      
      const response = await fetch(`${this.baseUrl}/recordings/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId,
          duration,
          quality,
          type
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to start recording: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Recording started:', data.recordingId)
      return data

    } catch (error: any) {
      console.error('❌ Failed to start recording:', error)
      throw error
    }
  }

  async stopRecording(recordingId: string) {
    try {
      console.log('⏹️ Stopping recording:', recordingId)
      
      const response = await fetch(`${this.baseUrl}/recordings/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recordingId })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to stop recording: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Recording stopped:', data.recording.id)
      return data

    } catch (error: any) {
      console.error('❌ Failed to stop recording:', error)
      throw error
    }
  }

  async getRecordings() {
    try {
      const response = await fetch(`${this.baseUrl}/recordings`)
      
      if (!response.ok) {
        throw new Error(`Failed to get recordings: ${response.status}`)
      }

      const data = await response.json()
      return data

    } catch (error: any) {
      console.error('❌ Failed to get recordings:', error)
      throw error
    }
  }

  async deleteRecording(recordingId: string) {
    try {
      console.log('🗑️ Deleting recording:', recordingId)
      
      const response = await fetch(`${this.baseUrl}/recordings/${recordingId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to delete recording: ${response.status}`)
      }

      console.log('✅ Recording deleted successfully')
      return true

    } catch (error: any) {
      console.error('❌ Failed to delete recording:', error)
      throw error
    }
  }
}

export const recordingService = new RecordingService()
export { RecordingService }