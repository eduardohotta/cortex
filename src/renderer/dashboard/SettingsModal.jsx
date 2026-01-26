import React, { useState, useEffect } from 'react';
import { X, Save, Cpu, Headphones, Keyboard, ShieldAlert, Command, Key, Plus, Trash2, CheckCircle2, Speaker } from 'lucide-react';
import { Button } from '../components/Button';
import { useApp, ACTIONS } from '../contexts/AppContext';
import clsx from 'clsx';

function HotkeyInput({ value, onChange, label, description }) {
    const [isRecording, setIsRecording] = useState(false);

    const handleKeyDown = (e) => {
        if (!isRecording) return;
        e.preventDefault();

        const keys = [];
        if (e.ctrlKey) keys.push('Control');
        if (e.shiftKey) keys.push('Shift');
        if (e.altKey) keys.push('Alt');
        if (e.metaKey) keys.push('Cmd');

        const key = e.key;
        if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
            keys.push(key.toUpperCase());
            onChange(keys.join('+'));
            setIsRecording(false);
        }
    };

    return (
        <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5 group hover:border-white/10 transition-all no-drag">
            <div className="flex flex-col gap-0.5">
                <span className="text-xs font-black text-gray-300 uppercase tracking-wide">{label}</span>
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-tight">{description}</span>
            </div>
            <button
                onKeyDown={handleKeyDown}
                onClick={() => setIsRecording(true)}
                onBlur={() => setIsRecording(false)}
                className={clsx(
                    "min-w-32 px-4 py-2 rounded-xl text-[10px] font-mono font-black transition-all shadow-inner border uppercase tracking-widest",
                    isRecording
                        ? "bg-blue-600/20 border-blue-500 text-blue-400 animate-pulse"
                        : "bg-gray-800/40 border-gray-700 text-gray-500 hover:text-gray-300"
                )}
            >
                {isRecording ? "Listening..." : (value || 'None')}
            </button>
        </div>
    );
}

