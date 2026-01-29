const path = require('path');
const os = require('os');
const EventEmitter = require('events');

class LocalLLMService extends EventEmitter {
    constructor() {
        super();
        this.llama = null;
        this.llamaCppModule = null;

        this.model = null;
        this.context = null;
        this.sequence = null;
        this.session = null;

        this.activeModelPath = null;
        this.isLoading = false;
        this.isGenerating = false;
        this.abortController = null;
        this._generationLock = Promise.resolve(); // Mutex for sequence operations
    }

    /**
     * Force abort any current generation
     */
    abort() {
        if (this.isGenerating && this.abortController) {
            console.log('[LocalLLM] Forced abort');
            this.abortController.abort();
            this.isGenerating = false;
            this.emitStatus();
        }
    }

    /* =========================
       INIT
       ========================= */
    async init() {
        if (!this.llamaCppModule) {
            this.llamaCppModule = await import('node-llama-cpp');
            const { getLlama } = this.llamaCppModule;
            this.llama = await getLlama();
        }
    }

    /* =========================
       LOAD MODEL
       ========================= */
    async loadModel(modelPath, options = {}) {
        if (this.activeModelPath === modelPath && this.model) {
            return;
        }
        if (this.isLoading) throw new Error('Model is already loading');

        this.isLoading = true;
        this.emit('loading', { model: path.basename(modelPath) });

        try {
            await this.init();
            await this.unload();

            const threads = options.threads || Math.max(2, Math.min(os.cpus().length, 8));
            const contextSize = options.contextSize || 4096;
            const gpuLayers = options.gpuLayers || 0;
            const batchSize = options.batchSize || 512;

            console.log(`[LocalLLM] Loading model: ${path.basename(modelPath)}`);
            console.log(`[LocalLLM] Config: Threads=${threads}, Ctx=${contextSize}, GPU=${gpuLayers}, Batch=${batchSize}`);

            this.model = await this.llama.loadModel({
                modelPath,
                gpuLayers: gpuLayers === 'max' ? -1 : gpuLayers
            });

            this.context = await this.model.createContext({
                threads,
                contextSize,
                batchSize,
                sequences: 3 // Higher sequences for safer cleanup
            });

            this.activeModelPath = modelPath;
            this.emit('loaded', {
                model: path.basename(modelPath),
                contextSize,
                threads,
                gpuLayers
            });

            this.emitStatus();

        } catch (err) {
            this.emit('error', err);
            throw err;
        } finally {
            this.isLoading = false;
        }
    }

    /* =========================
       GENERATE
       ========================= */
    async generate(question, systemPrompt = '', options = {}) {
        // Acquire mutex lock properly inside the async method
        const lockRelease = await this._acquireLock();

        try {
            if (this.isGenerating) {
                console.warn('[LocalLLM] Generation already in progress, aborting previous...');
                this.abort();
                await new Promise(r => setTimeout(r, 100));
            }

            if (!this.context) throw new Error('No local model loaded');

            this.abortController = new AbortController();

            // Link external signal
            if (options.signal) {
                options.signal.addEventListener('abort', () => this.abortController.abort(), { once: true });
            }

            this.isGenerating = true;
            this.emitStatus();
            console.log('[LocalLLM] Starting generation...');

            let lastChunk = '';
            let repeatCount = 0;

            try {
                // Ensure fresh session/sequence
                if (this.session) {
                    try {
                        const p = this.session.dispose();
                        if (p instanceof Promise) await p;
                    } catch (e) { console.warn('Session dispose error', e); }
                    this.session = null;
                }
                if (this.sequence) {
                    try {
                        const p = this.sequence.dispose();
                        if (p instanceof Promise) await p;
                    } catch (e) { console.warn('Sequence dispose error', e); }
                    this.sequence = null;
                }

                // Essential for bridge stability
                await new Promise(r => setTimeout(r, 50));

                this.sequence = this.context.getSequence();

                const { LlamaChatSession } = this.llamaCppModule;
                this.session = new LlamaChatSession({
                    contextSequence: this.sequence,
                    systemPrompt
                });

                const temperature = options.temperature || 0.3;
                const topP = options.topP || 0.9;
                const topK = options.topK || 40;
                const repeatPenalty = options.repeatPenalty || 1.15;
                const maxTokens = options.maxTokens || 512;

                const response = await this.session.prompt(question, {
                    temperature,
                    topP,
                    topK,
                    repeatPenalty,
                    maxTokens,
                    stopOnAbortSignal: true,
                    signal: this.abortController.signal,
                    onToken: (tokens) => {
                        const chunk = this.context.model.detokenize(tokens);

                        // Repeat filter
                        if (chunk === lastChunk && chunk.length > 3) {
                            repeatCount++;
                            if (repeatCount > 5) {
                                this.abort();
                                return;
                            }
                        } else {
                            repeatCount = 0;
                            lastChunk = chunk;
                        }

                        this.emit('chunk', chunk);
                    }
                });

                console.log('[LocalLLM] Generation complete');
                this.emit('complete', response);
                return response;

            } catch (err) {
                if (err.name === 'AbortError' || this.abortController.signal.aborted) {
                    console.log('[LocalLLM] Generation aborted');
                    this.emit('aborted');
                } else {
                    console.error('Local LLM error:', err);
                    this.emit('error', err);
                }
                throw err;
            }
        } finally {
            this.isGenerating = false;
            lockRelease(); // Release mutex
            this.emitStatus();
        }
    }

    /**
     * Mutex implementation
     */
    async _acquireLock() {
        let release;
        const nextLock = new Promise(resolve => { release = resolve; });
        const currentLock = this._generationLock;
        this._generationLock = nextLock;
        await currentLock;
        return release;
    }

    /* =========================
       STATUS & UTILS
       ========================= */
    emitStatus() {
        if (!this.context) return;
        const status = {
            loaded: true,
            model: this.activeModelPath ? path.basename(this.activeModelPath) : null,
            contextSize: this.context.contextSize
        };
        try {
            // In node-llama-cpp v3, we can check tokens or sequence state
            if (this.sequence) {
                if (this.sequence.tokens) {
                    status.usedTokens = this.sequence.tokens.length;
                } else if (this.sequence.contextTokens) {
                    status.usedTokens = this.sequence.contextTokens.length;
                }
                // Fallback: if we have a state
                if (!status.usedTokens && this.sequence.state) {
                    status.usedTokens = this.sequence.state.tokens?.length || 0;
                }
            }
        } catch (e) { }
        this.emit('model:status', status);
    }

    async unload() {
        try {
            if (this.session) await this.session.dispose();
            if (this.sequence) await this.sequence.dispose();
            if (this.context) await this.context.dispose();
            if (this.model) await this.model.dispose();
        } catch { }
        this.session = null;
        this.sequence = null;
        this.context = null;
        this.model = null;
        this.activeModelPath = null;
        this.emit('unloaded');
    }
}

module.exports = new LocalLLMService();
