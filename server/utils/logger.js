const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../local/logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Simple logger implementation
class Logger {
  constructor() {
    this.logFile = path.join(logsDir, 'app.log');
    this.auditFile = path.join(logsDir, 'audit.log');
  }

  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  writeToFile(file, message) {
    try {
      fs.appendFileSync(file, message + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  info(message) {
    const formatted = this.formatMessage('info', message);
    console.log(formatted);
    this.writeToFile(this.logFile, formatted);
  }

  error(message, error) {
    const errorMsg = error ? `${message} - ${error.stack || error}` : message;
    const formatted = this.formatMessage('error', errorMsg);
    console.error(formatted);
    this.writeToFile(this.logFile, formatted);
  }

  warn(message) {
    const formatted = this.formatMessage('warn', message);
    console.warn(formatted);
    this.writeToFile(this.logFile, formatted);
  }

  debug(message) {
    if (process.env.LOG_LEVEL === 'debug') {
      const formatted = this.formatMessage('debug', message);
      console.debug(formatted);
      this.writeToFile(this.logFile, formatted);
    }
  }

  audit(message) {
    const formatted = this.formatMessage('audit', message);
    console.log(formatted);
    this.writeToFile(this.auditFile, formatted);
  }
}

const logger = new Logger();

module.exports = { logger };