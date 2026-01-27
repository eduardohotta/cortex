import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { ModelHub } from './ModelHub';
import { Button } from '../components/Button';
import { Settings, X, Cpu, Headphones, Key, Save } from 'lucide-react';
import { clsx } from 'clsx';
import { LLMSettings } from './settings/LLMSettings';
import { AudioSettings } from './settings/AudioSettings';
import { ShortcutSettings } from './settings/ShortcutSettings';

export default function SettingsModal({ isOpen, onClose }) {
    const { state, dispatch } = useApp();
    const [localSettings, setLocalSettings] = useState({});
    const [isModelHubOpen, setIsModelHubOpen] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState('openai');
    const [activeTab, setActiveTab] = useState('audio');
    const [audioDevices, setAudioDevices] = useState({ input: [], output: [] });
    const [modelStatus, setModelStatus] = useState({ usedTokens: 0, contextSize: 4096 });

    // Sync settings on open
    useEffect(() => {
        if (isOpen) {
            const loadSettings = async () => {
                const all = await window.electronAPI.settings.getAll();
                setLocalSettings(all);
                setSelectedProvider(all.llmProvider || 'openai');
            };
            loadSettings();

            // Sync audio devices from state or IPC
            const refreshDevices = () => {
                window.electronAPI.audio.getDevices().then(devices => {
                    if (Array.isArray(devices)) {
                        setAudioDevices({
                            input: devices.filter(d => d.type === 'input'),
                            output: devices.filter(d => d.type === 'output' || d.type === 'loopback')
                        });
                    }
                });
            };
            refreshDevices();

            // Listen for Model Status (using correct API exposed in preload)
            const cleanupStatus = window.electronAPI.model.onStatus((data) => {
                setModelStatus(prev => ({ ...prev, ...data }));
            });

            return () => {
                if (cleanupStatus) cleanupStatus();
            };
        }
    }, [isOpen]);

    const handleChange = (key, value) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        // Save all settings via IPC
        for (const [key, value] of Object.entries(localSettings)) {
            await window.electronAPI.settings.set(key, value);
        }
        // Force refresh profiles/state
        window.electronAPI.settings.refreshShortcuts();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-[#0a0a0c] z-[110] animate-in fade-in duration-300 flex flex-col">
            {/* Glossy Header */}
            <header className="px-12 py-8 flex justify-between items-center bg-black/40 border-b border-white/5 flex-none select-none">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                        <Settings size={32} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Cockpit</h2>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.4em] mt-1">Configuração Neural & Hardware</p>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-14 h-14 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition-all no-drag"
                >
                    <X size={28} />
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Lateral Sidebar Navigation */}
                <aside className="w-80 border-r border-white/5 bg-black/40 p-8 space-y-2 flex-none select-none">
                    <button
                        onClick={() => setActiveTab('llm')}
                        className={clsx(
                            "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                            activeTab === 'llm' ? "bg-white text-black shadow-2xl" : "text-gray-500 hover:bg-white/5"
                        )}
                    >
                        <Cpu size={20} /> Motores AI
                    </button>
                    <button
                        onClick={() => setActiveTab('audio')}
                        className={clsx(
                            "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                            activeTab === 'audio' ? "bg-white text-black shadow-2xl" : "text-gray-500 hover:bg-white/5"
                        )}
                    >
                        <Headphones size={20} /> Som & Voz
                    </button>
                    <button
                        onClick={() => setActiveTab('hotkeys')}
                        className={clsx(
                            "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                            activeTab === 'hotkeys' ? "bg-white text-black shadow-2xl" : "text-gray-500 hover:bg-white/5"
                        )}
                    >
                        <Key size={20} /> Atalhos
                    </button>
                </aside>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto custom-scrollbar no-drag bg-[#0e0e10]/50">
                    <div className="max-w-4xl mx-auto p-12 space-y-16">

                        {activeTab === 'llm' && (
                            <LLMSettings
                                localSettings={localSettings}
                                handleChange={handleChange}
                                selectedProvider={selectedProvider}
                                setSelectedProvider={setSelectedProvider}
                                modelStatus={modelStatus}
                                setIsModelHubOpen={setIsModelHubOpen}
                            />
                        )}

                        {activeTab === 'audio' && (
                            <AudioSettings
                                localSettings={localSettings}
                                handleChange={handleChange}
                                audioDevices={audioDevices}
                            />
                        )}

                        {activeTab === 'hotkeys' && (
                            <ShortcutSettings
                                localSettings={localSettings}
                                handleChange={handleChange}
                            />
                        )}
                    </div>
                </main>
            </div>

            {/* Fixed Footer */}
            <footer className="px-8 py-4 border-t border-white/5 bg-black/60 flex justify-end items-center gap-4 flex-none">
                <button
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest
                   text-red-500 hover:text-white hover:bg-white/5 transition-all no-drag"
                >
                    Descartar
                </button>

                <Button
                    variant="primary"
                    onClick={handleSave}
                    className="px-10 py-2.5 rounded-xl shadow-xl active:scale-95 transition-all
                   text-[10px] font-black uppercase tracking-[0.25em]
                   bg-white text-black hover:bg-gray-100 no-drag"
                >
                    <Save size={14} className="mr-2" />
                    Salvar
                </Button>
            </footer>

            <ModelHub isOpen={isModelHubOpen} onClose={() => setIsModelHubOpen(false)} />
        </div >
    );
}
