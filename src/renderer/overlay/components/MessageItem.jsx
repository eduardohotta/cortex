import React, { useState, useRef } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import clsx from 'clsx';

export const MessageItem = React.memo(({ message, onWordClick, hotkey }) => {
    const [selection, setSelection] = useState({ start: null, end: null, isSelecting: false });
    const containerRef = useRef(null);

    const getWordIndex = (target) => {
        return target.dataset.index || null;
    };

    const handleMouseDown = (e) => {
        if (e.altKey && e.button === 0) {
            const idx = getWordIndex(e.target);
            if (idx) {
                e.preventDefault();
                setSelection({ start: idx, end: idx, isSelecting: true });
            }
        }
    };

    const handleMouseEnter = (e) => {
        if (selection.isSelecting) {
            const idx = getWordIndex(e.target);
            if (idx) {
                setSelection(prev => ({ ...prev, end: idx }));
            }
        }
    };

    const handleMouseUp = (e) => {
        if (selection.isSelecting) {
            setSelection({ start: null, end: null, isSelecting: false });
        }
    };

    const handleClick = (e) => {
        if (selection.isSelecting) return;
        const idx = getWordIndex(e.target);
        if (idx) {
            const word = e.target.innerText;
            if (word.trim()) {
                const modifier = hotkey || 'ctrl';
                const isTriggered =
                    (modifier === 'ctrl' && e.ctrlKey) ||
                    (modifier === 'alt' && e.altKey) ||
                    (modifier === 'shift' && e.shiftKey) ||
                    (modifier === 'meta' && e.metaKey);

                if (isTriggered) {
                    e.preventDefault();
                    e.stopPropagation();
                    onWordClick(word.trim(), e, false);
                }
            }
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 mb-6 w-full">
            {/* Title / Separator */}
            <div className="flex items-center gap-3 mb-2 opacity-50 select-none">
                <div className="h-px bg-white/20 flex-1" />
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                    {message.title || 'Insight'} • {new Date(message.timestamp).toLocaleTimeString()}
                </span>
                <div className="h-px bg-white/20 flex-1" />
            </div>

            {/* Content Area */}
            <div
                ref={containerRef}
                className="text-[14px] leading-relaxed text-gray-100 font-medium whitespace-pre-wrap break-words markdown-body"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
            >
                <MarkdownRenderer
                    text={message.text}
                    selection={selection}
                    handleMouseEnter={handleMouseEnter}
                    handleClick={handleClick}
                />

                {message.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-purple-400 ml-1 animate-pulse rounded-sm align-middle" />
                )}
            </div>
        </div>
    );
});
