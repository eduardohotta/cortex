import React from 'react';

export function HotkeyInput({ label, description, value, onChange }) {
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
