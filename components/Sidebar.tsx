import React from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  Search,
  Eye,
  Gamepad2,
  Video,
  Activity,
  AlertTriangle,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  TestTube,
  HardDrive
} from 'lucide-react'

interface SidebarProps {
  activeTab: string
  activeTask: string
  onTaskChange: (task: string) => void
  onAddDevice: () => void
  onEditDevice: () => void
  onDeleteDevice: () => void
  onRefreshStatus: () => void
}

export function Sidebar({
  activeTab,
  activeTask,
  onTaskChange,
  onAddDevice,
  onEditDevice,
  onDeleteDevice,
  onRefreshStatus
}: SidebarProps) {
  // Only show sidebar for devices tab
  if (activeTab !== 'devices') {
    return null
  }

  const deviceTasks = [
    {
      id: 'device-discovery',
      label: 'Device Discovery',
      icon: Search,
      description: 'Find ONVIF cameras on network'
    },
    {
      id: 'live-view',
      label: 'Live View',
      icon: Eye,
      description: 'View live camera streams'
    },
    {
      id: 'ptz-controls',
      label: 'PTZ Controls',
      icon: Gamepad2,
      description: 'Pan, tilt, zoom controls',
      badge: 'PTZ'
    },
    {
      id: 'auto-recording',
      label: 'Auto Recording',
      icon: HardDrive,
      description: 'Automatic recording with chunks'
    },
    {
      id: 'video-recording',
      label: 'Video Recording',
      icon: Video,
      description: 'Record and manage videos'
    },
    {
      id: 'motion-detection',
      label: 'Motion Detection',
      icon: Activity,
      description: 'Motion detection settings'
    },
    {
      id: 'camera-alerts',
      label: 'Camera Alerts',
      icon: AlertTriangle,
      description: 'Alert notifications',
      badge: '0'
    },
    {
      id: 'streaming-diagnostics',
      label: 'Streaming Diagnostics',
      icon: TestTube,
      description: 'RTSP connectivity testing'
    }
  ]

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Device Tasks */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Device Tasks</h3>
        <div className="space-y-1">
          {deviceTasks.map((task) => {
            const Icon = task.icon
            const isActive = activeTask === task.id

            return (
              <Button
                key={task.id}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => onTaskChange(task.id)}
                className={`w-full justify-start ${isActive
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                title={task.description}
              >
                <Icon className="w-4 h-4 mr-3" />
                <span className="flex-1 text-left">{task.label}</span>
                {task.badge && (
                  <Badge
                    variant={isActive ? "secondary" : "outline"}
                    className="text-xs ml-2"
                  >
                    {task.badge}
                  </Badge>
                )}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h3>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddDevice}
            className="w-full justify-start"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Device
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshStatus}
            className="w-full justify-start"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Status
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              console.log('🎥 Manual navigation to Live View triggered')
              onTaskChange('live-view')
            }}
            className="w-full justify-start"
          >
            <Eye className="w-4 h-4 mr-2" />
            Go to Live View
          </Button>
        </div>
      </div>

      {/* System Status */}
      <div className="p-4 flex-1">
        <h3 className="text-sm font-medium text-gray-900 mb-3">System Status</h3>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">ONVIF VMS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Backend</span>
              <Badge variant="default" className="text-xs">
                Connected
              </Badge>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Database</span>
              <Badge variant="default" className="text-xs">
                Active
              </Badge>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Discovery</span>
              <Badge variant="default" className="text-xs">
                Ready
              </Badge>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Streaming</span>
              <Badge variant="secondary" className="text-xs">
                Ready
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Device Actions */}
        <div className="mt-4 space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onEditDevice}
            className="w-full justify-start text-xs"
            disabled
          >
            <Settings className="w-3 h-3 mr-2" />
            Edit Device
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onDeleteDevice}
            className="w-full justify-start text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled
          >
            <Trash2 className="w-3 h-3 mr-2" />
            Delete Device
          </Button>
        </div>
      </div>
    </div>
  )
}