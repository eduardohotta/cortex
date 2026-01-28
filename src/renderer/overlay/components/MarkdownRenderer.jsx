import React from 'react';
import clsx from 'clsx';

/**
 * Enhanced Markdown Component that renders text with interactive word spans.
 * Strips markdown symbols while applying visual styles.
 */
export const MarkdownRenderer = ({ text, selection, handleMouseEnter, handleClick }) => {
    if (!text) return null;

    let wordCounter = 0;

    // Word wrapper for interactivity
    const wrapWords = (rawText, isBold, isItalic, baseKey) => {
        return rawText.split(/(\s+)/).map((word, i) => {
            if (!word.trim()) return <span key={`${baseKey}-${i}`}>{word}</span>;

            const currentIdx = wordCounter++;

            // Range check for selection (handles reverse drag too)
            const isSelected = selection?.isSelecting && (
                (currentIdx >= selection.start && currentIdx <= selection.end) ||
                (currentIdx >= selection.end && currentIdx <= selection.start)
            );

            return (
                <span
                    key={`${baseKey}-${i}`}
                    data-index={currentIdx}
                    onMouseEnter={handleMouseEnter}
                    onClick={handleClick}
                    className={clsx(
                        "transition-all duration-100 inline rounded-sm px-0.5 -mx-0.5 border border-transparent whitespace-pre-wrap",
                        "hover:text-blue-300 hover:bg-blue-500/10 cursor-text",
                        isBold && "font-bold text-blue-300",
                        isItalic && "italic text-purple-300",
                        isSelected && "bg-blue-500/30 text-white"
                    )}
                >
                    {word}
                </span>
            );
        });
    };

    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
        let content = line;
        let isHeader = false;
        let isListItem = false;
        let isBlockquote = false;
        let headerLevel = 0;

        // 1. Detect Blockquote
        if (content.trim().startsWith('>')) {
            isBlockquote = true;
            content = content.trim().replace(/^>\s*/, '');
        }

        // 2. Detect Headers
        const headerMatch = content.match(/^(#{1,6})\s+(.*)$/);
        if (headerMatch) {
            headerLevel = headerMatch[1].length;
            content = headerMatch[2];
            isHeader = true;
        }

        // 3. Horizontal Rule
        if (content.trim() === '---' || content.trim() === '***') {
            return <hr key={lineIdx} className="my-4 border-white/10" />;
        }

        // 4. List Items
        const listMatch = content.match(/^(\s*[-*+]|\s*\d+\.)\s+(.*)$/);
        if (listMatch) {
            content = listMatch[2];
            isListItem = true;
        }

        // 5. Nested Bold/Italic Parsing
        const parts = content.split(/(\*\*.*?\*\*|__.*?__|[*][^*].*?[*]|_.*?_)/g);

        return (
            <div key={lineIdx} className={clsx(
                "min-h-[1.5em] mb-1 clear-both",
                isHeader && `font-black text-white mt-4 border-b border-white/5 pb-1 ${headerLevel === 1 ? 'text-xl' : headerLevel === 2 ? 'text-lg' : 'text-md'}`,
                isListItem && "pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-blue-400 font-medium",
                isBlockquote && "pl-4 border-l-4 border-blue-500/30 text-white/70 italic bg-white/5 py-1 my-2 rounded-r"
            )}>
                {parts.map((part, pIdx) => {
                    const baseKey = `${lineIdx}-${pIdx}`;
                    // Bold
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return wrapWords(part.slice(2, -2), true, false, baseKey);
                    }
                    if (part.startsWith('__') && part.endsWith('__')) {
                        return wrapWords(part.slice(2, -2), true, false, baseKey);
                    }
                    // Italic
                    if (part.startsWith('*') && part.endsWith('*')) {
                        return wrapWords(part.slice(1, -1), false, true, baseKey);
                    }
                    if (part.startsWith('_') && part.endsWith('_')) {
                        return wrapWords(part.slice(1, -1), false, true, baseKey);
                    }
                    // Normal
                    return wrapWords(part, false, false, baseKey);
                })}
            </div>
        );
    });
};
