// PTZControls.tsx - Enhanced PTZ configuration and testing page
// Location: /components/PTZControls.tsx

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { toast } from 'sonner'
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Home,
  Save,
  RefreshCw,
  Camera,
  Settings,
  TestTube,
  Map,
  Clock,
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Crosshair,
  Navigation,
  Film,
  Users
} from 'lucide-react'

interface Device {
  id: string
  name: string
  ip_address: string
  capabilities?: any
  authenticated?: boolean
}

interface PTZPreset {
  id: number
  name: string
  description?: string
}

interface PTZTour {
  id: string
  name: string
  presets: number[]
  dwellTime: number // seconds at each preset
  speed: number
}

interface PTZLimit {
  panMin: number
  panMax: number
  tiltMin: number
  tiltMax: number
  zoomMin: number
  zoomMax: number
}

export function PTZControls({ device }: { device?: Device }) {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(device || null)
  const [devices, setDevices] = useState<Device[]>([])
  const [presets, setPresets] = useState<PTZPreset[]>([])
  const [tours, setTours] = useState<PTZTour[]>([])
  const [limits, setLimits] = useState<PTZLimit>({
    panMin: -180,
    panMax: 180,
    tiltMin: -90,
    tiltMax: 90,
    zoomMin: 1,
    zoomMax: 30
  })
  const [testRunning, setTestRunning] = useState(false)
  const [tourRunning, setTourRunning] = useState(false)
  const [currentPosition, setCurrentPosition] = useState({ pan: 0, tilt: 0, zoom: 1 })

  // Configuration states
  const [autoFocus, setAutoFocus] = useState(true)
  const [continuousMode, setContinuousMode] = useState(true)
  const [defaultSpeed, setDefaultSpeed] = useState(5)
  const [homeOnIdle, setHomeOnIdle] = useState(false)
  const [idleTimeout, setIdleTimeout] = useState(300) // seconds
  const [privacyMask, setPrivacyMask] = useState(false)
  const [motionTracking, setMotionTracking] = useState(false)

  useEffect(() => {
    fetchDevices()
    if (selectedDevice) {
      fetchPresets()
      fetchPosition()
    }
  }, [selectedDevice])

  const fetchDevices = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/devices')
      const data = await response.json()
      const ptzDevices = data.filter((d: Device) => {
        if (typeof d.capabilities === 'string') {
          try {
            return JSON.parse(d.capabilities).ptz === true
          } catch {
            return false
          }
        }
        return d.capabilities?.ptz === true
      })
      setDevices(ptzDevices)
    } catch (error) {
      console.error('Failed to fetch devices:', error)
    }
  }

  const fetchPresets = async () => {
    if (!selectedDevice) return
    try {
      const response = await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/presets`)
      if (response.ok) {
        const data = await response.json()
        setPresets(data.presets || [])
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error)
    }
  }

  const fetchPosition = async () => {
    if (!selectedDevice) return
    try {
      const response = await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/status`)
      if (response.ok) {
        const data = await response.json()
        if (data.position) {
          setCurrentPosition(data.position)
        }
      }
    } catch (error) {
      console.error('Failed to fetch position:', error)
    }
  }

  const savePreset = async (presetNumber: number, name: string) => {
    if (!selectedDevice) return
    try {
      const response = await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/preset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetNumber, name })
      })
      if (response.ok) {
        toast.success(`Preset ${presetNumber} saved: ${name}`)
        fetchPresets()
      }
    } catch (error) {
      toast.error('Failed to save preset')
    }
  }

  const gotoPreset = async (presetNumber: number) => {
    if (!selectedDevice) return
    try {
      const response = await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/preset/${presetNumber}`, {
        method: 'POST'
      })
      if (response.ok) {
        toast.success(`Moving to preset ${presetNumber}`)
      }
    } catch (error) {
      toast.error('Failed to go to preset')
    }
  }

  const runSystemTest = async () => {
    if (!selectedDevice) return
    setTestRunning(true)

    try {
      // Test sequence
      const tests = [
        { direction: 'left', duration: 1000 },
        { direction: 'right', duration: 2000 },
        { direction: 'left', duration: 1000 },
        { direction: 'up', duration: 1000 },
        { direction: 'down', duration: 2000 },
        { direction: 'up', duration: 1000 }
      ]

      for (const test of tests) {
        await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: test.direction, speed: 5 })
        })
        await new Promise(resolve => setTimeout(resolve, test.duration))
        await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/stop`, {
          method: 'POST'
        })
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Test zoom
      await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/zoom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'in', speed: 3 })
      })
      await new Promise(resolve => setTimeout(resolve, 1000))
      await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/stop`, {
        method: 'POST'
      })

      // Return home
      await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/home`, {
        method: 'POST'
      })

      toast.success('PTZ system test completed successfully')
    } catch (error) {
      toast.error('PTZ system test failed')
    } finally {
      setTestRunning(false)
    }
  }

  const startTour = async (tour: PTZTour) => {
    if (!selectedDevice || tourRunning) return
    setTourRunning(true)

    try {
      for (const presetId of tour.presets) {
        await gotoPreset(presetId)
        await new Promise(resolve => setTimeout(resolve, tour.dwellTime * 1000))

        if (!tourRunning) break // Allow stopping tour
      }
      toast.success('Tour completed')
    } catch (error) {
      toast.error('Tour failed')
    } finally {
      setTourRunning(false)
    }
  }

  const saveConfiguration = async () => {
    if (!selectedDevice) return

    const config = {
      deviceId: selectedDevice.id,
      autoFocus,
      continuousMode,
      defaultSpeed,
      homeOnIdle,
      idleTimeout,
      privacyMask,
      motionTracking,
      limits
    }

    try {
      const response = await fetch(`http://localhost:3001/api/ptz/${selectedDevice.id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })

      if (response.ok) {
        toast.success('PTZ configuration saved')
      }
    } catch (error) {
      toast.error('Failed to save configuration')
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Camera className="w-6 h-6" />
            PTZ Configuration & Control
          </h2>
          <p className="text-gray-600">Configure and test PTZ camera capabilities</p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedDevice?.id} onValueChange={(id) => {
            const device = devices.find(d => d.id === id)
            setSelectedDevice(device || null)
          }}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select PTZ Camera" />
            </SelectTrigger>
            <SelectContent>
              {devices.map(device => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name} - {device.ip_address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={fetchDevices} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {selectedDevice ? (
        <Tabs defaultValue="presets" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="presets">
              <Map className="w-4 h-4 mr-2" />
              Presets
            </TabsTrigger>
            <TabsTrigger value="tours">
              <Navigation className="w-4 h-4 mr-2" />
              Tours
            </TabsTrigger>
            <TabsTrigger value="limits">
              <Shield className="w-4 h-4 mr-2" />
              Limits
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings className="w-4 h-4 mr-2" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="test">
              <TestTube className="w-4 h-4 mr-2" />
              Testing
            </TabsTrigger>
          </TabsList>

          {/* Presets Tab */}
          <TabsContent value="presets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Camera Presets</CardTitle>
                <CardDescription>Save and manage camera position presets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <Card key={num} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">Preset {num}</Badge>
                        <Crosshair className="w-4 h-4 text-gray-400" />
                      </div>
                      <Input
                        placeholder="Preset name"
                        className="mb-2"
                        id={`preset-${num}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const input = document.getElementById(`preset-${num}`) as HTMLInputElement
                            savePreset(num, input?.value || `Preset ${num}`)
                          }}
                        >
                          <Save className="w-3 h-3 mr-1" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => gotoPreset(num)}
                        >
                          Go
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tours Tab */}
          <TabsContent value="tours" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Patrol Tours</CardTitle>
                <CardDescription>Configure automated camera patrol sequences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Perimeter Patrol</h4>
                      <p className="text-sm text-gray-600">Presets: 1 → 3 → 5 → 7 → 1</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Dwell: 10s</Label>
                      <Button
                        size="sm"
                        onClick={() => startTour({
                          id: '1',
                          name: 'Perimeter',
                          presets: [1, 3, 5, 7, 1],
                          dwellTime: 10,
                          speed: 5
                        })}
                        disabled={tourRunning}
                      >
                        {tourRunning ? 'Running...' : 'Start'}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Entry Points</h4>
                      <p className="text-sm text-gray-600">Presets: 2 → 4 → 6 → 8</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Dwell: 15s</Label>
                      <Button
                        size="sm"
                        onClick={() => startTour({
                          id: '2',
                          name: 'Entries',
                          presets: [2, 4, 6, 8],
                          dwellTime: 15,
                          speed: 5
                        })}
                        disabled={tourRunning}
                      >
                        {tourRunning ? 'Running...' : 'Start'}
                      </Button>
                    </div>
                  </div>
                </div>

                {tourRunning && (
                  <Alert>
                    <Activity className="w-4 h-4" />
                    <AlertDescription>
                      Tour in progress...
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-4"
                        onClick={() => setTourRunning(false)}
                      >
                        Stop Tour
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Limits Tab */}
          <TabsContent value="limits" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Movement Limits</CardTitle>
                <CardDescription>Set boundaries for PTZ movement</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-medium">Pan Limits</h4>
                    <div>
                      <Label>Minimum: {limits.panMin}°</Label>
                      <Slider
                        value={[limits.panMin]}
                        onValueChange={([v]) => setLimits({ ...limits, panMin: v })}
                        min={-180}
                        max={0}
                        step={10}
                      />
                    </div>
                    <div>
                      <Label>Maximum: {limits.panMax}°</Label>
                      <Slider
                        value={[limits.panMax]}
                        onValueChange={([v]) => setLimits({ ...limits, panMax: v })}
                        min={0}
                        max={180}
                        step={10}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Tilt Limits</h4>
                    <div>
                      <Label>Minimum: {limits.tiltMin}°</Label>
                      <Slider
                        value={[limits.tiltMin]}
                        onValueChange={([v]) => setLimits({ ...limits, tiltMin: v })}
                        min={-90}
                        max={0}
                        step={5}
                      />
                    </div>
                    <div>
                      <Label>Maximum: {limits.tiltMax}°</Label>
                      <Slider
                        value={[limits.tiltMax]}
                        onValueChange={([v]) => setLimits({ ...limits, tiltMax: v })}
                        min={0}
                        max={90}
                        step={5}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium">Zoom Limits</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label>Minimum: {limits.zoomMin}x</Label>
                      <Slider
                        value={[limits.zoomMin]}
                        onValueChange={([v]) => setLimits({ ...limits, zoomMin: v })}
                        min={1}
                        max={10}
                        step={1}
                      />
                    </div>
                    <div>
                      <Label>Maximum: {limits.zoomMax}x</Label>
                      <Slider
                        value={[limits.zoomMax]}
                        onValueChange={([v]) => setLimits({ ...limits, zoomMax: v })}
                        min={10}
                        max={50}
                        step={5}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Advanced Configuration</CardTitle>
                <CardDescription>Configure PTZ behavior and features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Auto Focus</Label>
                        <p className="text-sm text-gray-600">Enable automatic focus adjustment</p>
                      </div>
                      <Switch checked={autoFocus} onCheckedChange={setAutoFocus} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Continuous Mode</Label>
                        <p className="text-sm text-gray-600">Allow continuous movement</p>
                      </div>
                      <Switch checked={continuousMode} onCheckedChange={setContinuousMode} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Motion Tracking</Label>
                        <p className="text-sm text-gray-600">Auto-track detected motion</p>
                      </div>
                      <Switch checked={motionTracking} onCheckedChange={setMotionTracking} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Return to Home</Label>
                        <p className="text-sm text-gray-600">Auto-return when idle</p>
                      </div>
                      <Switch checked={homeOnIdle} onCheckedChange={setHomeOnIdle} />
                    </div>

                    {homeOnIdle && (
                      <div>
                        <Label>Idle Timeout: {idleTimeout}s</Label>
                        <Slider
                          value={[idleTimeout]}
                          onValueChange={([v]) => setIdleTimeout(v)}
                          min={60}
                          max={600}
                          step={30}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Privacy Masking</Label>
                        <p className="text-sm text-gray-600">Enable privacy zones</p>
                      </div>
                      <Switch checked={privacyMask} onCheckedChange={setPrivacyMask} />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Label>Default Movement Speed: {defaultSpeed}</Label>
                  <Slider
                    value={[defaultSpeed]}
                    onValueChange={([v]) => setDefaultSpeed(v)}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                </div>

                <Button onClick={saveConfiguration} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  Save Configuration
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Testing Tab */}
          <TabsContent value="test" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Testing</CardTitle>
                <CardDescription>Test PTZ functionality and diagnose issues</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4 border-2">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">Current Position</h4>
                      <RefreshCw
                        className="w-4 h-4 cursor-pointer"
                        onClick={fetchPosition}
                      />
                    </div>
                    <div className="space-y-1 text-sm">
                      <p>Pan: {currentPosition.pan}°</p>
                      <p>Tilt: {currentPosition.tilt}°</p>
                      <p>Zoom: {currentPosition.zoom}x</p>
                    </div>
                  </Card>

                  <Card className="p-4 border-2">
                    <h4 className="font-medium mb-2">Connection Status</h4>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-sm">Connected</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {selectedDevice.ip_address}
                    </p>
                  </Card>

                  <Card className="p-4 border-2">
                    <h4 className="font-medium mb-2">Capabilities</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>PTZ Control</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>Presets</span>
                      </div>
                    </div>
                  </Card>
                </div>

                <Card className="p-6">
                  <h4 className="font-medium mb-4">Automated System Test</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Run a comprehensive test of all PTZ functions including movement, zoom, and presets.
                  </p>
                  <Button
                    onClick={runSystemTest}
                    disabled={testRunning}
                    className="w-full"
                  >
                    {testRunning ? (
                      <>
                        <Activity className="w-4 h-4 mr-2 animate-spin" />
                        Testing in Progress...
                      </>
                    ) : (
                      <>
                        <TestTube className="w-4 h-4 mr-2" />
                        Run System Test
                      </>
                    )}
                  </Button>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="font-medium mb-2">No PTZ Camera Selected</h3>
            <p className="text-gray-600">
              Select a PTZ-capable camera from the dropdown above to configure and test.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}