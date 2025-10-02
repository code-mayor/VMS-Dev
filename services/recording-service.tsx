export interface AutoRecordingSettings {
  enabled: boolean
  chunkDuration: number // minutes
  quality: string
  maxStorage: number // GB
  retentionPeriod: number // days
  enabledDevices: string[]
}

export interface RecordingSchedule {
  id?: string
  name: string
  enabled: boolean
  daysOfWeek: number[] // 0=Sunday, 6=Saturday
  startTime: string // HH:MM format
  endTime: string // HH:MM format
  quality: 'low' | 'medium' | 'high'
  chunkDuration: number // minutes
  deviceIds: string[] // empty = all enabled devices
  priority: number
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface ScheduleConflict {
  scheduleId: string
  scheduleName: string
  priority: number
  startTime: string
  endTime: string
  willOverride: boolean
}

class RecordingService {
  private baseUrl = 'http://localhost:3001/api'

  async getAutoRecordingSettings(): Promise<AutoRecordingSettings> {
    try {
      console.log('📖 Getting auto-recording settings...')

      const response = await fetch(`${this.baseUrl}/recordings/auto-settings`)

      if (!response.ok) {
        console.warn(`⚠️ Failed to get settings: ${response.status}, using defaults`)
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
      return data

    } catch (error: any) {
      console.error('❌ Failed to get auto-recording settings:', error)
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
        body: JSON.stringify(settings)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to update settings: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Settings updated successfully:', data)
      return data

    } catch (error: any) {
      console.error('❌ Failed to update auto-recording settings:', error)
      throw error
    }
  }

  // ===== Schedule Management Methods =====

  async getSchedules(page = 1, limit = 50, enabled?: boolean, deviceId?: string): Promise<{
    schedules: RecordingSchedule[]
    pagination: { page: number; limit: number; total: number; pages: number }
  }> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      })

      if (enabled !== undefined) params.append('enabled', enabled.toString())
      if (deviceId) params.append('deviceId', deviceId)

      const response = await fetch(`${this.baseUrl}/schedules?${params}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch schedules: ${response.status}`)
      }

      const data = await response.json()
      return {
        schedules: data.schedules || [],
        pagination: data.pagination
      }

    } catch (error: any) {
      console.error('❌ Failed to fetch schedules:', error)
      throw error
    }
  }

  async getSchedule(scheduleId: string): Promise<RecordingSchedule> {
    try {
      const response = await fetch(`${this.baseUrl}/schedules/${scheduleId}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch schedule: ${response.status}`)
      }

      const data = await response.json()
      return data.schedule

    } catch (error: any) {
      console.error('❌ Failed to fetch schedule:', error)
      throw error
    }
  }

  async createSchedule(schedule: Omit<RecordingSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<RecordingSchedule> {
    try {
      console.log('📅 Creating schedule:', schedule)

      const response = await fetch(`${this.baseUrl}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(schedule)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to create schedule: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Schedule created:', data.schedule)
      return data.schedule

    } catch (error: any) {
      console.error('❌ Failed to create schedule:', error)
      throw error
    }
  }

  async updateSchedule(scheduleId: string, updates: Partial<RecordingSchedule>): Promise<RecordingSchedule> {
    try {
      console.log('📝 Updating schedule:', scheduleId, updates)

      const response = await fetch(`${this.baseUrl}/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to update schedule: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Schedule updated:', data.schedule)
      return data.schedule

    } catch (error: any) {
      console.error('❌ Failed to update schedule:', error)
      throw error
    }
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    try {
      console.log('🗑️ Deleting schedule:', scheduleId)

      const response = await fetch(`${this.baseUrl}/schedules/${scheduleId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to delete schedule: ${response.status}`)
      }

      console.log('✅ Schedule deleted successfully')

    } catch (error: any) {
      console.error('❌ Failed to delete schedule:', error)
      throw error
    }
  }

  async checkScheduleConflicts(schedule: {
    scheduleId?: string
    daysOfWeek: number[]
    startTime: string
    endTime: string
    deviceIds: string[]
    priority: number
  }): Promise<{ hasConflicts: boolean; conflicts: ScheduleConflict[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/schedules/check-conflicts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(schedule)
      })

      if (!response.ok) {
        throw new Error(`Failed to check conflicts: ${response.status}`)
      }

      const data = await response.json()
      return {
        hasConflicts: data.hasConflicts,
        conflicts: data.conflicts || []
      }

    } catch (error: any) {
      console.error('❌ Failed to check conflicts:', error)
      return { hasConflicts: false, conflicts: [] }
    }
  }

  async getActiveSchedules(): Promise<RecordingSchedule[]> {
    try {
      const response = await fetch(`${this.baseUrl}/schedules/active/now`)

      if (!response.ok) {
        throw new Error(`Failed to fetch active schedules: ${response.status}`)
      }

      const data = await response.json()
      return data.activeSchedules || []

    } catch (error: any) {
      console.error('❌ Failed to fetch active schedules:', error)
      return []
    }
  }

  async getScheduleLogs(scheduleId: string, page = 1, limit = 100) {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      })

      const response = await fetch(`${this.baseUrl}/schedules/${scheduleId}/logs?${params}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch schedule logs: ${response.status}`)
      }

      return await response.json()

    } catch (error: any) {
      console.error('❌ Failed to fetch schedule logs:', error)
      throw error
    }
  }

  // ===== Existing Recording Methods =====

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