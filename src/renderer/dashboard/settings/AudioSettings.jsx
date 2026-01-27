import React from 'react';
import { Headphones, Speaker } from 'lucide-react';

export function AudioSettings({ localSettings, handleChange, audioDevices }) {
    return (
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
    );
}
