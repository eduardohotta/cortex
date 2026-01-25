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
        onUpdateResponse: (callback) => ipcRenderer.on('update-response', (_, data) => callback(data)),
        onUpdateQuestion: (callback) => ipcRenderer.on('update-question', (_, data) => callback(data)),
        onCopyResponse: (callback) => ipcRenderer.on('copy-response', () => callback()),
        onStateChanged: (callback) => ipcRenderer.on('overlay:state-changed', (_, isVisible) => callback(isVisible)),
        onStealthChanged: (callback) => ipcRenderer.on('overlay:stealth-changed', (_, isStealth) => callback(isStealth)),
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
        onHotkeyRecord: (callback) => ipcRenderer.on('hotkey:record', () => callback()),
        onHotkeyAsk: (callback) => ipcRenderer.on('hotkey:ask', () => callback()),
        onStateUpdate: (callback) => ipcRenderer.on('app:state-update', (_, state) => callback(state)),
        onProfilesUpdated: (callback) => ipcRenderer.on('profiles:updated', () => callback()),
        sendAction: (data) => ipcRenderer.send('app:action', data)
    },

    audio: {
        getDevices: () => ipcRenderer.invoke('audio:getDevices'),
        startCapture: (deviceId, sttProvider) => ipcRenderer.invoke('audio:startCapture', deviceId, sttProvider),
        stopCapture: () => ipcRenderer.invoke('audio:stopCapture'),
        onAudioData: (callback) => ipcRenderer.on('audio:data', (_, data) => callback(data)),
        onVolume: (callback) => ipcRenderer.on('audio:volume', (_, volume) => callback(volume))
    },

    transcription: {
        start: (config) => ipcRenderer.invoke('transcription:start', config),
        stop: () => ipcRenderer.invoke('transcription:stop'),
        onTranscript: (callback) => ipcRenderer.on('transcription:result', (_, data) => callback(data)),
        onDownloadProgress: (callback) => ipcRenderer.on('transcription:download-progress', (_, data) => callback(data))
    },

    llm: {
        generate: (prompt, systemPrompt) => ipcRenderer.invoke('llm:generate', prompt, systemPrompt),
        processAsk: (data) => ipcRenderer.invoke('llm:process-ask', data),
        testKey: (apiKey) => ipcRenderer.invoke('llm:testKey', apiKey),
        onResponseStart: (callback) => ipcRenderer.on('llm:response-start', () => callback()),
        onResponseChunk: (callback) => ipcRenderer.on('llm:response-chunk', (_, chunk) => callback(chunk)),
        onResponseEnd: (callback) => ipcRenderer.on('llm:response-end', () => callback()),
        onKeyActive: (callback) => ipcRenderer.on('llm:keyActive', (_, data) => callback(data)),
        onKeyFailed: (callback) => ipcRenderer.on('llm:keyFailed', (_, data) => callback(data)),
        onQuotaExceeded: (callback) => ipcRenderer.on('llm:quotaExceeded', (_, data) => callback(data)),
        onError: (callback) => ipcRenderer.on('llm:error', (_, msg) => callback(msg))
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
        onSettingsChanged: (callback) => ipcRenderer.on('settings:changed', (_, data) => callback(data))
    }
});
