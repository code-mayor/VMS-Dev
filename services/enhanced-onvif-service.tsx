import { OnvifProfileDiscovery, type OnvifProfile, type OnvifCapabilities } from './onvif-profile-discovery';

interface DeviceStreamInfo {
  device: any;
  onvifCapabilities: OnvifCapabilities | null;
  streamProfiles: any[];
  lastDiscovery: Date | null;
  authenticationStatus: 'unknown' | 'valid' | 'invalid' | 'required';
}

class EnhancedOnvifService {
  private deviceCache = new Map<string, DeviceStreamInfo>();
  private discoveryInProgress = new Set<string>();

  constructor() {
    console.log('🚀 Enhanced ONVIF Service initialized');
  }

  // Check if device credentials are properly configured
  isDeviceAuthenticated(device: any): boolean {
    // Check if device has credentials
    const hasCredentials = !!(device.username && device.password);
    
    // Check authentication status from cache
    const cachedInfo = this.deviceCache.get(device.id);
    const authStatus = cachedInfo?.authenticationStatus;
    
    // Device is authenticated if:
    // 1. Has credentials AND
    // 2. Either status is 'valid' OR status is unknown but device was previously authenticated
    return hasCredentials && (
      authStatus === 'valid' || 
      device.authenticated === true ||
      device.status === 'authenticated'
    );
  }

