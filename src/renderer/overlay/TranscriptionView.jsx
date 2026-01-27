import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { Languages, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const LANGUAGES = [
    { id: 'auto', name: 'Auto-detect' },
    { id: 'pt', name: 'Português' },
    { id: 'en', name: 'English' },
    { id: 'es', name: 'Español' },
];

// Silence debounce configuration
const SILENCE_DEBOUNCE_MS = 300;

export default function TranscriptionView() {
    const { state } = useApp();

    // Transcript state - completely separated
    const [history, setHistory] = useState([]);
    const [interim, setInterim] = useState('');
    const [status, setStatus] = useState('idle'); // 'idle' | 'listening' | 'silence'

    // UI state
    const [selectedLang, setSelectedLang] = useState('auto');
    const [hotkey, setHotkey] = useState('Ctrl+D');
    const [showLangMenu, setShowLangMenu] = useState(false);

    // Refs for stability
    const scrollContainerRef = useRef(null);
    const bottomRef = useRef(null);
    const isUserScrollingRef = useRef(false);
    const silenceTimeoutRef = useRef(null);
    const lastTextRef = useRef('');

    // Load settings
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.settings.getAll().then(s => {
                if (s?.language) setSelectedLang(s.language);
                if (s?.hotkeyAsk) setHotkey(s.hotkeyAsk);
            });
        }
    }, []);

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
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, []);

    const handleLanguageChange = async (langId) => {
        setSelectedLang(langId);
        setShowLangMenu(false);
        if (window.electronAPI) {
            await window.electronAPI.settings.set('language', langId);
        }
    };

    // Process transcript updates with validation and debounce
    useEffect(() => {
        if (!state.lastTranscript) return;

        const { text, isFinal } = state.lastTranscript;

        // RULE: Never update UI with empty string
        if (!text || !text.trim()) {
            // Start silence timeout if not already running
            if (!silenceTimeoutRef.current && status === 'listening') {
                silenceTimeoutRef.current = setTimeout(() => {
                    setStatus('silence');
                    silenceTimeoutRef.current = null;
                }, SILENCE_DEBOUNCE_MS);
            }
            return;
        }

        // Clear silence timeout - we have real content
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }

        // RULE: Only update if text is different (prevent duplicate updates)
        if (text === lastTextRef.current && !isFinal) {
            return;
        }
        lastTextRef.current = text;

        // Update status to listening
        setStatus('listening');

        if (isFinal) {
            // RULE: Always concatenate - append to history
            setHistory(prev => {
                const newHistory = [...prev, { text, timestamp: Date.now() }];
                // Keep last 50 entries
                return newHistory.slice(-50);
            });
            setInterim('');
            lastTextRef.current = '';
        } else {
            // Update interim text
            setInterim(text);
        }

        // Smart scroll after update
        requestAnimationFrame(smartAutoScroll);

    }, [state.lastTranscript, status, smartAutoScroll]);

    // Update status based on listening state
    useEffect(() => {
        if (!state.isListening) {
            setStatus('idle');
            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
                silenceTimeoutRef.current = null;
            }
        }
    }, [state.isListening]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
            }
        };
    }, []);

    // Clear handler
    const handleClear = useCallback(() => {
        setHistory([]);
        setInterim('');
        lastTextRef.current = '';
        window.electronAPI?.app?.sendAction({ action: 'clear-transcript' });
    }, []);

    const currentLang = LANGUAGES.find(l => l.id === selectedLang) || LANGUAGES[0];

    // Memoized history rendering to prevent unnecessary re-renders
    const historyElements = useMemo(() =>
        history.map((entry, i) => (
            <p key={`${entry.timestamp}-${i}`} className="text-white text-sm leading-relaxed font-medium selection:bg-blue-600">
                {entry.text}
            </p>
        )), [history]
    );

    return (
        <div className="h-full flex flex-col bg-transparent">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
            `}</style>

            {/* Simple minimal header */}
            <div className="h-10 flex-shrink-0 flex items-center justify-center border-b border-white/5 bg-black/20">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-500">Transcrição</span>
            </div>

            {/* Transcript List */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-5 py-3 space-y-3 custom-scrollbar"
            >
                {history.length === 0 && !interim && (
                    <div className="flex items-center justify-center h-full opacity-10">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em]">Listening Mode Active</p>
                    </div>
                )}
                {historyElements}
                {interim && (
                    <p className="text-blue-400 text-sm leading-relaxed font-semibold animate-pulse">
                        {interim}
                    </p>
                )}
                <div ref={bottomRef} className="h-3" />
            </div>

            {/* Footer - flex-shrink-0 ensures it stays visible */}
            <div className="flex-shrink-0 p-3 bg-black/40 border-t border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[8px] font-bold uppercase text-white/40">
                    <span>{hotkey.replace('CmdOrCtrl', '⌘')}</span>
                    <span className="ml-1 text-white/60">para enviar</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Language Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setShowLangMenu(!showLangMenu)}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-green-900/10 border border-green-500/20 rounded-md text-[8px] font-black text-green-500 uppercase hover:bg-green-900/20 transition-all"
                        >
                            <Languages size={12} />
                            {currentLang.name}
                            <ChevronDown size={10} />
                        </button>
                        {showLangMenu && (
                            <div className="absolute bottom-full right-0 mb-1 w-32 bg-[#121214] border border-white/10 rounded-lg shadow-xl p-1 z-50">
                                {LANGUAGES.map(lang => (
                                    <button
                                        key={lang.id}
                                        onClick={() => handleLanguageChange(lang.id)}
                                        className={clsx(
                                            "w-full px-2 py-1.5 text-left text-[9px] font-bold uppercase rounded-md transition-all",
                                            selectedLang === lang.id ? "bg-green-600 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        {lang.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleClear}
                        className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-md text-[8px] font-black text-gray-400 hover:text-white transition-all uppercase"
                    >
                        Limpar
                    </button>
                </div>
            </div>
        </div>
    );
}

