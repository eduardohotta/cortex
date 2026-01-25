import React from 'react';
import { clsx } from 'clsx';
import { useApp, ACTIONS } from '../contexts/AppContext';
import { Bot, Plus, Trash2, Settings, UserPlus, LogOut, Cpu, Command } from 'lucide-react';

export function Sidebar({ onOpenSettings }) {
    const { state, dispatch } = useApp();
    const { assistants, currentAssistantId } = state;

    const handleSelect = (id) => {
        dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: id });
    };

    const handleCreate = async () => {
        const newId = `assistant_${Date.now()}`;
        await window.electronAPI.settings.saveProfile(newId, {
            name: 'Novo Assistente',
            systemPrompt: 'Você é um assistente útil...',
            assistantInstructions: 'Seja conciso.',
            additionalContext: ''
        });

        const updated = await window.electronAPI.settings.getProfiles();
        dispatch({ type: ACTIONS.SET_ASSISTANTS, payload: updated });
        dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: newId });
    };

    const handleDelete = async (id, name) => {
        const confirmed = confirm(`Tem certeza que deseja deletar o assistente "${name}"?`);
        if (!confirmed) return;

        await window.electronAPI.settings.deleteProfile(id);
        const updated = await window.electronAPI.settings.getProfiles();
        dispatch({ type: ACTIONS.SET_ASSISTANTS, payload: updated });

        // Se deletou o assistente ativo, seleciona o primeiro disponível
        if (currentAssistantId === id && updated.length > 0) {
            dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: updated[0].id });
        }
    };

    return (
        <aside className="w-80 bg-[#070708] border-r border-white/10 flex flex-col h-screen flex-shrink-0">
            {/* Minimal Brand Area */}
            <div className="p-10 flex flex-col gap-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-2xl">
                        <Command size={26} className="text-black" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-widest text-white">Pilot Suite</span>
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">v2.8.5 Stable</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] pl-2">Meus Assistentes</span>
                    {assistants.map(a => (
                        <button
                            key={a.id}
                            onClick={() => handleSelect(a.id)}
                            className={clsx(
                                'w-full group flex flex-col p-5 rounded-2xl transition-all duration-300 border text-left relative',
                                currentAssistantId === a.id
                                    ? 'bg-blue-600 border-blue-500 shadow-2xl translate-x-1'
                                    : 'border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                            )}
                        >
                            <div className="flex items-center justify-between w-full mb-1">
                                <span className={clsx(
                                    "text-xs font-black tracking-tight uppercase",
                                    currentAssistantId === a.id ? "text-white" : "text-gray-400 group-hover:text-white"
                                )}>
                                    {a.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    {currentAssistantId === a.id && (
                                        <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                    )}
                                    {/* Delete Button */}
                                    {a.id !== 'default' && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(a.id, a.name);
                                            }}
                                            className={clsx(
                                                "p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all",
                                                currentAssistantId === a.id
                                                    ? "text-white/60 hover:text-white hover:bg-white/20"
                                                    : "text-gray-600 hover:text-red-500 hover:bg-red-500/10"
                                            )}
                                            title="Deletar assistente"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <span className={clsx(
                                "text-[9px] font-bold uppercase tracking-widest",
                                currentAssistantId === a.id ? "text-white/60" : "text-gray-700"
                            )}>
                                {a.id.startsWith('assistant_') ? 'Personalizado' : 'Sistema'}
                            </span>
                        </button>
                    ))}

                    <button
                        onClick={handleCreate}
                        className="w-full mt-4 flex items-center gap-4 p-5 border-2 border-dashed border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-gray-600 hover:border-blue-500/30 hover:text-blue-400 hover:bg-blue-500/5 transition-all"
                    >
                        <Plus size={18} /> Novo Persona
                    </button>
                </div>
            </div>

            <div className="mt-auto p-8 border-t border-white/5 bg-black/20 space-y-2">
                <button
                    onClick={onOpenSettings}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                >
                    <Settings size={20} /> Cockpit
                </button>
                <button
                    onClick={() => window.electronAPI.app.panic()}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-900 hover:text-red-500 transition-all"
                >
                    <LogOut size={20} /> Finalizar
                </button>
            </div>
        </aside>
    );
}
