const nlp = require('compromise');

class SemanticParser {
    constructor() {
        // Portuguese specific patterns since compromise is mainly English
        this.ptBoundaries = {
            terminators: /[.?!]$/,
            minWords: 3
        };
    }

    /**
     * Analyze text to check if it forms a complete thought/sentence
     * @param {string} text 
     * @returns {Object} Analysis result
     */
    analyze(text) {
        if (!text || text.trim().length === 0) {
            return { isComplete: false, confidence: 0 };
        }

        const doc = nlp(text);
        const wordCount = text.split(' ').length;

        // 1. Structural Check (Compromise NLP)
        // Check if it has a clause (Subject + Verb)
        const hasClause = doc.clauses().length > 0;
        const hasVerb = doc.verbs().length > 0;
        const hasNoun = doc.nouns().length > 0;

        // 2. Punctuation Check
        const endsWithTerminator = /[.?!]$/.test(text.trim());

        // 3. Length Heuristic
        const isShort = wordCount < 3;

        // 4. Conjunction trailing check (e.g. "but...", "and...")
        const trailingConnector = /\b(and|or|but|so|because|e|mas|ou|portanto|porque)\s*$/i.test(text.trim());

        // Decision Logic
        let isComplete = false;
        let confidence = 0.0;

        if (endsWithTerminator && !trailingConnector) {
            isComplete = true; // High confidence if punctuation is explicit
            confidence = 0.9;
        } else if (hasVerb && hasNoun && !trailingConnector && !isShort) {
            isComplete = true; // Syntactic completeness
            confidence = 0.7;
        }

        // Portuguese specific heuristics (since compromise might miss PT grammar)
        // If "comprensive" fails but we see PT structure
        if (!isComplete && wordCount > 4) {
            // "O que você acha" -> Missing ? but structurally essentially complete for our purpose
            const ptQuestionStarters = /^(o que|como|onde|quando|quanto|quem|qual|por que|você)/i;
            if (ptQuestionStarters.test(text)) {
                confidence = 0.6;
                // If it's long enough, treat as complete even without ?
                if (text.length > 20) isComplete = true;
            }
        }

        return {
            isComplete,
            confidence,
            hasVerb,
            hasNoun,
            wordCount
        };
    }
}

module.exports = SemanticParser;
