import React, { useState, useEffect, useRef } from 'react';
import { AppProvider } from '../contexts/AppContext';
import { Sidebar } from './Sidebar';
import AssistantEditor from './AssistantEditor';
import SettingsModal from './SettingsModal';
import FloatingRemote from '../components/FloatingRemote';
import { Lightbulb, Minus, X } from 'lucide-react';

function DashboardContent() {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <div
            className="flex h-screen bg-[#070708] text-gray-200 overflow-hidden font-sans selection:bg-blue-500/30"
            style={{ WebkitAppRegion: 'drag' }}
        >

            {/* Navigation Layer (Integrated vs Personalized list) */}
            <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

            {/* Workspace Layer */}
            <main
                className="flex-1 flex flex-col min-w-0 bg-[#0a0a0c] relative shadow-[inset_1px_0_0_rgba(255,255,255,0.05)]"
                style={{ WebkitAppRegion: 'drag' }}
            >
                {/* Custom Window Controls */}
                <div className="absolute top-0 right-0 p-2 flex gap-2 z-50" style={{ WebkitAppRegion: 'no-drag' }}>
                    <button
                        onClick={() => window.electronAPI?.app?.minimize()}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                        title="Minimizar"
                    >
                        <Minus size={16} />
                    </button>
                    <button
                        onClick={() => window.electronAPI?.app?.close()}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-red-500/20 hover:text-red-400 transition-all"
                        title="Fechar"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden">
                    <AssistantEditor />
                </div>

                {/* Bottom Global Status Bar (Image 2 style) */}
                <footer className="h-10 bg-[#0d0d0f] border-t border-white/5 flex items-center px-10 gap-3 z-40 no-drag">
                    <Lightbulb size={14} className="text-yellow-500/60" />
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                        Precisa de ajuda para criar assistentes personalizados? <span className="text-blue-500 cursor-pointer hover:underline">Experimente nosso Gerador de Prompts →</span>
                    </p>
                </footer>
            </main>

            {/* Global Config Portal */}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
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