export default function SettingsModal({ isOpen, onClose }) {
    const { state, dispatch } = useApp();
    const [localSettings, setLocalSettings] = useState({});
    const [activeTab, setActiveTab] = useState('ia');
    const [selectedProvider, setSelectedProvider] = useState('google');
    const [newKey, setNewKey] = useState('');
    const [audioDevices, setAudioDevices] = useState({ input: [], output: [], loopback: [] });
    const [cudaError, setCudaError] = useState(null);

    useEffect(() => {
        // Listen for CUDA Fallback events
        if (window.electronAPI?.app?.onCudaFallback) {
            const cleanup = window.electronAPI.app.onCudaFallback((data) => {
                setCudaError(data.message || 'Erro desconhecido ao carregar CUDA');
                // Auto-switch localSettings to CPU so UI reflects reality
                setLocalSettings(prev => ({ ...prev, whisperDevice: 'cpu' }));
            });
            return cleanup;
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            window.electronAPI.settings.getAll().then(s => {
                setLocalSettings(s || {});
                if (s.llmProvider) setSelectedProvider(s.llmProvider);
            });

            window.electronAPI.audio.getDevices().then(devices => {
                const categorized = {
                    // Show only real microphones (inputs that are not loopbacks) + Duplex (Headsets)
                    input: devices.filter(d => (d.type === 'input' || d.type === 'duplex') && !d.isLoopback),
                    // Show speakers and loopback devices for system audio capture + Duplex
                    output: devices.filter(d => d.type === 'output' || d.type === 'duplex' || d.type === 'loopback' || d.isLoopback)
                };
                setAudioDevices(categorized);
            });
        }
    }, [isOpen]);

    const handleSave = async () => {
        // Save all keys and settings
        for (const [key, value] of Object.entries(localSettings)) {
            await window.electronAPI.settings.set(key, value);
        }
        await window.electronAPI.settings.refreshShortcuts();
        onClose();
    };

    const handleChange = (key, value) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));
    };

    // Correct isolation: Load specific keys for the provider we are viewing
    const [currentProviderKeys, setCurrentProviderKeys] = useState([]);

    useEffect(() => {
        if (isOpen && selectedProvider) {
            window.electronAPI.settings.get('apiKeys', selectedProvider).then(keys => {
                setCurrentProviderKeys(keys || []);
            });
        }
    }, [selectedProvider, isOpen]);

    const handleAddKey = async () => {
        if (!newKey.trim()) return;
        const updated = [...currentProviderKeys, newKey.trim()];

        // Save specifically to this provider's partition in SettingsManager
        await window.electronAPI.settings.set('apiKeys', updated, selectedProvider);
        setCurrentProviderKeys(updated);
        setNewKey('');

        // If this is the active provider, update localSettings and the main apiKeys key
        if (localSettings.llmProvider === selectedProvider) {
            handleChange('apiKeys', updated);
        }
    };

    const handleRemoveKey = async (index) => {
        const updated = currentProviderKeys.filter((_, i) => i !== index);
        await window.electronAPI.settings.set('apiKeys', updated, selectedProvider);
        setCurrentProviderKeys(updated);

        if (localSettings.llmProvider === selectedProvider) {
            handleChange('apiKeys', updated);
        }
    };

    if (!isOpen) return null;

    const tabs = [
        { id: 'ia', label: 'Cérebro & LLM', icon: Cpu },
        { id: 'audio', label: 'Áudio & Voz', icon: Headphones },
        { id: 'hotkeys', label: 'Controle Remoto', icon: Keyboard },
    ];

    const providers = [
        { id: 'google', name: 'Google Gemini' },
        { id: 'openai', name: 'OpenAI GPT' },
        { id: 'anthropic', name: 'Anthropic Claude' },
        { id: 'groq', name: 'Groq LPU' }
    ];

    const getModelsForProvider = (providerId) => {
        const modelsByProvider = {
            google: [
                { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            ],
            openai: [
                { id: 'gpt-4o', name: 'GPT-4o (Omni)' },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
                { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
                { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
            ],
            anthropic: [
                { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet (Latest)' },
                { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku (Latest)' },
                { id: 'claude-3-opus-latest', name: 'Claude 3 Opus' },
            ],
            groq: [
                { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
                { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
                { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
            ]
        };
        return modelsByProvider[providerId] || modelsByProvider.google;
    };

    return (
        <div className="fixed inset-0 bg-[#0a0a0c] z-[110] animate-in fade-in duration-300 flex flex-col">

            {/* Header */}
            <header className="px-12 py-8 flex justify-between items-center bg-black/20 border-b border-white/5 flex-none select-none">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 text-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.1)]">
                        <Command size={32} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Cockpit de Controle</h2>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.4em] mt-1">Gestão de Inteligência & Hardware</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-14 h-14 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition-all group"
                    title="Fechar Cockpit"
                >
                    <X size={28} className="group-hover:scale-110 transition-transform" />
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <aside className="w-80 border-r border-white/5 bg-black/40 p-8 space-y-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 no-drag",
                                activeTab === tab.id ? "bg-white text-black shadow-2xl" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                            )}
                        >
                            <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 1.5} />
                            {tab.label}
                        </button>
                    ))}
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-[#0e0e10]/50 no-drag">

                    {activeTab === 'ia' && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-right-6 duration-500">
                            {/* LLM Config */}
                            <div className="space-y-8">
                                <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.3em] border-b border-white/5 pb-3">Motores Disponíveis</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {providers.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                setSelectedProvider(p.id);
                                                handleChange('llmProvider', p.id);
                                                // Auto-select first model for this provider
                                                const models = getModelsForProvider(p.id);
                                                if (models.length > 0) {
                                                    handleChange('llmModel', models[0].id);
                                                }
                                            }}
                                            className={clsx(
                                                "px-6 py-5 rounded-2xl border transition-all flex items-center justify-between group no-drag",
                                                localSettings.llmProvider === p.id
                                                    ? "bg-blue-600/10 border-blue-500 text-blue-400"
                                                    : "bg-white/[0.01] border-white/5 text-gray-600 hover:border-white/10"
                                            )}
                                        >
                                            <span className="text-[11px] font-black uppercase tracking-widest">{p.name}</span>
                                            {localSettings.llmProvider === p.id && <CheckCircle2 size={18} />}
                                        </button>
                                    ))}
                                </div>

                                {/* Model Selection Dropdown */}
                                <div className="space-y-4">
                                    {cudaError && (
                                        <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                                            <div className="flex items-start gap-3">
                                                <ShieldAlert className="text-orange-500 shrink-0 mt-0.5" size={16} />
                                                <div className="space-y-1">
                                                    <h4 className="text-[11px] font-black text-orange-400 uppercase tracking-widest">Aceleração GPU Falhou</h4>
                                                    <p className="text-[10px] text-orange-300/80 leading-relaxed font-mono">
                                                        Não foi possível iniciar com CUDA. O sistema reverteu automaticamente para CPU para evitar travamentos.
                                                        <br /><br />
                                                        Erro: {cudaError}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 pl-7">
                                                <button
                                                    onClick={() => {
                                                        require('electron').shell.openExternal('https://developer.nvidia.com/cuda-downloads');
                                                    }}
                                                    className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                                                >
                                                    Baixar Drivers NVIDIA
                                                </button>
                                                <button
                                                    onClick={() => setCudaError(null)}
                                                    className="px-3 py-1.5 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                                                >
                                                    Ignorar
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 text-gray-500 pl-1">
                                        <Cpu size={14} />
                                        <label className="text-[10px] font-black uppercase tracking-widest">Modelo LLM</label>
                                    </div>
                                    <select
                                        value={localSettings.llmModel || ''}
                                        onChange={(e) => handleChange('llmModel', e.target.value)}
                                        className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-5 text-sm text-white hover:bg-white/5 cursor-pointer transition-all no-drag"
                                    >
                                        {getModelsForProvider(localSettings.llmProvider || 'google').map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* STT Provider Selection */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 text-gray-500 pl-1">
                                        <Headphones size={14} />
                                        <label className="text-[10px] font-black uppercase tracking-widest">Provedor de Transcrição (STT)</label>
                                    </div>
                                    <select
                                        value={localSettings.sttProvider || 'groq'}
                                        onChange={(e) => handleChange('sttProvider', e.target.value)}
                                        className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-5 text-sm text-white hover:bg-white/5 cursor-pointer transition-all no-drag"
                                    >
                                        <option value="groq">Groq Whisper (Rápido)</option>
                                        <option value="openai">OpenAI Whisper</option>
                                        <option value="google">Google Speech-to-Text</option>
                                        <option value="whisper-local">Local Whisper (Offline)</option>
                                    </select>

                                    {/* Local Whisper Model Selector */}
                                    {localSettings.sttProvider === 'whisper-local' && (
                                        <div className="animate-in fade-in slide-in-from-top-2 pt-2">
                                            <div className="flex items-center gap-3 text-gray-500 pl-1 mb-2">
                                                <div className="w-1 h-1 rounded-full bg-green-500" />
                                                <label className="text-[9px] font-black uppercase tracking-widest">Modelo Local (Faster-Whisper)</label>
                                            </div>
                                            <select
                                                value={localSettings.whisperModel || 'base'}
                                                onChange={(e) => handleChange('whisperModel', e.target.value)}
                                                className="w-full bg-green-900/10 border border-green-500/20 rounded-2xl px-6 py-4 text-xs text-green-400 hover:bg-green-900/20 cursor-pointer transition-all no-drag"
                                            >
                                                <option value="tiny">Tiny (Ultra Rápido, Menor Precisão)</option>
                                                <option value="base">Base (Equilibrado)</option>
                                                <option value="small">Small (Boa Precisão)</option>
                                                <option value="medium">Medium (Alta Precisão)</option>
                                                <option value="large-v3-turbo">Large v3 Turbo (Máxima Precisão)</option>
                                            </select>

                                            <div className="flex items-center gap-3 text-gray-500 pl-1 mb-2 mt-4">
                                                <div className="w-1 h-1 rounded-full bg-green-500" />
                                                <label className="text-[9px] font-black uppercase tracking-widest">Aceleração de Hardware</label>
                                            </div>
                                            <select
                                                value={localSettings.whisperDevice || 'auto'}
                                                onChange={(e) => handleChange('whisperDevice', e.target.value)}
                                                className="w-full bg-green-900/10 border border-green-500/20 rounded-2xl px-6 py-4 text-xs text-green-400 hover:bg-green-900/20 cursor-pointer transition-all no-drag"
                                            >
                                                <option value="auto">Automático (Tenta GPU, fallback CPU)</option>
                                                <option value="cuda">GPU (NVIDIA CUDA) - Recomendado</option>
                                                <option value="cpu">CPU (Modo Seguro)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* API Keys - isolated by selectedProvider */}
                            <div className="space-y-8 p-8 bg-white/[0.02] border border-white/5 rounded-[32px]">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3 text-yellow-500/60">
                                        <Key size={18} />
                                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em]">Credenciais {selectedProvider.toUpperCase()}</h4>
                                    </div>
                                    <span className="text-[9px] text-gray-700 font-mono tracking-widest">VAULT_LOCK_ON</span>
                                </div>

                                <div className="space-y-3">
                                    {currentProviderKeys.length > 0 ? currentProviderKeys.map((key, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-black/60 rounded-xl border border-white/5 group/key">
                                            <span className="text-xs font-mono text-gray-600 truncate mr-6 selection:bg-yellow-500/20">
                                                {key.substring(0, 15)}••••••••••{key.substring(key.length - 4)}
                                            </span>
                                            <button
                                                onClick={() => handleRemoveKey(i)}
                                                className="p-2 text-gray-700 hover:text-red-500 opacity-0 group-hover/key:opacity-100 transition-all no-drag"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )) : (
                                        <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl opacity-20">
                                            <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma chave configurada para este modelo</p>
                                        </div>
                                    )}

                                    <div className="flex gap-3 pt-4 no-drag">
                                        <input
                                            type="password"
                                            value={newKey}
                                            onChange={(e) => setNewKey(e.target.value)}
                                            className="flex-1 bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-4 text-xs text-white focus:ring-1 focus:ring-yellow-500/50"
                                            placeholder={`Cole sua API Key da ${selectedProvider.toUpperCase()}...`}
                                        />
                                        <button
                                            onClick={handleAddKey}
                                            className="px-8 bg-yellow-600/10 border border-yellow-500/20 text-yellow-500 font-black text-[10px] rounded-2xl hover:bg-yellow-500/20 transition-all uppercase tracking-widest"
                                        >
                                            Vincular
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'audio' && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-right-6 duration-500">
                            <div className="space-y-10">
                                <h3 className="text-xs font-black text-green-400 uppercase tracking-[0.3em] border-b border-white/5 pb-3">Hardware de Som</h3>

                                <div className="grid grid-cols-1 gap-8 no-drag">
                                    <div className="space-y-5">
                                        <div className="flex items-center gap-3 text-gray-500 pl-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                            <label className="text-[10px] font-black uppercase tracking-widest">Entrada Primária (Microfone)</label>
                                        </div>
                                        <select
                                            value={localSettings.audioInput}
                                            onChange={(e) => handleChange('audioInput', e.target.value)}
                                            className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-5 text-sm text-white hover:bg-white/5 cursor-pointer transition-all"
                                        >
                                            <option value="default">Padrão do Windows (Auto-Detect)</option>
                                            {audioDevices.input.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-5">
                                        <div className="flex items-center gap-3 text-gray-500 pl-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                            <label className="text-[10px] font-black uppercase tracking-widest">Saída (Monitoramento Loopback)</label>
                                        </div>
                                        <select
                                            value={localSettings.audioOutput}
                                            onChange={(e) => handleChange('audioOutput', e.target.value)}
                                            className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-5 text-sm text-white hover:bg-white/5 cursor-pointer transition-all"
                                        >
                                            <option value="default">Saída Padrão (Mixer Principal)</option>
                                            {audioDevices.output.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                        <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl flex gap-3 items-center">
                                            <Speaker size={16} className="text-gray-700" />
                                            <p className="text-[9px] text-gray-700 font-black uppercase tracking-wider">A saída selecionada define qual fluxo de áudio a IA irá "ouvir" para entender o entrevistador.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'hotkeys' && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-right-6 duration-500">
                            <div className="space-y-8">
                                <h3 className="text-xs font-black text-purple-400 uppercase tracking-[0.3em] border-b border-white/5 pb-3">Atalhos Operacionais</h3>
                                <div className="grid grid-cols-1 gap-4">
                                    <HotkeyInput
                                        label="Live Stealth Mode"
                                        description="Oculta janelas do stream sem removê-las para você"
                                        value={localSettings.hotkeyStealth}
                                        onChange={(v) => handleChange('hotkeyStealth', v)}
                                    />
                                    <HotkeyInput
                                        label="Toggle Audio Pipeline"
                                        description="Inicia ou encerra a rede de escuta neural"
                                        value={localSettings.hotkeyRecord}
                                        onChange={(v) => handleChange('hotkeyRecord', v)}
                                    />
                                    <HotkeyInput
                                        label="Manual Insight Trigger"
                                        description="Força o processamento imediato do buffer de tokens"
                                        value={localSettings.hotkeyAsk}
                                        onChange={(v) => handleChange('hotkeyAsk', v)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <footer className="px-12 py-10 border-t border-white/5 bg-black/40 flex justify-end items-center gap-6 flex-none">
                <button
                    onClick={onClose}
                    className="px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-600 hover:text-white hover:bg-white/5 transition-all no-drag"
                >
                    Descartar
                </button>
                <Button
                    variant="primary"
                    onClick={handleSave}
                    className="px-16 py-5 rounded-[24px] shadow-2xl active:scale-95 transition-all text-[11px] font-black uppercase tracking-[0.25em] bg-white text-black hover:bg-gray-100 no-drag"
                >
                    <Save size={18} className="mr-3" />
                    Salvar
                </Button>
            </footer>
        </div>
    );
}
