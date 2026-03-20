import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { nabidkyApi, zakazkyApi, cenikApi } from '../api';
import { PageHeader, Btn } from '../components/ui';
import toast from 'react-hot-toast';
import { ArrowLeft, Trash2, PlusCircle } from 'lucide-react';

export function NovaNabidka() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    zakazka_id: searchParams.get('zakazka_id') || '',
    nazev: '',
    uvodni_text: '',
    zaverecny_text: '',
    platnost_do: '',
    sleva_procent: 0,
  });
  const [polozky, setPolozky] = useState([]);
  const [cenikFilter, setCenikFilter] = useState('');

  const { data: zakazkyData } = useQuery({
    queryKey: ['zakazky-select'],
    queryFn: () => zakazkyApi.list({ limit: 200 }),
  });
  const { data: cenikData } = useQuery({
    queryKey: ['cenik-all'],
    queryFn: () => cenikApi.list({ aktivni: 'true' }),
  });

  const zakazky = zakazkyData?.data?.data || [];
  const cenik   = cenikData?.data?.data || [];

  const totalBezDph = polozky.reduce((s, p) => s + (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0), 0);
  const sleva       = totalBezDph * ((parseFloat(form.sleva_procent) || 0) / 100);
  const dph         = (totalBezDph - sleva) * 0.12;
  const celkem      = totalBezDph - sleva + dph;
  const fmt = (n) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addFromCenik = (item) => {
    setPolozky(ps => [...ps, { kategorie: item.kategorie, nazev: item.nazev, jednotka: item.jednotka, mnozstvi: 1, cena_jednotka: parseFloat(item.cena_prodej) }]);
    setCenikFilter('');
  };
  const addBlank = () => setPolozky(ps => [...ps, { kategorie: 'jidlo', nazev: '', jednotka: 'os.', mnozstvi: 1, cena_jednotka: 0 }]);
  const updatePolozka = (i, k, v) => setPolozky(ps => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removePolozka = (i) => setPolozky(ps => ps.filter((_, idx) => idx !== i));

  const createMut = useMutation({
    mutationFn: (data) => nabidkyApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['nabidky'] });
      toast.success('Nabídka vytvořena');
      navigate(`/nabidky/${res.data.id}/edit`);
    },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const handleSubmit = () => {
    if (!form.zakazka_id || !form.nazev) return toast.error('Vyplňte zakázku a název');
    if (polozky.length === 0) return toast.error('Přidejte alespoň jednu položku');
    createMut.mutate({ ...form, polozky });
  };

  const filteredCenik = cenikFilter
    ? cenik.filter(c => c.nazev.toLowerCase().includes(cenikFilter.toLowerCase()))
    : cenik;

  return (
    <div>
      <PageHeader title="Nová nabídka"
        actions={<button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft size={13}/> Zpět</button>}/>
      <div className="p-6 max-w-4xl space-y-5">

        {/* Základní informace */}
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">Základní informace</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Zakázka *</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={form.zakazka_id} onChange={e => set('zakazka_id', e.target.value)}>
                <option value="">— vyberte zakázku —</option>
                {zakazky.map(z => <option key={z.id} value={z.id}>{z.cislo} · {z.nazev}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Název nabídky *</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                placeholder="např. Nabídka svatební hostiny 2026"
                value={form.nazev} onChange={e => set('nazev', e.target.value)}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1">Platnost do</label>
                <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={form.platnost_do} onChange={e => set('platnost_do', e.target.value)}/>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Sleva %</label>
                <input type="number" min="0" max="100" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={form.sleva_procent} onChange={e => set('sleva_procent', e.target.value)}/>
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Úvodní text</label>
              <textarea rows={3} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                placeholder="Oslovení a úvod nabídky…"
                value={form.uvodni_text} onChange={e => set('uvodni_text', e.target.value)}/>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Závěrečný text</label>
              <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                placeholder="Poděkování, podmínky, kontakt…"
                value={form.zaverecny_text} onChange={e => set('zaverecny_text', e.target.value)}/>
            </div>
          </div>
        </div>

        {/* Položky */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-700">Položky nabídky</span>
            <button onClick={addBlank} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
              <PlusCircle size={13}/> Vlastní položka
            </button>
          </div>
          <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
            <input className="w-full border border-stone-200 rounded-md px-3 py-1.5 text-xs focus:outline-none bg-white"
              placeholder="Hledat v ceníku a přidat…"
              value={cenikFilter} onChange={e => setCenikFilter(e.target.value)}/>
            {cenikFilter && filteredCenik.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-stone-200 bg-white divide-y divide-stone-50">
                {filteredCenik.slice(0, 10).map(c => (
                  <button key={c.id} onClick={() => addFromCenik(c)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center justify-between">
                    <span className="text-stone-700">{c.nazev} <span className="text-stone-400">({c.jednotka})</span></span>
                    <span className="text-stone-500 font-medium">{Number(c.cena_prodej).toLocaleString('cs-CZ')} Kč</span>
                  </button>
                ))}
              </div>
            )}
            {cenikFilter && filteredCenik.length === 0 && (
              <div className="mt-2 text-xs text-stone-400 py-2 text-center">Žádná položka nebyla nalezena</div>
            )}
          </div>
          {polozky.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-stone-400">
              Vyhledejte položku v ceníku nebo klikněte na „Vlastní položka".
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  {['Název','Množství','Jednotka','Cena/jedn.','Celkem',''].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {polozky.map((p, i) => (
                  <tr key={i} className={i < polozky.length - 1 ? 'border-b border-stone-50' : ''}>
                    <td className="px-3 py-2">
                      <input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.nazev} onChange={e => updatePolozka(i, 'nazev', e.target.value)} placeholder="Název…"/>
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input type="number" min="0" step="0.1" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.mnozstvi} onChange={e => updatePolozka(i, 'mnozstvi', e.target.value)}/>
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.jednotka} onChange={e => updatePolozka(i, 'jednotka', e.target.value)}/>
                    </td>
                    <td className="px-3 py-2 w-32">
                      <input type="number" min="0" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.cena_jednotka} onChange={e => updatePolozka(i, 'cena_jednotka', e.target.value)}/>
                    </td>
                    <td className="px-3 py-2 w-32 text-xs font-medium text-stone-700">
                      {((parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0)).toLocaleString('cs-CZ')} Kč
                    </td>
                    <td className="px-3 py-2 w-8">
                      <button onClick={() => removePolozka(i)} className="text-stone-300 hover:text-red-500"><Trash2 size={13}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Přehled cen */}
        {polozky.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="flex justify-end">
              <div className="space-y-1.5 text-sm min-w-[260px]">
                <div className="flex justify-between text-stone-600">
                  <span>Cena bez DPH</span><span>{fmt(totalBezDph)}</span>
                </div>
                {parseFloat(form.sleva_procent) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Sleva {form.sleva_procent} %</span><span>− {fmt(sleva)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-600">
                  <span>DPH 12 %</span><span>{fmt(dph)}</span>
                </div>
                <div className="flex justify-between font-semibold text-stone-900 text-base border-t border-stone-100 pt-2 mt-2">
                  <span>Celkem s DPH</span><span>{fmt(celkem)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Akce */}
        <div className="flex justify-end gap-2">
          <Btn onClick={() => navigate(-1)}>Zrušit</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={!form.zakazka_id || !form.nazev || createMut.isPending}>
            {createMut.isPending ? 'Ukládám…' : 'Vytvořit nabídku'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default NovaNabidka;
