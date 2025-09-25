const { logger } = require('../utils/logger');

class MotionWebSocketService {
    constructor(io) {
        this.io = io;
        this.connections = new Map(); // socketId -> { userId, deviceIds }
        this.deviceSubscriptions = new Map(); // deviceId -> Set of socketIds
        this.motionAlerts = new Map(); // deviceId -> recent alerts
        this.alertRetentionTime = 60000; // Keep alerts for 1 minute

        this.setupSocketHandlers();
        this.startCleanupTask();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            logger.info(`Motion WebSocket client connected: ${socket.id}`);

            // Handle authentication
            socket.on('authenticate', (data) => {
                this.handleAuthentication(socket, data);
            });

            // Handle device subscription
            socket.on('subscribe-device', (deviceId) => {
                this.subscribeToDevice(socket, deviceId);
            });

            // Handle device unsubscription
            socket.on('unsubscribe-device', (deviceId) => {
                this.unsubscribeFromDevice(socket, deviceId);
            });

            // Handle bulk subscription for dashboard
            socket.on('subscribe-all-devices', (deviceIds) => {
                this.subscribeToMultipleDevices(socket, deviceIds);
            });

            // Handle motion alert acknowledgement
            socket.on('acknowledge-alert', (data) => {
                this.acknowledgeAlert(socket, data);
            });

            // Handle configuration updates
            socket.on('update-motion-config', (data) => {
                this.updateMotionConfig(socket, data);
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                this.handleDisconnection(socket);
            });
        });
    }

    handleAuthentication(socket, data) {
        const { userId, token } = data;

        // Verify token (implement proper JWT verification)
        if (!this.verifyToken(token)) {
            socket.emit('auth-error', { message: 'Invalid token' });
            socket.disconnect();
            return;
        }

        // Store connection info
        this.connections.set(socket.id, {
            userId,
            deviceIds: new Set(),
            authenticated: true
        });

        socket.emit('auth-success', {
            message: 'Authenticated successfully',
            userId
        });

        // Send any pending alerts for user's devices
        this.sendPendingAlerts(socket);
    }

    verifyToken(token) {
        // Implement JWT verification
        // For now, accept any token in development
        return process.env.NODE_ENV === 'development' || token;
    }

    subscribeToDevice(socket, deviceId) {
        const connection = this.connections.get(socket.id);
        if (!connection?.authenticated) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }

        // Add device to user's subscription
        connection.deviceIds.add(deviceId);

        // Add socket to device's subscriber list
        if (!this.deviceSubscriptions.has(deviceId)) {
            this.deviceSubscriptions.set(deviceId, new Set());
        }
        this.deviceSubscriptions.get(deviceId).add(socket.id);

        socket.join(`device-${deviceId}`);

        socket.emit('subscription-success', {
            deviceId,
            message: `Subscribed to device ${deviceId}`
        });

        // Send recent alerts for this device
        this.sendDeviceAlerts(socket, deviceId);
    }

    unsubscribeFromDevice(socket, deviceId) {
        const connection = this.connections.get(socket.id);
        if (!connection) return;

        connection.deviceIds.delete(deviceId);

        const subscribers = this.deviceSubscriptions.get(deviceId);
        if (subscribers) {
            subscribers.delete(socket.id);
            if (subscribers.size === 0) {
                this.deviceSubscriptions.delete(deviceId);
            }
        }

        socket.leave(`device-${deviceId}`);

        socket.emit('unsubscription-success', {
            deviceId,
            message: `Unsubscribed from device ${deviceId}`
        });
    }

    subscribeToMultipleDevices(socket, deviceIds) {
        if (!Array.isArray(deviceIds)) return;

        deviceIds.forEach(deviceId => {
            this.subscribeToDevice(socket, deviceId);
        });
    }

    broadcastMotionAlert(alert) {
        const { deviceId, timestamp, type, confidence, objects, alertLevel } = alert;

        // Store alert for late subscribers
        if (!this.motionAlerts.has(deviceId)) {
            this.motionAlerts.set(deviceId, []);
        }

        const alerts = this.motionAlerts.get(deviceId);
        alerts.push({
            ...alert,
            id: `alert-${deviceId}-${Date.now()}`,
            acknowledged: false
        });

        // Keep only recent alerts
        const cutoffTime = Date.now() - this.alertRetentionTime;
        this.motionAlerts.set(
            deviceId,
            alerts.filter(a => new Date(a.timestamp).getTime() > cutoffTime)
        );

        // Broadcast to all subscribers of this device
        this.io.to(`device-${deviceId}`).emit('motion-alert', {
            deviceId,
            timestamp,
            type,
            confidence,
            objects,
            alertLevel,
            summary: this.generateAlertSummary(objects)
        });

        // Log high priority alerts
        if (alertLevel === 'high') {
            logger.warn(`HIGH PRIORITY: Motion detected on device ${deviceId} - ${this.generateAlertSummary(objects)}`);
        }
    }

    generateAlertSummary(objects) {
        if (!objects) return 'General motion detected';

        const summaryParts = [];

        if (objects.living?.human?.length > 0) {
            summaryParts.push(`${objects.living.human.length} person(s)`);
        }

        if (objects.living?.animal?.length > 0) {
            const animals = objects.living.animal.map(a => a.class).join(', ');
            summaryParts.push(`animal(s): ${animals}`);
        }

        if (objects.nonLiving?.vehicle?.length > 0) {
            summaryParts.push(`${objects.nonLiving.vehicle.length} vehicle(s)`);
        }

        return summaryParts.length > 0
            ? `Detected: ${summaryParts.join(', ')}`
            : 'Motion detected';
    }

    acknowledgeAlert(socket, data) {
        const { deviceId, alertId } = data;
        const connection = this.connections.get(socket.id);

        if (!connection?.authenticated) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }

        // Update alert status
        const alerts = this.motionAlerts.get(deviceId);
        if (alerts) {
            const alert = alerts.find(a => a.id === alertId);
            if (alert) {
                alert.acknowledged = true;
                alert.acknowledgedBy = connection.userId;
                alert.acknowledgedAt = new Date().toISOString();
            }
        }

        // Broadcast acknowledgement to all subscribers
        this.io.to(`device-${deviceId}`).emit('alert-acknowledged', {
            deviceId,
            alertId,
            acknowledgedBy: connection.userId
        });
    }

    updateMotionConfig(socket, data) {
        const { deviceId, config } = data;
        const connection = this.connections.get(socket.id);

        if (!connection?.authenticated) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }

        // Broadcast config update to all subscribers
        this.io.to(`device-${deviceId}`).emit('config-updated', {
            deviceId,
            config,
            updatedBy: connection.userId
        });
    }

    sendPendingAlerts(socket) {
        const connection = this.connections.get(socket.id);
        if (!connection) return;

        connection.deviceIds.forEach(deviceId => {
            this.sendDeviceAlerts(socket, deviceId);
        });
    }

    sendDeviceAlerts(socket, deviceId) {
        const alerts = this.motionAlerts.get(deviceId);
        if (!alerts || alerts.length === 0) return;

        // Send unacknowledged alerts
        const unacknowledged = alerts.filter(a => !a.acknowledged);
        if (unacknowledged.length > 0) {
            socket.emit('pending-alerts', {
                deviceId,
                alerts: unacknowledged
            });
        }
    }

    handleDisconnection(socket) {
        const connection = this.connections.get(socket.id);
        if (!connection) return;

        // Clean up subscriptions
        connection.deviceIds.forEach(deviceId => {
            const subscribers = this.deviceSubscriptions.get(deviceId);
            if (subscribers) {
                subscribers.delete(socket.id);
                if (subscribers.size === 0) {
                    this.deviceSubscriptions.delete(deviceId);
                }
            }
        });

        this.connections.delete(socket.id);
        logger.info(`Motion WebSocket client disconnected: ${socket.id}`);
    }

    startCleanupTask() {
        // Clean up old alerts periodically
        setInterval(() => {
            const cutoffTime = Date.now() - this.alertRetentionTime;

            this.motionAlerts.forEach((alerts, deviceId) => {
                const filteredAlerts = alerts.filter(
                    a => new Date(a.timestamp).getTime() > cutoffTime
                );

                if (filteredAlerts.length === 0) {
                    this.motionAlerts.delete(deviceId);
                } else {
                    this.motionAlerts.set(deviceId, filteredAlerts);
                }
            });
        }, 30000); // Run every 30 seconds
    }

    getStatistics() {
        return {
            activeConnections: this.connections.size,
            subscribedDevices: this.deviceSubscriptions.size,
            pendingAlerts: Array.from(this.motionAlerts.values())
                .flat()
                .filter(a => !a.acknowledged).length,
            totalAlerts: Array.from(this.motionAlerts.values())
                .flat().length
        };
    }
}

module.exports = MotionWebSocketService;