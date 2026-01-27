/**
 * IPC Audio Handlers
 */
const { ipcMain } = require('electron');
const { appState, broadcastState } = require('./app-state');

function registerAudioHandlers(audioService) {
    ipcMain.handle('audio:getDevices', async () =>
        audioService ? audioService.getDevices() : []
    );

    ipcMain.handle('audio:startCapture', async (_, deviceId) => {
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
}

module.exports = { registerAudioHandlers };
