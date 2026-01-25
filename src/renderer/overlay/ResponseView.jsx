import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { Copy, RefreshCw, Settings, Minus, X } from 'lucide-react';
import clsx from 'clsx';

export default function ResponseView() {
    const [response, setResponse] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [timer, setTimer] = useState(0);
    const [error, setError] = useState(null);
    const bottomRef = useRef(null);

    // LLM Events
    useEffect(() => {
        if (!window.electronAPI) return;
        const cleanup = [
            window.electronAPI.llm.onResponseChunk((chunk) => {
                setResponse(prev => prev + chunk);
                setIsStreaming(true);
                setError(null);
            }),
            window.electronAPI.llm.onResponseStart(() => {
                setResponse('');
                setIsStreaming(true);
                setError(null);
            }),
            window.electronAPI.llm.onResponseEnd(() => {
                setIsStreaming(false);
            }),
            window.electronAPI.llm.onError((msg) => {
                setError(msg);
                setIsStreaming(false);
            })
        ];
        return () => cleanup.forEach(fn => fn && fn());
    }, []);

    // Timer
    useEffect(() => {
        const interval = setInterval(() => setTimer(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const handleEndSession = () => {
        window.electronAPI?.app?.sendAction({ action: 'stop-all' });
    };

    const handleMinimize = () => {
        window.electronAPI?.overlay?.hide();
    };

    const handleOpacityChange = async (val) => {
        setOpacity(val);
        if (window.electronAPI) {
            await window.electronAPI.settings.set('overlayOpacity', val);
        }
    };

    return (
        <div className="h-full flex flex-col bg-transparent">
            {/* Header */}
            <div className="px-4 h-12 flex-none flex items-center justify-between border-b border-white/5 bg-black/20">
                <span className="text-[10px] font-mono font-bold text-gray-500">{formatTime(timer)}</span>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleEndSession}
                        className="px-3 py-1 bg-red-600/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase rounded-md hover:bg-red-600/20 active:scale-95 transition-all"
                    >
                        Encerrar
                    </button>
                </div>
            </div>

            {/* Response Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                {error && (
                    <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                        <p className="text-[9px] font-black uppercase text-red-500 tracking-widest text-center">{error}</p>
                    </div>
                )}
                {!response && !error && (
                    <div className="h-full flex flex-col items-center justify-center text-white/5">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em]">Insights Engine Ready</p>
                    </div>
                )}
                {response && (
                    <div className="text-[13px] leading-relaxed text-white font-medium selection:bg-blue-600">
                        {response}
                    </div>
                )}
                <div ref={bottomRef} className="h-8" />
            </div>

            {/* Footer */}
            {response && (
                <div className="p-3 border-t border-white/10 bg-black/40 flex justify-end">
                    <button
                        onClick={() => navigator.clipboard.writeText(response)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-white text-[9px] font-black uppercase rounded-md hover:bg-white/10 transition-all"
                    >
                        <Copy size={12} />
                        Copiar
                    </button>
                </div>
            )}
        </div>
    );
}

