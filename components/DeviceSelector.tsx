import React, { useState, useMemo, useCallback } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { Alert, AlertDescription } from './ui/alert'
import { Camera, Search, CheckSquare, Square, AlertTriangle, Filter } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface Device {
  id: string
  name: string
  ip_address: string
  authenticated: boolean
  status: string
}

interface DeviceSelectorProps {
  devices: Device[]
  selectedDevices: string[]
  onSelectionChange: (selectedIds: string[]) => void
  disabled?: boolean
}

// Virtualized list configuration
const ITEMS_PER_PAGE = 50
const ITEM_HEIGHT = 70 // Height of each device row in pixels

export function DeviceSelector({
  devices,
  selectedDevices,
  onSelectionChange,
  disabled = false
}: DeviceSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Filter and search devices
  const filteredDevices = useMemo(() => {
    let filtered = devices

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(device => device.status === filterStatus)
    }

    // Search by name or IP
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        device =>
          device.name.toLowerCase().includes(query) ||
          device.ip_address.toLowerCase().includes(query) ||
          device.id.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [devices, searchQuery, filterStatus])

  // Pagination
  const totalPages = Math.ceil(filteredDevices.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const currentDevices = filteredDevices.slice(startIndex, endIndex)

  // Reset to page 1 when search/filter changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterStatus])

  const handleSelectAll = useCallback(() => {
    if (selectedDevices.length === devices.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(devices.map(d => d.id))
    }
  }, [devices, selectedDevices, onSelectionChange])

  const handleSelectFiltered = useCallback(() => {
    const filteredIds = filteredDevices.map(d => d.id)
    const allFilteredSelected = filteredIds.every(id => selectedDevices.includes(id))

    if (allFilteredSelected) {
      // Deselect all filtered
      onSelectionChange(selectedDevices.filter(id => !filteredIds.includes(id)))
    } else {
      // Select all filtered
      const newSelection = [...new Set([...selectedDevices, ...filteredIds])]
      onSelectionChange(newSelection)
    }
  }, [filteredDevices, selectedDevices, onSelectionChange])

  const handleSelectPage = useCallback(() => {
    const pageIds = currentDevices.map(d => d.id)
    const allPageSelected = pageIds.every(id => selectedDevices.includes(id))

    if (allPageSelected) {
      // Deselect all on page
      onSelectionChange(selectedDevices.filter(id => !pageIds.includes(id)))
    } else {
      // Select all on page
      const newSelection = [...new Set([...selectedDevices, ...pageIds])]
      onSelectionChange(newSelection)
    }
  }, [currentDevices, selectedDevices, onSelectionChange])

  const handleToggleDevice = useCallback(
    (deviceId: string) => {
      if (selectedDevices.includes(deviceId)) {
        onSelectionChange(selectedDevices.filter(id => id !== deviceId))
      } else {
        onSelectionChange([...selectedDevices, deviceId])
      }
    },
    [selectedDevices, onSelectionChange]
  )

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1)
    }
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1)
    }
  }

  const handleGoToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // Get unique statuses for filter
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(devices.map(d => d.status))
    return Array.from(statuses)
  }, [devices])

  const allPageSelected = currentDevices.length > 0 && 
    currentDevices.every(d => selectedDevices.includes(d.id))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Camera className="w-5 h-5" />
              <span>Device Selection</span>
            </CardTitle>
            <CardDescription>
              Select cameras for automatic recording ({selectedDevices.length} of {devices.length} selected)
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {selectedDevices.length} / {devices.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {devices.length === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No authenticated cameras available. Please authenticate cameras in the Device Discovery section.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Search and Filter Bar */}
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name, IP, or device ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  disabled={disabled}
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus} disabled={disabled}>
                <SelectTrigger className="w-40">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {uniqueStatuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredDevices.length)} of {filteredDevices.length}
                {searchQuery && ' (filtered)'}
              </span>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectPage}
                  disabled={disabled || currentDevices.length === 0}
                >
                  {allPageSelected ? (
                    <>
                      <CheckSquare className="w-4 h-4 mr-1" />
                      Deselect Page
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 mr-1" />
                      Select Page
                    </>
                  )}
                </Button>
                {searchQuery && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectFiltered}
                    disabled={disabled}
                  >
                    {filteredDevices.every(d => selectedDevices.includes(d.id))
                      ? 'Deselect Filtered'
                      : 'Select Filtered'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={disabled}
                >
                  {selectedDevices.length === devices.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </div>

            {/* Device List - Virtualized */}
            <div className="border rounded-lg divide-y max-h-[500px] overflow-y-auto">
              {currentDevices.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Search className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No devices found matching your criteria</p>
                  {searchQuery && (
                    <Button
                      variant="link"
                      onClick={() => setSearchQuery('')}
                      className="mt-2"
                    >
                      Clear search
                    </Button>
                  )}
                </div>
              ) : (
                currentDevices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                    style={{ minHeight: `${ITEM_HEIGHT}px` }}
                  >
                    <div className="flex items-center space-x-3 flex-1">
                      <div className="flex-shrink-0">
                        <Camera className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {device.name}
                        </div>
                        <div className="text-sm text-gray-600">
                          {device.ip_address}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          ID: {device.id}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          device.status === 'online'
                            ? 'text-green-600 border-green-300'
                            : 'text-gray-600'
                        }
                      >
                        {device.status}
                      </Badge>
                    </div>
                    <Switch
                      checked={selectedDevices.includes(device.id)}
                      onCheckedChange={() => handleToggleDevice(device.id)}
                      disabled={disabled}
                      className="flex-shrink-0 ml-4"
                    />
                  </div>
                ))
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={currentPage === 1 || disabled}
                  >
                    Previous
                  </Button>
                  
                  {/* Page number buttons - show max 5 pages */}
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }

                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleGoToPage(pageNum)}
                          disabled={disabled}
                          className="w-10"
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages || disabled}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Summary Footer */}
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-800">
                <strong>{selectedDevices.length}</strong> device{selectedDevices.length !== 1 ? 's' : ''} selected
                {selectedDevices.length > 0 && (
                  <span className="ml-2">
                    • {selectedDevices.length === devices.length ? 'All devices' : 'Partial selection'}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
