/**
 * Question Classifier Service
 * Detects and classifies questions from transcribed text
 */

class QuestionClassifier {
    constructor() {
        // Question patterns for detection
        this.questionPatterns = {
            en: {
                interrogatives: /\b(who|what|where|when|why|how|which|whose|whom)\b/i,
                questionStarters: /^(can you|could you|would you|do you|have you|are you|will you|tell me|describe|explain|what's|what is|how do)/i,
                questionEnders: /\?$/
            },
            pt: {
                interrogatives: /\b(quem|que|qual|quais|onde|quando|porque|por que|como|quanto)\b/i,
                questionStarters: /^(você pode|poderia|me (conta|fale|diga)|como você|o que|qual é|fale sobre|descreva|explique)/i,
                questionEnders: /\?$/
            }
        };

        // Keywords for classification
        this.classificationKeywords = {
            hr: {
                en: ['yourself', 'strength', 'weakness', 'challenge', 'team', 'conflict', 'motivation', 'career', 'goal', 'achievement', 'failure', 'work style', 'culture', 'salary', 'expectations', 'why this company', 'leadership', 'collaboration'],
                pt: ['você', 'força', 'fraqueza', 'desafio', 'equipe', 'conflito', 'motivação', 'carreira', 'objetivo', 'conquista', 'fracasso', 'estilo de trabalho', 'cultura', 'salário', 'expectativa', 'por que essa empresa', 'liderança', 'colaboração']
            },
            technical: {
                en: ['algorithm', 'data structure', 'database', 'api', 'architecture', 'code', 'programming', 'deploy', 'testing', 'debug', 'performance', 'scalability', 'security', 'framework', 'design pattern', 'implement', 'system design', 'complexity', 'optimize'],
                pt: ['algoritmo', 'estrutura de dados', 'banco de dados', 'api', 'arquitetura', 'código', 'programação', 'deploy', 'teste', 'debug', 'performance', 'escalabilidade', 'segurança', 'framework', 'padrão de projeto', 'implementar', 'design de sistema', 'complexidade', 'otimizar']
            },
            behavioral: {
                en: ['tell me about a time', 'give me an example', 'situation', 'describe a scenario', 'how did you handle', 'what would you do', 'past experience', 'difficult situation'],
                pt: ['me conte sobre uma vez', 'dê um exemplo', 'situação', 'descreva um cenário', 'como você lidou', 'o que você faria', 'experiência passada', 'situação difícil']
            },
            smalltalk: {
                en: ['weather', 'weekend', 'how are you', 'nice to meet', 'thank you', 'bye', 'good morning', 'hello', 'how was'],
                pt: ['tempo', 'fim de semana', 'como vai', 'prazer', 'obrigado', 'tchau', 'bom dia', 'olá', 'como foi']
            }
        };

        // Minimum text length to consider
        this.minLength = 15;
    }

    /**
     * Check if text is a question
     * @param {string} text - Transcribed text
     * @returns {boolean}
     */
    isQuestion(text) {
        if (!text || text.length < this.minLength) return false;

        const lowerText = text.toLowerCase().trim();

        // Check for question mark
        if (this.questionPatterns.en.questionEnders.test(text)) return true;

        // Check for interrogative words
        if (this.questionPatterns.en.interrogatives.test(lowerText)) return true;
        if (this.questionPatterns.pt.interrogatives.test(lowerText)) return true;

        // Check for question starters
        if (this.questionPatterns.en.questionStarters.test(lowerText)) return true;
        if (this.questionPatterns.pt.questionStarters.test(lowerText)) return true;

        return false;
    }

    /**
     * Classify the type of question
     * @param {string} text - Transcribed text
     * @returns {'hr' | 'technical' | 'behavioral' | 'smalltalk' | 'unknown'}
     */
    classifyQuestion(text) {
        if (!text) return 'unknown';

        const lowerText = text.toLowerCase();
        const scores = { hr: 0, technical: 0, behavioral: 0, smalltalk: 0 };

        // Score each category
        for (const [category, keywords] of Object.entries(this.classificationKeywords)) {
            const allKeywords = [...keywords.en, ...keywords.pt];
            for (const keyword of allKeywords) {
                if (lowerText.includes(keyword.toLowerCase())) {
                    scores[category] += keyword.split(' ').length; // Multi-word phrases score higher
                }
            }
        }

        // Find highest score
        let maxCategory = 'unknown';
        let maxScore = 0;

        for (const [category, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                maxCategory = category;
            }
        }

        return maxCategory;
    }

    /**
     * Determine if a question should be processed
     * @param {string} text - Transcribed text
     * @param {string} mode - Current mode ('hr', 'technical', 'mixed')
     * @returns {boolean}
     */
    shouldProcess(text, mode = 'mixed') {
        if (!this.isQuestion(text)) return false;

        const classification = this.classifyQuestion(text);

        // Always skip small talk
        if (classification === 'smalltalk') return false;

        // Filter based on mode
        if (mode === 'hr') {
            return ['hr', 'behavioral'].includes(classification);
        }
        if (mode === 'technical') {
            return classification === 'technical';
        }

        // Mixed mode - process everything except smalltalk
        return classification !== 'unknown' || text.length > 50;
    }

    /**
     * Analyze text and return full analysis
     * @param {string} text - Transcribed text
     * @param {string} mode - Current mode
     * @returns {Object} Analysis result
     */
    analyze(text, mode = 'mixed') {
        const isQuestion = this.isQuestion(text);
        const classification = isQuestion ? this.classifyQuestion(text) : null;
        const shouldProcess = this.shouldProcess(text, mode);

        return {
            text,
            isQuestion,
            classification,
            shouldProcess,
            relevanceScore: this.calculateRelevance(text, classification)
        };
    }

    /**
     * Calculate relevance score (0-1)
     */
    calculateRelevance(text, classification) {
        if (!classification || classification === 'smalltalk') return 0;
        if (classification === 'unknown') return 0.3;

        let score = 0.5;

        // Longer questions tend to be more substantial
        if (text.length > 100) score += 0.2;
        if (text.length > 200) score += 0.1;

        // Behavioral questions are often important
        if (classification === 'behavioral') score += 0.2;

        return Math.min(score, 1);
    }
}

module.exports = QuestionClassifier;
