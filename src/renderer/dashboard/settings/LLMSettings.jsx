import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, Cpu, Key, Trash2 } from 'lucide-react';
import { LocalModelSettings } from './LocalModelSettings';

export function LLMSettings({ localSettings, handleChange, selectedProvider, setSelectedProvider, modelStatus, setIsModelHubOpen }) {

    // Internal state for API keys (fetched from IPC)
    const [currentProviderKeys, setCurrentProviderKeys] = useState([]);
    const [newKey, setNewKey] = useState('');

    useEffect(() => {
        if (selectedProvider) {
            window.electronAPI.settings.get('apiKeys', selectedProvider).then(keys => {
                setCurrentProviderKeys(keys || []);
            });
        }
    }, [selectedProvider]);

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

    const handleAddKey = () => {
        if (!newKey.trim()) return;
        const currentKeys = localSettings.apiKeys || {};
        const providerKeys = currentKeys[selectedProvider] || [];

        const updatedKeys = {
            ...currentKeys,
            [selectedProvider]: [...providerKeys, newKey.trim()]
        };

        // Update parent state directly so it can save later
        handleChange('apiKeys', updatedKeys);
        setCurrentProviderKeys([...providerKeys, newKey.trim()]);
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

        handleChange('apiKeys', updatedKeys);
        setCurrentProviderKeys(newProviderKeys);
    };

    const providers = [
        { id: 'google', name: 'Google Gemini' },
        { id: 'openai', name: 'OpenAI GPT' },
        { id: 'anthropic', name: 'Anthropic Claude' },
        { id: 'groq', name: 'Groq LPU' },
        { id: 'local', name: 'Local (Offline)' }
    ];

    return (
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
                <LocalModelSettings
                    localSettings={localSettings}
                    handleChange={handleChange}
                    modelStatus={modelStatus}
                    setIsModelHubOpen={setIsModelHubOpen}
                />

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
    );
}
