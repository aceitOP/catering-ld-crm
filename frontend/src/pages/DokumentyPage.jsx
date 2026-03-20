import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dokumentyApi } from '../api';
import { EmptyState, Btn, Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, FolderOpen, Folder, FolderPlus, Pencil, Trash2, Check, X, MoveRight } from 'lucide-react';

const MAX_FILE_SIZE_MB = 25;

export function DokumentyPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);

  // Currently selected folder: null = all, 'none' = root (no folder), number = folder id
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Folder create/rename state
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  // Move doc modal
  const [movingDocId, setMovingDocId] = useState(null);

  // Queries
  const { data: slozkyData, isLoading: slozkyLoading } = useQuery({
    queryKey: ['dokumenty-slozky'],
    queryFn: dokumentyApi.listSlozky,
  });

  const listParams = selectedFolder === null
    ? {}
    : selectedFolder === 'none'
      ? { slozka_id: 'none' }
      : { slozka_id: selectedFolder };

  const { data, isLoading: docsLoading } = useQuery({
    queryKey: ['dokumenty', selectedFolder],
    queryFn: () => dokumentyApi.list(listParams),
  });

  const slozky = slozkyData?.data?.data || [];
  const docs = data?.data?.data || [];

  // Mutations
  const createSlozkaM = useMutation({
    mutationFn: (d) => dokumentyApi.createSlozka(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dokumenty-slozky'] });
      setNewFolderName('');
      setShowNewFolder(false);
      toast.success('Složka vytvořena');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Chyba'),
  });

  const renameSlozkaM = useMutation({
    mutationFn: ({ id, nazev }) => dokumentyApi.updateSlozka(id, { nazev }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dokumenty-slozky'] });
      setRenamingId(null);
      toast.success('Složka přejmenována');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Chyba'),
  });

  const deleteSlozkaM = useMutation({
    mutationFn: (id) => dokumentyApi.deleteSlozka(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['dokumenty-slozky'] });
      qc.invalidateQueries({ queryKey: ['dokumenty'] });
      if (selectedFolder === id) setSelectedFolder(null);
      toast.success('Složka smazána, dokumenty přesunuty do kořene');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Chyba'),
  });

  const deleteMut = useMutation({
    mutationFn: dokumentyApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dokumenty'] });
      qc.invalidateQueries({ queryKey: ['dokumenty-slozky'] });
      toast.success('Dokument smazán');
    },
  });

  const moveMut = useMutation({
    mutationFn: ({ id, slozka_id }) => dokumentyApi.move(id, slozka_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dokumenty'] });
      qc.invalidateQueries({ queryKey: ['dokumenty-slozky'] });
      setMovingDocId(null);
      toast.success('Dokument přesunut');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Chyba'),
  });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`Soubor je příliš velký. Maximum je ${MAX_FILE_SIZE_MB} MB.`);
      e.target.value = '';
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('soubor', file);
    fd.append('kategorie', 'interni');
    if (selectedFolder && selectedFolder !== 'none') {
      fd.append('slozka_id', selectedFolder);
    }
    try {
      await dokumentyApi.upload(fd);
      qc.invalidateQueries({ queryKey: ['dokumenty'] });
      qc.invalidateQueries({ queryKey: ['dokumenty-slozky'] });
      toast.success('Soubor nahrán');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Chyba při nahrávání');
    }
    setUploading(false);
    e.target.value = '';
  };

  const formatSize = (b) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
  const formatDatum = (d) => new Date(d).toLocaleDateString('cs-CZ');
  const handleDownload = async (doc) => {
    try {
      await dokumentyApi.download(doc.id, doc.nazev || doc.filename);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Dokument se nepodařilo stáhnout');
    }
  };

  const totalDocs = slozky.reduce((s, f) => s + (f.pocet_dokumentu || 0), 0);

  const selectedFolderName = selectedFolder === null
    ? 'Všechny dokumenty'
    : selectedFolder === 'none'
      ? 'Bez složky'
      : slozky.find(s => s.id === selectedFolder)?.nazev || 'Složka';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-stone-100 bg-white">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Dokumenty a přílohy</h1>
          <p className="text-xs text-stone-400 mt-0.5">{totalDocs} souborů</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 bg-stone-900 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-stone-800 cursor-pointer transition-colors">
            <Plus size={12} /> {uploading ? 'Nahrávám…' : 'Nahrát soubor'}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Folder sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-stone-100 bg-stone-50/60 flex flex-col overflow-y-auto">
          <div className="px-3 pt-4 pb-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 px-2 mb-1">Složky</div>

            {/* All */}
            <button
              onClick={() => setSelectedFolder(null)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
                selectedFolder === null ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              <FolderOpen size={14} />
              <span className="flex-1 text-left truncate">Všechny dokumenty</span>
            </button>

            {/* Root (no folder) */}
            <button
              onClick={() => setSelectedFolder('none')}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
                selectedFolder === 'none' ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Folder size={14} />
              <span className="flex-1 text-left truncate">Bez složky</span>
            </button>

            {/* Folders */}
            <div className="mt-1 space-y-0.5">
              {slozkyLoading ? null : slozky.map(s => (
                <div key={s.id} className={`group flex items-center gap-1 rounded-lg transition-colors ${
                  selectedFolder === s.id ? 'bg-stone-900' : 'hover:bg-stone-100'
                }`}>
                  {renamingId === s.id ? (
                    <div className="flex-1 flex items-center gap-1 px-2 py-1.5">
                      <input
                        autoFocus
                        className="flex-1 text-sm border border-stone-300 rounded px-1.5 py-0.5 bg-white min-w-0"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameSlozkaM.mutate({ id: s.id, nazev: renameValue });
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                      <button onClick={() => renameSlozkaM.mutate({ id: s.id, nazev: renameValue })} className="text-emerald-600 hover:text-emerald-700"><Check size={13} /></button>
                      <button onClick={() => setRenamingId(null)} className="text-stone-400 hover:text-stone-600"><X size={13} /></button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelectedFolder(s.id)}
                        className={`flex-1 flex items-center gap-2 px-2 py-2 text-sm min-w-0 ${
                          selectedFolder === s.id ? 'text-white' : 'text-stone-700'
                        }`}
                      >
                        <Folder size={14} className="flex-shrink-0" />
                        <span className="flex-1 text-left truncate">{s.nazev}</span>
                        <span className={`text-[10px] flex-shrink-0 ${selectedFolder === s.id ? 'text-stone-300' : 'text-stone-400'}`}>{s.pocet_dokumentu}</span>
                      </button>
                      <div className={`flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity ${selectedFolder === s.id ? '' : ''}`}>
                        <button
                          onClick={e => { e.stopPropagation(); setRenamingId(s.id); setRenameValue(s.nazev); }}
                          className={`p-1 rounded hover:bg-black/10 ${selectedFolder === s.id ? 'text-stone-300 hover:text-white' : 'text-stone-400 hover:text-stone-600'}`}
                          title="Přejmenovat"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); if (window.confirm(`Smazat složku „${s.nazev}"? Dokumenty budou přesunuty do kořene.`)) deleteSlozkaM.mutate(s.id); }}
                          className={`p-1 rounded hover:bg-black/10 ${selectedFolder === s.id ? 'text-stone-300 hover:text-red-300' : 'text-stone-400 hover:text-red-500'}`}
                          title="Smazat složku"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* New folder */}
            <div className="mt-2">
              {showNewFolder ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <input
                    autoFocus
                    className="flex-1 text-sm border border-stone-300 rounded px-1.5 py-0.5 bg-white min-w-0"
                    placeholder="Název složky"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') createSlozkaM.mutate({ nazev: newFolderName });
                      if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                    }}
                  />
                  <button onClick={() => createSlozkaM.mutate({ nazev: newFolderName })} disabled={!newFolderName.trim()} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40"><Check size={13} /></button>
                  <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="text-stone-400 hover:text-stone-600"><X size={13} /></button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  <FolderPlus size={13} /> Nová složka
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Files panel */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-stone-700">{selectedFolderName}</h2>
            <span className="text-xs text-stone-400">({docs.length} souborů)</span>
          </div>

          {docsLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : docs.length === 0 ? (
            <EmptyState icon={FolderOpen} title="Žádné dokumenty" desc="Nahrajte soubor tlačítkem nahoře nebo sem přetáhněte soubor." />
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Název</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Složka</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Velikost</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Nahráno</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d, i) => {
                    const folderName = slozky.find(s => s.id === d.slozka_id)?.nazev;
                    return (
                      <tr key={d.id} className={`${i < docs.length - 1 ? 'border-b border-stone-50' : ''} hover:bg-stone-50`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500 uppercase">
                              {d.filename.split('.').pop()}
                            </div>
                            <div className="text-sm font-medium text-stone-800">{d.nazev}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {folderName ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">
                              <Folder size={10} />{folderName}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-500">{d.velikost ? formatSize(d.velikost) : '—'}</td>
                        <td className="px-4 py-3 text-xs text-stone-500">{formatDatum(d.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownload(d)}
                              type="button"
                              className="text-xs text-stone-500 hover:text-stone-800"
                            >
                              Stáhnout
                            </button>
                            <button
                              onClick={() => setMovingDocId(d.id)}
                              className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-0.5"
                              title="Přesunout do složky"
                            >
                              <MoveRight size={11} /> Přesunout
                            </button>
                            <button onClick={() => deleteMut.mutate(d.id)} className="text-xs text-red-500 hover:text-red-700">Smazat</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Move to folder modal */}
      {movingDocId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4">
            <h3 className="text-sm font-bold text-stone-800">Přesunout do složky</h3>
            <div className="space-y-1">
              <button
                onClick={() => moveMut.mutate({ id: movingDocId, slozka_id: null })}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-stone-50 text-sm text-stone-700 transition-colors"
              >
                <Folder size={14} className="text-stone-400" /> Bez složky (kořen)
              </button>
              {slozky.map(s => (
                <button
                  key={s.id}
                  onClick={() => moveMut.mutate({ id: movingDocId, slozka_id: s.id })}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-stone-50 text-sm text-stone-700 transition-colors"
                >
                  <Folder size={14} className="text-amber-500" /> {s.nazev}
                </button>
              ))}
              {slozky.length === 0 && <p className="text-xs text-stone-400 px-3">Žádné složky. Nejdříve vytvořte složku v levém panelu.</p>}
            </div>
            <div className="flex justify-end">
              <Btn onClick={() => setMovingDocId(null)}>Zrušit</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DokumentyPage;
