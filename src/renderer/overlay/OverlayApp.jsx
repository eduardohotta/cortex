import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from '../contexts/AppContext';
import TranscriptionView from './TranscriptionView';
import ResponseView from './ResponseView';
import FloatingRemote from '../components/FloatingRemote';
import { Settings, Minus, X } from 'lucide-react';
import clsx from 'clsx';

/**
 * WindowWrapper
 * - Header draggable (Electron)
 * - Conteúdo responsivo
 */
function WindowWrapper({ title, children, transparent = true, viewType }) {
    const [opacity, setOpacity] = useState(90);
    const [showOpacitySlider, setShowOpacitySlider] = useState(false);

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.settings.get('overlayOpacity').then(val => {
                if (val) setOpacity(val);
            });
        }
    }, []);

    const handleOpacityChange = async (val) => {
        setOpacity(val);
        if (window.electronAPI) {
            await window.electronAPI.settings.set('overlayOpacity', val);
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
            {/* Drag Header */}
            <header
                className="h-11 flex-none flex items-center justify-between px-4 border-b border-white/10 text-white select-none"
                style={{ WebkitAppRegion: 'drag' }}
            >
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-80 pointer-events-none">
                    {title}
                </span>

                <div
                    className="flex items-center gap-1"
                    style={{ WebkitAppRegion: 'no-drag' }}
                >
                    {/* Opacity Control */}
                    <div className="relative flex items-center">
                        <button
                            onClick={() => setShowOpacitySlider(!showOpacitySlider)}
                            className={clsx(
                                "p-2 rounded-lg transition-all",
                                showOpacitySlider ? "text-white bg-white/10" : "text-gray-500 hover:text-white hover:bg-white/5"
                            )}
                            title="Opacidade"
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
                                    onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                        )}
                    </div>

                    {/* Settings Button */}
                    <button
                        onClick={handleOpenSettings}
                        className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                        title="Configurações"
                    >
                        <Settings size={14} />
                    </button>

                    {/* Minimize Button - Hidden for remote as per user request */}
                    {viewType !== 'remote' && (
                        <button
                            onClick={handleMinimize}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                            title="Fechar"
                        >
                            <Minus size={14} />
                        </button>
                    )}
                </div>
            </header>

            {/* Content */}
            <main
                className="flex-1 min-h-0 overflow-hidden"
                style={{ WebkitAppRegion: 'no-drag' }}
            >
                {children}
            </main>
        </div>
    );
}

/**
 * OverlayContent
 * Resolve view de forma segura
 */
function OverlayContent() {
    const { state } = useApp(); // pronto para reagir a panic / agent / etc
    const [view, setView] = useState(null);

    useEffect(() => {
        let mounted = true;

        async function resolveView() {
            // 1. Electron preload (FONTE PRIMÁRIA - via additionalArguments)
            if (window.electronAPI?.getOverlayView) {
                const v = await window.electronAPI.getOverlayView();
                console.log('[Overlay] View from Electron:', v);
                if (v && mounted) {
                    setView(v);
                    return;
                }
            }

            // 2. URL hash (dev / debug fallback)
            const hash = window.location.hash.replace('#', '');
            console.log('[Overlay] View from hash:', hash);
            if (hash) {
                setView(hash);
                return;
            }

            // 3. fallback final
            console.log('[Overlay] Using fallback: remote');
            setView('remote');
        }

        resolveView();
        window.addEventListener('hashchange', resolveView);

        return () => {
            mounted = false;
            window.removeEventListener('hashchange', resolveView);
        };
    }, []);

    if (!view) {
        return (
            <div className="h-full w-full flex items-center justify-center text-xs text-white/50">
                Initializing overlay…
            </div>
        );
    }

    // ===== REMOTE (barra flutuante) =====
    if (view === 'remote') {
        return (
            <div className="h-full w-full flex items-center justify-center bg-transparent">
                <FloatingRemote standalone />
            </div>
        );
    }

    // ===== TRANSCRIPTION =====
    if (view === 'transcription') {
        return (
            <WindowWrapper title="Transcrição de Voz" viewType="transcription">
                <TranscriptionView />
            </WindowWrapper>
        );
    }

    // ===== RESPONSE =====
    if (view === 'response') {
        return (
            <WindowWrapper title="Resposta da IA" viewType="response">
                <ResponseView />
            </WindowWrapper>
        );
    }

    // ===== ERROR =====
    return (
        <div className="h-full w-full flex items-center justify-center text-red-500 text-sm font-bold">
            VIEW "{view}" NOT FOUND
        </div>
    );
}

/**
 * OverlayApp
 */
export default function OverlayApp() {
    return (
        <AppProvider>
            <div className="h-full w-full">
                <OverlayContent />
            </div>
        </AppProvider>
    );
}
