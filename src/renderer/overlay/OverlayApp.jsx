import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from '../contexts/AppContext';
import TranscriptionView from './TranscriptionView';
import ResponseView from './ResponseView';
import FloatingRemote from '../components/FloatingRemote';
import clsx from 'clsx';

/**
 * WindowWrapper
 * - Header draggable (Electron)
 * - Conteúdo responsivo
 */
function WindowWrapper({ title, children, transparent = true }) {
    return (
        <div
            className={clsx(
                'flex flex-col h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl',
                transparent ? 'bg-[#070708]/90 backdrop-blur-2xl' : 'bg-[#070708]'
            )}
        >
            {/* Drag Header */}
            <header
                className="h-11 flex items-center justify-between px-4 border-b border-white/10 text-white"
                style={{ WebkitAppRegion: 'drag' }}
            >
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-80 pointer-events-none">
                    {title}
                </span>

                {/* área reservada para botões futuros */}
                <div
                    className="flex gap-2"
                    style={{ WebkitAppRegion: 'no-drag' }}
                />
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
            <WindowWrapper title="Transcrição de Voz">
                <TranscriptionView />
            </WindowWrapper>
        );
    }

    // ===== RESPONSE =====
    if (view === 'response') {
        return (
            <WindowWrapper title="Resposta da IA">
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
