import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cenikApi } from '../api';
import { PageHeader, EmptyState, Btn, Modal, Spinner, ExportMenu, useSort, SortTh } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, Tag, Pencil as PencilCenik, Trash2 } from 'lucide-react';

// Převede klíč enumu na zobrazitelný název: 'firemni_catering' → 'Firemní catering'
const katLabel = (k) => k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');

// Převede uživatelský vstup na platný klíč enumu
const toKlic = (s) => s.trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // odstranit diakritiku
  .replace(/\s+/g, '_')
  .replace(/[^a-z0-9_]/g, '');

export function CenikPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [katModal, setKatModal] = useState(false);
  const [katFilter, setKatFilter] = useState('');
  const [editKat, setEditKat] = useState(null);
  const [editKatForm, setEditKatForm] = useState({ nazev:'' });
  const [deleteKat, setDeleteKat] = useState(null);
  const [deleteKatTarget, setDeleteKatTarget] = useState('');
  const [editRow, setEditRow] = useState(null);
  const [cenaEdit, setCenaEdit] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [editItemForm, setEditItemForm] = useState({ nazev:'', kategorie:'jidlo', jednotka:'os.', cena_nakup:0, cena_prodej:0, dph_sazba:12 });
  const [form, setForm] = useState({ nazev:'', kategorie:'jidlo', jednotka:'os.', cena_nakup:0, cena_prodej:0, dph_sazba:12 });
  const [katForm, setKatForm] = useState({ nazev:'' });

  const { data: katData } = useQuery({
    queryKey: ['cenik-kategorie'],
    queryFn: () => cenikApi.listKategorie(),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['cenik', katFilter],
    queryFn: () => cenikApi.list({ kategorie: katFilter||undefined, aktivni: 'true' }),
  });

  const createMut = useMutation({
    mutationFn: cenikApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cenik'] }); toast.success('Položka přidána'); setModal(false); },
  });

  const addKatMut = useMutation({
    mutationFn: (d) => cenikApi.addKategorie(d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cenik-kategorie'] });
      toast.success('Kategorie přidána');
      setKatModal(false);
      setKatForm({ nazev: '' });
      setForm(f => ({ ...f, kategorie: res.data.hodnota }));
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při přidávání kategorie'),
  });

  const updateKatMut = useMutation({
    mutationFn: ({ puvodni, klic }) => cenikApi.updateKategorie(puvodni, { klic }),
    onSuccess: (res, variables) => {
      qc.invalidateQueries({ queryKey: ['cenik-kategorie'] });
      qc.invalidateQueries({ queryKey: ['cenik'] });
      toast.success('Kategorie upravena');
      if (katFilter === variables.puvodni) setKatFilter(res.data.hodnota);
      setForm((f) => ({ ...f, kategorie: f.kategorie === variables.puvodni ? res.data.hodnota : f.kategorie }));
      setEditItemForm((f) => ({ ...f, kategorie: f.kategorie === variables.puvodni ? res.data.hodnota : f.kategorie }));
      setEditKat(null);
      setEditKatForm({ nazev:'' });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při úpravě kategorie'),
  });

  const deleteKatMut = useMutation({
    mutationFn: ({ klic, nahraditZa }) => cenikApi.deleteKategorie(klic, { nahraditZa }),
    onSuccess: (_res, variables) => {
      qc.invalidateQueries({ queryKey: ['cenik-kategorie'] });
      qc.invalidateQueries({ queryKey: ['cenik'] });
      toast.success('Kategorie smazána');
      if (katFilter === variables.klic) setKatFilter(variables.nahraditZa);
      setForm((f) => ({ ...f, kategorie: f.kategorie === variables.klic ? variables.nahraditZa : f.kategorie }));
      setEditItemForm((f) => ({ ...f, kategorie: f.kategorie === variables.klic ? variables.nahraditZa : f.kategorie }));
      setDeleteKat(null);
      setDeleteKatTarget('');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při mazání kategorie'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => cenikApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cenik'] }); setEditRow(null); setEditItem(null); toast.success('Položka aktualizována'); },
  });
  const openEditItem = (p) => {
    setEditItemForm({ nazev: p.nazev, kategorie: p.kategorie, jednotka: p.jednotka, cena_nakup: p.cena_nakup, cena_prodej: p.cena_prodej, dph_sazba: p.dph_sazba });
    setEditItem(p.id);
  };
  const setEI = (k, v) => setEditItemForm(f => ({ ...f, [k]: v }));

  const kategorie = katData?.data?.data || [];
  const items = data?.data?.data || [];
  const categoryUsage = items.reduce((acc, item) => { acc[item.kategorie] = (acc[item.kategorie] || 0) + 1; return acc; }, {});
  const sortC = useSort();
  const SORT_ACC_C = { nazev: 'nazev', jedn: 'jednotka', nakup: r => parseFloat(r.cena_nakup)||0, prodej: r => parseFloat(r.cena_prodej)||0, dph: r => parseFloat(r.dph_sazba)||0, marze: r => { const n=parseFloat(r.cena_nakup)||0,p=parseFloat(r.cena_prodej)||0; return p>0?(p-n)/p*100:0; } };
  const sortedItems = sortC.sortFn(items, SORT_ACC_C);
  const grouped = sortedItems.reduce((acc, item) => { (acc[item.kategorie] = acc[item.kategorie]||[]).push(item); return acc; }, {});
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const marze = (n,p) => p>0 ? Math.round((p-n)/p*100) : 0;
  const marze_color = (m) => m >= 40 ? 'text-green-700' : m >= 25 ? 'text-amber-700' : 'text-red-600';
  const klic = toKlic(katForm.nazev);
  const editKatKlic = toKlic(editKatForm.nazev);
  const deleteKatOptions = kategorie.filter((k) => k !== deleteKat);

  const openEditCategory = (kat) => {
    setKatModal(false);
    setEditKat(kat);
    setEditKatForm({ nazev: katLabel(kat) });
  };

  const openDeleteCategory = (kat) => {
    setKatModal(false);
    setDeleteKat(kat);
    setDeleteKatTarget(kategorie.find((k) => k !== kat) || '');
  };

  return (
    <div>
      <PageHeader title="Ceníky a číselníky" subtitle={`${items.length} aktivních položek`}
        actions={
          <div className="flex gap-2">
            <ExportMenu
              data={items}
              columns={[
                { header: 'Název',          accessor: 'nazev' },
                { header: 'Kategorie',       accessor: r => katLabel(r.kategorie) },
                { header: 'Jednotka',        accessor: 'jednotka' },
                { header: 'Nákupní cena',   accessor: r => Number(r.cena_nakup).toFixed(2) },
                { header: 'Prodejní cena',  accessor: r => Number(r.cena_prodej).toFixed(2) },
                { header: 'DPH %',          accessor: 'dph_sazba' },
                { header: 'Marže %',        accessor: r => marze(r.cena_nakup, r.cena_prodej) },
              ]}
              filename="cenik"
            />
            <Btn size="sm" onClick={() => setKatModal(true)}><Plus size={12}/> Správa kategorií</Btn>
            <Btn variant="primary" size="sm" onClick={() => setModal(true)}><Plus size={12}/> Nová položka</Btn>
          </div>
        }/>
      <div className="bg-stone-50 border-b border-stone-100 px-6 py-3 flex gap-2 flex-wrap">
        <button onClick={() => setKatFilter('')} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!katFilter?'bg-stone-900 text-white border-stone-900':'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}>Vše</button>
        {kategorie.map(k => (
          <button key={k} onClick={() => setKatFilter(k)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${katFilter===k?'bg-stone-900 text-white border-stone-900':'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}>{katLabel(k)}</button>
        ))}
      </div>
      <div className="p-6 space-y-6">
        {isLoading ? <div className="flex justify-center py-10"><Spinner/></div> :
         items.length === 0 ? <EmptyState icon={Tag} title="Žádné položky ceníku"/> :
         Object.entries(grouped).map(([kat, polozky]) => (
           <div key={kat} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
             <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
               <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">{katLabel(kat)} ({polozky.length})</span>
             </div>
             <table className="w-full">
               <thead><tr className="border-b border-stone-50">
                 {[['Název','nazev'],['Jedn.','jedn'],['Nákup','nakup'],['Prodej','prodej'],['DPH','dph'],['Marže','marze']].map(([l,k])=><SortTh key={k} label={l} sortKey={k} active={sortC.sortKey===k} dir={sortC.sortDir} onSort={sortC.toggle} className="py-2.5"/>)}
                 <th className="px-4 py-2.5"></th>
               </tr></thead>
               <tbody>{polozky.map((p,i)=>(
                 <tr key={p.id} className={`${i<polozky.length-1?'border-b border-stone-50':''} hover:bg-stone-50`}>
                   <td className="px-4 py-2.5 text-sm text-stone-800">{p.nazev}</td>
                   <td className="px-4 py-2.5 text-xs text-stone-500">{p.jednotka}</td>
                   <td className="px-4 py-2.5 text-sm text-stone-600">{Number(p.cena_nakup).toLocaleString('cs-CZ')} Kč</td>
                   <td className="px-4 py-2.5 text-sm font-medium text-stone-800">
                     {editRow === p.id ? (
                       <div className="flex items-center gap-1">
                         <input type="number" className="w-20 border border-stone-300 rounded px-2 py-1 text-xs focus:outline-none"
                           value={cenaEdit} onChange={e=>setCenaEdit(e.target.value)}
                           onKeyDown={e=>{ if(e.key==='Enter') updateMut.mutate({id:p.id,cena_prodej:parseFloat(cenaEdit)}); if(e.key==='Escape') setEditRow(null); }}
                           autoFocus/>
                         <button onClick={() => updateMut.mutate({id:p.id,cena_prodej:parseFloat(cenaEdit)})} className="text-green-700 text-xs font-medium">✓</button>
                       </div>
                     ) : (
                       <span onClick={() => {setEditRow(p.id);setCenaEdit(p.cena_prodej);}} className="cursor-pointer hover:underline">
                         {Number(p.cena_prodej).toLocaleString('cs-CZ')} Kč
                       </span>
                     )}
                   </td>
                   <td className="px-4 py-2.5 text-xs text-stone-500">{p.dph_sazba} %</td>
                   <td className={`px-4 py-2.5 text-sm font-medium ${marze_color(marze(p.cena_nakup, p.cena_prodej))}`}>
                     {marze(p.cena_nakup, p.cena_prodej)} %
                   </td>
                   <td className="px-4 py-2.5">
                     <div className="flex items-center gap-2">
                       <button onClick={() => openEditItem(p)} className="text-stone-400 hover:text-stone-700 transition-colors" title="Upravit položku"><PencilCenik size={13}/></button>
                       <button onClick={() => cenikApi.delete(p.id).then(()=>qc.invalidateQueries({ queryKey: ['cenik'] }))} className="text-xs text-stone-400 hover:text-red-600">Skrýt</button>
                     </div>
                   </td>
                 </tr>
               ))}</tbody>
             </table>
           </div>
         ))}
      </div>

      {/* Modal – nová položka ceníku */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nová položka ceníku"
        footer={<><Btn onClick={()=>setModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={()=>createMut.mutate(form)} disabled={!form.nazev||createMut.isPending}>{createMut.isPending?'Ukládám…':'Přidat'}</Btn></>}>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Název *</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.nazev} onChange={e=>set('nazev',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Kategorie</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.kategorie} onChange={e=>set('kategorie',e.target.value)}>
                {kategorie.map(k => <option key={k} value={k}>{katLabel(k)}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.jednotka} onChange={e=>set('jednotka',e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Nákupní cena</label><input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.cena_nakup} onChange={e=>set('cena_nakup',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Prodejní cena</label><input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.cena_prodej} onChange={e=>set('cena_prodej',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">DPH %</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.dph_sazba} onChange={e=>set('dph_sazba',e.target.value)}><option value={12}>12 %</option><option value={21}>21 %</option><option value={0}>0 %</option></select></div>
          </div>
          {form.cena_prodej > 0 && <div className="text-xs text-stone-500">Marže: <span className={`font-medium ${marze_color(marze(form.cena_nakup, form.cena_prodej))}`}>{marze(form.cena_nakup, form.cena_prodej)} %</span></div>}
        </div>
      </Modal>

      {/* Modal – editace položky ceníku */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Upravit položku ceníku"
        footer={<><Btn onClick={() => setEditItem(null)}>Zrušit</Btn><Btn variant="primary" onClick={() => updateMut.mutate({ id: editItem, ...editItemForm })} disabled={!editItemForm.nazev || updateMut.isPending}>{updateMut.isPending ? 'Ukládám…' : 'Uložit'}</Btn></>}>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Název *</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.nazev} onChange={e => setEI('nazev', e.target.value)} autoFocus/></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Kategorie</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.kategorie} onChange={e => setEI('kategorie', e.target.value)}>
                {kategorie.map(k => <option key={k} value={k}>{katLabel(k)}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.jednotka} onChange={e => setEI('jednotka', e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Nákupní cena</label><input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.cena_nakup} onChange={e => setEI('cena_nakup', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Prodejní cena</label><input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.cena_prodej} onChange={e => setEI('cena_prodej', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">DPH %</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.dph_sazba} onChange={e => setEI('dph_sazba', e.target.value)}><option value={12}>12 %</option><option value={21}>21 %</option><option value={0}>0 %</option></select></div>
          </div>
          {editItemForm.cena_prodej > 0 && <div className="text-xs text-stone-500">Marže: <span className={`font-medium ${marze_color(marze(editItemForm.cena_nakup, editItemForm.cena_prodej))}`}>{marze(editItemForm.cena_nakup, editItemForm.cena_prodej)} %</span></div>}
        </div>
      </Modal>

      {/* Modal – správa kategorií */}
      <Modal open={katModal} onClose={() => { setKatModal(false); setKatForm({ nazev: '' }); }} title="Správa kategorií"
        footer={<><Btn onClick={() => { setKatModal(false); setKatForm({ nazev: '' }); }}>Zavřít</Btn><Btn variant="primary" onClick={() => addKatMut.mutate({ klic })} disabled={!klic||addKatMut.isPending}>{addKatMut.isPending?'Ukládám…':'Přidat kategorii'}</Btn></>}>
        <div className="space-y-4">
          <div className="space-y-2">
            {kategorie.map((kat) => (
              <div key={kat} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium text-stone-800">{katLabel(kat)}</div>
                  <div className="text-xs text-stone-400">{kat} · {categoryUsage[kat] || 0} aktivních položek</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditCategory(kat)} className="text-stone-400 hover:text-stone-700 transition-colors" title="Přejmenovat kategorii"><PencilCenik size={14}/></button>
                  <button onClick={() => openDeleteCategory(kat)} className="text-stone-400 hover:text-red-600 transition-colors" title="Smazat kategorii"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Název nové kategorie *</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="např. Dezerty, Speciální menu…"
              value={katForm.nazev} onChange={e => setKatForm({ nazev: e.target.value })} autoFocus/>
          </div>
          {katForm.nazev && (
            <div className="text-xs text-stone-400">
              Klíč v databázi: <span className="font-mono font-medium text-stone-600">{klic || '—'}</span>
            </div>
          )}
          <p className="text-xs text-stone-400">Při smazání kategorie se všechny navázané položky přesunou do vybrané náhradní kategorie.</p>
        </div>
      </Modal>

      <Modal open={!!editKat} onClose={() => { setEditKat(null); setEditKatForm({ nazev: '' }); }} title="Přejmenovat kategorii"
        footer={<><Btn onClick={() => { setEditKat(null); setEditKatForm({ nazev: '' }); }}>Zrušit</Btn><Btn variant="primary" onClick={() => updateKatMut.mutate({ puvodni: editKat, klic: editKatKlic })} disabled={!editKatKlic || updateKatMut.isPending}>{updateKatMut.isPending ? 'Ukládám…' : 'Uložit'}</Btn></>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Nový název *</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={editKatForm.nazev} onChange={e => setEditKatForm({ nazev: e.target.value })} autoFocus/>
          </div>
          <div className="text-xs text-stone-400">
            Nový klíč v databázi: <span className="font-mono font-medium text-stone-600">{editKatKlic || '—'}</span>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteKat} onClose={() => { setDeleteKat(null); setDeleteKatTarget(''); }} title="Smazat kategorii"
        footer={<><Btn onClick={() => { setDeleteKat(null); setDeleteKatTarget(''); }}>Zrušit</Btn><Btn variant="danger" onClick={() => deleteKatMut.mutate({ klic: deleteKat, nahraditZa: deleteKatTarget })} disabled={!deleteKatTarget || deleteKatMut.isPending}>{deleteKatMut.isPending ? 'Mažu…' : 'Smazat kategorii'}</Btn></>}>
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            Kategorie <span className="font-semibold text-stone-800">{deleteKat ? katLabel(deleteKat) : ''}</span> bude odstraněna a existující položky se přesunou do jiné kategorie.
          </p>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Náhradní kategorie *</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={deleteKatTarget} onChange={e => setDeleteKatTarget(e.target.value)}>
              {deleteKatOptions.map(k => <option key={k} value={k}>{katLabel(k)}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default CenikPage;
