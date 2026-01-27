/**
 * IPC Handlers Module
 * Aggregates handlers from specialized modules
 */
const { broadcastToWindows } = require('./windows');
const { registerAudioHandlers } = require('./ipc-audio');
const { registerLLMHandlers } = require('./ipc-llm');
const { registerWindowHandlers } = require('./ipc-windows');

let services = null;

/**
 * Inject service dependencies
 */
function injectServices(injectedServices) {
    services = injectedServices;

    if (services?.speechService) {
        services.speechService.on('cuda-fallback', (data) => {
            console.warn('CUDA Fallback Triggered:', data);
            broadcastToWindows('llm:cuda-fallback', data);
        });
    }
}

/**
 * Register all IPC handlers
 */
function registerIPCHandlers() {
    if (!services) {
        throw new Error('[IPC] Services not injected. Call injectServices() first.');
    }

    registerAudioHandlers(services.audioService);
    registerLLMHandlers(services);
    registerWindowHandlers(services);
}

module.exports = {
    injectServices,
    registerIPCHandlers
};
