import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { fakturyApi, cenikApi, klientiApi } from '../api';
import { Btn, Spinner, Modal } from '../components/ui';
import toast from 'react-hot-toast';
import { ArrowLeft, Trash2, Pencil, Printer, Plus, X as XIcon, CheckCircle2, Ban } from 'lucide-react';
import { printFakturuPdf } from '../utils/print';

const FAKTURA_STAV = {
  vystavena: { label: 'Vystavena', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  odeslana:  { label: 'Odeslána',  cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  zaplacena: { label: 'Zaplacena', cls: 'bg-green-50 text-green-700 border border-green-200' },
  storno:    { label: 'Storno',    cls: 'bg-red-50 text-red-400 border border-red-200' },
};

function FakturaStavBadge({ stav }) {
  const cfg = FAKTURA_STAV[stav] || { label: stav, cls: 'bg-stone-100 text-stone-500' };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

export function FakturaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editPolozky, setEditPolozky] = useState([]);
  const [cenikFilter, setCenikFilter] = useState('');
  const [klientEditSearch, setKlientEditSearch] = useState('');
  const [klientEditSelected, setKlientEditSelected] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['faktura', id],
    queryFn: () => fakturyApi.get(id),
  });
  const f = data?.data;

  const { data: cenikData } = useQuery({
    queryKey: ['cenik'],
    queryFn: () => cenikApi.list({ limit: 200 }),
    enabled: editMode,
  });
  const cenikItems = cenikData?.data?.data || [];
  const filteredCenik = cenikFilter
    ? cenikItems.filter(c => c.nazev.toLowerCase().includes(cenikFilter.toLowerCase()))
    : [];

  const { data: klientiEditData } = useQuery({
    queryKey: ['klienti-edit-search', klientEditSearch],
    queryFn: () => klientiApi.list({ q: klientEditSearch, limit: 10 }),
    enabled: editMode && klientEditSearch.length >= 1,
  });
  const klientiEditSuggestions = klientiEditData?.data?.data || [];

  useEffect(() => {
    if (f && editMode) {
      setEditForm({
        datum_splatnosti: f.datum_splatnosti?.slice(0, 10) || '',
        zpusob_platby: f.zpusob_platby || 'převod',
        variabilni_symbol: f.variabilni_symbol || '',
        poznamka: f.poznamka || '',
      });
      setEditPolozky((f.polozky || []).map(p => ({
        nazev: p.nazev, jednotka: p.jednotka, mnozstvi: parseFloat(p.mnozstvi),
        cena_jednotka: parseFloat(p.cena_jednotka), dph_sazba: p.dph_sazba || 12,
      })));
      setKlientEditSelected(f.klient_id ? {
        id: f.klient_id,
        jmeno: f.klient_jmeno, prijmeni: f.klient_prijmeni, firma: f.klient_firma,
      } : null);
      setKlientEditSearch('');
    }
  }, [f, editMode]);

  const stavMut = useMutation({
    mutationFn: (d) => fakturyApi.setStav(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['faktura', id] }); qc.invalidateQueries({ queryKey: ['faktury'] }); },
  });

  const updateMut = useMutation({
    mutationFn: (d) => fakturyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['faktura', id] }); setEditMode(false); toast.success('Faktura uložena'); },
  });

  const deleteMut = useMutation({
    mutationFn: () => fakturyApi.delete(id),
    onSuccess: () => { navigate('/faktury'); toast.success('Faktura smazána'); },
  });

  const updateEditPolozka = (i, k, v) => setEditPolozky(ps => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removeEditPolozka = (i) => setEditPolozky(ps => ps.filter((_, idx) => idx !== i));
  const addBlankPolozka = () => setEditPolozky(ps => [...ps, { nazev: '', jednotka: 'os.', mnozstvi: 1, cena_jednotka: 0, dph_sazba: 12 }]);
  const addFromCenikF = (item) => setEditPolozky(ps => [...ps, { nazev: item.nazev, jednotka: item.jednotka, mnozstvi: 1, cena_jednotka: parseFloat(item.cena_prodej), dph_sazba: item.dph_sazba || 12 }]);

  const fmtC = (n) => n != null ? Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč' : '—';
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('cs-CZ') : '—';

  const editTotalBezDph = editPolozky.reduce((s, p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
  const editDph = editPolozky.reduce((s, p) => { const c=(parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0); return s+c*((p.dph_sazba||12)/100); }, 0);

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!f) return <div className="p-6 text-stone-400">Faktura nenalezena</div>;

  const firma = f.dodavatel_json || {};

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/faktury')} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors">
            <ArrowLeft size={16}/>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-stone-800 font-mono">{f.cislo}</h1>
              <FakturaStavBadge stav={f.stav} />
            </div>
            <div className="text-xs text-stone-400 mt-0.5">
              Vystavena {fmtD(f.datum_vystaveni)}
              {f.zakazka_cislo && <> · <button onClick={() => navigate(`/zakazky/${f.zakazka_id}`)} className="hover:underline text-brand-600">{f.zakazka_cislo}</button></>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Btn size="sm" onClick={() => printFakturuPdf(f)}><Printer size={12}/> PDF</Btn>
          {f.stav === 'vystavena' && !editMode && (
            <Btn size="sm" onClick={() => setEditMode(true)}><Pencil size={12}/> Upravit</Btn>
          )}
          {f.stav === 'vystavena' && (
            <Btn size="sm" onClick={() => stavMut.mutate({ stav: 'odeslana' })} disabled={stavMut.isPending}>
              Označit jako odeslanou
            </Btn>
          )}
          {f.stav === 'odeslana' && (
            <Btn size="sm" variant="primary" onClick={() => stavMut.mutate({ stav: 'zaplacena' })} disabled={stavMut.isPending}>
              <CheckCircle2 size={12}/> Zaplacena
            </Btn>
          )}
          {(f.stav === 'vystavena' || f.stav === 'odeslana') && (
            <Btn size="sm" onClick={() => { if (window.confirm('Stornovat fakturu?')) stavMut.mutate({ stav: 'storno' }); }}>
              <Ban size={12}/> Storno
            </Btn>
          )}
          {f.stav === 'vystavena' && (
            <Btn size="sm" onClick={() => { if (window.confirm('Smazat fakturu?')) deleteMut.mutate(); }}>
              <Trash2 size={12}/> Smazat
            </Btn>
          )}
        </div>
      </div>

      {/* Dodavatel / Odběratel */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="text-xs text-stone-400 font-semibold uppercase tracking-wide mb-3">Dodavatel</div>
          <div className="text-sm font-bold text-stone-800">{firma.firma_nazev || '—'}</div>
          <div className="text-xs text-stone-500 mt-1 space-y-0.5">
            {firma.firma_adresa && <div>{firma.firma_adresa}</div>}
            {firma.firma_ico && <div>IČO: {firma.firma_ico}{firma.firma_dic && ` · DIČ: ${firma.firma_dic}`}</div>}
            {firma.firma_iban && <div>Účet: {firma.firma_iban}</div>}
            {firma.firma_email && <div>{firma.firma_email}</div>}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="text-xs text-stone-400 font-semibold uppercase tracking-wide mb-3">Odběratel</div>
          <div className="text-sm font-bold text-stone-800">
            {f.klient_firma || [f.klient_jmeno, f.klient_prijmeni].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="text-xs text-stone-500 mt-1 space-y-0.5">
            {f.klient_adresa && <div>{f.klient_adresa}</div>}
            {f.klient_ico && <div>IČO: {f.klient_ico}{f.klient_dic && ` · DIČ: ${f.klient_dic}`}</div>}
            {f.klient_email && <div>{f.klient_email}</div>}
          </div>
        </div>
      </div>

      {/* Meta info */}
      {editMode ? (
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          {/* Odběratel */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Odběratel</label>
            <div className="relative">
              {klientEditSelected ? (
                <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                  <div className="flex-1 text-sm font-medium text-stone-800">
                    {klientEditSelected.firma || [klientEditSelected.jmeno, klientEditSelected.prijmeni].filter(Boolean).join(' ')}
                  </div>
                  <button onClick={() => { setKlientEditSelected(null); setKlientEditSearch(''); }} className="text-stone-400 hover:text-red-500"><XIcon size={14}/></button>
                </div>
              ) : (
                <input
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder="Hledat klienta…"
                  value={klientEditSearch}
                  onChange={e => setKlientEditSearch(e.target.value)}
                />
              )}
              {!klientEditSelected && klientiEditSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {klientiEditSuggestions.map(k => (
                    <button key={k.id} onClick={() => { setKlientEditSelected(k); setKlientEditSearch(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 border-b border-stone-50 last:border-0">
                      <div className="text-sm font-medium text-stone-800">{k.firma || [k.jmeno, k.prijmeni].filter(Boolean).join(' ')}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Datum splatnosti</label>
              <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.datum_splatnosti} onChange={e => setEditForm(f => ({ ...f, datum_splatnosti: e.target.value }))}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Způsob platby</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                value={editForm.zpusob_platby} onChange={e => setEditForm(f => ({ ...f, zpusob_platby: e.target.value }))}>
                <option value="převod">Bankovní převod</option>
                <option value="hotovost">Hotovost</option>
                <option value="karta">Platební karta</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Variabilní symbol</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.variabilni_symbol} onChange={e => setEditForm(f => ({ ...f, variabilni_symbol: e.target.value }))}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Poznámka</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.poznamka} onChange={e => setEditForm(f => ({ ...f, poznamka: e.target.value }))}/>
            </div>
          </div>

          {/* Položky edit */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-stone-700">Položky</span>
              <div className="flex gap-2">
                <button onClick={addBlankPolozka} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
                  <Plus size={11}/> Vlastní položka
                </button>
              </div>
            </div>
            <div className="border border-stone-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-stone-50 border-b border-stone-100">
                <input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none bg-white"
                  placeholder="Hledat v ceníku…" value={cenikFilter} onChange={e => setCenikFilter(e.target.value)}/>
                {cenikFilter && filteredCenik.length > 0 && (
                  <div className="mt-1 max-h-36 overflow-y-auto rounded border border-stone-200 bg-white divide-y divide-stone-50">
                    {filteredCenik.slice(0, 8).map(c => (
                      <button key={c.id} onClick={() => { addFromCenikF(c); setCenikFilter(''); }}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-stone-50 flex justify-between">
                        <span>{c.nazev} <span className="text-stone-400">({c.jednotka})</span></span>
                        <span className="text-stone-500">{Number(c.cena_prodej).toLocaleString('cs-CZ')} Kč</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <table className="w-full">
                <thead><tr className="bg-stone-50 border-b border-stone-100">
                  {['Název','Mn.','Jedn.','Cena/jedn.','DPH %','Celkem',''].map(h =>
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-stone-400">{h}</th>)}
                </tr></thead>
                <tbody>
                  {editPolozky.map((p, i) => {
                    const celkem = (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0);
                    return (
                      <tr key={i} className="border-b border-stone-50">
                        <td className="px-3 py-1.5"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                          value={p.nazev} onChange={e => updateEditPolozka(i,'nazev',e.target.value)} placeholder="Název…"/></td>
                        <td className="px-3 py-1.5 w-20"><input type="number" min="0" step="0.1" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                          value={p.mnozstvi} onChange={e => updateEditPolozka(i,'mnozstvi',e.target.value)}/></td>
                        <td className="px-3 py-1.5 w-20"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                          value={p.jednotka} onChange={e => updateEditPolozka(i,'jednotka',e.target.value)}/></td>
                        <td className="px-3 py-1.5 w-28"><input type="number" min="0" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                          value={p.cena_jednotka} onChange={e => updateEditPolozka(i,'cena_jednotka',e.target.value)}/></td>
                        <td className="px-3 py-1.5 w-20">
                          <select className="w-full border border-stone-200 rounded px-1 py-1 text-xs focus:outline-none bg-white"
                            value={p.dph_sazba} onChange={e => updateEditPolozka(i,'dph_sazba',parseInt(e.target.value))}>
                            <option value={0}>0 %</option><option value={12}>12 %</option><option value={21}>21 %</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5 w-28 text-xs font-medium text-stone-700">{fmtC(celkem)}</td>
                        <td className="px-3 py-1.5 w-8">
                          <button onClick={() => removeEditPolozka(i)} className="text-stone-300 hover:text-red-500"><Trash2 size={13}/></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 flex justify-end gap-2 text-xs text-stone-500 bg-stone-50">
                <span>Bez DPH: <strong>{fmtC(editTotalBezDph)}</strong></span>
                <span className="text-stone-300">|</span>
                <span>DPH: <strong>{fmtC(editDph)}</strong></span>
                <span className="text-stone-300">|</span>
                <span className="text-stone-800 font-semibold">Celkem: {fmtC(editTotalBezDph + editDph)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Btn onClick={() => setEditMode(false)}>Zrušit</Btn>
            <Btn variant="primary" onClick={() => updateMut.mutate({ ...editForm, polozky: editPolozky, klient_id: klientEditSelected?.id || null })} disabled={updateMut.isPending}>
              Uložit fakturu
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Datum vystavení', value: fmtD(f.datum_vystaveni) },
              { label: 'Datum splatnosti', value: fmtD(f.datum_splatnosti) },
              { label: 'Způsob platby', value: f.zpusob_platby || '—' },
              { label: 'Variabilní symbol', value: f.variabilni_symbol || '—' },
            ].map(m => (
              <div key={m.label} className="bg-white border border-stone-200 rounded-xl px-4 py-3">
                <div className="text-xs text-stone-400 mb-1">{m.label}</div>
                <div className="text-sm font-semibold text-stone-800">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Položky */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-100">
              <span className="text-sm font-semibold text-stone-700">Položky ({(f.polozky||[]).length})</span>
            </div>
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['Název','Množství','Jednotka','Cena/jedn.','DPH','Celkem s DPH'].map(h =>
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-stone-500">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-stone-50">
                {(f.polozky || []).map((p, i) => {
                  const c = (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0);
                  const d = c * ((p.dph_sazba||12)/100);
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-sm text-stone-700">{p.nazev}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-600">{p.mnozstvi}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-600">{p.jednotka}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-600">{fmtC(p.cena_jednotka)}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-500">{p.dph_sazba || 12} %</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-stone-800">{fmtC(c + d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-4 bg-stone-50 border-t border-stone-100 flex justify-end">
              <div className="space-y-1 min-w-[260px] text-sm">
                <div className="flex justify-between text-stone-600"><span>Základ daně</span><span>{fmtC(f.cena_bez_dph)}</span></div>
                <div className="flex justify-between text-stone-600"><span>DPH</span><span>{fmtC(f.dph)}</span></div>
                <div className="flex justify-between font-bold text-stone-900 text-base border-t border-stone-200 pt-2 mt-2">
                  <span>Celkem k úhradě</span><span>{fmtC(f.cena_celkem)}</span>
                </div>
                {f.stav === 'zaplacena' && f.datum_zaplaceni && (
                  <div className="text-xs text-green-600 text-right mt-1">Zaplaceno {fmtD(f.datum_zaplaceni)}</div>
                )}
              </div>
            </div>
          </div>
          {f.poznamka && (
            <div className="bg-white border border-stone-200 rounded-xl px-5 py-4">
              <div className="text-xs text-stone-400 mb-1">Poznámka</div>
              <div className="text-sm text-stone-600">{f.poznamka}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FakturaDetail;
