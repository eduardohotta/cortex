const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AudioCaptureService extends EventEmitter {
    constructor() {
        super();
        this.isCapturing = false;
        this.pythonProcess = null;
        this.simulationInterval = null;
        this.devices = [];
        this.defaultLoopbackId = null;
        this.pythonPath = this.detectPython();
        this._cleaningUp = false;
    }

    detectPython() {
        const rootPath = path.join(__dirname, '..', '..');
        const venvPath = path.join(rootPath, '.venv', 'Scripts', 'python.exe');
        return fs.existsSync(venvPath) ? venvPath : 'python';
    }

    async getDevices() {
        return new Promise((resolve) => {
            const grabberPath = path.join(__dirname, 'audio_grabber.py');
            const proc = spawn(this.pythonPath, [grabberPath, '--list']);

            let data = '';
            proc.stdout.on('data', (c) => (data += c));

            proc.on('close', () => {
                try {
                    const pyDevices = JSON.parse(data);

                    // Windows provides devices via multiple Host APIs (MME, DirectSound, WASAPI)
                    // We only want WASAPI for loopback and performance, and we need to filter duplicates.

                    // Filter: Prioritize WASAPI (usually hostApi 2 on many systems, but let's check names/flags)
                    const filtered = pyDevices.filter(d => {
                        // Keep devices that are either loopback OR belonging to a modern API
                        // On Windows, WASAPI is highly preferred for low latency loopback.
                        const isWasapi = d.hostapi === 2 || (d.name && d.name.includes('WASAPI'));
                        return isWasapi || d.is_loopback;
                    });

                    // Final Mapping & De-duplication by name
                    const uniqueMap = new Map();
                    const devices = [];

                    filtered.forEach(d => {
                        if (!uniqueMap.has(d.name)) {
                            const dev = {
                                id: d.id,
                                name: d.name,
                                type: d.type || (d.is_loopback ? 'loopback' : (d.max_input_channels > 0 ? 'input' : 'output')),
                                isLoopback: Boolean(d.is_loopback),
                                channels: d.max_input_channels || d.max_output_channels
                            };
                            uniqueMap.set(d.name, true);
                            devices.push(dev);
                        }
                    });

                    // Find a default loopback for logic fallbacks
                    const systemDev = devices.find(d => d.isLoopback || d.type === 'loopback');
                    if (systemDev) {
                        this.defaultLoopbackId = systemDev.id;
                        console.log(`[AudioCapture] Auto-selected loopback device: ${systemDev.name} (ID: ${systemDev.id})`);
                    } else {
                        const backupDev = devices.find(d => d.type === 'input') || devices[0];
                        this.defaultLoopbackId = backupDev ? backupDev.id : 0;
                        console.warn(`[AudioCapture] NO loopback device found. Falling back to: ${backupDev ? backupDev.name : 'Unknown'} (ID: ${this.defaultLoopbackId})`);
                    }

                    this.devices = devices;
                    console.log(`[AudioCapture] Found ${devices.length} unique audio devices`);
                    resolve(devices);
                } catch (e) {
                    console.error('[AudioCapture] Failed to parse devices from Python:', e);
                    this.devices = [{ id: 0, name: 'Default Input', type: 'input' }];
                    this.defaultLoopbackId = 0;
                    resolve(this.devices);
                }
            });
        });
    }

    /* ===== SAFE RMS ===== */
    calculateLevel(buffer) {
        if (!buffer || buffer.length < 4) return 0;
        let sum = 0;
        let count = 0;

        for (let i = 0; i + 1 < buffer.length; i += 2) {
            const s = buffer.readInt16LE(i) / 32768;
            sum += s * s;
            count++;
        }

        return count ? Math.sqrt(sum / count) : 0;
    }

    async startCapture(deviceId = null) {
        if (this.isCapturing) return;

        if (!this.devices.length) await this.getDevices();

        const actualDeviceId =
            deviceId === 'system' || deviceId === 'default' || deviceId == null
                ? this.defaultLoopbackId
                : deviceId;

        const grabberPath = path.join(__dirname, 'audio_grabber.py');

        this.isCapturing = true;
        this.emit('started');

        try {
            this.pythonProcess = spawn(this.pythonPath, [
                grabberPath,
                '--device',
                String(actualDeviceId)
            ]);

            this.pythonProcess.stdout.on('data', (chunk) => {
                // TYPE GUARD: Only emit if it's binary data (Buffer)
                // JSON messages should go to stderr or be handled separately
                if (Buffer.isBuffer(chunk)) {
                    this.emit('audio', chunk);
                } else {
                    console.debug('[AudioCapture] Received non-buffer data on stdout:', chunk);
                }
            });

            this.pythonProcess.once('close', () => this.cleanup());
            this.pythonProcess.once('error', () => this.startSimulatedCapture());
        } catch {
            this.startSimulatedCapture();
        }
    }

    startSimulatedCapture() {
        if (this.simulationInterval || this.isCapturing) return;

        this.isCapturing = true;
        this.emit('started');

        this.simulationInterval = setInterval(() => {
            const level = Math.random() * 0.05;
            this.emit('audio', {
                pcm: Buffer.alloc(3200),
                level,
                simulated: true,
                ts: Date.now()
            });
        }, 100);
    }

    stopCapture() {
        if (!this.isCapturing) return;
        this.cleanup();
        this.emit('stopped');
    }

    panic() {
        console.warn('[AudioCapture] PANIC');
        this.cleanup(true);
        this.emit('panic');
    }

    cleanup(force = false) {
        if (this._cleaningUp) return;
        this._cleaningUp = true;

        if (this.pythonProcess?.pid) {
            try {
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', this.pythonProcess.pid, '/f', '/t']);
                } else {
                    this.pythonProcess.kill('SIGTERM');
                }
            } catch { }
        }

        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }

        this.pythonProcess = null;
        this.isCapturing = false;
        this._cleaningUp = false;

        if (force) this.emit('reset');
    }
}

module.exports = AudioCaptureService;
