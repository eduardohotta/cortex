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
    const [config, setConfig] = useState({});

    const { state } = useApp();

    const currentAssistantName = useMemo(() => {
        return state.assistants.find(a => a.id === state.currentAssistantId)?.name || 'Assistant';
    }, [state.assistants, state.currentAssistantId]);

    const historyRef = useRef([]);
    const configRef = useRef(config);
    const assistantNameRef = useRef(currentAssistantName);
    const nextTitleRef = useRef(null);

    const scrollContainerRef = useRef(null);
    const bottomRef = useRef(null);
    const isUserScrollingRef = useRef(false);

    const rafFlushRef = useRef(null);
    const copyTimeoutRef = useRef(null);

    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { assistantNameRef.current = currentAssistantName; }, [currentAssistantName]);

    const makeId = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    const scheduleFlushHistory = useCallback(() => {
        if (rafFlushRef.current) return;
        rafFlushRef.current = requestAnimationFrame(() => {
            rafFlushRef.current = null;
            setHistory([...historyRef.current]);
        });
    }, []);

    const handleScroll = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
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

        window.electronAPI.settings.getAll().then(all => {
            setConfig(all || {});
            setHotkeyExplain(all?.hotkeyExplain || 'ctrl');
        });

        const cleanup = window.electronAPI.settings.onSettingsChanged(({ key, value }) => {
            setConfig(prev => ({ ...prev, [key]: value }));
            if (key === 'hotkeyExplain') setHotkeyExplain(value || 'ctrl');
        });

        return cleanup;
    }, []);

    useEffect(() => {
        if (!window.electronAPI) return;

        const unsubStart = window.electronAPI.llm.onResponseStart(() => {
            const cfg = configRef.current || {};
            const assistantName = assistantNameRef.current;

            const titleOverride = nextTitleRef.current;
            nextTitleRef.current = null;

            const title = titleOverride || assistantName || cfg.mainResponseTitle || 'Insight';

            const newEntry = {
                id: makeId(),
                title,
                text: '',
                timestamp: Date.now(),
                isStreaming: true
            };

            historyRef.current = [...historyRef.current, newEntry];
            scheduleFlushHistory();

            setStatus('processing');
            setError(null);
            isUserScrollingRef.current = false;
            requestAnimationFrame(smartAutoScroll);
        });

        const unsubChunk = window.electronAPI.llm.onResponseChunk((chunk) => {
            if (!chunk) return;
            const cur = historyRef.current;
            if (!cur.length) return;

            const lastIndex = cur.length - 1;
            const last = cur[lastIndex];
            const updated = {
                ...last,
                text: (last.text || '') + chunk,
                isStreaming: true
            };

            const next = cur.slice();
            next[lastIndex] = updated;

            historyRef.current = next;
            scheduleFlushHistory();

            setStatus('streaming');
            requestAnimationFrame(smartAutoScroll);
        });

        const unsubEnd = window.electronAPI.llm.onResponseEnd(() => {
            const cur = historyRef.current.slice();
            if (cur.length) {
                const lastIndex = cur.length - 1;
                const last = cur[lastIndex];

                if (!last.text || !last.text.trim()) {
                    cur.pop();
                } else {
                    cur[lastIndex] = { ...last, isStreaming: false };
                }

                historyRef.current = cur;
                scheduleFlushHistory();
            }

            setStatus('complete');
        });

        const unsubError = window.electronAPI.llm.onError((msg) => {
            setError(msg || 'Erro');
            setStatus('error');

            const cur = historyRef.current.slice();
            if (cur.length) {
                const lastIndex = cur.length - 1;
                cur[lastIndex] = { ...cur[lastIndex], isStreaming: false };
                historyRef.current = cur;
                scheduleFlushHistory();
            }
        });

        return () => {
            unsubStart && unsubStart();
            unsubChunk && unsubChunk();
            unsubEnd && unsubEnd();
            unsubError && unsubError();
            if (rafFlushRef.current) cancelAnimationFrame(rafFlushRef.current);
            rafFlushRef.current = null;
        };
    }, [scheduleFlushHistory, smartAutoScroll]);

    useEffect(() => {
        const interval = setInterval(() => setTimer(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
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
        const cur = historyRef.current;
        if (!cur.length) return;

        const lastText = cur[cur.length - 1]?.text || '';
        if (!lastText.trim()) return;

        try {
            await navigator.clipboard.writeText(lastText);
            setCopied(true);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    };

    const handleWordClick = useCallback(async (phrase, e, isPhrase) => {
        const cfg = configRef.current || {};

        const titlePrefix = isPhrase
            ? (cfg.phraseAnalysisTitle || 'Análise')
            : (cfg.wordDefinitionTitle || 'Definição');

        const template = isPhrase
            ? (cfg.phraseAnalysisPrompt || 'Explique brevemente a frase/conceito: "{phrase}". Contexto: Entrevista Técnica.')
            : (cfg.wordDefinitionPrompt || 'Defina o termo técnico: "{phrase}". Seja conciso.');

        const prompt = template.replace('{phrase}', phrase);

        nextTitleRef.current = isPhrase ? titlePrefix : `${titlePrefix}: ${phrase}`;

        setStatus('processing');
        setError(null);
        isUserScrollingRef.current = false;

        try {
            await window.electronAPI.llm.generate(prompt);
        } catch (err) {
            console.error('Secondary generate failed:', err);
            setError(cfg.labelError || 'Erro');
            setStatus('error');
        }
    }, []);

    const StatusBadge = useMemo(() => {
        const statusConfig = {
            idle: { icon: Sparkles, color: 'text-gray-500', bg: 'bg-gray-500/10', label: config.labelReady || 'Pronto' },
            processing: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', label: config.labelProcessing || 'Processando', animate: true },
            streaming: { icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/20', label: config.labelStreaming || 'Respondendo', animate: true },
            complete: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: config.labelComplete || 'Completo' },
            error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: config.labelError || 'Erro' }
        };

        const active = statusConfig[status] || statusConfig.idle;
        const Icon = active.icon;

        return (
            <div className={clsx(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all duration-300",
                active.bg,
                active.color
            )}>
                <Icon size={10} className={active.animate ? 'animate-spin' : ''} />
                {active.label}
            </div>
        );
    }, [status, config]);

    return (
        <div className="h-full flex flex-col bg-transparent">
            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
      `}</style>

            <div className="px-4 h-12 flex-shrink-0 flex items-center justify-between border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono font-bold text-gray-500">{formatTime(timer)}</span>
                    {StatusBadge}
                </div>
                <div className="flex items-center gap-2">
                    {(status === 'processing' || status === 'streaming') && (
                        <button
                            onClick={handleStop}
                            className="px-3 py-1 bg-red-500 text-white text-[9px] font-black uppercase rounded-md hover:bg-red-600 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                            <Square size={8} fill="currentColor" /> {config.labelStop || 'Parar'}
                        </button>
                    )}
                    <button
                        onClick={handleEndSession}
                        className="px-3 py-1 bg-red-600/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase rounded-md hover:bg-red-600/20 active:scale-95 transition-all"
                    >
                        {config.labelEnd || 'Encerrar'}
                    </button>
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto px-5 py-4 custom-scrollbar"
            >
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
                            {config.labelTipsPrefix
                                ? config.labelTipsPrefix.replace('{hotkey}', hotkeyExplain.toUpperCase())
                                : `Dica: Hover + ${hotkeyExplain.toUpperCase()} para highlights. Alt + Drag para seleção.`}
                        </p>
                    </div>
                )}

                {status === 'processing' && history.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center gap-3">
                        <Loader2 size={24} className="text-blue-400 animate-spin" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">
                            {config.labelProcessing || 'Processando'}...
                        </p>
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

            {history.length > 0 && (
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
                        {copied ? (config.labelCopied || 'Copiado!') : (config.labelCopy || 'Copiar Último')}
                    </button>
                </div>
            )}
        </div>
    );
}
