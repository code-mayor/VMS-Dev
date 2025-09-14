import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Alert, AlertDescription } from './ui/alert'
import { Progress } from './ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Checkbox } from './ui/checkbox'
import { toast } from 'sonner'
import { DeviceCard } from './cards/DeviceCard'
import { ManualAddDeviceDialog } from './dialogs'
import { DeviceAuthDialog } from './dialogs'
// import { ProfileManagementDialog } from './dialogs'
import ProfileManagementDialog from './dialogs/ProfileManagementDialog'
import {
  Search,
  RefreshCw,
  Camera,
  Network,
  Plus,
  CheckCircle,
  AlertTriangle,
  Info,
  Wifi,
  Globe,
  Settings,
  Zap,
  Router,
  Target,
  Lock,
  Unlock,
  Play,
  Clock,
  Tag,
  Filter,
  Eye,
  EyeOff,
  Download,
  Upload,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  Grid,
  List
} from 'lucide-react'

interface DiscoveredDevice {
  id: string
  name: string
  ip_address: string
  port: number
  manufacturer: string
  model: string
  discovery_method: string
  status: string
  capabilities: any
  discovered_at: string
  last_seen: string
  network_interface?: string
  authenticated?: boolean
  username?: string
  password?: string
  rtsp_username?: string
  rtsp_password?: string
  profiles_configured?: boolean
}

interface OptimizedDeviceDiscoveryProps {
  onDevicesDiscovered: (devices: DiscoveredDevice[]) => void
  skipAutoDiscoveryIfDevicesExist?: boolean
}

interface FilterState {
  search: string
  manufacturer: string
  status: string
  discoveryMethod: string
  authenticated: string
  showAdvanced: boolean
}

interface VirtualListItem {
  index: number
  device: DiscoveredDevice
  isVisible: boolean
}

const ITEMS_PER_PAGE = 50
const VIRTUAL_ROW_HEIGHT = 120

