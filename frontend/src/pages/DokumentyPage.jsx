import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dokumentyApi } from '../api';
import { PageHeader, EmptyState, Btn, Spinner, useSort, SortTh } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, FolderOpen } from 'lucide-react';

const KAT_LABELS = { nabidka:'Nabídka', kalkulace:'Kalkulace', smlouva:'Smlouva', poptavka:'Poptávka', podklady:'Podklady', foto:'Foto', interni:'Interní' };
const MAX_FILE_SIZE_MB = 25;

export function DokumentyPage() {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [selD, setSelD] = useState(new Set());
  const toggleSelD = (id, e) => { e.stopPropagation(); setSelD(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; }); };
  const bulkDeleteDocs = () => {
    if (!window.confirm(`Smazat ${selD.size} dokumentů?`)) return;
    Promise.all([...selD].map(id => dokumentyApi.delete(id))).then(() => { qc.invalidateQueries({ queryKey: ['dokumenty'] }); setSelD(new Set()); toast.success('Dokumenty smazány'); });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dokumenty'],
    queryFn: () => dokumentyApi.list(),
  });
  const docsRaw = data?.data?.data || [];
  const sortD = useSort();
  const SORT_ACC_D = { nazev: 'nazev', kategorie: 'kategorie', velikost: r => Number(r.velikost) || 0, nahrano: 'created_at' };
  const docs = sortD.sortFn(docsRaw, SORT_ACC_D);

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
    try {
      await dokumentyApi.upload(fd);
      qc.invalidateQueries({ queryKey: ['dokumenty'] });
      toast.success('Soubor nahrán');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Chyba při nahrávání');
    }
    setUploading(false);
    e.target.value = '';
  };

  const deleteMut = useMutation({
    mutationFn: dokumentyApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dokumenty'] }); toast.success('Dokument smazán'); },
  });

  const formatSize = (b) => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)} MB` : `${Math.round(b/1024)} KB`;
  const formatDatum = (d) => new Date(d).toLocaleDateString('cs-CZ');

  return (
    <div>
      <PageHeader title="Dokumenty a přílohy" subtitle={`${docs.length} souborů`}
        actions={
          <div className="flex flex-col items-end gap-1">
            <label className="inline-flex items-center gap-1.5 bg-stone-900 text-white text-xs font-medium px-3 py-2 rounded-md hover:bg-stone-800 cursor-pointer transition-colors">
              <Plus size={12}/> {uploading ? 'Nahrávám…' : 'Nahrát soubor'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading}/>
            </label>
            <div className="text-[11px] text-stone-400">Maximální velikost souboru: {MAX_FILE_SIZE_MB} MB</div>
          </div>
        }/>
      <div className="p-6">
        {isLoading ? <div className="flex justify-center py-10"><Spinner/></div> :
         docs.length === 0 ? <EmptyState icon={FolderOpen} title="Žádné dokumenty" desc="Nahrajte první soubor tlačítkem nahoře."/> :
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-stone-50 border-b border-stone-100">
              <th className="pl-4 pr-2 py-3 w-8"><input type="checkbox" checked={docs.length>0&&docs.every(r=>selD.has(r.id))} onChange={() => setSelD(docs.every(r=>selD.has(r.id))?new Set():new Set(docs.map(r=>r.id)))} className="rounded cursor-pointer"/></th>
              {[['Název','nazev'],['Kategorie','kategorie'],['Velikost','velikost'],['Nahráno','nahrano']].map(([l,k])=><SortTh key={k} label={l} sortKey={k} active={sortD.sortKey===k} dir={sortD.sortDir} onSort={sortD.toggle}/>)}
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Akce</th>
            </tr></thead>
            <tbody>{docs.map((d,i)=>(
              <tr key={d.id} className={`${selD.has(d.id)?'bg-stone-50':''} ${i<docs.length-1?'border-b border-stone-50':''} hover:bg-stone-50`}>
                <td className="pl-4 pr-2 w-8" onClick={e=>toggleSelD(d.id,e)}><input type="checkbox" checked={selD.has(d.id)} onChange={()=>{}} className="rounded cursor-pointer"/></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500 uppercase">{d.filename.split('.').pop()}</div>
                    <div className="text-sm font-medium text-stone-800">{d.nazev}</div>
                  </div>
                </td>
                <td className="px-4 py-3"><span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{KAT_LABELS[d.kategorie]||d.kategorie}</span></td>
                <td className="px-4 py-3 text-xs text-stone-500">{d.velikost ? formatSize(d.velikost) : '—'}</td>
                <td className="px-4 py-3 text-xs text-stone-500">{formatDatum(d.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <a href={`/uploads/${d.filename}`} target="_blank" rel="noreferrer" className="text-xs text-stone-500 hover:text-stone-800">Stáhnout</a>
                    <button onClick={() => deleteMut.mutate(d.id)} className="text-xs text-red-500 hover:text-red-700">Smazat</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </div>
      {selD.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-stone-900 text-white rounded-xl px-5 py-3 shadow-2xl z-30">
          <span className="text-sm font-medium">{selD.size} vybráno</span>
          <button onClick={bulkDeleteDocs} className="text-xs bg-red-500/70 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors">Smazat</button>
          <button onClick={() => setSelD(new Set())} className="text-xs text-stone-400 hover:text-white ml-1 transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}

export default DokumentyPage;
