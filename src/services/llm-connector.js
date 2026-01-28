/**
 * LLM Connector Service
 * Multi-provider LLM integration with API key rotation
 */

const EventEmitter = require('events');
const localLLM = require('./local-llm-service');
const modelManager = require('./model-manager');

class LLMConnector extends EventEmitter {
    constructor() {
        super();
        this.provider = 'openai';
        this.model = 'gpt-4o';
        this.config = {
            temperature: 0.7,
            maxTokens: 500,
            topP: 0.9,
            topK: 40,
            repeatPenalty: 1.15,
            threads: 4,
            gpuLayers: 0,
            batchSize: 512
        };
        this.systemPrompt = '';

        // API Key rotation support
        this.apiKeys = [];
        this.currentKeyIndex = 0;
        this.failedKeys = new Set(); // Track keys that failed due to quota

        // Cancellation support
        this.abortController = null;
    }

    /**
     * Abort current generation
     */
    abort() {
        if (this.abortController) {
            console.log('[LLMConnector] Aborting generation...');
            this.abortController.abort();
            this.abortController = null;
            this.emit('aborted');
        }
    }

    /**
     * Configure the LLM provider
     */
    configure(options) {
        if (options.provider) this.provider = options.provider;
        if (options.model) this.model = options.model;
        if (options.temperature !== undefined) this.config.temperature = options.temperature;
        if (options.maxTokens) this.config.maxTokens = options.maxTokens;
        if (options.topP !== undefined) this.config.topP = options.topP;
        if (options.topK !== undefined) this.config.topK = options.topK;
        if (options.repeatPenalty !== undefined) this.config.repeatPenalty = options.repeatPenalty;

        // Performance settings
        if (options.threads) this.config.threads = options.threads;
        if (options.gpuLayers !== undefined) this.config.gpuLayers = options.gpuLayers;
        if (options.batchSize) this.config.batchSize = options.batchSize;

        // Handle API keys - support both single key and array
        if (options.apiKeys && Array.isArray(options.apiKeys)) {
            this.setApiKeys(options.apiKeys);
        } else if (options.apiKey) {
            this.setApiKeys([options.apiKey]);
        }
    }

    /**
     * Set multiple API keys for rotation
     * @param {string[]} keys - Array of API keys
     */
    setApiKeys(keys) {
        this.apiKeys = keys.filter(k => k && k.trim());
        this.currentKeyIndex = 0;
        this.failedKeys.clear();
        console.log(`Loaded ${this.apiKeys.length} API key(s) for rotation`);
    }

    /**
     * Get the current active API key
     */
    getCurrentKey() {
        if (this.apiKeys.length === 0) return '';

        // Find a working key
        let attempts = 0;
        while (attempts < this.apiKeys.length) {
            const key = this.apiKeys[this.currentKeyIndex];
            if (!this.failedKeys.has(key)) {
                this.emit('keyActive', { index: this.currentKeyIndex, key: this.maskKey(key) });
                return key;
            }
            this.rotateKey();
            attempts++;
        }

        // All keys failed, reset and try again
        console.warn('All API keys exhausted, resetting...');
        this.failedKeys.clear();
        const key = this.apiKeys[this.currentKeyIndex];
        this.emit('keyActive', { index: this.currentKeyIndex, key: this.maskKey(key) });
        return key;
    }

    /**
     * Mask key for logs/events
     */
    maskKey(key) {
        if (!key) return '';
        return key.substring(0, 7) + '...' + key.substring(key.length - 4);
    }

    /**
     * Rotate to the next API key
     */
    rotateKey() {
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        console.log(`Rotated to API key ${this.currentKeyIndex + 1}/${this.apiKeys.length}`);
        this.emit('keyRotated', { index: this.currentKeyIndex, total: this.apiKeys.length });
    }

    /**
     * Mark current key as failed (quota exceeded)
     */
    markKeyFailed(key) {
        this.failedKeys.add(key);
        console.warn(`API key marked as failed (${this.failedKeys.size}/${this.apiKeys.length} failed)`);
        this.emit('keyFailed', { failed: this.failedKeys.size, total: this.apiKeys.length });
    }

    /**
     * Check if error is a quota/rate limit error
     */
    isQuotaError(error) {
        const message = error?.message?.toLowerCase() || '';
        const status = error?.status || error?.statusCode;

        return (
            status === 429 ||
            status === 402 ||
            message.includes('quota') ||
            message.includes('rate limit') ||
            message.includes('insufficient_quota') ||
            message.includes('billing') ||
            message.includes('exceeded') ||
            message.includes('limit reached')
        );
    }

