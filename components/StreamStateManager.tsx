import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'

interface StreamState {
    deviceId: string
    url: string
    status: 'connected' | 'connecting' | 'error' | 'stopped'
    error?: string
    audioEnabled: boolean
    recording: boolean
}

interface StreamContextType {
    streamStates: Map<string, StreamState>
    setStreamState: (deviceId: string, state: StreamState) => void
    removeStreamState: (deviceId: string) => void
    clearAllStreams: () => void
    updateStreamState: (deviceId: string, updates: Partial<StreamState>) => void
}

const StreamContext = createContext<StreamContextType | null>(null)

// Global singleton to persist across component unmounts
let globalStreamStates = new Map<string, StreamState>()

export function StreamStateProvider({ children }: { children: React.ReactNode }) {
    const [streamStates, setStreamStates] = useState<Map<string, StreamState>>(globalStreamStates)

    const setStreamState = useCallback((deviceId: string, state: StreamState) => {
        setStreamStates(prev => {
            const newMap = new Map(prev)
            newMap.set(deviceId, state)
            globalStreamStates = newMap
            return newMap
        })
    }, [])

    const updateStreamState = useCallback((deviceId: string, updates: Partial<StreamState>) => {
        setStreamStates(prev => {
            const newMap = new Map(prev)
            const existing = newMap.get(deviceId)
            if (existing) {
                newMap.set(deviceId, { ...existing, ...updates })
                globalStreamStates = newMap
            }
            return newMap
        })
    }, [])

    const removeStreamState = useCallback((deviceId: string) => {
        setStreamStates(prev => {
            const newMap = new Map(prev)
            newMap.delete(deviceId)
            globalStreamStates = newMap
            return newMap
        })
    }, [])

    const clearAllStreams = useCallback(() => {
        setStreamStates(new Map())
        globalStreamStates = new Map()
    }, [])

    return (
        <StreamContext.Provider value={{
            streamStates,
            setStreamState,
            removeStreamState,
            clearAllStreams,
            updateStreamState
        }}>
            {children}
        </StreamContext.Provider>
    )
}

export const useStreamState = () => {
    const context = useContext(StreamContext)
    if (!context) throw new Error('useStreamState must be used within StreamStateProvider')
    return context
}