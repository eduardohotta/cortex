/**
 * CORTEX - Main Entry Point
 * 
 * This is the Electron main process entry point.
 * All functionality is modularized into src/main/ for maintainability.
 */
const { app, globalShortcut, BrowserWindow } = require('electron');

// Fix for Windows "cache_util_win.cc:20: Unable to move the cache: Access denied"
// This error happens when the GPU shader cache file is locked by the OS or a zombie process.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

process.on('uncaughtException', (error) => {
  console.error('CRITICAL ERROR (Uncaught Exception):', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

// Import services
const AudioCaptureService = require('./src/services/audio-capture');
const SpeechRecognitionService = require('./src/services/speech-recognition');
const QuestionClassifier = require('./src/services/question-classifier');
const ContextManager = require('./src/services/context-manager');
const LLMConnector = require('./src/services/llm-connector');
const SettingsManager = require('./src/services/settings-manager');

// Import main process modules
const { createMainWindow, createRemoteWindow, createTranscriptionWindow, createResponseWindow } = require('./src/main/windows');
const { injectServices: injectShortcutServices, registerShortcuts } = require('./src/main/shortcuts');
const { injectServices: injectIPCServices, registerIPCHandlers } = require('./src/main/ipc-handlers');
const { injectServices: injectAudioServices, setupAudioPipeline } = require('./src/main/audio-pipeline');

// Initialize services
const audioService = new AudioCaptureService();
const speechService = new SpeechRecognitionService();
const questionClassifier = new QuestionClassifier();
const contextManager = new ContextManager(questionClassifier);
const llmConnector = new LLMConnector();
const settingsManager = new SettingsManager();

// Inject dependencies into modules
const services = {
  audioService,
  speechService,
  questionClassifier,
  contextManager,
  llmConnector,
  settingsManager
};

injectShortcutServices(services);
injectIPCServices(services);
injectAudioServices(services);

// Register IPC handlers immediately (before app is ready)
registerIPCHandlers();

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(async () => {
  createMainWindow();
  createRemoteWindow();
  createTranscriptionWindow();
  createResponseWindow();
  registerShortcuts();
  setupAudioPipeline();

  // Preload local LLM model if provider is local
  try {
    const provider = settingsManager.get('llmProvider');
    if (provider === 'local') {
      const localModel = settingsManager.get('localModel');
      if (localModel) {
        console.log('[CORTEX] Preloading local LLM model:', localModel);
        const localLLM = require('./src/services/local-llm-service');
        const modelManager = require('./src/services/model-manager');
        const modelPath = modelManager.getPath(localModel);
        await localLLM.loadModel(modelPath);
        console.log('[CORTEX] Local model preloaded successfully');
      }
    }
  } catch (err) {
    console.warn('[CORTEX] Model preload failed (non-fatal):', err.message);
  }
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    createRemoteWindow();
    createTranscriptionWindow();
    createResponseWindow();
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const { getMainWindow } = require('./src/main/windows');
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
