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
            const req = https.get(url, { headers: this.headers, timeout: 10000 }, (res) => {
                let data = '';

                if (res.statusCode !== 200) {
                    return reject(
                        new Error(`HF API error ${res.statusCode}`)
                    );
                }

                res.on('data', chunk => (data += chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('HF request timeout'));
            });

            req.on('error', reject);
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
            name: r.id,
            downloads: r.downloads || 0,
            likes: r.likes || 0,
            tags: r.tags || []
        }));
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
