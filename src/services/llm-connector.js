/**
 * LLM Connector Service
 * Multi-provider LLM integration with API key rotation
 */

const EventEmitter = require('events');

class LLMConnector extends EventEmitter {
    constructor() {
        super();
        this.provider = 'openai';
        this.model = 'gpt-4o';
        this.config = {
            temperature: 0.7,
            maxTokens: 500
        };
        this.systemPrompt = '';

        // API Key rotation support
        this.apiKeys = [];
        this.currentKeyIndex = 0;
        this.failedKeys = new Set(); // Track keys that failed due to quota
    }

    /**
     * Configure the LLM provider
     */
    configure(options) {
        if (options.provider) this.provider = options.provider;
        if (options.model) this.model = options.model;
        if (options.temperature !== undefined) this.config.temperature = options.temperature;
        if (options.maxTokens) this.config.maxTokens = options.maxTokens;

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
     * Generate a response with automatic key rotation on failure
     */
    async generate(question, systemPrompt = null) {
        const prompt = systemPrompt || this.systemPrompt;
        let lastError = null;
        let attempts = 0;
        const maxAttempts = Math.max(this.apiKeys.length, 1);

        while (attempts < maxAttempts) {
            const apiKey = this.getCurrentKey();
            if (!apiKey) {
                throw new Error('No API keys configured');
            }

            try {
                const result = await this.generateWithKey(question, prompt, apiKey);
                return result;
            } catch (error) {
                lastError = error;

                // Sanitize error logging
                const isQuota = this.isQuotaError(error);
                const errMsg = error.message || 'Unknown error';
                const shortMsg = `[LLM] Error (Attempt ${attempts + 1}/${maxAttempts}): ${isQuota ? 'Quota Exceeded (429)' : errMsg.substring(0, 100) + '...'}`;

                console.warn(shortMsg);

                if (isQuota) {
                    this.markKeyFailed(apiKey);
                    this.rotateKey();
                    attempts++;

                    // Emit event so UI can show status
                    this.emit('quotaExceeded', {
                        attempt: attempts,
                        maxAttempts,
                        remainingKeys: this.apiKeys.length - this.failedKeys.size
                    });
                } else {
                    // Non-quota error, don't retry immediately
                    throw error;
                }
            }
        }

        // All keys exhausted
        throw new Error(`All ${this.apiKeys.length} API keys exhausted. Last error: ${lastError?.message}`);
    }

    /**
     * Generate with a specific API key
     */
    async generateWithKey(question, systemPrompt, apiKey) {
        // Debug Prompt Inspector
        console.log('--- [LLM Prompt Inspector] ---');
        console.log('Using Provider:', this.provider);
        console.log('System Prompt Prefix:', systemPrompt.substring(0, 50) + '...');
        console.log('User Question:', question);
        console.log('------------------------------');

        switch (this.provider) {
            case 'openai':
                return await this.generateOpenAI(question, systemPrompt, apiKey);
            case 'groq':
                return await this.generateGroq(question, systemPrompt, apiKey);
            case 'anthropic':
                return await this.generateAnthropic(question, systemPrompt, apiKey);
            case 'google':
                return await this.generateGoogle(question, systemPrompt, apiKey);
            default:
                throw new Error(`Unknown provider: ${this.provider}`);
        }
    }

    /**
     * Generate using Groq LLM (OpenAI compatible)
     */
    async generateGroq(question, systemPrompt, apiKey) {
        const OpenAI = require('openai'); // Groq SDK is also compatible or we can use openai sdk with base url

        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.groq.com/openai/v1'
        });

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Pergunta do entrevistador: "${question}"\n\nGere uma resposta sugerida:` }
            ];

            const response = await client.chat.completions.create({
                model: this.model || 'llama-3.1-70b-versatile',
                messages,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens
            });

            const fullResponse = response.choices[0]?.message?.content || '';
            this.emit('complete', fullResponse);
            return fullResponse;

        } catch (error) {
            console.error('Groq LLM error:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Generate using OpenAI API
     */
    async generateOpenAI(question, systemPrompt, apiKey) {
        const OpenAI = require('openai');

        const client = new OpenAI({ apiKey });

        try {
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
                const content = chunk.choices[0]?.delta?.content || '';
                fullResponse += content;
                this.emit('chunk', content);
            }

            this.emit('complete', fullResponse);
            return fullResponse;

        } catch (error) {
            console.error('OpenAI error:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Generate using Anthropic Claude API
     */
    async generateAnthropic(question, systemPrompt, apiKey) {
        const Anthropic = require('@anthropic-ai/sdk');

        const client = new Anthropic({ apiKey });

        try {
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

            const fullResponse = response.content[0]?.text || '';

            this.emit('complete', fullResponse);
            return fullResponse;

        } catch (error) {
            console.error('Anthropic error:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Generate using Google Gemini API
     */
    async generateGoogle(question, systemPrompt, apiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: this.model });

        try {
            const prompt = `${systemPrompt}\n\nPergunta do entrevistador: "${question}"\n\nGere uma resposta sugerida para esta pergunta de entrevista:`;

            const result = await model.generateContent(prompt);
            const fullResponse = result.response.text();

            this.emit('complete', fullResponse);
            return fullResponse;

        } catch (error) {
            console.error('Google Gemini error:', error);
            this.emit('error', error);
            throw error;
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
