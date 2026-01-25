/**
 * Centralized Application State Module
 */

// Application State (Source of Truth)
const appState = {
    isListening: false,
    isPaused: false,
    transcriptBuffer: '',
    tokenCount: 0,
    currentProfile: 'general'
};

// References to windows (set by windows.js)
let mainWindow = null;
let overlayWindow = null;

/**
 * Set window references (called from windows.js)
 */
function setWindows(main, overlay) {
    mainWindow = main;
    overlayWindow = overlay;
}

/**
 * Get window references
 */
function getWindows() {
    return { mainWindow, overlayWindow };
}

/**
 * Heuristic Token Counter (approx. 4 chars per token)
 */
function countTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

/**
 * Broadcast state update to all windows
 */
function broadcastState() {
    const { broadcastToWindows } = require('./windows');

    broadcastToWindows('app:state-update', {
        isListening: appState.isListening,
        isPaused: appState.isPaused,
        tokenCount: appState.tokenCount
    });
}

module.exports = {
    appState,
    setWindows,
    getWindows,
    countTokens,
    broadcastState
};
