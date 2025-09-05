interface OnvifProfile {
  token: string;
  name: string;
  videoSource: string;
  videoEncoder: string;
  audioSource?: string;
  audioEncoder?: string;
  rtspUri: string;
  httpUri?: string;
  snapshotUri?: string;
}

interface OnvifCapabilities {
  profiles: OnvifProfile[];
  streamingCapabilities: {
    rtspStreaming: boolean;
    httpStreaming: boolean;
    snapshotUri: boolean;
  };
  ptzCapabilities: {
    supportsPTZ: boolean;
    presets: boolean;
    homePosition: boolean;
  };
  deviceInfo: {
    manufacturer: string;
    model: string;
    firmwareVersion: string;
    serialNumber: string;
    hardwareId: string;
  };
}

interface DeviceStreamInfo {
  deviceId: string;
  device: {
    id: string;
    name: string;
    ip_address: string;
    manufacturer: string;
    model: string;
  };
  onvifCapabilities: OnvifCapabilities | null;
  streamProfiles: StreamProfile[];
  authenticationStatus: 'unknown' | 'valid' | 'invalid' | 'required';
  error?: string;
  discoveredAt: string;
  cached?: boolean;
}

interface StreamProfile {
  name: string;
  url: string;
  type: 'mjpeg' | 'rtsp' | 'http' | 'hls' | 'web';
  description: string;
  browserCompatible: boolean;
  priority: number;
  onvifProfile?: OnvifProfile;
}

class FrontendOnvifService {
  private apiBaseUrl: string;
  private cache = new Map<string, DeviceStreamInfo>();

  constructor() {
    this.apiBaseUrl = 'http://localhost:3001/api';
    console.log('🚀 Frontend ONVIF Service initialized');
  }

