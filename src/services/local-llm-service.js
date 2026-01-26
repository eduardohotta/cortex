const path = require('path');
const EventEmitter = require('events');

class LocalLLMService extends EventEmitter {
    constructor() {
        super();
        this.llama = null;
        this.model = null;
        this.context = null;
        this.session = null;
        this.isLoading = false;
        this.activeModelPath = null;
        this.llamaCppModule = null; // Store the full module
    }

    async init() {
        if (!this.llamaCppModule) {
            // Dynamic import for ESM module
            this.llamaCppModule = await import('node-llama-cpp');
            const { getLlama } = this.llamaCppModule;
            this.llama = await getLlama();
        }
    }

    /**
     * Load a GGUF model from the given path
     */
    async loadModel(modelPath) {
        if (this.isLoading) throw new Error('Model is currently loading');
        if (this.activeModelPath === modelPath && this.model) return; // Already loaded

        this.isLoading = true;
        this.emit('loading', { status: 'loading', model: path.basename(modelPath) });

        try {
            await this.init();

            // Unload previous model if exists
            if (this.model) {
                if (this.context) await this.context.dispose();
                if (this.model) await this.model.dispose();
                this.context = null;
                this.model = null;
                this.session = null;
            }

            console.log(`[LocalLLM] Loading model from ${modelPath}...`);

            // Load new model
            this.model = await this.llama.loadModel({
                modelPath: modelPath
            });

            // Create context
            this.context = await this.model.createContext({
                threads: 4, // Default to 4 threads
                contextSize: 2048 // Default context size
            });

            const { LlamaChatSession } = this.llamaCppModule;
            this.session = new LlamaChatSession({
                contextSequence: this.context.getSequence()
            });

            this.activeModelPath = modelPath;
            console.log('[LocalLLM] Model loaded successfully');
            this.emit('loaded', { model: path.basename(modelPath) });

        } catch (error) {
            console.error('[LocalLLM] Failed to load model:', error);
            this.emit('error', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Generate response for a given prompt
     */
    async generate(question, systemPrompt) {
        if (!this.model || !this.session) {
            throw new Error('No local model loaded. Please download/select a model in Settings.');
        }

        try {
            await this.init();
            const { LlamaChatSession } = this.llamaCppModule;

            // If system prompt changed significantly, might need to reset history,
            // but for now we just use the session. node-llama-cpp handles system prompt in init usually,
            // or via prompt wrappers.
            // LlamaChatSession handles history automatically.

            // Note: Simplest implementation - we treat each generate call as part of the session.
            // If we want stateless per-question (like the online engines usually are in this app),
            // we might want to clear history or create new session.
            // For Interview Assistant, usually context is 1-turn or short lived.

            // Let's reset session for each "Interview Question" to avoid context pollution from previous disparate questions,
            // unless we want conversation history. The online engines in this app seem to send "question" + "system prompt".
            // Implementation choice: Reset session history to ensure "fresh" answer based on system prompt + question.

            this.session = new LlamaChatSession({
                contextSequence: this.context.getSequence(),
                systemPrompt: systemPrompt
            });

            console.log('[LocalLLM] Generating response...');
            const response = await this.session.prompt(question, {
                onToken: (chunk) => {
                    const text = this.llama.de2(chunk);
                    this.emit('token', text);
                }
            });

            return response;

        } catch (error) {
            console.error('[LocalLLM] Generation failed:', error);
            throw error;
        }
    }

    /**
     * Unload current model to free RAM
     */
    async unload() {
        if (this.context) await this.context.dispose();
        if (this.model) await this.model.dispose();
        this.context = null;
        this.model = null;
        this.session = null;
        this.activeModelPath = null;
        this.emit('unloaded');
        console.log('[LocalLLM] Model unloaded');
    }
}

module.exports = new LocalLLMService();
