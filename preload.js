const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure IPC bridge between renderer and main process
 */
// Extract overlay view from command line arguments (set via additionalArguments in windows.js)
const overlayViewArg = process.argv.find(arg => arg.startsWith('--view='));
const overlayView = overlayViewArg ? overlayViewArg.split('=')[1] : null;

contextBridge.exposeInMainWorld('electronAPI', {
    // Returns the overlay view type for this window (remote, transcription, response)
    getOverlayView: () => Promise.resolve(overlayView),

    overlay: {
        show: () => ipcRenderer.invoke('overlay:show'),
        hide: () => ipcRenderer.invoke('overlay:hide'),
        toggle: () => ipcRenderer.invoke('overlay:toggle'),
        toggleStealth: () => ipcRenderer.invoke('overlay:toggleStealth'),
        setResponse: (data) => ipcRenderer.invoke('overlay:setResponse', data),
        setQuestion: (data) => ipcRenderer.invoke('overlay:setQuestion', data),
        onUpdateResponse: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('update-response', l);
            return () => ipcRenderer.removeListener('update-response', l);
        },
        onUpdateQuestion: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('update-question', l);
            return () => ipcRenderer.removeListener('update-question', l);
        },
        onCopyResponse: (callback) => {
            const l = () => callback();
            ipcRenderer.on('copy-response', l);
            return () => ipcRenderer.removeListener('copy-response', l);
        },
        onStateChanged: (callback) => {
            const l = (_, isVisible) => callback(isVisible);
            ipcRenderer.on('overlay:state-changed', l);
            return () => ipcRenderer.removeListener('overlay:state-changed', l);
        },
        onStealthChanged: (callback) => {
            const l = (_, isStealth) => callback(isStealth);
            ipcRenderer.on('overlay:stealth-changed', l);
            return () => ipcRenderer.removeListener('overlay:stealth-changed', l);
        },
        setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore-mouse', ignore)
    },

    app: {
        panic: () => ipcRenderer.invoke('app:panic'),
        getVersion: () => ipcRenderer.invoke('app:getVersion'),
        minimize: () => ipcRenderer.invoke('window:minimize'),
        close: () => ipcRenderer.invoke('window:close'),
        toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
        showDashboard: () => ipcRenderer.invoke('app:show-dashboard'),
        move: (x, y) => ipcRenderer.send('window:move', { x, y }),
        onHotkeyRecord: (callback) => {
            const l = () => callback();
            ipcRenderer.on('hotkey:record', l);
            return () => ipcRenderer.removeListener('hotkey:record', l);
        },
        onHotkeyAsk: (callback) => {
            const l = () => callback();
            ipcRenderer.on('hotkey:ask', l);
            return () => ipcRenderer.removeListener('hotkey:ask', l);
        },
        onStateUpdate: (callback) => {
            const l = (_, state) => callback(state);
            ipcRenderer.on('app:state-update', l);
            return () => ipcRenderer.removeListener('app:state-update', l);
        },
        onProfilesUpdated: (callback) => {
            const l = () => callback();
            ipcRenderer.on('profiles:updated', l);
            return () => ipcRenderer.removeListener('profiles:updated', l);
        },
        onCudaFallback: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('llm:cuda-fallback', l);
            return () => ipcRenderer.removeListener('llm:cuda-fallback', l);
        },
        openExternal: (url) => require('electron').shell.openExternal(url),
        sendAction: (data) => ipcRenderer.send('app:action', data)
    },

    audio: {
        getDevices: () => ipcRenderer.invoke('audio:getDevices'),
        startCapture: (deviceId, sttProvider) => ipcRenderer.invoke('audio:startCapture', deviceId, sttProvider),
        stopCapture: () => ipcRenderer.invoke('audio:stopCapture'),
        onAudioData: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('audio:data', l);
            return () => ipcRenderer.removeListener('audio:data', l);
        },
        onVolume: (callback) => {
            const l = (_, volume) => callback(volume);
            ipcRenderer.on('audio:volume', l);
            return () => ipcRenderer.removeListener('audio:volume', l);
        }
    },

    transcription: {
        start: (config) => ipcRenderer.invoke('transcription:start', config),
        stop: () => ipcRenderer.invoke('transcription:stop'),
        onTranscript: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('transcription:result', l);
            return () => ipcRenderer.removeListener('transcription:result', l);
        },
        onDownloadProgress: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('transcription:download-progress', l);
            return () => ipcRenderer.removeListener('transcription:download-progress', l);
        }
    },

    llm: {
        generate: (prompt, systemPrompt) => ipcRenderer.invoke('llm:generate', prompt, systemPrompt),
        processAsk: (data) => ipcRenderer.invoke('llm:process-ask', data),
        testKey: (apiKey) => ipcRenderer.invoke('llm:testKey', apiKey),
        onResponseStart: (callback) => {
            const l = () => callback();
            ipcRenderer.on('llm:response-start', l);
            return () => ipcRenderer.removeListener('llm:response-start', l);
        },
        onResponseChunk: (callback) => {
            const l = (_, chunk) => callback(chunk);
            ipcRenderer.on('llm:response-chunk', l);
            return () => ipcRenderer.removeListener('llm:response-chunk', l);
        },
        onResponseEnd: (callback) => {
            const l = () => callback();
            ipcRenderer.on('llm:response-end', l);
            return () => ipcRenderer.removeListener('llm:response-end', l);
        },
        onKeyActive: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('llm:keyActive', l);
            return () => ipcRenderer.removeListener('llm:keyActive', l);
        },
        onKeyFailed: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('llm:keyFailed', l);
            return () => ipcRenderer.removeListener('llm:keyFailed', l);
        },
        onQuotaExceeded: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('llm:quotaExceeded', l);
            return () => ipcRenderer.removeListener('llm:quotaExceeded', l);
        },
        onError: (callback) => {
            const l = (_, msg) => callback(msg);
            ipcRenderer.on('llm:error', l);
            return () => ipcRenderer.removeListener('llm:error', l);
        }
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
        onSettingsChanged: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('settings:changed', l);
            return () => ipcRenderer.removeListener('settings:changed', l);
        }
    },

    model: {
        list: () => ipcRenderer.invoke('model:list'),
        delete: (filename) => ipcRenderer.invoke('model:delete', filename),
        download: (config) => ipcRenderer.invoke('model:download', config),
        onProgress: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('model:progress', l);
            return () => ipcRenderer.removeListener('model:progress', l);
        },
        onUpdated: (callback) => {
            const l = (_, data) => callback(data);
            ipcRenderer.on('model:updated', l);
            return () => ipcRenderer.removeListener('model:updated', l);
        }
    },

    hf: {
        search: (query) => ipcRenderer.invoke('hf:search', query),
        files: (repoId) => ipcRenderer.invoke('hf:files', repoId),
        getRecommended: () => ipcRenderer.invoke('hf:getRecommended')
    }
});
