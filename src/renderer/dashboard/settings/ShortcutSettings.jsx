import React from 'react';
import { HotkeyInput } from './HotkeyInput';

export function ShortcutSettings({ localSettings, handleChange }) {
    return (
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

                    <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/5 transition-colors group">
                        <div className="space-y-1">
                            <div className="text-[11px] font-bold text-gray-300">Click-to-Explain Modifier</div>
                            <div className="text-[9px] text-gray-500">Segure esta tecla e clique em uma palavra para definição</div>
                        </div>
                        <select
                            value={localSettings.hotkeyExplain || 'ctrl'}
                            onChange={(e) => handleChange('hotkeyExplain', e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-lg text-xs font-mono text-blue-400 px-2 py-1.5 min-w-[80px] text-center hover:border-blue-500/50 transition-all cursor-pointer outline-none"
                        >
                            <option value="ctrl">Ctrl</option>
                            <option value="alt">Alt</option>
                            <option value="shift">Shift</option>
                            <option value="meta">Win/Cmd</option>
                        </select>
                    </div>
                </div>
            </div>
            <div className="p-6 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl">
                <p className="text-[10px] text-yellow-500/80 leading-relaxed font-medium">
                    <strong>Dica:</strong> Atalhos globais funcionam mesmo quando o aplicativo não está em foco. Escolha combinações que não conflitem com outras ferramentas.
                </p>
            </div>
        </div>
    );
}
