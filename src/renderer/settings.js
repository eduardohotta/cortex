/**
 * Settings Management Module
 */
import { state, elements } from './state.js';
import { updateModelOptions, renderApiKeys } from './api-keys.js';

/**
 * Load all initial settings data
 */
export async function loadSettings() {
    console.log('[Settings] Loading initial settings...');

    // Load Audio Devices
    const devices = await window.electronAPI.audio.getDevices();
    elements.audioSource.innerHTML = devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

    // Load General Settings
    const allSettings = await window.electronAPI.settings.getAll();
    Object.assign(state.settings, allSettings);

    // Load API Keys for all providers
    const providers = ['openai', 'groq', 'google', 'anthropic'];
    for (const p of providers) {
        const s = await window.electronAPI.settings.getAll(p);
        state.keysByProvider[p] = s.apiKeys || [];
    }
}

/**
 * Apply current settings to UI elements
 */
export function applySettingsToUI() {
    const s = state.settings;
    elements.llmProvider.value = s.llmProvider || 'openai';
    updateModelOptions();
    elements.llmModel.value = s.llmModel || '';
    elements.systemPrompt.value = s.systemPrompt || '';
    elements.assistantInstructions.value = s.assistantInstructions || '';
    elements.additionalContext.value = s.additionalContext || '';
    elements.hotkeyRecord.value = s.hotkeyRecord || 'Alt+R';
    elements.hotkeyAsk.value = s.hotkeyAsk || 'Alt+A';
    elements.sttProvider.value = s.sttProvider || 'groq';
    elements.audioSource.value = s.audioSource || 'system';
    elements.language.value = s.language || 'auto';
}

/**
 * Save all current settings
 */
export async function saveAllSettings() {
    const settings = {
        llmProvider: elements.llmProvider.value,
        llmModel: elements.llmModel.value,
        systemPrompt: elements.systemPrompt.value,
        assistantInstructions: elements.assistantInstructions.value,
        additionalContext: elements.additionalContext.value,
        hotkeyRecord: elements.hotkeyRecord.value,
        hotkeyAsk: elements.hotkeyAsk.value,
        sttProvider: elements.sttProvider.value,
        audioSource: elements.audioSource.value,
        language: elements.language.value
    };

    console.log('[Settings] Saving:', settings);

    for (const [k, v] of Object.entries(settings)) {
        await window.electronAPI.settings.set(k, v);
    }

    // Also save to current assistant profile if one is selected
    if (state.currentAssistantId) {
        await window.electronAPI.settings.saveProfile(state.currentAssistantId, {
            name: elements.assistantNameInput?.value || 'Assistente',
            systemPrompt: settings.systemPrompt,
            assistantInstructions: settings.assistantInstructions,
            additionalContext: settings.additionalContext
        });
    }

    await window.electronAPI.settings.refreshShortcuts();
    alert('Configurações salvas com sucesso!');
}

/**
 * Capture hotkey input
 */
export function captureHotkey(input) {
    input.value = 'Pressione as teclas...';
    input.classList.add('capturing');

    const onKeyDown = (e) => {
        e.preventDefault();
        const keys = [];
        if (e.ctrlKey) keys.push('Ctrl');
        if (e.shiftKey) keys.push('Shift');
        if (e.altKey) keys.push('Alt');
        if (e.metaKey) keys.push('Command');

        const key = e.key.toUpperCase();
        if (!['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) {
            keys.push(key);
            input.value = keys.join('+');
            input.classList.remove('capturing');
            window.removeEventListener('keydown', onKeyDown);
        }
    };
    window.addEventListener('keydown', onKeyDown);
}

/**
 * Switch active tab
 */
export function switchTab(tabId) {
    state.activeTab = tabId;
    elements.tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    elements.tabContents.forEach(content => content.classList.toggle('active', content.id === `tab-${tabId}`));
}
