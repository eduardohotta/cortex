const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConversationStore {
    constructor() {
        const userDataPath = app.getPath('userData');
        this.dbPath = path.join(userDataPath, 'session-history.json');
        this.history = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf-8');
                this.history = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load conversation history:', error);
            this.history = [];
        }
    }

    save() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.history, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save conversation history:', error);
        }
    }

    /**
     * Add a full turn (User Question + AI Response)
     */
    addTurn(question, answer, context = {}) {
        const entry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            role: 'turn',
            question: question,
            answer: answer,
            context: context
        };
        this.history.push(entry);

        // Keep last 50 turns
        if (this.history.length > 50) {
            this.history.shift();
        }

        this.save();
    }

    /**
     * Get recent context for prompt injection
     * Values determined by token limits
     */
    getRecentContext(limit = 3) {
        return this.history.slice(-limit).map(entry => ({
            question: entry.question,
            answer: entry.answer
        }));
    }

    clear() {
        this.history = [];
        this.save();
    }
}

module.exports = ConversationStore;
