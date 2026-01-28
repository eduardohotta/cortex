/**
 * Settings Manager Service
 * Handles configuration persistence with encrypted API keys (supports multiple keys)
 */

const Store = require('electron-store');
const { safeStorage } = require('electron');

class SettingsManager {
    constructor() {
        // Initialize store for general settings
        // Note: Renamed to 'app-v2' to bypass corrupted legacy files that cause SyntaxError
        try {
            this.store = new Store({
                name: 'interview-assistant-app-v2',
                defaults: {
                    audioInput: 'default',
                    audioOutput: 'default',
                    sttProvider: 'groq',
                    language: 'auto',
                    mode: 'hr',
                    llmProvider: 'google',
                    llmModel: 'gemini-1.5-flash',
                    temperature: 0.7,
                    maxTokens: 500,
                    localTopK: 40,
                    localRepetitionPenalty: 1.15,
                    localMaxTokens: 512,
                    localThreads: 4,
                    localGpuLayers: 0, // 0 = auto/off depending on implementation
                    localBatchSize: 512,
                    systemPrompt: this.getDefaultPrompt('rh'),
                    overlayOpacity: 90,
                    hotkeyExplain: 'ctrl',
                    // UI Labels & Prompts (Externalized from ResponseView)
                    mainResponseTitle: 'Insight',
                    phraseAnalysisTitle: 'Análise',
                    wordDefinitionTitle: 'Definição',
                    phraseAnalysisPrompt: 'Explique brevemente a frase/conceito: "{phrase}". Contexto: Entrevista Técnica.',
                    wordDefinitionPrompt: 'Defina o termo técnico: "{phrase}". Seja conciso.',
                    labelReady: 'Pronto',
                    labelProcessing: 'Processando',
                    labelStreaming: 'Respondendo',
                    labelComplete: 'Completo',
                    labelError: 'Erro',
                    labelStop: 'Parar',
                    labelEnd: 'Encerrar',
                    labelCopy: 'Copiar Último',
                    labelCopied: 'Copiado!',
                    labelTipsPrefix: 'Dica: Hover + {hotkey} para highlights. Alt + Drag para seleção.',
                    profiles: {}
                }
            });
        } catch (error) {
            console.error('[SettingsManager] Failed to initialize primary store:', error);
            this.store = new Store({ name: `config-fallback-${Date.now()}` });
        }

        // Separate store for API keys. 
        // Note: Renamed to 'vault' to avoid conflicts with previous versions that used
        // a built-in encryption key which makes the file look like "invalid JSON" to the current version.
        try {
            this.encryptedStore = new Store({
                name: 'interview-assistant-vault-v2'
            });
        } catch (error) {
            console.error('[SettingsManager] Failed to initialize secure store:', error);
            // Nuclear fallback: create a uniquely named store for this session
            this.encryptedStore = new Store({ name: `secure-fallback-${Date.now()}` });
        }
    }

    /**
     * Get a setting value
     */
    get(key, provider = null) {
        if (key === 'apiKey' || key === 'apiKeys') {
            const activeProvider = provider || this.store.get('llmProvider');
            return this.getApiKeys(activeProvider);
        }
        return this.store.get(key);
    }

    /**
     * Set a setting value
     */
    set(key, value, provider = null) {
        if (key === 'apiKey' || key === 'apiKeys') {
            const activeProvider = provider || this.store.get('llmProvider');
            const keys = Array.isArray(value) ? value : [value];
            console.log(`[SettingsManager] Saving keys for ${activeProvider}: ${keys.length} keys`);
            return this.setApiKeys(activeProvider, keys);
        }
        console.log(`[SettingsManager] Saving ${key} = ${JSON.stringify(value)}`);
        this.store.set(key, value);
    }

    /**
     * Get all settings
     */
    getAll(provider = null) {
        const settings = { ...this.store.store };
        const activeProvider = provider || settings.llmProvider;
        settings.apiKeys = this.getApiKeys(activeProvider);
        settings.apiKey = settings.apiKeys[0] || '';
        return settings;
    }

