/**
 * Renderer State Module
 * Centralized state for the dashboard
 */

export const state = {
    isListening: false,
    activeTab: 'system',
    currentAssistantId: null,
    assistants: [],
    keysByProvider: { openai: [], groq: [], google: [], anthropic: [] },
    settings: {
        llmProvider: 'openai',
        llmModel: 'gpt-4o',
        hotkeyRecord: 'Alt+R',
        hotkeyAsk: 'Alt+A',
        sttProvider: 'groq',
        systemPrompt: ''
    }
};

/**
 * DOM Elements Cache
 */
export const elements = {
    // Sidebar
    assistantList: null,
    btnToggleSidebar: null,
    sidebar: null,

    // Header & Tabs
    tabBtns: null,
    tabContents: null,

    // System/Assistant Tab
    systemPrompt: null,
    assistantInstructions: null,
    additionalContext: null,
    llmProvider: null,
    llmModel: null,
    apiKeyInput: null,
    apiKeysList: null,
    btnAddKey: null,
    keyCountBadge: null,

    // Audio Tab
    audioSource: null,
    language: null,
    sttProvider: null,

    // Hotkeys Tab
    hotkeyRecord: null,
    hotkeyAsk: null,

    // Global Actions
    btnSaveChanges: null,
    btnPanic: null,
    btnSettings: null,
    btnAddAssistant: null,
    btnSettings: null,
    btnAddAssistant: null,
    assistantNameInput: null,

    // Settings Modal
    settingsModal: null,
    btnCloseSettings: null,
    btnSaveGlobal: null,

    // Window Controls
    btnWinMin: null,
    btnWinMax: null,
    btnWinClose: null
};

/**
 * Initialize DOM element references
 */
export function initElements() {
    elements.assistantList = document.getElementById('assistant-list');
    elements.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    elements.sidebar = document.getElementById('app-sidebar');

    elements.tabBtns = document.querySelectorAll('.tab-btn');
    elements.tabContents = document.querySelectorAll('.tab-content');

    elements.systemPrompt = document.getElementById('system-prompt');
    elements.assistantInstructions = document.getElementById('assistant-instructions');
    elements.additionalContext = document.getElementById('additional-context');
    elements.llmProvider = document.getElementById('llm-provider');
    elements.llmModel = document.getElementById('llm-model');
    elements.apiKeyInput = document.getElementById('api-key-input');
    elements.apiKeysList = document.getElementById('api-keys-list');
    elements.btnAddKey = document.getElementById('btn-add-key');
    elements.keyCountBadge = document.getElementById('key-count');

    elements.audioSource = document.getElementById('audio-source');
    elements.language = document.getElementById('language');
    elements.sttProvider = document.getElementById('stt-provider');

    elements.hotkeyRecord = document.getElementById('hotkey-record');
    elements.hotkeyAsk = document.getElementById('hotkey-ask');

    elements.btnSaveChanges = document.getElementById('btn-save-changes');
    elements.btnPanic = document.getElementById('btn-panic');
    elements.btnSettings = document.getElementById('btn-settings');
    elements.btnAddAssistant = document.getElementById('btn-add-assistant');
    elements.btnSettings = document.getElementById('btn-settings');
    elements.btnAddAssistant = document.getElementById('btn-add-assistant');
    elements.assistantNameInput = document.getElementById('assistant-name-input');

    elements.settingsModal = document.getElementById('settings-modal');
    elements.btnCloseSettings = document.getElementById('btn-close-settings');
    elements.btnSaveGlobal = document.getElementById('btn-save-global');

    elements.btnWinMin = document.getElementById('btn-win-min');
    elements.btnWinMax = document.getElementById('btn-win-max');
    elements.btnWinClose = document.getElementById('btn-win-close');
}
