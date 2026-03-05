/**
 * Ollama Connector
 * Comunica com Ollama local via API REST
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

const EventEmitter = require('events');
const http = require('http');

class OllamaConnector extends EventEmitter {
    constructor() {
        super();
        this.baseUrl = 'http://localhost:11434';
        this.model = 'qwen3.5:9b';
        this.isReady = false;
        this.checkInterval = null;
    }

    /**
     * Verifica se Ollama está rodando
     */
    async checkHealth() {
        try {
            const response = await this._request('GET', '/api/tags');
            this.isReady = true;
            return { ready: true, models: response.models || [] };
        } catch (error) {
            this.isReady = false;
            return { ready: false, error: error.message };
        }
    }

    /**
     * Inicia health check
     */
    startHealthCheck() {
        this.checkHealth();
        this.checkInterval = setInterval(() => {
            this.checkHealth().then(result => {
                if (result.ready) {
                    this.emit('ready', result);
                }
            });
        }, 5000);
    }

    /**
     * Para health check
     */
    stopHealthCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Gera resposta com streaming
     */
    async generateStream(prompt, systemPrompt = '', options = {}) {
        console.log('[Ollama] generateStream called, isReady:', this.isReady);
        console.log('[Ollama] Prompt:', prompt.substring(0, 100));
        
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: 'localhost',
                port: 11434,
                path: '/api/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let fullText = '';
                let hasThinking = false;
                
                console.log('[Ollama] HTTP Status:', res.statusCode);
                console.log('[Ollama] Headers:', JSON.stringify(res.headers));

                res.on('data', (chunk) => {
                    const text = chunk.toString();
                    console.log('[Ollama] Raw response chunk:', text.substring(0, 200));
                    
                    const lines = text.split('\n').filter(l => l.trim());

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            console.log('[Ollama] Parsed JSON:', JSON.stringify(data).substring(0, 100));
                            
                            if (data.error) {
                                console.error('[Ollama] API error:', data.error);
                                reject(new Error(data.error));
                                return;
                            }

                            // Qwen3.5: thinking = raciocínio, response = resposta final
                            // Se response vier vazio, usar thinking como fallback
                            let token = data.response || '';
                            
                            if (!token && data.thinking) {
                                // Fallback: usar thinking se não tiver response
                                token = data.thinking;
                                hasThinking = true;
                                console.log('[Ollama] Using thinking as fallback');
                            }
                            
                            if (token) {
                                fullText += token;
                                this.emit('chunk', token);
                            }

                            if (data.done) {
                                console.log('[Ollama] Generation complete, length:', fullText.length);
                                console.log('[Ollama] Done reason:', data.done_reason);
                                console.log('[Ollama] Has thinking:', hasThinking);
                                this.emit('complete', fullText);
                                resolve(fullText);
                                return;
                            }
                        } catch (e) {
                            console.error('[Ollama] Parse error:', e.message, 'Line:', line);
                        }
                    }
                });

                res.on('error', (err) => {
                    console.error('[Ollama] Response error:', err.message);
                    reject(err);
                });
                
                res.on('end', () => {
                    console.log('[Ollama] Response ended, length:', fullText.length);
                    this.emit('complete', fullText);
                    resolve(fullText);
                });
            });

            req.on('error', (err) => {
                console.error('[Ollama] Request error:', err.message);
                reject(err);
            });

            const payload = {
                model: this.model,
                prompt: prompt,
                system: systemPrompt,
                stream: true,
                options: {
                    temperature: options.temperature || 0.3,
                    top_p: options.topP || 0.9,
                    num_predict: options.maxTokens || 512
                }
            };
            
            // Qwen3.5: desativar thinking chain-of-thought
            // think=False força o modelo a ir direto para resposta
            if (this.model.includes('qwen3.5') || this.model.includes('qwen3')) {
                payload.think = false;
                console.log('[Ollama] Qwen3.5 detected, disabling think mode');
            }
            
            console.log('[Ollama] Sending payload:', JSON.stringify(payload, null, 2));
            req.write(JSON.stringify(payload));

            req.end();
        });
    }

    /**
     * Gera resposta sem streaming
     */
    async generate(prompt, systemPrompt = '', options = {}) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: 'localhost',
                port: 11434,
                path: '/api/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let fullText = '';

                res.on('data', (chunk) => {
                    const text = chunk.toString();
                    const lines = text.split('\n').filter(l => l.trim());
                    
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (data.response) {
                                fullText += data.response;
                            }
                            if (data.done) {
                                resolve(fullText);
                                return;
                            }
                        } catch (e) {}
                    }
                });

                res.on('error', reject);
                res.on('end', () => resolve(fullText));
            });

            req.on('error', reject);

            req.write(JSON.stringify({
                model: this.model,
                prompt: prompt,
                system: systemPrompt,
                stream: false,
                options: {
                    temperature: options.temperature || 0.3,
                    top_p: options.topP || 0.9,
                    num_predict: options.maxTokens || 512
                }
            }));

            req.end();
        });
    }

    /**
     * Lista modelos disponíveis
     */
    async listModels() {
        try {
            const response = await this._request('GET', '/api/tags');
            return (response.models || []).map(m => m.name);
        } catch (error) {
            return [];
        }
    }

    /**
     * Helper para requisições HTTP
     */
    _request(method, path, body = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 11434,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Invalid JSON response: ${data}`));
                    }
                });
            });

            req.on('error', reject);

            if (body) {
                req.write(JSON.stringify(body));
            }

            req.end();
        });
    }
}

module.exports = new OllamaConnector();
