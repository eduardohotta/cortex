import React, { useMemo } from 'react';
import clsx from 'clsx';

export const MarkdownRenderer = ({ text, selection, handleMouseEnter, handleClick }) => {
    const parsed = useMemo(() => {
        if (!text) return [];

        const lines = text.split('\n');

        const out = [];
        let inCodeBlock = false;
        let codeBuffer = [];

        const pushCodeBlock = (keyBase) => {
            const codeText = codeBuffer.join('\n');
            out.push({
                type: 'codeblock',
                key: `${keyBase}-codeblock-${out.length}`,
                code: codeText
            });
            codeBuffer = [];
        };

        const parseInline = (s) => {
            const re = /(`[^`]+`|\*\*[^*]+?\*\*|__[^_]+?__|\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)/g;
            const parts = [];
            let lastIndex = 0;

            for (const match of s.matchAll(re)) {
                const token = match[0];
                const idx = match.index ?? 0;
                if (idx > lastIndex) parts.push({ t: 'text', v: s.slice(lastIndex, idx) });

                if (token.startsWith('`') && token.endsWith('`')) parts.push({ t: 'code', v: token.slice(1, -1) });
                else if (token.startsWith('**') && token.endsWith('**')) parts.push({ t: 'strong', v: token.slice(2, -2) });
                else if (token.startsWith('__') && token.endsWith('__')) parts.push({ t: 'strong', v: token.slice(2, -2) });
                else if (token.startsWith('*') && token.endsWith('*')) parts.push({ t: 'em', v: token.slice(1, -1) });
                else if (token.startsWith('_') && token.endsWith('_')) parts.push({ t: 'em', v: token.slice(1, -1) });
                else parts.push({ t: 'text', v: token });

                lastIndex = idx + token.length;
            }

            if (lastIndex < s.length) parts.push({ t: 'text', v: s.slice(lastIndex) });
            return parts;
        };

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];

            const trimmed = raw.trim();
            const fence = trimmed.startsWith('```');
            if (fence) {
                if (inCodeBlock) {
                    pushCodeBlock(i);
                    inCodeBlock = false;
                } else {
                    inCodeBlock = true;
                    codeBuffer = [];
                }
                continue;
            }

            if (inCodeBlock) {
                codeBuffer.push(raw);
                continue;
            }

            if (trimmed === '---' || trimmed === '***') {
                out.push({ type: 'hr', key: `hr-${i}` });
                continue;
            }

            let content = raw;
            let isBlockquote = false;
            let isHeader = false;
            let headerLevel = 0;
            let isListItem = false;
            let listMarker = null;

            if (content.trim().startsWith('>')) {
                isBlockquote = true;
                content = content.trim().replace(/^>\s*/, '');
            }

            const headerMatch = content.match(/^(#{1,6})\s+(.*)$/);
            if (headerMatch) {
                headerLevel = headerMatch[1].length;
                content = headerMatch[2];
                isHeader = true;
            }

            const listMatch = content.match(/^(\s*)([-*+])\s+(.*)$/);
            const orderedMatch = content.match(/^(\s*)(\d+)\.\s+(.*)$/);

            if (orderedMatch) {
                isListItem = true;
                listMarker = `${orderedMatch[2]}.`;
                content = orderedMatch[3];
            } else if (listMatch) {
                isListItem = true;
                listMarker = '•';
                content = listMatch[3];
            }

            out.push({
                type: 'line',
                key: `line-${i}`,
                isHeader,
                headerLevel,
                isListItem,
                listMarker,
                isBlockquote,
                parts: parseInline(content)
            });
        }

        if (inCodeBlock) pushCodeBlock('eof');
        return out;
    }, [text]);

    const selectionRange = useMemo(() => {
        const start = selection?.start;
        const end = selection?.end;
        if (start == null || end == null) return null;
        return { min: Math.min(start, end), max: Math.max(start, end) };
    }, [selection?.start, selection?.end]);

    let wordCounter = 0;

    const wrapWords = (rawText, opts, baseKey) => {
        const { isBold, isItalic } = opts;

        return rawText.split(/(\s+)/).map((chunk, i) => {
            if (!chunk.trim()) return <span key={`${baseKey}-ws-${i}`}>{chunk}</span>;

            const currentIdx = wordCounter++;
            const isSelected = selectionRange && currentIdx >= selectionRange.min && currentIdx <= selectionRange.max;

            return (
                <span
                    key={`${baseKey}-w-${i}`}
                    data-index={currentIdx}
                    onMouseEnter={handleMouseEnter}
                    onClick={handleClick}
                    className={clsx(
                        "transition-all duration-100 inline rounded-sm px-0.5 -mx-0.5 border border-transparent",
                        "hover:text-blue-300 hover:bg-blue-500/10 cursor-default",
                        isBold && "font-bold text-blue-300",
                        isItalic && "italic text-purple-300",
                        isSelected && "bg-blue-500/30 text-white"
                    )}
                >
                    {chunk}
                </span>
            );
        });
    };

    if (!text) return null;

    return (
        <>
            {parsed.map((node) => {
                if (node.type === 'hr') return <hr key={node.key} className="my-4 border-white/10" />;

                if (node.type === 'codeblock') {
                    return (
                        <pre key={node.key} className="my-3">
                            <code>{node.code}</code>
                        </pre>
                    );
                }

                const headerClass =
                    node.isHeader
                        ? `font-black text-white mt-4 border-b border-white/5 pb-1 ${node.headerLevel === 1 ? 'text-xl' : node.headerLevel === 2 ? 'text-lg' : 'text-md'
                        }`
                        : '';

                return (
                    <div
                        key={node.key}
                        className={clsx(
                            "min-h-[1.5em] mb-1 clear-both",
                            headerClass,
                            node.isListItem && "pl-6 relative font-medium",
                            node.isBlockquote && "pl-4 border-l-4 border-blue-500/30 text-white/70 italic bg-white/5 py-1 my-2 rounded-r"
                        )}
                    >
                        {node.isListItem && (
                            <span className="absolute left-0 text-blue-400 font-black">
                                {node.listMarker}
                            </span>
                        )}

                        {node.parts.map((part, pIdx) => {
                            const baseKey = `${node.key}-${pIdx}`;

                            if (part.t === 'code') {
                                return (
                                    <code key={`${baseKey}-code`} className="mx-0.5">
                                        {part.v}
                                    </code>
                                );
                            }

                            if (part.t === 'strong') return <React.Fragment key={baseKey}>{wrapWords(part.v, { isBold: true, isItalic: false }, baseKey)}</React.Fragment>;
                            if (part.t === 'em') return <React.Fragment key={baseKey}>{wrapWords(part.v, { isBold: false, isItalic: true }, baseKey)}</React.Fragment>;

                            return <React.Fragment key={baseKey}>{wrapWords(part.v, { isBold: false, isItalic: false }, baseKey)}</React.Fragment>;
                        })}
                    </div>
                );
            })}
        </>
    );
};
