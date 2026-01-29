import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useApp, ACTIONS } from '../contexts/AppContext';
import {
    Save,
    Bot,
    MessageSquare,
    Sparkles,
    Terminal,
    UserSearch,
    Settings2,
    Zap,
    Ban,
    Ruler,
    ShieldCheck,
    ChevronDown,
    HelpCircle,
    CheckCircle2
} from 'lucide-react';
import clsx from 'clsx';

const DEFAULTS = {
    responseStyle: 'short',
    initiativeLevel: 'minimal',
    responseSize: 'medium',
    admitIgnorance: true,
    askClarification: true,
    avoidGeneric: true,
    negativeRules: ''
};

const RESPONSE_STYLES = [
    { value: 'short', label: 'Curto', Icon: Zap },
    { value: 'didactic', label: 'Didático', Icon: MessageSquare },
    { value: 'strategic', label: 'Estratégico', Icon: Sparkles },
    { value: 'code', label: 'Código', Icon: Terminal }
];

const INITIATIVE_LEVELS = [
    { value: 'minimal', label: 'Só responde' },
    { value: 'brief', label: 'Complementa breve' },
    { value: 'proactive', label: 'Proativo' }
];

const RESPONSE_SIZES = [
    { value: 'very_short', label: 'Muito curta' },
    { value: 'medium', label: 'Média' },
    { value: 'detailed', label: 'Detalhada' }
];

const styles = {
    page: 'flex flex-col h-full bg-[#0a0a0c] p-10 animate-in fade-in duration-500',
    nameWrap: 'flex justify-center mb-8',
    nameInput:
        'bg-white/5 border border-white/10 rounded-xl px-5 py-2 text-sm font-semibold text-gray-300 ' +
        'outline-none focus:border-white/20 focus:text-white text-center placeholder:opacity-30',
    card:
        'flex-1 flex flex-col bg-[#0d0d0f] border border-white/5 rounded-[28px] overflow-hidden shadow-2xl',
    tabs: 'flex border-b border-white/5',
    tabBtn:
        'flex items-center gap-2 px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all relative',
    tabActive: 'text-white',
    tabInactive: 'text-gray-600 hover:text-gray-300',
    tabUnderline: 'absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500/90',
    body: 'flex-1 p-8 overflow-y-auto',
    footer: 'p-6 border-t border-white/5 bg-black/40 flex items-center justify-between gap-4',
    statusOk: 'text-[10px] font-black uppercase tracking-[0.2em] text-green-500',
    saveBtn:
        'px-8 py-2.5 bg-white text-black rounded-xl flex items-center gap-2 text-[10px] font-black ' +
        'uppercase tracking-[0.25em] hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-40'
};

function MiniHelp({ text }) {
    const [open, setOpen] = useState(false);

    if (!text) return null;

    return (
        <span className="relative inline-flex">
            <button
                type="button"
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
                className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Ajuda"
            >
                <HelpCircle size={10} className="text-gray-400" />
            </button>

            {open && (
                <span
                    className="absolute top-full left-0 mt-2 w-72 p-3 bg-[#18181b] border border-white/15 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.75)]"
                    style={{ zIndex: 99999 }}
                >
                    <span className="block text-xs text-gray-200 leading-relaxed">{text}</span>
                </span>
            )}
        </span>
    );
}

function FieldLabel({ Icon, title, help }) {
    return (
        <div className="flex items-center gap-2 mb-3 text-gray-400">
            <Icon size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">{title}</span>
            <MiniHelp text={help} />
        </div>
    );
}

function Select({ value, onChange, options }) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={clsx(
                    'w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300',
                    'outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20',
                    'appearance-none cursor-pointer transition-all hover:border-white/20'
                )}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
    );
}

function Toggle({ checked, onChange, label }) {
    return (
        <label className="flex items-center justify-between py-3 cursor-pointer">
            <span className="text-sm text-gray-400 hover:text-gray-300 transition-colors">{label}</span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={clsx(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    checked ? 'bg-blue-600' : 'bg-white/10'
                )}
            >
                <span
                    className={clsx(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-lg',
                        checked ? 'translate-x-6' : 'translate-x-1'
                    )}
                />
            </button>
        </label>
    );
}

function Collapsible({ title, Icon, help, defaultOpen = true, children }) {
    return (
        <details
            className="border border-white/5 rounded-2xl bg-black/20 overflow-hidden"
            defaultOpen={defaultOpen}
        >
            <summary className="list-none cursor-pointer select-none px-5 py-4 hover:bg-white/5 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon size={14} className="text-gray-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">{title}</span>
                    <MiniHelp text={help} />
                </div>
                <ChevronDown size={14} className="text-gray-400" />
            </summary>

            <div className="px-5 pb-5 pt-1">
                {children}
            </div>
        </details>
    );
}

