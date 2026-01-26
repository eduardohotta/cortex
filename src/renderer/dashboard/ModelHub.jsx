import React, { useState, useEffect } from 'react';
import { Search, Download, Trash2, Cpu, CheckCircle2, HardDrive, AlertTriangle, FileBox, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../components/Button';

export function ModelHub({ isOpen, onClose }) {
    const [activeTab, setActiveTab] = useState('local');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [recommendedModels, setRecommendedModels] = useState([]);
    const [localModels, setLocalModels] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingRecommended, setIsLoadingRecommended] = useState(false);
    const [repoFiles, setRepoFiles] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState(null);
    const [downloadStatus, setDownloadStatus] = useState({});

    useEffect(() => {
        if (isOpen) {
            refreshLocalModels();
            loadRecommended();
            // Listen for progress
            const cleanupProgress = window.electronAPI.model.onProgress((data) => {
                setDownloadStatus(prev => ({
                    ...prev,
                    [data.filename]: {
                        ...(prev[data.filename] || {}),
                        progress: data.progress,
                        status: data.status || 'downloading'
                    }
                }));
            });
            const cleanupUpdate = window.electronAPI.model.onUpdated((models) => {
                setLocalModels(models);
            });

            return () => {
                cleanupProgress && cleanupProgress();
                cleanupUpdate && cleanupUpdate();
            };
        }
    }, [isOpen]);

    const refreshLocalModels = async () => {
        const models = await window.electronAPI.model.list();
        setLocalModels(models);
    };

    const loadRecommended = async () => {
        setIsLoadingRecommended(true);
        try {
            const models = await window.electronAPI.hf.getRecommended();
            setRecommendedModels(models);
            console.log(models)
        } catch (error) {
            console.error('Failed to load recommended models:', error);
        } finally {
            setIsLoadingRecommended(false);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const results = await window.electronAPI.hf.search(searchQuery);
            setSearchResults(results);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectRepo = async (repo) => {
        setIsSearching(true);
        try {
            const files = await window.electronAPI.hf.files(repo.fullId);
            setSelectedRepo(repo);
            setRepoFiles(files);
            setActiveTab('files');
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleDownload = async (modelData) => {
        // 🔹 1. Resolver nome do arquivo
        const filename =
            modelData.file ||
            modelData.path?.split('/').pop() ||
            'model.gguf';

        // 🔹 3. Detectar quantização pelo nome do arquivo
        let quantization = 'Unknown';
        const name = filename.toUpperCase();

        if (name.includes('Q4_K_M')) quantization = 'Q4_K_M';
        else if (name.includes('Q5_K_M')) quantization = 'Q5_K_M';
        else if (name.includes('Q4_K')) quantization = 'Q4_K';
        else if (name.includes('Q5_K')) quantization = 'Q5_K';
        else if (name.includes('Q8_0')) quantization = 'Q8_0';
        else if (name.includes('Q6_K')) quantization = 'Q6_K';
        else if (name.includes('Q3_K')) quantization = 'Q3_K';
        else if (name.includes('Q2_K')) quantization = 'Q2_K';

        // 🔹 4. Chamar download no backend
        await window.electronAPI.model.download({
            url: modelData.url,
            filename,
            metadata: {
                name: modelData.name || filename,
                id: modelData.repoId || selectedRepo?.id || 'unknown',
                quantization
            }
        });

        // 🔹 5. Atualiza UI
        setDownloadStatus(prev => ({
            ...prev,
            [filename]: { progress: 0, status: 'starting' }
        }));

        setActiveTab('local');
    };


    const handleDelete = async (filename) => {
        if (confirm('Tem certeza que deseja apagar este modelo?')) {
            await window.electronAPI.model.delete(filename);
            refreshLocalModels();
        }
    };

    const handleSelectModel = async (filename) => {
        await window.electronAPI.settings.set('localModel', filename, 'local');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] bg-[#0a0a0c]/90 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">

            {/* HEADER */}
            <header className="px-10 py-6 flex justify-between items-center border-b border-white/5">
                <div className="flex items-center gap-5">
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight">
                            Model Hub
                        </h2>
                        <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">
                            Offline GGUF Models
                        </p>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-12 h-12 rounded-full hover:bg-white/5 flex items-center justify-center text-gray-500 hover:text-white transition"
                >
                    <X size={22} />
                </button>
            </header>

            <div className="flex flex-1 overflow-hidden">

                {/* SIDEBAR */}
                <aside className="w-72 p-6 border-r border-white/5 bg-black/40 space-y-2">
                    {[
                        { id: 'local', label: 'Meus Modelos', icon: HardDrive },
                        { id: 'search', label: 'Hugging Face', icon: Search }
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={clsx(
                                "w-full flex items-center gap-4 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition",
                                activeTab === t.id
                                    ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                                    : "text-gray-500 hover:bg-white/5"
                            )}
                        >
                            <t.icon size={18} />
                            {t.label}
                        </button>
                    ))}
                </aside>

                {/* MAIN */}
                <main className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">

                    {/* LOCAL MODELS */}
                    {activeTab === 'local' && (
                        <>
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-purple-400 border-b border-white/5 pb-3">
                                Instalados
                            </h3>

                            {localModels.length === 0 ? (
                                <div className="p-12 border border-dashed border-white/5 rounded-3xl text-center text-gray-600 text-xs uppercase tracking-widest">
                                    Nenhum modelo local instalado
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {localModels.map(m => (
                                        <div
                                            key={m.filename}
                                            className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 flex justify-between items-center hover:border-purple-500/30 transition"
                                        >
                                            <div className="flex items-center gap-5 min-w-0">
                                                <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                                                    <FileBox size={22} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-sm font-bold text-white truncate">
                                                        {m.name}
                                                    </h4>
                                                    <p className="text-[10px] text-gray-500 font-mono truncate">
                                                        {m.filename}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => handleSelectModel(m.filename)}
                                                    className="px-5 py-2 rounded-xl bg-purple-500/15 text-purple-400 text-[9px] font-black uppercase tracking-widest hover:bg-purple-500 hover:text-white transition"
                                                >
                                                    Usar
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(m.filename)}
                                                    className="p-2 rounded-xl text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* SEARCH */}
                    {activeTab === 'search' && (
                        <>
                            <section className="space-y-6">
                                <section className="space-y-6 pt-8 border-t border-white/5">
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-gray-500">
                                        Busca Manual
                                    </h3>

                                    <div className="flex gap-4">
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Buscar modelos no Hugging Face..."
                                            className="flex-1 bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-4 text-sm text-white focus:ring-1 focus:ring-purple-500/40"
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                        />
                                        <Button
                                            onClick={handleSearch}
                                            disabled={isSearching}
                                            className="px-8 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]"
                                        >
                                            {isSearching ? 'Buscando...' : 'Buscar'}
                                        </Button>
                                    </div>

                                    <div className="grid gap-3">
                                        {searchResults.map(repo => (
                                            <div
                                                key={repo.id}
                                                onClick={() => handleSelectRepo(repo)}
                                                className="bg-white/[0.02] border border-white/5 rounded-xl p-5 cursor-pointer hover:bg-white/5 hover:border-purple-500/30 transition-all flex items-center justify-between"
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <Search size={14} className="text-gray-600" />
                                                    <div className="min-w-0">
                                                        <h4 className="text-xs font-bold text-white truncate">
                                                            {repo.name}
                                                        </h4>
                                                        <p className="text-[9px] text-gray-600 font-mono truncate">
                                                            {repo.downloads.toLocaleString()} downloads
                                                        </p>
                                                    </div>
                                                </div>
                                                <Search size={12} className="text-gray-700" />
                                            </div>
                                        ))}
                                    </div>
                                </section>
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-purple-400">
                                    Modelos Populares
                                </h3>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {isLoadingRecommended
                                        ? Array.from({ length: 4 }).map((_, i) => (
                                            <div key={i} className="h-40 bg-white/[0.03] rounded-3xl animate-pulse" />
                                        ))
                                        : recommendedModels.map(m => (
                                            <div
                                                key={m.repoId}
                                                className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 hover:border-purple-500/30 transition flex flex-col justify-between"
                                            >
                                                <div>
                                                    <h4 className="text-sm font-bold text-white">
                                                        {m.name}
                                                    </h4>
                                                    <p className="text-[10px] text-gray-500 font-mono mt-1">
                                                        {m.repoId}
                                                    </p>

                                                    <div className="flex gap-4 mt-4 text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                                                        <span className="flex items-center gap-1">
                                                            <Download size={12} /> {Math.floor(m.downloads / 1000)}K
                                                        </span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleDownload(m)}
                                                    className="mt-6 py-3 rounded-2xl bg-purple-500/15 text-purple-400 font-black text-[10px] uppercase tracking-widest hover:bg-purple-500 hover:text-white transition"
                                                >
                                                    Instalar
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            </section>
                        </>
                    )}
                </main>
            </div>
        </div>
    );

}
