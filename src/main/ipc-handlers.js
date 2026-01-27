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

    // Attach listeners
    if (speechService) {
        speechService.on('cuda-fallback', (data) => {
            console.warn('CUDA Fallback Triggered:', data);
            broadcastToWindows('llm:cuda-fallback', data);
        });
    }
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

    // LLM Process Ask - Event-based streaming (no async iterator)
    ipcMain.handle('llm:process-ask', async (event, { text, historyOverride }) => {
        return new Promise(async (resolve, reject) => {
            try {
                const provider = settingsManager.get('llmProvider');
                const model = provider === 'local'
                    ? settingsManager.get('localModel')
                    : settingsManager.get('llmModel');

                llmConnector.configure({
                    provider,
                    model,
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

                let fullResponse = '';

                // Event-based streaming - listen for chunks
                const onChunk = (chunk) => {
                    if (chunk) {
                        fullResponse += chunk;
                        broadcastToWindows('llm:response-chunk', chunk);
                    }
                };

                const onComplete = (response) => {
                    broadcastToWindows('llm:response-end');

                    if (fullResponse.length > 5) {
                        contextManager.recordTurn(queryText, fullResponse);
                        appState.transcriptBuffer = '';
                        appState.tokenCount = 0;
                        broadcastState();
                    }

                    // Cleanup listeners
                    llmConnector.off('chunk', onChunk);
                    llmConnector.off('complete', onComplete);
                    llmConnector.off('error', onError);

                    resolve(fullResponse);
                };

                const onError = (err) => {
                    llmConnector.off('chunk', onChunk);
                    llmConnector.off('complete', onComplete);
                    llmConnector.off('error', onError);

                    broadcastToWindows('llm:error', err.message);
                    reject(err);
                };

                llmConnector.on('chunk', onChunk);
                llmConnector.on('complete', onComplete);
                llmConnector.on('error', onError);

                // Start generation (non-blocking for streaming)
                try {
                    const result = await llmConnector.generate(queryText, systemPrompt);
                    // For providers that return directly (non-streaming)
                    if (typeof result === 'string' && !fullResponse) {
                        fullResponse = result;
                        broadcastToWindows('llm:response-chunk', result);
                        broadcastToWindows('llm:response-end');

                        if (fullResponse.length > 5) {
                            contextManager.recordTurn(queryText, fullResponse);
                            appState.transcriptBuffer = '';
                            appState.tokenCount = 0;
                            broadcastState();
                        }

                        llmConnector.off('chunk', onChunk);
                        llmConnector.off('complete', onComplete);
                        llmConnector.off('error', onError);

                        resolve(fullResponse);
                    }
                } catch (genError) {
                    onError(genError);
                }

            } catch (error) {
                console.error('LLM Process failed:', error);
                broadcastToWindows('llm:error', error.message);
                reject(error);
            }
        });
    });

    // Stop LLM Generation
    ipcMain.handle('llm:stop-generation', async () => {
        console.log('[IPC] Stopping generation...');
        llmConnector.abort();
        return { success: true };
    });

    // Model & Offline Engine Controls
    const modelManager = require('../services/model-manager');
    const huggingFace = require('../services/huggingface');

    // Model Manager Events -> Broadcast to UI
    modelManager.on('progress', (data) => broadcastToWindows('model:progress', data));
    modelManager.on('updated', (models) => broadcastToWindows('model:updated', models));

    // List Local Models
    ipcMain.handle('model:list', () => modelManager.list());

    // Delete Local Model
    ipcMain.handle('model:delete', async (event, filename) => {
        modelManager.delete(filename);
        return { success: true };
    });

    // Download Model
    ipcMain.handle('model:download', async (event, { url, filename, metadata }) => {
        try {
            await modelManager.download(url, filename, metadata);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('model:cancel', (event, filename) => {
        return modelManager.cancel(filename);
    });

    // Hugging Face Integration
    ipcMain.handle('hf:search', async (event, query) => {
        return await huggingFace.search(query);
    });

    ipcMain.handle('hf:files', async (event, repoId) => {
        return await huggingFace.getFiles(repoId);
    });

    ipcMain.handle('hf:getRecommended', async () => {
        return await huggingFace.getRecommended();
    });

    ipcMain.handle('hf:getBestFile', async (event, repoId) => {
        return await huggingFace.getBestFile(repoId);
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