export default function AssistantEditor() {
    const { state, dispatch } = useApp();
    const { currentAssistantId, assistants } = state;

    const [activeTab, setActiveTab] = useState('sistema');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savedToast, setSavedToast] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        systemPrompt: '',
        assistantInstructions: '',
        additionalContext: '',
        ...DEFAULTS
    });

    const tabs = useMemo(() => ([
        { id: 'sistema', label: 'Sistema', Icon: Bot },
        { id: 'comportamento', label: 'Comportamento', Icon: Settings2 },
        { id: 'acompanhamento', label: 'Contexto', Icon: UserSearch }
    ]), []);

    useEffect(() => {
        if (!currentAssistantId) return;

        let alive = true;

        (async () => {
            setIsLoading(true);
            try {
                const meta = assistants.find(a => a.id === currentAssistantId);
                const profile = await window.electronAPI.settings.loadProfile(currentAssistantId);

                if (!alive) return;

                setFormData({
                    name: meta?.name || profile?.name || 'Assistente',
                    systemPrompt: profile?.systemPrompt || '',
                    assistantInstructions: profile?.assistantInstructions || '',
                    additionalContext: profile?.additionalContext || '',
                    responseStyle: profile?.responseStyle || DEFAULTS.responseStyle,
                    initiativeLevel: profile?.initiativeLevel || DEFAULTS.initiativeLevel,
                    responseSize: profile?.responseSize || DEFAULTS.responseSize,
                    admitIgnorance: profile?.admitIgnorance ?? DEFAULTS.admitIgnorance,
                    askClarification: profile?.askClarification ?? DEFAULTS.askClarification,
                    avoidGeneric: profile?.avoidGeneric ?? DEFAULTS.avoidGeneric,
                    negativeRules: profile?.negativeRules || DEFAULTS.negativeRules
                });
            } finally {
                if (alive) setIsLoading(false);
            }
        })();

        return () => { alive = false; };
    }, [currentAssistantId, assistants]);

    const setField = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (savedToast) setSavedToast(false);
    }, [savedToast]);

    const handleSave = useCallback(async () => {
        if (!currentAssistantId) return;

        setIsSaving(true);
        try {
            await window.electronAPI.settings.saveProfile(currentAssistantId, formData);
            const updated = await window.electronAPI.settings.getProfiles();
            dispatch({ type: ACTIONS.SET_ASSISTANTS, payload: updated });

            setSavedToast(true);
            setTimeout(() => setSavedToast(false), 2500);
        } finally {
            setIsSaving(false);
        }
    }, [currentAssistantId, formData, dispatch]);

    if (!currentAssistantId) return null;

    return (
        <div className={styles.page}>
            <div className={styles.nameWrap}>
                <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setField('name', e.target.value)}
                    className={styles.nameInput}
                    placeholder="Nome do assistente"
                />
            </div>

            <div className={styles.card}>
                <div className={styles.tabs}>
                    {tabs.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveTab(id)}
                            className={clsx(styles.tabBtn, activeTab === id ? styles.tabActive : styles.tabInactive)}
                        >
                            <Icon size={16} />
                            {label}
                            {activeTab === id && <div className={styles.tabUnderline} />}
                        </button>
                    ))}
                </div>

                <div className={styles.body}>
                    {isLoading && (
                        <div className="text-sm text-gray-500">Carregando…</div>
                    )}

                    {!isLoading && activeTab === 'sistema' && (
                        <div className="grid gap-6">
                            <div>
                                <FieldLabel
                                    Icon={Terminal}
                                    title="System Prompt"
                                    help="Define o papel, tom e regras gerais do assistente."
                                />
                                <textarea
                                    value={formData.systemPrompt}
                                    onChange={(e) => setField('systemPrompt', e.target.value)}
                                    className="w-full min-h-[220px] bg-black/40 border border-white/5 rounded-2xl p-6 text-sm leading-relaxed text-gray-300 outline-none resize-none focus:border-white/15"
                                    placeholder="Digite o prompt do sistema…"
                                />
                            </div>

                            <div>
                                <FieldLabel
                                    Icon={Bot}
                                    title="Instruções extras"
                                    help="Regras adicionais específicas para este assistente (opcional)."
                                />
                                <textarea
                                    value={formData.assistantInstructions}
                                    onChange={(e) => setField('assistantInstructions', e.target.value)}
                                    className="w-full min-h-[160px] bg-black/40 border border-white/5 rounded-2xl p-6 text-sm leading-relaxed text-gray-300 outline-none resize-none focus:border-white/15"
                                    placeholder="Ex.: sempre responder em pt-BR, usar exemplos curtos…"
                                />
                            </div>
                        </div>
                    )}

                    {!isLoading && activeTab === 'comportamento' && (
                        <div className="flex flex-col gap-4">
                            <Collapsible
                                title="Estilo de resposta"
                                Icon={Zap}
                                help="Escolha o formato padrão das respostas."
                                defaultOpen
                            >
                                <div className="grid grid-cols-2 gap-3">
                                    {RESPONSE_STYLES.map(({ value, label, Icon }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setField('responseStyle', value)}
                                            className={clsx(
                                                'flex items-center gap-2 px-4 py-3 rounded-xl border transition-all text-sm',
                                                formData.responseStyle === value
                                                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                                                    : 'bg-black/20 border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300'
                                            )}
                                        >
                                            <Icon size={14} />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </Collapsible>

                            <Collapsible
                                title="Iniciativa"
                                Icon={Sparkles}
                                help="Define o quanto o assistente vai além do perguntado."
                                defaultOpen={false}
                            >
                                <Select
                                    value={formData.initiativeLevel}
                                    onChange={(v) => setField('initiativeLevel', v)}
                                    options={INITIATIVE_LEVELS}
                                />
                            </Collapsible>

                            <Collapsible
                                title="Tamanho"
                                Icon={Ruler}
                                help="Limite padrão para o tamanho das respostas."
                                defaultOpen={false}
                            >
                                <Select
                                    value={formData.responseSize}
                                    onChange={(v) => setField('responseSize', v)}
                                    options={RESPONSE_SIZES}
                                />
                            </Collapsible>

                            <Collapsible
                                title="Validação"
                                Icon={ShieldCheck}
                                help="Anti-alucinação e qualidade de resposta."
                                defaultOpen={false}
                            >
                                <div className="divide-y divide-white/5">
                                    <Toggle
                                        checked={formData.admitIgnorance}
                                        onChange={(v) => setField('admitIgnorance', v)}
                                        label="Admitir quando não souber"
                                    />
                                    <Toggle
                                        checked={formData.askClarification}
                                        onChange={(v) => setField('askClarification', v)}
                                        label="Pedir esclarecimento se ambíguo"
                                    />
                                    <Toggle
                                        checked={formData.avoidGeneric}
                                        onChange={(v) => setField('avoidGeneric', v)}
                                        label="Evitar respostas genéricas"
                                    />
                                </div>
                            </Collapsible>

                            <Collapsible
                                title="Regras negativas"
                                Icon={Ban}
                                help="Lista do que o assistente NÃO deve fazer (uma por linha)."
                                defaultOpen={false}
                            >
                                <textarea
                                    value={formData.negativeRules}
                                    onChange={(e) => setField('negativeRules', e.target.value)}
                                    className="w-full min-h-[110px] bg-black/40 border border-white/5 rounded-xl p-4 text-sm leading-relaxed text-gray-300 outline-none resize-none focus:border-white/15"
                                    placeholder="Ex.: não mencionar políticas internas…"
                                />
                            </Collapsible>
                        </div>
                    )}

                    {!isLoading && activeTab === 'acompanhamento' && (
                        <div>
                            <FieldLabel
                                Icon={UserSearch}
                                title="Base de conhecimento"
                                help="Contexto que o assistente deve considerar automaticamente."
                            />
                            <textarea
                                value={formData.additionalContext}
                                onChange={(e) => setField('additionalContext', e.target.value)}
                                className="w-full min-h-[320px] bg-black/40 border border-white/5 rounded-2xl p-6 text-sm leading-relaxed text-gray-300 outline-none resize-none focus:border-white/15"
                                placeholder="Currículo, stack, projetos, regras do produto…"
                            />
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <div className="min-h-[18px]">
                        {savedToast && (
                            <span className={styles.statusOk}>
                                <CheckCircle2 size={14} className="inline-block mr-2 -mt-0.5" />
                                Salvo
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className={styles.saveBtn}
                    >
                        {isSaving ? <Save size={14} /> : savedToast ? <CheckCircle2 size={14} /> : <Save size={14} />}
                        {isSaving ? 'Salvando…' : savedToast ? 'Salvo!' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
