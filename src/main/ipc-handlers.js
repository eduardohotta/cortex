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
let speechService = null;

let isGenerating = false; // FIX: generation lock

/**
 * Inject service dependencies
 */
function injectServices(services) {
    audioService = services.audioService;
    settingsManager = services.settingsManager;
    llmConnector = services.llmConnector;
    contextManager = services.contextManager;
    speechService = services.speechService;

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

    /* ===========================
       APP ACTIONS
    ============================ */
    ipcMain.on('app:action', (event, payload) => {
        handleAppAction(payload.action, payload.data);
    });

    /* ===========================
       OVERLAY CONTROLS
    ============================ */
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

    ipcMain.handle('overlay:toggleStealth', () => toggleStealthMode());

    ipcMain.on('overlay:set-ignore-mouse', (event, ignore) => {
        const overlayWindow = getOverlayWindow();
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
        }
    });

    /* ===========================
       AUDIO
    ============================ */
    ipcMain.handle('audio:getDevices', async () => {
        return audioService ? audioService.getDevices() : [];
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

    /* ===========================
       LLM – STREAMING ASK
    ============================ */
    ipcMain.handle('llm:process-ask', async (event, { text, historyOverride }) => {

        // FIX: lock before anything async
        if (isGenerating) {
            console.warn('[LLM] Generation already in progress');
            return '';
        }
        isGenerating = true;

        return new Promise(async (resolve, reject) => {

            let fullResponse = '';
            let queryText = '';

            const cleanup = () => { // FIX: centralized cleanup
                llmConnector.off('chunk', onChunk);
                llmConnector.off('complete', onComplete);
                llmConnector.off('error', onError);
                isGenerating = false;
            };

            const onChunk = (chunk) => {
                if (!chunk) return;
                fullResponse += chunk;
                broadcastToWindows('llm:response-chunk', chunk);
            };

            const onComplete = () => {
                broadcastToWindows('llm:response-end');

                if (fullResponse.length > 5) {
                    contextManager.recordTurn(queryText, fullResponse);
                    appState.transcriptBuffer = '';
                    appState.tokenCount = 0;
                    broadcastState();
                }

                cleanup();
                resolve(fullResponse);
            };

            const onError = (err) => {
                console.error('[LLM] Error:', err);
                broadcastToWindows('llm:error', err.message);
                cleanup();
                reject(err);
            };

            try {
                const provider = settingsManager.get('llmProvider');
                const model = provider === 'local'
                    ? settingsManager.get('localModel')
                    : settingsManager.get('llmModel');

                llmConnector.configure({
                    provider,
                    model,
                    apiKeys: settingsManager.get('apiKeys', provider),
                    temperature: settingsManager.get('temperature') ?? 0.3,
                    topP: settingsManager.get('topP') ?? 0.9,
                    maxTokens: settingsManager.get('maxTokens') ?? 512,

                    // Local LLM
                    topK: settingsManager.get('localTopK') ?? 40,
                    repeatPenalty: settingsManager.get('localRepetitionPenalty') ?? 1.15,
                    threads: settingsManager.get('localThreads') ?? 4,
                    gpuLayers: settingsManager.get('localGpuLayers') ?? 0,
                    batchSize: settingsManager.get('localBatchSize') ?? 512
                });

                const currentProfileId = settingsManager.get('currentAssistantId') || 'default';
                const profile = settingsManager.loadProfile(currentProfileId) || {};

                let systemPrompt = [
                    profile.systemPrompt || settingsManager.get('systemPrompt'),
                    profile.assistantInstructions || settingsManager.get('assistantInstructions'),
                    profile.additionalContext || settingsManager.get('additionalContext')
                ].filter(Boolean).join('\n\n');

                systemPrompt += settingsManager.buildBehaviorPrompt(profile);

                const history = historyOverride || contextManager.getRecentHistory(3);
                queryText = text || appState.transcriptBuffer;

                if (!queryText || !queryText.trim()) {
                    cleanup();
                    return reject(new Error('Sem texto para perguntar.'));
                }

                if (history?.length) {
                    const historyText = history
                        .map(h => `Human: ${h.question}\nAI: ${h.answer}`)
                        .join('\n\n');
                    systemPrompt += `\n\n## Contexto anterior:\n${historyText}`;
                }

                broadcastToWindows('llm:response-start');

                llmConnector.on('chunk', onChunk);
                llmConnector.on('complete', onComplete);
                llmConnector.on('error', onError);

                const result = await llmConnector.generate(queryText, systemPrompt);

                // Non-streaming providers fallback
                if (typeof result === 'string' && !fullResponse) {
                    fullResponse = result;
                    broadcastToWindows('llm:response-chunk', result);
                    onComplete();
                }

            } catch (err) {
                onError(err);
            }
        });
    });

    /* ===========================
       LLM – DIRECT GENERATE
    ============================ */
    ipcMain.handle('llm:generate', async (event, prompt, systemPromptOverride) => {
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
                    temperature: 0.3,
                    maxTokens: 150
                });

                const sysPrompt =
                    systemPromptOverride ||
                    'Você é um dicionário técnico conciso. Defina o termo solicitado em poucas palavras.';

                let attempts = 0;
                const maxAttempts = 20;

                while (attempts < maxAttempts) {
                    try {
                        const result = await llmConnector.generateDefinition(prompt, sysPrompt);
                        return resolve(result);
                    } catch (err) {
                        if (err.message?.includes('already in progress')) {
                            attempts++;
                            await new Promise(r => setTimeout(r, 500));
                            continue;
                        }
                        return reject(err);
                    }
                }

                reject(new Error('LLM ocupado. Tente novamente.'));

            } catch (error) {
                reject(error);
            }
        });
    });

    /* ===========================
       LLM – STOP
    ============================ */
    ipcMain.handle('llm:stop-generation', async () => {
        console.log('[IPC] Stop generation');
        try {
            llmConnector.abort();
        } catch (e) {
            console.warn('Abort failed:', e);
        }
        isGenerating = false; // FIX
        return { success: true };
    });

    /* ===========================
       MODEL MANAGER / HF
    ============================ */
    const modelManager = require('../services/model-manager');
    const huggingFace = require('../services/huggingface');

    modelManager.on('progress', (data) => broadcastToWindows('model:progress', data));
    modelManager.on('updated', (models) => broadcastToWindows('model:updated', models));

    const localLLM = require('../services/local-llm-service');
    localLLM.on('model:status', (data) => broadcastToWindows('model:status', data));

    ipcMain.handle('model:list', () => modelManager.list());
    ipcMain.handle('model:delete', async (event, filename) => {
        modelManager.delete(filename);
        return { success: true };
    });

    ipcMain.handle('model:download', async (event, { url, filename, metadata }) => {
        try {
            await modelManager.download(url, filename, metadata);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('model:cancel', (event, filename) => modelManager.cancel(filename));

    ipcMain.handle('hf:search', async (event, query) => huggingFace.search(query));
    ipcMain.handle('hf:files', async (event, repoId) => huggingFace.getFiles(repoId));
    ipcMain.handle('hf:getRecommended', async () => huggingFace.getRecommended());
    ipcMain.handle('hf:getBestFile', async (event, repoId) => huggingFace.getBestFile(repoId));

    /* ===========================
       SETTINGS
    ============================ */
    ipcMain.handle('settings:get', (e, key, provider) => settingsManager.get(key, provider));
    ipcMain.handle('settings:set', (e, key, value, provider) => {
        settingsManager.set(key, value, provider);
        broadcastToWindows('settings:changed', { key, value, provider });
        return { success: true };
    });
    ipcMain.handle('settings:getAll', (e, provider) => settingsManager.getAll(provider));
    ipcMain.handle('settings:saveProfile', (e, name, config) => {
        settingsManager.saveProfile(name, config);
        broadcastToWindows('profiles:updated');
        return { success: true };
    });
    ipcMain.handle('settings:loadProfile', (e, name) => settingsManager.loadProfile(name));
    ipcMain.handle('settings:getProfiles', () => settingsManager.getProfiles());
    ipcMain.handle('settings:deleteProfile', (e, name) => {
        settingsManager.deleteProfile(name);
        broadcastToWindows('profiles:updated');
        return { success: true };
    });

    ipcMain.handle('settings:refreshShortcuts', () => {
        const { registerShortcuts } = require('./shortcuts');
        registerShortcuts();
        return { success: true };
    });

    /* ===========================
       APP / WINDOW
    ============================ */
    ipcMain.handle('app:panic', () => {
        console.warn('[APP] PANIC');
        audioService?.stopCapture();
        speechService?.stop();
        contextManager?.clear();

        getOverlayWindow()?.destroy();
        getMainWindow()?.destroy();

        app.quit();
        setTimeout(() => process.exit(0), 500);
    });

    ipcMain.handle('window:minimize', () => getMainWindow()?.minimize());
    ipcMain.handle('window:close', () => getMainWindow()?.close());

    ipcMain.handle('window:toggle-maximize', () => {
        const win = getMainWindow();
        if (!win) return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });

    ipcMain.on('window:move', (e, { x, y }) => {
        const win = BrowserWindow.fromWebContents(e.sender);
        if (!win) return;
        const [cx, cy] = win.getPosition();
        win.setPosition(cx + x, cy + y);
    });

    ipcMain.handle('app:show-dashboard', () => {
        let win = getMainWindow();
        if (!win) {
            const { createMainWindow } = require('./windows');
            win = createMainWindow();
        }
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
    });
}

module.exports = {
    injectServices,
    registerIPCHandlers
};
