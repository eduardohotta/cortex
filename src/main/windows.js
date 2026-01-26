/**
 * Window Management Module - True Multi-Window Architecture
 */
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let windows = {
    main: null,
    remote: null,
    transcription: null,
    response: null
};

let isStealthMode = true;
const PRELOAD_PATH = path.join(__dirname, '..', '..', 'preload.js');
const DIST_PATH = path.join(__dirname, '..', '..', 'dist', 'renderer');

/**
 * Configure common window settings
 */
function configureWindow(win, stealth = false) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setContentProtection(stealth || isStealthMode);
    return win;
}

function createMainWindow() {
    windows.main = new BrowserWindow({
        width: 1000,
        height: 750,
        frame: false,
        backgroundColor: '#0a0a0c',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: PRELOAD_PATH
        }
    });

    windows.main.loadFile(path.join(DIST_PATH, 'dashboard', 'index.html'));

    windows.main.on('closed', () => {
        windows.main = null;
        checkAppQuit();
    });

    // Don't set alwaysOnTop for main window so overlay can appear above it
    // configureWindow(windows.main); // Removed to keep main window below overlays

    // BUT we still need Stealth Mode (Content Protection)
    windows.main.setContentProtection(isStealthMode);

    // When main window gets focus, ensure remote stays visible
    windows.main.on('focus', () => {
        if (windows.remote && !windows.remote.isDestroyed()) {
            windows.remote.moveTop();
        }
    });

    return windows.main;
}

function createRemoteWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    windows.remote = new BrowserWindow({
        width: 700,
        height: 600, // Increased to fit popups (Opening upwards)
        x: Math.floor((width - 700) / 2),
        y: height - 620, // Adjusted Y to keep bar at bottom
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        show: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: PRELOAD_PATH,
            additionalArguments: ['--view=remote']
        }
    });

    const overlayPath = path.join(DIST_PATH, 'overlay', 'index.html');
    // Using loadFile with hash option for robustness
    windows.remote.loadFile(overlayPath, { hash: 'remote' });

    // Enable click-through for transparent areas by default
    windows.remote.setIgnoreMouseEvents(true, { forward: true });

    configureWindow(windows.remote);

    windows.remote.on('closed', () => {
        windows.remote = null;
        checkAppQuit();
    });
}

function createTranscriptionWindow() {
    const { width } = screen.getPrimaryDisplay().workAreaSize;

    windows.transcription = new BrowserWindow({
        width: 450,
        height: 400,
        x: width - 470,
        y: 40,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: PRELOAD_PATH,
            additionalArguments: ['--view=transcription']
        }
    });

    const overlayPath = path.join(DIST_PATH, 'overlay', 'index.html');
    windows.transcription.loadFile(overlayPath, { hash: 'transcription' });
    configureWindow(windows.transcription);
}

function createResponseWindow() {
    const { width } = screen.getPrimaryDisplay().workAreaSize;

    windows.response = new BrowserWindow({
        width: 500,
        height: 450,
        x: width - 520,
        y: 460,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: PRELOAD_PATH,
            additionalArguments: ['--view=response']
        }
    });

    const overlayPath = path.join(DIST_PATH, 'overlay', 'index.html');
    windows.response.loadFile(overlayPath, { hash: 'response' });
    configureWindow(windows.response);
}

function toggleStealthMode() {
    isStealthMode = !isStealthMode;
    Object.values(windows).forEach(win => {
        if (win && !win.isDestroyed()) {
            win.setContentProtection(isStealthMode);
        }
    });
    broadcastToWindows('overlay:stealth-changed', isStealthMode);
    return isStealthMode;
}

function broadcastToWindows(channel, data) {
    Object.values(windows).forEach(win => {
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    });
}

function checkAppQuit() {
    if (!windows.main && !windows.remote) {
        require('electron').app.quit();
    }
}

ipcMain.on('window:relay', (event, { channel, data }) => {
    broadcastToWindows(channel, data);
});

module.exports = {
    createMainWindow,
    createRemoteWindow,
    createTranscriptionWindow,
    createResponseWindow,
    getMainWindow: () => windows.main,
    getOverlayWindow: () => windows.remote,
    broadcastToWindows,
    windows,
    toggleStealthMode
};
