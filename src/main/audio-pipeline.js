/**
 * Audio Pipeline Module
 */
const { appState, countTokens, broadcastState } = require('./app-state');
const { getMainWindow, getOverlayWindow } = require('./windows');

// Services (injected)
let audioService = null;
let speechService = null;
let contextManager = null;

/**
 * Inject service dependencies
 */
function injectServices(services) {
    audioService = services.audioService;
    speechService = services.speechService;
    contextManager = services.contextManager;
}

/**
 * Set up audio-to-transcription pipeline
 */
function setupAudioPipeline() {
    let lastVolumeEmit = 0;

    audioService.on('audio', (buffer) => {
        speechService.processAudio(buffer);

        const now = Date.now();
        if (now - lastVolumeEmit > 50) {
            let sum = 0;
            for (let i = 0; i < buffer.length; i += 2) {
                if (i + 1 < buffer.length) {
                    const sample = buffer.readInt16LE(i);
                    sum += sample * sample;
                }
            }
            const rms = Math.sqrt(sum / (buffer.length / 2));
            const volume = Math.min(100, Math.floor((rms / 32768) * 400));

            const mainWindow = getMainWindow();
            const overlayWindow = getOverlayWindow();

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('audio:volume', volume);
            }
            if (overlayWindow && !overlayWindow.isDestroyed()) {
                overlayWindow.webContents.send('audio:volume', volume);
            }
            lastVolumeEmit = now;
        }
    });

    speechService.on('transcript', (data) => {
        const mainWindow = getMainWindow();
        const overlayWindow = getOverlayWindow();

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('transcription:result', data);
        }
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('transcription:result', data);
        }

        if (data.isFinal) {
            contextManager.addTranscript(data.text, true);
            appState.transcriptBuffer += ' ' + data.text;
            appState.tokenCount = countTokens(appState.transcriptBuffer);
            broadcastState();
        }
    });
}

module.exports = {
    injectServices,
    setupAudioPipeline
};
