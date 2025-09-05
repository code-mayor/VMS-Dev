import React, { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Slider } from './ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Home,
  Bookmark,
  AlertTriangle
} from 'lucide-react'

interface PTZControlsProps {
  device?: any // Make device optional
  deviceId?: string // Make optional for backward compatibility
  deviceName?: string // Make optional
  ptzPresets?: Record<string, { name: string; pan: number; tilt: number; zoom: number }>
  onPTZCommand?: (command: string, params: any) => Promise<void>
  disabled?: boolean
  isStreaming?: boolean // Add isStreaming prop that LiveView passes
}

export function PTZControls({ 
  device,
  deviceId, 
  deviceName, 
  ptzPresets = {},
  onPTZCommand,
  disabled = false,
  isStreaming = false
}: PTZControlsProps) {
  // Extract device information safely
  const finalDeviceId = deviceId || device?.id || 'unknown'
  const finalDeviceName = deviceName || device?.name || 'Unknown Device'
  const isPtzSupported = device?.capabilities?.ptz || false
  
  // If PTZ is not supported, show disabled state
  if (!isPtzSupported) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>PTZ Controls - {finalDeviceName}</span>
            <Badge variant="secondary">Not Supported</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This camera does not support PTZ (Pan-Tilt-Zoom) operations.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }
  
  // If no onPTZCommand function provided, show placeholder
  if (!onPTZCommand) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>PTZ Controls - {finalDeviceName}</span>
            <Badge variant="secondary">Unavailable</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              PTZ controls are not configured for this device.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [speed, setSpeed] = useState([5])
  const [zoomLevel, setZoomLevel] = useState([1])
  const [selectedPreset, setSelectedPreset] = useState('')

  const handlePTZMove = async (direction: string) => {
    if (disabled || isLoading) return
    
    setIsLoading(true)
    setError('')
    
    try {
      await onPTZCommand('move', { direction, speed: speed[0] })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'PTZ command failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleZoom = async (direction: 'in' | 'out') => {
    if (disabled || isLoading) return
    
    setIsLoading(true)
    setError('')
    
    try {
      await onPTZCommand('zoom', { direction, speed: speed[0] })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Zoom command failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePreset = async (presetName: string) => {
    if (disabled || isLoading) return
    
    setIsLoading(true)
    setError('')
    
    try {
      await onPTZCommand('goto_preset', { preset: presetName })
      setSelectedPreset(presetName)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Preset command failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHome = async () => {
    if (disabled || isLoading) return
    
    setIsLoading(true)
    setError('')
    
    try {
      await onPTZCommand('home', {})
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Home command failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = async () => {
    if (disabled) return
    
    try {
      await onPTZCommand('stop', {})
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Stop command failed')
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>PTZ Controls - {finalDeviceName}</span>
          <Badge variant={disabled ? 'secondary' : 'default'}>
            {disabled ? 'Disabled' : isStreaming ? 'Active' : 'Ready'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Movement Controls */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Pan/Tilt Controls</h4>
          <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
            {/* Top row */}
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePTZMove('up')}
              disabled={disabled || isLoading}
              className="aspect-square p-0"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
            <div></div>
            
            {/* Middle row */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePTZMove('left')}
              disabled={disabled || isLoading}
              className="aspect-square p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleHome}
              disabled={disabled || isLoading}
              className="aspect-square p-0"
            >
              <Home className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePTZMove('right')}
              disabled={disabled || isLoading}
              className="aspect-square p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            
            {/* Bottom row */}
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePTZMove('down')}
              disabled={disabled || isLoading}
              className="aspect-square p-0"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={disabled}
              className="aspect-square p-0"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Zoom Controls</h4>
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleZoom('out')}
              disabled={disabled || isLoading}
              className="flex items-center space-x-2"
            >
              <ZoomOut className="w-4 h-4" />
              <span>Zoom Out</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleZoom('in')}
              disabled={disabled || isLoading}
              className="flex items-center space-x-2"
            >
              <ZoomIn className="w-4 h-4" />
              <span>Zoom In</span>
            </Button>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm">Zoom Level: {zoomLevel[0]}x</label>
            <Slider
              value={zoomLevel}
              onValueChange={setZoomLevel}
              min={1}
              max={10}
              step={0.5}
              disabled={disabled}
              className="w-full"
            />
          </div>
        </div>

        {/* Speed Control */}
        <div className="space-y-2">
          <label className="text-sm">Movement Speed: {speed[0]}</label>
          <Slider
            value={speed}
            onValueChange={setSpeed}
            min={1}
            max={10}
            step={1}
            disabled={disabled}
            className="w-full"
          />
        </div>

        {/* Preset Controls */}
        {Object.keys(ptzPresets).length > 0 && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Presets</h4>
            <Select 
              value={selectedPreset} 
              onValueChange={handlePreset}
              disabled={disabled || isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a preset position" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ptzPresets).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center space-x-2">
                      <Bookmark className="w-4 h-4" />
                      <span>{preset.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ptzPresets).slice(0, 4).map(([key, preset]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset(key)}
                  disabled={disabled || isLoading}
                  className="text-xs"
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>Device: {finalDeviceId}</p>
          <p>Speed: {speed[0]} | Zoom: {zoomLevel[0]}x</p>
          {selectedPreset && (
            <p>Current Preset: {ptzPresets?.[selectedPreset]?.name}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}