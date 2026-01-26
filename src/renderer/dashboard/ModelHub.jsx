import React, { useState, useEffect } from 'react';
import { Search, Download, Trash2, Cpu, CheckCircle2, HardDrive, AlertTriangle, FileBox, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../components/Button';

export function ModelHub({ isOpen, onClose }) {
    const [activeTab, setActiveTab] = useState('local');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [localModels, setLocalModels] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [repoFiles, setRepoFiles] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState(null);
    const [downloadStatus, setDownloadStatus] = useState({});

    useEffect(() => {
        if (isOpen) {
            refreshLocalModels();
            // Listen for progress
            const cleanupProgress = window.electronAPI.app?.onModelProgress?.((data) => {
                setDownloadStatus(prev => ({
                    ...prev,
                    [data.filename]: { progress: data.progress, status: 'downloading' }
                }));
            });
            const cleanupUpdate = window.electronAPI.app?.onModelUpdated?.((models) => {
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
            const files = await window.electronAPI.hf.files(repo.id);
            setSelectedRepo(repo);
            setRepoFiles(files);
            setActiveTab('files');
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleDownload = async (file) => {
        const filename = file.path.split('/').pop();
        await window.electronAPI.model.download({
            url: file.url,
            filename: filename,
            metadata: {
                name: selectedRepo.name,
                id: selectedRepo.id,
                size: file.size,
                quantization: filename.includes('Q4') ? 'Q4' : 'Unknown'
            }
        });
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
        // Refresh to show selection
        const current = await window.electronAPI.settings.get('localModel', 'local');
        // Force update if needed?
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-[#0a0a0c] z-[120] animate-in slide-in-from-bottom-10 duration-300 flex flex-col">
            <header className="px-12 py-8 flex justify-between items-center bg-black/20 border-b border-white/5 flex-none select-none">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20 text-purple-400 shadow-[0_0_30px_rgba(147,51,234,0.1)]">
                        <HardDrive size={32} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Model Hub</h2>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.4em] mt-1">Gerenciador de Modelos Offline</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-14 h-14 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition-all"
                >
                    <X size={28} />
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                <aside className="w-80 border-r border-white/5 bg-black/40 p-8 space-y-2">
                    <button
                        onClick={() => setActiveTab('local')}
                        className={clsx(
                            "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                            activeTab === 'local' ? "bg-white text-black shadow-2xl" : "text-gray-500 hover:bg-white/5"
                        )}
                    >
                        <HardDrive size={20} /> Meus Modelos
                    </button>
                    <button
                        onClick={() => setActiveTab('search')}
                        className={clsx(
                            "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                            activeTab === 'search' || activeTab === 'files' ? "bg-white text-black shadow-2xl" : "text-gray-500 hover:bg-white/5"
                        )}
                    >
                        <Search size={20} /> Hugging Face
                    </button>
                </aside>

                <main className="flex-1 overflow-y-auto p-12 bg-[#0e0e10]/50 custom-scrollbar">
                    {activeTab === 'local' && (
                        <div className="space-y-6">
                            <h3 className="text-xs font-black text-purple-400 uppercase tracking-[0.3em] border-b border-white/5 pb-3">Instalados</h3>
                            {localModels.length === 0 ? (
                                <div className="p-10 border-2 border-dashed border-white/5 rounded-3xl text-center opacity-40">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Nenhum modelo local instalado</p>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {localModels.map(m => (
                                        <div key={m.filename} className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 flex items-center justify-between group hover:border-white/10 transition-all">
                                            <div className="flex items-center gap-6">
                                                <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400">
                                                    <FileBox size={24} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white text-sm mb-1">{m.name}</h4>
                                                    <p className="text-[10px] text-gray-500 font-mono">{m.filename} • {(m.size / 1024 / 1024 / 1024).toFixed(2)} GB</p>
                                                    {m.status === 'downloading' && (
                                                        <div className="mt-2 w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                                                            <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${m.progress}%` }} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-3">
                                                {m.status !== 'downloading' && (
                                                    <button
                                                        onClick={() => handleSelectModel(m.filename)}
                                                        className="px-6 py-2 bg-purple-900/20 text-purple-400 hover:bg-purple-900/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                    >
                                                        Selecionar
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(m.filename)}
                                                    className="p-3 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'search' && (
                        <div className="space-y-8">
                            <div className="flex gap-4">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar modelos (ex: llama-3, mistral)..."
                                    className="flex-1 bg-white/[0.02] border border-white/10 rounded-2xl px-6 py-4 text-sm text-white focus:ring-1 focus:ring-purple-500/50"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                                <Button onClick={handleSearch} disabled={isSearching} className="px-8 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]">
                                    {isSearching ? 'Buscando...' : 'Buscar'}
                                </Button>
                            </div>

                            <div className="grid gap-4">
                                {searchResults.map(repo => (
                                    <div key={repo.id} onClick={() => handleSelectRepo(repo)} className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 cursor-pointer hover:bg-white/5 transition-all">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-bold text-white text-sm mb-1">{repo.name}</h4>
                                                <div className="flex gap-3 text-[10px] text-gray-500 font-mono mt-2">
                                                    <span className="flex items-center gap-1"><Download size={12} /> {repo.downloads}</span>
                                                    <span>•</span>
                                                    <span>{repo.tags.slice(0, 3).join(', ')}</span>
                                                </div>
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                                                <Search size={14} className="text-gray-400" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'files' && selectedRepo && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                                <button onClick={() => setActiveTab('search')} className="text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest">← Voltar</button>
                                <h3 className="text-lg font-bold text-white">{selectedRepo.name}</h3>
                            </div>

                            <div className="grid gap-3">
                                {repoFiles.map(file => (
                                    <div key={file.path} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-gray-300 font-mono">{file.path.split('/').pop()}</span>
                                            <span className="text-[10px] text-gray-600 font-mono mt-1">{(file.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                                        </div>
                                        <button
                                            onClick={() => handleDownload(file)}
                                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2"
                                        >
                                            <Download size={12} /> Baixar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
