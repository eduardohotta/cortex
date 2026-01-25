/**
 * Shortcuts and Action Handler Module
 */
const { globalShortcut } = require('electron');
const { appState, broadcastState } = require('./app-state');
const { getMainWindow, getOverlayWindow } = require('./windows');

// Services (injected)
let audioService = null;
let speechService = null;
let settingsManager = null;

/**
 * Inject service dependencies
 */
function injectServices(services) {
    audioService = services.audioService;
    speechService = services.speechService;
    settingsManager = services.settingsManager;
}

/**
 * Register global keyboard shortcuts
 */
function registerShortcuts() {
    globalShortcut.unregisterAll();

    // Use CommandOrControl (CmdOrCtrl) for Mac/Windows abstraction
    const recordHotkey = settingsManager.get('hotkeyRecord') || 'CmdOrCtrl+D';
    const askHotkey = settingsManager.get('hotkeyAsk') || 'CmdOrCtrl+Enter';
    const stealthHotkey = settingsManager.get('hotkeyStealth') || 'CmdOrCtrl+Shift+H';

    const register = (key, action) => {
        try {
            const isRegistered = globalShortcut.register(key, action);
            if (!isRegistered) console.error(`Failed to register hotkey: ${key} (already in use)`);
        } catch (e) {
            console.error(`Hotkey registration error [${key}]:`, e);
        }
    };

    register(recordHotkey, () => handleAppAction('toggle-record'));
    register(askHotkey, () => handleAppAction('ask'));
    register(stealthHotkey, () => {
        const { windows, toggleStealthMode } = require('./windows');
        toggleStealthMode();
    });

    // Escape to hide all floating widgets
    register('Escape', () => {
        const { windows } = require('./windows');
        Object.entries(windows).forEach(([name, win]) => {
            if (name !== 'main' && win && !win.isDestroyed()) {
                win.hide();
            }
        });
    });
}

/**
 * Centralized Action Handler
 */
async function handleAppAction(action, data) {
    console.log(`[Main] Executing action: ${action}`);
    const overlayWindow = getOverlayWindow();
    const mainWindow = getMainWindow();

    if (action === 'toggle-record') {
        if (appState.isListening) {
            console.log('[Main] Stopping recording...');
            await audioService.stopCapture();
            await speechService.stop();
            appState.isListening = false;
        } else {
            console.log('[Main] Starting recording...');
            try {
                // Use audioOutput (Loopback) as the primary source for the AI to hear the interviewer
                const deviceId = settingsManager.get('audioOutput') || 'default';
                const sttProvider = settingsManager.get('sttProvider') || 'groq';
                const apiKeys = settingsManager.get('apiKeys', sttProvider) || [];

                speechService.setProvider(sttProvider);
                speechService.configure({
                    apiKey: apiKeys.length > 0 ? apiKeys[0] : '',
                    language: settingsManager.get('language') || 'auto',
                    model: settingsManager.get('whisperModel')
                });

                await speechService.start();
                await audioService.startCapture(deviceId);
                appState.isListening = true;

                // Show all floating tools when recording starts
                const { windows } = require('./windows');
                Object.values(windows).forEach(win => {
                    if (win && !win.isDestroyed()) win.show();
                });

            } catch (error) {
                console.error('[Main] Failed to start recording:', error);
                appState.isListening = false;
            }
        }
        broadcastState();
    } else if (action === 'clear-transcript') {
        appState.transcriptBuffer = '';
        appState.tokenCount = 0;
        broadcastState();
    } else if (action === 'stop-all') {
        const { app } = require('electron');
        console.log('[Main] Stopping all services and quitting...');

        try {
            if (audioService) audioService.stopCapture();
            if (speechService) speechService.stop();
        } catch (e) {
            console.error('Error stopping services during exit:', e);
        }

        app.quit();
        // Force exit after a short delay to ensure clean shutdown
        setTimeout(() => process.exit(0), 500);
    } else if (action === 'ask') {
        const { broadcastToWindows } = require('./windows');
        broadcastToWindows('hotkey:ask');
    }
}

module.exports = {
    injectServices,
    registerShortcuts,
    handleAppAction
};
