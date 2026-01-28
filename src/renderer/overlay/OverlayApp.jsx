import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AppProvider, useApp } from '../contexts/AppContext';
import TranscriptionView from './TranscriptionView';
import ResponseView from './ResponseView';
import FloatingRemote from '../components/FloatingRemote';
import { Settings, Minus } from 'lucide-react';
import clsx from 'clsx';

function WindowWrapper({ title, children, transparent = true, viewType }) {
    const [opacity, setOpacity] = useState(90);
    const [showOpacitySlider, setShowOpacitySlider] = useState(false);
    const sliderRef = useRef(null);

    useEffect(() => {
        if (!window.electronAPI) return;

        window.electronAPI.settings.get('overlayOpacity').then(val => {
            if (val != null) setOpacity(Number(val));
        });

        const unsub = window.electronAPI.settings.onSettingsChanged(({ key, value }) => {
            if (key === 'overlayOpacity' && value != null) setOpacity(Number(value));
        });

        return () => unsub && unsub();
    }, []);

    useEffect(() => {
        const onDocDown = (e) => {
            if (!showOpacitySlider) return;
            if (!sliderRef.current) return;
            if (sliderRef.current.contains(e.target)) return;
            setShowOpacitySlider(false);
        };

        document.addEventListener('pointerdown', onDocDown);
        return () => document.removeEventListener('pointerdown', onDocDown);
    }, [showOpacitySlider]);

    const handleOpacityChange = async (val) => {
        const clamped = Math.max(20, Math.min(100, Number(val)));
        setOpacity(clamped);
        if (window.electronAPI) {
            await window.electronAPI.settings.set('overlayOpacity', clamped);
        }
    };

    const handleMinimize = () => {
        window.electronAPI?.overlay?.hide();
    };

    const handleOpenSettings = () => {
        window.electronAPI?.app?.showDashboard();
    };

    return (
        <div
            className={clsx(
                'flex flex-col h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl transition-opacity duration-300',
                transparent ? 'bg-[#070708]/90 backdrop-blur-2xl' : 'bg-[#070708]'
            )}
            style={{ opacity: opacity / 100 }}
        >
            <header
                className="h-11 flex-none flex items-center justify-between px-4 border-b border-white/10 text-white select-none"
                style={{ WebkitAppRegion: 'drag' }}
            >
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-80 pointer-events-none">
                    {title}
                </span>

                <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
                    <div ref={sliderRef} className="relative flex items-center">
                        <button
                            onClick={() => setShowOpacitySlider(v => !v)}
                            className={clsx(
                                "p-2 rounded-lg transition-all",
                                showOpacitySlider ? "text-white bg-white/10" : "text-gray-500 hover:text-white hover:bg-white/5"
                            )}
                            title="Opacidade"
                            type="button"
                        >
                            <span className="text-[10px] font-mono leading-none">{opacity}%</span>
                        </button>

                        {showOpacitySlider && (
                            <div className="absolute right-0 top-full mt-2 w-32 bg-[#121214] border border-white/10 rounded-xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2">
                                <input
                                    type="range"
                                    min="20"
                                    max="100"
                                    value={opacity}
                                    onChange={(e) => handleOpacityChange(parseInt(e.target.value, 10))}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleOpenSettings}
                        className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                        title="Configurações"
                        type="button"
                    >
                        <Settings size={14} />
                    </button>

                    {viewType !== 'remote' && (
                        <button
                            onClick={handleMinimize}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                            title="Fechar"
                            type="button"
                        >
                            <Minus size={14} />
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 min-h-0 overflow-hidden" style={{ WebkitAppRegion: 'no-drag' }}>
                {children}
            </main>
        </div>
    );
}

function OverlayContent() {
    const [view, setView] = useState(null);

    const resolveView = useCallback(async () => {
        if (window.electronAPI?.getOverlayView) {
            const v = await window.electronAPI.getOverlayView();
            if (v) {
                setView(v);
                return;
            }
        }

        const hash = window.location.hash.replace('#', '');
        if (hash) {
            setView(hash);
            return;
        }

        setView('remote');
    }, []);

    useEffect(() => {
        let mounted = true;

        const run = async () => {
            if (!mounted) return;
            await resolveView();
        };

        run();
        window.addEventListener('hashchange', run);

        return () => {
            mounted = false;
            window.removeEventListener('hashchange', run);
        };
    }, [resolveView]);

    if (!view) {
        return (
            <div className="h-full w-full flex items-center justify-center text-xs text-white/50">
                Initializing overlay…
            </div>
        );
    }

    if (view === 'remote') {
        return (
            <div className="h-full w-full flex items-end justify-center bg-transparent pb-1">
                <div className="animate-in fade-in slide-in-from-bottom-2">
                    <FloatingRemote standalone />
                </div>
            </div>
        );
    }

    if (view === 'transcription') {
        return (
            <WindowWrapper title="Transcrição de Voz" viewType="transcription">
                <TranscriptionView />
            </WindowWrapper>
        );
    }

    if (view === 'response') {
        return (
            <WindowWrapper title="Resposta da IA" viewType="response">
                <ResponseView />
            </WindowWrapper>
        );
    }

    return (
        <div className="h-full w-full flex items-center justify-center text-red-500 text-sm font-bold">
            VIEW "{view}" NOT FOUND
        </div>
    );
}

export default function OverlayApp() {
    return (
        <AppProvider>
            <div className="h-full w-full">
                <OverlayContent />
            </div>
        </AppProvider>
    );
}
