import React, { useState, useEffect } from 'react';
import { useApp, ACTIONS } from '../contexts/AppContext';
import { Button } from '../components/Button';
import { Save, Bot, MessageSquare, StickyNote, Sparkles, CheckCircle2, AlertCircle, Terminal, UserSearch, Settings2, Zap, Ban, Ruler, ShieldCheck, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import clsx from 'clsx';

// Help Tooltip Component
function HelpTooltip({ text }) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div className="relative inline-flex ml-2">
            <button
                type="button"
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
                onClick={(e) => { e.stopPropagation(); setIsVisible(!isVisible); }}
                className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
                <HelpCircle size={10} className="text-gray-400" />
            </button>
            {isVisible && (
                <div
                    className="absolute top-full left-0 mt-2 w-72 p-4 bg-[#18181b] border border-white/20 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-150"
                    style={{ zIndex: 99999 }}
                >
                    <p className="text-xs text-gray-200 leading-relaxed">{text}</p>
                    <div className="absolute bottom-full left-4 w-3 h-3 bg-[#18181b] border-l border-t border-white/20 rotate-45 -mb-1.5" />
                </div>
            )}
        </div>
    );
}

// Default behavior configuration
const DEFAULTS = {
    responseStyle: 'short',
    initiativeLevel: 'minimal',
    responseSize: 'medium',
    admitIgnorance: true,
    askClarification: true,
    avoidGeneric: true,
    negativeRules: ''
};

// Options for selects
const RESPONSE_STYLES = [
    { value: 'short', label: 'Curto e direto', icon: Zap },
    { value: 'didactic', label: 'Didático (passo a passo)', icon: MessageSquare },
    { value: 'strategic', label: 'Estratégico (resposta + insight)', icon: Sparkles },
    { value: 'code', label: 'Código primeiro', icon: Terminal }
];

const INITIATIVE_LEVELS = [
    { value: 'minimal', label: 'Apenas responde o perguntado' },
    { value: 'brief', label: 'Complementa com observações breves' },
    { value: 'proactive', label: 'Sugere melhorias e alertas' }
];

const RESPONSE_SIZES = [
    { value: 'very_short', label: 'Muito curta' },
    { value: 'medium', label: 'Média' },
    { value: 'detailed', label: 'Detalhada (quando necessário)' }
];

// Collapsible Section Component
function Section({ title, icon: Icon, children, defaultOpen = true, help }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border border-white/5 rounded-2xl bg-black/20">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors",
                    isOpen ? "rounded-t-2xl" : "rounded-2xl"
                )}
            >
                <div className="flex items-center gap-3">
                    <Icon size={14} className="text-gray-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">{title}</span>
                    {help && <HelpTooltip text={help} />}
                </div>
                {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>
            {isOpen && (
                <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-2 duration-200">
                    {children}
                </div>
            )}
        </div>
    );
}

// Select Component
function Select({ value, onChange, options, className }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={clsx(
                "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300",
                "outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20",
                "appearance-none cursor-pointer transition-all hover:border-white/20",
                className
            )}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
        >
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    );
}

// Toggle Component
function Toggle({ checked, onChange, label }) {
    return (
        <label className="flex items-center justify-between py-3 cursor-pointer group">
            <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">{label}</span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={clsx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    checked ? "bg-blue-600" : "bg-white/10"
                )}
            >
                <span
                    className={clsx(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-lg",
                        checked ? "translate-x-6" : "translate-x-1"
                    )}
                />
            </button>
        </label>
    );
}

