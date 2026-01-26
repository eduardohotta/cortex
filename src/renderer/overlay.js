/**
 * Premium Overlay Renderer
 */

const elements = {
    overlay: document.getElementById('overlay'),
    waveform: document.getElementById('v-bars'),
    transcriptText: document.getElementById('transcript-text'),
    responseBox: document.getElementById('response-box'),
    responseText: document.getElementById('response-text'),
    btnCopy: document.getElementById('btn-copy'),
    btnCancel: document.getElementById('btn-cancel'),
    tagLang: document.getElementById('tag-lang'),
    dragHandle: document.getElementById('drag-handle'),

    // Control Bar
    btnRecord: document.getElementById('btn-record'),
    btnAsk: document.getElementById('btn-ask'),
    tokenCounter: document.getElementById('token-counter'),

    // Menu System
    btnMainMenu: document.getElementById('btn-main-menu'),
    barMenu: document.getElementById('bar-menu'),

    // Assistant Selector
    assistantSelector: document.getElementById('assistant-selector'),
    currentAssistantName: document.getElementById('current-assistant-name'),
    assistantDropdown: document.getElementById('assistant-dropdown'),

    // Views
    viewToggles: document.querySelectorAll('.view-btn'),
    viewSections: document.querySelectorAll('.view-section'),
    viewTranscript: document.getElementById('view-transcript'),
    viewResponse: document.getElementById('view-response')
};

let currentResponse = '';
let assistants = [];

function init() {
    setupEventListeners();
    loadAssistants();
}

async function loadAssistants() {
    // Load saved assistants from settings
    try {
        const profiles = await window.electronAPI.settings.getProfiles();
        assistants = profiles || [
            { id: 'general', name: 'General Assistant', icon: '🎯' }
        ];
        renderAssistantDropdown();
    } catch (e) {
        console.log('Using default assistants');
        assistants = [{ id: 'general', name: 'General Assistant', icon: '🎯' }];
        renderAssistantDropdown();
    }
}

function renderAssistantDropdown() {
    elements.assistantDropdown.innerHTML = assistants.map(a => `
        <button class="dropdown-item" data-id="${a.id}">
            <span class="icon">${a.icon || '🤖'}</span>
            <span class="name">${a.name}</span>
        </button>
    `).join('');

    // Add click handlers
    elements.assistantDropdown.querySelectorAll('.dropdown-item').forEach(btn => {
        btn.addEventListener('click', () => selectAssistant(btn.dataset.id));
    });
}

function selectAssistant(id) {
    const assistant = assistants.find(a => a.id === id);
    if (assistant) {
        elements.currentAssistantName.textContent = assistant.name;
        elements.assistantDropdown.classList.add('hidden');

        // Load this assistant's profile
        window.electronAPI.settings.loadProfile(id);
        console.log('[Overlay] Selected assistant:', id);
    }
}

function setupEventListeners() {
    if (!window.electronAPI) return;

    // Global State Sync
    window.electronAPI.app.onStateUpdate((state) => {
        updateUIState(state);
    });

    // Record/Ask Buttons
    elements.btnRecord.addEventListener('click', () => {
        window.electronAPI.app.sendAction({ action: 'toggle-record' });
    });

    elements.btnAsk.addEventListener('click', () => {
        triggerAsk();
    });

    // Audio visualization
    window.electronAPI.audio.onVolume((volume) => {
        updateWaveform(volume);
    });

    // Transcription
    window.electronAPI.transcription.onTranscript((data) => {
        updateTranscript(data.text, data.isFinal);
        if (data.isFinal || data.text.length > 5) {
            switchView('transcript');
        }
    });

    // LLM Events
    window.electronAPI.llm.onResponseStart(() => {
        switchView('response');
        elements.responseText.innerHTML = '<em>IA pensando...</em>';
        currentResponse = '';
    });

    window.electronAPI.llm.onResponseChunk((chunk) => {
        appendResponse(chunk);
    });

    window.electronAPI.llm.onError((msg) => {
        elements.responseText.innerHTML = `<span style="color: var(--accent-red)">⚠️ ${msg}</span>`;
    });

    // Shortcut listeners
    window.electronAPI.app.onHotkeyAsk(() => triggerAsk());

    // Cancel Button
    elements.btnCopy.addEventListener('click', copyResponse);
    elements.btnCancel.addEventListener('click', () => {
        window.electronAPI.app.sendAction({ action: 'stop-all' });
        elements.responseBox.classList.add('hidden');
        elements.transcriptText.classList.remove('muted');
    });

    // === Menu System ===
    elements.btnMainMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.barMenu.classList.toggle('open');
        elements.assistantDropdown.classList.add('hidden');
    });

    // Menu actions
    elements.barMenu.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleMenuAction(btn.dataset.action));
    });

    // Assistant Selector Toggle
    elements.assistantSelector.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.assistantDropdown.classList.toggle('hidden');
        elements.barMenu.classList.remove('open');
    });

    // Close menus on outside click
    document.addEventListener('click', () => {
        elements.barMenu.classList.remove('open');
        elements.assistantDropdown.classList.add('hidden');
    });

    // View Toggles
    elements.viewToggles.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Profile Updates
    window.electronAPI.app.onProfilesUpdated(() => {
        console.log('[Overlay] Profiles updated, reloading...');
        loadAssistants();
    });
}



function switchView(viewName) {
    elements.viewToggles.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    elements.viewSections.forEach(section => {
        if (section.id === `view-${viewName}`) {
            section.classList.remove('hidden');
            section.classList.add('active');
        } else {
            section.classList.add('hidden');
            section.classList.remove('active');
        }
    });
}

