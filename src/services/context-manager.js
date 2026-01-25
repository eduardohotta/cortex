const EventEmitter = require('events');
const SemanticParser = require('./semantic-parser');
const ConversationStore = require('./conversation-store');

class ContextManager extends EventEmitter {
    constructor(questionClassifier) {
        super();
        this.classifier = questionClassifier;
        this.parser = new SemanticParser();
        this.store = new ConversationStore();
        this.buffer = [];
    }

    /**
     * Add new transcript chunk to context
     * Note: Automatic analysis disabled as per user request (Manual Only)
     */
    addTranscript(text, isFinal) {
        if (!text || !text.trim()) return;
        // Just store the chunks. No automatic triggers.
        this.buffer.push(text.trim());
    }

    /**
     * Get recent context for prompt injection
     */
    getRecentHistory(limit = 3) {
        return this.store.getRecentContext(limit);
    }

    /**
     * Call this when LLM actively responds to save the turn
     */
    recordTurn(question, answer) {
        this.store.addTurn(question, answer);
    }

    clear() {
        this.buffer = [];
    }
}

module.exports = ContextManager;
