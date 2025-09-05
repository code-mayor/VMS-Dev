import { XMLParser } from 'fast-xml-parser'

interface OnvifProfile {
  name: string
  token: string
  videoSourceToken: string
  videoEncoderToken: string
  audioSourceToken?: string
  audioEncoderToken?: string
  ptzToken?: string
  videoEncoder: {
    encoding: string
    resolution: {
      width: number
      height: number
    }
    quality: number
    frameRateLimit: number
    bitrateLimit: number
  }
  audioEncoder?: {
    encoding: string
    bitrate: number
    sampleRate: number
  }
  streamUri: {
    rtsp: string
    http?: string
    https?: string
  }
  snapShotUri?: string
  ptzCapable: boolean
}

interface OnvifCapabilities {
  device: boolean
  events: boolean
  imaging: boolean
  media: boolean
  ptz: boolean
  deviceIO?: boolean
  analytics?: boolean
  recording?: boolean
  search?: boolean
  replay?: boolean
}

interface OnvifDeviceInformation {
  manufacturer: string
  model: string
  firmwareVersion: string
  serialNumber: string
  hardwareId: string
}

export class OnvifProfileDiscovery {
  private deviceUrl: string
  private username: string
  private password: string
  private capabilities: OnvifCapabilities | null = null
  private profiles: OnvifProfile[] = []
  private deviceInfo: OnvifDeviceInformation | null = null

  constructor(deviceIp: string, port: number = 80, endpoint?: string) {
    this.deviceUrl = endpoint || `http://${deviceIp}:${port}/onvif/device_service`
    this.username = ''
    this.password = ''
  }

  setCredentials(username: string, password: string) {
    this.username = username
    this.password = password
  }

  /**
   * Main discovery method that gets all ONVIF information
   */
  async discoverAll(): Promise<{
    capabilities: OnvifCapabilities
    profiles: OnvifProfile[]
    deviceInfo: OnvifDeviceInformation
    streamingUrls: { [key: string]: string[] }
    enhancedProfiles: any[]
  }> {
    try {
      console.log(`🔍 Starting comprehensive ONVIF discovery for ${this.deviceUrl}`)

      // Step 1: Get device capabilities
      this.capabilities = await this.getCapabilities()
      console.log('✅ Capabilities discovered:', Object.keys(this.capabilities).filter(key => this.capabilities![key as keyof OnvifCapabilities]))

      // Step 2: Get device information
      this.deviceInfo = await this.getDeviceInformation()
      console.log('✅ Device info:', this.deviceInfo)

      // Step 3: Get media profiles
      this.profiles = await this.getProfiles()
      console.log(`✅ Found ${this.profiles.length} media profiles`)

      // Step 4: Generate streaming URLs for each profile
      const streamingUrls = await this.generateStreamingUrls()
      console.log('✅ Streaming URLs generated')

      // Step 5: Create enhanced profiles with all information
      const enhancedProfiles = this.createEnhancedProfiles()
      
      return {
        capabilities: this.capabilities,
        profiles: this.profiles,
        deviceInfo: this.deviceInfo,
        streamingUrls,
        enhancedProfiles
      }

    } catch (error) {
      console.error('❌ ONVIF discovery failed:', error)
      throw error
    }
  }

  /**
   * Get ONVIF device capabilities
   */
  private async getCapabilities(): Promise<OnvifCapabilities> {
    const soapBody = `
      <soap:Body>
        <tds:GetCapabilities>
          <tds:Category>All</tds:Category>
        </tds:GetCapabilities>
      </soap:Body>
    `

    const response = await this.sendSoapRequest(soapBody)
    const parser = new XMLParser({ ignoreAttributes: false })
    const result = parser.parse(response)

    const capabilities = result['soap:Envelope']['soap:Body']['tds:GetCapabilitiesResponse']['tds:Capabilities']
    
    return {
      device: !!capabilities['tt:Device'],
      events: !!capabilities['tt:Events'],
      imaging: !!capabilities['tt:Imaging'],
      media: !!capabilities['tt:Media'],
      ptz: !!capabilities['tt:PTZ'],
      deviceIO: !!capabilities['tt:DeviceIO'],
      analytics: !!capabilities['tt:Analytics'],
      recording: !!capabilities['tt:Recording'],
      search: !!capabilities['tt:Search'],
      replay: !!capabilities['tt:Replay']
    }
  }

