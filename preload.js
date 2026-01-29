'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload seguro:
 * - Não expõe ipcRenderer diretamente (nem event objects).
 * - Wrappers fixos por canal (sem permitir canal arbitrário vindo do renderer).
 * - Sanitização simples de parâmetros.
 * - openExternal vai para o main (o main deve validar allowlist de protocolos/domínios).
 */

// --- overlay view (via additionalArguments: --view=response|transcription|remote) ---
const overlayViewArg = process.argv.find(arg => typeof arg === 'string' && arg.startsWith('--view='));
const rawView = overlayViewArg ? overlayViewArg.split('=').slice(1).join('=') : null;

const allowedViews = new Set(['remote', 'transcription', 'response']);
const overlayView = (() => {
    if (!rawView) return null;
    const v = decodeURIComponent(String(rawView)).trim();
    return allowedViews.has(v) ? v : null;
})();

// --- helpers ---
const isFn = (v) => typeof v === 'function';

const safeCb = (cb) => {
    if (!isFn(cb)) return () => { };
    return cb;
};

/**
 * Wrapper seguro de eventos:
 * - não repassa o "event" do Electron para o renderer
 * - permite unsubscribe
 * - mantém uma assinatura consistente
 *
 * Isso segue a recomendação do Electron de não expor handlers brutos. [web:292]
 */
