const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AudioCaptureService extends EventEmitter {
    constructor() {
        super();
        this.isCapturing = false;
        this.pythonProcess = null;
        this.devices = [];
        this.pythonPath = this.detectPython();
    }

    detectPython() {
        const rootPath = path.join(__dirname, '..', '..');
        const venvPath = path.join(rootPath, '.venv', 'Scripts', 'python.exe');
        if (fs.existsSync(venvPath)) {
            return venvPath;
        }
        return 'python';
    }

    /**
     * Get available audio devices via Python
     */
    async getDevices() {
        return new Promise((resolve) => {
            const grabberPath = path.join(__dirname, 'audio_grabber.py');
            const proc = spawn(this.pythonPath, [grabberPath, '--list']);

            let data = '';
            proc.stdout.on('data', (chunk) => data += chunk);
            proc.on('close', () => {
                try {
                    const pyDevices = JSON.parse(data);

                    // Direct mapping with 'type' categorization from Python
                    const devices = pyDevices.map(d => ({
                        id: d.id,
                        name: d.name,
                        type: d.type || (d.is_loopback ? 'loopback' : (d.max_input_channels > 0 ? 'input' : 'output')),
                        isLoopback: !!d.is_loopback,
                        channels: d.max_input_channels || d.max_output_channels
                    }));

                    // Find a default loopback for logic fallbacks
                    const systemDev = devices.find(d => d.type === 'loopback' || d.isLoopback);
                    this.defaultLoopbackId = systemDev ? systemDev.id : (devices.length > 0 ? devices[0].id : 0);

                    this.devices = devices;
                    console.log(`[AudioCapture] Found ${devices.length} audio devices`);
                    resolve(devices);
                } catch (e) {
                    console.error('Failed to parse Python devices:', e);
                    resolve([{ id: 0, name: 'Default Device (Input)', type: 'input' }]);
                }
            });
        });
    }

    async startCapture(deviceId = null) {
        if (this.isCapturing) return;

        if (this.devices.length === 0) {
            await this.getDevices();
        }

        let actualDeviceId = deviceId;
        if (deviceId === 'system' || deviceId === 'default' || deviceId === null) {
            actualDeviceId = this.defaultLoopbackId;
        }

        console.log(`[AudioCapture] Starting Python audio grabber for device ${actualDeviceId}...`);

        const grabberPath = path.join(__dirname, 'audio_grabber.py');
        const args = [grabberPath, '--device', actualDeviceId.toString()];

        try {
            this.pythonProcess = spawn(this.pythonPath, args);

            this.pythonProcess.stdout.on('data', (chunk) => {
                this.emit('audio', chunk);
            });

            this.pythonProcess.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) console.log(`[AudioGrabber] ${msg}`);
            });

            this.pythonProcess.on('error', (err) => {
                console.error('Failed to start Python grabber:', err);
                this.startSimulatedCapture();
            });

            this.pythonProcess.on('close', (code) => {
                console.log(`Python audio grabber closed with code ${code}`);
                this.isCapturing = false;
                this.pythonProcess = null;
                this.emit('stopped');
            });

            this.isCapturing = true;
            this.emit('started');

        } catch (error) {
            console.error('Audio capture spawn error:', error);
            this.startSimulatedCapture();
        }
    }

    startSimulatedCapture() {
        if (this.isCapturing) return;
        this.isCapturing = true;
        this.simulationInterval = setInterval(() => {
            const buffer = Buffer.alloc(3200);
            this.emit('audio', buffer);
        }, 100);
        this.emit('started');
    }

    async stopCapture() {
        if (!this.isCapturing) return;

        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }

        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }

        this.isCapturing = false;
        this.emit('stopped');
    }
}

module.exports = AudioCaptureService;
