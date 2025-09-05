import React from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  Camera,
  Settings,
  Users,
  Activity,
  AlertTriangle,
  Shield,
  Server,
  Zap
} from 'lucide-react'

interface MainNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function MainNavigation({ activeTab, onTabChange }: MainNavigationProps) {
  const navigationTabs = [
    {
      id: 'devices',
      label: 'Devices',
      icon: Camera,
      description: 'Device Management & Live View'
    },
    {
      id: 'applications',
      label: 'Applications',
      icon: Zap,
      description: 'System Applications'
    },
    {
      id: 'custom-event',
      label: 'Custom Event',
      icon: AlertTriangle,
      description: 'Event Configuration'
    },
    {
      id: 'user-management',
      label: 'User Management',
      icon: Users,
      description: 'User Accounts & Permissions'
    },
    {
      id: 'server-logs',
      label: 'Server Logs',
      icon: Server,
      description: 'System Logs & Diagnostics'
    },
    {
      id: 'health-check',
      label: 'Health Check',
      icon: Activity,
      description: 'System Health Monitoring'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      description: 'System Configuration'
    },
    {
      id: 'product-activation',
      label: 'Product Activation',
      icon: Shield,
      description: 'License Management'
    }
  ]

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-6">
        <div className="flex items-center space-x-1">
          {navigationTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            
            return (
              <Button
                key={tab.id}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => onTabChange(tab.id)}
                className={`
                  relative flex items-center space-x-2 px-4 py-2 rounded-t-lg rounded-b-none
                  ${isActive 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }
                `}
                title={tab.description}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
                
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"></div>
                )}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}