export default function AssistantEditor() {
    const { state, dispatch } = useApp();
    const { currentAssistantId, assistants } = state;

    // Local state for form
    const [formData, setFormData] = useState({
        name: '',
        systemPrompt: '',
        assistantInstructions: '',
        additionalContext: '',
        // Behavior settings with defaults
        ...DEFAULTS
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
                    additionalContext: profile?.additionalContext || '',
                    // Behavior settings with defaults
                    responseStyle: profile?.responseStyle || DEFAULTS.responseStyle,
                    initiativeLevel: profile?.initiativeLevel || DEFAULTS.initiativeLevel,
                    responseSize: profile?.responseSize || DEFAULTS.responseSize,
                    admitIgnorance: profile?.admitIgnorance ?? DEFAULTS.admitIgnorance,
                    askClarification: profile?.askClarification ?? DEFAULTS.askClarification,
                    avoidGeneric: profile?.avoidGeneric ?? DEFAULTS.avoidGeneric,
                    negativeRules: profile?.negativeRules || DEFAULTS.negativeRules
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
            <div className="flex justify-center mb-10 no-drag">
                <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-6 py-2 text-sm font-bold text-gray-400 focus:text-white outline-none w-auto text-center placeholder:opacity-20"
                    placeholder="Assistant Name (optional)"
                />
            </div>

            {/* Main Editor Card */}
            <div className="flex-1 flex flex-col bg-[#0d0d0f] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl no-drag">

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
                        onClick={() => setActiveTab('comportamento')}
                        className={clsx(
                            "flex items-center gap-3 px-10 py-5 text-[10px] font-black uppercase tracking-widest transition-all relative",
                            activeTab === 'comportamento' ? "text-white" : "text-gray-600 hover:text-gray-400"
                        )}
                    >
                        <Settings2 size={16} /> Comportamento
                        {activeTab === 'comportamento' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_-4px_10px_rgba(59,130,246,0.5)]" />}
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
                <div className="flex-1 p-10 overflow-y-auto">
                    {activeTab === 'sistema' && (
                        <div className="flex-1 flex flex-col h-full animate-in fade-in duration-300">
                            <div className="flex items-center gap-3 mb-4 text-gray-400">
                                <Terminal size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">System Prompt (Cognição)</span>
                                <HelpTooltip text="Define a personalidade e papel principal do assistente. Aqui você configura QUEM o assistente é e COMO ele deve se comportar de forma geral." />
                            </div>
                            <textarea
                                value={formData.systemPrompt}
                                onChange={(e) => handleChange('systemPrompt', e.target.value)}
                                className="flex-1 min-h-[300px] bg-black/40 border border-white/5 rounded-2xl p-8 text-sm leading-relaxed text-gray-400 focus:text-gray-200 outline-none resize-none transition-all placeholder:text-gray-800"
                                placeholder="Digite o prompt do sistema..."
                            />
                        </div>
                    )}

                    {activeTab === 'comportamento' && (
                        <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                            {/* Response Style */}
                            <Section title="Estilo de Resposta" icon={Zap} help="Como o assistente deve estruturar as respostas: direto ao ponto, explicativo passo a passo, ou com insights estratégicos.">
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    {RESPONSE_STYLES.map(style => (
                                        <button
                                            key={style.value}
                                            onClick={() => handleChange('responseStyle', style.value)}
                                            className={clsx(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
                                                formData.responseStyle === style.value
                                                    ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                                                    : "bg-black/20 border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                            )}
                                        >
                                            <style.icon size={14} />
                                            <span className="text-xs font-medium">{style.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </Section>

                            {/* Initiative Level */}
                            <Section title="Grau de Iniciativa" icon={Sparkles} defaultOpen={false} help="Quanto o assistente pode complementar além do que foi perguntado. Mínimo = só responde, Máximo = sugere melhorias proativamente.">
                                <Select
                                    value={formData.initiativeLevel}
                                    onChange={(v) => handleChange('initiativeLevel', v)}
                                    options={INITIATIVE_LEVELS}
                                />
                            </Section>

                            {/* Response Size */}
                            <Section title="Limite de Tamanho" icon={Ruler} defaultOpen={false} help="Controla o tamanho máximo das respostas. Para entrevistas, 'Curta' geralmente funciona melhor.">
                                <Select
                                    value={formData.responseSize}
                                    onChange={(v) => handleChange('responseSize', v)}
                                    options={RESPONSE_SIZES}
                                />
                            </Section>

                            {/* Validation / Anti-hallucination */}
                            <Section title="Validação" icon={ShieldCheck} defaultOpen={false} help="Configurações anti-alucinação: fazer o assistente admitir quando não sabe, pedir esclarecimentos, e evitar respostas genéricas.">
                                <div className="divide-y divide-white/5">
                                    <Toggle
                                        checked={formData.admitIgnorance}
                                        onChange={(v) => handleChange('admitIgnorance', v)}
                                        label="Admitir quando não souber"
                                    />
                                    <Toggle
                                        checked={formData.askClarification}
                                        onChange={(v) => handleChange('askClarification', v)}
                                        label="Pedir esclarecimento se ambíguo"
                                    />
                                    <Toggle
                                        checked={formData.avoidGeneric}
                                        onChange={(v) => handleChange('avoidGeneric', v)}
                                        label="Evitar respostas genéricas"
                                    />
                                </div>
                            </Section>

                            {/* Negative Rules */}
                            <Section title="Regras Negativas" icon={Ban} defaultOpen={false} help="Liste o que o assistente NÃO deve fazer. Exemplo: 'Não mencionar que é IA', 'Não dar respostas muito longas'.">
                                <textarea
                                    value={formData.negativeRules}
                                    onChange={(e) => handleChange('negativeRules', e.target.value)}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl p-4 text-sm leading-relaxed text-gray-400 focus:text-gray-200 outline-none resize-none transition-all placeholder:text-gray-700 min-h-[100px]"
                                    placeholder="O que o assistente NÃO deve fazer... (uma regra por linha)"
                                />
                            </Section>
                        </div>
                    )}

                    {activeTab === 'acompanhamento' && (
                        <div className="flex-1 flex flex-col animate-in fade-in duration-300">
                            <div className="flex items-center gap-3 mb-4 text-gray-400">
                                <UserSearch size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">Base de Conhecimento (Contexto)</span>
                                <HelpTooltip text="Informações específicas que o assistente deve considerar: seu currículo, stack técnica, projetos, regras de negócio. Tudo que você quer que ele 'lembre' automaticamente." />
                            </div>
                            <textarea
                                value={formData.additionalContext}
                                onChange={(e) => handleChange('additionalContext', e.target.value)}
                                className="flex-1 min-h-[300px] bg-black/40 border border-white/5 rounded-2xl p-8 text-sm leading-relaxed text-gray-400 focus:text-gray-200 outline-none resize-none transition-all placeholder:text-gray-800"
                                placeholder="Insira o contexto ou instruções de acompanhamento..."
                            />
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-8 border-t border-white/5 bg-black/40 flex justify-end items-center gap-6">
                    {showStatus && (
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500 animate-in fade-in zoom-in duration-300">
                            Assistente salvo com sucesso
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="
        px-10 py-2.5
        bg-white text-black
        rounded-xl
        flex items-center gap-2
        text-[10px] font-black uppercase tracking-[0.25em]
        shadow-xl
        hover:bg-gray-100
        active:scale-95
        transition-all
        disabled:opacity-40
    "
                    >
                        <Save size={14} />
                        Salvar
                    </button>

                </div>
            </div>
        </div>
    );
}
