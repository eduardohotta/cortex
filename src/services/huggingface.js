const https = require('https');

class HuggingFaceService {
    constructor() {
        this.baseUrl = 'https://huggingface.co/api';
        this.headers = {
            'User-Agent': 'Antigravity-Client',
            'Accept': 'application/json'
        };
    }

    request(url) {
        return new Promise((resolve, reject) => {
            https.get(url, { headers: this.headers }, (res) => {
                let data = '';

                if (res.statusCode !== 200) {
                    return reject(new Error(`HF API error ${res.statusCode}`));
                }

                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    /* =========================
       SEARCH MODELS
       ========================= */
    async search(query, limit = 20) {
        const url =
            `${this.baseUrl}/models` +
            `?search=${encodeURIComponent(query)}` +
            `&filter=gguf` +
            `&sort=downloads` +
            `&direction=-1` +
            `&limit=${limit}`;

        const results = await this.request(url);

        return results.map(r => ({
            id: r.id,
            name: r.id.split('/').pop(),
            fullId: r.id,
            downloads: r.downloads || 0,
            likes: r.likes || 0,
            tags: r.tags || []
        }));
    }

    /* =========================
       POPULAR GGUF MODELS (FAST)
       ========================= */
    async getRecommended() {
        const url =
            `${this.baseUrl}/models` +
            `?filter=gguf` +
            `&sort=downloads` +
            `&direction=-1` +
            `&limit=100`;

        const results = await this.request(url);

        const isLargeModel = (id) => {
            return /(7b|8b|13b|34b|70b)/i.test(id);
        };

        const isGarbage = (id) => {
            return /(fp16|f32|experimental|test)/i.test(id);
        };

        const filtered = results.filter(r => {
            const id = r.id.toLowerCase();
            return (
                r.downloads >= 20000 &&
                isLargeModel(id) &&
                !isGarbage(id)
            );
        });

        const finalModels = [];

        // For each repo, find the best GGUF file
        for (const repo of filtered.slice(0, 15)) {
            try {
                const bestFile = await this.getBestFile(repo.id);
                if (!bestFile) continue;

                finalModels.push({
                    repoId: repo.id,
                    name: repo.id.split('/').pop(),
                    downloads: repo.downloads || 0,
                    file: bestFile.file,
                    sizeGB: parseFloat((bestFile.size / (1024 * 1024 * 1024)).toFixed(2)),
                    url: bestFile.url
                });

                if (finalModels.length >= 12) break;
            } catch (e) {
                console.error(`Failed to process repo ${repo.id}:`, e);
            }
        }

        return finalModels;
    }

    /* =========================
       FIND BEST GGUF FILE
       ========================= */
    async getBestFile(repoId) {
        const files = await this.getFiles(repoId);
        if (files.length === 0) return null;

        // Priority: Q4_K_M > Q5_K_M > Q4_K > Q8_0
        const priorityOrder = ['Q4_K_M', 'Q5_K_M', 'Q4_K', 'Q8_0'];
        let bestFile = null;

        for (const p of priorityOrder) {
            bestFile = files.find(f => f.file.includes(p));
            if (bestFile) break;
        }

        if (!bestFile) bestFile = files[0];

        return {
            ...bestFile,
            sizeGB: parseFloat((bestFile.size / (1024 * 1024 * 1024)).toFixed(2))
        };
    }

    detectParams(id) {
        const match = id.match(/(7b|8b|13b|34b|70b)/i);
        return match ? match[0].toUpperCase() : 'Unknown';
    }

    /* =========================
       LIST GGUF FILES
       ========================= */
    async getFiles(repoId) {
        const url = `${this.baseUrl}/models/${repoId}`;
        const data = await this.request(url);

        if (!Array.isArray(data.siblings)) return [];

        return data.siblings
            .filter(f => f.rfilename.endsWith('.gguf'))
            .map(f => ({
                file: f.rfilename,
                size: f.size || 0,
                quant: this.detectQuant(f.rfilename),
                url: `https://huggingface.co/${repoId}/resolve/main/${f.rfilename}`
            }));
    }

    detectQuant(filename) {
        const m = filename.match(/Q\d(_\w+)?|Q\d/g);
        return m ? m[0] : 'unknown';
    }
}

module.exports = new HuggingFaceService();
