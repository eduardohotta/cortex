/**
 * IPC Windows & App Handlers
 */
const { ipcMain, app, BrowserWindow } = require('electron');
const { getMainWindow, getOverlayWindow, toggleStealthMode, broadcastToWindows } = require('./windows');
const { handleAppAction } = require('./shortcuts');

function registerWindowHandlers(services) {
    const { settingsManager, audioService, speechService, contextManager } = services;

    ipcMain.on('app:action', (_, payload) =>
        handleAppAction(payload.action, payload.data)
    );

    ipcMain.handle('overlay:show', () => {
        getOverlayWindow()?.show();
        getMainWindow()?.webContents.send('overlay:state-changed', true);
    });

    ipcMain.handle('overlay:hide', () => {
        getOverlayWindow()?.hide();
        getMainWindow()?.webContents.send('overlay:state-changed', false);
    });

    ipcMain.handle('overlay:toggleStealth', () => toggleStealthMode());

    ipcMain.on('overlay:set-ignore-mouse', (_, ignore) =>
        getOverlayWindow()?.setIgnoreMouseEvents(ignore, { forward: true })
    );

    /* SETTINGS */
    ipcMain.handle('settings:get', (_, k, p) => settingsManager.get(k, p));
    ipcMain.handle('settings:set', (_, k, v, p) => {
        settingsManager.set(k, v, p);
        broadcastToWindows('settings:changed', { key: k, value: v, provider: p });
        return { success: true };
    });

    ipcMain.handle('settings:getAll', (_, p) => settingsManager.getAll(p));
    ipcMain.handle('settings:saveProfile', (_, n, c) => {
        settingsManager.saveProfile(n, c);
        broadcastToWindows('profiles:updated');
        return { success: true };
    });
    ipcMain.handle('settings:loadProfile', (_, n) => settingsManager.loadProfile(n));
    ipcMain.handle('settings:getProfiles', () => settingsManager.getProfiles());
    ipcMain.handle('settings:deleteProfile', (_, n) => {
        settingsManager.deleteProfile(n);
        broadcastToWindows('profiles:updated');
        return { success: true };
    });

    ipcMain.handle('settings:refreshShortcuts', () => {
        require('./shortcuts').registerShortcuts();
        return { success: true };
    });

    /* APP */
    ipcMain.handle('app:panic', () => {
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
        const w = getMainWindow();
        w?.isMaximized() ? w.unmaximize() : w?.maximize();
    });

    ipcMain.on('window:move', (e, { x, y }) => {
        const w = BrowserWindow.fromWebContents(e.sender);
        if (!w) return;
        const [cx, cy] = w.getPosition();
        w.setPosition(cx + x, cy + y);
    });

    ipcMain.handle('app:show-dashboard', () => {
        let w = getMainWindow();
        if (!w) w = require('./windows').createMainWindow();
        w.show(); w.focus();
    });
}

module.exports = { registerWindowHandlers };