    /**
     * Set the system prompt
     */
    setSystemPrompt(prompt) {
        this.systemPrompt = prompt;
    }

    /**
     * Generate a response WITHOUT aborting the current main generation
     * Used for secondary requests like "Click-to-Explain".
     */
    async generateDefinition(question, systemPrompt = null) {
        const prompt = systemPrompt || this.systemPrompt;
        const localSignal = new AbortController().signal;

        if (this.provider === 'local') {
            return await this.generateLocal(question, prompt, localSignal);
        }

        const apiKey = this.getCurrentKey();
        if (!apiKey) {
            throw new Error(`No API keys configured for ${this.provider}`);
        }

        try {
            return await this.generateWithKey(question, prompt, apiKey, localSignal);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Generate a response with automatic key rotation on failure
     */
    async generate(question, systemPrompt = null) {
        // Cancel previous generation if exists
        if (this.abortController) {
            this.abort();
        }

        // Create new controller for this generation
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const prompt = systemPrompt || this.systemPrompt;

        try {
            // If local provider, bypass API key rotation logic
            if (this.provider === 'local') {
                return await this.generateLocal(question, prompt, signal);
            }

            let lastError = null;
            let attempts = 0;
            const maxAttempts = Math.max(this.apiKeys.length, 1);

            while (attempts < maxAttempts) {
                if (signal.aborted) throw new Error('Aborted');

                const apiKey = this.getCurrentKey();
                if (!apiKey) {
                    throw new Error(`No API keys configured for ${this.provider}`);
                }

                try {
                    const result = await this.generateWithKey(question, prompt, apiKey, signal);
                    this.abortController = null;
                    return result;
                } catch (error) {
                    if (error.name === 'AbortError' || signal.aborted) {
                        this.abortController = null;
                        throw error;
                    }

                    lastError = error;
                    const isQuota = this.isQuotaError(error);
                    const errMsg = error.message || 'Unknown error';
                    const shortMsg = `[LLM] Error (Attempt ${attempts + 1}/${maxAttempts}): ${isQuota ? 'Quota Exceeded (429)' : errMsg.substring(0, 100) + '...'}`;

                    console.warn(shortMsg);

                    if (isQuota) {
                        this.markKeyFailed(apiKey);
                        this.rotateKey();
                        attempts++;

                        this.emit('quotaExceeded', {
                            attempt: attempts,
                            maxAttempts,
                            remainingKeys: this.apiKeys.length - this.failedKeys.size
                        });
                    } else {
                        throw error;
                    }
                }
            }
            throw new Error(`All ${this.apiKeys.length} API keys exhausted. Last error: ${lastError?.message}`);

        } catch (error) {
            this.abortController = null;
            if (error.name === 'AbortError' || error.message === 'Aborted') {
                console.log('[LLMConnector] Generation aborted by user/system');
                return null;
            }
            throw error;
        }
    }

    /**
     * Generate with a specific API key
     */
    async generateWithKey(question, systemPrompt, apiKey, signal) {
        // Debug Prompt Inspector
        console.log('--- [LLM Prompt Inspector] ---');
        console.log('Using Provider:', this.provider);
        console.log('System Prompt Prefix:', systemPrompt ? systemPrompt.substring(0, 50) + '...' : 'None');
        console.log('User Question:', question);
        console.log('------------------------------');

        switch (this.provider) {
            case 'openai':
                return await this.generateOpenAI(question, systemPrompt, apiKey, signal);
            case 'groq':
                return await this.generateGroq(question, systemPrompt, apiKey, signal);
            case 'anthropic':
                return await this.generateAnthropic(question, systemPrompt, apiKey, signal);
            case 'google':
                return await this.generateGoogle(question, systemPrompt, apiKey, signal);
            case 'local':
                return await this.generateLocal(question, systemPrompt, signal);
            default:
                throw new Error(`Unknown provider: ${this.provider}`);
        }
    }

    /**
     * Generate using Groq LLM (OpenAI compatible)
     */
    async generateGroq(question, systemPrompt, apiKey, signal) {
        const OpenAI = require('openai'); // Groq SDK is also compatible or we can use openai sdk with base url

        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.groq.com/openai/v1'
        });

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Pergunta do entrevistador: "${question}"\n\nGere uma resposta sugerida:` }
        ];

        // Note: OpenAI Node SDK doesn't support AbortSignal natively in create() in all versions 
        // but recent ones do via options, or we can use fetch polyfills. 
        // For simplicity, we just check signal here. (Improvement needed for real-time cancel)

        const response = await client.chat.completions.create({
            model: this.model || 'llama-3.1-70b-versatile',
            messages,
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens
        });

        if (signal?.aborted) throw new Error('Aborted');

        const fullResponse = response.choices[0]?.message?.content || '';
        this.emit('complete', fullResponse);
        return fullResponse;
    }

    /**
     * Generate using OpenAI API
     */
    async generateOpenAI(question, systemPrompt, apiKey, signal) {
        const OpenAI = require('openai');

        const client = new OpenAI({ apiKey });

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Pergunta do entrevistador: "${question}"\n\nGere uma resposta sugerida para esta pergunta de entrevista:` }
        ];

        const stream = await client.chat.completions.create({
            model: this.model,
            messages,
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
            stream: true
        });

        let fullResponse = '';

        for await (const chunk of stream) {
            if (signal?.aborted) {
                stream.controller.abort(); // Attempt to stop stream
                throw new Error('Aborted');
            }
            const content = chunk.choices[0]?.delta?.content || '';
            fullResponse += content;
            this.emit('chunk', content);
        }

        this.emit('complete', fullResponse);
        return fullResponse;
    }

    /**
     * Generate using Anthropic Claude API
     */
    async generateAnthropic(question, systemPrompt, apiKey, signal) {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey });

        const response = await client.messages.create({
            model: this.model,
            max_tokens: this.config.maxTokens,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: `Pergunta do entrevistador: "${question}"\n\nGere uma resposta sugerida para esta pergunta de entrevista:`
                }
            ]
        });

        if (signal?.aborted) throw new Error('Aborted');

        const fullResponse = response.content[0]?.text || '';
        this.emit('complete', fullResponse);
        return fullResponse;
    }

    /**
     * Generate using Google Gemini API
     */
    async generateGoogle(question, systemPrompt, apiKey, signal) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: this.model });

        const prompt = `${systemPrompt}\n\nPergunta do entrevistador: "${question}"\n\nGere uma resposta sugerida para esta pergunta de entrevista:`;

        const result = await model.generateContent(prompt);

        if (signal?.aborted) throw new Error('Aborted');

        const fullResponse = result.response.text();

        this.emit('complete', fullResponse);
        return fullResponse;
    }

    /**
     * Generate using Local LLM (Offline) - Event-based streaming
     */
    async generateLocal(question, systemPrompt, signal) {
        const activeModelFilename = this.model;

        if (!activeModelFilename) {
            throw new Error('No local model selected. Please choose a model in settings.');
        }

        const modelPath = modelManager.getPath(activeModelFilename);

        try {
            await localLLM.loadModel(modelPath, {
                threads: this.config.threads,
                gpuLayers: this.config.gpuLayers,
                batchSize: this.config.batchSize
            });

            // Forward token events as chunk events immediately
            const onChunk = (text) => {
                if (text) {
                    this.emit('chunk', text);
                }
            };

            localLLM.on('chunk', onChunk);

            // Handle signal
            if (signal) {
                signal.addEventListener('abort', () => {
                    localLLM.off('chunk', onChunk);
                });
            }

            try {
                // Generate and wait for completion
                const response = await localLLM.generate(question, systemPrompt, {
                    signal,
                    temperature: this.config.temperature,
                    topP: this.config.topP,
                    topK: this.config.topK,
                    repeatPenalty: this.config.repeatPenalty,
                    maxTokens: this.config.maxTokens
                });

                // Cleanup listener
                localLLM.off('chunk', onChunk);

                if (response === null && signal?.aborted) {
                    return null;
                }

                this.emit('complete', response);
                return response;
            } catch (err) {
                localLLM.off('token', onToken);
                throw err;
            }
        } catch (err) {
            if (err.name === 'AbortError' || (signal && signal.aborted)) {
                return null;
            }
            console.error('Local LLM error:', err);
            this.emit('error', err);
            throw err;
        }
    }

    /**
     * Get status of API keys
     */
    getKeyStatus() {
        return {
            total: this.apiKeys.length,
            current: this.currentKeyIndex + 1,
            failed: this.failedKeys.size,
            available: this.apiKeys.length - this.failedKeys.size
        };
    }

    /**
     * Test connection with current configuration
     */
    async testConnection() {
        try {
            const response = await this.generate('Olá, você está funcionando?', 'Responda brevemente: sim ou não.');
            return { success: true, response, keyStatus: this.getKeyStatus() };
        } catch (error) {
            return { success: false, error: error.message, keyStatus: this.getKeyStatus() };
        }
    }
}

module.exports = LLMConnector;