const on = (channel, callback) => {
    const cb = safeCb(callback);
    const handler = (_event, ...args) => cb(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
};

const once = (channel, callback) => {
    const cb = safeCb(callback);
    const handler = (_event, ...args) => cb(...args);
    ipcRenderer.once(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
};

// freeze profundo para dificultar mutação acidental no renderer
const deepFreeze = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
    return obj;
};

// --- API exposta ---
const api = {
    // view dessa janela overlay
    getOverlayView: () => Promise.resolve(overlayView),

    overlay: {
        show: () => ipcRenderer.invoke('overlay:show'),
        hide: () => ipcRenderer.invoke('overlay:hide'),
        toggle: () => ipcRenderer.invoke('overlay:toggle'),
        toggleStealth: () => ipcRenderer.invoke('overlay:toggleStealth'),

        setResponse: (data) => ipcRenderer.invoke('overlay:setResponse', data),
        setQuestion: (data) => ipcRenderer.invoke('overlay:setQuestion', data),

        onUpdateResponse: (cb) => on('update-response', (data) => safeCb(cb)(data)),
        onUpdateQuestion: (cb) => on('update-question', (data) => safeCb(cb)(data)),
        onCopyResponse: (cb) => on('copy-response', () => safeCb(cb)()),

        onStateChanged: (cb) => on('overlay:state-changed', (isVisible) => safeCb(cb)(!!isVisible)),
        onStealthChanged: (cb) => on('overlay:stealth-changed', (isStealth) => safeCb(cb)(!!isStealth)),

        setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore-mouse', !!ignore)
    },

    app: {
        panic: () => ipcRenderer.invoke('app:panic'),
        getVersion: () => ipcRenderer.invoke('app:getVersion'),

        minimize: () => ipcRenderer.invoke('window:minimize'),
        close: () => ipcRenderer.invoke('window:close'),
        toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),

        showDashboard: () => ipcRenderer.invoke('app:show-dashboard'),

        move: (x, y) => ipcRenderer.send('window:move', { x: Number(x), y: Number(y) }),

        onHotkeyRecord: (cb) => on('hotkey:record', () => safeCb(cb)()),
        onHotkeyAsk: (cb) => on('hotkey:ask', () => safeCb(cb)()),

        onStateUpdate: (cb) => on('app:state-update', (state) => safeCb(cb)(state)),
        onProfilesUpdated: (cb) => on('profiles:updated', () => safeCb(cb)()),
        onCudaFallback: (cb) => on('llm:cuda-fallback', (data) => safeCb(cb)(data)),

        /**
         * IMPORTANTE:
         * Não chame shell.openExternal aqui no preload.
         * Encaminhe para o main e valide lá (http/https allowlist etc.). [web:298][web:292]
         */
        openExternal: (url) => ipcRenderer.invoke('app:openExternal', String(url ?? '')),

        sendAction: (data) => ipcRenderer.send('app:action', data)
    },

    audio: {
        getDevices: () => ipcRenderer.invoke('audio:getDevices'),
        startCapture: (deviceId, sttProvider) => ipcRenderer.invoke('audio:startCapture', deviceId, sttProvider),
        stopCapture: () => ipcRenderer.invoke('audio:stopCapture'),
        onAudioData: (cb) => on('audio:data', (data) => safeCb(cb)(data)),
        onVolume: (cb) => on('audio:volume', (volume) => safeCb(cb)(volume))
    },

    transcription: {
        start: (config) => ipcRenderer.invoke('transcription:start', config),
        stop: () => ipcRenderer.invoke('transcription:stop'),
        onTranscript: (cb) => on('transcription:result', (data) => safeCb(cb)(data)),
        onDownloadProgress: (cb) => on('transcription:download-progress', (data) => safeCb(cb)(data))
    },

    llm: {
        generate: (prompt, systemPrompt) =>
            ipcRenderer.invoke('llm:generate', String(prompt ?? ''), systemPrompt == null ? undefined : String(systemPrompt)),
        processAsk: (data) => ipcRenderer.invoke('llm:process-ask', data),
        stopGeneration: () => ipcRenderer.invoke('llm:stop-generation'),
        testKey: (apiKey) => ipcRenderer.invoke('llm:testKey', String(apiKey ?? '')),

        onResponseStart: (cb) => on('llm:response-start', () => safeCb(cb)()),
        onResponseChunk: (cb) => on('llm:response-chunk', (chunk) => safeCb(cb)(chunk)),
        onResponseEnd: (cb) => on('llm:response-end', () => safeCb(cb)()),

        onKeyActive: (cb) => on('llm:keyActive', (data) => safeCb(cb)(data)),
        onKeyFailed: (cb) => on('llm:keyFailed', (data) => safeCb(cb)(data)),
        onQuotaExceeded: (cb) => on('llm:quotaExceeded', (data) => safeCb(cb)(data)),
        onError: (cb) => on('llm:error', (msg) => safeCb(cb)(msg)),

        // opcional (às vezes ajuda): eventos one-shot
        onceResponseEnd: (cb) => once('llm:response-end', () => safeCb(cb)())
    },

    settings: {
        get: (key, provider) => ipcRenderer.invoke('settings:get', key, provider),
        set: (key, value, provider) => ipcRenderer.invoke('settings:set', key, value, provider),
        getAll: (provider) => ipcRenderer.invoke('settings:getAll', provider),

        saveProfile: (name, config) => ipcRenderer.invoke('settings:saveProfile', name, config),
        loadProfile: (name) => ipcRenderer.invoke('settings:loadProfile', name),
        getProfiles: () => ipcRenderer.invoke('settings:getProfiles'),
        deleteProfile: (name) => ipcRenderer.invoke('settings:deleteProfile', name),

        refreshShortcuts: () => ipcRenderer.invoke('settings:refreshShortcuts'),

        onSettingsChanged: (cb) => on('settings:changed', (data) => safeCb(cb)(data))
    },

    model: {
        list: () => ipcRenderer.invoke('model:list'),
        delete: (filename) => ipcRenderer.invoke('model:delete', filename),
        download: (config) => ipcRenderer.invoke('model:download', config),
        cancel: (filename) => ipcRenderer.invoke('model:cancel', filename),

        onProgress: (cb) => on('model:progress', (data) => safeCb(cb)(data)),
        onUpdated: (cb) => on('model:updated', (data) => safeCb(cb)(data)),
        onStatus: (cb) => on('model:status', (data) => safeCb(cb)(data))
    },

    hf: {
        search: (query) => ipcRenderer.invoke('hf:search', query),
        files: (repoId) => ipcRenderer.invoke('hf:files', repoId),
        getRecommended: () => ipcRenderer.invoke('hf:getRecommended'),
        getBestFile: (repoId) => ipcRenderer.invoke('hf:getBestFile', repoId)
    }
};

contextBridge.exposeInMainWorld('electronAPI', deepFreeze(api));
