import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Separator } from './ui/separator'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Network,
  Camera,
  Server,
  Activity,
  PlayCircle,
  StopCircle,
  RefreshCw,
  Info,
  Eye,
  EyeOff
} from 'lucide-react'

interface DiagnosticResult {
  status: 'success' | 'warning' | 'error'
  message: string
  details?: any
  timestamp: string
}

interface SystemStatus {
  backend: DiagnosticResult
  database: DiagnosticResult
  discovery: DiagnosticResult
  streaming: DiagnosticResult
}

export function RTSPDiagnosticTool() {
  const [cameraIP, setCameraIP] = useState('192.168.226.201')
  const [rtspPath, setRtspPath] = useState('profile1')
  const [username, setUsername] = useState('test')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<DiagnosticResult[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [deviceStatus, setDeviceStatus] = useState<any[]>([])

  useEffect(() => {
    runSystemDiagnostics()
    loadDeviceStatus()
  }, [])

  const runSystemDiagnostics = async () => {
    try {
      const timestamp = new Date().toISOString()
      const status: SystemStatus = {
        backend: { status: 'success', message: 'Connected', timestamp },
        database: { status: 'success', message: 'Active', timestamp },
        discovery: { status: 'success', message: 'Ready', timestamp },
        streaming: { status: 'success', message: 'Ready', timestamp }
      }

      // Test backend connectivity
      try {
        const healthResponse = await fetch('http://localhost:3001/api/health')
        if (healthResponse.ok) {
          const healthData = await healthResponse.json()
          status.backend = {
            status: 'success',
            message: 'Connected',
            details: healthData,
            timestamp
          }
          
          // Check database status from health response
          if (healthData.database === 'connected' || healthData.status === 'healthy') {
            status.database = {
              status: 'success',
              message: 'Active',
              details: healthData,
              timestamp
            }
          } else {
            status.database = {
              status: 'warning',
              message: 'Database status unclear',
              details: healthData,
              timestamp
            }
          }
        } else {
          throw new Error(`HTTP ${healthResponse.status}`)
        }
      } catch (error: any) {
        status.backend = {
          status: 'error',
          message: `Connection failed: ${error.message}`,
          timestamp
        }
        status.database = {
          status: 'error',
          message: 'Cannot verify - backend offline',
          timestamp
        }
      }

      // Test discovery service
      try {
        const devicesResponse = await fetch('http://localhost:3001/api/devices')
        if (devicesResponse.ok) {
          const devicesData = await devicesResponse.json()
          status.discovery = {
            status: 'success',
            message: `Ready - ${devicesData.devices?.length || 0} devices`,
            details: devicesData,
            timestamp
          }
        } else {
          status.discovery = {
            status: 'warning',
            message: 'Service responsive but may have issues',
            timestamp
          }
        }
      } catch (error: any) {
        status.discovery = {
          status: 'error',
          message: `Discovery test failed: ${error.message}`,
          timestamp
        }
      }

      // Test streaming service by checking if any HLS streams exist
      try {
        const hlsResponse = await fetch('http://localhost:3001/hls/')
        if (hlsResponse.ok) {
          status.streaming = {
            status: 'success',
            message: 'Ready - HLS server active',
            timestamp
          }
        } else {
          status.streaming = {
            status: 'warning',
            message: 'HLS endpoint accessible but no active streams',
            timestamp
          }
        }
      } catch (error: any) {
        status.streaming = {
          status: 'error',
          message: `Streaming test failed: ${error.message}`,
          timestamp
        }
      }

      setSystemStatus(status)
    } catch (error) {
      console.error('System diagnostics failed:', error)
    }
  }

  const loadDeviceStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/devices')
      if (response.ok) {
        const data = await response.json()
        setDeviceStatus(data.devices || [])
      }
    } catch (error) {
      console.error('Failed to load device status:', error)
    }
  }

  const runRTSPDiagnostics = async () => {
    setIsRunning(true)
    setResults([])
    
    const addResult = (status: 'success' | 'warning' | 'error', message: string, details?: any) => {
      const result: DiagnosticResult = {
        status,
        message,
        details,
        timestamp: new Date().toISOString()
      }
      setResults(prev => [...prev, result])
      return result
    }

    try {
      // Step 1: Network connectivity test
      addResult('success', 'Starting RTSP connectivity test...')
      
      try {
        const testUrl = `http://localhost:3001/api/devices/test-connectivity`
        const connectResponse = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: cameraIP,
            port: 554
          })
        })
        
        if (connectResponse.ok) {
          addResult('success', `Network connectivity to ${cameraIP}:554 - SUCCESS`)
        } else {
          addResult('warning', `Network connectivity test endpoint not available - testing RTSP directly`)
        }
      } catch (error) {
        addResult('warning', `Network test skipped: ${error}`)
      }

      // Step 2: RTSP URL validation
      const rtspUrl = `rtsp://${username}:${password}@${cameraIP}:554/${rtspPath}`
      const maskedUrl = `rtsp://${username}:***@${cameraIP}:554/${rtspPath}`
      addResult('success', `Testing RTSP URL: ${maskedUrl}`)

      // Step 3: Backend RTSP diagnostic
      try {
        const diagnosticResponse = await fetch('http://localhost:3001/api/devices/rtsp-diagnostic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rtspUrl: rtspUrl,
            timeout: 10000
          })
        })

        if (diagnosticResponse.ok) {
          const diagnosticData = await diagnosticResponse.json()
          
          if (diagnosticData.success) {
            addResult('success', 'RTSP stream validation - SUCCESS', diagnosticData.details)
            
            if (diagnosticData.streamInfo) {
              const info = diagnosticData.streamInfo
              addResult('success', `Stream info: ${info.resolution || 'Unknown resolution'}, ${info.codec || 'Unknown codec'}`, info)
            }
          } else {
            addResult('error', `RTSP validation failed: ${diagnosticData.error}`, diagnosticData)
          }
        } else {
          const errorText = await diagnosticResponse.text()
          addResult('error', `RTSP diagnostic request failed: ${diagnosticResponse.status} - ${errorText}`)
        }
      } catch (error: any) {
        addResult('error', `RTSP diagnostic error: ${error.message}`)
      }

      // Step 4: HLS streaming test
      try {
        addResult('success', 'Testing HLS streaming capability...')
        
        const hlsTestResponse = await fetch('http://localhost:3001/api/devices/test-hls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rtspUrl: rtspUrl,
            duration: 10
          })
        })

        if (hlsTestResponse.ok) {
          const hlsData = await hlsTestResponse.json()
          
          if (hlsData.success) {
            addResult('success', 'HLS streaming test - SUCCESS', hlsData.details)
          } else {
            addResult('error', `HLS streaming test failed: ${hlsData.error}`, hlsData)
          }
        } else {
          addResult('warning', 'HLS test endpoint not available - may be working but untested')
        }
      } catch (error: any) {
        addResult('warning', `HLS test error (may still work): ${error.message}`)
      }

      addResult('success', '🎯 RTSP diagnostic completed')
      
    } catch (error: any) {
      addResult('error', `Diagnostic failed: ${error.message}`)
    } finally {
      setIsRunning(false)
    }
  }

  const getStatusIcon = (status: 'success' | 'warning' | 'error') => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />
    }
  }

  const getStatusBadge = (status: 'success' | 'warning' | 'error') => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-500">Ready</Badge>
      case 'warning':
        return <Badge variant="secondary" className="bg-yellow-500 text-white">Warning</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 flex items-center space-x-2">
            <Activity className="w-6 h-6" />
            <span>Streaming Diagnostics</span>
          </h2>
          <p className="text-gray-600 mt-1">
            Test RTSP connectivity and diagnose streaming issues
          </p>
        </div>

        {/* System Status Overview */}
        {systemStatus && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Server className="w-5 h-5" />
                <span>Current Streaming Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-lg font-medium">Backend Server</div>
                  {getStatusBadge(systemStatus.backend.status)}
                  <div className="text-sm text-gray-600 mt-1">{systemStatus.backend.message}</div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg font-medium">Database</div>
                  {getStatusBadge(systemStatus.database.status)}
                  <div className="text-sm text-gray-600 mt-1">{systemStatus.database.message}</div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg font-medium">Discovery Service</div>
                  {getStatusBadge(systemStatus.discovery.status)}
                  <div className="text-sm text-gray-600 mt-1">{systemStatus.discovery.message}</div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg font-medium">Streaming Service</div>
                  {getStatusBadge(systemStatus.streaming.status)}
                  <div className="text-sm text-gray-600 mt-1">{systemStatus.streaming.message}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Device Status Summary */}
        {deviceStatus.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Device Status Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-3xl font-bold text-blue-600">{deviceStatus.length}</div>
                  <div className="text-sm text-gray-600">Total Devices</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-green-600">
                    {deviceStatus.filter(d => d.authenticated).length}
                  </div>
                  <div className="text-sm text-gray-600">Authenticated</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-yellow-600">
                    {deviceStatus.filter(d => !d.authenticated).length}
                  </div>
                  <div className="text-sm text-gray-600">Needs Authentication</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* RTSP Diagnostic Tool */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Network className="w-5 h-5" />
              <span>RTSP Diagnostic Tool</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cameraIP">Camera IP Address</Label>
                <Input
                  id="cameraIP"
                  value={cameraIP}
                  onChange={(e) => setCameraIP(e.target.value)}
                  placeholder="192.168.1.100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rtspPath">RTSP Path</Label>
                <Input
                  id="rtspPath"
                  value={rtspPath}
                  onChange={(e) => setRtspPath(e.target.value)}
                  placeholder="profile1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-8 w-8 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Will test: rtsp://{username}:***@{cameraIP}:554/{rtspPath}
              </div>
              
              <div className="flex space-x-2">
                <Button 
                  onClick={runSystemDiagnostics}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Status
                </Button>
                
                <Button 
                  onClick={runRTSPDiagnostics}
                  disabled={isRunning || !cameraIP || !username}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 mr-2" />
                      Run RTSP Diagnostics
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Diagnostic Results */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Diagnostic Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {results.map((result, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 rounded-lg border">
                    {getStatusIcon(result.status)}
                    <div className="flex-1">
                      <div className="text-sm font-medium">{result.message}</div>
                      {result.details && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer">
                            Show details
                          </summary>
                          <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-auto">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Info className="w-5 h-5" />
              <span>Diagnostic Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium">Common RTSP Paths:</h4>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li><code>profile1</code> - Standard Honeywell/Hikvision profile</li>
                  <li><code>stream1</code> - Alternative stream naming</li>
                  <li><code>live</code> - Generic live stream path</li>
                  <li><code>cam/realmonitor?channel=1&amp;subtype=0</code> - Dahua format</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium">Status Indicators:</h4>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li><span className="text-green-600">Green (Ready)</span> - Service is working correctly</li>
                  <li><span className="text-yellow-600">Yellow (Warning)</span> - Service working but may have minor issues</li>
                  <li><span className="text-red-600">Red (Error)</span> - Service has problems that need attention</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}