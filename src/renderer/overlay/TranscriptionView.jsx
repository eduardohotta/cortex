import React, { useRef, useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Trash2, Mic, Languages, Settings, Minus, ChevronDown } from 'lucide-react';
import { AudioVisualizer } from '../components/AudioVisualizer';
import clsx from 'clsx';

const LANGUAGES = [
    { id: 'auto', name: 'Auto-detect' },
    { id: 'pt', name: 'Português' },
    { id: 'en', name: 'English' },
    { id: 'es', name: 'Español' },
];

export default function TranscriptionView() {
    const { state } = useApp();
    const [history, setHistory] = useState([]);
    const [interim, setInterim] = useState('');
    const [selectedLang, setSelectedLang] = useState('auto');
    const [hotkey, setHotkey] = useState('Ctrl+D');
    const [showLangMenu, setShowLangMenu] = useState(false);
    const bottomRef = useRef(null);

    // Load settings
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.settings.getAll().then(s => {
                if (s?.language) setSelectedLang(s.language);
                if (s?.hotkeyAsk) setHotkey(s.hotkeyAsk);
            });
        }
    }, []);

    const handleLanguageChange = async (langId) => {
        setSelectedLang(langId);
        setShowLangMenu(false);
        if (window.electronAPI) {
            await window.electronAPI.settings.set('language', langId);
        }
    };

    useEffect(() => {
        if (state.lastTranscript) {
            const { text, isFinal } = state.lastTranscript;
            if (isFinal) {
                setHistory(prev => [...prev, { text, timestamp: new Date() }].slice(-50));
                setInterim('');
            } else {
                setInterim(text);
            }
        }
    }, [state.lastTranscript]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history, interim]);

    const currentLang = LANGUAGES.find(l => l.id === selectedLang) || LANGUAGES[0];

    return (
        <div className="h-full flex flex-col bg-[#070708]/40">
            {/* Header */}
            <div className="h-16 flex-none flex items-center justify-center border-b border-white/5 bg-black/20 gap-3">
                <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                        <Mic size={16} />
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 opacity-40">
                        <AudioVisualizer level={state.audioLevel} width={120} height={30} type="input" />
                    </div>
                </div>
            </div>

            {/* Transcript List */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 custom-scrollbar">
                {history.length === 0 && !interim && (
                    <div className="flex items-center justify-center h-full opacity-10">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em]">Listening Mode Active</p>
                    </div>
                )}
                {history.map((entry, i) => (
                    <p key={i} className="text-white text-sm leading-relaxed font-medium selection:bg-blue-600">
                        {entry.text}
                    </p>
                ))}
                {interim && (
                    <p className="text-blue-400 text-sm leading-relaxed font-semibold animate-pulse">
                        {interim}
                    </p>
                )}
                <div ref={bottomRef} className="h-3" />
            </div>

            {/* Footer */}
            <div className="p-3 bg-black/40 border-t border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[8px] font-bold uppercase text-white/40">
                    <span>{hotkey.replace('CmdOrCtrl', '⌘').replace('+', ' ')}</span>
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
                        onClick={() => setHistory([])}
                        className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-md text-[8px] font-black text-gray-400 hover:text-white transition-all uppercase"
                    >
                        Limpar
                    </button>
                </div>
            </div>
        </div>
    );
}

