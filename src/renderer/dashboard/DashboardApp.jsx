import React, { useState, useCallback } from 'react';
import { AppProvider } from '../contexts/AppContext';
import { Sidebar } from './Sidebar';
import AssistantEditor from './AssistantEditor';
import SettingsModal from './SettingsModal';
import { Lightbulb, Minus, X } from 'lucide-react';
import clsx from 'clsx';

const styles = {
    appShell:
        'flex h-screen bg-[#070708] text-gray-200 overflow-hidden font-sans selection:bg-blue-500/30',
    workspace:
        'flex-1 flex flex-col min-w-0 bg-[#0a0a0c] relative shadow-[inset_1px_0_0_rgba(255,255,255,0.05)]',
    windowButtonsWrap:
        'absolute top-0 right-0 p-2 flex gap-2 z-50',
    iconButton:
        'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
    editorWrap:
        'flex-1 overflow-hidden',
    footer:
        'h-10 bg-[#0d0d0f] border-t border-white/5 flex items-center px-10 gap-3 z-40',
    footerText:
        'text-[10px] font-bold text-gray-600 uppercase tracking-widest',
    footerLink:
        'text-blue-500 cursor-pointer hover:underline'
};

function WindowControls() {
    const handleMinimize = useCallback(() => {
        window.electronAPI?.app?.minimize();
    }, []);

    const handleClose = useCallback(() => {
        window.electronAPI?.app?.close();
    }, []);

    return (
        <div className={styles.windowButtonsWrap} style={{ WebkitAppRegion: 'no-drag' }}>
            <button
                type="button"
                onClick={handleMinimize}
                className={clsx(styles.iconButton, 'text-gray-500 hover:text-white hover:bg-white/10')}
                title="Minimizar"
            >
                <Minus size={16} />
            </button>

            <button
                type="button"
                onClick={handleClose}
                className={clsx(
                    styles.iconButton,
                    'text-gray-500 hover:bg-red-500/20 hover:text-red-400 hover:text-white'
                )}
                title="Fechar"
            >
                <X size={16} />
            </button>
        </div>
    );
}

function HelpFooter() {
    return (
        <footer className={styles.footer} style={{ WebkitAppRegion: 'no-drag' }}>
            <Lightbulb size={14} className="text-yellow-500/60" />
            <p className={styles.footerText}>
                Precisa de ajuda para criar assistentes personalizados?{' '}
                <span className={styles.footerLink}>
                    Experimente nosso Gerador de Prompts →
                </span>
            </p>
        </footer>
    );
}

function DashboardContent() {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <div className={styles.appShell} style={{ WebkitAppRegion: 'no-drag' }}>
            <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

            <main className={styles.workspace} style={{ WebkitAppRegion: 'drag' }}>
                <WindowControls />

                <div className={styles.editorWrap} style={{ WebkitAppRegion: 'no-drag' }}>
                    <AssistantEditor />
                </div>

                <HelpFooter />
            </main>

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </div>
    );
}

export default function DashboardApp() {
    return (
        <AppProvider>
            <DashboardContent />
        </AppProvider>
    );
}
