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
    const [isSmartDownloading, setIsSmartDownloading] = useState({});
    const [currentModel, setCurrentModel] = useState(null);

    const isDownloading = Object.values(downloadStatus).some(s => s.status === 'downloading' || s.status === 'starting');

    useEffect(() => {
        if (isOpen) {
            refreshLocalModels();
            loadRecommended();
            loadCurrentModel();
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

    const loadCurrentModel = async () => {
        const model = await window.electronAPI.settings.get('localModel', 'local');
        setCurrentModel(model);
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

    const handleSmartDownload = async (repo) => {
        setIsSmartDownloading(prev => ({ ...prev, [repo.fullId]: true }));
        try {
            const bestFile = await window.electronAPI.hf.getBestFile(repo.fullId);
            if (bestFile) {
                await handleDownload({
                    ...bestFile,
                    repoId: repo.fullId,
                    name: repo.name
                });
            } else {
                alert('Nenhum arquivo GGUF encontrado para este repositório.');
            }
        } catch (error) {
            console.error('Smart download failed:', error);
        } finally {
            setIsSmartDownloading(prev => ({ ...prev, [repo.fullId]: false }));
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

        // 🔹 4. Atualiza UI para mostrar o overlay IMEDIATAMENTE
        setDownloadStatus(prev => ({
            ...prev,
            [filename]: { progress: 0, status: 'starting' }
        }));

        setActiveTab('local');

        // 🔹 5. Chamar download no backend e aguardar
        try {
            await window.electronAPI.model.download({
                url: modelData.url,
                filename,
                metadata: {
                    name: modelData.name || filename,
                    id: modelData.repoId || selectedRepo?.id || 'unknown',
                    quantization
                }
            });
        } catch (error) {
            console.error('Download failed:', error);
            alert(`Falha no download: ${error.message}`);
        } finally {
            // 🔹 6. Limpar status para fechar o overlay
            setDownloadStatus(prev => {
                const next = { ...prev };
                delete next[filename];
                return next;
            });
            refreshLocalModels();
        }
    };


    const handleDelete = async (filename) => {
        if (confirm('Tem certeza que deseja apagar este modelo?')) {
            await window.electronAPI.model.delete(filename);
            refreshLocalModels();
            if (currentModel === filename) {
                await window.electronAPI.settings.set('localModel', null, 'local');
                setCurrentModel(null);
            }
        }
    };

    const handleSelectModel = async (filename) => {
        await window.electronAPI.settings.set('localModel', filename, 'local');
        await window.electronAPI.settings.set('llmProvider', 'local');
        await window.electronAPI.settings.set('llmModel', filename);
        setCurrentModel(filename);
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
                    disabled={isDownloading}
                    className="w-12 h-12 rounded-full hover:bg-white/5 flex items-center justify-center text-gray-500 hover:text-white transition disabled:opacity-20"
                >
                    <X size={22} />
                </button>
            </header>

            <div className="flex flex-1 overflow-hidden">

                {/* SIDEBAR */}
                <aside className="w-72 p-6 border-r border-white/5 bg-black/40 space-y-2">
                    {[
                        { id: 'local', label: 'Meus Modelos', icon: HardDrive },
                        { id: 'explore', label: 'Explorar', icon: Cpu },
                        { id: 'search', label: 'Hugging Face', icon: Search }
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => !isDownloading && setActiveTab(t.id)}
                            disabled={isDownloading}
                            className={clsx(
                                "w-full flex items-center gap-4 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition",
                                activeTab === t.id
                                    ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                                    : "text-gray-500 hover:bg-white/5",
                                isDownloading && "opacity-20 cursor-not-allowed"
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
                                    {localModels.map(m => {
                                        const isSelected = currentModel === m.filename;
                                        return (
                                            <div
                                                key={m.filename}
                                                className={clsx(
                                                    "bg-white/[0.03] border rounded-2xl p-6 flex justify-between items-center transition",
                                                    isSelected ? "border-purple-500/50 bg-purple-500/[0.03]" : "border-white/5 hover:border-purple-500/30"
                                                )}
                                            >
                                                <div className="flex items-center gap-5 min-w-0">
                                                    <div className={clsx(
                                                        "w-12 h-12 rounded-xl flex items-center justify-center",
                                                        isSelected ? "bg-purple-500/20 text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.2)]" : "bg-purple-500/10 text-purple-400"
                                                    )}>
                                                        {isSelected ? <CheckCircle2 size={22} /> : <FileBox size={22} />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-3">
                                                            <h4 className="text-sm font-bold text-white truncate">
                                                                {m.name}
                                                            </h4>
                                                            {isSelected && (
                                                                <span className="px-2 py-0.5 rounded-md bg-purple-500 text-white text-[8px] font-black uppercase tracking-widest">
                                                                    Ativo
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 font-mono truncate">
                                                            {m.filename}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => !isSelected && handleSelectModel(m.filename)}
                                                        className={clsx(
                                                            "px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition",
                                                            isSelected
                                                                ? "bg-purple-500 text-white cursor-default"
                                                                : "bg-purple-500/15 text-purple-400 hover:bg-purple-500 hover:text-white"
                                                        )}
                                                    >
                                                        {isSelected ? 'Selecionado' : 'Usar'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(m.filename)}
                                                        disabled={isDownloading}
                                                        className="p-2 rounded-xl text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition disabled:opacity-20"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* EXPLORE (POPULAR MODELS) */}
                    {activeTab === 'explore' && (
                        <section className="space-y-6">
                            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-purple-400">
                                    Modelos Populares
                                </h3>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                    <Cpu size={12} /> Sugestões Otimizadas
                                </span>
                            </div>

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
                    )}

                    {/* SEARCH (MANUAL HF SEARCH) */}
                    {activeTab === 'search' && (
                        <section className="space-y-6">
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-gray-500 border-b border-white/5 pb-3">
                                Hugging Face Search
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
                                {searchResults.map(repo => {
                                    const isLoading = isSmartDownloading[repo.fullId];

                                    return (
                                        <div
                                            key={repo.id}
                                            onClick={() => handleSelectRepo(repo)}
                                            className="bg-white/[0.02] border border-white/5 rounded-xl p-5 cursor-pointer hover:bg-white/5 hover:border-purple-500/30 transition-all flex items-center justify-between group"
                                        >
                                            <div className="flex items-center gap-4 min-w-0">
                                                <Search size={14} className="text-gray-600" />
                                                <div className="min-w-0">
                                                    <h4 className="text-xs font-bold text-white truncate">
                                                        {repo.name}
                                                    </h4>
                                                    <p className="text-[10px] text-gray-500 font-mono truncate mb-1">
                                                        {repo.fullId}
                                                    </p>
                                                    <p className="text-[9px] text-gray-600 font-mono truncate">
                                                        {repo.downloads.toLocaleString()} downloads
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSmartDownload(repo);
                                                    }}
                                                    disabled={isLoading}
                                                    className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                                >
                                                    {isLoading ? '...' : 'Instalar Smart'}
                                                </button>
                                                <Search size={12} className="text-gray-700 opacity-100 group-hover:opacity-0 transition" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </main>
            </div>

            {/* DOWNLOAD OVERLAY */}
            {Object.values(downloadStatus).some(s => s.status === 'downloading' || s.status === 'starting') && (
                <div className="absolute inset-0 z-[150] bg-black/60 backdrop-blur-md flex items-center justify-center p-12 text-center animate-in fade-in duration-300">
                    <div className="max-w-md w-full space-y-8">
                        <div className="w-24 h-24 rounded-3xl bg-purple-500/20 text-purple-400 flex items-center justify-center mx-auto animate-pulse shadow-[0_0_50px_rgba(168,85,247,0.2)]">
                            <Download size={40} />
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Baixando Modelo</h3>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em]">Por favor, aguarde a conclusão</p>
                        </div>

                        {Object.entries(downloadStatus)
                            .filter(([_, s]) => s.status === 'downloading' || s.status === 'starting')
                            .map(([filename, s]) => (
                                <div key={filename} className="space-y-6">
                                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                        <p className="text-[10px] font-mono text-purple-400 truncate">{filename}</p>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-purple-500 transition-all duration-300 ease-out shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                                                style={{ width: `${s.progress || 0}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-500">
                                            <span>Sincronizando</span>
                                            <span className="text-white">{s.progress || 0}%</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={async () => {
                                            if (confirm('Deseja cancelar o download deste modelo?')) {
                                                await window.electronAPI.model.cancel(filename);
                                                setDownloadStatus(prev => {
                                                    const next = { ...prev };
                                                    delete next[filename];
                                                    return next;
                                                });
                                            }
                                        }}
                                        className="w-full py-3 rounded-xl border border-red-500/30 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                                    >
                                        Cancelar Download
                                    </button>
                                </div>
                            ))}

                        <div className="pt-8 opacity-20">
                            <p className="text-[9px] text-gray-400 uppercase tracking-widest leading-relaxed">
                                O processamento deste modelo será habilitado <br /> assim que o arquivo estiver disponível localmente.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

}
