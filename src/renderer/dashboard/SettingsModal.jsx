import React, { useState, useEffect } from 'react';
import { useApp, ACTIONS } from '../contexts/AppContext';
import { ModelHub } from './ModelHub';
import { Button } from '../components/Button';
import { CheckCircle2, HardDrive, Cpu, Headphones, Key, Trash2, Speaker, Save, X, Settings } from 'lucide-react';
import { clsx } from 'clsx';

// Helper Component for Hotkeys
function HotkeyInput({ label, description, value, onChange }) {
    return (
        <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/5 transition-colors group">
            <div className="space-y-1">
                <div className="text-[11px] font-bold text-gray-300">{label}</div>
                <div className="text-[9px] text-gray-500">{description}</div>
            </div>
            <button
                className="px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs font-mono text-blue-400 min-w-[80px] text-center hover:border-blue-500/50 transition-all"
                onClick={() => {
                    // Simple mock for "press any key" - usually requires a global listener
                    const newKey = prompt('Digite a nova tecla (ex: F9, Command+Shift+K):', value);
                    if (newKey) onChange(newKey.toUpperCase());
                }}
            >
                {value || 'NONE'}
            </button>
        </div>
    );
}

export default function SettingsModal({ isOpen, onClose }) {
    const { state, dispatch } = useApp();
    const [localSettings, setLocalSettings] = useState({});
    const [isModelHubOpen, setIsModelHubOpen] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState('openai');
    const [activeTab, setActiveTab] = useState('audio'); // 'audio' or 'hotkeys' (implicit)
    const [newKey, setNewKey] = useState('');
    const [audioDevices, setAudioDevices] = useState({ input: [], output: [] });

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
            window.electronAPI.audio.getDevices().then(devices => {
                if (Array.isArray(devices)) {
                    setAudioDevices({
                        input: devices.filter(d => d.type === 'input'),
                        output: devices.filter(d => d.type === 'output' || d.type === 'loopback')
                    });
                }
            });
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

    const getModelsForProvider = (provider) => {
        const models = {
            google: [{ id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }, { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }, { id: 'gemini-pro', name: 'Gemini Pro' }],
            openai: [{ id: 'gpt-4o', name: 'GPT-4o' }, { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }],
            anthropic: [{ id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }, { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' }],
            groq: [{ id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B' }, { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }],
            local: []
        };
        return models[provider] || [];
    };

    const [currentProviderKeys, setCurrentProviderKeys] = useState([]);
    useEffect(() => {
        if (isOpen && selectedProvider) {
            window.electronAPI.settings.get('apiKeys', selectedProvider).then(keys => {
                setCurrentProviderKeys(keys || []);
            });
        }
    }, [selectedProvider, isOpen]); const handleAddKey = () => {
        if (!newKey.trim()) return;
        const currentKeys = localSettings.apiKeys || {};
        const providerKeys = currentKeys[selectedProvider] || [];

        const updatedKeys = {
            ...currentKeys,
            [selectedProvider]: [...providerKeys, newKey.trim()]
        };

        setLocalSettings(prev => ({ ...prev, apiKeys: updatedKeys }));
        setNewKey('');
    };

    const handleRemoveKey = (index) => {
        const currentKeys = localSettings.apiKeys || {};
        const providerKeys = currentKeys[selectedProvider] || [];
        const newProviderKeys = providerKeys.filter((_, i) => i !== index);

        const updatedKeys = {
            ...currentKeys,
            [selectedProvider]: newProviderKeys
        };
        setLocalSettings(prev => ({ ...prev, apiKeys: updatedKeys }));
    };

    const providers = [
        { id: 'google', name: 'Google Gemini' },
        { id: 'openai', name: 'OpenAI GPT' },
        { id: 'anthropic', name: 'Anthropic Claude' },
        { id: 'groq', name: 'Groq LPU' },
        { id: 'local', name: 'Local (Offline)' }
    ];

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
                            <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
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
                                                    if (p.id !== 'local') {
                                                        const models = getModelsForProvider(p.id);
                                                        if (models.length > 0) {
                                                            handleChange('llmModel', models[0].id);
                                                        }
                                                    } else if (localSettings.localModel) {
                                                        handleChange('llmModel', localSettings.localModel);
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

                                    {/* Local Model Specific Config */}
                                    {localSettings.llmProvider === 'local' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                                            <div className="p-6 bg-purple-900/10 border border-purple-500/30 rounded-2xl">
                                                <div className="flex items-start gap-4">
                                                    <HardDrive className="text-purple-400 mt-1" size={20} />
                                                    <div className="space-y-2 flex-1">
                                                        <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest">Motor Offline Ativo</h4>
                                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                                            O processamento será feito inteiramente no seu dispositivo. Isso requer memória RAM disponível.
                                                        </p>

                                                        <div className="flex items-center gap-4 mt-4 bg-black/40 p-4 rounded-xl border border-white/5">
                                                            <span className="text-xs font-mono text-white">
                                                                {localSettings.localModel || 'Nenhum modelo selecionado'}
                                                            </span>
                                                        </div>

                                                        <button
                                                            onClick={() => setIsModelHubOpen(true)}
                                                            className="mt-4 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-full flex items-center justify-center gap-2"
                                                        >
                                                            <HardDrive size={14} /> Gerenciar Modelos (Model Hub)
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Model Selection Dropdown (Only for Online Providers) */}
                                    {localSettings.llmProvider !== 'local' && (
                                        <div className="space-y-4">
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
                                    )}
                                </div>

                                {/* API Keys - isolated by selectedProvider */}
                                <div className="space-y-8 p-8 bg-white/[0.02] border border-white/5 rounded-[32px]">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3 text-yellow-500/60">
                                            <Key size={18} />
                                            <h4 className="text-[11px] font-black uppercase tracking-[0.2em]">Credenciais {selectedProvider.toUpperCase()}</h4>
                                        </div>
                                        <span className="text-[9px] text-gray-700 font-mono tracking-widest uppercase">Vault Secure</span>
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
                            <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="space-y-10">
                                    <h3 className="text-xs font-black text-green-400 uppercase tracking-[0.3em] border-b border-white/5 pb-3">Hardware de Som</h3>

                                    <div className="grid grid-cols-1 gap-8 no-drag">
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
                                                <div className="animate-in fade-in slide-in-from-top-2 pt-2 space-y-4">
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex items-center gap-3 text-gray-500 pl-1">
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
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex items-center gap-3 text-gray-500 pl-1">
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
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-5">
                                            <div className="flex items-center gap-3 text-gray-500 pl-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                <label className="text-[10px] font-black uppercase tracking-widest">Entrada Primária (Microfone)</label>
                                            </div>
                                            <select
                                                value={localSettings.audioInput}
                                                onChange={(e) => handleChange('audioInput', e.target.value)}
                                                className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-5 text-sm text-white hover:bg-white/5 cursor-pointer transition-all no-drag"
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
                                                className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-5 text-sm text-white hover:bg-white/5 cursor-pointer transition-all no-drag"
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
                            <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
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
                                <div className="p-6 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl">
                                    <p className="text-[10px] text-yellow-500/80 leading-relaxed font-medium">
                                        <strong>Dica:</strong> Atalhos globais funcionam mesmo quando o aplicativo não está em foco. Escolha combinações que não conflitem com outras ferramentas.
                                    </p>
                                </div>
                            </div>
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
