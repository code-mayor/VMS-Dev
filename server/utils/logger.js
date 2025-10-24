const loggingConfig = require('../config/logging');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../local/logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Production-ready logger with intelligent filtering
 * Supports 5000+ devices with minimal performance impact
 */
class Logger {
  constructor() {
    this.logFile = path.join(logsDir, 'app.log');
    this.auditFile = path.join(logsDir, 'audit.log');
    this.errorFile = path.join(logsDir, 'error.log');
    this.ffmpegFile = path.join(logsDir, 'ffmpeg-errors.log');

    // Performance optimization: Write buffer for high-volume logging
    this.writeBuffer = [];
    this.bufferSize = parseInt(process.env.LOG_BUFFER_SIZE) || 100;
    this.flushInterval = parseInt(process.env.LOG_FLUSH_INTERVAL) || 5000; // 5 seconds

    // Start periodic buffer flush
    this.startBufferFlush();

    // Log rotation configuration for production
    this.maxLogSize = parseInt(process.env.MAX_LOG_SIZE) || 100 * 1024 * 1024; // 100MB default
    this.maxLogFiles = parseInt(process.env.MAX_LOG_FILES) || 10;
  }

  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  /**
   * Write to file with buffering for performance
   * Critical for 5000+ device deployments
   */
  writeToFile(file, message) {
    try {
      // Check if log rotation is needed
      this.rotateLogIfNeeded(file);

      // Buffer writes for performance
      this.writeBuffer.push({ file, message });

      // Flush immediately for errors or if buffer is full
      if (this.writeBuffer.length >= this.bufferSize || file === this.errorFile) {
        this.flushBuffer();
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Flush write buffer to disk
   */
  flushBuffer() {
    if (this.writeBuffer.length === 0) return;

    try {
      // Group writes by file for efficiency
      const fileGroups = {};
      this.writeBuffer.forEach(({ file, message }) => {
        if (!fileGroups[file]) fileGroups[file] = [];
        fileGroups[file].push(message);
      });

      // Write grouped messages
      Object.keys(fileGroups).forEach(file => {
        const content = fileGroups[file].join('\n') + '\n';
        fs.appendFileSync(file, content, 'utf8');
      });

      // Clear buffer
      this.writeBuffer = [];
    } catch (error) {
      console.error('Failed to flush log buffer:', error);
      this.writeBuffer = []; // Clear buffer to prevent memory leak
    }
  }

  /**
   * Start periodic buffer flush
   */
  startBufferFlush() {
    setInterval(() => {
      this.flushBuffer();
    }, this.flushInterval);

    // Flush on process exit
    process.on('exit', () => this.flushBuffer());
    process.on('SIGINT', () => {
      this.flushBuffer();
      process.exit(0);
    });
  }

  /**
   * Rotate log file if it exceeds max size
   * Critical for long-running production systems
   */
  rotateLogIfNeeded(file) {
    try {
      if (!fs.existsSync(file)) return;

      const stats = fs.statSync(file);
      if (stats.size < this.maxLogSize) return;

      // Rotate logs
      const ext = path.extname(file);
      const basename = path.basename(file, ext);
      const dir = path.dirname(file);

      // Remove oldest log if we have too many
      const oldestLog = path.join(dir, `${basename}.${this.maxLogFiles}${ext}`);
      if (fs.existsSync(oldestLog)) {
        fs.unlinkSync(oldestLog);
      }

      // Shift existing logs
      for (let i = this.maxLogFiles - 1; i > 0; i--) {
        const oldFile = path.join(dir, `${basename}.${i}${ext}`);
        const newFile = path.join(dir, `${basename}.${i + 1}${ext}`);
        if (fs.existsSync(oldFile)) {
          fs.renameSync(oldFile, newFile);
        }
      }

      // Rotate current log
      const newFile = path.join(dir, `${basename}.1${ext}`);
      fs.renameSync(file, newFile);

    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Standard info logging with level filtering
   */
  info(message) {
    if (!loggingConfig.shouldLog('INFO')) return;

    const formatted = this.formatMessage('info', message);
    console.log(formatted);
    this.writeToFile(this.logFile, formatted);
  }

  /**
   * Error logging - always logged and written to separate error file
   */
  error(message, error) {
    const errorMsg = error ? `${message} - ${error.stack || error}` : message;
    const formatted = this.formatMessage('error', errorMsg);
    console.error(formatted);

    // Write to both general log and error-specific log
    this.writeToFile(this.logFile, formatted);
    this.writeToFile(this.errorFile, formatted);
  }

  /**
   * Warning logging
   */
  warn(message) {
    if (!loggingConfig.shouldLog('WARN')) return;

    const formatted = this.formatMessage('warn', message);
    console.warn(formatted);
    this.writeToFile(this.logFile, formatted);
  }

  /**
   * Debug logging - only in DEBUG mode
   */
  debug(message) {
    if (!loggingConfig.shouldLog('DEBUG')) return;

    const formatted = this.formatMessage('debug', message);
    console.debug(formatted);
    this.writeToFile(this.logFile, formatted);
  }

  /**
   * Audit logging - always logged regardless of level
   */
  audit(message) {
    const formatted = this.formatMessage('audit', message);
    console.log(formatted);
    this.writeToFile(this.auditFile, formatted);
  }

  /**
   * FFmpeg output logging with intelligent filtering
   * Only logs errors and important events
   */
  ffmpeg(output, deviceName = 'unknown') {
    if (!loggingConfig.shouldLogFFmpegOutput(output)) return;

    const message = `[FFMPEG:${deviceName}] ${output.trim()}`;
    const formatted = this.formatMessage('ffmpeg', message);

    // Log to console only if INFO or DEBUG
    if (loggingConfig.shouldLog('INFO')) {
      console.log(formatted);
    }

    // Always write FFmpeg errors to file for troubleshooting
    this.writeToFile(this.ffmpegFile, formatted);
  }

  /**
   * Health check logging with interval-based filtering
   * Prevents log spam from frequent health checks
   */
  healthCheck(message) {
    if (!loggingConfig.shouldLogHealthCheck()) return;

    const formatted = this.formatMessage('health', message);
    console.log(formatted);
    this.writeToFile(this.logFile, formatted);
  }

  /**
   * Stream status logging with conditional filtering
   * Supports high-volume streaming scenarios
   */
  stream(level, message, deviceId = null) {
    const config = loggingConfig.config.streaming;

    // Always log errors
    if (level === 'error') {
      this.error(message);
      return;
    }

    // Log start/stop events if enabled
    const isStartStop = message.includes('started') ||
      message.includes('stopped') ||
      message.includes('Starting') ||
      message.includes('Stopping');

    if (config.logStartStop && isStartStop) {
      this[level](message);
      return;
    }

    // Log segment creation only in DEBUG mode
    if (message.includes('segment') && !loggingConfig.shouldLog('DEBUG')) {
      return;
    }

    // Otherwise only log if DEBUG mode
    if (loggingConfig.shouldLog('DEBUG')) {
      this[level](message);
    }
  }

  /**
   * Device retrieval logging - reduces noise from frequent queries
   */
  devices(count, operation = 'Retrieved') {
    if (!loggingConfig.shouldLog('DEBUG')) return;

    const message = `${operation} ${count} device${count !== 1 ? 's' : ''}`;
    this.info(message);
  }

  /**
   * Batch operation logging - useful for bulk operations
   */
  batch(operation, count, success, failed = 0) {
    const message = `Batch ${operation}: ${success}/${count} succeeded${failed > 0 ? `, ${failed} failed` : ''}`;

    if (failed > 0) {
      this.warn(message);
    } else if (loggingConfig.shouldLog('INFO')) {
      this.info(message);
    }
  }

  /**
   * Performance metric logging
   */
  performance(operation, durationMs, threshold = 1000) {
    // Only log if operation exceeded threshold
    if (durationMs > threshold) {
      const message = `Performance: ${operation} took ${durationMs}ms (threshold: ${threshold}ms)`;
      this.warn(message);
    } else if (loggingConfig.shouldLog('DEBUG')) {
      const message = `Performance: ${operation} took ${durationMs}ms`;
      this.debug(message);
    }
  }

  /**
   * Get log file sizes for monitoring
   */
  getLogStats() {
    const stats = {};

    [this.logFile, this.auditFile, this.errorFile, this.ffmpegFile].forEach(file => {
      try {
        if (fs.existsSync(file)) {
          const fileStats = fs.statSync(file);
          const filename = path.basename(file);
          stats[filename] = {
            size: fileStats.size,
            sizeHuman: this.formatBytes(fileStats.size),
            modified: fileStats.mtime,
            rotationNeeded: fileStats.size > this.maxLogSize
          };
        }
      } catch (error) {
        // Ignore errors for missing files
      }
    });

    return stats;
  }

  /**
   * Format bytes to human-readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Clear old logs based on retention policy
   */
  clearOldLogs(retentionDays = 30) {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    try {
      const files = fs.readdirSync(logsDir);
      let deletedCount = 0;

      files.forEach(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        this.info(`Cleared ${deletedCount} old log file(s) older than ${retentionDays} days`);
      }
    } catch (error) {
      this.error('Failed to clear old logs:', error);
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Set up periodic log cleanup (runs daily)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS) || 30;
    logger.clearOldLogs(retentionDays);
  }, 24 * 60 * 60 * 1000); // Once per day
}

module.exports = { logger };