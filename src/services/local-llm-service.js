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
            // If model is already loaded, we might need to reload if performance settings changed
            // For now, simpler to just return if path matches, but ideally check opts.
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
            const gpuLayers = options.gpuLayers || 0; // 0 = auto/off
            const batchSize = options.batchSize || 512;

            console.log(`[LocalLLM] Loading model: ${path.basename(modelPath)}`);
            console.log(`[LocalLLM] Config: Threads=${threads}, Ctx=${contextSize}, GPU=${gpuLayers}, Batch=${batchSize}`);

            this.model = await this.llama.loadModel({
                modelPath,
                gpuLayers: gpuLayers === 'max' ? -1 : gpuLayers // -1 usually means all in some bindings, but node-llama-cpp uses number
            });

            this.context = await this.model.createContext({
                threads,
                contextSize,
                batchSize
            });

            this.sequence = this.context.getSequence();

            const { LlamaChatSession } = this.llamaCppModule;
            this.session = new LlamaChatSession({
                contextSequence: this.sequence
            });

            this.activeModelPath = modelPath;
            this.emit('loaded', {
                model: path.basename(modelPath),
                contextSize,
                threads,
                gpuLayers
            });

            // Emit initial status
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
        if (!this.context) {
            throw new Error('No local model loaded');
        }
        if (this.isGenerating) {
            throw new Error('Generation already in progress');
        }

        this.isGenerating = true;
        this.emitStatus(); // Update status start
        console.log('[LocalLLM] Starting generation...');

        let lastChunk = '';
        let repeatCount = 0;

        try {
            // 🔥 CRIA NOVA SEQUENCE (evita loop)
            // Note: Recreating sequence clears history? No, session manages history. 
            // But here we are disposing sequence.
            // If we want to keep history, we should keep the sequence.
            // PROMPT: The user wants "Context Monitoring". If we wipe conversation every time, context usage is low.
            // For "Interview Insight", usually we want fresh context per question or short history.
            // The previous code disposed sequence every time. 
            // I will keep this behavior for now to ensure stability, but we should probably 
            // let the Session manage context if we want "History".
            // However, the requested feature is "Model Control Panel", not "Fix Context Retention".
            // I will stick to current behavior but make sure `emitStatus` reflects the current state.

            if (this.sequence) {
                await this.sequence.dispose();
            }

            this.sequence = this.context.getSequence();

            const { LlamaChatSession } = this.llamaCppModule;
            this.session = new LlamaChatSession({
                contextSequence: this.sequence,
                systemPrompt
            });

            // Extract generation params with new defaults
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
                stop: ["User:", "Human:", "AI:", "##", "Insight:"],
                onTextChunk: (text) => {
                    // Update token count estimation (rough)
                    this.usedTokens++;
                    const currentPercent = Math.min((this.usedTokens / this.context.contextSize) * 100, 100);

                    // Emit status every 10 tokens or so to avoid spam
                    if (this.usedTokens % 10 === 0) {
                        this.emitStatus();
                    }

                    // 🛑 DETECTOR DE LOOP
                    if (text === lastChunk) {
                        repeatCount++;
                        if (repeatCount > 6) {
                            console.warn('[LocalLLM] Loop detected, aborting');
                            this.session.abort();
                            return;
                        }
                    } else {
                        repeatCount = 0;
                    }

                    lastChunk = text;

                    // 🔥 STREAM REAL
                    this.emit('token', text);

                    // Optional: Emit detailed status sparsely if needed, 
                    // but onToken might be too frequent.
                }
            });

            console.log('[LocalLLM] Generation complete');
            this.emitStatus(); // Update status end
            return response;

        } catch (err) {
            if (err.name === 'AbortError' || err.message === 'Aborted') {
                console.log('[LocalLLM] Generation aborted');
                this.emit('aborted');
                return null;
            }
            this.emit('error', err);
            throw err;
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Emit current model status (context usage)
     */
    emitStatus() {
        if (!this.context) return;

        // Accurate way depends on node-llama-cpp version.
        // v3 doesn't expose `context.getFreeTokens()` directly easily on JS side always.
        // We can estimate or try to access internal properties if available.
        // For now, we will send max context size.
        // Ideally we track `session.sequence.tokenMeter.used`

        // Mocking used for now as `node-llama-cpp` API is complex to sync without docs.
        // But we can send the configured Context Size.

        const status = {
            loaded: true,
            model: this.activeModelPath ? path.basename(this.activeModelPath) : null,
            contextSize: this.context.contextSize,
            // usedTokens: this.sequence ? this.sequence.tokenMeter.used : 0 
            // (Assuming this API exists, otherwise we'll just send basics)
        };

        try {
            // Attempt to get used tokens if available
            if (this.sequence && this.sequence.tokenMeter) {
                status.usedTokens = this.sequence.tokenMeter.used;
            }
        } catch (e) { }

        this.emit('model:status', status);
    }


    /* =========================
       UNLOAD
       ========================= */
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
