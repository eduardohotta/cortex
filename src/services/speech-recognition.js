/**
 * Speech Recognition Service
 * Handles real-time transcription using multiple providers:
 * OpenAI Realtime, Deepgram, Groq, and Faster-Whisper (Python)
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class SpeechRecognitionService extends EventEmitter {
    constructor() {
        super();
        this.isActive = false;
        this.provider = 'groq';
        this.ws = null;
        this.pythonProcess = null;
        this.audioBuffer = [];
        this.chunkDuration = 2000;
        this.lastChunkTime = 0;
        this.config = {
            apiKey: '',
            language: 'pt',
            model: 'whisper-large-v3-turbo'
        };
    }

    /**
     * Set the transcription provider
     */
    setProvider(provider) {
        this.provider = provider;
        console.log(`[SpeechService] Provider updated to: ${this.provider}`);
    }

    /**
     * Configure the service
     */
    configure(config) {
        Object.assign(this.config, config);
    }

    /**
     * Start transcription
     */
    async start() {
        if (this.isActive) return;

        this.audioBuffer = [];
        this.lastChunkTime = Date.now();

        console.log(`[SpeechService] Starting with provider: ${this.provider}`);

        switch (this.provider) {
            case 'openai-realtime':
                await this.startOpenAIRealtime();
                break;
            case 'deepgram':
                await this.startDeepgram();
                break;
            case 'groq':
                await this.startGroq();
                break;
            case 'whisper-local':
                await this.startWhisperLocal();
                break;
            default:
                throw new Error(`Unknown provider: ${this.provider}`);
        }

        this.isActive = true;
        this.emit('started');
    }

    /**
     * Stop transcription
     */
    async stop() {
        if (!this.isActive) return;

        console.log(`[SpeechService] Stopping ${this.provider}`);

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }

        this.isActive = false;
        this.audioBuffer = [];
        this.emit('stopped');
    }

    /**
     * Process incoming audio data
     */
    processAudio(audioData) {
        if (!this.isActive) return;

        // TYPE GUARD: Ensure we have a Buffer
        if (!Buffer.isBuffer(audioData)) {
            console.error('[SpeechService] Received non-Buffer audio data. Type:', typeof audioData);
            return;
        }

        // Direct pipe for Faster-Whisper (with ready check)
        if (this.provider === 'whisper-local' && this.pythonProcess && this.pythonProcess.stdin.writable) {
            if (this.whisperReady) {
                this.pythonProcess.stdin.write(audioData);
            } else {
                // Buffer audio until model is ready
                this.pendingAudio = this.pendingAudio || [];
                this.pendingAudio.push(audioData);
            }
            return;
        }

        // Buffer and chunk for others
        this.audioBuffer.push(audioData);

        if (this.provider === 'openai-realtime' || this.provider === 'deepgram') {
            this.sendToStreamingProvider(audioData);
        } else if (this.provider === 'groq') {
            const now = Date.now();
            if (now - this.lastChunkTime > this.chunkDuration) {
                this.processChunkedAudio();
                this.lastChunkTime = now;
            }
        }
    }

    /**
     * Send raw audio to streaming providers
     */
    sendToStreamingProvider(audioData) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (this.provider === 'openai-realtime') {
                const base64Audio = audioData.toString('base64');
                this.ws.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: base64Audio
                }));
            } else if (this.provider === 'deepgram') {
                this.ws.send(audioData);
            }
        }
    }

    /**
     * Process accumulated audio for chunked providers
     */
    async processChunkedAudio() {
        if (this.audioBuffer.length === 0) return;

        const fullBuffer = Buffer.concat(this.audioBuffer);
        this.audioBuffer = [];

        if (this.provider === 'groq') {
            this.transcribeWithGroq(fullBuffer);
        }
    }

    /**
     * Transcribe using Groq Whisper API
     */
    async transcribeWithGroq(buffer) {
        if (this.provider !== 'groq') return;

        if (!this.config.apiKey) {
            console.warn('[Groq] API Key is missing, skipping chunk');
            return;
        }

        try {
            const Groq = require('groq-sdk');
            const groq = new Groq({ apiKey: this.config.apiKey });

            const tempFile = path.join(require('os').tmpdir(), `audio-${Date.now()}.wav`);
            const wavBuffer = this.createWavBuffer(buffer);
            fs.writeFileSync(tempFile, wavBuffer);

            const transcription = await groq.audio.transcriptions.create({
                file: fs.createReadStream(tempFile),
                model: this.config.model || 'whisper-large-v3-turbo',
                language: this.config.language === 'auto' ? undefined : this.config.language.split('-')[0],
                response_format: 'json'
            }).catch(err => {
                throw new Error(err.message || 'Erro na API da Groq');
            });

            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

            if (transcription && transcription.text && transcription.text.trim()) {
                this.emit('transcript', {
                    text: transcription.text,
                    isFinal: true,
                    provider: 'groq'
                });
            }
        } catch (error) {
            console.error('[Groq] failed:', error.message);
            this.emit('error', error);
        }
    }

    /**
     * Start local Faster-Whisper transcription (Python Bridge)
     */
    async startWhisperLocal() {
        const { spawn } = require('child_process');
        const scriptPath = path.join(__dirname, 'whisper_service.py');
        const rootPath = path.join(__dirname, '..', '..');

        this.whisperReady = false; // Flag to track if Python is ready
        this.pendingAudio = []; // Buffer audio until ready

        let pythonPath = 'python';
        const venvPath = path.join(rootPath, '.venv', 'Scripts', 'python.exe');
        if (fs.existsSync(venvPath)) {
            pythonPath = venvPath;
            console.log(`[Faster-Whisper] Using virtual environment: ${pythonPath}`);
        }

        console.log(`[Faster-Whisper] Starting bridge: ${scriptPath}`);

        let model = this.config.model;
        // Map Groq/Cloud model names to Faster-Whisper equivalents
        if (model && model.startsWith('whisper-')) {
            model = model.replace('whisper-', '');
        }
        // Fallback or specific mapping
        const validModels = ['tiny', 'base', 'small', 'medium', 'large', 'large-v3', 'turbo', 'large-v3-turbo'];
        if (!validModels.some(m => model.startsWith(m))) {
            console.log(`[Faster-Whisper] Model '${model}' might be invalid, defaulting to 'base'`);
            model = 'base';
        }

        const args = ['-u', scriptPath];
        args.push('--model', model);

        // Device configuration
        const device = this.config.whisperDevice || 'auto';
        args.push('--device', device);
        console.log(`[Faster-Whisper] Device selected: ${device.toUpperCase()}`);

        if (this.config.language && this.config.language !== 'auto') {
            args.push('--language', this.config.language.split('-')[0]); // 'pt-BR' -> 'pt'
        }

        console.log(`[Faster-Whisper] Loading model... (this may take 5-10 seconds)`);

        try {
            this.pythonProcess = spawn(pythonPath, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.pythonProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const response = JSON.parse(line);
                        if (response.status === 'ready') {
                            console.log('[Faster-Whisper] Model loaded and ready!');
                            this.whisperReady = true;
                            // Flush any pending audio
                            if (this.pendingAudio.length > 0) {
                                const combined = Buffer.concat(this.pendingAudio);
                                this.pythonProcess.stdin.write(combined);
                                this.pendingAudio = [];
                            }
                        } else if (response.status === 'fallback_cpu') {
                            console.warn('[Faster-Whisper] CUDA Failed, falling back to CPU');
                            this.emit('cuda-fallback', { message: response.message });
                        } else if (response.text) {
                            console.log(`[Transcription] ${response.text}`);
                            this.emit('transcript', response);
                        } else if (response.error) {
                            console.error('[Faster-Whisper] Error:', response.error);
                            this.emit('error', new Error(response.error));
                        } else if (response.warning) {
                            console.warn('[Faster-Whisper] Warning:', response.warning);
                        }
                    } catch (e) { }
                }
            });

            this.pythonProcess.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (!msg) return;

                // Try to parse JSON error from stderr (some libs output to stderr)
                try {
                    const jsonStart = msg.indexOf('{');
                    if (jsonStart >= 0) {
                        const potentialJson = msg.substring(jsonStart);
                        const response = JSON.parse(potentialJson);
                        if (response.status === 'fallback_cpu') {
                            console.warn('[Faster-Whisper] CUDA Failed (stderr), falling back to CPU');
                            this.emit('cuda-fallback', { message: response.message });
                            return; // Handled
                        } else if (response.error) {
                            console.error('[Faster-Whisper] Error (stderr):', response.error);
                            // Don't emit fatal error if it's just a warning or handled internally,
                            // but if it's critical, we might need to.
                            // For now, let the fallback logic handle it or just log it.
                        }
                    }
                } catch (e) { }

                // Check for download progress (tqdm output)
                if (msg.includes('%|') || msg.includes('Downloading') || msg.includes('Fetching')) {
                    const match = msg.match(/(\d+)%/);
                    if (match) {
                        const percent = parseInt(match[1]);
                        this.emit('download-progress', { percent, message: 'Baixando modelo...' });
                    } else {
                        this.emit('download-progress', { percent: null, message: 'Preparando download...' });
                    }
                }

                if (!msg.includes('UserWarning') && !msg.includes('%|')) {
                    console.log('[Faster-Whisper] Info:', msg);
                }
            });

            this.pythonProcess.on('error', (err) => {
                console.error('[Faster-Whisper] process error:', err.message);
                this.emit('error', new Error('Python ou Faster-Whisper não encontrado.'));
                this.stop();
            });

            this.pythonProcess.on('close', (code) => {
                console.log(`[Faster-Whisper] process exited (${code})`);
                this.pythonProcess = null;
                this.whisperReady = false;
            });

        } catch (error) {
            console.error('[Faster-Whisper] initialization failed:', error);
            this.emit('error', error);
        }
    }

    async startGroq() {
        console.log('[Groq] Handled via chunking');
    }

    createWavBuffer(pcmBuffer) {
        const sampleRate = 16000;
        const numChannels = 1;
        const bitsPerSample = 16;
        const header = Buffer.alloc(44);

        header.write('RIFF', 0);
        header.writeUInt32LE(36 + pcmBuffer.length, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(numChannels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
        header.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write('data', 36);
        header.writeUInt32LE(pcmBuffer.length, 40);

        return Buffer.concat([header, pcmBuffer]);
    }

    async startOpenAIRealtime() {
        const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
        this.ws = new WebSocket(wsUrl, {
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'OpenAI-Beta': 'realtime=v1'
            }
        });

        this.ws.on('open', () => {
            console.log('[OpenAI Realtime] connected');
            this.ws.send(JSON.stringify({
                type: 'session.update',
                session: {
                    modalities: ['text'],
                    input_audio_format: 'pcm16',
                    input_audio_transcription: { model: 'whisper-1' }
                }
            }));
        });

        this.ws.on('message', (data) => {
            const event = JSON.parse(data.toString());
            if (event.type === 'conversation.item.input_audio_transcription.completed') {
                this.emit('transcript', { text: event.transcript, isFinal: true });
            }
        });
    }

    async startDeepgram() {
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=${this.config.language || 'pt-BR'}&punctuate=true&interim_results=true`;
        this.ws = new WebSocket(wsUrl, {
            headers: { 'Authorization': `Token ${this.config.apiKey}` }
        });

        this.ws.on('open', () => console.log('[Deepgram] connected'));
        this.ws.on('message', (data) => {
            const response = JSON.parse(data.toString());
            if (response.channel?.alternatives?.[0]) {
                const alt = response.channel.alternatives[0];
                this.emit('transcript', { text: alt.transcript, isFinal: response.is_final });
            }
        });
    }

    detectLanguage(text) {
        if (!text) return 'auto';
        const ptCount = (text.match(/você|como|qual|porque/gi) || []).length;
        const enCount = (text.match(/you|how|what|why/gi) || []).length;
        return ptCount > enCount ? 'pt-BR' : 'en-US';
    }
}

module.exports = SpeechRecognitionService;
