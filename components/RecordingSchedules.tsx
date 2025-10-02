import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import {
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react'
import { recordingService, RecordingSchedule, ScheduleConflict } from '../services/recording-service'
import { toast } from 'sonner'

interface Device {
  id: string
  name: string
  ip_address: string
  authenticated: boolean
  status: string
}

interface RecordingSchedulesProps {
  devices: Device[]
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', full: 'Sunday' },
  { value: 1, label: 'Mon', full: 'Monday' },
  { value: 2, label: 'Tue', full: 'Tuesday' },
  { value: 3, label: 'Wed', full: 'Wednesday' },
  { value: 4, label: 'Thu', full: 'Thursday' },
  { value: 5, label: 'Fri', full: 'Friday' },
  { value: 6, label: 'Sat', full: 'Saturday' }
]

export function RecordingSchedules({ devices }: RecordingSchedulesProps) {
  const [schedules, setSchedules] = useState<RecordingSchedule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<RecordingSchedule | null>(null)
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([])

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    daysOfWeek: [] as number[],
    startTime: '09:00',
    endTime: '17:00',
    quality: 'medium' as 'low' | 'medium' | 'high',
    chunkDuration: 5,
    deviceIds: [] as string[],
    priority: 0
  })

  useEffect(() => {
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
    try {
      setIsLoading(true)
      const result = await recordingService.getSchedules(1, 100)
      setSchedules(result.schedules)
    } catch (error: any) {
      console.error('Failed to load schedules:', error)
      toast.error('Failed to load schedules')
    } finally {
      setIsLoading(false)
    }
  }

  const checkConflicts = async () => {
    try {
      const result = await recordingService.checkScheduleConflicts({
        scheduleId: editingSchedule?.id,
        daysOfWeek: formData.daysOfWeek,
        startTime: formData.startTime,
        endTime: formData.endTime,
        deviceIds: formData.deviceIds,
        priority: formData.priority
      })
      setConflicts(result.conflicts)
    } catch (error) {
      console.error('Failed to check conflicts:', error)
    }
  }

  useEffect(() => {
    if (formData.daysOfWeek.length > 0 && formData.startTime && formData.endTime) {
      const timer = setTimeout(() => {
        checkConflicts()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [formData.daysOfWeek, formData.startTime, formData.endTime, formData.deviceIds, formData.priority])

  const handleOpenDialog = (schedule?: RecordingSchedule) => {
    if (schedule) {
      setEditingSchedule(schedule)
      setFormData({
        name: schedule.name,
        enabled: schedule.enabled,
        daysOfWeek: schedule.daysOfWeek,
        startTime: schedule.startTime.substring(0, 5), // Remove seconds
        endTime: schedule.endTime.substring(0, 5),
        quality: schedule.quality,
        chunkDuration: schedule.chunkDuration,
        deviceIds: schedule.deviceIds || [],
        priority: schedule.priority
      })
    } else {
      setEditingSchedule(null)
      setFormData({
        name: '',
        enabled: true,
        daysOfWeek: [1, 2, 3, 4, 5], // Weekdays by default
        startTime: '09:00',
        endTime: '17:00',
        quality: 'medium',
        chunkDuration: 5,
        deviceIds: [],
        priority: 0
      })
    }
    setConflicts([])
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingSchedule(null)
    setConflicts([])
  }

  const handleSaveSchedule = async () => {
    try {
      // Validation
      if (!formData.name.trim()) {
        toast.error('Schedule name is required')
        return
      }

      if (formData.daysOfWeek.length === 0) {
        toast.error('Please select at least one day')
        return
      }

      if (editingSchedule) {
        // Update existing schedule
        await recordingService.updateSchedule(editingSchedule.id!, formData)
        toast.success('Schedule updated successfully')
      } else {
        // Create new schedule
        await recordingService.createSchedule(formData)
        toast.success('Schedule created successfully')
      }

      handleCloseDialog()
      loadSchedules()
    } catch (error: any) {
      console.error('Failed to save schedule:', error)
      toast.error(error.message || 'Failed to save schedule')
    }
  }

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return
    }

    try {
      await recordingService.deleteSchedule(scheduleId)
      toast.success('Schedule deleted successfully')
      loadSchedules()
    } catch (error: any) {
      console.error('Failed to delete schedule:', error)
      toast.error('Failed to delete schedule')
    }
  }

  const handleToggleSchedule = async (schedule: RecordingSchedule) => {
    try {
      await recordingService.updateSchedule(schedule.id!, { enabled: !schedule.enabled })
      toast.success(schedule.enabled ? 'Schedule disabled' : 'Schedule enabled')
      loadSchedules()
    } catch (error: any) {
      console.error('Failed to toggle schedule:', error)
      toast.error('Failed to update schedule')
    }
  }

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day].sort()
    }))
  }

  const toggleAllDays = () => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6]
    }))
  }

  const toggleWeekdays = () => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: [1, 2, 3, 4, 5]
    }))
  }

  const toggleWeekends = () => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: [0, 6]
    }))
  }

  const formatDaysOfWeek = (days: number[]) => {
    if (days.length === 7) return 'Every day'
    if (days.length === 5 && days.every(d => [1, 2, 3, 4, 5].includes(d))) return 'Weekdays'
    if (days.length === 2 && days.every(d => [0, 6].includes(d))) return 'Weekends'
    
    const sortedDays = [...days].sort()
    return sortedDays.map(d => DAYS_OF_WEEK[d].label).join(', ')
  }

  const getDeviceNames = (deviceIds: string[]) => {
    if (!deviceIds || deviceIds.length === 0) return 'All devices'
    
    const names = deviceIds
      .map(id => devices.find(d => d.id === id)?.name || 'Unknown')
      .slice(0, 3)
    
    if (deviceIds.length > 3) {
      return `${names.join(', ')} +${deviceIds.length - 3} more`
    }
    return names.join(', ')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="w-5 h-5" />
                <span>Recording Schedules</span>
              </CardTitle>
              <CardDescription>
                Create time-based recording rules for specific days and hours
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              New Schedule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No authenticated cameras available. Please authenticate cameras in the Devices tab.
              </AlertDescription>
            </Alert>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No schedules configured</h3>
              <p className="text-gray-600 mb-4">
                Create your first recording schedule to automate recordings based on time and day
              </p>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Create Schedule
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="font-medium">{schedule.name}</h4>
                      {schedule.enabled ? (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-600">
                          <XCircle className="w-3 h-3 mr-1" />
                          Disabled
                        </Badge>
                      )}
                      {schedule.priority > 0 && (
                        <Badge variant="outline">
                          Priority {schedule.priority}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {formatDaysOfWeek(schedule.daysOfWeek)}
                      </div>
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-1" />
                        {schedule.startTime.substring(0, 5)} - {schedule.endTime.substring(0, 5)}
                      </div>
                      <div>
                        Quality: {schedule.quality}
                      </div>
                      <div>
                        {schedule.chunkDuration}min chunks
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Devices: {getDeviceNames(schedule.deviceIds)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={() => handleToggleSchedule(schedule)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(schedule)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSchedule(schedule.id!)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? 'Edit Schedule' : 'Create New Schedule'}
            </DialogTitle>
            <DialogDescription>
              Configure when recordings should automatically start and stop
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Schedule Name */}
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Schedule Name *</Label>
              <Input
                id="schedule-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Business Hours, Night Security"
              />
            </div>

            {/* Days of Week */}
            <div className="space-y-3">
              <Label>Days of Week *</Label>
              <div className="flex items-center space-x-2 mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleWeekdays}
                >
                  Weekdays
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleWeekends}
                >
                  Weekends
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleAllDays}
                >
                  {formData.daysOfWeek.length === 7 ? 'Clear All' : 'Select All'}
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <Button
                    key={day.value}
                    type="button"
                    variant={formData.daysOfWeek.includes(day.value) ? 'default' : 'outline'}
                    onClick={() => toggleDay(day.value)}
                    className="w-full"
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Time Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time *</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time *</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
            </div>

            {/* Recording Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Recording Quality</Label>
                <Select
                  value={formData.quality}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, quality: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (480p)</SelectItem>
                    <SelectItem value="medium">Medium (720p)</SelectItem>
                    <SelectItem value="high">High (1080p)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="chunk-duration">Chunk Duration (min)</Label>
                <Input
                  id="chunk-duration"
                  type="number"
                  min="1"
                  max="60"
                  value={formData.chunkDuration}
                  onChange={(e) => setFormData(prev => ({ ...prev, chunkDuration: parseInt(e.target.value) || 5 }))}
                />
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="priority">Priority (higher wins on conflicts)</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="100"
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-gray-500">
                When schedules overlap, higher priority takes precedence
              </p>
            </div>

            {/* Device Selection */}
            <div className="space-y-2">
              <Label>Target Devices</Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                <div className="flex items-center space-x-2 pb-2 border-b">
                  <input
                    type="checkbox"
                    checked={formData.deviceIds.length === 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData(prev => ({ ...prev, deviceIds: [] }))
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">All enabled devices</span>
                </div>
                {devices.map((device) => (
                  <div key={device.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.deviceIds.includes(device.id)}
                      onChange={(e) => {
                        setFormData(prev => ({
                          ...prev,
                          deviceIds: e.target.checked
                            ? [...prev.deviceIds, device.id]
                            : prev.deviceIds.filter(id => id !== device.id)
                        }))
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{device.name}</span>
                    <span className="text-xs text-gray-500">({device.ip_address})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Conflicts Warning */}
            {conflicts.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-2">Schedule Conflicts Detected:</div>
                  {conflicts.map((conflict, index) => (
                    <div key={index} className="text-sm mb-1">
                      • Overlaps with "{conflict.scheduleName}" ({conflict.startTime} - {conflict.endTime})
                      {conflict.willOverride && (
                        <span className="text-green-600 ml-2">(will override due to higher priority)</span>
                      )}
                      {!conflict.willOverride && (
                        <span className="text-orange-600 ml-2">(will be overridden by higher priority)</span>
                      )}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSaveSchedule}>
              {editingSchedule ? 'Update' : 'Create'} Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
