import React, { useEffect, useState } from 'react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '../ui/utils'
import {
    Activity,
    User,
    Cat,
    Car,
    X,
    ShieldAlert,
    AlertTriangle
} from 'lucide-react'
import { MotionAlert } from '../../types/motion-types'

interface MotionAlertBadgeProps {
    alert: MotionAlert
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    size?: 'sm' | 'md' | 'lg'
    autoHide?: number // milliseconds
    onAcknowledge?: (alertId: string) => void
    onExpand?: () => void
    className?: string
}

export function MotionAlertBadge({
    alert,
    position = 'top-right',
    size = 'md',
    autoHide,
    onAcknowledge,
    onExpand,
    className
}: MotionAlertBadgeProps) {
    const [isVisible, setIsVisible] = useState(true)
    const [isExpanded, setIsExpanded] = useState(false)

    useEffect(() => {
        if (autoHide && autoHide > 0) {
            const timer = setTimeout(() => {
                setIsVisible(false)
            }, autoHide)
            return () => clearTimeout(timer)
        }
    }, [autoHide])

    if (!isVisible || alert.acknowledged) return null

    const getAlertIcon = () => {
        if (alert.objects?.living?.human?.length) return <User className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />
        if (alert.objects?.living?.animal?.length) return <Cat className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />
        if (alert.objects?.nonLiving?.vehicle?.length) return <Car className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />
        return <Activity className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />
    }

    const getAlertColor = () => {
        switch (alert.alertLevel) {
            case 'high': return 'bg-red-500 hover:bg-red-600'
            case 'medium': return 'bg-orange-500 hover:bg-orange-600'
            case 'low': return 'bg-yellow-500 hover:bg-yellow-600'
            default: return 'bg-gray-500 hover:bg-gray-600'
        }
    }

    const positionClasses = {
        'top-left': 'top-2 left-2',
        'top-right': 'top-2 right-2',
        'bottom-left': 'bottom-2 left-2',
        'bottom-right': 'bottom-2 right-2'
    }

    const sizeClasses = {
        'sm': 'p-1.5 text-xs max-w-[200px]',
        'md': 'p-2 text-sm max-w-[250px]',
        'lg': 'p-3 text-base max-w-[300px]'
    }

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp)
        const now = new Date()
        const diff = now.getTime() - date.getTime()

        if (diff < 60000) return 'Just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        return date.toLocaleTimeString()
    }

    const getObjectSummary = () => {
        const objects = []

        if (alert.objects?.living?.human?.length) {
            const count = alert.objects.living.human.length
            objects.push(`${count} person${count > 1 ? 's' : ''}`)
        }

        if (alert.objects?.living?.animal?.length) {
            const animals = alert.objects.living.animal
            const types = [...new Set(animals.map(a => a.class))]
            objects.push(types.join(', '))
        }

        if (alert.objects?.nonLiving?.vehicle?.length) {
            const vehicles = alert.objects.nonLiving.vehicle
            const types = [...new Set(vehicles.map(v => v.class))]
            objects.push(types.join(', '))
        }

        return objects.length > 0 ? objects.join(' • ') : 'Motion detected'
    }

    return (
        <div
            className={cn(
                'absolute z-50 transition-all duration-300',
                positionClasses[position],
                className
            )}
        >
            <div
                className={cn(
                    'text-white rounded-lg shadow-lg animate-pulse cursor-pointer',
                    getAlertColor(),
                    sizeClasses[size],
                    isExpanded ? 'min-w-[280px]' : ''
                )}
                onClick={() => {
                    if (!isExpanded) {
                        setIsExpanded(true)
                        onExpand?.()
                    }
                }}
            >
                <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2">
                        <div className="flex-shrink-0 mt-0.5">
                            {alert.alertLevel === 'high' ? (
                                <ShieldAlert className={`w-${size === 'sm' ? '4' : '5'} h-${size === 'sm' ? '4' : '5'}`} />
                            ) : (
                                <AlertTriangle className={`w-${size === 'sm' ? '4' : '5'} h-${size === 'sm' ? '4' : '5'}`} />
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-1 mb-1">
                                {getAlertIcon()}
                                <span className="font-semibold truncate">
                                    {alert.deviceName || `Device ${alert.deviceId}`}
                                </span>
                            </div>

                            {isExpanded ? (
                                <div className="space-y-1">
                                    <p className="text-white/90">{getObjectSummary()}</p>
                                    <div className="flex items-center justify-between text-white/70 text-xs">
                                        <span>Confidence: {alert.confidence}%</span>
                                        <span>{formatTime(alert.timestamp)}</span>
                                    </div>

                                    {alert.objects && (
                                        <div className="mt-2 pt-2 border-t border-white/20">
                                            <div className="text-xs space-y-1">
                                                {alert.objects.living?.human?.length > 0 && (
                                                    <div className="flex items-center justify-between">
                                                        <span>Human Detection</span>
                                                        <Badge className="bg-white/20 text-white text-xs">
                                                            {Math.round(alert.objects.living.human[0].confidence * 100)}%
                                                        </Badge>
                                                    </div>
                                                )}
                                                {alert.objects.living?.animal?.length > 0 && (
                                                    <div className="flex items-center justify-between">
                                                        <span>Animal: {alert.objects.living.animal[0].class}</span>
                                                        <Badge className="bg-white/20 text-white text-xs">
                                                            {Math.round(alert.objects.living.animal[0].confidence * 100)}%
                                                        </Badge>
                                                    </div>
                                                )}
                                                {alert.objects.nonLiving?.vehicle?.length > 0 && (
                                                    <div className="flex items-center justify-between">
                                                        <span>Vehicle: {alert.objects.nonLiving.vehicle[0].class}</span>
                                                        <Badge className="bg-white/20 text-white text-xs">
                                                            {Math.round(alert.objects.nonLiving.vehicle[0].confidence * 100)}%
                                                        </Badge>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <p className="text-white/90 truncate">{alert.summary}</p>
                                    <p className="text-white/70 text-xs">
                                        {formatTime(alert.timestamp)} • {alert.confidence}%
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {onAcknowledge && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="p-0 h-5 w-5 text-white hover:bg-white/20 ml-2 flex-shrink-0"
                            onClick={(e) => {
                                e.stopPropagation()
                                onAcknowledge(alert.id)
                                setIsVisible(false)
                            }}
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}