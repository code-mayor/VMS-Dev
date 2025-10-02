// server/services/schedule-executor.js
// Schedule Recording Execution Service
// Monitors and executes recording schedules automatically

const { v4: uuidv4 } = require('uuid');
const path = require('path');

class ScheduleExecutor {
    constructor() {
        this.checkInterval = null;
        this.activeScheduleRecordings = new Map(); // scheduleId+deviceId -> recordingId
        this.isRunning = false;
        this.dbConnection = null;
        this.recordingsModule = null;
        this.lastCheckTime = null;
    }

    /**
     * Initialize the schedule executor
     * @param {Object} dbConnection - Database connection
     * @param {Object} recordingsModule - Recordings module with startRecording function
     */
    initialize(dbConnection, recordingsModule) {
        this.dbConnection = dbConnection;
        this.recordingsModule = recordingsModule;
        console.log('📅 Schedule Executor initialized');
    }

    /**
     * Start monitoring schedules
     * @param {number} intervalSeconds - Check interval in seconds (default: 30)
     */
    start(intervalSeconds = 30) {
        if (this.isRunning) {
            console.log('⚠️ Schedule Executor already running');
            return;
        }

        if (!this.dbConnection || !this.recordingsModule) {
            console.error('❌ Schedule Executor not properly initialized');
            return;
        }

        this.isRunning = true;
        console.log(`🚀 Schedule Executor started (checking every ${intervalSeconds}s)`);

        // Run initial check immediately
        this.checkAndExecuteSchedules();

        // Set up periodic checks
        this.checkInterval = setInterval(() => {
            this.checkAndExecuteSchedules();
        }, intervalSeconds * 1000);
    }

