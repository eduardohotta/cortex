/**
 * IPC LLM Handlers
 */
const { ipcMain } = require('electron');
const { appState, broadcastState } = require('./app-state');
const { broadcastToWindows } = require('./windows');
const modelManager = require('../services/model-manager');
const huggingFace = require('../services/huggingface');
const localLLM = require('../services/local-llm-service');

let isGenerating = false;
let modelEventsBound = false;

/**
 * Register LLM IPC handlers
 */
function registerLLMHandlers(services) {
    const { llmConnector, settingsManager, contextManager } = services;

    if (!llmConnector || !settingsManager || !contextManager) {
        throw new Error('[IPC-LLM] Missing required services');
    }

    // 🔒 Bind model and universal LLM events only once
    if (!modelEventsBound) {
        modelManager.on('progress', (d) => broadcastToWindows('model:progress', d));
        modelManager.on('updated', (m) => broadcastToWindows('model:updated', m));
        localLLM.on('model:status', (d) => broadcastToWindows('model:status', d));

        // Centralized chunk bridge: any chunk from connector goes to UI
        llmConnector.on('chunk', (chunk) => {
            if (chunk) broadcastToWindows('llm:response-chunk', chunk);
        });

        modelEventsBound = true;
    }

    /* ===========================
       LLM – STREAMING ASK
    ============================ */
    ipcMain.handle('llm:process-ask', async (_, { text, historyOverride }) => {
        if (isGenerating) return '';

        isGenerating = true;

        return new Promise(async (resolve, reject) => {
            let fullResponse = '';
            let queryText = '';

            const cleanup = () => {
                llmConnector.off('complete', onComplete);
                llmConnector.off('error', onError);
                llmConnector.off('aborted', onAbort);
                isGenerating = false;
            };

            const onAbort = () => {
                console.log('[IPC-LLM] Generation aborted event received');
                broadcastToWindows('llm:response-end');
                cleanup();
                resolve(null);
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
                    topK: settingsManager.get('localTopK') ?? 40,
                    repeatPenalty: settingsManager.get('localRepetitionPenalty') ?? 1.15,
                    threads: settingsManager.get('localThreads') ?? 4,
                    gpuLayers: settingsManager.get('localGpuLayers') ?? 0,
                    batchSize: settingsManager.get('localBatchSize') ?? 512
                });

                const profile = settingsManager.loadProfile(
                    settingsManager.get('currentAssistantId') || 'default'
                ) || {};

                let systemPrompt = [
                    profile.systemPrompt,
                    profile.assistantInstructions,
                    profile.additionalContext
                ].filter(Boolean).join('\n\n');

                systemPrompt += settingsManager.buildBehaviorPrompt(profile);

                const history = historyOverride || contextManager.getRecentHistory(3);
                queryText = text || appState.transcriptBuffer;

                if (!queryText?.trim()) {
                    cleanup();
                    return reject(new Error('Sem texto para perguntar.'));
                }

                if (history?.length) {
                    systemPrompt += '\n\n## Contexto anterior:\n' +
                        history.map(h => `Human: ${h.question}\nAI: ${h.answer}`).join('\n\n');
                }

                broadcastToWindows('llm:response-start');

                // Internal tracker for history recording
                const localTracker = (c) => fullResponse += c;
                llmConnector.on('chunk', localTracker);

                llmConnector.once('complete', () => llmConnector.off('chunk', localTracker));
                llmConnector.on('complete', onComplete);
                llmConnector.on('error', onError);
                llmConnector.on('aborted', onAbort);

                const result = await llmConnector.generate(queryText, systemPrompt);

                if (typeof result === 'string' && !fullResponse) {
                    fullResponse = result;
                    onComplete();
                }

            } catch (e) {
                onError(e);
            }
        });
    });

    /* ===========================
       LLM – STOP
    ============================ */
    ipcMain.handle('llm:stop-generation', async () => {
        console.log('[IPC-LLM] Manual stop requested');
        try {
            llmConnector.abort();
            broadcastToWindows('llm:response-end');
        } catch (e) {
            console.warn('[IPC-LLM] Stop failed:', e);
        }
        isGenerating = false;
        return { success: true };
    });

    /* ===========================
       LLM – QUICK GENERATE
    ============================ */
    ipcMain.handle('llm:generate', async (_, prompt, systemPromptOverride) => {
        // Broadscast response-start for word analysis too if we want streaming indicator
        broadcastToWindows('llm:response-start');

        if (systemPromptOverride) {
            const result = await llmConnector.generateDefinition(prompt, systemPromptOverride);
            broadcastToWindows('llm:response-end');
            return result;
        }

        try {
            const profile = settingsManager.loadProfile(
                settingsManager.get('currentAssistantId') || 'default'
            ) || {};

            let sysPrompt = [
                profile.systemPrompt,
                profile.assistantInstructions,
                profile.additionalContext
            ].filter(Boolean).join('\n\n');

            sysPrompt += settingsManager.buildBehaviorPrompt(profile);

            if (!sysPrompt.trim()) {
                sysPrompt = 'Você é um dicionário técnico conciso.';
            } else {
                sysPrompt += '\n\nResponda agora ao termo solicitado de forma concisa e técnica seguindo as orientações acima.';
            }

            const result = await llmConnector.generateDefinition(prompt, sysPrompt);
            broadcastToWindows('llm:response-end');
            return result;
        } catch (e) {
            console.error('[IPC-LLM] Failed to load profile for generate:', e);
            const result = await llmConnector.generateDefinition(prompt, 'Você é um dicionário técnico conciso.');
            broadcastToWindows('llm:response-end');
            return result;
        }
    });

    /* ===========================
       MODEL / HF
    ============================ */
    ipcMain.handle('model:list', () => modelManager.list());
    ipcMain.handle('model:delete', (_, f) => (modelManager.delete(f), { success: true }));
    ipcMain.handle('model:download', async (_, p) => {
        try {
            await modelManager.download(p.url, p.filename, p.metadata);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('model:cancel', (_, f) => modelManager.cancel(f));

    ipcMain.handle('hf:search', (_, q) => huggingFace.search(q));
    ipcMain.handle('hf:files', (_, r) => huggingFace.getFiles(r));
    ipcMain.handle('hf:getRecommended', () => huggingFace.getRecommended());
    ipcMain.handle('hf:getBestFile', (_, r) => huggingFace.getBestFile(r));
}

module.exports = { registerLLMHandlers };