  /**
   * Get device information
   */
  private async getDeviceInformation(): Promise<OnvifDeviceInformation> {
    const soapBody = `
      <soap:Body>
        <tds:GetDeviceInformation/>
      </soap:Body>
    `

    const response = await this.sendSoapRequest(soapBody)
    const parser = new XMLParser()
    const result = parser.parse(response)

    const deviceInfo = result['soap:Envelope']['soap:Body']['tds:GetDeviceInformationResponse']
    
    return {
      manufacturer: deviceInfo['tds:Manufacturer'] || 'Unknown',
      model: deviceInfo['tds:Model'] || 'Unknown',
      firmwareVersion: deviceInfo['tds:FirmwareVersion'] || 'Unknown',
      serialNumber: deviceInfo['tds:SerialNumber'] || 'Unknown',
      hardwareId: deviceInfo['tds:HardwareId'] || 'Unknown'
    }
  }

  /**
   * Get media profiles with detailed information
   */
  private async getProfiles(): Promise<OnvifProfile[]> {
    // First get the media service URL
    const mediaServiceUrl = await this.getMediaServiceUrl()
    
    const soapBody = `
      <soap:Body>
        <trt:GetProfiles/>
      </soap:Body>
    `

    const response = await this.sendSoapRequest(soapBody, mediaServiceUrl)
    const parser = new XMLParser({ ignoreAttributes: false })
    const result = parser.parse(response)

    const profilesResponse = result['soap:Envelope']['soap:Body']['trt:GetProfilesResponse']['trt:Profiles']
    const profilesArray = Array.isArray(profilesResponse) ? profilesResponse : [profilesResponse]

    const profiles: OnvifProfile[] = []

    for (const profile of profilesArray) {
      try {
        const profileData: OnvifProfile = {
          name: profile['@_token'] || `Profile_${profiles.length + 1}`,
          token: profile['@_token'],
          videoSourceToken: profile['tt:VideoSourceConfiguration']?.['@_token'] || '',
          videoEncoderToken: profile['tt:VideoEncoderConfiguration']?.['@_token'] || '',
          audioSourceToken: profile['tt:AudioSourceConfiguration']?.['@_token'],
          audioEncoderToken: profile['tt:AudioEncoderConfiguration']?.['@_token'],
          ptzToken: profile['tt:PTZConfiguration']?.['@_token'],
          videoEncoder: {
            encoding: profile['tt:VideoEncoderConfiguration']?.['tt:Encoding'] || 'H264',
            resolution: {
              width: parseInt(profile['tt:VideoEncoderConfiguration']?.['tt:Resolution']?.['tt:Width']) || 1920,
              height: parseInt(profile['tt:VideoEncoderConfiguration']?.['tt:Resolution']?.['tt:Height']) || 1080
            },
            quality: parseFloat(profile['tt:VideoEncoderConfiguration']?.['tt:Quality']) || 5,
            frameRateLimit: parseInt(profile['tt:VideoEncoderConfiguration']?.['tt:RateControl']?.['tt:FrameRateLimit']) || 25,
            bitrateLimit: parseInt(profile['tt:VideoEncoderConfiguration']?.['tt:RateControl']?.['tt:BitrateLimit']) || 2048
          },
          streamUri: {
            rtsp: '',  // Will be filled later
            http: '',
            https: ''
          },
          snapShotUri: '',
          ptzCapable: !!profile['tt:PTZConfiguration']
        }

        // Get streaming URIs for this profile
        const streamUri = await this.getStreamUri(profileData.token, mediaServiceUrl)
        profileData.streamUri = streamUri

        // Get snapshot URI
        const snapshotUri = await this.getSnapshotUri(profileData.token, mediaServiceUrl)
        profileData.snapShotUri = snapshotUri

        profiles.push(profileData)
        
        console.log(`✅ Profile discovered: ${profileData.name} (${profileData.videoEncoder.resolution.width}x${profileData.videoEncoder.resolution.height})`)

      } catch (error) {
        console.warn(`⚠️ Error processing profile:`, error)
      }
    }

    return profiles
  }