    /**
     * Stop monitoring schedules
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 Schedule Executor stopped');
    }

    /**
     * Get current time info in IST
     */
    getCurrentTimeInfo() {
        const now = new Date();

        // Convert to IST (UTC+5:30)
        const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
        const istTime = new Date(now.getTime() + istOffset);

        const currentDay = istTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
        const hours = String(istTime.getUTCHours()).padStart(2, '0');
        const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}:00`;

        return {
            now: istTime,
            currentDay,
            currentTime,
            currentTimeShort: `${hours}:${minutes}`
        };
    }

    /**
     * Check and execute active schedules
     */
    async checkAndExecuteSchedules() {
        try {
            const timeInfo = this.getCurrentTimeInfo();
            const { currentDay, currentTime, currentTimeShort } = timeInfo;

            // Log check (but not too frequently)
            if (!this.lastCheckTime || Date.now() - this.lastCheckTime > 300000) { // Every 5 minutes
                console.log(`📅 Schedule check: Day=${currentDay}, Time=${currentTimeShort}`);
                this.lastCheckTime = Date.now();
            }

            // Get all enabled schedules from database
            const schedules = await this.dbConnection.all(
                'SELECT * FROM recording_schedules WHERE enabled = 1 ORDER BY priority DESC'
            );

            if (schedules.length === 0) {
                return; // No schedules to process
            }

            // Process each schedule
            for (const schedule of schedules) {
                await this.processSchedule(schedule, timeInfo);
            }

        } catch (error) {
            console.error('❌ Error checking schedules:', error);
        }
    }

    /**
     * Process a single schedule
     */
    async processSchedule(schedule, timeInfo) {
        try {
            const { currentDay, currentTime } = timeInfo;

            // Parse JSON fields
            const daysOfWeek = this.parseJSON(schedule.days_of_week, []);
            const deviceIds = this.parseJSON(schedule.device_ids, []);

            // Check if today is in the schedule
            if (!daysOfWeek.includes(currentDay)) {
                return; // Not scheduled for today
            }

            // Check if current time is within schedule window
            const isActive = this.isTimeInRange(
                currentTime,
                schedule.start_time,
                schedule.end_time
            );

            if (isActive) {
                // Schedule is active - ensure recordings are running
                await this.ensureScheduleRecordings(schedule, deviceIds);
            } else {
                // Schedule is not active - stop any recordings for this schedule
                await this.stopScheduleRecordings(schedule.id);
            }

        } catch (error) {
            console.error(`❌ Error processing schedule ${schedule.id}:`, error);
        }
    }

    /**
     * Ensure recordings are running for a schedule
     */
    async ensureScheduleRecordings(schedule, deviceIds) {
        try {
            // Get list of devices to record
            let devicesToRecord = [];

            if (!deviceIds || deviceIds.length === 0) {
                // No specific devices - record ALL authenticated devices
                const allDevices = await this.dbConnection.all(
                    'SELECT id FROM devices WHERE authenticated = 1'
                );
                devicesToRecord = allDevices.map(d => d.id);
            } else {
                devicesToRecord = deviceIds;
            }

            // Start recording for each device if not already recording
            for (const deviceId of devicesToRecord) {
                const recordingKey = `${schedule.id}_${deviceId}`;

                // Check if already recording for this schedule+device
                if (this.activeScheduleRecordings.has(recordingKey)) {
                    continue; // Already recording
                }

                // Check if device is already recording (manual or auto)
                const existingRecording = await this.isDeviceRecording(deviceId);
                if (existingRecording) {
                    console.log(`⏭️ Device ${deviceId} already recording, skipping schedule ${schedule.name}`);
                    continue;
                }

                // Start scheduled recording
                await this.startScheduledRecording(schedule, deviceId, recordingKey);
            }

        } catch (error) {
            console.error(`❌ Error ensuring schedule recordings for ${schedule.id}:`, error);
        }
    }

    /**
     * Start a scheduled recording
     */
    async startScheduledRecording(schedule, deviceId, recordingKey) {
        try {
            console.log(`▶️ Starting scheduled recording: ${schedule.name} for device ${deviceId}`);

            // Get device details
            const device = await this.dbConnection.get(
                'SELECT * FROM devices WHERE id = ?',
                [deviceId]
            );

            if (!device || !device.rtsp_username || !device.rtsp_password) {
                console.warn(`⚠️ Device ${deviceId} not authenticated, skipping`);
                return;
            }

            // Calculate duration until end_time
            const now = new Date();
            const endTime = this.parseTime(schedule.end_time);
            const startTime = this.parseTime(schedule.start_time);

            let durationSeconds;
            if (endTime < startTime) {
                // Overnight schedule
                const endOfDay = 24 * 60 * 60;
                const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                durationSeconds = endOfDay - currentSeconds + endTime;
            } else {
                durationSeconds = endTime - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
            }

            // Ensure positive duration
            durationSeconds = Math.max(60, durationSeconds); // At least 1 minute

            // Generate recording ID
            const recordingId = `sched_${schedule.id.substring(0, 8)}_${deviceId.substring(0, 8)}_${Date.now()}`;

            // Use the recordings module to start recording
            const result = await this.recordingsModule.startScheduledRecording({
                deviceId,
                scheduleId: schedule.id,
                scheduleName: schedule.name,
                duration: durationSeconds,
                quality: schedule.quality || 'medium',
                chunkDuration: schedule.chunk_duration || 1,
                recordingId
            });

            if (result.success) {
                // Track this recording
                this.activeScheduleRecordings.set(recordingKey, result.recordingId);

                // Log to schedule_logs
                await this.logScheduleAction(
                    schedule.id,
                    deviceId,
                    'started',
                    result.recordingId,
                    null
                );

                console.log(`✅ Scheduled recording started: ${result.recordingId}`);

                // Set up auto-cleanup when recording ends
                setTimeout(() => {
                    this.activeScheduleRecordings.delete(recordingKey);
                    this.logScheduleAction(
                        schedule.id,
                        deviceId,
                        'completed',
                        result.recordingId,
                        null
                    );
                }, durationSeconds * 1000);
            }

        } catch (error) {
            console.error(`❌ Failed to start scheduled recording:`, error);
            await this.logScheduleAction(
                schedule.id,
                deviceId,
                'failed',
                null,
                error.message
            );
        }
    }

    /**
     * Stop all recordings for a schedule
     */
    async stopScheduleRecordings(scheduleId) {
        try {
            // Find all active recordings for this schedule
            const recordingsToStop = [];
            for (const [key, recordingId] of this.activeScheduleRecordings.entries()) {
                if (key.startsWith(scheduleId)) {
                    recordingsToStop.push({ key, recordingId });
                }
            }

            // Stop each recording
            for (const { key, recordingId } of recordingsToStop) {
                try {
                    await this.recordingsModule.stopRecording(recordingId);
                    this.activeScheduleRecordings.delete(key);
                    console.log(`🛑 Stopped scheduled recording: ${recordingId}`);
                } catch (error) {
                    console.error(`Failed to stop recording ${recordingId}:`, error);
                }
            }

        } catch (error) {
            console.error(`❌ Error stopping schedule recordings:`, error);
        }
    }

    /**
     * Check if device is currently recording
     */
    async isDeviceRecording(deviceId) {
        try {
            const recording = await this.dbConnection.get(
                'SELECT id FROM recordings WHERE device_id = ? AND end_time IS NULL LIMIT 1',
                [deviceId]
            );
            return !!recording;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if current time is within schedule range
     */
    isTimeInRange(currentTime, startTime, endTime) {
        // Handle overnight schedules (e.g., 22:00 - 02:00)
        if (endTime < startTime) {
            return currentTime >= startTime || currentTime <= endTime;
        } else {
            return currentTime >= startTime && currentTime <= endTime;
        }
    }

    /**
     * Parse time string to seconds
     */
    parseTime(timeString) {
        const [hours, minutes, seconds] = timeString.split(':').map(Number);
        return hours * 3600 + minutes * 60 + (seconds || 0);
    }

    /**
     * Parse JSON field safely
     */
    parseJSON(value, fallback = null) {
        if (!value) return fallback;
        if (typeof value === 'object') return value;
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch (error) {
                return fallback;
            }
        }
        return fallback;
    }

    /**
     * Log schedule action to database
     */
    async logScheduleAction(scheduleId, deviceId, action, recordingId, errorMessage) {
        try {
            await this.dbConnection.run(
                `INSERT INTO schedule_logs (schedule_id, device_id, action, recording_id, error_message, timestamp)
         VALUES (?, ?, ?, ?, ?, NOW())`,
                [scheduleId, deviceId, action, recordingId, errorMessage]
            );
        } catch (error) {
            console.error('Failed to log schedule action:', error);
        }
    }

    /**
     * Get status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeScheduleRecordings: this.activeScheduleRecordings.size,
            lastCheckTime: this.lastCheckTime,
            currentTime: this.getCurrentTimeInfo()
        };
    }
}

// Export singleton instance
const scheduleExecutor = new ScheduleExecutor();
module.exports = scheduleExecutor;