import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Alert, AlertDescription } from './ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Switch } from './ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { 
  AlertTriangle, 
  Plus,
  Settings,
  Bell,
  Clock,
  Camera,
  Activity,
  Zap,
  Mail,
  Smartphone,
  Eye,
  Play,
  Pause,
  Edit,
  Trash2,
  Calendar
} from 'lucide-react'

interface CustomEvent {
  id: string
  name: string
  description: string
  trigger_type: 'motion' | 'schedule' | 'manual' | 'device_offline' | 'storage_full'
  conditions: any
  actions: any[]
  enabled: boolean
  created_at: string
  last_triggered?: string
  trigger_count: number
}

interface EventTemplate {
  id: string
  name: string
  description: string
  icon: React.ElementType
  trigger_type: string
  default_conditions: any
  default_actions: any[]
}

export function CustomEvent() {
  const [events, setEvents] = useState<CustomEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CustomEvent | null>(null)

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_type: 'motion' as const,
    conditions: {},
    actions: [] as any[],
    enabled: true
  })

  const eventTemplates: EventTemplate[] = [
    {
      id: 'motion_recording',
      name: 'Motion Detection Recording',
      description: 'Start recording when motion is detected',
      icon: Activity,
      trigger_type: 'motion',
      default_conditions: {
        sensitivity: 'medium',
        detection_zones: 'all',
        min_duration: 2
      },
      default_actions: [
        { type: 'start_recording', duration: 300 },
        { type: 'send_notification', message: 'Motion detected on {device_name}' }
      ]
    },
    {
      id: 'scheduled_snapshot',
      name: 'Scheduled Snapshots',
      description: 'Take snapshots at regular intervals',
      icon: Camera,
      trigger_type: 'schedule',
      default_conditions: {
        schedule: 'daily',
        time: '12:00',
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      },
      default_actions: [
        { type: 'take_snapshot' },
        { type: 'save_to_storage', location: 'snapshots' }
      ]
    },
    {
      id: 'device_offline_alert',
      name: 'Device Offline Alert',
      description: 'Alert when a device goes offline',
      icon: AlertTriangle,
      trigger_type: 'device_offline',
      default_conditions: {
        timeout: 300,
        retry_count: 3
      },
      default_actions: [
        { type: 'send_email', subject: 'Device Offline: {device_name}' },
        { type: 'log_event', level: 'warning' }
      ]
    },
    {
      id: 'storage_cleanup',
      name: 'Storage Cleanup',
      description: 'Clean old recordings when storage is full',
      icon: Settings,
      trigger_type: 'storage_full',
      default_conditions: {
        threshold: 90,
        check_interval: 3600
      },
      default_actions: [
        { type: 'delete_old_recordings', keep_days: 30 },
        { type: 'send_notification', message: 'Storage cleanup completed' }
      ]
    }
  ]

  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    try {
      setLoading(true)
      // For now, use mock data since the backend endpoint doesn't exist yet
      const mockEvents: CustomEvent[] = [
        {
          id: '1',
          name: 'Front Door Motion Recording',
          description: 'Records when motion is detected at the front door',
          trigger_type: 'motion',
          conditions: { sensitivity: 'high', detection_zones: 'front_door' },
          actions: [
            { type: 'start_recording', duration: 300 },
            { type: 'send_notification' }
          ],
          enabled: true,
          created_at: new Date().toISOString(),
          last_triggered: new Date(Date.now() - 3600000).toISOString(),
          trigger_count: 15
        },
        {
          id: '2',  
          name: 'Daily Backup Snapshots',
          description: 'Takes snapshots of all cameras at midnight',
          trigger_type: 'schedule',
          conditions: { schedule: 'daily', time: '00:00' },
          actions: [
            { type: 'take_snapshot' },
            { type: 'save_to_storage' }
          ],
          enabled: true,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          last_triggered: new Date(Date.now() - 7200000).toISOString(),
          trigger_count: 7
        }
      ]
      setEvents(mockEvents)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const newEvent: CustomEvent = {
        id: Date.now().toString(),
        ...formData,
        created_at: new Date().toISOString(),
        trigger_count: 0
      }
      
      setEvents(prev => [...prev, newEvent])
      setShowCreateDialog(false)
      setFormData({
        name: '',
        description: '',
        trigger_type: 'motion',
        conditions: {},
        actions: [],
        enabled: true
      })
    } catch (err: any) {
      setError(err.message)
    }
  }

  const toggleEventStatus = async (eventId: string, enabled: boolean) => {
    setEvents(prev => prev.map(event => 
      event.id === eventId ? { ...event, enabled } : event
    ))
  }

  const deleteEvent = async (eventId: string) => {
    if (confirm('Are you sure you want to delete this event?')) {
      setEvents(prev => prev.filter(event => event.id !== eventId))
    }
  }

  const useTemplate = (template: EventTemplate) => {
    setFormData({
      name: template.name,
      description: template.description,
      trigger_type: template.trigger_type as any,
      conditions: template.default_conditions,
      actions: template.default_actions,
      enabled: true
    })
    setShowCreateDialog(true)
  }

  const getTriggerIcon = (type: string) => {
    switch (type) {
      case 'motion': return <Activity className="w-4 h-4" />
      case 'schedule': return <Clock className="w-4 h-4" />
      case 'manual': return <Play className="w-4 h-4" />
      case 'device_offline': return <AlertTriangle className="w-4 h-4" />
      case 'storage_full': return <Settings className="w-4 h-4" />
      default: return <Zap className="w-4 h-4" />
    }
  }

  const getTriggerBadgeVariant = (type: string) => {
    switch (type) {
      case 'motion': return 'default'
      case 'schedule': return 'secondary'
      case 'manual': return 'outline'
      case 'device_offline': return 'destructive'
      case 'storage_full': return 'secondary'
      default: return 'outline'
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleString()
  }

  const formatLastTriggered = (dateString?: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Custom Events</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Configure automated actions based on triggers and conditions
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <Badge variant="outline">
              {events.filter(e => e.enabled).length} Active
            </Badge>
            <Badge variant="secondary">
              {events.length} Total
            </Badge>
            
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Custom Event</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateEvent} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Event Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="trigger_type">Trigger Type</Label>
                      <Select value={formData.trigger_type} onValueChange={(value: any) => setFormData({ ...formData, trigger_type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="motion">Motion Detection</SelectItem>
                          <SelectItem value="schedule">Schedule</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="device_offline">Device Offline</SelectItem>
                          <SelectItem value="storage_full">Storage Full</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={formData.enabled}
                      onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
                    />
                    <Label>Enable event immediately</Label>
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Create Event</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex-shrink-0 p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Event Templates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="w-5 h-5" />
                <span>Event Templates</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {eventTemplates.map((template) => {
                  const Icon = template.icon
                  return (
                    <Card key={template.id} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Icon className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate">{template.name}</h4>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 mb-3">{template.description}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => useTemplate(template)}
                          className="w-full text-xs"
                        >
                          Use Template
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Events Table */}
          <Card>
            <CardHeader>
              <CardTitle>Active Events</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Triggered</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{event.name}</div>
                          <div className="text-sm text-gray-500">{event.description}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTriggerBadgeVariant(event.trigger_type)} className="flex items-center space-x-1 w-fit">
                          {getTriggerIcon(event.trigger_type)}
                          <span className="capitalize">{event.trigger_type.replace('_', ' ')}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.enabled ? 'default' : 'secondary'}>
                          {event.enabled ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatLastTriggered(event.last_triggered)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.trigger_count}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleEventStatus(event.id, !event.enabled)}
                          >
                            {event.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingEvent(event)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteEvent(event.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {events.length === 0 && (
                <div className="text-center py-12">
                  <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="font-medium text-gray-900 mb-2">No Events Configured</h3>
                  <p className="text-gray-600 mb-4">
                    Create custom events to automate your video management system.
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Event
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}