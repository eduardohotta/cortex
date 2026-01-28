/**
 * API Keys Management Module
 */
import { state, elements } from './state.js';

/**
 * Add a new API key
 */
export async function addApiKey() {
    const key = elements.apiKeyInput.value.trim();
    if (!key) return;

    const provider = elements.llmProvider.value;
    state.keysByProvider[provider].push(key);
    elements.apiKeyInput.value = '';

    await window.electronAPI.settings.set('apiKeys', state.keysByProvider[provider], provider);
    renderApiKeys();
}

/**
 * Render API keys list with delete buttons
 */
export function renderApiKeys() {
    const provider = elements.llmProvider.value;
    const keys = state.keysByProvider[provider] || [];

    elements.keyCountBadge.textContent = `${keys.length} chaves`;
    elements.apiKeysList.innerHTML = keys.map((k, i) => `
        <div class="api-key-item">
            <span class="key-value">${k.substring(0, 8)}...${k.slice(-4)}</span>
            <button class="btn-delete-key" data-provider="${provider}" data-index="${i}" title="Remover chave">
                <span class="delete-icon">✕</span>
            </button>
        </div>
    `).join('');

    // Add click handlers for delete buttons
    elements.apiKeysList.querySelectorAll('.btn-delete-key').forEach(btn => {
        btn.addEventListener('click', async () => {
            const provider = btn.dataset.provider;
            const index = parseInt(btn.dataset.index);
            state.keysByProvider[provider].splice(index, 1);
            await window.electronAPI.settings.set('apiKeys', state.keysByProvider[provider], provider);
            renderApiKeys();
        });
    });
}

/**
 * Update model options based on selected provider
 */
export function updateModelOptions() {
    const provider = elements.llmProvider.value;
    const models = {
        openai: [
            { v: 'gpt-4o', l: 'GPT-4o' },
            { v: 'gpt-4o-mini', l: 'GPT-4o Mini' }
        ],
        groq: [
            { v: 'llama-3.3-70b-versatile', l: 'Llama 3.3 70B' },
            { v: 'llama-3.1-70b-versatile', l: 'Llama 3.1 70B' }
        ],
        anthropic: [
            { v: 'claude-3-5-sonnet-20241022', l: 'Claude 3.5 Sonnet' }
        ],
        google: [
            { v: 'gemini-3-pro-preview', l: 'Gemini 3 Pro (Preview)' },
            { v: 'gemini-3-flash-preview', l: 'Gemini 3 Flash (Preview)' },

            { v: 'gemini-2.5-pro', l: 'Gemini 2.5 Pro' },
            { v: 'gemini-2.5-flash', l: 'Gemini 2.5 Flash' },
            { v: 'gemini-2.5-flash-lite', l: 'Gemini 2.5 Flash-Lite' },

            { v: 'gemini-2.0-flash', l: 'Gemini 2.0 Flash (Deprecated)' },
            { v: 'gemini-2.0-flash-lite', l: 'Gemini 2.0 Flash-Lite (Deprecated)' }
        ]
    };

    const list = models[provider] || [];
    elements.llmModel.innerHTML = list.map(m => `<option value="${m.v}">${m.l}</option>`).join('');
}
