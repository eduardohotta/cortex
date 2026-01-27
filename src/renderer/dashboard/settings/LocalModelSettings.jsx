import React from 'react';
import { HardDrive } from 'lucide-react';

export function LocalModelSettings({ localSettings, handleChange, modelStatus, setIsModelHubOpen }) {
    if (localSettings.llmProvider !== 'local') return null;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-top-4">

            {/* 1. SELEÇÃO DE MODELO */}
            <div className="p-6 bg-purple-900/10 border border-purple-500/30 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <HardDrive className="text-purple-400" size={20} />
                        <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest">Motor Offline Ativo</h4>
                    </div>
                    <button
                        onClick={() => setIsModelHubOpen(true)}
                        className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-purple-500/20"
                    >
                        Gerenciar Modelos
                    </button>
                </div>

                <div className="p-4 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between">
                    <span className="text-xs font-mono text-white truncate">
                        {localSettings.localModel || 'Nenhum modelo selecionado'}
                    </span>
                    {localSettings.localModel && (
                        <div className="flex gap-2">
                            <span className="px-2 py-1 rounded bg-white/10 text-[9px] text-gray-400 font-mono">GGUF</span>
                            <span className="px-2 py-1 rounded bg-white/10 text-[9px] text-gray-400 font-mono">4-bit</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 2. ESTADO DO MODELO (Monitoramento) */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-gray-500 pl-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest">Monitoramento de Contexto</h4>
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono uppercase">
                        <span>Uso de Contexto</span>
                        <span>{modelStatus.usedTokens || 0} / {localSettings.contextSize || 4096} tokens</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                            style={{ width: `${Math.min(((modelStatus.usedTokens || 0) / (localSettings.contextSize || 4096)) * 100, 100)}%` }}
                        />
                    </div>

                    <p className="text-[9px] text-gray-600 leading-relaxed">
                        O contexto inclui o histórico da conversa e instruções do sistema.
                        Se atingir 100%, as mensagens mais antigas serão esquecidas.
                    </p>
                </div>
            </div>

            {/* 3. GERAÇÃO (Sampling) */}
            <div className="space-y-6">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1 border-b border-white/5 pb-2">Parâmetros de Geração</h4>

                <div className="grid grid-cols-2 gap-6 p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                    {/* Temperature */}
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-bold text-gray-300">Temperatura</label>
                            <span className="text-[10px] font-mono text-blue-400">{localSettings.temperature || 0.7}</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="2" step="0.1"
                            value={localSettings.temperature || 0.7}
                            onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                            className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                        <p className="text-[9px] text-gray-600">Criatividade vs Precisão</p>
                    </div>

                    {/* Top P */}
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-bold text-gray-300">Top P</label>
                            <span className="text-[10px] font-mono text-blue-400">{localSettings.topP || 0.9}</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="1" step="0.05"
                            value={localSettings.topP || 0.9}
                            onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
                            className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                        <p className="text-[9px] text-gray-600">Diversidade de vocabulário</p>
                    </div>

                    {/* Top K */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-300">Top K</label>
                        <input
                            type="number"
                            value={localSettings.localTopK || 40}
                            onChange={(e) => handleChange('localTopK', parseInt(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500/50 outline-none"
                        />
                    </div>

                    {/* Repetition Penalty */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-300">Penalidade Repetição</label>
                        <input
                            type="number" step="0.05"
                            value={localSettings.localRepetitionPenalty || 1.15}
                            onChange={(e) => handleChange('localRepetitionPenalty', parseFloat(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500/50 outline-none"
                        />
                    </div>

                    {/* Max Tokens */}
                    <div className="col-span-2 space-y-3 pt-2 border-t border-white/5">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-bold text-gray-300">Máximo de Tokens (Resposta)</label>
                            <span className="text-[10px] font-mono text-blue-400">{localSettings.maxTokens || 512}</span>
                        </div>
                        <input
                            type="range"
                            min="64" max="4096" step="64"
                            value={localSettings.maxTokens || 512}
                            onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                            className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>

                {/* Presets */}
                <div className="flex gap-2">
                    {[
                        { name: 'Técnico', temp: 0.3, topP: 0.9, topK: 40, rep: 1.15 },
                        { name: 'RH / Comportamental', temp: 0.7, topP: 0.95, topK: 60, rep: 1.1 },
                        { name: 'Criativo', temp: 0.9, topP: 1.0, topK: 100, rep: 1.05 }
                    ].map(preset => (
                        <button
                            key={preset.name}
                            onClick={() => {
                                handleChange('temperature', preset.temp);
                                handleChange('topP', preset.topP);
                                handleChange('localTopK', preset.topK);
                                handleChange('localRepetitionPenalty', preset.rep);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[9px] font-bold uppercase hover:bg-white/10 hover:border-white/20 transition-all text-gray-400 hover:text-white"
                        >
                            {preset.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* 4. PERFORMANCE */}
            <div className="space-y-6">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1 border-b border-white/5 pb-2">Performance & Hardware</h4>

                <div className="grid grid-cols-2 gap-6 p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-300">Threads de CPU</label>
                        <input
                            type="number"
                            value={localSettings.localThreads || 4}
                            onChange={(e) => handleChange('localThreads', parseInt(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500/50 outline-none"
                        />
                        <p className="text-[9px] text-gray-600">Recomendado: Nº núcleos físicos</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-300">GPU Layers (Offload)</label>
                        <input
                            type="number"
                            value={localSettings.localGpuLayers || 0}
                            onChange={(e) => handleChange('localGpuLayers', parseInt(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500/50 outline-none"
                        />
                        <p className="text-[9px] text-gray-600">0 = Apenas CPU. Aumente se tiver GPU.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-300">Batch Size</label>
                        <select
                            value={localSettings.localBatchSize || 512}
                            onChange={(e) => handleChange('localBatchSize', parseInt(e.target.value))}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500/50 outline-none cursor-pointer"
                        >
                            <option value="256">256</option>
                            <option value="512">512 (Padrão)</option>
                            <option value="1024">1024</option>
                            <option value="2048">2048</option>
                        </select>
                    </div>

                    <div className="flex items-center justify-center p-4 bg-yellow-500/5 rounded-xl border border-yellow-500/10 col-span-2">
                        <p className="text-[10px] text-yellow-500/80 text-center">
                            ⚠️ Alterações nesta seção requerem re-carregamento do modelo.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
