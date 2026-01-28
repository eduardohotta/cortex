import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Copy, Check, Loader2, Sparkles, AlertCircle, CheckCircle, Square, BookOpen } from 'lucide-react';
import { MessageItem } from './components/MessageItem';
import clsx from 'clsx';
import './markdown.css';

export default function ResponseView() {
    const [history, setHistory] = useState([]);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [timer, setTimer] = useState(0);
    const [copied, setCopied] = useState(false);
    const [hotkeyExplain, setHotkeyExplain] = useState('ctrl');

    const historyRef = useRef([]);
    const scrollContainerRef = useRef(null);
    const bottomRef = useRef(null);
    const isUserScrollingRef = useRef(false);

    // Load settings
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.settings.get('hotkeyExplain').then(k => setHotkeyExplain(k || 'ctrl'));
            const cleanup = window.electronAPI.settings.onSettingsChanged(({ key, value }) => {
                if (key === 'hotkeyExplain') setHotkeyExplain(value);
            });
            return cleanup;
        }
    }, []);

    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        isUserScrollingRef.current = !isAtBottom;
    }, []);

    const smartAutoScroll = useCallback(() => {
        if (!isUserScrollingRef.current && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, []);

    useEffect(() => {
        if (!window.electronAPI) return;

        const cleanup = [
            window.electronAPI.llm.onResponseStart(() => {
                const newEntry = {
                    id: Date.now(),
                    title: 'Insight',
                    text: '',
                    timestamp: Date.now(),
                    isStreaming: true
                };
                historyRef.current = [...historyRef.current, newEntry];
                setHistory(historyRef.current);

                setStatus('processing');
                setError(null);
                isUserScrollingRef.current = false;
            }),

            window.electronAPI.llm.onResponseChunk((chunk) => {
                if (!chunk) return;
                const currentHistory = [...historyRef.current];
                if (currentHistory.length > 0) {
                    const lastIndex = currentHistory.length - 1;
                    currentHistory[lastIndex] = {
                        ...currentHistory[lastIndex],
                        text: currentHistory[lastIndex].text + chunk,
                        isStreaming: true
                    };
                    historyRef.current = currentHistory;
                    setHistory(currentHistory);
                    setStatus('streaming');
                    requestAnimationFrame(smartAutoScroll);
                }
            }),

            window.electronAPI.llm.onResponseEnd(() => {
                let currentHistory = [...historyRef.current];
                if (currentHistory.length > 0) {
                    const lastIndex = currentHistory.length - 1;

                    // Filter empty messages
                    if (!currentHistory[lastIndex].text || !currentHistory[lastIndex].text.trim()) {
                        currentHistory.pop();
                    } else {
                        currentHistory[lastIndex] = {
                            ...currentHistory[lastIndex],
                            isStreaming: false
                        };
                    }

                    historyRef.current = currentHistory;
                    setHistory(currentHistory);
                }
                setStatus('complete');
            }),

            window.electronAPI.llm.onError((msg) => {
                setError(msg);
                setStatus('error');
                const currentHistory = [...historyRef.current];
                if (currentHistory.length > 0) {
                    const lastIndex = currentHistory.length - 1;
                    currentHistory[lastIndex].isStreaming = false;
                    historyRef.current = currentHistory;
                    setHistory(currentHistory);
                }
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

    const handleStop = () => {
        window.electronAPI?.llm?.stopGeneration();
    };

    const handleCopy = async () => {
        if (history.length === 0) return;
        const lastText = history[history.length - 1].text;
        try {
            await navigator.clipboard.writeText(lastText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    };

    const handleWordClick = useCallback(async (phrase, e, isPhrase) => {
        // Clear previous state for a new request
        setStatus('processing');

        // Create a new history entry for the definition
        const definitionEntry = {
            id: Date.now(),
            title: isPhrase ? 'Analysis' : `Definição: ${phrase}`,
            text: '', // Start empty for streaming
            timestamp: Date.now(),
            isStreaming: true
        };

        historyRef.current = [...historyRef.current, definitionEntry];
        setHistory(historyRef.current);
        requestAnimationFrame(smartAutoScroll);

        try {
            const prompt = isPhrase
                ? `Explique brevemente a frase/conceito: "${phrase}". Contexto: Entrevista Técnica.`
                : `Defina o termo técnico: "${phrase}". Seja conciso.`;

            // llm:generate now broadcasts chunks via IPC
            const result = await window.electronAPI.llm.generate(prompt);

            // Final sync after generation completes
            const currentHistory = [...historyRef.current];
            const entryIndex = currentHistory.findIndex(entry => entry.id === definitionEntry.id);
            if (entryIndex !== -1) {
                currentHistory[entryIndex] = {
                    ...currentHistory[entryIndex],
                    text: result || currentHistory[entryIndex].text,
                    isStreaming: false
                };
                historyRef.current = currentHistory;
                setHistory(currentHistory);
            }
        } catch (err) {
            console.error('Secondary generate failed:', err);
            const currentHistory = [...historyRef.current];
            const entryIndex = currentHistory.findIndex(entry => entry.id === definitionEntry.id);
            if (entryIndex !== -1) {
                currentHistory[entryIndex] = {
                    ...currentHistory[entryIndex],
                    text: "Erro ao buscar definição.",
                    isStreaming: false
                };
                historyRef.current = currentHistory;
                setHistory(currentHistory);
            }
        } finally {
            setStatus('complete');
        }
    }, [smartAutoScroll]);

    // Status Badge (Memoized)
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
            <div className={clsx("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all duration-300", config.bg, config.color)}>
                <Icon size={10} className={config.animate ? 'animate-spin' : ''} />
                {config.label}
            </div>
        );
    }, [status]);

    return (
        <div className="h-full flex flex-col bg-transparent">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
            `}</style>

            {/* Header */}
            <div className="px-4 h-12 flex-shrink-0 flex items-center justify-between border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono font-bold text-gray-500">{formatTime(timer)}</span>
                    {StatusBadge}
                </div>
                <div className="flex items-center gap-2">
                    {(status === 'processing' || status === 'streaming') && (
                        <button onClick={handleStop} className="px-3 py-1 bg-red-500 text-white text-[9px] font-black uppercase rounded-md hover:bg-red-600 active:scale-95 transition-all flex items-center gap-1.5">
                            <Square size={8} fill="currentColor" /> Parar
                        </button>
                    )}
                    <button onClick={handleEndSession} className="px-3 py-1 bg-red-600/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase rounded-md hover:bg-red-600/20 active:scale-95 transition-all">
                        Encerrar
                    </button>
                </div>
            </div>

            {/* Content Area - Fixed Flex for Scrolling */}
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 custom-scrollbar">
                {error && (
                    <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                        <p className="text-[9px] font-black uppercase text-red-500 tracking-widest text-center">{error}</p>
                    </div>
                )}

                {history.length === 0 && !error && status === 'idle' && (
                    <div className="h-full flex flex-col items-center justify-center text-white/5 gap-2">
                        <BookOpen size={24} className="opacity-50" />
                        <p className="text-[9px] font-black uppercase tracking-[0.3em]">Insights Engine Ready</p>
                        <p className="text-[8px] text-gray-600 text-center max-w-[200px]">
                            Dica: Hover + {hotkeyExplain.toUpperCase()} para highlights. Alt + Drag para seleção.
                        </p>
                    </div>
                )}

                {status === 'processing' && history.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center gap-3">
                        <Loader2 size={24} className="text-blue-400 animate-spin" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">Processando...</p>
                    </div>
                )}

                <div className="flex flex-col gap-1 pb-4">
                    {history.map((msg) => (
                        <MessageItem
                            key={msg.id}
                            message={msg}
                            onWordClick={handleWordClick}
                            hotkey={hotkeyExplain}
                        />
                    ))}
                </div>
                <div ref={bottomRef} className="h-2" />
            </div>

            {/* Footer */}
            {history.length > 0 && (
                <div className="flex-shrink-0 p-3 border-t border-white/10 bg-black/40 flex justify-end">
                    <button onClick={handleCopy} className={clsx("flex items-center gap-1.5 px-3 py-1.5 border text-[9px] font-black uppercase rounded-md transition-all", copied ? "bg-green-500/20 border-green-500/30 text-green-400" : "bg-white/5 border-white/10 text-white hover:bg-white/10")}>
                        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copiado!' : 'Copiar Último'}
                    </button>
                </div>
            )}
        </div>
    );
}
