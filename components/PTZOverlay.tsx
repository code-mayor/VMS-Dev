import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
    ChevronUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    Home,
    Maximize2,
    X,
    Settings,
    Keyboard,
    Move,
    Minimize2
} from 'lucide-react'
import { Button } from './ui/button'
import { Slider } from './ui/slider'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from './ui/popover'

interface Device {
    id: string
    name: string
    capabilities?: {
        ptz?: boolean
    } | string
    authenticated?: string | boolean
}

interface PTZOverlayProps {
    device: Device
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    onClose?: () => void
    expanded?: boolean
    onToggleExpand?: () => void
}

interface PTZSettings {
    panSpeed: number
    tiltSpeed: number
    zoomSpeed: number
    stepDuration: number // Duration in milliseconds for step movements
    zoomDuration: number // Duration in milliseconds for zoom operations
    stopDelay: number    // Delay in milliseconds before sending stop command (for continuous movement)
}

const ptzService = {
    moveCamera: async (deviceId: string, direction: string, speed: number) => {
        try {
            console.log(`[PTZ] Moving camera: ${direction} at speed ${speed}`)
            const response = await fetch(`http://localhost:3001/api/ptz/${deviceId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction, speed })
            })

            if (!response.ok) {
                const error = await response.json()
                console.error('PTZ move failed:', error)
                return false
            }
            return true
        } catch (error) {
            console.error('PTZ move error:', error)
            return false
        }
    },

    zoomCamera: async (deviceId: string, direction: string, speed: number) => {
        try {
            console.log(`[PTZ] Zooming camera: ${direction} at speed ${speed}`)
            const response = await fetch(`http://localhost:3001/api/ptz/${deviceId}/zoom`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction, speed })
            })

            if (!response.ok) {
                const error = await response.json()
                console.error('PTZ zoom failed:', error)
                return false
            }
            return true
        } catch (error) {
            console.error('PTZ zoom error:', error)
            return false
        }
    },

    stopCamera: async (deviceId: string) => {
        try {
            console.log(`[PTZ] Stopping camera`)
            const response = await fetch(`http://localhost:3001/api/ptz/${deviceId}/stop`, {
                method: 'POST'
            })
            return response.ok
        } catch (error) {
            console.error('PTZ stop error:', error)
            return false
        }
    },

    goToHome: async (deviceId: string) => {
        try {
            console.log(`[PTZ] Going to home position`)
            const response = await fetch(`http://localhost:3001/api/ptz/${deviceId}/home`, {
                method: 'POST'
            })
            return response.ok
        } catch (error) {
            console.error('PTZ home error:', error)
            return false
        }
    }
}

