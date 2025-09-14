const { spawn } = require('child_process')

class FFmpegManager {
    constructor() {
        this.processes = new Map()
        this.maxProcesses = 4  // Limit concurrent FFmpeg processes
    }

    async startProcess(id, args) {
        // Check if we're at max capacity
        if (this.processes.size >= this.maxProcesses) {
            console.warn(`⚠️ Max FFmpeg processes reached (${this.maxProcesses})`)
            // Kill oldest process if needed
            const oldest = Array.from(this.processes.keys())[0]
            await this.stopProcess(oldest)
        }

        const process = spawn('ffmpeg', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false
        })

        this.processes.set(id, {
            process,
            startTime: Date.now()
        })

        return process
    }

    async stopProcess(id) {
        const proc = this.processes.get(id)
        if (proc) {
            proc.process.kill('SIGTERM')
            this.processes.delete(id)
            console.log(`🛑 Stopped FFmpeg process: ${id}`)
        }
    }

    getActiveCount() {
        return this.processes.size
    }
}

module.exports = new FFmpegManager()