    /**
     * Store multiple API keys for a provider with encryption
     */
    setApiKeys(provider, apiKeys) {
        if (!provider) {
            console.error('[SettingsManager] Cannot save keys without provider');
            return;
        }

        const validKeys = Array.isArray(apiKeys) ? apiKeys.filter(k => k && k.trim()) : [];

        try {
            if (safeStorage && safeStorage.isEncryptionAvailable()) {
                const encryptedKeys = validKeys.map(key => {
                    const encrypted = safeStorage.encryptString(key);
                    return encrypted.toString('base64');
                });

                const allEncrypted = this.encryptedStore.get('apiKeysEncrypted') || {};
                allEncrypted[provider] = encryptedKeys;
                this.encryptedStore.set('apiKeysEncrypted', allEncrypted);
                console.log(`[SettingsManager] Encrypted ${validKeys.length} keys for ${provider}`);
            } else {
                // Fallback to basic storage if safeStorage unavailable
                const allFlat = this.encryptedStore.get('apiKeys') || {};
                allFlat[provider] = validKeys;
                this.encryptedStore.set('apiKeys', allFlat);
                console.warn(`[SettingsManager] safeStorage unavailable. Saved ${validKeys.length} keys in plain text for ${provider}`);
            }
        } catch (error) {
            console.error(`[SettingsManager] Failed to encrypt API keys for ${provider}:`, error);
        }
    }

    /**
     * Retrieve and decrypt API keys for a specific provider
     */
    getApiKeys(provider) {
        if (!provider) return [];

        try {
            // Try encrypted keys first
            const allEncrypted = this.encryptedStore.get('apiKeysEncrypted') || {};
            const providerEncrypted = allEncrypted[provider];

            if (Array.isArray(providerEncrypted) && safeStorage && safeStorage.isEncryptionAvailable()) {
                return providerEncrypted.map(enc => {
                    try {
                        const buffer = Buffer.from(enc, 'base64');
                        return safeStorage.decryptString(buffer);
                    } catch (e) {
                        return '';
                    }
                }).filter(k => k);
            }

            // Fallback to plain text storage
            const allFlat = this.encryptedStore.get('apiKeys') || {};
            const keys = allFlat[provider] || [];
            console.log(`[SettingsManager] Retrieved ${keys.length} keys for ${provider}`);
            return keys;
        } catch (error) {
            console.error(`[SettingsManager] Failed to decrypt API keys for ${provider}:`, error);
            return [];
        }
    }

    /**
     * Add an API key (Legacy compatibility)
     */
    addApiKey(key, provider = null) {
        if (!key || !key.trim()) return;
        const activeProvider = provider || this.store.get('llmProvider');
        const keys = this.getApiKeys(activeProvider);
        if (!keys.includes(key)) {
            keys.push(key);
            this.setApiKeys(activeProvider, keys);
        }
    }

    /**
     * Remove an API key (Legacy compatibility)
     */
    removeApiKey(index, provider = null) {
        const activeProvider = provider || this.store.get('llmProvider');
        const keys = this.getApiKeys(activeProvider);
        if (index >= 0 && index < keys.length) {
            keys.splice(index, 1);
            this.setApiKeys(activeProvider, keys);
        }
    }

    /**
     * Save a profile configuration with behavior defaults
     */
    saveProfile(name, config) {
        // Smart defaults for behavior settings
        const defaults = {
            responseStyle: 'short',
            initiativeLevel: 'minimal',
            responseSize: 'medium',
            admitIgnorance: true,
            askClarification: true,
            avoidGeneric: true,
            negativeRules: ''
        };

        const profiles = this.store.get('profiles', {});
        profiles[name] = {
            ...defaults,
            ...config,
            savedAt: new Date().toISOString()
        };
        this.store.set('profiles', profiles);
    }

