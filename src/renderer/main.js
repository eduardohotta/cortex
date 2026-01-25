/**
 * Premium Dashboard Renderer - Entry Point
 * 
 * Modular architecture with separate files for:
 * - state.js: Centralized state and DOM elements
 * - assistants.js: Assistant management
 * - api-keys.js: API key management
 * - settings.js: Settings persistence
 */

import { state, elements, initElements } from './state.js';
import { loadAssistants, createNewAssistant } from './assistants.js';
import { addApiKey, renderApiKeys, updateModelOptions } from './api-keys.js';
import { loadSettings, applySettingsToUI, saveAllSettings, captureHotkey, switchTab } from './settings.js';

/**
 * Initialize the application
 */
async function init() {
    initElements();
    setupEventListeners();
    await loadInitialData();
}

/**
 * Load all initial data
 */
async function loadInitialData() {
    await loadSettings();
    await loadAssistants();
    applySettingsToUI();
    renderApiKeys();
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
    if (!window.electronAPI) return;

    // Global State Sync
    window.electronAPI.app.onStateUpdate((newState) => {
        state.isListening = newState.isListening;
    });

    // Window Controls
    elements.btnWinMin.onclick = () => window.electronAPI.app.minimize();
    elements.btnWinMax.onclick = () => window.electronAPI.app.toggleMaximize();
    elements.btnWinClose.onclick = () => window.electronAPI.app.close();

    // Sidebar Toggle
    elements.btnToggleSidebar.onclick = () => elements.sidebar.classList.toggle('retracted');

    // Tab Switching
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Settings Button
    if (elements.btnSettings) {
        elements.btnSettings.addEventListener('click', () => {
            console.log('[Main] Opening global settings');
            elements.settingsModal.classList.remove('hidden');
        });
    }

    // Close Settings
    if (elements.btnCloseSettings) {
        elements.btnCloseSettings.addEventListener('click', () => {
            elements.settingsModal.classList.add('hidden');
        });
    }

    // Save Global Settings
    if (elements.btnSaveGlobal) {
        elements.btnSaveGlobal.addEventListener('click', async () => {
            await saveAllSettings();
            elements.settingsModal.classList.add('hidden');
        });
    }

    // Add New Assistant
    if (elements.btnAddAssistant) {
        elements.btnAddAssistant.addEventListener('click', () => createNewAssistant());
    }

    // LLM Provider UI Logic
    elements.llmProvider.addEventListener('change', () => {
        state.settings.llmProvider = elements.llmProvider.value;
        updateModelOptions();
        renderApiKeys();
    });

    // API Keys Management
    elements.btnAddKey.addEventListener('click', addApiKey);

    // Settings Persistence
    elements.btnSaveChanges.addEventListener('click', saveAllSettings);
    elements.btnPanic.addEventListener('click', () => window.electronAPI.app.panic());

    // Hotkey Capture
    [elements.hotkeyRecord, elements.hotkeyAsk].forEach(input => {
        input.addEventListener('click', () => captureHotkey(input));
    });
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