function handleMenuAction(action) {
    console.log('[Overlay] Menu action:', action);
    elements.barMenu.classList.remove('open');

    switch (action) {
        case 'assistants':
            // Show main window focused on assistants
            window.electronAPI.overlay.hide();
            break;
        case 'settings':
            // Show main window focused on settings
            window.electronAPI.overlay.hide();
            break;
        case 'exit':
            window.electronAPI.app.panic();
            break;
        default:
            console.log('Action not implemented:', action);
    }
}

function updateUIState(state) {
    if (state.tokenCount !== undefined) {
        elements.tokenCounter.textContent = `${state.tokenCount} tokens`;
    }

    if (state.isListening !== undefined) {
        elements.btnRecord.classList.toggle('active', state.isListening);
        const span = elements.btnRecord.querySelector('span:not(.key-hint)');
        if (span) span.textContent = state.isListening ? 'Parar' : 'Gravar';
    }
}

async function triggerAsk() {
    if (elements.btnAsk.classList.contains('loading')) return;

    elements.btnAsk.classList.add('loading');
    try {
        elements.responseBox.classList.remove('hidden');
        elements.responseText.innerHTML = '<em>Iniciando consulta...</em>';
        currentResponse = '';

        await window.electronAPI.llm.processAsk({ text: null });
    } catch (e) {
        console.error('Ask failed:', e);
        elements.responseText.innerHTML = `<span style="color: var(--accent-red)">⚠️ ${e.message}</span>`;
    } finally {
        elements.btnAsk.classList.remove('loading');
    }
}

function updateWaveform(volume) {
    const bars = elements.waveform.querySelectorAll('.v-bar');
    const isActive = volume > 5;

    elements.waveform.parentElement.classList.toggle('animating', isActive);

    bars.forEach((bar, i) => {
        if (isActive) {
            const height = Math.random() * (volume / 2) + 4;
            bar.style.height = `${Math.min(20, height)}px`;
        } else {
            bar.style.height = '4px';
        }
    });
}

// === Stability Enhancements ===
let transcriptHistory = [];
let silenceDebounceTimer = null;
let lastTranscriptText = '';
let isUserScrollingTranscript = false;
let responseUpdateTimer = null;

// Track scroll position for smart auto-scroll
function setupSmartScroll(container) {
    if (!container) return;
    container.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        isUserScrollingTranscript = !isAtBottom;
    });
}

// Initialize scroll tracking
document.addEventListener('DOMContentLoaded', () => {
    const transcriptContainer = elements.transcriptText?.parentElement;
    if (transcriptContainer) setupSmartScroll(transcriptContainer);
});

function updateTranscript(text, isFinal) {
    // RULE: Never update UI with empty string
    if (!text || !text.trim()) {
        // Start silence debounce - don't clear, just ignore
        if (!silenceDebounceTimer) {
            silenceDebounceTimer = setTimeout(() => {
                silenceDebounceTimer = null;
                // Optionally update UI to show "silence" state without clearing text
            }, 300);
        }
        return;
    }

    // Clear silence debounce if we have real content
    if (silenceDebounceTimer) {
        clearTimeout(silenceDebounceTimer);
        silenceDebounceTimer = null;
    }

    // RULE: Only update if text changed (prevent flicker)
    if (text === lastTranscriptText && !isFinal) {
        return;
    }
    lastTranscriptText = text;

    // If we have history, we display it first
    const historyHtml = transcriptHistory.map(t => `<p class="history-block">${t}</p>`).join('');

    // Current interim or final chunk
    const currentHtml = `<p class="current-block ${isFinal ? 'final' : 'interim'}">${text}</p>`;

    elements.transcriptText.innerHTML = historyHtml + currentHtml;

    // Smart auto-scroll - only if user is at bottom
    const container = elements.transcriptText.parentElement;
    if (!isUserScrollingTranscript) {
        container.scrollTop = container.scrollHeight;
    }

    if (isFinal) {
        // RULE: Always concatenate - append to history
        transcriptHistory.push(text);
        lastTranscriptText = '';
    }
}

function appendResponse(chunk) {
    // RULE: Never update with empty chunk
    if (!chunk) return;

    // RULE: Always concatenate (append-only)
    currentResponse += chunk;

    // Clear placeholder text only once
    if (elements.responseText.innerHTML === '<em>IA pensando...</em>' ||
        elements.responseText.innerHTML === '<em>Iniciando consulta...</em>') {
        elements.responseText.innerHTML = '';
    }

    // Debounced display update for smooth rendering
    if (responseUpdateTimer) return;

    responseUpdateTimer = setTimeout(() => {
        // Basic Markdown
        let html = currentResponse
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:3px;">$1</code>')
            .replace(/\n/g, '<br>');

        elements.responseText.innerHTML = html;
        elements.overlay.scrollTop = elements.overlay.scrollHeight;

        responseUpdateTimer = null;
    }, 16); // ~60fps
}

async function copyResponse() {
    if (!currentResponse) return;
    try {
        await navigator.clipboard.writeText(currentResponse);
        const originalText = elements.btnCopy.textContent;
        elements.btnCopy.textContent = '✓';
        setTimeout(() => elements.btnCopy.textContent = originalText, 1500);
    } catch (e) {
        console.error('Copy failed:', e);
    }
}

document.addEventListener('DOMContentLoaded', init);
