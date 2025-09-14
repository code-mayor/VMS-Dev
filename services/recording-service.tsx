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
        console.warn(`⚠️ Failed to get settings: ${response.status}, using defaults`)
        // Return defaults if server fails
        return {
          enabled: false,
          chunkDuration: 1,
          quality: 'medium',
          maxStorage: 30,
          retentionPeriod: 1,
          enabledDevices: []
        }
      }

      const data = await response.json()
      console.log('📖 Retrieved settings:', data)

      // The backend now returns settings directly, not wrapped
      return data

    } catch (error: any) {
      console.error('❌ Failed to get auto-recording settings:', error)
      // Return defaults on error
      return {
        enabled: false,
        chunkDuration: 1,
        quality: 'medium',
        maxStorage: 30,
        retentionPeriod: 1,
        enabledDevices: []
      }
    }
  }

  async updateAutoRecordingSettings(settings: AutoRecordingSettings): Promise<AutoRecordingSettings> {
    try {
      console.log('💾 Updating auto-recording settings:', settings)

      const response = await fetch(`${this.baseUrl}/recordings/auto-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings) // Send settings directly, not wrapped
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to update settings: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Settings updated successfully:', data)

      // The backend now returns settings directly
      return data

    } catch (error: any) {
      console.error('❌ Failed to update auto-recording settings:', error)
      throw error
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
      console.log('✅ Recording stopped:', data.recording?.id || recordingId)
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