/**
 * IPC Handlers Module
 */
const { ipcMain, app, BrowserWindow } = require('electron');
const { appState, broadcastState } = require('./app-state');
const { getMainWindow, getOverlayWindow, toggleStealthMode, broadcastToWindows } = require('./windows');
const { handleAppAction } = require('./shortcuts');

// Services (injected)
let audioService = null;
let settingsManager = null;
let llmConnector = null;
let contextManager = null;
let speechService = null; // Explicitly declared

/**
 * Inject service dependencies
 */
function injectServices(services) {
    audioService = services.audioService;
    settingsManager = services.settingsManager;
    llmConnector = services.llmConnector;
    contextManager = services.contextManager;
    speechService = services.speechService;
}

/**
 * Register all IPC handlers
 */
function registerIPCHandlers() {
    // App Actions
    ipcMain.on('app:action', (event, payload) => {
        handleAppAction(payload.action, payload.data);
    });

    // Overlay Controls
    ipcMain.handle('overlay:show', () => {
        const overlayWindow = getOverlayWindow();
        const mainWindow = getMainWindow();
        if (overlayWindow) {
            overlayWindow.show();
            if (mainWindow) mainWindow.webContents.send('overlay:state-changed', true);
        }
    });

    ipcMain.handle('overlay:hide', () => {
        const overlayWindow = getOverlayWindow();
        const mainWindow = getMainWindow();
        if (overlayWindow) {
            overlayWindow.hide();
            if (mainWindow) mainWindow.webContents.send('overlay:state-changed', false);
        }
    });

    ipcMain.handle('overlay:toggleStealth', () => {
        return toggleStealthMode();
    });

    ipcMain.on('overlay:set-ignore-mouse', (event, ignore) => {
        const overlayWindow = getOverlayWindow();
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
        }
    });

    // Audio Controls
    ipcMain.handle('audio:getDevices', async () => {
        if (!audioService) return [];
        return await audioService.getDevices();
    });

    ipcMain.handle('audio:startCapture', async (event, deviceId) => {
        if (!audioService) return false;
        await audioService.startCapture(deviceId);
        appState.isListening = true;
        broadcastState();
        return true;
    });

    ipcMain.handle('audio:stopCapture', async () => {
        if (!audioService) return false;
        await audioService.stopCapture();
        appState.isListening = false;
        broadcastState();
        return true;
    });

    // LLM Process Ask
    ipcMain.handle('llm:process-ask', async (event, { text, historyOverride }) => {
        try {
            const overlayWindow = getOverlayWindow();
            const provider = settingsManager.get('llmProvider');

            llmConnector.configure({
                provider,
                model: settingsManager.get('llmModel'),
                apiKeys: settingsManager.get('apiKeys', provider),
                temperature: settingsManager.get('temperature'),
                maxTokens: settingsManager.get('maxTokens')
            });

            // Load current profile for behavior settings
            const currentProfileId = settingsManager.get('currentAssistantId') || 'default';
            const profile = settingsManager.loadProfile(currentProfileId) || {};

            // Build base system prompt from profile text fields
            let systemPrompt = [
                profile.systemPrompt || settingsManager.get('systemPrompt'),
                profile.assistantInstructions || settingsManager.get('assistantInstructions'),
                profile.additionalContext || settingsManager.get('additionalContext')
            ].filter(p => p).join('\n\n');

            // Append behavior directives from profile configuration
            systemPrompt += settingsManager.buildBehaviorPrompt(profile);

            const history = historyOverride || contextManager.getRecentHistory(3);
            const queryText = text || appState.transcriptBuffer;

            if (!queryText || queryText.trim().length === 0) {
                throw new Error("Sem texto para perguntar.");
            }

            if (history && history.length > 0) {
                const historyText = history.map(h => `Human: ${h.question}\nAI: ${h.answer}`).join('\n\n');
                systemPrompt += `\n\n## Contexto anterior:\n${historyText}\n\n## Pergunta Atual:\n`;
            }

            broadcastToWindows('llm:response-start');

            const responseStream = await llmConnector.generate(queryText, systemPrompt);
            let fullResponse = '';

            for await (const chunk of responseStream) {
                fullResponse += chunk;
                broadcastToWindows('llm:response-chunk', chunk);
            }

            broadcastToWindows('llm:response-end');

            if (fullResponse.length > 5) {
                contextManager.recordTurn(queryText, fullResponse);
                appState.transcriptBuffer = '';
                appState.tokenCount = 0;
                broadcastState();
            }

            return fullResponse;
        } catch (error) {
            console.error('LLM Process failed:', error);
            broadcastToWindows('llm:error', error.message);
            throw error;
        }
    });

    // Settings Controls
    ipcMain.handle('settings:get', (event, key, provider) => settingsManager.get(key, provider));
    ipcMain.handle('settings:set', (event, key, value, provider) => {
        settingsManager.set(key, value, provider);
        // Relay change to all windows (for sync)
        broadcastToWindows('settings:changed', { key, value, provider });
        return { success: true };
    });
    ipcMain.handle('settings:getAll', (event, provider) => settingsManager.getAll(provider));
    ipcMain.handle('settings:saveProfile', (event, name, config) => {
        settingsManager.saveProfile(name, config);
        // Broadcast update
        broadcastProfilesUpdate();
        return { success: true };
    });
    ipcMain.handle('settings:loadProfile', (event, name) => settingsManager.loadProfile(name));
    ipcMain.handle('settings:getProfiles', () => settingsManager.getProfiles());
    ipcMain.handle('settings:deleteProfile', (event, name) => {
        settingsManager.deleteProfile(name);
        // Broadcast update
        broadcastProfilesUpdate();
        return { success: true };
    });
    ipcMain.handle('settings:refreshShortcuts', () => {
        const { registerShortcuts } = require('./shortcuts');
        registerShortcuts();
        return { success: true };
    });

    // App Controls
    ipcMain.handle('app:panic', () => {
        console.log('[IPC] Panic triggered');
        // Stop services immediately
        try {
            if (audioService) audioService.stopCapture();
            if (speechService) speechService.stop();
        } catch (e) {
            console.error('Error stopping services on panic:', e);
        }

        const overlayWindow = getOverlayWindow();
        const mainWindow = getMainWindow();

        if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();

        app.quit();
        // Force exit if still hanging
        setTimeout(() => process.exit(0), 500);
    });

    ipcMain.handle('window:minimize', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.handle('window:close', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.close();
    });

    ipcMain.handle('window:toggle-maximize', () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            if (mainWindow.isMaximized()) mainWindow.unmaximize();
            else mainWindow.maximize();
        }
    });

    ipcMain.on('window:move', (event, { x, y }) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            const [currentX, currentY] = win.getPosition();
            win.setPosition(currentX + x, currentY + y);
        }
    });

    ipcMain.handle('app:show-dashboard', () => {
        let mainWindow = getMainWindow();
        if (!mainWindow) {
            const { createMainWindow } = require('./windows');
            mainWindow = createMainWindow();
        }
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    });
}

function broadcastProfilesUpdate() {
    broadcastToWindows('profiles:updated');
}

module.exports = {
    injectServices,
    registerIPCHandlers
};