  // Discover ONVIF profiles and capabilities for a device
  async discoverDeviceCapabilities(device: any, forceRefresh = false): Promise<DeviceStreamInfo> {
    const deviceId = device.id;
    
    // Check cache first
    const cachedInfo = this.deviceCache.get(deviceId);
    if (!forceRefresh && cachedInfo && cachedInfo.lastDiscovery) {
      const cacheAge = Date.now() - cachedInfo.lastDiscovery.getTime();
      if (cacheAge < 5 * 60 * 1000) { // 5 minutes cache
        console.log(`📋 Using cached ONVIF data for ${device.name}`);
        return cachedInfo;
      }
    }

    // Prevent concurrent discovery for same device
    if (this.discoveryInProgress.has(deviceId)) {
      console.log(`⏳ ONVIF discovery already in progress for ${device.name}`);
      if (cachedInfo) {
        return cachedInfo;
      }
      // Wait for ongoing discovery
      await this.waitForDiscovery(deviceId);
      return this.deviceCache.get(deviceId) || this.createEmptyDeviceInfo(device);
    }

    this.discoveryInProgress.add(deviceId);
    console.log(`🔍 Starting ONVIF discovery for ${device.name} (${device.ip_address})`);

    try {
      const discovery = new OnvifProfileDiscovery(device);
      
      // Set credentials if available
      if (device.username && device.password) {
        discovery.setCredentials(device.username, device.password);
      }

      let onvifCapabilities: OnvifCapabilities | null = null;
      let authenticationStatus: 'unknown' | 'valid' | 'invalid' | 'required' = 'unknown';

      try {
        // Attempt ONVIF discovery
        onvifCapabilities = await discovery.discoverCapabilities();
        authenticationStatus = 'valid';
        console.log(`✅ ONVIF discovery successful for ${device.name}`);
      } catch (error: any) {
        console.log(`⚠️ ONVIF discovery failed for ${device.name}:`, error.message);
        
        // Determine authentication status based on error
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          authenticationStatus = 'required';
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          authenticationStatus = 'invalid';
        } else {
          authenticationStatus = 'unknown';
        }
      }

      // Generate stream profiles (fallback if ONVIF discovery fails)
      let streamProfiles: any[] = [];
      if (onvifCapabilities) {
        streamProfiles = discovery.generateStreamProfiles(onvifCapabilities);
      } else {
        // Generate fallback profiles based on device info
        streamProfiles = this.generateFallbackProfiles(device);
      }

      const deviceInfo: DeviceStreamInfo = {
        device,
        onvifCapabilities,
        streamProfiles,
        lastDiscovery: new Date(),
        authenticationStatus
      };

      this.deviceCache.set(deviceId, deviceInfo);
      console.log(`📊 Cached ONVIF data for ${device.name}:`, {
        profileCount: streamProfiles.length,
        authStatus: authenticationStatus,
        hasCapabilities: !!onvifCapabilities
      });

      return deviceInfo;

    } catch (error) {
      console.error(`❌ Critical error during ONVIF discovery for ${device.name}:`, error);
      
      // Return fallback info
      const fallbackInfo = this.createEmptyDeviceInfo(device);
      fallbackInfo.authenticationStatus = 'unknown';
      this.deviceCache.set(deviceId, fallbackInfo);
      return fallbackInfo;
      
    } finally {
      this.discoveryInProgress.delete(deviceId);
    }
  }

  // Generate stream profiles for devices where ONVIF discovery failed
  private generateFallbackProfiles(device: any): any[] {
    const { ip_address, username, password, manufacturer } = device;
    const encodedCreds = username && password 
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : '';

    const profiles: any[] = [];
    const isHoneywell = manufacturer?.toLowerCase().includes('honeywell') || 
                       manufacturer?.toLowerCase().includes('hikvision');

    // Manufacturer-specific profiles
    if (isHoneywell) {
      profiles.push(
        {
          name: 'Honeywell Profile 1 (RTSP)',
          url: `rtsp://${encodedCreds}${ip_address}:554/profile1`,
          type: 'rtsp',
          description: 'Honeywell Profile 1 RTSP stream',
          browserCompatible: false,
          priority: 10
        },
        {
          name: 'Honeywell Profile 2 (RTSP)', 
          url: `rtsp://${encodedCreds}${ip_address}:554/profile2`,
          type: 'rtsp',
          description: 'Honeywell Profile 2 RTSP stream',
          browserCompatible: false,
          priority: 9
        },
        {
          name: 'Honeywell Streaming Channel 101',
          url: `rtsp://${encodedCreds}${ip_address}:554/Streaming/Channels/101`,
          type: 'rtsp',
          description: 'Honeywell Streaming Channel 101',
          browserCompatible: false,
          priority: 8
        }
      );
    }

    // Generic RTSP profiles
    profiles.push(
      {
        name: 'Generic Live Stream (RTSP)',
        url: `rtsp://${encodedCreds}${ip_address}:554/live`,
        type: 'rtsp',
        description: 'Generic live RTSP stream',
        browserCompatible: false,
        priority: 5
      },
      {
        name: 'Generic ONVIF Stream (RTSP)',
        url: `rtsp://${encodedCreds}${ip_address}:554/onvif1`,
        type: 'rtsp',
        description: 'Generic ONVIF RTSP stream',
        browserCompatible: false,
        priority: 4
      }
    );

    // Browser-compatible fallbacks
    if (isHoneywell) {
      profiles.push(
        {
          name: 'Honeywell ISAPI Snapshot',
          url: `http://${encodedCreds}${ip_address}/ISAPI/Streaming/channels/101/picture`,
          type: 'http',
          description: 'Honeywell ISAPI snapshot',
          browserCompatible: true,
          priority: 7
        },
        {
          name: 'Honeywell CGI MJPEG',
          url: `http://${encodedCreds}${ip_address}/cgi-bin/mjpg/video.cgi?channel=1&subtype=1`,
          type: 'mjpeg',
          description: 'Honeywell CGI MJPEG stream',
          browserCompatible: true,
          priority: 6
        }
      );
    }

    profiles.push(
      {
        name: 'Generic MJPEG Stream',
        url: `http://${encodedCreds}${ip_address}/mjpeg/1`,
        type: 'mjpeg',
        description: 'Generic MJPEG stream',
        browserCompatible: true,
        priority: 3
      },
      {
        name: 'Generic Snapshot',
        url: `http://${encodedCreds}${ip_address}/jpg/image.jpg`,
        type: 'http',
        description: 'Generic snapshot URL',
        browserCompatible: true,
        priority: 2
      }
    );

    return profiles.sort((a, b) => b.priority - a.priority);
  }

  private createEmptyDeviceInfo(device: any): DeviceStreamInfo {
    return {
      device,
      onvifCapabilities: null,
      streamProfiles: this.generateFallbackProfiles(device),
      lastDiscovery: null,
      authenticationStatus: 'unknown'
    };
  }

  private async waitForDiscovery(deviceId: string): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const checkInterval = 500; // 500ms
    let waited = 0;

    while (this.discoveryInProgress.has(deviceId) && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
  }

  // Get cached device information
  getCachedDeviceInfo(deviceId: string): DeviceStreamInfo | null {
    return this.deviceCache.get(deviceId) || null;
  }

  // Clear cache for a device (useful when credentials change)
  clearDeviceCache(deviceId: string): void {
    this.deviceCache.delete(deviceId);
    console.log(`🗑️ Cleared ONVIF cache for device ${deviceId}`);
  }

  // Clear all cache
  clearAllCache(): void {
    this.deviceCache.clear();
    console.log('🗑️ Cleared all ONVIF cache');
  }

  // Get authentication status for device
  getAuthenticationStatus(device: any): 'unknown' | 'valid' | 'invalid' | 'required' {
    const cachedInfo = this.deviceCache.get(device.id);
    return cachedInfo?.authenticationStatus || 'unknown';
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

  // Test if specific stream URL works
  async testStreamUrl(url: string): Promise<{ success: boolean; error?: string; contentType?: string }> {
    try {
      console.log(`🧪 Testing stream URL: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        method: 'HEAD', // Use HEAD to avoid downloading content
        signal: controller.signal,
        headers: {
          'User-Agent': 'ONVIF-VMS/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        console.log(`✅ Stream URL test successful: ${url} (${contentType})`);
        return { 
          success: true, 
          contentType 
        };
      } else {
        console.log(`❌ Stream URL test failed: ${url} (${response.status})`);
        return { 
          success: false, 
          error: `HTTP ${response.status}` 
        };
      }
    } catch (error: any) {
      console.log(`❌ Stream URL test error: ${url} - ${error.message}`);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

// Create singleton instance
const enhancedOnvifService = new EnhancedOnvifService();

export { enhancedOnvifService, type DeviceStreamInfo };