  /**
   * Get streaming URI for a specific profile
   */
  private async getStreamUri(profileToken: string, mediaServiceUrl: string): Promise<{ rtsp: string; http?: string; https?: string }> {
    const soapBody = `
      <soap:Body>
        <trt:GetStreamUri>
          <trt:StreamSetup>
            <tt:Stream>RTP-Unicast</tt:Stream>
            <tt:Transport>
              <tt:Protocol>RTSP</tt:Protocol>
            </tt:Transport>
          </trt:StreamSetup>
          <trt:ProfileToken>${profileToken}</trt:ProfileToken>
        </trt:GetStreamUri>
      </soap:Body>
    `

    try {
      const response = await this.sendSoapRequest(soapBody, mediaServiceUrl)
      const parser = new XMLParser()
      const result = parser.parse(response)

      const uri = result['soap:Envelope']['soap:Body']['trt:GetStreamUriResponse']['trt:MediaUri']['tt:Uri']
      
      return {
        rtsp: uri || '',
        http: uri?.replace('rtsp://', 'http://').replace(':554/', ':80/'),
        https: uri?.replace('rtsp://', 'https://').replace(':554/', ':443/')
      }
    } catch (error) {
      console.warn(`⚠️ Failed to get stream URI for profile ${profileToken}:`, error)
      return { rtsp: '' }
    }
  }

  /**
   * Get snapshot URI for a specific profile
   */
  private async getSnapshotUri(profileToken: string, mediaServiceUrl: string): Promise<string> {
    const soapBody = `
      <soap:Body>
        <trt:GetSnapshotUri>
          <trt:ProfileToken>${profileToken}</trt:ProfileToken>
        </trt:GetSnapshotUri>
      </soap:Body>
    `

    try {
      const response = await this.sendSoapRequest(soapBody, mediaServiceUrl)
      const parser = new XMLParser()
      const result = parser.parse(response)

      return result['soap:Envelope']['soap:Body']['trt:GetSnapshotUriResponse']['trt:MediaUri']['tt:Uri'] || ''
    } catch (error) {
      console.warn(`⚠️ Failed to get snapshot URI for profile ${profileToken}:`, error)
      return ''
    }
  }

  /**
   * Get media service URL from capabilities
   */
  private async getMediaServiceUrl(): Promise<string> {
    if (!this.capabilities?.media) {
      throw new Error('Media service not available')
    }

    // For most ONVIF devices, the media service is at /onvif/media_service
    const baseUrl = this.deviceUrl.replace('/onvif/device_service', '')
    return `${baseUrl}/onvif/media_service`
  }

  /**
   * Generate all possible streaming URLs for discovered profiles
   */
  private async generateStreamingUrls(): Promise<{ [key: string]: string[] }> {
    const streamingUrls: { [key: string]: string[] } = {}

    for (const profile of this.profiles) {
      const urls: string[] = []

      // Add RTSP URL
      if (profile.streamUri.rtsp) {
        urls.push(profile.streamUri.rtsp)
      }

      // Add HTTP URL if available
      if (profile.streamUri.http) {
        urls.push(profile.streamUri.http)
      }

      // Add HTTPS URL if available  
      if (profile.streamUri.https) {
        urls.push(profile.streamUri.https)
      }

      // Add common RTSP path variations for compatibility
      const baseUrl = this.deviceUrl.replace('/onvif/device_service', '')
      const ip = baseUrl.match(/http:\/\/([^:\/]+)/)?.[1]
      if (ip) {
        urls.push(`rtsp://${ip}:554/profile${profile.token}`)
        urls.push(`rtsp://${ip}:554/${profile.token}`)
        urls.push(`rtsp://${ip}:554/profile${this.profiles.indexOf(profile) + 1}`)
        urls.push(`rtsp://${ip}:554/stream${this.profiles.indexOf(profile) + 1}`)
      }

      streamingUrls[profile.name] = urls.filter(url => url) // Remove empty URLs
    }

    return streamingUrls
  }

