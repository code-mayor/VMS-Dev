interface WebRTCStreamConfig {
  deviceId: string
  profileToken: string
  rtspUrl: string
  username?: string
  password?: string
  iceServers?: RTCIceServer[]
}

interface WebRTCConnection {
  peerConnection: RTCPeerConnection
  dataChannel?: RTCDataChannel
  remoteStream?: MediaStream
  isConnected: boolean
  lastActivity: Date
}

export class WebRTCStreamingService {
  private connections: Map<string, WebRTCConnection> = new Map()
  private signalingServer: WebSocket | null = null
  private iceServers: RTCIceServer[]

  constructor() {
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
    
    this.initializeSignalingServer()
  }

  /**
   * Initialize WebSocket signaling server connection
   */
  private initializeSignalingServer() {
    try {
      // Connect to signaling server (would be implemented in backend)
      const wsUrl = `ws://localhost:3001/webrtc-signaling`
      this.signalingServer = new WebSocket(wsUrl)

      this.signalingServer.onopen = () => {
        console.log('📡 WebRTC signaling server connected')
      }

      this.signalingServer.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data))
      }

      this.signalingServer.onclose = () => {
        console.log('📡 WebRTC signaling server disconnected, attempting reconnect...')
        setTimeout(() => this.initializeSignalingServer(), 5000)
      }

      this.signalingServer.onerror = (error) => {
        console.error('❌ WebRTC signaling error:', error)
      }

    } catch (error) {
      console.warn('⚠️ WebRTC signaling server not available, using direct connection')
    }
  }

  /**
   * Start WebRTC streaming for a device
   */
  async startWebRTCStream(
    config: WebRTCStreamConfig,
    videoElement: HTMLVideoElement
  ): Promise<{ success: boolean; error?: string }> {
    const streamId = `${config.deviceId}-${config.profileToken}`

    try {
      console.log(`🌐 Starting WebRTC stream for ${streamId}`)

      // Create peer connection
      const peerConnection = new RTCPeerConnection({
        iceServers: config.iceServers || this.iceServers
      })

      // Set up event listeners
      this.setupPeerConnectionEvents(peerConnection, streamId, videoElement)

      // Create data channel for control messages
      const dataChannel = peerConnection.createDataChannel('control', {
        ordered: true
      })

      // Store connection
      this.connections.set(streamId, {
        peerConnection,
        dataChannel,
        isConnected: false,
        lastActivity: new Date()
      })

      // Request stream from backend
      const streamOffer = await this.requestStreamFromBackend(config)
      
      if (streamOffer.success) {
        // Create offer
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)

        // Send offer to signaling server or backend
        await this.sendSignalingMessage({
          type: 'offer',
          streamId,
          sdp: offer.sdp
        })

        console.log(`✅ WebRTC stream initiated for ${streamId}`)
        return { success: true }

      } else {
        throw new Error(streamOffer.error || 'Failed to request stream from backend')
      }

    } catch (error) {
      console.error(`❌ Failed to start WebRTC stream ${streamId}:`, error)
      this.cleanupConnection(streamId)
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Stop WebRTC streaming
   */
  async stopWebRTCStream(deviceId: string, profileToken: string): Promise<boolean> {
    const streamId = `${deviceId}-${profileToken}`
    
    try {
      console.log(`⏹️ Stopping WebRTC stream: ${streamId}`)
      
      const connection = this.connections.get(streamId)
      if (connection) {
        // Close peer connection
        connection.peerConnection.close()
        
        // Notify backend to stop stream
        await this.notifyBackendStopStream(streamId)
        
        // Remove from connections
        this.connections.delete(streamId)
      }

      console.log(`✅ WebRTC stream stopped: ${streamId}`)
      return true

    } catch (error) {
      console.error(`❌ Failed to stop WebRTC stream ${streamId}:`, error)
      return false
    }
  }

  /**
   * Setup peer connection event listeners
   */
  private setupPeerConnectionEvents(
    peerConnection: RTCPeerConnection,
    streamId: string,
    videoElement: HTMLVideoElement
  ) {
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          streamId,
          candidate: event.candidate
        })
      }
    }

    peerConnection.ontrack = (event) => {
      console.log(`📺 Received remote stream for ${streamId}`)
      const [remoteStream] = event.streams
      
      // Update connection
      const connection = this.connections.get(streamId)
      if (connection) {
        connection.remoteStream = remoteStream
        connection.isConnected = true
        connection.lastActivity = new Date()
        this.connections.set(streamId, connection)
      }

      // Attach stream to video element
      videoElement.srcObject = remoteStream
      videoElement.play().catch(error => {
        console.warn('⚠️ Video play failed:', error)
      })
    }

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState
      console.log(`🔗 WebRTC connection state changed: ${state}`)
      
      const connection = this.connections.get(streamId)
      if (connection) {
        connection.isConnected = state === 'connected'
        connection.lastActivity = new Date()
        this.connections.set(streamId, connection)
      }

      if (state === 'disconnected' || state === 'failed') {
        this.cleanupConnection(streamId)
      }
    }

    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel
      
      dataChannel.onmessage = (event) => {
        this.handleDataChannelMessage(streamId, JSON.parse(event.data))
      }
    }
  }

  /**
   * Handle signaling messages
   */
  private handleSignalingMessage(message: any) {
    const { type, streamId, sdp, candidate } = message

    const connection = this.connections.get(streamId)
    if (!connection) return

    switch (type) {
      case 'answer':
        connection.peerConnection.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp
        }))
        break

      case 'ice-candidate':
        connection.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        break

      default:
        console.warn(`Unknown signaling message type: ${type}`)
    }
  }

  /**
   * Send signaling message
   */
  private async sendSignalingMessage(message: any) {
    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      this.signalingServer.send(JSON.stringify(message))
    } else {
      // Fallback to HTTP signaling
      await fetch('/api/webrtc/signal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      })
    }
  }

  /**
   * Request stream from backend
   */
  private async requestStreamFromBackend(config: WebRTCStreamConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/webrtc/start-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId: config.deviceId,
          profileToken: config.profileToken,
          rtspUrl: config.rtspUrl,
          username: config.username,
          password: config.password
        })
      })

      const data = await response.json()
      return data

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      }
    }
  }

  /**
   * Notify backend to stop stream
   */
  private async notifyBackendStopStream(streamId: string) {
    try {
      await fetch('/api/webrtc/stop-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ streamId })
      })
    } catch (error) {
      console.warn(`⚠️ Failed to notify backend about stream stop:`, error)
    }
  }

  /**
   * Handle data channel messages
   */
  private handleDataChannelMessage(streamId: string, message: any) {
    console.log(`📨 Data channel message for ${streamId}:`, message)
    
    switch (message.type) {
      case 'ping':
        this.sendDataChannelMessage(streamId, { type: 'pong' })
        break
      
      case 'stats':
        // Handle stream statistics
        console.log(`📊 Stream stats for ${streamId}:`, message.data)
        break
        
      default:
        console.log(`Unknown data channel message: ${message.type}`)
    }
  }

  /**
   * Send data channel message
   */
  private sendDataChannelMessage(streamId: string, message: any) {
    const connection = this.connections.get(streamId)
    if (connection && connection.dataChannel && connection.dataChannel.readyState === 'open') {
      connection.dataChannel.send(JSON.stringify(message))
    }
  }

  /**
   * Clean up connection
   */
  private cleanupConnection(streamId: string) {
    const connection = this.connections.get(streamId)
    if (connection) {
      if (connection.dataChannel) {
        connection.dataChannel.close()
      }
      connection.peerConnection.close()
      this.connections.delete(streamId)
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(deviceId: string, profileToken: string): {
    isConnected: boolean
    connectionState?: string
    lastActivity?: Date
  } {
    const streamId = `${deviceId}-${profileToken}`
    const connection = this.connections.get(streamId)
    
    if (connection) {
      return {
        isConnected: connection.isConnected,
        connectionState: connection.peerConnection.connectionState,
        lastActivity: connection.lastActivity
      }
    }
    
    return { isConnected: false }
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): { [streamId: string]: any } {
    const active: { [streamId: string]: any } = {}
    
    for (const [streamId, connection] of this.connections.entries()) {
      if (connection.isConnected) {
        active[streamId] = {
          connectionState: connection.peerConnection.connectionState,
          lastActivity: connection.lastActivity
        }
      }
    }
    
    return active
  }

  /**
   * Send PTZ command through WebRTC data channel
   */
  async sendPTZCommand(deviceId: string, profileToken: string, command: string, params: any): Promise<boolean> {
    const streamId = `${deviceId}-${profileToken}`
    
    try {
      this.sendDataChannelMessage(streamId, {
        type: 'ptz-command',
        command,
        params
      })
      
      return true
    } catch (error) {
      console.error(`❌ Failed to send PTZ command:`, error)
      return false
    }
  }

  /**
   * Stop all WebRTC connections
   */
  async stopAllConnections() {
    console.log('🛑 Stopping all WebRTC connections')
    
    const stopPromises = Array.from(this.connections.keys()).map(streamId => {
      const [deviceId, profileToken] = streamId.split('-')
      return this.stopWebRTCStream(deviceId, profileToken)
    })

    await Promise.all(stopPromises)
    
    if (this.signalingServer) {
      this.signalingServer.close()
    }
    
    console.log('✅ All WebRTC connections stopped')
  }
}

// Singleton instance
export const webrtcStreamingService = new WebRTCStreamingService()

// Helper functions for React components
export const startWebRTCStreaming = async (
  config: WebRTCStreamConfig,
  videoElement: HTMLVideoElement
) => {
  return await webrtcStreamingService.startWebRTCStream(config, videoElement)
}

export const stopWebRTCStreaming = async (deviceId: string, profileToken: string) => {
  return await webrtcStreamingService.stopWebRTCStream(deviceId, profileToken)
}

export const getWebRTCStatus = (deviceId: string, profileToken: string) => {
  return webrtcStreamingService.getConnectionStatus(deviceId, profileToken)
}