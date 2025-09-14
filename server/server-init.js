// server-init.js - Server initialization module for auto-recording
const path = require('path')
const fs = require('fs')

class ServerInitializer {
    constructor() {
        this.configPath = path.join(__dirname, 'config', 'auto-recording-defaults.json')
        this.dataPath = path.join(__dirname, 'data')
        this.recordingsPath = path.join(__dirname, 'public', 'recordings')
    }

    // Initialize all required directories and files
    async initialize() {
        console.log('🚀 Initializing server environment...')

        // Create config directory and default config if not exists
        await this.ensureConfigFile()

        // Create data directory for persistent settings
        await this.ensureDataDirectory()

        // Create recordings directory
        await this.ensureRecordingsDirectory()

        console.log('✅ Server environment initialized successfully')
    }

    async ensureConfigFile() {
        const configDir = path.dirname(this.configPath)

        // Create config directory if not exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true })
            console.log(`📁 Created config directory: ${configDir}`)
        }

        // Create default config file if not exists
        if (!fs.existsSync(this.configPath)) {
            const defaultConfig = {
                defaults: {
                    enabled: false,
                    chunkDuration: 1,
                    quality: 'medium',
                    maxStorage: 30,
                    retentionPeriod: 1,
                },
                constraints: {
                    chunkDuration: {
                        min: 1,
                        max: 60,
                        unit: 'minutes'
                    },
                    quality: {
                        options: ['low', 'medium', 'high']
                    },
                    maxStorage: {
                        min: 1,
                        max: 10000,
                        unit: 'GB'
                    },
                    retentionPeriod: {
                        min: 1,
                        max: 365,
                        unit: 'days'
                    }
                },
                performance: {
                    maxConcurrentRecordings: 100,
                    batchSize: 50,
                    healthCheckInterval: 30000,
                    retryAttempts: 3,
                    retryDelay: 5000
                },
                storage: {
                    baseDirectory: '/public/recordings',
                    fileNamePattern: '${type}_${deviceId}_${timestamp}.mp4',
                    cleanupInterval: 3600000
                }
            }

            fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2))
            console.log(`📄 Created default config file: ${this.configPath}`)
        } else {
            console.log(`✅ Config file exists: ${this.configPath}`)
        }
    }

    async ensureDataDirectory() {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true })
            console.log(`📁 Created data directory: ${this.dataPath}`)
        } else {
            console.log(`✅ Data directory exists: ${this.dataPath}`)
        }
    }

    async ensureRecordingsDirectory() {
        if (!fs.existsSync(this.recordingsPath)) {
            fs.mkdirSync(this.recordingsPath, { recursive: true, mode: 0o755 })
            console.log(`📁 Created recordings directory: ${this.recordingsPath}`)
        }

        // Verify write permissions
        try {
            fs.accessSync(this.recordingsPath, fs.constants.W_OK)
            console.log(`✅ Recordings directory validated: ${this.recordingsPath}`)
        } catch (error) {
            console.error(`❌ Recordings directory not writable: ${this.recordingsPath}`)
            throw error
        }
    }

    // Start auto-recordings if enabled in saved settings
    async startAutoRecordingsIfEnabled(dbConnection) {
        try {
            const settingsPath = path.join(this.dataPath, 'auto-recording-settings.json')

            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))

                // Validate settings have enabledDevices array
                if (!settings.enabledDevices) {
                    settings.enabledDevices = []
                }

                if (settings.enabled === true && settings.enabledDevices.length > 0) {
                    console.log('🎬 Auto-recording is enabled, starting recordings for devices:', settings.enabledDevices)

                    // Import recordings module and call the exported function
                    const { startAutoRecordingsForDevices } = require('./routes/recordings')

                    // Start auto-recordings with a delay to ensure everything is ready
                    setTimeout(() => {
                        startAutoRecordingsForDevices(settings.enabledDevices, dbConnection)
                    }, 5000)
                } else {
                    console.log('ℹ️ Auto-recording is disabled or no devices configured')
                }
            } else {
                console.log('ℹ️ No auto-recording settings found, starting with defaults (disabled)')
            }
        } catch (error) {
            console.error('❌ Error checking auto-recording settings:', error)
        }
    }
}

module.exports = new ServerInitializer()