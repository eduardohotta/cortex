const fs = require('fs');
const path = require('path');
const https = require('https');
const EventEmitter = require('events');
const os = require('os');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

class ModelManager extends EventEmitter {
    constructor() {
        super();
        this.baseDir = path.join(os.homedir(), '.antigravity', 'models');
        this.indexFile = path.join(this.baseDir, 'models.json');
        this.models = [];
        this.activeRequests = new Map(); // Store active http requests
        this.init();
    }

    init() {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
        console.log(`[ModelManager] Models directory: ${this.baseDir}`);
        this.loadIndex();
    }

    loadIndex() {
        try {
            if (fs.existsSync(this.indexFile)) {
                this.models = JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
            }
        } catch (error) {
            console.error('Failed to load model index:', error);
            this.models = [];
        }
    }

    saveIndex() {
        try {
            fs.writeFileSync(this.indexFile, JSON.stringify(this.models, null, 2));
            this.emit('updated', this.models);
        } catch (error) {
            console.error('Failed to save model index:', error);
        }
    }

    list() {
        return this.models;
    }

    /**
     * Download a file from a URL to the models directory
     */
    async download(url, filename, metadata) {
        const filePath = path.join(this.baseDir, filename);

        // Add to index as downloading
        const existingIndex = this.models.findIndex(m => m.filename === filename);
        const modelEntry = {
            id: metadata.id || `local-${Date.now()}`,
            filename,
            name: metadata.name || filename,
            size: metadata.size || 0,
            quantization: metadata.quantization || 'unknown',
            status: 'downloading',
            progress: 0,
            url
        };

        if (existingIndex >= 0) {
            this.models[existingIndex] = modelEntry;
        } else {
            this.models.push(modelEntry);
        }
        this.saveIndex();

        return new Promise((resolve, reject) => {
            const downloadFile = (downloadUrl) => {
                const req = https.get(downloadUrl, (response) => {
                    // Handle redirects
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        console.log(`[ModelManager] Redirecting to: ${response.headers.location}`);
                        return downloadFile(response.headers.location);
                    }

                    if (response.statusCode >= 400) {
                        this.activeRequests.delete(filename);
                        this.updateStatus(filename, 'error');
                        return reject(new Error(`HTTP Error: ${response.statusCode}`));
                    }

                    const filePath = path.join(this.baseDir, filename);
                    const file = fs.createWriteStream(filePath);
                    const totalSize = parseInt(response.headers['content-length'], 10);
                    let downloaded = 0;

                    response.on('data', (chunk) => {
                        downloaded += chunk.length;
                        const progress = totalSize ? Math.round((downloaded / totalSize) * 100) : 0;
                        this.updateProgress(filename, progress);
                        file.write(chunk);
                    });

                    response.on('end', () => {
                        file.end();
                        this.activeRequests.delete(filename);
                        this.updateStatus(filename, 'installed');
                        console.log(`[ModelManager] Download complete: ${filePath}`);
                        resolve(filePath);
                    });

                    response.on('error', (err) => {
                        this.activeRequests.delete(filename);
                        file.close();
                        fs.unlink(filePath, () => { });
                        this.updateStatus(filename, 'error');
                        reject(err);
                    });
                });

                req.on('error', (err) => {
                    this.activeRequests.delete(filename);
                    this.updateStatus(filename, 'error');
                    reject(err);
                });

                this.activeRequests.set(filename, req);
            };

            downloadFile(url);
        });
    }

    cancel(filename) {
        const req = this.activeRequests.get(filename);
        if (req) {
            console.log(`[ModelManager] Cancelling download: ${filename}`);
            req.destroy();
            this.activeRequests.delete(filename);

            // Delete partial file
            const filePath = path.join(this.baseDir, filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Remove from index
            this.models = this.models.filter(m => m.filename !== filename);
            this.saveIndex();

            this.emit('progress', { filename, status: 'idle', progress: 0 });
            return true;
        }
        return false;
    }

    updateProgress(filename, progress) {
        const model = this.models.find(m => m.filename === filename);
        if (model && model.progress !== progress) {
            model.progress = progress;
            // Don't save to disk on every progress update to avoid IO thrashing
            this.emit('progress', { filename, progress });
        }
    }

    updateStatus(filename, status) {
        const model = this.models.find(m => m.filename === filename);
        if (model) {
            model.status = status;
            if (status === 'installed') model.progress = 100;
            this.saveIndex();
        }
    }

    delete(filename) {
        const filePath = path.join(this.baseDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        this.models = this.models.filter(m => m.filename !== filename);
        this.saveIndex();
    }

    getPath(filename) {
        return path.join(this.baseDir, filename);
    }
}

module.exports = new ModelManager();
