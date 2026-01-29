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
    // Cole e use como está (assume que estes já existem no seu contexto):
    // ipcMain, llmConnector, settingsManager, contextManager, appState,
    // broadcastToWindows, broadcastState, isGenerating (global/outer scope)

    ipcMain.handle('llm:process-ask', async (_, { text, historyOverride } = {}) => {
        console.log('[IPC-LLM] Processing ask request. isGenerating:', isGenerating);
        if (isGenerating) {
            console.warn('[IPC-LLM] Already generating, ignoring request');
            return null;
        }
        isGenerating = true;

        let fullResponse = '';
        let queryText = '';

        const localTracker = (chunk) => {
            fullResponse += chunk ?? '';
        };

        // Mantém referências estáveis para remover listeners com segurança
        let onComplete;
        let onError;
        let onAbort;

        const cleanup = () => {
            llmConnector.off('chunk', localTracker);
            if (onComplete) llmConnector.off('complete', onComplete);
            if (onError) llmConnector.off('error', onError);
            if (onAbort) llmConnector.off('aborted', onAbort);
            isGenerating = false;
        };

        try {
            const provider = settingsManager.get('llmProvider');
            const model =
                provider === 'local'
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

            const assistantId = settingsManager.get('currentAssistantId') || 'default';
            const profile = settingsManager.loadProfile(assistantId) || {};

            const mainPrompt = profile.systemPrompt || settingsManager.get('systemPrompt');

            let systemPrompt = [
                mainPrompt,
                profile.assistantInstructions || '',
                profile.additionalContext || ''
            ]
                .filter(Boolean)
                .join('\n\n');

            systemPrompt += settingsManager.buildBehaviorPrompt(profile);

            const history = historyOverride ?? contextManager.getRecentHistory(3);

            queryText = (text ?? appState.transcriptBuffer ?? '').trim();
            if (!queryText) throw new Error('Sem texto para perguntar.');

            if (history?.length) {
                systemPrompt +=
                    '\n\n## Contexto anterior:\n' +
                    history
                        .map((h) => `Human: ${h.question}\nAI: ${h.answer}`)
                        .join('\n\n');
            }

            // DEBUG: Show everything being sent to the AI
            console.log('\n' + '='.repeat(50));
            console.log('🤖 [AI REQUEST INSPECTOR]');
            console.log('='.repeat(50));
            console.log('📍 PROFILE ID:', assistantId);
            console.log(
                '📍 PROFILE TYPE:',
                profile.isBuiltin ? 'SISTEMA (Built-in)' : (profile.savedAt ? 'CUSTOMIZADO' : 'NÃO INSTANCIADO')
            );
            console.log('📍 RESPONSE STYLE:', profile.responseStyle || 'default (short)');
            console.log('📍 INITIATIVE:', profile.initiativeLevel || 'default (minimal)');
            console.log('📍 PROMPT LENGTH:', mainPrompt.length);
            console.log('📍 CONTEXT LENGTH:', (profile.additionalContext || '').length);
            console.log('📍 HISTORY TURNS:', history.length);
            console.log('='.repeat(50));
            console.log('📍 PROFILE DATA:', JSON.stringify(profile, null, 2));
            console.log('📍 PROVIDER:', provider);
            console.log('📍 MODEL:', model);
            console.log('📍 TEMPERATURE:', settingsManager.get('temperature') ?? 0.3);
            console.log('\n--- [SYSTEM PROMPT] ---\n');
            console.log(systemPrompt);
            console.log('\n--- [USER QUERY] ---\n');
            console.log(queryText);
            console.log('='.repeat(50) + '\n');

            broadcastToWindows('llm:response-start');
            try {
                const { windows } = require('./windows');
                if (windows.response && !windows.response.isDestroyed()) {
                    console.log('[IPC-LLM] Auto-showing response window');
                    windows.response.show();
                    windows.response.focus();
                } else {
                    console.warn('[IPC-LLM] Response window not available for auto-show');
                }
            } catch (err) {
                console.error('[IPC-LLM] Failed to show response window:', err);
            }

            // Aguarda finalização por eventos (complete/error/aborted)
            const response = await new Promise((resolve, reject) => {
                let settled = false;
                const settleOnce = (fn) => (value) => {
                    if (settled) return;
                    settled = true;
                    fn(value);
                };

                const safeResolve = settleOnce(resolve);
                const safeReject = settleOnce(reject);

                onAbort = () => {
                    console.log('[IPC-LLM] Generation aborted event received');
                    broadcastToWindows('llm:response-end');
                    safeResolve(null);
                };

                onComplete = () => {
                    broadcastToWindows('llm:response-end');

                    if (fullResponse.length > 5) {
                        contextManager.recordTurn(queryText, fullResponse);
                        appState.transcriptBuffer = '';
                        appState.tokenCount = 0;
                        broadcastState();
                    }

                    safeResolve(fullResponse);
                };

                onError = (err) => {
                    broadcastToWindows('llm:error', err?.message || String(err));
                    safeReject(err);
                };

                llmConnector.on('chunk', localTracker);

                // once evita múltiplos disparos acumulando
                llmConnector.once('aborted', onAbort);
                llmConnector.once('complete', onComplete);
                llmConnector.once('error', onError);

                // Inicia geração
                // Se generate retornar string sem emitir eventos, resolvemos por fallback
                Promise.resolve(llmConnector.generate(queryText, systemPrompt))
                    .then((result) => {
                        if (typeof result === 'string' && !fullResponse) {
                            fullResponse = result;
                            onComplete();
                        }
                    })
                    .catch((e) => onError(e));
            });

            return response;
        } finally {
            cleanup();
        }
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
        broadcastToWindows('llm:response-start');
        try {
            const { windows } = require('./windows');
            if (windows.response && !windows.response.isDestroyed()) {
                console.log('[IPC-LLM] Auto-showing response window (secondary)');
                windows.response.show();
            }
        } catch (err) {
            console.error('[IPC-LLM] Failed to show response window (secondary):', err);
        }

        if (systemPromptOverride) {
            const result = await llmConnector.generateDefinition(prompt, systemPromptOverride);
            broadcastToWindows('llm:response-end');
            return result;
        }

        try {
            const assistantId = settingsManager.get('currentAssistantId') || 'default';
            const profile = settingsManager.loadProfile(assistantId) || {};

            // Priority for Main Prompt:
            // 1. Profile custom prompt
            // 2. Builtin default for that mode (via loadProfile virtual data)
            // 3. Global default systemPrompt (only as absolute fallback)
            const mainPrompt = profile.systemPrompt || settingsManager.get('systemPrompt');

            let sysPrompt = [
                mainPrompt,
                profile.assistantInstructions || '',
                profile.additionalContext || ''
            ].filter(Boolean).join('\n\n');

            sysPrompt += settingsManager.buildBehaviorPrompt(profile);

            if (!sysPrompt.trim()) {
                sysPrompt = 'Você é um dicionário técnico conciso.';
            } else {
                sysPrompt += '\n\nResponda agora ao termo solicitado de forma concisa e técnica seguindo as orientações acima.';
            }

            // Include short history for context-aware definitions
            const history = contextManager.getRecentHistory(3);
            let finalPrompt = prompt;
            if (history?.length) {
                finalPrompt = `Contexto da conversa:\n` +
                    history.map(h => `- ${h.question}`).join('\n') +
                    `\n\nAgora, ${prompt}`;
            }

            // 🔍 DEBUG: Secondary Request
            console.log('\n' + '-'.repeat(30));
            console.log('📖 [SECONDARY AI REQUEST]');
            console.log('📍 PROFILE:', assistantId);
            console.log('--- [SYSTEM PROMPT] ---\n', sysPrompt);
            console.log('--- [FINAL PROMPT] ---\n', finalPrompt);
            console.log('-'.repeat(30) + '\n');

            const result = await llmConnector.generateDefinition(finalPrompt, sysPrompt);
            broadcastToWindows('llm:response-end');
            return result;
        } catch (e) {
            console.error('[IPC-LLM] Failed to perform secondary generate:', e);
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
