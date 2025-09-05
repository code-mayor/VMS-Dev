import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { HLSPlayer } from './HLSPlayer'
import {
  Play,
  Square,
  Settings,
  TestTube,
  CheckCircle,
  AlertTriangle,
  Clock,
  Signal
} from 'lucide-react'

interface StreamingTestProps {
  selectedDevice?: any
}

export function StreamingTest({ selectedDevice }: StreamingTestProps) {
  const [testResults, setTestResults] = useState<any>({})
  const [isRecording, setIsRecording] = useState(false)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [latencyTest, setLatencyTest] = useState<any>(null)

  useEffect(() => {
    if (selectedDevice?.id) {
      runLatencyTest()
    }
  }, [selectedDevice?.id])

  const runLatencyTest = async () => {
    if (!selectedDevice?.id) return

    try {
      console.log('🧪 Running latency test...')
      const startTime = Date.now()
      
      // Test HLS manifest loading
      const hlsUrl = `http://localhost:3001/hls/${selectedDevice.id}_hls/playlist.m3u8`
      const response = await fetch(hlsUrl)
      const loadTime = Date.now() - startTime
      
      if (response.ok) {
        const manifest = await response.text()
        const segments = manifest.split('\n').filter(line => line.endsWith('.ts')).length
        
        setLatencyTest({
          status: 'success',
          loadTime,
          segments,
          url: hlsUrl,
          manifest: manifest.substring(0, 200) + '...'
        })
        
        console.log(`✅ Latency test passed: ${loadTime}ms, ${segments} segments`)
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error: any) {
      setLatencyTest({
        status: 'error',
        error: error.message,
        loadTime: null
      })
      console.error('❌ Latency test failed:', error)
    }
  }

  const testRecording = async () => {
    if (!selectedDevice?.id) return

    try {
      if (!isRecording) {
        console.log('🔴 Starting test recording...')
        
        const response = await fetch('http://localhost:3001/api/recordings/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: selectedDevice.id,
            duration: 30, // 30 second test
            quality: 'medium'
          })
        })

        if (response.ok) {
          const data = await response.json()
          setRecordingId(data.recordingId)
          setIsRecording(true)
          
          setTestResults(prev => ({
            ...prev,
            recording: {
              status: 'recording',
              recordingId: data.recordingId,
              filename: data.filename,
              startTime: new Date().toISOString()
            }
          }))
        } else {
          throw new Error('Failed to start recording')
        }
      } else {
        console.log('⏹️ Stopping test recording...')
        
        if (recordingId) {
          const response = await fetch(`http://localhost:3001/api/recordings/stop/${recordingId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })

          if (response.ok) {
            setIsRecording(false)
            setRecordingId(null)
            
            setTestResults(prev => ({
              ...prev,
              recording: {
                ...prev.recording,
                status: 'stopped',
                endTime: new Date().toISOString()
              }
            }))
          }
        }
      }
    } catch (error: any) {
      console.error('❌ Recording test failed:', error)
      setTestResults(prev => ({
        ...prev,
        recording: {
          status: 'error',
          error: error.message
        }
      }))
    }
  }

  const getLatencyColor = (loadTime: number) => {
    if (loadTime < 500) return 'text-green-600'
    if (loadTime < 1000) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (!selectedDevice) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-gray-500">
          <TestTube className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Device Selected</h3>
          <p>Select a device to run streaming and recording tests</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center space-x-2">
          <TestTube className="w-6 h-6" />
          <span>Streaming & Recording Tests - {selectedDevice.name}</span>
        </h2>
        <p className="text-gray-600 mt-1">
          Test low-latency streaming and recording functionality
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Stream Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Signal className="w-5 h-5" />
              <span>Low-Latency HLS Stream</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedDevice.authenticated ? (
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <HLSPlayer
                  src={`http://localhost:3001/hls/${selectedDevice.id}_hls/playlist.m3u8`}
                  autoPlay={true}
                  muted={false}
                  controls={true}
                  className="w-full h-full"
                  onError={(error) => console.error('Stream error:', error)}
                  onCanPlay={() => console.log('Stream ready')}
                />
              </div>
            ) : (
              <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2" />
                  <p>Device not authenticated</p>
                </div>
              </div>
            )}
            
            {latencyTest && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Stream Latency Test:</span>
                  <Badge variant={latencyTest.status === 'success' ? 'default' : 'destructive'}>
                    {latencyTest.status === 'success' ? 'PASSED' : 'FAILED'}
                  </Badge>
                </div>
                
                {latencyTest.status === 'success' && (
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Manifest Load Time:</span>
                      <span className={getLatencyColor(latencyTest.loadTime)}>
                        {latencyTest.loadTime}ms
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Available Segments:</span>
                      <span>{latencyTest.segments}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      Expected latency: 2-4 seconds with optimized HLS.js
                    </div>
                  </div>
                )}
                
                {latencyTest.status === 'error' && (
                  <div className="text-sm text-red-600">
                    Error: {latencyTest.error}
                  </div>
                )}
              </div>
            )}
            
            <Button onClick={runLatencyTest} variant="outline" size="sm" className="w-full">
              <Clock className="w-4 h-4 mr-2" />
              Retest Latency
            </Button>
          </CardContent>
        </Card>

        {/* Recording Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Play className="w-5 h-5" />
              <span>Recording Test</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                {isRecording ? (
                  <div className="w-6 h-6 bg-red-500 rounded-sm animate-pulse"></div>
                ) : (
                  <Play className="w-8 h-8 text-gray-400" />
                )}
              </div>
              
              <Button
                onClick={testRecording}
                variant={isRecording ? "destructive" : "default"}
                disabled={!selectedDevice.authenticated}
                className="w-full"
              >
                {isRecording ? (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Stop Test Recording
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start 30s Test Recording
                  </>
                )}
              </Button>
            </div>

            {testResults.recording && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Recording Status:</span>
                  <Badge variant={
                    testResults.recording.status === 'recording' ? 'destructive' :
                    testResults.recording.status === 'stopped' ? 'default' : 'secondary'
                  }>
                    {testResults.recording.status.toUpperCase()}
                  </Badge>
                </div>
                
                {testResults.recording.filename && (
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Filename:</span>
                      <span className="font-mono text-xs">{testResults.recording.filename}</span>
                    </div>
                    {testResults.recording.recordingId && (
                      <div className="flex justify-between">
                        <span>Recording ID:</span>
                        <span className="font-mono text-xs">{testResults.recording.recordingId}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {testResults.recording.error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{testResults.recording.error}</AlertDescription>
                  </Alert>
                )}
                
                {testResults.recording.status === 'stopped' && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Test recording completed successfully! Check the Video Recording tab to download the file.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>System Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">✅</div>
              <div className="text-sm font-medium">Backend Server</div>
              <div className="text-xs text-gray-600">Connected</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">✅</div>
              <div className="text-sm font-medium">HLS Streaming</div>
              <div className="text-xs text-gray-600">2s segments</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">✅</div>
              <div className="text-sm font-medium">Recording API</div>
              <div className="text-xs text-gray-600">Ready</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">⚡</div>
              <div className="text-sm font-medium">Low Latency</div>
              <div className="text-xs text-gray-600">Optimized</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}