    /**
     * Build behavior prompt directives from profile settings
     */
    buildBehaviorPrompt(profile = {}) {
        const directives = [];
        const negativeDirectives = [];

        // 1. GATHER NEGATIVE RULES (MANDATORY CONSTRAINTS)
        if (profile.negativeRules && profile.negativeRules.trim()) {
            const rules = profile.negativeRules.split('\n').filter(r => r.trim()).map(r => `- ${r.trim().toUpperCase()}`);
            if (rules.length > 0) {
                negativeDirectives.push('\n[CRITICAL CONSTRAINTS - NEVER DO THESE]:\n' + rules.join('\n'));
            }
        }

        // 2. Performance / Style directives
        const styleMap = {
            short: 'SEJA DIRETO E BREVE. Sem introduções ou conclusões vazias.',
            didactic: 'Explique de forma DIDÁTICA, passo a passo.',
            strategic: 'Dê a resposta principal + INSIGHT ESTRATÉGICO.',
            code: 'CÓDIGO PRIMEIRO. Explicação mínima depois.'
        };
        if (profile.responseStyle && styleMap[profile.responseStyle]) {
            directives.push(styleMap[profile.responseStyle]);
        }

        // Initiative level
        const initiativeMap = {
            minimal: 'Responda APENAS o que foi perguntado.',
            brief: 'Complemente brevemente se necessário.',
            proactive: 'Sugira melhorias e antecipe dúvidas.'
        };
        if (profile.initiativeLevel && initiativeMap[profile.initiativeLevel]) {
            directives.push(initiativeMap[profile.initiativeLevel]);
        }

        // Hallucination preventers
        if (profile.admitIgnorance) directives.push('Se não souber, ADMITA. Jamais invente fatos.');
        if (profile.askClarification) directives.push('Se a pergunta for vaga, PEÇA ESCLARECIMENTO.');
        if (profile.avoidGeneric) directives.push('EVITE clichês e respostas genéricas.');

        let finalPrompt = '';
        if (negativeDirectives.length > 0) {
            finalPrompt += negativeDirectives.join('\n') + '\n\n';
        }
        if (directives.length > 0) {
            finalPrompt += '[BEHAVIORAL GUIDELINES]:\n' + directives.join('\n');
        }

        return finalPrompt ? '\n\n' + finalPrompt : '';
    }

    /**
     * Load a profile configuration
     */
    loadProfile(name) {
        const profiles = this.store.get('profiles', {});
        return profiles[name] || null;
    }

    /**
     * Get all profile names
     */
    getProfiles() {
        const profiles = this.store.get('profiles', {});
        return Object.entries(profiles).map(([id, data]) => ({
            id,
            name: data.name || 'Assistente',
            icon: data.icon || '🤖',
            ...data
        }));
    }

    /**
     * Delete a profile
     */
    deleteProfile(name) {
        const profiles = this.store.get('profiles', {});
        delete profiles[name];
        this.store.set('profiles', profiles);
        console.log(`[SettingsManager] Deleted profile: ${name}`);
    }

    /**
     * Get default prompt for a mode
     */
    getDefaultPrompt(mode) {
        const prompts = {
            rh: `Você é um assistente especialista em entrevistas de RH.
SEJA DIRETO. NÃO use frases de cortesia (ex: "Obrigado pela pergunta", "Interessante", "Como IA").
Responda APENAS o necessário. Use tópicos breves.
Foque em soft skills e exemplos práticos. Max 3 linhas por tópico.`,

            technical: `Você é um assistente técnico sênior.
SEJA DIRETO. Sem introduções ou conclusões vazias.
Responda a pergunta técnica imediatamente.
Dê exemplos de código curtos se necessário.
Evite explicações teóricas longas.`,

            leadership: `Você é um coach de liderança executiva.
SEJA DIRETO E ESTRATÉGICO. Sem "palestrinha".
Responda com ação e resultado.
Use exemplos de decisão difícil e gestão de crise.`,

            english: `You are an expert interview assistant.
BE DIRECT. NO filler phrases like "Thank you for asking" or "As an AI".
Answer immediately and concisely.
Use bullet points. Max 3 lines per point.`,

            startup: `Você é um founder de startup.
SEJA DIRETO E RÁPIDO. Tempo é dinheiro.
Responda com mindset de crescimento e execução.
Sem enrolação corporativa.`
        };

        return prompts[mode] || prompts.rh;
    }

    /**
 * Reset all settings to defaults
 */
    reset() {
        this.store.clear();
        this.encryptedStore.clear();
    }

    /**
     * Export settings (without API keys) for backup
     */
    export() {
        const settings = { ...this.store.store };
        delete settings.apiKey;
        delete settings.apiKeys;
        return JSON.stringify(settings, null, 2);
    }

    /**
     * Import settings from backup
     */
    import(jsonString) {
        try {
            const settings = JSON.parse(jsonString);
            delete settings.apiKey;
            delete settings.apiKeys;

            for (const [key, value] of Object.entries(settings)) {
                this.store.set(key, value);
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = SettingsManager;