export function OptimizedDeviceDiscovery({ onDevicesDiscovered,
  skipAutoDiscoveryIfDevicesExist = true }: OptimizedDeviceDiscoveryProps) {
  // Persistent device state - this will prevent reset on navigation
  const [devices, setDevices] = useState<DiscoveredDevice[]>(() => {
    // Try to restore from sessionStorage
    const saved = sessionStorage.getItem('onvif-discovered-devices')
    return saved ? JSON.parse(saved) : []
  })

  const [filteredDevices, setFilteredDevices] = useState<DiscoveredDevice[]>([])
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveryProgress, setDiscoveryProgress] = useState(0)
  const [error, setError] = useState('')
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Dialog states
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [showProfileDialog, setShowProfileDialog] = useState(false)
  const [deviceToAuth, setDeviceToAuth] = useState<DiscoveredDevice | null>(null)
  const [deviceToConfigureProfiles, setDeviceToConfigureProfiles] = useState<DiscoveredDevice | null>(null)

  // Auto-discovery state
  const [autoDiscoveryTriggered, setAutoDiscoveryTriggered] = useState(false)
  const [discoveryStage, setDiscoveryStage] = useState('')

  // Bulk authentication state
  const [showBulkAuthDialog, setShowBulkAuthDialog] = useState(false)
  const [bulkCredentials, setBulkCredentials] = useState({
    username: '',
    password: '',
    rtsp_username: '',
    rtsp_password: ''
  })

  // Filter state - also persistent
  const [filters, setFilters] = useState<FilterState>(() => {
    const saved = sessionStorage.getItem('onvif-discovery-filters')
    return saved ? JSON.parse(saved) : {
      search: '',
      manufacturer: 'all',
      status: 'all',
      discoveryMethod: 'all',
      authenticated: 'all',
      showAdvanced: false
    }
  })

  // Persist devices to sessionStorage whenever they change
  useEffect(() => {
    if (devices.length > 0) {
      sessionStorage.setItem('onvif-discovered-devices', JSON.stringify(devices))
    }
  }, [devices])

  // Persist filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('onvif-discovery-filters', JSON.stringify(filters))
  }, [filters])

  // Auto-discovery on mount
  useEffect(() => {
    const initializeDiscovery = async () => {
      // First, try to load existing devices
      try {
        const response = await fetch('http://localhost:3001/api/devices')
        if (response.ok) {
          const data = await response.json()
          if (data.devices && data.devices.length > 0) {
            console.log(`📱 Found ${data.devices.length} existing devices`)
            setDevices(data.devices)
            onDevicesDiscovered(data.devices)

            // Only skip if the prop is true AND devices exist
            if (skipAutoDiscoveryIfDevicesExist) {
              setAutoDiscoveryTriggered(true)
              return // Skip auto-discovery
            }
          }
        }
      } catch (error) {
        console.warn('Could not check existing devices:', error)
      }

      // Auto-trigger discovery if not already triggered
      if (!autoDiscoveryTriggered) {
        console.log('🚀 Auto-triggering device discovery...')
        setAutoDiscoveryTriggered(true)
        setTimeout(() => handleDiscovery(true), 500)
      }
    }

    initializeDiscovery()
  }, []) // Empty deps = run once on mount

  const loadExistingDevices = async () => {
    try {
      console.log('🔄 Loading existing devices from backend...')
      const response = await fetch('http://localhost:3001/api/devices')

      if (response.ok) {
        const data = await response.json()
        const existingDevices = data.devices || []

        if (existingDevices.length > 0) {
          console.log(`✅ Loaded ${existingDevices.length} existing devices`)
          setDevices(existingDevices)
          onDevicesDiscovered(existingDevices)
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not load existing devices:', err)
    }
  }

  // Stats for large datasets
  const stats = useMemo(() => {
    const total = devices.length
    const authenticated = devices.filter(d => d.authenticated).length
    const manufacturers = new Set(devices.map(d => d.manufacturer)).size
    const online = devices.filter(d => d.status === 'discovered').length

    return { total, authenticated, manufacturers, online }
  }, [devices])

  // Advanced filtering with performance optimization
  const applyFilters = useCallback(() => {
    let filtered = devices

    // Text search (optimized with early exit)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(device =>
        device.name.toLowerCase().includes(searchLower) ||
        device.ip_address.includes(searchLower) ||
        device.manufacturer.toLowerCase().includes(searchLower) ||
        device.model.toLowerCase().includes(searchLower)
      )
    }

    // Other filters
    if (filters.manufacturer !== 'all') {
      filtered = filtered.filter(d => d.manufacturer === filters.manufacturer)
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter(d => d.status === filters.status)
    }

    if (filters.discoveryMethod !== 'all') {
      filtered = filtered.filter(d => d.discovery_method === filters.discoveryMethod)
    }

    if (filters.authenticated !== 'all') {
      const isAuth = filters.authenticated === 'authenticated'
      filtered = filtered.filter(d => Boolean(d.authenticated) === isAuth)
    }

    setFilteredDevices(filtered)
    setCurrentPage(1) // Reset to first page when filtering
  }, [devices, filters])

  // Apply filters when devices or filters change
  useEffect(() => {
    applyFilters()
  }, [applyFilters])

  // Pagination
  const paginatedDevices = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredDevices.slice(startIndex, endIndex)
  }, [filteredDevices, currentPage])

  const totalPages = Math.ceil(filteredDevices.length / ITEMS_PER_PAGE)

  // Get unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const manufacturers = [...new Set(devices.map(d => d.manufacturer))].filter(Boolean).sort()
    const statuses = [...new Set(devices.map(d => d.status))].filter(Boolean)
    const methods = [...new Set(devices.map(d => d.discovery_method))].filter(Boolean)

    return { manufacturers, statuses, methods }
  }, [devices])

  const handleDiscovery = async (isAutoDiscovery = false) => {
    setIsDiscovering(true)
    setDiscoveryProgress(0)
    setError('')

    // Set stage message based on discovery type
    setDiscoveryStage(isAutoDiscovery ? 'Auto-discovery starting...' : 'Manual discovery starting...')

    try {
      console.log('🔍 Starting optimized device discovery for large networks...')

      // Simulate realistic progress for large network scanning
      const progressStages = [
        { stage: 'Initializing network scan...', progress: 10 },
        { stage: 'ONVIF WS-Discovery broadcast...', progress: 25 },
        { stage: 'SSDP/UPnP discovery...', progress: 40 },
        { stage: 'Targeted IP range scanning...', progress: 60 },
        { stage: 'Device fingerprinting...', progress: 80 },
        { stage: 'Processing results...', progress: 95 }
      ]

      let currentStageIndex = 0
      const progressInterval = setInterval(() => {
        if (currentStageIndex < progressStages.length) {
          setDiscoveryProgress(progressStages[currentStageIndex].progress)
          currentStageIndex++
        }
      }, 2000)

      const response = await fetch('http://localhost:3001/api/devices/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      clearInterval(progressInterval)
      setDiscoveryProgress(100)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Discovery failed')
      }

      // Use real discovered devices
      let discoveredDevices = data.devices || []

      console.log(`✅ Discovery completed. Found ${discoveredDevices.length} devices`)

      setDevices(discoveredDevices)
      onDevicesDiscovered(discoveredDevices)

      toast.success(`Discovery completed! Found ${discoveredDevices.length} devices`)

    } catch (err: any) {
      console.error('❌ Discovery failed:', err)
      setError(err.message || 'Discovery failed')
      toast.error(`Discovery failed: ${err.message}`)
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleSelectDevice = (deviceId: string, selected: boolean) => {
    setSelectedDevices(prev => {
      const newSet = new Set(prev)
      if (selected) {
        newSet.add(deviceId)
      } else {
        newSet.delete(deviceId)
      }
      return newSet
    })
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedDevices(new Set(paginatedDevices.map(d => d.id)))
    } else {
      setSelectedDevices(new Set())
    }
  }

  // Enhanced bulk authentication functionality
  const handleBulkAuthenticate = async () => {
    if (selectedDevices.size === 0) {
      toast.error('No devices selected')
      return
    }

    const selectedDeviceList = devices.filter(d => selectedDevices.has(d.id))

    try {
      console.log(`🔐 Starting bulk authentication for ${selectedDeviceList.length} devices...`)

      let successCount = 0
      let failureCount = 0

      // Authenticate each selected device
      for (const device of selectedDeviceList) {
        try {
          const response = await fetch(`http://localhost:3001/api/devices/${device.id}/authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: bulkCredentials.username,
              password: bulkCredentials.password,
              rtsp_username: bulkCredentials.rtsp_username || bulkCredentials.username,
              rtsp_password: bulkCredentials.rtsp_password || bulkCredentials.password
            })
          })

          if (response.ok) {
            successCount++
            // Update device state
            setDevices(prev => prev.map(d =>
              d.id === device.id
                ? { ...d, authenticated: true, username: bulkCredentials.username, password: bulkCredentials.password }
                : d
            ))
          } else {
            failureCount++
            console.warn(`❌ Failed to authenticate ${device.name}:`, response.status)
          }
        } catch (err) {
          failureCount++
          console.error(`❌ Error authenticating ${device.name}:`, err)
        }
      }

      // Show results
      if (successCount > 0) {
        toast.success(`Successfully authenticated ${successCount} device${successCount !== 1 ? 's' : ''}`)
      }
      if (failureCount > 0) {
        toast.error(`Failed to authenticate ${failureCount} device${failureCount !== 1 ? 's' : ''}`)
      }

      // Clear selection and close dialog
      setSelectedDevices(new Set())
      setShowBulkAuthDialog(false)
      setBulkCredentials({ username: '', password: '', rtsp_username: '', rtsp_password: '' })

    } catch (err: any) {
      console.error('❌ Bulk authentication failed:', err)
      toast.error(`Bulk authentication failed: ${err.message}`)
    }
  }

  // Enhanced bulk profile configuration
  const handleBulkConfigureProfiles = async () => {
    if (selectedDevices.size === 0) {
      toast.error('No devices selected')
      return
    }

    const authenticatedSelected = devices.filter(d =>
      selectedDevices.has(d.id) && d.authenticated
    )

    if (authenticatedSelected.length === 0) {
      toast.error('No authenticated devices selected')
      return
    }

    try {
      console.log(`⚙️ Starting bulk profile configuration for ${authenticatedSelected.length} devices...`)

      let successCount = 0
      let failureCount = 0

      for (const device of authenticatedSelected) {
        try {
          const response = await fetch(`http://localhost:3001/api/devices/${device.id}/profiles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })

          if (response.ok) {
            successCount++
            // Update device state
            setDevices(prev => prev.map(d =>
              d.id === device.id
                ? { ...d, profiles_configured: true }
                : d
            ))
          } else {
            failureCount++
          }
        } catch (err) {
          failureCount++
          console.error(`❌ Error configuring profiles for ${device.name}:`, err)
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully configured profiles for ${successCount} device${successCount !== 1 ? 's' : ''}`)
      }
      if (failureCount > 0) {
        toast.error(`Failed to configure profiles for ${failureCount} device${failureCount !== 1 ? 's' : ''}`)
      }

      setSelectedDevices(new Set())

    } catch (err: any) {
      console.error('❌ Bulk profile configuration failed:', err)
      toast.error(`Bulk profile configuration failed: ${err.message}`)
    }
  }

  const exportDevices = () => {
    const dataStr = JSON.stringify(filteredDevices, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `onvif-devices-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // const renderDeviceCard = (device: DiscoveredDevice) => (
  //   <Card key={device.id} className="hover:shadow-md transition-shadow">
  //     <CardContent className="p-4">
  //       <div className="flex items-start justify-between">
  //         <div className="flex items-start space-x-3 flex-1 min-w-0">
  //           <Checkbox
  //             checked={selectedDevices.has(device.id)}
  //             onCheckedChange={(checked) => handleSelectDevice(device.id, checked as boolean)}
  //           />

  //           <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
  //             <Camera className="w-5 h-5 text-blue-600" />
  //           </div>

  //           <div className="flex-1 min-w-0">
  //             <div className="flex items-center space-x-2 mb-1">
  //               <h3 className="font-medium text-sm truncate">{device.name}</h3>
  //               <Badge variant="outline" className="text-xs">
  //                 {device.discovery_method.toUpperCase()}
  //               </Badge>
  //             </div>

  //             <div className="text-xs text-gray-600 space-y-0.5">
  //               <div className="truncate">
  //                 <strong>IP:</strong> {device.ip_address}:{device.port}
  //               </div>
  //               <div className="truncate">
  //                 <strong>Vendor:</strong> {device.manufacturer} {device.model}
  //               </div>
  //               <div className="flex items-center space-x-2 text-xs">
  //                 <Badge variant={device.status === 'discovered' ? 'default' : 'secondary'} className="text-xs">
  //                   {device.status}
  //                 </Badge>
  //                 {device.authenticated && (
  //                   <Badge variant="default" className="text-xs">
  //                     <CheckCircle className="w-3 h-3 mr-1" />
  //                     Auth
  //                   </Badge>
  //                 )}
  //               </div>
  //             </div>
  //           </div>
  //         </div>

  //         <div className="flex flex-col space-y-1 ml-3">
  //           {!device.authenticated ? (
  //             <Button
  //               size="sm"
  //               onClick={() => {
  //                 setDeviceToAuth(device)
  //                 setShowAuthDialog(true)
  //               }}
  //               className="text-xs px-3 py-1 h-auto"
  //             >
  //               <Lock className="w-3 h-3 mr-1" />
  //               Auth
  //             </Button>
  //           ) : (
  //             <div className="flex space-x-1">
  //               <Button
  //                 variant="outline"
  //                 size="sm"
  //                 onClick={() => {
  //                   setDeviceToAuth(device)
  //                   setShowAuthDialog(true)
  //                 }}
  //                 className="text-xs px-2 py-1 h-auto"
  //                 title="Update credentials"
  //               >
  //                 <Settings className="w-3 h-3" />
  //               </Button>
  //               <Button
  //                 variant={device.profiles_configured ? "default" : "secondary"}
  //                 size="sm"
  //                 onClick={() => {
  //                   setDeviceToConfigureProfiles(device)
  //                   setShowProfileDialog(true)
  //                 }}
  //                 className="text-xs px-2 py-1 h-auto"
  //                 title="Configure profiles"
  //               >
  //                 <Tag className="w-3 h-3" />
  //               </Button>
  //             </div>
  //           )}
  //         </div>
  //       </div>
  //     </CardContent>
  //   </Card>
  // )

  const renderDeviceCard = (device: DiscoveredDevice) => (
    <DeviceCard
      key={device.id}
      device={device}
      compact={true}
      isSelected={selectedDevices.has(device.id)}
      onSelectionChange={(checked) => handleSelectDevice(device.id, checked)}
      showSelection={true}
      onAuthenticate={() => {
        setDeviceToAuth(device)
        setShowAuthDialog(true)
      }}
      onConfigureProfiles={() => {
        setDeviceToConfigureProfiles(device)
        setShowProfileDialog(true)
      }}
    />
  )

  const renderDeviceRow = (device: DiscoveredDevice) => (
    <tr key={device.id} className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <Checkbox
          checked={selectedDevices.has(device.id)}
          onCheckedChange={(checked) => handleSelectDevice(device.id, checked as boolean)}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center space-x-2">
          <Camera className="w-4 h-4 text-blue-600" />
          <div>
            <div className="font-medium text-sm">{device.name}</div>
            <div className="text-xs text-gray-500">{device.ip_address}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm">{device.manufacturer}</div>
        <div className="text-xs text-gray-500">{device.model}</div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={device.status === 'discovered' ? 'default' : 'secondary'} className="text-xs">
          {device.status}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="text-xs">
          {device.discovery_method.toUpperCase()}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {device.authenticated ? (
          <Badge variant="default" className="text-xs">
            <CheckCircle className="w-3 h-3 mr-1" />
            Ready
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            Needs Auth
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex space-x-1">
          <Button
            size="sm"
            variant={device.authenticated ? "outline" : "default"}
            onClick={() => {
              setDeviceToAuth(device)
              setShowAuthDialog(true)
            }}
            className="text-xs px-2 py-1"
          >
            {device.authenticated ? <Settings className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          </Button>
          {device.authenticated && (
            <Button
              size="sm"
              variant={device.profiles_configured ? "default" : "secondary"}
              onClick={() => {
                setDeviceToConfigureProfiles(device)
                setShowProfileDialog(true)
              }}
              className="text-xs px-2 py-1"
            >
              <Tag className="w-3 h-3" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <Search className="w-5 h-5" />
              <span>Device Discovery</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Optimized for large networks • Supports 5000+ devices
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {stats.total > 0 && (
              <>
                <Badge variant="outline">{stats.total} Devices</Badge>
                <Badge variant="default">{stats.authenticated} Authenticated</Badge>
                <Badge variant="secondary">{stats.manufacturers} Vendors</Badge>
              </>
            )}

            <Button
              variant="outline"
              onClick={() => setShowManualAdd(true)}
              disabled={isDiscovering}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Manual
            </Button>

            <Button
              onClick={() => handleDiscovery(false)}
              disabled={isDiscovering}
              size="lg"
            >
              {isDiscovering ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  <span>Discovering...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  <span>Start Discovery</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Discovery Progress */}
      {isDiscovering && (
        <div className="flex-shrink-0 p-6 border-b border-gray-200">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Network Discovery Progress</span>
                  <span className="text-sm text-gray-500">{discoveryProgress}%</span>
                </div>
                <Progress value={discoveryProgress} className="w-full h-2" />
                <div className="text-sm text-gray-600">
                  Scanning large networks... This may take several minutes for 5000+ devices
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Advanced Filters */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search devices, IPs, manufacturers..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                />
              </div>

              <Select value={filters.manufacturer} onValueChange={(value) => setFilters(prev => ({ ...prev, manufacturer: value }))}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Manufacturers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Manufacturers</SelectItem>
                  {filterOptions.manufacturers.map((manufacturer) => (
                    <SelectItem key={manufacturer} value={manufacturer}>
                      {manufacturer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.authenticated} onValueChange={(value) => setFilters(prev => ({ ...prev, authenticated: value }))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="authenticated">Authenticated</SelectItem>
                  <SelectItem value="unauthenticated">Need Auth</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters(prev => ({ ...prev, showAdvanced: !prev.showAdvanced }))}
              >
                <Filter className="w-4 h-4 mr-2" />
                {filters.showAdvanced ? 'Hide' : 'Show'} Filters
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              >
                {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
              </Button>

              {selectedDevices.size > 0 && (
                <>
                  <Button size="sm" onClick={() => setShowBulkAuthDialog(true)}>
                    <Lock className="w-4 h-4 mr-2" />
                    Authenticate Selected ({selectedDevices.size})
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleBulkConfigureProfiles}>
                    <Settings className="w-4 h-4 mr-2" />
                    Configure Profiles
                  </Button>
                </>
              )}

              <Button variant="outline" size="sm" onClick={exportDevices}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {filters.showAdvanced && (
            <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {filterOptions.statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.discoveryMethod} onValueChange={(value) => setFilters(prev => ({ ...prev, discoveryMethod: value }))}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {filterOptions.methods.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters({
                  search: '',
                  manufacturer: 'all',
                  status: 'all',
                  discoveryMethod: 'all',
                  authenticated: 'all',
                  showAdvanced: false
                })}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Discovery Status */}
      {autoDiscoveryTriggered && !isDiscovering && devices.length === 0 && !error && (
        <div className="flex-shrink-0 p-6">
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <strong>Auto-discovery completed.</strong> No devices were found automatically.
              You can use "Start Discovery" to scan again or "Add Manual" for known devices.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex-shrink-0 p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Device List */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {filteredDevices.length === 0 && !isDiscovering ? (
            <Card>
              <CardContent className="text-center py-12">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="font-medium text-gray-900 mb-2">
                  {devices.length === 0 ? 'No Devices Found' : 'No Matching Devices'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {devices.length === 0
                    ? 'Start discovery to find ONVIF devices on your network'
                    : 'Try adjusting your filters or search terms'
                  }
                </p>
                {devices.length === 0 && (
                  <Button onClick={() => handleDiscovery(false)}>
                    <Zap className="w-4 h-4 mr-2" />
                    Discover Devices
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Bulk Actions */}
              {selectedDevices.size > 0 && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={selectedDevices.size === paginatedDevices.length}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-sm font-medium">
                        {selectedDevices.size} device{selectedDevices.size !== 1 ? 's' : ''} selected
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button size="sm" onClick={() => setShowBulkAuthDialog(true)}>
                        <Lock className="w-4 h-4 mr-2" />
                        Authenticate Selected
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleBulkConfigureProfiles}>
                        <Settings className="w-4 h-4 mr-2" />
                        Configure Profiles
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Device Display */}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {paginatedDevices.map(renderDeviceCard)}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full">
                      <thead className="border-b border-gray-200 bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left">
                            <Checkbox
                              checked={selectedDevices.size === paginatedDevices.length && paginatedDevices.length > 0}
                              onCheckedChange={handleSelectAll}
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Device</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Manufacturer</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Method</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Auth</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedDevices.map(renderDeviceRow)}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredDevices.length)} of {filteredDevices.length} devices
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ManualAddDeviceDialog
        open={showManualAdd}
        onOpenChange={setShowManualAdd}
        onDeviceAdded={(device) => {
          setDevices(prev => [...prev, device])
          onDevicesDiscovered([...devices, device])
        }}
      />

      <DeviceAuthDialog
        open={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        device={deviceToAuth}
        onAuthSuccess={(deviceId) => {
          setDevices(prev => prev.map(d =>
            d.id === deviceId ? { ...d, authenticated: true } : d
          ))
          setDeviceToAuth(null)
        }}
      />

      <ProfileManagementDialog
        open={showProfileDialog}
        onOpenChange={setShowProfileDialog}
        device={deviceToConfigureProfiles}
        onProfilesConfigured={(deviceId) => {
          setDevices(prev => prev.map(d =>
            d.id === deviceId ? { ...d, profiles_configured: true } : d
          ))
          setDeviceToConfigureProfiles(null)
        }}
      />

      {/* Bulk Authentication Dialog */}
      {showBulkAuthDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Bulk Authentication</CardTitle>
              <p className="text-sm text-gray-600">
                Authenticate {selectedDevices.size} selected device{selectedDevices.size !== 1 ? 's' : ''}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">ONVIF Username</label>
                <Input
                  value={bulkCredentials.username}
                  onChange={(e) => setBulkCredentials(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="admin"
                />
              </div>
              <div>
                <label className="text-sm font-medium">ONVIF Password</label>
                <Input
                  type="password"
                  value={bulkCredentials.password}
                  onChange={(e) => setBulkCredentials(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">RTSP Username (optional)</label>
                <Input
                  value={bulkCredentials.rtsp_username}
                  onChange={(e) => setBulkCredentials(prev => ({ ...prev, rtsp_username: e.target.value }))}
                  placeholder="Leave empty to use ONVIF credentials"
                />
              </div>
              <div>
                <label className="text-sm font-medium">RTSP Password (optional)</label>
                <Input
                  type="password"
                  value={bulkCredentials.rtsp_password}
                  onChange={(e) => setBulkCredentials(prev => ({ ...prev, rtsp_password: e.target.value }))}
                  placeholder="Leave empty to use ONVIF credentials"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowBulkAuthDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkAuthenticate}
                  disabled={!bulkCredentials.username || !bulkCredentials.password}
                >
                  Authenticate Devices
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}