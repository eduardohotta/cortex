import React, { useState, useEffect } from 'react';
import { useApp, ACTIONS } from '../contexts/AppContext';
import { Mic, MicOff, BrainCircuit, Hash, ChevronUp, Menu, LogOut, Check, Command as CmdIcon, GripVertical, Settings } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import clsx from 'clsx';

export default function FloatingRemote({ standalone = false }) {
    const { state, dispatch } = useApp();
    const { isListening, tokenCount, audioLevel, assistants, currentAssistantId } = state;
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
    const [hotkeys, setHotkeys] = useState({ record: 'Ctrl+D', ask: 'Ctrl+Enter' });

    // Load hotkeys from settings
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.settings.getAll().then(settings => {
                if (settings) {
                    setHotkeys({
                        record: settings.hotkeyRecord || 'Ctrl+D',
                        ask: settings.hotkeyAsk || 'Ctrl+Enter'
                    });
                }
            });
        }
    }, []);

    const formatHotkey = (hotkey) => {
        if (!hotkey) return '';
        return hotkey
            .replace('CmdOrCtrl', '⌘')
            .replace('Control', 'Ctrl')
            .replace('+', ' ')
            .replace('Enter', '↵');
    };

    const toggleRecording = () => {
        console.log('[FloatingRemote] Toggle recording clicked');
        if (window.electronAPI?.app?.sendAction) {
            window.electronAPI.app.sendAction({ action: 'toggle-record' });
        }
    };

    const triggerAsk = () => {
        console.log('[FloatingRemote] Ask clicked');
        if (window.electronAPI?.llm?.processAsk) {
            window.electronAPI.llm.processAsk({ text: null, manual: true });
        }
    };

    const handleSelectAgent = (id) => {
        dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: id });
        setIsAgentMenuOpen(false);
    };

    const handleMenuClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[FloatingRemote] Menu clicked');
        setIsMenuOpen(!isMenuOpen);
    };

    return (
        <div
            className={clsx(standalone ? "h-screen w-screen flex items-center justify-center" : "")}
            style={{ WebkitAppRegion: 'no-drag' }}
        >
            {/* Main Container - Solid background for click detection */}
            <div
                className={clsx(
                    "flex items-center gap-1 transition-all duration-300",
                    standalone
                        ? "bg-[#0d0d0f] border border-white/10 rounded-lg px-1 py-1 shadow-2xl"
                        : "fixed bottom-6 left-1/2 -translate-x-1/2 px-1.5 py-1 bg-[#0d0d0f] border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
                )}
                style={{ WebkitAppRegion: 'no-drag' }}
            >

                {/* Drag Handle - ONLY this part is draggable */}
                <div
                    className="w-6 h-6 flex items-center justify-center text-gray-700 hover:text-gray-500 cursor-grab active:cursor-grabbing"
                    style={{ WebkitAppRegion: 'drag' }}
                >
                    <GripVertical size={12} />
                </div>

                {/* Main Menu */}
                <div className="relative">
                    <button
                        onClick={handleMenuClick}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <Menu size={14} />
                    </button>
                    {isMenuOpen && (
                        <div
                            className="absolute bottom-full left-0 mb-2 w-40 bg-[#121214] border border-white/10 rounded-xl shadow-2xl p-1.5 flex flex-col"
                            style={{ zIndex: 9999 }}
                        >
                            <button
                                onClick={() => { setIsMenuOpen(false); window.electronAPI?.overlay?.hide(); }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[9px] font-black text-gray-400 hover:bg-white/5 hover:text-white tracking-widest uppercase cursor-pointer"
                            >
                                <Settings size={12} /> Dashboard
                            </button>
                            <button
                                onClick={() => window.electronAPI?.app?.panic()}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[9px] font-black text-red-500/60 hover:bg-red-500/10 hover:text-red-400 tracking-widest uppercase cursor-pointer"
                            >
                                <LogOut size={12} /> Quit
                            </button>
                        </div>
                    )}
                </div>

                <div className="w-px h-5 bg-white/5" />

                {/* Action Buttons */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={triggerAsk}
                        className="flex items-center gap-1.5 px-2 py-1 h-7 bg-white/[0.04] hover:bg-white/[0.15] text-white rounded-lg border border-white/10 transition-all active:scale-95 cursor-pointer"
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <span className="text-[8px] font-mono text-white/30">{formatHotkey(hotkeys.ask)}</span>
                        <span className="text-[9px] font-black uppercase tracking-wide">ASK</span>
                        <BrainCircuit size={12} className="text-blue-400" />
                    </button>

                    <button
                        onClick={toggleRecording}
                        className={clsx(
                            "flex items-center gap-1.5 px-2 py-1 h-7 rounded-lg border transition-all active:scale-95 cursor-pointer",
                            isListening
                                ? "bg-red-600/20 border-red-500/50 text-white"
                                : "bg-white/[0.04] border-white/10 text-white hover:bg-white/[0.15]"
                        )}
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <span className="text-[8px] font-mono text-white/30">{formatHotkey(hotkeys.record)}</span>
                        <span className="text-[9px] font-black uppercase tracking-wide">{isListening ? 'STOP' : 'REC'}</span>
                        {isListening ? (
                            <div className="w-2 h-2 bg-red-500 rounded-sm animate-pulse" />
                        ) : (
                            <div className="w-2 h-2 bg-white/20 rounded-full" />
                        )}
                    </button>
                </div>

                <div className="w-px h-5 bg-white/5" />

                {/* Stats */}
                <div className="flex items-center gap-2 px-2">
                    <div className="flex flex-col gap-0.5 items-end">
                        <AudioVisualizer level={audioLevel} height={8} width={50} type="output" className={clsx("transition-opacity", !isListening && "opacity-10")} />
                        <span className="text-white/30 text-[7px] font-black uppercase">{tokenCount.toLocaleString()} TKN</span>
                    </div>
                </div>

            </div>

            {/* Agent Menu Popup */}
            {isAgentMenuOpen && (
                <div
                    className={clsx(
                        "bg-[#121214] border border-white/10 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.8)] p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200",
                        standalone ? "absolute bottom-full left-8 mb-2 w-56" : "fixed bottom-20 left-1/2 -translate-x-1/2 w-56"
                    )}
                    style={{ zIndex: 9999 }}
                >
                    {assistants.map(a => (
                        <button
                            key={a.id}
                            onClick={() => handleSelectAgent(a.id)}
                            className={clsx(
                                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                currentAssistantId === a.id ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-white/5 hover:text-white"
                            )}
                        >
                            <span className="truncate">{a.name}</span>
                            {currentAssistantId === a.id && <Check size={12} />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}