  private async getAuthHeaders() {
    const session = localStorage.getItem('onvif_session');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.accessToken) {
          headers['Authorization'] = `Bearer ${parsed.accessToken}`;
        }
      } catch (error) {
        console.error('Error parsing session:', error);
      }
    }

    return headers;
  }

  // Discover ONVIF profiles and capabilities for a device
  async discoverDeviceCapabilities(
    device: any, 
    credentials?: { username: string; password: string },
    forceRefresh = false
  ): Promise<DeviceStreamInfo> {
    const deviceId = device.id;
    console.log(`🔍 Starting ONVIF discovery for ${device.name} (${device.ip_address})`);

    // Check local cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.cache.get(deviceId);
      if (cached) {
        const cacheAge = Date.now() - new Date(cached.discoveredAt).getTime();
        if (cacheAge < 5 * 60 * 1000) { // 5 minutes
          console.log(`📋 Using local cached ONVIF data for ${device.name}`);
          return cached;
        }
      }
    }

    try {
      const headers = await this.getAuthHeaders();
      const body = {
        username: credentials?.username || device.username,
        password: credentials?.password || device.password,
        forceRefresh
      };

      console.log(`🌐 Making API request for ONVIF discovery: ${deviceId}`);
      
      const response = await fetch(`${this.apiBaseUrl}/onvif-profiles/discover/${deviceId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`ONVIF discovery API failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'ONVIF discovery failed');
      }

      const deviceInfo: DeviceStreamInfo = {
        deviceId: result.deviceId,
        device: result.device,
        onvifCapabilities: result.onvifCapabilities,
        streamProfiles: result.enhancedProfiles || result.streamProfiles || [],
        authenticationStatus: result.authenticationStatus || 'unknown',
        error: result.error,
        discoveredAt: result.discoveredAt,
        cached: result.cached
      };

      // Cache the result locally
      this.cache.set(deviceId, deviceInfo);

      console.log(`✅ ONVIF discovery completed for ${device.name}:`, {
        profileCount: deviceInfo.streamProfiles.length,
        authStatus: deviceInfo.authenticationStatus,
        hasCapabilities: !!deviceInfo.onvifCapabilities,
        cached: deviceInfo.cached
      });

      return deviceInfo;

    } catch (error) {
      console.error(`❌ ONVIF discovery failed for ${device.name}:`, error);
      
      // Return fallback info
      const fallbackInfo: DeviceStreamInfo = {
        deviceId,
        device: {
          id: device.id,
          name: device.name,
          ip_address: device.ip_address,
          manufacturer: device.manufacturer || 'Unknown',
          model: device.model || 'Unknown'
        },
        onvifCapabilities: null,
        streamProfiles: this.generateBasicFallbackProfiles(device, credentials),
        authenticationStatus: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        discoveredAt: new Date().toISOString()
      };

      this.cache.set(deviceId, fallbackInfo);
      return fallbackInfo;
    }
  }

  // Check if device is properly authenticated
  isDeviceAuthenticated(device: any): boolean {
    // Check basic requirements first
    const hasCredentials = !!(device.username && device.password);
    
    // Check cached authentication status
    const cached = this.cache.get(device.id);
    if (cached) {
      return hasCredentials && (
        cached.authenticationStatus === 'valid' ||
        device.authenticated === true ||
        device.status === 'authenticated'
      );
    }

    // Fallback to basic checks
    return hasCredentials && (
      device.authenticated === true ||
      device.status === 'authenticated'
    );
  }

  // Get authentication status for device
  getAuthenticationStatus(device: any): 'unknown' | 'valid' | 'invalid' | 'required' {
    const cached = this.cache.get(device.id);
    return cached?.authenticationStatus || 'unknown';
  }

  // Update device credentials and clear cache
  updateDeviceCredentials(device: any, username: string, password: string): void {
    // Clear cache to force re-discovery with new credentials
    this.clearDeviceCache(device.id);
    
    // Update device object
    device.username = username;
    device.password = password;
    
    console.log(`🔑 Updated credentials for device ${device.name}`);
  }

  // Get cached device information
  getCachedDeviceInfo(deviceId: string): DeviceStreamInfo | null {
    return this.cache.get(deviceId) || null;
  }

  // Clear cache for a device
  clearDeviceCache(deviceId: string): void {
    this.cache.delete(deviceId);
    console.log(`🗑️ Cleared local ONVIF cache for device ${deviceId}`);
    
    // Also clear backend cache
    this.clearBackendCache(deviceId).catch(error => {
      console.warn('Failed to clear backend cache:', error);
    });
  }

  // Clear all local cache
  clearAllCache(): void {
    this.cache.clear();
    console.log('🗑️ Cleared all local ONVIF cache');
  }

  // Clear backend cache
  private async clearBackendCache(deviceId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(`${this.apiBaseUrl}/onvif-profiles/cache/${deviceId}`, {
        method: 'DELETE',
        headers
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`🗑️ Cleared backend ONVIF cache for device ${deviceId}:`, result.message);
      }
    } catch (error) {
      console.warn(`Failed to clear backend cache for device ${deviceId}:`, error);
    }
  }

  // Test if specific stream URL works
  async testStreamUrl(url: string, timeout = 10000): Promise<{ success: boolean; error?: string; contentType?: string }> {
    try {
      console.log(`🧪 Testing stream URL via backend: ${url}`);
      
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(`${this.apiBaseUrl}/onvif-profiles/test-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url, timeout })
      });

      if (!response.ok) {
        throw new Error(`Stream test API failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.result) {
        console.log(`${result.result.success ? '✅' : '❌'} Stream URL test: ${url}`);
        return {
          success: result.result.success,
          error: result.result.error,
          contentType: result.result.contentType
        };
      } else {
        throw new Error(result.error || 'Stream test failed');
      }
    } catch (error) {
      console.log(`❌ Stream URL test error: ${url} - ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Generate enhanced fallback profiles when API fails
  private generateBasicFallbackProfiles(device: any, credentials?: { username: string; password: string }): StreamProfile[] {
    const { ip_address, manufacturer } = device;
    const username = credentials?.username || device.rtsp_username || device.username || '';
    const password = credentials?.password || device.rtsp_password || device.password || '';
    const encodedCreds = username && password 
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : '';

    console.log(`🎯 Generating enhanced fallback profiles for ${ip_address}`);

    const profiles: StreamProfile[] = [];
    let priority = 100;

    // PRIORITY 1: Browser-compatible streams
    profiles.push(
      {
        name: 'Profile 1 Snapshot (HTTP) 🌐',
        url: `http://${encodedCreds}${ip_address}/cgi-bin/snapshot.cgi?channel=1&profile=1`,
        type: 'http',
        description: 'HTTP snapshot for Profile 1 - Browser compatible',
        browserCompatible: true,
        priority: priority--
      },
      {
        name: 'MJPEG Profile 1 Stream 🌐',
        url: `http://${encodedCreds}${ip_address}/video.mjpg?channel=1&profile=1`,
        type: 'mjpeg',
        description: 'MJPEG live stream for Profile 1 - Browser compatible',
        browserCompatible: true,
        priority: priority--
      },
      {
        name: 'Profile 2 Snapshot (HTTP) 🌐',
        url: `http://${encodedCreds}${ip_address}/cgi-bin/snapshot.cgi?channel=1&profile=2`,
        type: 'http',
        description: 'HTTP snapshot for Profile 2 - Browser compatible',
        browserCompatible: true,
        priority: priority--
      }
    );

    // PRIORITY 2: Verified RTSP profile URLs 
    profiles.push(
      {
        name: 'Camera Profile 1 (RTSP) ✅',
        url: `rtsp://${encodedCreds}${ip_address}:554/profile1`,
        type: 'rtsp',
        description: 'Camera Profile 1 - Main stream (verified working)',
        browserCompatible: false,
        priority: priority--
      },
      {
        name: 'Camera Profile 2 (RTSP)',
        url: `rtsp://${encodedCreds}${ip_address}:554/profile2`,
        type: 'rtsp',
        description: 'Camera Profile 2 - Secondary stream',
        browserCompatible: false,
        priority: priority--
      },
      {
        name: 'Camera Profile 3 (RTSP)',
        url: `rtsp://${encodedCreds}${ip_address}:554/profile3`,
        type: 'rtsp',
        description: 'Camera Profile 3 - Additional stream',
        browserCompatible: false,
        priority: priority--
      }
    );

    // Add manufacturer-specific profiles
    const isHoneywell = manufacturer?.toLowerCase().includes('honeywell') || 
                       manufacturer?.toLowerCase().includes('hikvision');

    if (isHoneywell) {
      profiles.push(
        {
          name: 'Honeywell ISAPI Snapshot 🌐',
          url: `http://${encodedCreds}${ip_address}/ISAPI/Streaming/channels/1/picture`,
          type: 'http',
          description: 'Honeywell ISAPI snapshot endpoint - Browser compatible',
          browserCompatible: true,
          priority: priority--
        },
        {
          name: 'Honeywell MJPEG Stream 🌐',
          url: `http://${encodedCreds}${ip_address}/ISAPI/Streaming/channels/1/mjpeg`,
          type: 'mjpeg',
          description: 'Honeywell MJPEG live stream - Browser compatible',
          browserCompatible: true,
          priority: priority--
        },
        {
          name: 'Honeywell ISAPI Channel 1 (RTSP)',
          url: `rtsp://${encodedCreds}${ip_address}:554/Streaming/Channels/1`,
          type: 'rtsp',
          description: 'Honeywell ISAPI Channel 1 main stream',
          browserCompatible: false,
          priority: priority--
        }
      );
    }

    // Add generic fallback profiles
    profiles.push(
      {
        name: 'Generic Snapshot 🌐',
        url: `http://${encodedCreds}${ip_address}/jpg/image.jpg`,
        type: 'http',
        description: 'Generic snapshot URL - Browser compatible',
        browserCompatible: true,
        priority: priority--
      },
      {
        name: 'Generic Main Stream (RTSP)',
        url: `rtsp://${encodedCreds}${ip_address}:554/main`,
        type: 'rtsp',
        description: 'Generic main stream',
        browserCompatible: false,
        priority: priority--
      }
    );

    const sortedProfiles = profiles.sort((a, b) => b.priority - a.priority);
    
    const browserCompatibleCount = sortedProfiles.filter(p => p.browserCompatible).length;
    console.log(`🎬 Generated ${sortedProfiles.length} fallback profiles: ${browserCompatibleCount} browser-compatible`);

    return sortedProfiles;
  }
}

// Create singleton instance
const frontendOnvifService = new FrontendOnvifService();

export { frontendOnvifService, type DeviceStreamInfo, type StreamProfile, type OnvifCapabilities, type OnvifProfile };