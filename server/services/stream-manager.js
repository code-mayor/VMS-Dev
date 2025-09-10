// server/services/stream-manager.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class StreamManager {
    constructor() {
        this.activeStreams = new Map();
        this.hlsDir = path.join(__dirname, '..', 'public', 'hls');
    }

    async startStreamForDevice(device, retries = 3) {
        if (this.activeStreams.has(device.id)) {
            console.log(`📡 Stream already active for ${device.name}`);
            return;
        }

        const rtspUrl = `rtsp://${device.rtsp_username}:${device.rtsp_password}@${device.ip_address}:554/profile1`;
        const streamDir = path.join(this.hlsDir, `${device.id}_hls`);

        // Create directory
        if (!fs.existsSync(streamDir)) {
            fs.mkdirSync(streamDir, { recursive: true });
        }

        // Clean up old segments before starting
        const files = fs.readdirSync(streamDir);
        files.forEach(file => {
            if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
                fs.unlinkSync(path.join(streamDir, file));
            }
        });

        const ffmpegArgs = [
            '-rtsp_transport', 'tcp',
            '-i', rtspUrl,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-f', 'hls',
            '-hls_time', '4',
            '-hls_list_size', '5',
            '-hls_flags', 'delete_segments+append_list',
            '-hls_segment_filename', path.join(streamDir, 'segment%d.ts'),
            path.join(streamDir, 'playlist.m3u8')
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        this.activeStreams.set(device.id, ffmpeg);

        console.log(`✅ Auto-started stream for ${device.name} (${device.ip_address})`);

        ffmpeg.on('exit', (code) => {
            console.log(`Stream ended for ${device.name} with code ${code}`);
            this.activeStreams.delete(device.id);

            // Retry on failure
            if (code !== 0 && retries > 0 && device.authenticated) {
                console.log(`🔄 Retrying stream for ${device.name} (${retries} retries left)`);
                setTimeout(() => {
                    this.startStreamForDevice(device, retries - 1);
                }, 5000);
            }
        });

        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.includes('error') || output.includes('Error')) {
                console.error(`FFmpeg error for ${device.name}: ${output}`);
            }
        });
    }

    async startAllAuthenticatedDevices(dbAdapter) {
        const devices = await dbAdapter.all('SELECT * FROM devices WHERE authenticated = 1');
        for (const device of devices) {
            if (device.rtsp_username && device.rtsp_password) {
                await this.startStreamForDevice(device);
            }
        }
    }

    stopStream(deviceId) {
        const stream = this.activeStreams.get(deviceId);
        if (stream) {
            stream.kill('SIGTERM');
            this.activeStreams.delete(deviceId);
        }
    }
}

module.exports = new StreamManager();