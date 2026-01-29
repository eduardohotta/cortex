import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { useApp, ACTIONS } from '../contexts/AppContext';
import { Bot, Plus, Trash2, Settings, LogOut, Command, Copy } from 'lucide-react';

const styles = {
    aside: 'w-80 bg-[#070708] border-r border-white/5 flex flex-col h-screen flex-shrink-0',
    brandWrap: 'px-7 pt-7 pb-4 flex flex-col gap-5 shrink-0',
    brandRow: 'flex items-center justify-between',
    brandLeft: 'flex items-center gap-3',
    brandLogo: 'w-11 h-11 rounded-2xl bg-white flex items-center justify-center shadow-[0_10px_40px_rgba(255,255,255,0.15)]',
    brandText: 'flex flex-col leading-tight',
    brandTitle: 'text-[11px] font-black uppercase tracking-widest text-white',
    brandVersion: 'text-[9px] font-bold uppercase tracking-[0.25em] text-gray-600',

    listWrap: 'flex-1 overflow-y-auto px-6 pb-4 custom-scrollbar',
    sectionTitle: 'block text-[9px] font-black uppercase tracking-[0.35em] text-gray-400 px-2 mb-2',
    list: 'space-y-2',

    itemBtn: 'group relative w-full rounded-xl border px-4 py-3 text-left transition-all duration-150',
    itemActive: 'bg-blue-600/15 border-blue-500/40 shadow-[0_10px_30px_rgba(59,130,246,0.20)] translate-x-1',
    itemIdle: 'bg-black/20 border-white/5 hover:bg-white/[0.04] hover:border-white/10',

    itemName: 'text-[11px] font-black uppercase tracking-tight',
    itemMeta: 'text-[8px] font-bold uppercase tracking-widest',

    actions: 'flex items-center gap-1',
    iconBtn: 'p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all',
    iconBtnActive: 'text-white/60 hover:text-white hover:bg-white/10',
    iconBtnIdle: 'text-gray-600 hover:bg-white/5 hover:text-gray-200',

    createBtn:
        'mt-3 w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-white/10 ' +
        'text-[9px] font-black uppercase tracking-[0.25em] text-gray-400 hover:text-blue-400 ' +
        'hover:border-blue-500/40 hover:bg-blue-500/5 transition-all',

    footer: 'px-6 py-5 border-t border-white/5 bg-black/30 space-y-2 shrink-0',
    footerBtn:
        'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all',
    footerBtnIdle: 'text-gray-500 hover:text-white hover:bg-white/5',
    footerBtnDanger: 'text-red-900 hover:text-red-500 hover:bg-red-500/10'
};

const makeId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `assistant_${Date.now()}`;
};

