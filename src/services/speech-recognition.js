/**
 * Speech Recognition Service
 * Handles real-time transcription using multiple providers:
 * OpenAI Realtime, Deepgram, Groq, and Faster-Whisper (Python)
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

class SpeechRecognitionService extends EventEmitter {
    constructor() {
        super();

        this.isActive = false;
        this.provider = 'groq';

        this.ws = null;
        this.pythonProcess = null;

        this.audioBuffer = [];
        this.pendingAudio = [];

        this.chunkDuration = 2000;
        this.lastChunkTime = 0;

        this.whisperReady = false;

        this.config = {
            apiKey: '',
            language: 'pt-BR', // AUTO | pt-BR | en-US
            model: 'whisper-large-v3-turbo',
            whisperDevice: 'auto'
        };

        this.groqClient = null;
    }

    /* ===========================
       CONFIG
    ============================ */

    setProvider(provider) {
        if (this.isActive) {
            throw new Error('Cannot change provider while active');
        }
        this.provider = provider;
        console.log(`[SpeechService] Provider set to ${provider}`);
    }

    configure(config) {
        Object.assign(this.config, config);
        console.log(this.config)
        if (this.provider === 'groq' && this.config.apiKey) {
            const Groq = require('groq-sdk');
            this.groqClient = new Groq({ apiKey: this.config.apiKey });
        }
    }

    getResolvedDevice() {
        if (this.provider !== 'whisper-local') {
            return undefined;
        }

        return this.config.whisperDevice || 'auto';
    }


    getResolvedModel() {
        switch (this.provider) {
            case 'whisper-local':
                return this.config.model || 'base';

            case 'groq':
                return this.config.model || 'whisper-large-v3-turbo';

            case 'openai-realtime':
                return 'whisper-1';

            case 'deepgram':
                return undefined;

            default:
                return this.config.model;
        }
    }


    getLanguageCode() {
        if (!this.config.language || this.config.language === 'auto') return undefined;
        return this.config.language.split('-')[0];
    }

    /* ===========================
       LIFECYCLE
    ============================ */

    async start() {
        if (this.isActive) return;

        this.isActive = true;
        this.audioBuffer = [];
        this.pendingAudio = [];
        this.lastChunkTime = Date.now();

        console.log(`[SpeechService] Starting (${this.provider})`);

        switch (this.provider) {
            case 'openai-realtime': await this.startOpenAIRealtime(); break;
            case 'deepgram': await this.startDeepgram(); break;
            case 'groq': await this.startGroq(); break;
            case 'whisper-local': await this.startWhisperLocal(); break;
            default:
                this.isActive = false;
                throw new Error(`Unknown provider: ${this.provider}`);
        }

        this.emit('started');
    }

    async stop() {
        if (!this.isActive) return;

        console.log(`[SpeechService] Stopping (${this.provider})`);

        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }

        if (this.pythonProcess) {
            this.pythonProcess.removeAllListeners();
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }

        this.audioBuffer = [];
        this.pendingAudio = [];
        this.whisperReady = false;
        this.isActive = false;

        this.emit('stopped');
    }

    /* ===========================
       AUDIO PIPELINE
    ============================ */

    processAudio(audioData) {
        if (!this.isActive) return;
        if (!Buffer.isBuffer(audioData)) return;

        if (this.provider === 'whisper-local') {
            if (this.pythonProcess?.stdin?.writable) {
                if (this.whisperReady) {
                    this.pythonProcess.stdin.write(audioData);
                } else {
                    this.pendingAudio.push(audioData);
                }
            }
            return;
        }

        this.audioBuffer.push(audioData);

        if (this.provider === 'openai-realtime' || this.provider === 'deepgram') {
            this.sendToStreamingProvider(audioData);
            return;
        }

        if (this.provider === 'groq') {
            const now = Date.now();
            if (now - this.lastChunkTime >= this.chunkDuration) {
                this.lastChunkTime = now;
                this.processGroqChunk();
            }
        }
    }

    /* ===========================
       GROQ
    ============================ */

    async startGroq() {
        if (!this.config.apiKey) {
            console.warn('[Groq] API key missing');
            return;
        }

        if (!this.groqClient) {
            const Groq = require('groq-sdk');
            this.groqClient = new Groq({ apiKey: this.config.apiKey });
        }

        console.log('[Groq] Ready (chunked mode)');
    }

    async processGroqChunk() {
        if (!this.audioBuffer.length || !this.groqClient) return;

        const buffer = Buffer.concat(this.audioBuffer);
        this.audioBuffer = [];

        try {
            const tempFile = path.join(os.tmpdir(), `audio-${Date.now()}.wav`);
            fs.writeFileSync(tempFile, this.createWavBuffer(buffer));

            const transcription = await this.groqClient.audio.transcriptions.create({
                file: fs.createReadStream(tempFile),
                model: this.config.model,
                language: this.getLanguageCode()
            });

            fs.unlinkSync(tempFile);

            if (transcription?.text?.trim()) {
                this.emit('transcript', {
                    text: transcription.text,
                    isFinal: true,
                    provider: 'groq'
                });
            }
        } catch (err) {
            console.error('[Groq] Error:', err.message);
            this.emit('error', err);
        }
    }

    /* ===========================
       WHISPER LOCAL
    ============================ */

    async startWhisperLocal() {
        const scriptPath = path.join(__dirname, 'whisper_service.py');

        const args = ['-u', scriptPath, '--model', this.getResolvedModel(),];

        if (this.config.language && this.config.language !== 'auto') {
            args.push('--language', this.getLanguageCode());
        }

        args.push('--device', this.config.whisperDevice || 'auto');

        console.log('[Faster-Whisper] Starting:', args.join(' '));

        this.whisperReady = false;
        this.pendingAudio = [];

        this.pythonProcess = spawn('python', args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.pythonProcess.stdout.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                try {
                    const msg = JSON.parse(trimmed);
                    if (msg.status === 'ready') {
                        this.whisperReady = true;
                        if (this.pendingAudio.length) {
                            this.pythonProcess.stdin.write(Buffer.concat(this.pendingAudio));
                            this.pendingAudio = [];
                        }
                    } else if (msg.text) {
                        this.emit('transcript', msg);
                    } else if (msg.status === 'fallback_cpu') {
                        this.emit('cuda-fallback', msg);
                    } else {
                        // Log JSON objects that aren't specifically handled
                        console.log(`[Python JSON]`, msg);
                    }
                } catch {
                    // This is a standard print statement or non-JSON output
                    console.log(`[Python] ${trimmed}`);
                }
            }
        });

        this.pythonProcess.stderr.on('data', (d) => {
            const msg = d.toString().trim();
            if (!msg) return;

            if (msg.includes('%')) {
                const match = msg.match(/(\d+)%/);
                if (match) {
                    this.emit('download-progress', { percent: Number(match[1]) });
                    return;
                }
            }

            // Log any other stderr output
            console.warn(`[Python STDERR] ${msg}`);
        });
    }

    /* ===========================
       STREAMING PROVIDERS
    ============================ */

    sendToStreamingProvider(audioData) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        if (this.provider === 'openai-realtime') {
            this.ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: audioData.toString('base64')
            }));
        } else if (this.provider === 'deepgram') {
            this.ws.send(audioData);
        }
    }

    async startOpenAIRealtime() {
        this.ws = new WebSocket(
            'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
            {
                headers: {
                    Authorization: `Bearer ${this.config.apiKey}`,
                    'OpenAI-Beta': 'realtime=v1'
                }
            }
        );

        this.ws.on('open', () => {
            this.ws.send(JSON.stringify({
                type: 'session.update',
                session: {
                    input_audio_format: 'pcm16',
                    input_audio_transcription: {
                        model: 'whisper-1',
                        language: this.getLanguageCode()
                    }
                }
            }));
        });

        this.ws.on('message', (data) => {
            const ev = JSON.parse(data.toString());
            if (ev?.transcript) {
                this.emit('transcript', { text: ev.transcript, isFinal: true });
            }
        });
    }

    async startDeepgram() {
        const lang = this.config.language || 'pt-BR';

        this.ws = new WebSocket(
            `wss://api.deepgram.com/v1/listen?language=${lang}&punctuate=true&interim_results=true`,
            { headers: { Authorization: `Token ${this.config.apiKey}` } }
        );

        this.ws.on('message', (data) => {
            const res = JSON.parse(data.toString());
            const alt = res?.channel?.alternatives?.[0];
            if (alt?.transcript) {
                this.emit('transcript', {
                    text: alt.transcript,
                    isFinal: res.is_final
                });
            }
        });
    }

    /* ===========================
       WAV
    ============================ */

    createWavBuffer(pcmBuffer) {
        const header = Buffer.alloc(44);
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + pcmBuffer.length, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(1, 22);
        header.writeUInt32LE(16000, 24);
        header.writeUInt32LE(32000, 28);
        header.writeUInt16LE(2, 32);
        header.writeUInt16LE(16, 34);
        header.write('data', 36);
        header.writeUInt32LE(pcmBuffer.length, 40);
        return Buffer.concat([header, pcmBuffer]);
    }
}

module.exports = SpeechRecognitionService;
