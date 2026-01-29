import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Loader2, Sparkles, AlertCircle, CheckCircle, Square, BookOpen, Trash2 } from 'lucide-react';
import { MessageItem } from './components/MessageItem';
import clsx from 'clsx';
import './markdown.css';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) { return { hasError: true }; }
    componentDidCatch(error, errorInfo) { console.error('ResponseView Error:', error, errorInfo); }
    render() {
        if (this.state.hasError) return <div className="p-4 text-red-500 text-xs font-bold bg-red-500/10 rounded-lg">Erro ao renderizar conteúdo.</div>;
        return this.props.children;
    }
}

export default function ResponseView() {
    const [history, setHistory] = useState([]);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [timer, setTimer] = useState(0);
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
    const isUserScrollingRef = useRef(false);

    const rafFlushRef = useRef(null);

    const isPointerDownRef = useRef(false);
    const pauseRenderRef = useRef(false);

    const activeMessageIdRef = useRef(null);

    const lastStartAtRef = useRef(0);
    const lastEndAtRef = useRef(0);
    const lastChunkAtRef = useRef(0);
    const lastChunkValueRef = useRef('');

    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { assistantNameRef.current = currentAssistantName; }, [currentAssistantName]);

    const makeId = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    const scheduleFlushHistory = useCallback(() => {
        if (pauseRenderRef.current) return;
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
        const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) <= 2;
        isUserScrollingRef.current = !isAtBottom;
    }, []);

    const smartAutoScroll = useCallback(() => {
        if (isPointerDownRef.current) return;
        if (isUserScrollingRef.current) return;

        const el = scrollContainerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, []);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        const releasePointerMode = () => {
            isPointerDownRef.current = false;
            pauseRenderRef.current = false;
            requestAnimationFrame(() => {
                handleScroll();
                scheduleFlushHistory();
            });
        };

        const onPointerDown = () => {
            isPointerDownRef.current = true;
            pauseRenderRef.current = true;
            isUserScrollingRef.current = true;
        };

        el.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointerup', releasePointerMode);
        window.addEventListener('pointercancel', releasePointerMode);
        window.addEventListener('blur', releasePointerMode);

        return () => {
            el.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointerup', releasePointerMode);
            window.removeEventListener('pointercancel', releasePointerMode);
            window.removeEventListener('blur', releasePointerMode);
        };
    }, [handleScroll, scheduleFlushHistory]);

    const createNewEntry = useCallback((title) => {
        const newEntry = {
            id: makeId(),
            title,
            text: '',
            timestamp: Date.now(),
            isStreaming: true
        };

        historyRef.current = [...historyRef.current, newEntry];
        activeMessageIdRef.current = newEntry.id;
        scheduleFlushHistory();

        return newEntry;
    }, [scheduleFlushHistory]);

    const ensureActiveEntry = useCallback(() => {
        const cur = historyRef.current;
        const activeId = activeMessageIdRef.current;

        if (activeId && cur.some(m => m.id === activeId)) return activeId;

        const cfg = configRef.current || {};
        const assistantName = assistantNameRef.current;

        const titleOverride = nextTitleRef.current;
        nextTitleRef.current = null;

        const title = titleOverride || assistantName || cfg.mainResponseTitle || 'Insight';
        const entry = createNewEntry(title);
        return entry.id;
    }, [createNewEntry]);

    const updateActiveEntry = useCallback((patchFn) => {
        const cur = historyRef.current.slice();
        const activeId = ensureActiveEntry();
        const idx = cur.findIndex(m => m.id === activeId);
        if (idx === -1) return;

        cur[idx] = patchFn(cur[idx]);
        historyRef.current = cur;
        scheduleFlushHistory();
    }, [ensureActiveEntry, scheduleFlushHistory]);

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

        const isDuplicateStart = () => {
            const now = Date.now();
            if (now - lastStartAtRef.current < 60) return true;
            lastStartAtRef.current = now;
            return false;
        };

        const isDuplicateEnd = () => {
            const now = Date.now();
            if (now - lastEndAtRef.current < 60) return true;
            lastEndAtRef.current = now;
            return false;
        };

        const isDuplicateChunk = (chunk) => {
            const now = Date.now();
            if (chunk === lastChunkValueRef.current && now - lastChunkAtRef.current < 15) return true;
            lastChunkValueRef.current = chunk;
            lastChunkAtRef.current = now;
            return false;
        };

        const unsubStart = window.electronAPI.llm.onResponseStart(() => {
            if (isDuplicateStart()) return;

            const cfg = configRef.current || {};
            const assistantName = assistantNameRef.current;

            const titleOverride = nextTitleRef.current;
            nextTitleRef.current = null;

            const title = titleOverride || assistantName || cfg.mainResponseTitle || 'Insight';
            createNewEntry(title);

            setStatus('processing');
            setError(null);

            if (!isPointerDownRef.current) {
                isUserScrollingRef.current = false;
            }

            requestAnimationFrame(smartAutoScroll);
        });

        const unsubChunk = window.electronAPI.llm.onResponseChunk((chunk) => {
            if (!chunk) return;
            if (isDuplicateChunk(chunk)) return;

            updateActiveEntry((msg) => ({
                ...msg,
                text: (msg.text || '') + chunk,
                isStreaming: true
            }));

            setStatus('streaming');
            requestAnimationFrame(smartAutoScroll);
        });

        const unsubEnd = window.electronAPI.llm.onResponseEnd(() => {
            if (isDuplicateEnd()) return;

            const cfg = configRef.current || {};
            const cur = historyRef.current.slice();
            const activeId = activeMessageIdRef.current;

            if (activeId) {
                const idx = cur.findIndex(m => m.id === activeId);
                if (idx !== -1) {
                    const last = cur[idx];
                    const text = (last.text || '').trim();

                    cur[idx] = {
                        ...last,
                        text: text ? last.text : (cfg.labelEmptyResponse || '(sem resposta)'),
                        isStreaming: false
                    };
                }
            }

            historyRef.current = cur;
            activeMessageIdRef.current = null;
            scheduleFlushHistory();

            setStatus('complete');
            requestAnimationFrame(smartAutoScroll);
        });

        const unsubError = window.electronAPI.llm.onError((msg) => {
            setError(msg || 'Erro');
            setStatus('error');

            updateActiveEntry((m) => ({
                ...m,
                text: (m.text || '').trim() ? m.text : ((configRef.current?.labelError) || 'Erro'),
                isStreaming: false
            }));

            activeMessageIdRef.current = null;
        });

        return () => {
            unsubStart && unsubStart();
            unsubChunk && unsubChunk();
            unsubEnd && unsubEnd();
            unsubError && unsubError();
            if (rafFlushRef.current) cancelAnimationFrame(rafFlushRef.current);
            rafFlushRef.current = null;
        };
    }, [createNewEntry, updateActiveEntry, scheduleFlushHistory, smartAutoScroll]);

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

    const handleClean = () => {
        historyRef.current = [];
        activeMessageIdRef.current = null;
        lastChunkValueRef.current = '';
        lastChunkAtRef.current = 0;
        setHistory([]);
        setError(null);
        setStatus('idle');
    };

    const handleWordClick = useCallback(async (phrase, e, isPhrase) => {
        const cfg = configRef.current || {};

        if (status === 'processing' || status === 'streaming') return;

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

        if (!isPointerDownRef.current) {
            isUserScrollingRef.current = false;
        }

        try {
            await window.electronAPI.llm.generate(prompt);
        } catch (err) {
            console.error('Secondary generate failed:', err);
            setError(cfg.labelError || 'Erro');
            setStatus('error');
            activeMessageIdRef.current = null;
        }
    }, [status]);

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
                        <ErrorBoundary key={msg.id}>
                            <MessageItem
                                message={msg}
                                onWordClick={handleWordClick}
                                hotkey={hotkeyExplain}
                            />
                        </ErrorBoundary>
                    ))}
                </div>

                <div className="h-2" />
            </div>

            {history.length > 0 && (
                <div className="flex-shrink-0 p-3 border-t border-white/10 bg-black/40 flex justify-end">
                    <button
                        onClick={handleClean}
                        className={clsx(
                            "flex items-center gap-1.5 px-3 py-1.5 border text-[9px] font-black uppercase rounded-md transition-all",
                            "bg-white/5 border-white/10 text-white hover:bg-white/10"
                        )}
                    >
                        <Trash2 size={12} /> {config.labelClean || 'Clean'}
                    </button>
                </div>
            )}
        </div>
    );
}
