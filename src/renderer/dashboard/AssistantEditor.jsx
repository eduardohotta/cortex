import React, { useState, useEffect } from 'react';
import { useApp, ACTIONS } from '../contexts/AppContext';
import { Button } from '../components/Button';
import { Save, Bot, MessageSquare, StickyNote, Sparkles, CheckCircle2, AlertCircle, Terminal, UserSearch } from 'lucide-react';
import clsx from 'clsx';

export default function AssistantEditor() {
    const { state, dispatch } = useApp();
    const { currentAssistantId, assistants } = state;

    // Local state for form
    const [formData, setFormData] = useState({
        name: '',
        systemPrompt: '',
        assistantInstructions: '',
        additionalContext: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('sistema');
    const [showStatus, setShowStatus] = useState(false);

    // Initial Load
    useEffect(() => {
        if (!currentAssistantId) return;

        const load = async () => {
            setIsLoading(true);
            try {
                const meta = assistants.find(a => a.id === currentAssistantId);
                const profile = await window.electronAPI.settings.loadProfile(currentAssistantId);

                setFormData({
                    name: meta?.name || profile?.name || 'Assistente',
                    systemPrompt: profile?.systemPrompt || '',
                    assistantInstructions: profile?.assistantInstructions || '',
                    additionalContext: profile?.additionalContext || ''
                });
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [currentAssistantId, assistants]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (showStatus) setShowStatus(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await window.electronAPI.settings.saveProfile(currentAssistantId, formData);
            const updated = await window.electronAPI.settings.getProfiles();
            dispatch({ type: ACTIONS.SET_ASSISTANTS, payload: updated });
            setShowStatus(true);
            setTimeout(() => setShowStatus(false), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    if (!currentAssistantId) return null;

    return (
        <div className="flex flex-col h-full bg-[#0a0a0c] animate-in fade-in duration-700 p-12">

            {/* Header: Assistant Name (Centered or Left as per Image 2) */}
            <div className="flex justify-center mb-10">
                <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-6 py-2 text-sm font-bold text-gray-400 focus:text-white outline-none w-auto text-center placeholder:opacity-20"
                    placeholder="Assistant Name (optional)"
                />
            </div>

            {/* Main Editor Card */}
            <div className="flex-1 flex flex-col bg-[#0d0d0f] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">

                {/* Tabs Area */}
                <div className="flex border-b border-white/5">
                    <button
                        onClick={() => setActiveTab('sistema')}
                        className={clsx(
                            "flex items-center gap-3 px-10 py-5 text-[10px] font-black uppercase tracking-widest transition-all relative",
                            activeTab === 'sistema' ? "text-white" : "text-gray-600 hover:text-gray-400"
                        )}
                    >
                        <Bot size={16} /> Sistema
                        {activeTab === 'sistema' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_-4px_10px_rgba(59,130,246,0.5)]" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('acompanhamento')}
                        className={clsx(
                            "flex items-center gap-3 px-10 py-5 text-[10px] font-black uppercase tracking-widest transition-all relative",
                            activeTab === 'acompanhamento' ? "text-white" : "text-gray-600 hover:text-gray-400"
                        )}
                    >
                        <MessageSquare size={16} /> Acompanhamento
                        {activeTab === 'acompanhamento' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_-4px_10px_rgba(59,130,246,0.5)]" />}
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-10 flex flex-col gap-8">
                    {activeTab === 'sistema' ? (
                        <div className="flex-1 flex flex-col animate-in fade-in duration-300">
                            <div className="flex items-center gap-3 mb-4 text-gray-700">
                                <Terminal size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest">System Prompt (Cognição)</span>
                            </div>
                            <textarea
                                value={formData.systemPrompt}
                                onChange={(e) => handleChange('systemPrompt', e.target.value)}
                                className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-8 text-sm leading-relaxed text-gray-400 focus:text-gray-200 outline-none resize-none transition-all placeholder:text-gray-800"
                                placeholder="Digite o prompt do sistema..."
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col animate-in fade-in duration-300">
                            <div className="flex items-center gap-3 mb-4 text-gray-700">
                                <UserSearch size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Base de Conhecimento (Contexto)</span>
                            </div>
                            <textarea
                                value={formData.additionalContext}
                                onChange={(e) => handleChange('additionalContext', e.target.value)}
                                className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-8 text-sm leading-relaxed text-gray-400 focus:text-gray-200 outline-none resize-none transition-all placeholder:text-gray-800"
                                placeholder="Insira o contexto ou instruções de acompanhamento..."
                            />
                        </div>
                    )}

                    {/* Checkbox Example from Image 2 */}
                    <div className="flex items-center gap-4 px-2">
                        <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all">
                            <CheckCircle2 size={16} className="text-gray-700" />
                        </div>
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Responder apenas quando tiver certeza</span>
                    </div>

                    {/* Status Alert (Image 2 style) */}
                    <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center gap-3">
                        <AlertCircle size={14} className="text-blue-500" />
                        <p className="text-[10px] text-blue-500/80 font-bold uppercase tracking-wider">
                            Quando ativado, o assistente só responderá questões técnicas validadas.
                        </p>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-8 border-t border-white/5 bg-black/40 flex justify-end items-center gap-6">
                    {showStatus && (
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500 animate-in fade-in zoom-in duration-300">
                            Persona salva com sucesso
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-12 py-4 bg-white hover:bg-gray-200 text-black rounded-2xl flex items-center gap-3 font-black text-[11px] uppercase tracking-widest shadow-2xl active:scale-95 transition-all disabled:opacity-50"
                    >
                        <Save size={16} /> Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
