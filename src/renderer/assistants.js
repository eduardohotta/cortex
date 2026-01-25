/**
 * Assistant Management Module
 */
import { state, elements } from './state.js';

/**
 * Load assistants from settings
 */
export async function loadAssistants() {
    try {
        const profiles = await window.electronAPI.settings.getProfiles();
        state.assistants = profiles && profiles.length > 0 ? profiles : [
            { id: 'default', name: 'Meu Assistente', icon: '🎯' }
        ];
    } catch (e) {
        state.assistants = [{ id: 'default', name: 'Meu Assistente', icon: '🎯' }];
    }

    renderAssistantList();

    if (state.assistants.length > 0 && !state.currentAssistantId) {
        selectAssistant(state.assistants[0].id);
    }
}

/**
 * Render the assistant list in sidebar
 */
export function renderAssistantList() {
    if (!elements.assistantList) return;

    elements.assistantList.innerHTML = state.assistants.map(a => `
        <div class="assistant-wrapper">
            <button class="assistant-item ${a.id === state.currentAssistantId ? 'active' : ''}" data-id="${a.id}">
                <span class="icon">${a.icon || '🤖'}</span>
                <div class="info">
                    <span class="name">${a.name}</span>
                    <span class="status">Personalizado</span>
                </div>
            </button>
            ${a.id !== 'general' && a.id !== 'default' ? `
            <button class="btn-delete-assistant" data-id="${a.id}" title="Excluir Assistente">
                ✕
            </button>` : ''}
        </div>
    `).join('');

    elements.assistantList.querySelectorAll('.assistant-item').forEach(btn => {
        btn.addEventListener('click', () => selectAssistant(btn.dataset.id));
    });

    elements.assistantList.querySelectorAll('.btn-delete-assistant').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteAssistant(btn.dataset.id);
        });
    });
}

/**
 * Delete an assistant
 */
export async function deleteAssistant(id) {
    if (confirm('Tem certeza que deseja excluir este assistente?')) {
        // Optimistic update
        state.assistants = state.assistants.filter(a => a.id !== id);

        // If we deleted the current assistant, switch to default
        if (state.currentAssistantId === id) {
            const next = state.assistants.length > 0 ? state.assistants[0].id : null;
            if (next) selectAssistant(next);
        }

        // Save persistence via IPC
        await window.electronAPI.settings.deleteProfile(id);

        console.log('[Assistants] Deleted:', id);
        renderAssistantList();
    }
}

/**
 * Select an assistant by ID
 */
export async function selectAssistant(id) {
    console.log('[Assistants] Selecting:', id);
    state.currentAssistantId = id;

    const assistant = state.assistants.find(a => a.id === id);
    if (assistant && elements.assistantNameInput) {
        elements.assistantNameInput.value = assistant.name;

        const profile = await window.electronAPI.settings.loadProfile(id);
        if (profile) {
            if (elements.systemPrompt) elements.systemPrompt.value = profile.systemPrompt || '';
            if (elements.assistantInstructions) elements.assistantInstructions.value = profile.assistantInstructions || '';
            if (elements.additionalContext) elements.additionalContext.value = profile.additionalContext || '';
        }
    }

    renderAssistantList();
}

/**
 * Create a new assistant
 */
export async function createNewAssistant() {
    const newId = 'assistant_' + Date.now();
    const newAssistant = {
        id: newId,
        name: 'Novo Assistente',
        icon: '🤖'
    };

    // Save to settings first
    await window.electronAPI.settings.saveProfile(newId, {
        name: 'Novo Assistente',
        systemPrompt: '',
        assistantInstructions: '',
        additionalContext: ''
    });

    // Then reload list from source of truth or append locally
    // Appending locally for speed
    state.assistants.push(newAssistant);

    renderAssistantList();
    selectAssistant(newId);
}
