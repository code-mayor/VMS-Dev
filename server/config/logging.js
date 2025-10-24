/**
 * Centralized logging configuration for production VMS
 * Supports 5000+ devices with minimal log noise
 */

const LOG_LEVELS = {
    ERROR: 0,   // Only critical errors
    WARN: 1,    // Warnings and errors
    INFO: 2,    // Important events + warnings + errors
    DEBUG: 3    // Everything (development only)
};

const config = {
    // Current log level (change based on environment)
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'WARN' : 'INFO'),

    // FFmpeg output filtering
    ffmpeg: {
        // Only log these FFmpeg messages
        logPatterns: [
            /error/i,
            /failed/i,
            /warning/i,
            /fatal/i,
            /invalid/i,
            /timeout/i,
            /connection refused/i,
            /cannot/i,
            /unable/i
        ],

        // Suppress these normal messages
        suppressPatterns: [
            /Press \[q\] to stop/,
            /frame=/,
            /size=/,
            /time=/,
            /bitrate=/,
            /speed=/,
            /built with gcc/,
            /configuration:/,
            /libavutil/,
            /libavcodec/,
            /libavformat/,
            /-vsync is deprecated/,
            /Stream mapping:/,
            /Output #0/,
            /Input #0/,
            /encoder/i,
            /Metadata:/,
            /Duration:/,
            /more than \d+ frames duplicated/i
        ]
    },

    // Health check logging (reduce noise)
    healthCheck: {
        logInterval: 60000,  // Only log every 60 seconds
        lastLogTime: 0
    },

    // Stream status logging
    streaming: {
        logStartStop: true,      // Always log stream start/stop
        logSegmentCreation: false,  // Don't log every segment
        logOnlyErrors: true      // Only log streaming errors
    }
};

/**
 * Check if a message should be logged based on current level
 */
function shouldLog(messageLevel) {
    const currentLevel = LOG_LEVELS[config.level.toUpperCase()] || LOG_LEVELS.INFO;
    const targetLevel = LOG_LEVELS[messageLevel.toUpperCase()] || LOG_LEVELS.INFO;
    return targetLevel <= currentLevel;
}

/**
 * Filter FFmpeg output - only log important messages
 */
function shouldLogFFmpegOutput(output) {
    const outputLower = output.toLowerCase();

    // Always suppress these patterns
    for (const pattern of config.ffmpeg.suppressPatterns) {
        if (pattern.test(output)) {
            return false;
        }
    }

    // Only log if matches error patterns
    for (const pattern of config.ffmpeg.logPatterns) {
        if (pattern.test(output)) {
            return true;
        }
    }

    return false;
}

/**
 * Should log health check based on interval
 */
function shouldLogHealthCheck() {
    const now = Date.now();
    if (now - config.healthCheck.lastLogTime >= config.healthCheck.logInterval) {
        config.healthCheck.lastLogTime = now;
        return true;
    }
    return false;
}

module.exports = {
    LOG_LEVELS,
    config,
    shouldLog,
    shouldLogFFmpegOutput,
    shouldLogHealthCheck
};