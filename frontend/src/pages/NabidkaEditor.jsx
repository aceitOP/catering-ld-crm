import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { nabidkyApi, cenikApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Btn, Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import { Mail, Printer, ArrowLeft, Trash2, PlusCircle } from 'lucide-react';
import { Modal } from '../components/ui';
import { StavBadge } from '../components/ui';
import { printNabidkuPdf } from '../utils/print';

const STAV_LABELS_N = { koncept:'Koncept', odeslano:'Odesláno', prijato:'Přijato', zamitnuto:'Zamítnuto', expirovano:'Expirováno' };

export function NabidkaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasModule } = useAuth();
  const emailEnabled = hasModule('email');
  const qc = useQueryClient();
  const [emailModal, setEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: '', poznamka: '' });
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ nazev:'', uvodni_text:'', zaverecny_text:'', platnost_do:'', sleva_procent:0 });
  const [editPolozky, setEditPolozky] = useState([]);
  const [editCenikFilter, setEditCenikFilter] = useState('');

  const { data: nabData, isLoading } = useQuery({
    queryKey: ['nabidka', id],
    queryFn: () => nabidkyApi.get(id),
    enabled: !!id && id !== 'nova',
  });
  const n = nabData?.data;

  const cenikEnabled = hasModule('cenik');

  const { data: cenikEditData } = useQuery({
    queryKey: ['cenik-edit'],
    queryFn: () => cenikApi.list({ aktivni: 'true' }),
    enabled: editMode && cenikEnabled,
  });
  const cenikItems = cenikEnabled ? (cenikEditData?.data?.data || []) : [];
  const filteredCenikEdit = editCenikFilter
    ? cenikItems.filter(c => c.nazev.toLowerCase().includes(editCenikFilter.toLowerCase()))
    : cenikItems;

  const fmt = (v) => v == null ? '—' : new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(v);
  const fmtN = (v) => new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(v || 0);

  const odeslatMut = useMutation({
    mutationFn: (d) => nabidkyApi.odeslat(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nabidka', id] }); qc.invalidateQueries({ queryKey: ['nabidky'] }); toast.success('Nabídka odeslána emailem'); setEmailModal(false); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při odesílání'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => nabidkyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nabidka', id] }); qc.invalidateQueries({ queryKey: ['nabidky'] }); toast.success('Nabídka uložena'); setEditMode(false); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při ukládání'),
  });

  const startEdit = () => {
    setEditForm({
      nazev: n.nazev || '',
      uvodni_text: n.uvodni_text || '',
      zaverecny_text: n.zaverecny_text || '',
      platnost_do: n.platnost_do ? n.platnost_do.slice(0,10) : '',
      sleva_procent: n.sleva_procent || 0,
    });
    setEditPolozky((n.polozky||[]).map(p => ({
      kategorie: p.kategorie || 'jidlo',
      nazev: p.nazev || '',
      jednotka: p.jednotka || 'os.',
      mnozstvi: parseFloat(p.mnozstvi) || 1,
      cena_jednotka: parseFloat(p.cena_jednotka) || 0,
    })));
    setEditCenikFilter('');
    setEditMode(true);
  };

  const setEF = (k,v) => setEditForm(f => ({ ...f, [k]: v }));
  const addFromCenikEdit = (item) => {
    setEditPolozky(ps => [...ps, { kategorie: item.kategorie, nazev: item.nazev, jednotka: item.jednotka, mnozstvi: 1, cena_jednotka: parseFloat(item.cena_prodej) }]);
    setEditCenikFilter('');
  };
  const addBlankEdit = () => setEditPolozky(ps => [...ps, { kategorie:'jidlo', nazev:'', jednotka:'os.', mnozstvi:1, cena_jednotka:0 }]);
  const updateEP = (i,k,v) => setEditPolozky(ps => ps.map((p,idx) => idx===i ? { ...p, [k]:v } : p));
  const removeEP = (i) => setEditPolozky(ps => ps.filter((_,idx) => idx!==i));

  const editTotal = editPolozky.reduce((s,p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
  const editSleva = editTotal * ((parseFloat(editForm.sleva_procent)||0)/100);
  const editDph   = (editTotal - editSleva) * 0.12;
  const editCelkem = editTotal - editSleva + editDph;

  const handleSave = () => {
    if (!editForm.nazev) return toast.error('Zadejte název nabídky');
    if (editPolozky.length === 0) return toast.error('Přidejte alespoň jednu položku');
    updateMut.mutate({ ...editForm, polozky: editPolozky });
  };

  if (isLoading) return <div className="flex justify-center py-20"><Spinner/></div>;

  return (
    <div>
      <PageHeader
        title={editMode ? 'Upravit nabídku' : (n?.nazev || 'Nabídka')}
        subtitle={editMode ? '' : `v${n?.verze || 1} · ${n?.stav || ''}`}
        actions={<button onClick={() => editMode ? setEditMode(false) : navigate(-1)} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft size={13}/> {editMode ? 'Zrušit úpravy' : 'Zpět'}</button>}/>

      {editMode ? (
        <div className="p-6 max-w-4xl space-y-5">
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <h3 className="text-sm font-semibold text-stone-700 mb-4">Základní informace</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1">Název nabídky *</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={editForm.nazev} onChange={e => setEF('nazev', e.target.value)}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Platnost do</label>
                  <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={editForm.platnost_do} onChange={e => setEF('platnost_do', e.target.value)}/>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Sleva %</label>
                  <input type="number" min="0" max="100" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={editForm.sleva_procent} onChange={e => setEF('sleva_procent', e.target.value)}/>
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Úvodní text</label>
                <textarea rows={3} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  value={editForm.uvodni_text} onChange={e => setEF('uvodni_text', e.target.value)}/>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Závěrečný text</label>
                <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  value={editForm.zaverecny_text} onChange={e => setEF('zaverecny_text', e.target.value)}/>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-700">Položky nabídky</span>
              <button onClick={addBlankEdit} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
                <PlusCircle size={13}/> Vlastní položka
              </button>
            </div>
            {cenikEnabled && (
            <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
              <input className="w-full border border-stone-200 rounded-md px-3 py-1.5 text-xs focus:outline-none bg-white"
                placeholder="Hledat v ceníku a přidat…"
                value={editCenikFilter} onChange={e => setEditCenikFilter(e.target.value)}/>
              {editCenikFilter && filteredCenikEdit.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-stone-200 bg-white divide-y divide-stone-50">
                  {filteredCenikEdit.slice(0,10).map(c => (
                    <button key={c.id} onClick={() => addFromCenikEdit(c)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center justify-between">
                      <span className="text-stone-700">{c.nazev} <span className="text-stone-400">({c.jednotka})</span></span>
                      <span className="text-stone-500 font-medium">{Number(c.cena_prodej).toLocaleString('cs-CZ')} Kč</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
            {editPolozky.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-stone-400">Vyhledejte položku v ceníku nebo klikněte na „Vlastní položka".</div>
            ) : (
              <table className="w-full">
                <thead><tr className="bg-stone-50 border-b border-stone-100">
                  {['Název','Množství','Jednotka','Cena/jedn.','Celkem',''].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}
                </tr></thead>
                <tbody>{editPolozky.map((p,i) => (
                  <tr key={i} className={i < editPolozky.length-1 ? 'border-b border-stone-50' : ''}>
                    <td className="px-3 py-2"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={p.nazev} onChange={e => updateEP(i,'nazev',e.target.value)} placeholder="Název…"/></td>
                    <td className="px-3 py-2 w-24"><input type="number" min="0" step="0.1" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={p.mnozstvi} onChange={e => updateEP(i,'mnozstvi',e.target.value)}/></td>
                    <td className="px-3 py-2 w-24"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={p.jednotka} onChange={e => updateEP(i,'jednotka',e.target.value)}/></td>
                    <td className="px-3 py-2 w-32"><input type="number" min="0" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={p.cena_jednotka} onChange={e => updateEP(i,'cena_jednotka',e.target.value)}/></td>
                    <td className="px-3 py-2 w-32 text-xs font-medium text-stone-700">
                      {((parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0)).toLocaleString('cs-CZ')} Kč
                    </td>
                    <td className="px-3 py-2 w-8"><button onClick={() => removeEP(i)} className="text-stone-300 hover:text-red-500"><Trash2 size={13}/></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          {editPolozky.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="flex justify-end">
                <div className="space-y-1.5 text-sm min-w-[260px]">
                  <div className="flex justify-between text-stone-600"><span>Cena bez DPH</span><span>{fmtN(editTotal)}</span></div>
                  {parseFloat(editForm.sleva_procent) > 0 && (
                    <div className="flex justify-between text-green-600"><span>Sleva {editForm.sleva_procent} %</span><span>− {fmtN(editSleva)}</span></div>
                  )}
                  <div className="flex justify-between text-stone-600"><span>DPH 12 %</span><span>{fmtN(editDph)}</span></div>
                  <div className="flex justify-between font-semibold text-stone-900 text-base border-t border-stone-100 pt-2 mt-2"><span>Celkem s DPH</span><span>{fmtN(editCelkem)}</span></div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Btn onClick={() => setEditMode(false)}>Zrušit</Btn>
            <Btn variant="primary" onClick={handleSave} disabled={updateMut.isPending}>
              {updateMut.isPending ? 'Ukládám…' : 'Uložit změny'}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="p-6 max-w-3xl">
          {n && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">Přehled nabídky</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><div className="text-xs text-stone-400">Cena bez DPH</div><div className="font-semibold text-stone-800">{fmt(n.cena_bez_dph)}</div></div>
                  <div><div className="text-xs text-stone-400">DPH</div><div className="font-semibold text-stone-800">{fmt(n.dph)}</div></div>
                  <div><div className="text-xs text-stone-400">Celkem s DPH</div><div className="font-semibold text-lg text-stone-900">{fmt(n.cena_celkem)}</div></div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-stone-100"><span className="text-sm font-semibold text-stone-700">Položky nabídky</span></div>
                <table className="w-full">
                  <thead><tr className="bg-stone-50 border-b border-stone-100">{['Název','Mn.','Jedn.','Cena/jedn.','Celkem'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}</tr></thead>
                  <tbody>{(n.polozky||[]).map((p,i)=>(
                    <tr key={p.id} className={`${i<n.polozky.length-1?'border-b border-stone-50':''}`}>
                      <td className="px-4 py-2.5 text-sm text-stone-800">{p.nazev}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-600">{p.mnozstvi}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-500">{p.jednotka}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-700">{Number(p.cena_jednotka).toLocaleString('cs-CZ')} Kč</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-stone-800">{Number(p.cena_celkem).toLocaleString('cs-CZ')} Kč</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Btn onClick={startEdit}>Upravit nabídku</Btn>
                {emailEnabled && (
                  <Btn variant="primary" onClick={() => { setEmailForm({ to: '', poznamka: '' }); setEmailModal(true); }}>
                    <Mail size={13}/> Odeslat emailem
                  </Btn>
                )}
                <Btn onClick={() => printNabidkuPdf(n)}>
                  <Printer size={13}/> Export PDF
                </Btn>
                {['odeslano','prijato','zamitnuto'].map(s => (
                  <Btn key={s} onClick={() => nabidkyApi.setStav(n.id,{stav:s}).then(()=>{ qc.invalidateQueries({ queryKey: ['nabidka',id] }); toast.success('Stav aktualizován'); })}>
                    → {STAV_LABELS_N[s]}
                  </Btn>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {emailEnabled && (
      <Modal open={emailModal} onClose={() => setEmailModal(false)} title="Odeslat nabídku emailem"
        footer={<>
          <Btn onClick={() => setEmailModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => odeslatMut.mutate(emailForm)} disabled={!emailForm.to || odeslatMut.isPending}>
            {odeslatMut.isPending ? 'Odesílám…' : 'Odeslat'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">E-mail příjemce *</label>
            <input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="klient@email.cz"
              value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))} autoFocus/>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Osobní poznámka (volitelné)</label>
            <textarea rows={3} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              placeholder="Doplňující text, který se zobrazí v emailu před tabulkou nabídky…"
              value={emailForm.poznamka} onChange={e => setEmailForm(f => ({ ...f, poznamka: e.target.value }))}/>
          </div>
          <p className="text-xs text-stone-400">Po odeslání se stav nabídky automaticky změní na „Odesláno".</p>
        </div>
      </Modal>
      )}
    </div>
  );
}

export default NabidkaEditor;