export function PTZOverlay({
    device,
    position = 'bottom-right',
    onClose,
    expanded = false,
    onToggleExpand
}: PTZOverlayProps) {
    const [isMoving, setIsMoving] = useState(false)
    const [activeDirection, setActiveDirection] = useState<string | null>(null)
    const [showSettings, setShowSettings] = useState(false)
    const [keyboardEnabled, setKeyboardEnabled] = useState(true)
    const [settings, setSettings] = useState<PTZSettings>({
        panSpeed: 5,
        tiltSpeed: 5,
        zoomSpeed: 3,
        stepDuration: 1500, // 1.5 seconds default for step movements
        zoomDuration: 1000,  // 1 second default for zoom operations
        stopDelay: 1000      // 1 second default delay before stop (for continuous movement)
    })

    // Use refs to prevent re-renders from breaking continuous movement
    const movingRef = useRef(false)
    const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Check if device has PTZ capabilities
    const hasPTZ = (() => {
        if (typeof device?.capabilities === 'string') {
            try {
                const caps = JSON.parse(device.capabilities)
                return caps.ptz === true
            } catch {
                return false
            }
        }
        return device?.capabilities?.ptz === true
    })()

    const isAuthenticated = (() => {
        const auth = device?.authenticated
        if (auth === undefined || auth === null) return false

        // Handle different possible values for authenticated
        if (typeof auth === 'boolean') return auth
        if (typeof auth === 'string') return auth === "1" || auth === "true"
        if (typeof auth === 'number') return auth === 1

        return false
    })()

    if (!hasPTZ || !isAuthenticated) {
        console.log('PTZ Overlay not showing:', { hasPTZ, isAuthenticated, device })
        return null
    }

    // Handle continuous movement (mouse/touch hold)
    const handleMoveStart = async (direction: string) => {
        console.log(`[PTZ UI] Start continuous moving: ${direction}`)

        // Clear any pending stops
        if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current)
            stopTimeoutRef.current = null
        }

        if (movingRef.current) {
            console.log('[PTZ UI] Already moving, ignoring duplicate start')
            return
        }

        movingRef.current = true
        setIsMoving(true)
        setActiveDirection(direction)

        const speed = direction === 'up' || direction === 'down' ? settings.tiltSpeed : settings.panSpeed
        const success = await ptzService.moveCamera(device.id, direction, speed)

        if (!success) {
            console.log('[PTZ UI] Move command failed, resetting state')
            movingRef.current = false
            setIsMoving(false)
            setActiveDirection(null)
        } else {
            console.log('[PTZ UI] Move command successful, camera is moving')
        }
    }

    const handleMoveStop = async () => {
        console.log(`[PTZ UI] Stop continuous moving`)

        if (!movingRef.current) {
            console.log('[PTZ UI] Not moving, ignoring stop')
            return
        }

        movingRef.current = false
        setIsMoving(false)
        setActiveDirection(null)

        // Add small delay before stopping to ensure movement is visible
        stopTimeoutRef.current = setTimeout(async () => {
            await ptzService.stopCamera(device.id)
            console.log('[PTZ UI] Camera stopped after continuous movement')
        }, 100) // 100ms delay ensures the movement is registered
    }

    // Handle step movement (single click or keyboard press)
    const handleStepMove = async (direction: string) => {
        console.log(`[PTZ UI] Step move: ${direction} for ${settings.stepDuration}ms`)

        // Clear any existing movement timeout
        if (moveTimeoutRef.current) {
            clearTimeout(moveTimeoutRef.current)
            moveTimeoutRef.current = null
        }

        // Clear any pending stop timeout
        if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current)
            stopTimeoutRef.current = null
        }

        const speed = direction === 'up' || direction === 'down' ? settings.tiltSpeed : settings.panSpeed
        const success = await ptzService.moveCamera(device.id, direction, speed)

        if (success) {
            // Stop after the configured duration
            moveTimeoutRef.current = setTimeout(async () => {
                console.log(`[PTZ UI] Stopping step movement after ${settings.stepDuration}ms`)
                await ptzService.stopCamera(device.id)
                moveTimeoutRef.current = null
            }, settings.stepDuration)
        }
    }

    // Handle zoom with configurable duration
    const handleZoom = async (direction: 'in' | 'out') => {
        console.log(`[PTZ UI] Zoom ${direction} for ${settings.zoomDuration}ms`)

        // Clear any existing timeout
        if (moveTimeoutRef.current) {
            clearTimeout(moveTimeoutRef.current)
            moveTimeoutRef.current = null
        }

        // Clear any pending stop timeout
        if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current)
            stopTimeoutRef.current = null
        }

        const success = await ptzService.zoomCamera(device.id, direction, settings.zoomSpeed)

        if (success) {
            // Stop after configured zoom duration
            moveTimeoutRef.current = setTimeout(async () => {
                console.log(`[PTZ UI] Stopping zoom after ${settings.zoomDuration}ms`)
                await ptzService.stopCamera(device.id)
                moveTimeoutRef.current = null
            }, settings.zoomDuration)
        }
    }

    const handleHome = async () => {
        console.log(`[PTZ UI] Going home`)

        // Clear any pending movements
        if (moveTimeoutRef.current) {
            clearTimeout(moveTimeoutRef.current)
            moveTimeoutRef.current = null
        }
        if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current)
            stopTimeoutRef.current = null
        }

        await ptzService.goToHome(device.id)
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Clear all timeouts
            if (moveTimeoutRef.current) {
                clearTimeout(moveTimeoutRef.current)
            }
            if (stopTimeoutRef.current) {
                clearTimeout(stopTimeoutRef.current)
            }
            // Stop camera if still moving
            if (movingRef.current) {
                ptzService.stopCamera(device.id)
            }
        }
    }, [device.id])

    // Keyboard controls
    useEffect(() => {
        if (!keyboardEnabled || !expanded) return

        let isKeyDown = false

        const handleKeyDown = async (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT') return
            if (isKeyDown) return // Prevent key repeat

            let handled = true
            isKeyDown = true

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    await handleStepMove('up')
                    break
                case 'ArrowDown':
                case 's':
                case 'S':
                    await handleStepMove('down')
                    break
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    await handleStepMove('left')
                    break
                case 'ArrowRight':
                case 'd':
                case 'D':
                    await handleStepMove('right')
                    break
                case '+':
                case '=':
                    await handleZoom('in')
                    break
                case '-':
                case '_':
                    await handleZoom('out')
                    break
                case 'h':
                case 'H':
                    await handleHome()
                    break
                default:
                    handled = false
                    isKeyDown = false
            }

            if (handled) {
                e.preventDefault()
            }
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            isKeyDown = false
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [keyboardEnabled, expanded, settings, device.id])

    const positionStyles = {
        'bottom-right': { bottom: '20px', right: '20px' },
        'bottom-left': { bottom: '20px', left: '20px' },
        'top-right': { top: '20px', right: '20px' },
        'top-left': { top: '20px', left: '20px' }
    }

    const overlayStyle: React.CSSProperties = {
        position: 'absolute',
        ...positionStyles[position],
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(8px)',
        borderRadius: '12px',
        padding: expanded ? '16px' : '12px',
        color: 'white',
        zIndex: 1000,
        transition: 'all 0.3s ease',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        minWidth: expanded ? '200px' : 'auto'
    }

    const buttonBaseClass = "bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm h-8 w-8"
    const activeButtonClass = "bg-blue-500/40 hover:bg-blue-500/50 text-white border-blue-400/40 h-8 w-8"

    if (!expanded) {
        // Compact view
        return (
            <div style={overlayStyle}>
                <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 mb-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onToggleExpand?.()}
                            className={buttonBaseClass}
                            title="Expand PTZ Controls"
                        >
                            <Maximize2 className="w-4 h-4" />
                        </Button>
                        {onClose && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={onClose}
                                className={buttonBaseClass}
                                title="Close PTZ"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        )}
                    </div>

                    <Button
                        size="sm"
                        variant="ghost"
                        className={activeDirection === 'up' ? activeButtonClass : buttonBaseClass}
                        onMouseDown={() => handleMoveStart('up')}
                        onMouseUp={handleMoveStop}
                        onMouseLeave={handleMoveStop}
                        onTouchStart={() => handleMoveStart('up')}
                        onTouchEnd={handleMoveStop}
                    >
                        <ChevronUp className="w-5 h-5" />
                    </Button>

                    <div className="flex gap-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            className={activeDirection === 'left' ? activeButtonClass : buttonBaseClass}
                            onMouseDown={() => handleMoveStart('left')}
                            onMouseUp={handleMoveStop}
                            onMouseLeave={handleMoveStop}
                            onTouchStart={() => handleMoveStart('left')}
                            onTouchEnd={handleMoveStop}
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Button>

                        <Button
                            size="sm"
                            variant="ghost"
                            className={buttonBaseClass}
                            onClick={handleHome}
                        >
                            <Home className="w-5 h-5" />
                        </Button>

                        <Button
                            size="sm"
                            variant="ghost"
                            className={activeDirection === 'right' ? activeButtonClass : buttonBaseClass}
                            onMouseDown={() => handleMoveStart('right')}
                            onMouseUp={handleMoveStop}
                            onMouseLeave={handleMoveStop}
                            onTouchStart={() => handleMoveStart('right')}
                            onTouchEnd={handleMoveStop}
                        >
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </div>

                    <Button
                        size="sm"
                        variant="ghost"
                        className={activeDirection === 'down' ? activeButtonClass : buttonBaseClass}
                        onMouseDown={() => handleMoveStart('down')}
                        onMouseUp={handleMoveStop}
                        onMouseLeave={handleMoveStop}
                        onTouchStart={() => handleMoveStart('down')}
                        onTouchEnd={handleMoveStop}
                    >
                        <ChevronDown className="w-5 h-5" />
                    </Button>

                    <div className="flex gap-1 mt-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            className={buttonBaseClass}
                            onClick={() => handleZoom('out')}
                        >
                            <ZoomOut className="w-4 h-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className={buttonBaseClass}
                            onClick={() => handleZoom('in')}
                        >
                            <ZoomIn className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    // Expanded view with all controls
    return (
        <div style={overlayStyle}>
            <div className="flex flex-col gap-3">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">PTZ Controls</span>
                        {keyboardEnabled && (
                            <Badge variant="outline" className="text-xs bg-white/10 border-white/20">
                                <Keyboard className="w-3 h-3 mr-1" />
                                Keys ON
                            </Badge>
                        )}
                    </div>
                    <div className="flex gap-1">
                        <Popover open={showSettings} onOpenChange={setShowSettings}>
                            <PopoverTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className={`${buttonBaseClass} w-auto h-auto p-1`}
                                    title="PTZ Settings"
                                >
                                    <Settings className="w-4 h-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 bg-gray-900 border-gray-700 text-white" style={{ zIndex: 1100 }}>
                                <div className="space-y-4">
                                    <h4 className="font-medium text-sm">PTZ Settings</h4>

                                    <div className="space-y-3">
                                        <div>
                                            <Label className="text-xs text-gray-300">Pan Speed: {settings.panSpeed}</Label>
                                            <div className="mt-1 px-2">
                                                <Slider
                                                    value={[settings.panSpeed]}
                                                    onValueChange={([value]) => setSettings({ ...settings, panSpeed: value })}
                                                    min={1}
                                                    max={10}
                                                    step={1}
                                                    className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-gray-600 [&_.bg-primary]:bg-blue-500"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-xs text-gray-300">Tilt Speed: {settings.tiltSpeed}</Label>
                                            <div className="mt-1 px-2">
                                                <Slider
                                                    value={[settings.tiltSpeed]}
                                                    onValueChange={([value]) => setSettings({ ...settings, tiltSpeed: value })}
                                                    min={1}
                                                    max={10}
                                                    step={1}
                                                    className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-gray-600 [&_.bg-primary]:bg-blue-500"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-xs text-gray-300">Zoom Speed: {settings.zoomSpeed}</Label>
                                            <div className="mt-1 px-2">
                                                <Slider
                                                    value={[settings.zoomSpeed]}
                                                    onValueChange={([value]) => setSettings({ ...settings, zoomSpeed: value })}
                                                    min={1}
                                                    max={10}
                                                    step={1}
                                                    className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-gray-600 [&_.bg-primary]:bg-blue-500"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-xs text-gray-300">Stop Delay: {settings.stopDelay}ms</Label>
                                            <div className="mt-1 px-2">
                                                <Slider
                                                    value={[settings.stopDelay]}
                                                    onValueChange={([value]) => setSettings({ ...settings, stopDelay: value })}
                                                    min={100}
                                                    max={10000}
                                                    step={100}
                                                    className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-gray-600 [&_.bg-primary]:bg-blue-500"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">
                                                Time to continue movement after releasing button (100ms - 10s)
                                            </p>
                                        </div>

                                        <div>
                                            <Label className="text-xs text-gray-300">Step Duration: {settings.stepDuration}ms</Label>
                                            <div className="mt-1 px-2">
                                                <Slider
                                                    value={[settings.stepDuration]}
                                                    onValueChange={([value]) => setSettings({ ...settings, stepDuration: value })}
                                                    min={200}
                                                    max={10000}
                                                    step={100}
                                                    className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-gray-600 [&_.bg-primary]:bg-blue-500"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">
                                                Duration for single click/keyboard movements (200ms - 10s)
                                            </p>
                                        </div>

                                        <div>
                                            <Label className="text-xs text-gray-300">Zoom Duration: {settings.zoomDuration}ms</Label>
                                            <div className="mt-1 px-2">
                                                <Slider
                                                    value={[settings.zoomDuration]}
                                                    onValueChange={([value]) => setSettings({ ...settings, zoomDuration: value })}
                                                    min={200}
                                                    max={5000}
                                                    step={100}
                                                    className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-gray-600 [&_.bg-primary]:bg-blue-500"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">
                                                Duration for zoom operations (200ms - 5s)
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-gray-300">Keyboard Control</Label>
                                            <Button
                                                size="sm"
                                                variant={keyboardEnabled ? "default" : "outline"}
                                                onClick={() => setKeyboardEnabled(!keyboardEnabled)}
                                                className="h-6 text-xs"
                                            >
                                                {keyboardEnabled ? 'Enabled' : 'Disabled'}
                                            </Button>
                                        </div>
                                    </div>

                                    {keyboardEnabled && (
                                        <div className="pt-3 border-t border-gray-700">
                                            <p className="text-xs text-gray-400">Keyboard shortcuts:</p>
                                            <div className="grid grid-cols-2 gap-1 mt-2 text-xs text-gray-300">
                                                <div>↑/W - Move Up</div>
                                                <div>↓/S - Move Down</div>
                                                <div>←/A - Move Left</div>
                                                <div>→/D - Move Right</div>
                                                <div>+/= - Zoom In</div>
                                                <div>-/_ - Zoom Out</div>
                                                <div>H - Go Home</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>

                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onToggleExpand?.()}
                            className={`${buttonBaseClass} w-auto h-auto p-1`}
                            title="Minimize"
                        >
                            <Minimize2 className="w-4 h-4" />
                        </Button>

                        {onClose && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={onClose}
                                className={`${buttonBaseClass} w-auto h-auto p-1`}
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Direction Controls */}
                <div className="flex flex-col items-center gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className={activeDirection === 'up' ? activeButtonClass : buttonBaseClass}
                        onMouseDown={() => handleMoveStart('up')}
                        onMouseUp={handleMoveStop}
                        onMouseLeave={handleMoveStop}
                        onTouchStart={() => handleMoveStart('up')}
                        onTouchEnd={handleMoveStop}
                    >
                        <ChevronUp className="w-5 h-5" />
                    </Button>

                    <div className="flex gap-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            className={activeDirection === 'left' ? activeButtonClass : buttonBaseClass}
                            onMouseDown={() => handleMoveStart('left')}
                            onMouseUp={handleMoveStop}
                            onMouseLeave={handleMoveStop}
                            onTouchStart={() => handleMoveStart('left')}
                            onTouchEnd={handleMoveStop}
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Button>

                        <Button
                            size="sm"
                            variant="ghost"
                            className={buttonBaseClass}
                            onClick={handleHome}
                        >
                            <Home className="w-5 h-5" />
                        </Button>

                        <Button
                            size="sm"
                            variant="ghost"
                            className={activeDirection === 'right' ? activeButtonClass : buttonBaseClass}
                            onMouseDown={() => handleMoveStart('right')}
                            onMouseUp={handleMoveStop}
                            onMouseLeave={handleMoveStop}
                            onTouchStart={() => handleMoveStart('right')}
                            onTouchEnd={handleMoveStop}
                        >
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </div>

                    <Button
                        size="sm"
                        variant="ghost"
                        className={activeDirection === 'down' ? activeButtonClass : buttonBaseClass}
                        onMouseDown={() => handleMoveStart('down')}
                        onMouseUp={handleMoveStop}
                        onMouseLeave={handleMoveStop}
                        onTouchStart={() => handleMoveStart('down')}
                        onTouchEnd={handleMoveStop}
                    >
                        <ChevronDown className="w-5 h-5" />
                    </Button>
                </div>

                {/* Zoom Controls */}
                <div className="flex justify-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className={buttonBaseClass}
                        onClick={() => handleZoom('out')}
                    >
                        <ZoomOut className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className={buttonBaseClass}
                        onClick={() => handleZoom('in')}
                    >
                        <ZoomIn className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}