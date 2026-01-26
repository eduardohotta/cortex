import React, { useState, useEffect, useRef } from 'react';
import { useApp, ACTIONS } from '../contexts/AppContext';
import { Mic, MicOff, BrainCircuit, Hash, ChevronUp, Menu, LogOut, Check, Command as CmdIcon, GripVertical, Settings, Headphones, Eye, EyeOff } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import clsx from 'clsx';

export default function FloatingRemote({ standalone = false }) {
    const { state, dispatch } = useApp();
    const { isListening, tokenCount, audioLevel, assistants, currentAssistantId } = state;
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
    const [hotkeys, setHotkeys] = useState({ record: 'Ctrl+D', ask: 'Ctrl+Enter' });

    // Audio State
    const [audioDevices, setAudioDevices] = useState({ input: [], output: [] });
    const [isAudioMenuOpen, setIsAudioMenuOpen] = useState(false);
    const [selectedAudio, setSelectedAudio] = useState({ input: 'default', output: 'default' });
    const [isDragging, setIsDragging] = useState(false);
    const [isStealth, setIsStealth] = useState(true);
    const containerRef = useRef(null);

    // Load settings and devices
    useEffect(() => {
        if (window.electronAPI) {
            // Load Settings
            window.electronAPI.settings.getAll().then(settings => {
                if (settings) {
                    setHotkeys({
                        record: settings.hotkeyRecord,
                        ask: settings.hotkeyAsk
                    });
                    setSelectedAudio({
                        input: settings.audioInput || 'default',
                        output: settings.audioOutput || 'default'
                    });
                }
            });

            // Load Devices (Strict Filter - Matching SettingsModal)
            window.electronAPI.audio.getDevices().then(devices => {
                setAudioDevices({
                    input: devices.filter(d => (d.type === 'input' || d.type === 'duplex') && !d.isLoopback),
                    output: devices.filter(d => d.type === 'output' || d.type === 'duplex' || d.type === 'loopback' || d.isLoopback)
                });
            });
        }
    }, [isAudioMenuOpen]); // Reload when menu opens to get fresh devices

    // Listen for real-time settings and stealth changes
    useEffect(() => {
        if (window.electronAPI?.settings?.onSettingsChanged) {
            window.electronAPI.settings.onSettingsChanged(({ key, value }) => {
                if (key === 'audioInput') setSelectedAudio(prev => ({ ...prev, input: value }));
                if (key === 'audioOutput') setSelectedAudio(prev => ({ ...prev, output: value }));
            });
        }

        if (window.electronAPI?.overlay?.onStealthChanged) {
            window.electronAPI.overlay.onStealthChanged(setIsStealth);
        }

        // Listen for profile updates (when saved from dashboard)
        if (window.electronAPI?.app?.onProfilesUpdated) {
            window.electronAPI.app.onProfilesUpdated(async () => {
                const profiles = await window.electronAPI.settings.getProfiles();
                if (profiles) {
                    dispatch({ type: ACTIONS.SET_ASSISTANTS, payload: profiles });
                }
            });
        }
    }, [dispatch]);

    const formatHotkey = (hotkey) => {
        if (!hotkey) return '';
        return hotkey
            .replace('CmdOrCtrl', '⌘')
            .replace('Control', 'Ctrl')
            .replace('Enter', '↵');
    };

    const toggleRecording = () => {
        if (window.electronAPI?.app?.sendAction) {
            window.electronAPI.app.sendAction({ action: 'toggle-record' });
        }
    };

    const toggleStealth = () => {
        window.electronAPI?.overlay?.toggleStealth();
        // Optimistic update
        setIsStealth(!isStealth);
    };

    const triggerAsk = () => {
        if (window.electronAPI?.llm?.processAsk) {
            window.electronAPI.llm.processAsk({ text: null, manual: true });
        }
    };

    const handleSelectAgent = async (id) => {
        dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: id });
        // Also save to settings so backend can read it
        if (window.electronAPI?.settings?.set) {
            await window.electronAPI.settings.set('currentAssistantId', id);
        }
        setIsAgentMenuOpen(false);
    };

    const handleMenuClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsMenuOpen(!isMenuOpen);
    };

    const handleAudioChange = async (type, deviceId) => {
        setSelectedAudio(prev => ({ ...prev, [type]: deviceId }));
        const settingKey = type === 'input' ? 'audioInput' : 'audioOutput';
        if (window.electronAPI) {
            await window.electronAPI.settings.set(settingKey, deviceId);
        }
    };

    // Manual Drag Logic using Pointer Events for robustness
    const handleDragStart = (e) => {
        setIsDragging(true);
        e.target.setPointerCapture(e.pointerId);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            if (window.electronAPI?.app?.move) {
                window.electronAPI.app.move(e.movementX, e.movementY);
            }
        };

        const handleMouseUp = (e) => {
            setIsDragging(false);
            // If dropped outside, enable click-through immediately
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const isInside =
                    e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom;

                if (!isInside) {
                    window.electronAPI?.overlay?.setIgnoreMouse(true);
                }
            }
        };

        window.addEventListener('pointermove', handleMouseMove);
        window.addEventListener('pointerup', handleMouseUp);

        return () => {
            window.removeEventListener('pointermove', handleMouseMove);
            window.removeEventListener('pointerup', handleMouseUp);
        };
    }, [isDragging]);

    return (
        <div
            className={clsx(
                standalone && "h-screen w-screen flex items-center justify-center"
            )}
            style={{ WebkitAppRegion: 'no-drag' }}
        >
            {/* Main Container */}
            <div
                ref={containerRef}
                className={clsx(
                    "flex items-center gap-2 transition-all duration-300",
                    standalone
                        ? "bg-[#0d0d0f] border border-white/12 rounded-xl px-2 py-2 shadow-2xl"
                        : "fixed bottom-6 left-1/2 -translate-x-1/2 px-2 py-1.5 bg-[#0d0d0f] border border-white/12 rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.65)]"
                )}
                style={{ WebkitAppRegion: 'no-drag' }}
                onMouseEnter={() => window.electronAPI?.overlay?.setIgnoreMouse(false)}
                onMouseLeave={() => {
                    if (!isDragging && !isMenuOpen && !isAudioMenuOpen && !isAgentMenuOpen) {
                        window.electronAPI?.overlay?.setIgnoreMouse(true);
                    }
                }}
            >
                {/* Drag Handle */}
                <div
                    className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing"
                    onPointerDown={handleDragStart}
                >
                    <GripVertical size={14} />
                </div>

                {/* Main Menu */}
                <div className="relative">
                    <button
                        onClick={handleMenuClick}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <Menu size={15} />
                    </button>

                    {isMenuOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-44 bg-[#121214] border border-white/10 rounded-xl shadow-2xl p-2 flex flex-col gap-1.5 z-[9999]">
                            <button
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    window.electronAPI?.app?.showDashboard();
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black text-gray-400 hover:bg-white/5 hover:text-white tracking-widest uppercase"
                            >
                                <Settings size={14} /> Dashboard
                            </button>

                            <button
                                onClick={() => window.electronAPI?.app?.panic()}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black text-red-500/70 hover:bg-red-500/10 hover:text-red-400 tracking-widest uppercase"
                            >
                                <LogOut size={14} /> Quit
                            </button>
                        </div>
                    )}
                </div>

                {/* Audio Settings */}
                <div className="relative">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsAudioMenuOpen(!isAudioMenuOpen);
                        }}
                        className={clsx(
                            "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                            isAudioMenuOpen
                                ? "text-white bg-white/12"
                                : "text-gray-500 hover:text-white hover:bg-white/10"
                        )}
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <Headphones size={15} />
                    </button>

                    {isAudioMenuOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#121214]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-3 z-[9999] flex flex-col gap-4">

                            {/* Mic */}
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest ml-1">
                                    Microfone (Você)
                                </label>

                                <select
                                    className="
          w-full
          appearance-none
          bg-[#121214]
          border border-white/10
          rounded-lg
          px-3 py-2
          text-[10px] text-white
          focus:outline-none focus:border-blue-500/50
        "
                                    value={selectedAudio.input}
                                    onChange={(e) => handleAudioChange('input', e.target.value)}
                                >
                                    <option
                                        value="default"
                                        className="bg-[#121214] text-white"
                                    >
                                        Padrão
                                    </option>

                                    {audioDevices.input.map((d) => (
                                        <option
                                            key={d.id}
                                            value={d.id.toString()}
                                            className="bg-[#121214] text-white"
                                        >
                                            {d.name.substring(0, 30)}...
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* System */}
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest ml-1">
                                    Sistema (Entrevistador)
                                </label>

                                <select
                                    className="
          w-full
          appearance-none
          bg-[#121214]
          border border-white/10
          rounded-lg
          px-3 py-2
          text-[10px] text-white
          focus:outline-none focus:border-blue-500/50
        "
                                    value={selectedAudio.output?.toString()}
                                    onChange={(e) => handleAudioChange('output', e.target.value)}
                                >
                                    <option
                                        value="default"
                                        className="bg-[#121214] text-white"
                                    >
                                        Padrão
                                    </option>

                                    {audioDevices.output.map((d) => (
                                        <option
                                            key={d.id}
                                            value={d.id.toString()}
                                            className="bg-[#121214] text-white"
                                        >
                                            {d.name.substring(0, 30)}...
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                </div>

                {/* Agent Selector */}
                <div className="relative">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsAgentMenuOpen(!isAgentMenuOpen);
                        }}
                        className={clsx(
                            "h-7 px-2 rounded-lg flex items-center gap-1.5 transition-all text-[10px] font-bold",
                            isAgentMenuOpen
                                ? "text-white bg-white/12"
                                : "text-gray-400 hover:text-white hover:bg-white/10"
                        )}
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        <BrainCircuit size={13} className="text-blue-400" />
                        <span className="max-w-[80px] truncate">
                            {assistants.find(a => a.id === currentAssistantId)?.name || 'Assistente'}
                        </span>
                        <ChevronUp size={12} className={clsx("transition-transform", isAgentMenuOpen && "rotate-180")} />
                    </button>

                    {isAgentMenuOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-48 bg-[#121214]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 z-[9999] max-h-64 overflow-y-auto">
                            <div className="text-[9px] font-black uppercase text-gray-600 tracking-widest px-2 py-1.5">
                                Trocar Assistente
                            </div>
                            {assistants.map(agent => (
                                <button
                                    key={agent.id}
                                    onClick={() => handleSelectAgent(agent.id)}
                                    className={clsx(
                                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] transition-all",
                                        agent.id === currentAssistantId
                                            ? "bg-blue-500/20 text-blue-400 font-bold"
                                            : "text-gray-400 hover:bg-white/5 hover:text-white"
                                    )}
                                >
                                    <span className="text-sm">{agent.icon || '🤖'}</span>
                                    <span className="flex-1 text-left truncate">{agent.name}</span>
                                    {agent.id === currentAssistantId && <Check size={12} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="w-px h-6 bg-white/8" />

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={triggerAsk}
                        className="flex items-center gap-2 px-3 h-8 bg-white/[0.05] hover:bg-white/[0.18] text-white rounded-lg border border-white/12 transition-all active:scale-95"
                    >
                        <span className="text-[9px] font-mono text-white/30">
                            {formatHotkey(hotkeys.ask)}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wide">
                            ASK
                        </span>
                        <BrainCircuit size={14} className="text-blue-400" />
                    </button>

                    <button
                        onClick={toggleRecording}
                        className={clsx(
                            "flex items-center gap-2 px-3 h-8 rounded-lg border transition-all active:scale-95",
                            isListening
                                ? "bg-red-600/25 border-red-500/50"
                                : "bg-white/[0.05] border-white/12 hover:bg-white/[0.18]"
                        )}
                    >
                        <span className="text-[9px] font-mono text-white/30">
                            {formatHotkey(hotkeys.record)}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wide">
                            {isListening ? 'STOP' : 'REC'}
                        </span>
                        <div
                            className={clsx(
                                "w-2.5 h-2.5 rounded-sm",
                                isListening
                                    ? "bg-red-500 animate-pulse"
                                    : "bg-white/20 rounded-full"
                            )}
                        />
                    </button>

                    {/* Stealth Indicator */}
                    <button
                        onClick={toggleStealth}
                        className={clsx(
                            "w-8 h-8 rounded-lg border flex items-center justify-center transition-all",
                            isStealth
                                ? "bg-purple-500/20 border-purple-500/40 text-purple-400"
                                : "bg-white/[0.05] border-white/12 text-gray-500 hover:text-white"
                        )}
                        title="Stealth Mode (Anti-Print)"
                    >
                        {isStealth ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                </div>

                <div className="w-px h-6 bg-white/8" />

                {/* Stats */}
                <div className="flex items-center gap-3 px-2">
                    <div className="flex flex-col gap-1 items-center">
                        <AudioVisualizer
                            level={audioLevel}
                            height={10}
                            width={64}
                            type="output"
                            className={clsx("transition-opacity", !isListening && "opacity-20")}
                        />
                        <span className="text-white/40 text-[10px] font-black uppercase">
                            {tokenCount.toLocaleString()} TOKENS
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