export function Sidebar({ onOpenSettings }) {
    const { state, dispatch } = useApp();
    const { assistants, currentAssistantId } = state;

    const api = window.electronAPI;

    const byId = useMemo(() => {
        const m = new Map();
        for (const a of assistants) m.set(a.id, a);
        return m;
    }, [assistants]);

    const persistActive = useCallback(async (id) => {
        try {
            await api?.settings?.set('currentAssistantId', id);
        } catch (e) {
            console.error('Failed to persist currentAssistantId', e);
        }
    }, [api]);

    const refreshProfiles = useCallback(async () => {
        const updated = await api?.settings?.getProfiles?.();
        if (Array.isArray(updated)) {
            dispatch({ type: ACTIONS.SET_ASSISTANTS, payload: updated });
            return updated;
        }
        return null;
    }, [api, dispatch]);

    const handleSelect = useCallback(async (id) => {
        dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: id });
        await persistActive(id);
    }, [dispatch, persistActive]);

    const handleCreate = useCallback(async () => {
        const newId = makeId();

        await api?.settings?.saveProfile?.(newId, {
            name: 'Novo Assistente',
            systemPrompt: 'Você é um assistente útil...',
            assistantInstructions: 'Seja conciso.',
            additionalContext: ''
        });

        await refreshProfiles();
        dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: newId });
        await persistActive(newId);
    }, [api, dispatch, refreshProfiles, persistActive]);

    const handleClone = useCallback(async (id) => {
        const original = byId.get(id);
        if (!original) return;

        const newId = makeId();
        const { id: _ignored, ...dataToClone } = original;

        await api?.settings?.saveProfile?.(newId, {
            ...dataToClone,
            name: `${original.name || 'Assistente'} (Cópia)`
        });

        await refreshProfiles();
        dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: newId });
        await persistActive(newId);
    }, [api, byId, dispatch, refreshProfiles, persistActive]);

    const handleDelete = useCallback(async (id) => {
        const a = byId.get(id);
        const name = a?.name || id;

        const confirmed = confirm(`Tem certeza que deseja deletar o assistente "${name}"?`);
        if (!confirmed) return;

        await api?.settings?.deleteProfile?.(id);
        const updated = await refreshProfiles();

        if (currentAssistantId === id && Array.isArray(updated) && updated.length > 0) {
            const nextId = updated[0].id;
            dispatch({ type: ACTIONS.SET_ACTIVE_ASSISTANT, payload: nextId });
            await persistActive(nextId);
        }
    }, [api, byId, currentAssistantId, dispatch, refreshProfiles, persistActive]);

    return (
        <aside className={styles.aside} style={{ WebkitAppRegion: 'no-drag' }}>
            {/* Brand */}
            <div className={styles.brandWrap}>
                <div className={styles.brandRow}>
                    <div className={styles.brandLeft}>
                        <div className={styles.brandLogo}>
                            <Command size={22} className="text-black" />
                        </div>
                        <div className={styles.brandText}>
                            <span className={styles.brandTitle}>CORTEX</span>
                            <span className={styles.brandVersion}>v1.0.0</span>
                        </div>
                    </div>

                    <div className="p-2 text-gray-700">
                        <Bot size={18} strokeWidth={1} />
                    </div>
                </div>
            </div>

            {/* List */}
            <div className={styles.listWrap}>
                <span className={styles.sectionTitle}>Assistentes</span>

                <div className={styles.list}>
                    {assistants.map((a) => {
                        const active = currentAssistantId === a.id;

                        return (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => handleSelect(a.id)}
                                className={clsx(styles.itemBtn, active ? styles.itemActive : styles.itemIdle)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={clsx(styles.itemName, active ? 'text-white' : 'text-gray-400 group-hover:text-white')}>
                                        {a.name}
                                    </span>

                                    <div className={styles.actions}>
                                        {active && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.9)] mr-1" />
                                        )}

                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleClone(a.id); }}
                                            className={clsx(styles.iconBtn, active ? styles.iconBtnActive : styles.iconBtnIdle)}
                                            title="Clonar"
                                        >
                                            <Copy size={13} />
                                        </button>

                                        {a.id !== 'default' && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                                                className={clsx(
                                                    styles.iconBtn,
                                                    active ? styles.iconBtnActive : 'text-gray-600 hover:text-red-500 hover:bg-red-500/10'
                                                )}
                                                title="Excluir"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <span className={clsx(styles.itemMeta, active ? 'text-white/50' : 'text-gray-700')}>
                                    {a.id.startsWith('assistant_') ? 'Personalizado' : 'Sistema'}
                                </span>
                            </button>
                        );
                    })}

                    <button type="button" onClick={handleCreate} className={styles.createBtn}>
                        <Plus size={16} />
                        Novo Assistente
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
                <button
                    type="button"
                    onClick={onOpenSettings}
                    className={clsx(styles.footerBtn, styles.footerBtnIdle)}
                >
                    <Settings size={18} />
                    Configurações
                </button>

                <button
                    type="button"
                    onClick={() => api?.app?.panic?.()}
                    className={clsx(styles.footerBtn, styles.footerBtnDanger)}
                >
                    <LogOut size={18} />
                    Finalizar
                </button>
            </div>
        </aside>
    );
}
