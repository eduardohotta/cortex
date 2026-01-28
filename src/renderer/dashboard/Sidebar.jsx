import React from 'react';
import { clsx } from 'clsx';
import { useApp, ACTIONS } from '../contexts/AppContext';
import { Bot, Plus, Trash2, Settings, UserPlus, LogOut, Cpu, Command, Copy } from 'lucide-react';

export function Sidebar({ onOpenSettings }) {
    const { state, dispatch } = useApp();
    const { assistants, currentAssistantId } = state;

    const handleSelect = async (id) => {
        dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: id });
        // Persist to backend so LLM service knows which one is active
        if (window.electronAPI) {
            await window.electronAPI.settings.set('currentAssistantId', id);
        }
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

    const handleClone = async (id, name) => {
        const original = assistants.find(a => a.id === id);
        if (!original) return;

        const newId = `assistant_${Date.now()}`;
        // Exclude ID from the data we send to saveProfile, as saveProfile takes ID as first arg
        // and likely merges the second arg.
        const { id: _, ...dataToClone } = original;

        await window.electronAPI.settings.saveProfile(newId, {
            ...dataToClone,
            name: `${name} (Cópia)`
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
        <aside className="w-80 bg-[#070708] border-r border-white/5 flex flex-col h-screen flex-shrink-0">

            {/* ================= BRAND ================= */}
            <div className="px-8 pt-8 pb-4 flex flex-col gap-6 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center shadow-[0_10px_40px_rgba(255,255,255,0.15)]">
                            <Command size={24} className="text-black" />
                        </div>

                        <div className="flex flex-col leading-tight">
                            <span className="text-[11px] font-black uppercase tracking-widest text-white">
                                CORTEX
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-gray-600">
                                v1.0.0
                            </span>
                        </div>
                    </div>

                    <div className="p-2 text-gray-700">
                        <Bot size={18} strokeWidth={1} />
                    </div>
                </div>
            </div>

            {/* ================= LIST ================= */}
            <div className="flex-1 overflow-y-auto px-6 pb-4 custom-scrollbar" style={{ WebkitAppRegion: 'no-drag' }}>
                <div className="space-y-3">

                    <span className="block text-[9px] font-black uppercase tracking-[0.35em] text-gray-400 px-2 mb-2">
                        Assistentes
                    </span>

                    {assistants.map(a => {
                        const active = currentAssistantId === a.id;

                        return (
                            <button
                                key={a.id}
                                onClick={() => handleSelect(a.id)}
                                className={clsx(
                                    "group relative w-full rounded-xl border px-4 py-3 text-left transition-all duration-200",
                                    active
                                        ? "bg-blue-600/15 border-blue-500/40 shadow-[0_10px_30px_rgba(59,130,246,0.25)] translate-x-1"
                                        : "bg-black/20 border-white/5 hover:bg-white/[0.04] hover:border-white/10"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span
                                        className={clsx(
                                            "text-[11px] font-black uppercase tracking-tight",
                                            active
                                                ? "text-white"
                                                : "text-gray-400 group-hover:text-white"
                                        )}
                                    >
                                        {a.name}
                                    </span>

                                    <div className="flex items-center gap-1">
                                        {active && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.9)] mr-1" />
                                        )}

                                        {/* Clone */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleClone(a.id, a.name);
                                            }}
                                            className={clsx(
                                                "p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all",
                                                active
                                                    ? "text-white/60 hover:text-white hover:bg-white/10"
                                                    : "text-gray-600 hover:text-blue-400 hover:bg-blue-500/10"
                                            )}
                                            title="Clonar"
                                        >
                                            <Copy size={13} />
                                        </button>

                                        {/* Delete */}
                                        {a.id !== 'default' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(a.id, a.name);
                                                }}
                                                className={clsx(
                                                    "p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all",
                                                    active
                                                        ? "text-white/60 hover:text-white hover:bg-white/10"
                                                        : "text-gray-600 hover:text-red-500 hover:bg-red-500/10"
                                                )}
                                                title="Excluir"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <span
                                    className={clsx(
                                        "text-[8px] font-bold uppercase tracking-widest",
                                        active ? "text-white/50" : "text-gray-700"
                                    )}
                                >
                                    {a.id.startsWith('assistant_') ? 'Personalizado' : 'Sistema'}
                                </span>
                            </button>
                        );
                    })}

                    {/* Create */}
                    <button
                        onClick={handleCreate}
                        className="mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-xl
                                border border-dashed border-white/10
                                text-[9px] font-black uppercase tracking-[0.25em]
                                text-gray-400 hover:text-blue-400
                                hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
                    >
                        <Plus size={16} /> Novo Assistente
                    </button>
                </div>
            </div>

            {/* ================= FOOTER ================= */}
            <div className="px-6 py-5 border-t border-white/5 bg-black/30 space-y-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>

                <button
                    onClick={onOpenSettings}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
                           text-[9px] font-black uppercase tracking-widest
                           text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                >
                    <Settings size={18} /> Configurações
                </button>

                <button
                    onClick={() => window.electronAPI.app.panic()}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
                           text-[9px] font-black uppercase tracking-widest
                           text-red-900 hover:text-red-500 hover:bg-red-500/10 transition-all"
                >
                    <LogOut size={18} /> Finalizar
                </button>

            </div>
        </aside>
    );

}
