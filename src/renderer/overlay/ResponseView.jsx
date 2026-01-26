import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Copy, Check, Loader2, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

// Display update debounce for smooth 60fps rendering
const DISPLAY_UPDATE_MS = 0; // Immediate update - no debounce

export default function ResponseView() {
    // Display state (what user sees)
    const [displayResponse, setDisplayResponse] = useState('');
    const [status, setStatus] = useState('idle'); // 'idle' | 'processing' | 'streaming' | 'complete' | 'error'
    const [error, setError] = useState(null);
    const [timer, setTimer] = useState(0);
    const [copied, setCopied] = useState(false);

    // Refs for accumulation (no re-renders)
    const responseRef = useRef('');
    const scrollContainerRef = useRef(null);
    const bottomRef = useRef(null);
    const isUserScrollingRef = useRef(false);

    // Track if user is scrolling manually
    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        isUserScrollingRef.current = !isAtBottom;
    }, []);

    // Smart auto-scroll - only if user is at bottom
    const smartAutoScroll = useCallback(() => {
        if (!isUserScrollingRef.current && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'auto' }); // 'auto' is faster than 'smooth'
        }
    }, []);

    // LLM Events
    useEffect(() => {
        if (!window.electronAPI) return;

        const cleanup = [
            window.electronAPI.llm.onResponseStart(() => {
                // RULE: Only clear at new response start, not during streaming
                responseRef.current = '';
                setDisplayResponse('');
                setStatus('processing');
                setError(null);
                isUserScrollingRef.current = false;
            }),

            window.electronAPI.llm.onResponseChunk((chunk) => {
                // RULE: Never update with empty chunk
                if (!chunk) return;

                // RULE: Always concatenate (append-only)
                responseRef.current += chunk;

                // IMMEDIATE display update - no debounce
                setDisplayResponse(responseRef.current);
                setStatus('streaming');

                // Auto-scroll after update
                requestAnimationFrame(smartAutoScroll);
            }),

            window.electronAPI.llm.onResponseEnd(() => {
                // Final update to ensure all content is displayed
                setDisplayResponse(responseRef.current);
                setStatus('complete');
            }),

            window.electronAPI.llm.onError((msg) => {
                setError(msg);
                setStatus('error');
            })
        ];

        return () => {
            cleanup.forEach(fn => fn && fn());
        };
    }, [smartAutoScroll]);

    // Timer
    useEffect(() => {
        const interval = setInterval(() => setTimer(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const handleEndSession = () => {
        window.electronAPI?.app?.sendAction({ action: 'stop-all' });
    };

    const handleCopy = async () => {
        if (!responseRef.current) return;
        try {
            await navigator.clipboard.writeText(responseRef.current);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    };

    // Status indicator
    const StatusBadge = useMemo(() => {
        const statusConfig = {
            idle: { icon: Sparkles, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Pronto' },
            processing: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Processando', animate: true },
            streaming: { icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Respondendo', animate: true },
            complete: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Completo' },
            error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Erro' }
        };
        const config = statusConfig[status] || statusConfig.idle;
        const Icon = config.icon;

        return (
            <div className={clsx(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all duration-300",
                config.bg, config.color
            )}>
                <Icon size={10} className={config.animate ? 'animate-spin' : ''} />
                {config.label}
            </div>
        );
    }, [status]);

    // Render markdown-ish content
    const renderedContent = useMemo(() => {
        if (!displayResponse) return null;

        // Basic markdown parsing
        let html = displayResponse
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code class="bg-white/10 px-1 py-0.5 rounded text-purple-300 text-xs">$1</code>')
            .replace(/\n/g, '<br>');

        return <div dangerouslySetInnerHTML={{ __html: html }} />;
    }, [displayResponse]);

    return (
        <div className="h-full flex flex-col bg-transparent">
            {/* Header - flex-shrink-0 keeps it visible */}
            <div className="px-4 h-12 flex-shrink-0 flex items-center justify-between border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono font-bold text-gray-500">{formatTime(timer)}</span>
                    {StatusBadge}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleEndSession}
                        className="px-3 py-1 bg-red-600/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase rounded-md hover:bg-red-600/20 active:scale-95 transition-all"
                    >
                        Encerrar
                    </button>
                </div>
            </div>

            {/* Response Content */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar"
            >
                {error && (
                    <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                        <p className="text-[9px] font-black uppercase text-red-500 tracking-widest text-center">{error}</p>
                    </div>
                )}

                {!displayResponse && !error && status === 'idle' && (
                    <div className="h-full flex flex-col items-center justify-center text-white/5">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em]">Insights Engine Ready</p>
                    </div>
                )}

                {status === 'processing' && !displayResponse && (
                    <div className="h-full flex flex-col items-center justify-center gap-3">
                        <Loader2 size={24} className="text-blue-400 animate-spin" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">Processando...</p>
                    </div>
                )}

                {displayResponse && (
                    <div className="text-[13px] leading-relaxed text-white font-medium selection:bg-blue-600">
                        {renderedContent}
                        {status === 'streaming' && (
                            <span className="inline-block w-2 h-4 bg-purple-400 ml-1 animate-pulse rounded-sm" />
                        )}
                    </div>
                )}

                <div ref={bottomRef} className="h-8" />
            </div>

            {/* Footer - flex-shrink-0 keeps it visible */}
            {displayResponse && (
                <div className="flex-shrink-0 p-3 border-t border-white/10 bg-black/40 flex justify-end">
                    <button
                        onClick={handleCopy}
                        className={clsx(
                            "flex items-center gap-1.5 px-3 py-1.5 border text-[9px] font-black uppercase rounded-md transition-all",
                            copied
                                ? "bg-green-500/20 border-green-500/30 text-green-400"
                                : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                        )}
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                </div>
            )}
        </div>
    );
}

