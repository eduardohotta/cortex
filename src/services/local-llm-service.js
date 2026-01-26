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
        if (this.activeModelPath === modelPath && this.model) return;
        if (this.isLoading) throw new Error('Model is already loading');

        this.isLoading = true;
        this.emit('loading', { model: path.basename(modelPath) });

        try {
            await this.init();
            await this.unload();

            const threads =
                options.threads ||
                Math.max(2, Math.min(os.cpus().length, 8));

            const contextSize = options.contextSize || 4096;

            this.model = await this.llama.loadModel({
                modelPath
            });

            this.context = await this.model.createContext({
                threads,
                contextSize
            });

            this.sequence = this.context.getSequence();

            const { LlamaChatSession } = this.llamaCppModule;
            this.session = new LlamaChatSession({
                contextSequence: this.sequence
            });

            this.activeModelPath = modelPath;
            this.emit('loaded', { model: path.basename(modelPath) });

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
    async generate(question, systemPrompt = '') {
        if (!this.session) {
            throw new Error('No local model loaded');
        }
        if (this.isGenerating) {
            throw new Error('Generation already in progress');
        }

        this.isGenerating = true;
        console.log('[LocalLLM] Starting generation...');

        try {
            // Limpa histórico (não destrói sessão)
            this.session.resetChatHistory?.();

            if (systemPrompt) {
                this.session.setSystemPrompt?.(systemPrompt);
            }

            const response = await this.session.prompt(question, {
                onToken: (token) => {
                    let text = '';
                    try {
                        if (typeof token === 'string') {
                            text = token;
                        } else if (this.model && this.model.detokenize) {
                            // node-llama-cpp v3 uses model.detokenize
                            text = this.model.detokenize([token]);
                        } else if (this.llama && this.llama.decode) {
                            text = this.llama.decode(token);
                        } else {
                            // Fallback - just emit the token as-is
                            text = String.fromCharCode(...(Array.isArray(token) ? token : [token]));
                        }
                    } catch (e) {
                        console.warn('[LocalLLM] Token decode error:', e.message);
                        text = '';
                    }

                    if (text) {
                        this.emit('token', text);
                    }
                }
            });

            console.log('[LocalLLM] Generation complete');
            return response;

        } catch (err) {
            this.emit('error', err);
            throw err;
        } finally {
            this.isGenerating = false;
        }
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
