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

        return filtered.slice(0, 12).map(r => ({
            repoId: r.id,
            name: r.id.split('/').pop(),
            parameters: this.detectParams(r.id),
            downloads: r.downloads,
            likes: r.likes || 0,
            tags: r.tags || [],
            provider: 'huggingface'
        }));
    }

    detectParams(id) {
        const match = id.match(/(7b|8b|13b|34b|70b)/i);
        return match ? match[0].toUpperCase() : 'Unknown';
    }
}

module.exports = new HuggingFaceService();
