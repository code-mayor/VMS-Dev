const { logger } = require('../utils/logger');
const fetch = require('node-fetch');

class DeviceStatusManager {
    constructor() {
        // Status definitions with priority levels
        this.statusDefinitions = {
            ONLINE: { value: 'online', priority: 1, color: 'green' },
            DISCOVERED: { value: 'discovered', priority: 2, color: 'blue' },
            AUTHENTICATED: { value: 'authenticated', priority: 3, color: 'cyan' },
            OFFLINE: { value: 'offline', priority: 4, color: 'gray' },
            ERROR: { value: 'error', priority: 5, color: 'red' },
            UNKNOWN: { value: 'unknown', priority: 6, color: 'yellow' }
        };

        // Health check intervals (in milliseconds)
        this.healthCheckInterval = 60000; // 1 minute
        this.quickCheckTimeout = 3000; // 3 seconds per device
    }

    /**
     * Determine device status based on discovery
     */
    getDiscoveryStatus(device) {
        if (!device) return this.statusDefinitions.UNKNOWN.value;

        // Check if device responded to discovery
        if (device.last_seen) {
            const lastSeenTime = new Date(device.last_seen).getTime();
            const now = Date.now();
            const timeDiff = now - lastSeenTime;

            // If seen within last 5 minutes, consider discovered
            if (timeDiff < 5 * 60 * 1000) {
                return this.statusDefinitions.DISCOVERED.value;
            }
        }

        return this.statusDefinitions.OFFLINE.value;
    }

    /**
     * Check device connectivity status
     */
    async checkDeviceHealth(device) {
        try {
            const checks = [];

            // Check 1: HTTP connectivity
            if (device.ip_address && device.port) {
                checks.push(this.checkHttpConnectivity(device));
            }

            // Check 2: ONVIF endpoint if available
            if (device.endpoint) {
                checks.push(this.checkOnvifEndpoint(device));
            }

            // Check 3: RTSP if authenticated
            if (device.rtsp_username && device.rtsp_password) {
                checks.push(this.checkRtspConnectivity(device));
            }

            const results = await Promise.allSettled(checks);

            // Determine status based on check results
            const successfulChecks = results.filter(r => r.status === 'fulfilled' && r.value).length;

            if (successfulChecks === checks.length && checks.length > 0) {
                return this.statusDefinitions.ONLINE.value;
            } else if (successfulChecks > 0) {
                return device.authenticated ?
                    this.statusDefinitions.AUTHENTICATED.value :
                    this.statusDefinitions.DISCOVERED.value;
            } else {
                return this.statusDefinitions.OFFLINE.value;
            }

        } catch (error) {
            logger.error(`Status check failed for device ${device.ip_address}:`, error);
            return this.statusDefinitions.ERROR.value;
        }
    }

    /**
     * Check HTTP connectivity
     */
    async checkHttpConnectivity(device) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.quickCheckTimeout);

            const response = await fetch(`http://${device.ip_address}:${device.port}`, {
                method: 'HEAD',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            return response.ok || response.status === 401 || response.status === 403;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check ONVIF endpoint
     */
    async checkOnvifEndpoint(device) {
        try {
            const endpoint = device.endpoint || `http://${device.ip_address}:${device.port}/onvif/device_service`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.quickCheckTimeout);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/soap+xml'
                },
                body: this.createSystemDateTimeRequest(),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            return response.ok || response.status === 401;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check RTSP connectivity (lightweight check)
     */
    async checkRtspConnectivity(device) {
        // For now, return true if credentials exist
        // In production, you'd use an RTSP library to actually test the connection
        return !!(device.rtsp_username && device.rtsp_password);
    }

    /**
     * Create minimal SOAP request for health check
     */
    createSystemDateTimeRequest() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>
  </soap:Body>
</soap:Envelope>`;
    }

    /**
     * Batch update device statuses
     */
    async updateDeviceStatuses(devices, dbAdapter) {
        const updates = [];

        for (const device of devices) {
            try {
                const newStatus = await this.checkDeviceHealth(device);

                if (newStatus !== device.status) {
                    updates.push({
                        id: device.id,
                        oldStatus: device.status,
                        newStatus: newStatus
                    });

                    await dbAdapter.run(
                        'UPDATE devices SET status = ?, last_health_check = CURRENT_TIMESTAMP WHERE id = ?',
                        [newStatus, device.id]
                    );
                }
            } catch (error) {
                logger.error(`Failed to update status for device ${device.id}:`, error);
            }
        }

        if (updates.length > 0) {
            logger.info(`Updated status for ${updates.length} devices`);
        }

        return updates;
    }

    /**
     * Get status color for UI
     */
    getStatusColor(status) {
        const definition = Object.values(this.statusDefinitions)
            .find(def => def.value === status);
        return definition ? definition.color : 'gray';
    }

    /**
     * Get all valid status values
     */
    getValidStatuses() {
        return Object.values(this.statusDefinitions).map(def => def.value);
    }
}

module.exports = { DeviceStatusManager };