  /**
   * Create enhanced profiles with all discovered information
   */
  private createEnhancedProfiles(): any[] {
    return this.profiles.map((profile, index) => ({
      ...profile,
      displayName: `${profile.name} (${profile.videoEncoder.resolution.width}x${profile.videoEncoder.resolution.height})`,
      profileIndex: index + 1,
      capabilities: {
        video: true,
        audio: !!profile.audioEncoderToken,
        ptz: profile.ptzCapable,
        snapshot: !!profile.snapShotUri
      },
      streamingOptions: {
        rtsp: profile.streamUri.rtsp,
        http: profile.streamUri.http,
        https: profile.streamUri.https,
        snapshot: profile.snapShotUri
      },
      videoInfo: {
        encoding: profile.videoEncoder.encoding,
        resolution: `${profile.videoEncoder.resolution.width}x${profile.videoEncoder.resolution.height}`,
        frameRate: profile.videoEncoder.frameRateLimit,
        bitrate: profile.videoEncoder.bitrateLimit,
        quality: profile.videoEncoder.quality
      },
      audioInfo: profile.audioEncoderToken ? {
        encoding: profile.audioEncoder?.encoding || 'AAC',
        bitrate: profile.audioEncoder?.bitrate || 64,
        sampleRate: profile.audioEncoder?.sampleRate || 48000
      } : null,
      deviceInfo: this.deviceInfo
    }))
  }

  /**
   * Send SOAP request to ONVIF device
   */
  private async sendSoapRequest(soapBody: string, serviceUrl?: string): Promise<string> {
    const url = serviceUrl || this.deviceUrl
    
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl" 
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl" 
  xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Header/>
  ${soapBody}
</soap:Envelope>`

    const headers: { [key: string]: string } = {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': soapEnvelope.length.toString()
    }

    // Add authentication if credentials are provided
    if (this.username && this.password) {
      headers['Authorization'] = 'Basic ' + btoa(`${this.username}:${this.password}`)
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: soapEnvelope
    })

    if (!response.ok) {
      throw new Error(`ONVIF request failed: ${response.status} ${response.statusText}`)
    }

    return await response.text()
  }

  /**
   * Test ONVIF connectivity
   */
  async testConnectivity(): Promise<boolean> {
    try {
      await this.getCapabilities()
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Get quick profile summary for UI display
   */
  getProfileSummary(): Array<{ name: string; resolution: string; encoding: string; streamUrl: string }> {
    return this.profiles.map(profile => ({
      name: profile.name,
      resolution: `${profile.videoEncoder.resolution.width}x${profile.videoEncoder.resolution.height}`,
      encoding: profile.videoEncoder.encoding,
      streamUrl: profile.streamUri.rtsp
    }))
  }
}

// Helper function for backend integration
export const discoverOnvifProfiles = async (
  deviceIp: string, 
  port: number = 80, 
  username: string, 
  password: string,
  endpoint?: string
) => {
  const discovery = new OnvifProfileDiscovery(deviceIp, port, endpoint)
  discovery.setCredentials(username, password)
  
  try {
    const result = await discovery.discoverAll()
    return {
      success: true,
      ...result
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      capabilities: null,
      profiles: [],
      deviceInfo: null,
      streamingUrls: {},
      enhancedProfiles: []
    }
  }
}