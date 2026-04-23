import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fakturyApi, klientiApi, cenikApi, nastaveniApi, zakazkyApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { Btn, Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import { ArrowLeft, Trash2, Plus, X as XIcon, Receipt } from 'lucide-react';

export function NovaFakturaPage() {
  const navigate = useNavigate();
  const { hasModule } = useAuth();
  const cenikEnabled = hasModule('cenik');
  const qc = useQueryClient();
  const [searchParamsF] = useSearchParams();
  const zakazkaIdParam = searchParamsF.get('zakazka_id');

  const [klientSearch, setKlientSearch] = useState('');
  const [klientSelected, setKlientSelected] = useState(null);
  const [klientOpen, setKlientOpen] = useState(false);
  const [polozky, setPolozky] = useState([]);
  const [cenikFilterN, setCenikFilterN] = useState('');
  const [form, setForm] = useState({
    datum_splatnosti: '',
    zpusob_platby: 'převod',
    variabilni_symbol: '',
    poznamka: '',
  });

  // Načti zakázku (pokud přišli z detailu zakázky)
  const { data: zakazkaData } = useQuery({
    queryKey: ['zakazka-pre', zakazkaIdParam],
    queryFn: () => zakazkyApi.get(zakazkaIdParam),
    enabled: !!zakazkaIdParam,
  });

  // Načti nastavení pro výchozí splatnost
  const { data: nastavData } = useQuery({
    queryKey: ['nastaveni'],
    queryFn: () => nastaveniApi.get(),
  });

  useEffect(() => {
    if (nastavData?.data) {
      const splatnost = parseInt(nastavData.data.faktura_splatnost) || 14;
      const d = new Date();
      d.setDate(d.getDate() + splatnost);
      setForm(f => ({ ...f, datum_splatnosti: d.toISOString().slice(0, 10) }));
    }
  }, [nastavData]);

  useEffect(() => {
    if (zakazkaData?.data) {
      const z = zakazkaData.data;
      if (z.klient_id) {
        setKlientSelected({
          id: z.klient_id,
          jmeno: z.klient_jmeno, prijmeni: z.klient_prijmeni, firma: z.klient_firma,
        });
      }
      if (z.nabidka?.polozky?.length > 0) {
        setPolozky(z.nabidka.polozky.map(p => ({
          nazev: p.nazev,
          jednotka: p.jednotka || 'os.',
          mnozstvi: parseFloat(p.mnozstvi) || 1,
          cena_jednotka: parseFloat(p.cena_jednotka) || 0,
          dph_sazba: p.dph_sazba || 12,
        })));
      }
    }
  }, [zakazkaData]);

  const { data: klientiData } = useQuery({
    queryKey: ['klienti-search', klientSearch],
    queryFn: () => klientiApi.list({ q: klientSearch, limit: 10 }),
    enabled: klientSearch.length >= 1,
  });
  const klientiSuggestions = klientiData?.data?.data || [];

  const { data: cenikDataN } = useQuery({
    queryKey: ['cenik'],
    queryFn: () => cenikApi.list({ limit: 200 }),
    enabled: cenikEnabled,
  });
  const cenikItemsN = cenikEnabled ? (cenikDataN?.data?.data || []) : [];
  const filteredCenikN = cenikFilterN
    ? cenikItemsN.filter(c => c.nazev.toLowerCase().includes(cenikFilterN.toLowerCase()))
    : [];

  const updatePolozkaF = (i, k, v) => setPolozky(ps => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removePolozkaF = (i) => setPolozky(ps => ps.filter((_, idx) => idx !== i));
  const addBlankF = () => setPolozky(ps => [...ps, { nazev: '', jednotka: 'os.', mnozstvi: 1, cena_jednotka: 0, dph_sazba: 12 }]);
  const addFromCenikFN = (item) => { setPolozky(ps => [...ps, { nazev: item.nazev, jednotka: item.jednotka, mnozstvi: 1, cena_jednotka: parseFloat(item.cena_prodej), dph_sazba: item.dph_sazba || 12 }]); setCenikFilterN(''); };

  const totalBezDph = polozky.reduce((s, p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
  const totalDph = polozky.reduce((s, p) => { const c=(parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0); return s+c*((p.dph_sazba||12)/100); }, 0);
  const fmtC = (n) => n != null ? Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč' : '—';

  const createMut = useMutation({
    mutationFn: (d) => fakturyApi.create(d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['faktury'] });
      navigate(`/faktury/${res.data.id}`);
      toast.success('Faktura vystavena');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při vystavení faktury'),
  });

  const handleSubmit = () => {
    if (!klientSelected) return toast.error('Vyberte klienta');
    if (!form.datum_splatnosti) return toast.error('Zadejte datum splatnosti');
    if (polozky.length === 0) return toast.error('Přidejte alespoň jednu položku');
    createMut.mutate({
      klient_id: klientSelected.id,
      zakazka_id: zakazkaIdParam || null,
      ...form,
      polozky,
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/faktury')} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors">
          <ArrowLeft size={16}/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-stone-800">Nová faktura</h1>
          {zakazkaIdParam && <p className="text-xs text-stone-400 mt-0.5">Zakázka #{zakazkaIdParam}</p>}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Odběratel</h2>
        <div className="relative">
          <div className="flex gap-2 items-center">
            {klientSelected ? (
              <div className="flex-1 flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-stone-800">
                    {klientSelected.firma || [klientSelected.jmeno, klientSelected.prijmeni].filter(Boolean).join(' ')}
                  </div>
                  {klientSelected.firma && <div className="text-xs text-stone-400">{klientSelected.jmeno} {klientSelected.prijmeni}</div>}
                </div>
                <button onClick={() => setKlientSelected(null)} className="text-stone-400 hover:text-red-500"><XIcon size={14}/></button>
              </div>
            ) : (
              <input
                className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                placeholder="Hledat klienta…"
                value={klientSearch}
                onChange={e => { setKlientSearch(e.target.value); setKlientOpen(true); }}
                onFocus={() => setKlientOpen(true)}
              />
            )}
          </div>
          {!klientSelected && klientiSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
              {klientiSuggestions.map(k => (
                <button key={k.id} onClick={() => { setKlientSelected(k); setKlientOpen(false); setKlientSearch(''); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-stone-50 border-b border-stone-50 last:border-0">
                  <div className="text-sm font-medium text-stone-800">{k.firma || [k.jmeno, k.prijmeni].filter(Boolean).join(' ')}</div>
                  {k.firma && <div className="text-xs text-stone-400">{k.jmeno} {k.prijmeni}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Parametry faktury */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-stone-700 mb-4">Parametry faktury</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Datum splatnosti *</label>
            <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.datum_splatnosti} onChange={e => setForm(f => ({ ...f, datum_splatnosti: e.target.value }))}/>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Způsob platby</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
              value={form.zpusob_platby} onChange={e => setForm(f => ({ ...f, zpusob_platby: e.target.value }))}>
              <option value="převod">Bankovní převod</option>
              <option value="hotovost">Hotovost</option>
              <option value="karta">Platební karta</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Variabilní symbol</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="Automaticky z čísla faktury…"
              value={form.variabilni_symbol} onChange={e => setForm(f => ({ ...f, variabilni_symbol: e.target.value }))}/>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Poznámka</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.poznamka} onChange={e => setForm(f => ({ ...f, poznamka: e.target.value }))}/>
          </div>
        </div>
      </div>

      {/* Položky */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-700">Položky faktury</span>
          <button onClick={addBlankF} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
            <Plus size={11}/> Vlastní položka
          </button>
        </div>

        {cenikEnabled && (
        <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
          <input className="w-full border border-stone-200 rounded-md px-3 py-1.5 text-xs focus:outline-none bg-white"
            placeholder="Hledat v ceníku a přidat…"
            value={cenikFilterN} onChange={e => setCenikFilterN(e.target.value)}/>
          {cenikFilterN && filteredCenikN.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-stone-200 bg-white divide-y divide-stone-50">
              {filteredCenikN.slice(0, 10).map(c => (
                <button key={c.id} onClick={() => addFromCenikFN(c)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center justify-between">
                  <span>{c.nazev} <span className="text-stone-400">({c.jednotka})</span></span>
                  <span className="text-stone-500 font-medium">{Number(c.cena_prodej).toLocaleString('cs-CZ')} Kč</span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {polozky.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-stone-400">Přidejte položky z ceníku nebo klikněte na „Vlastní položka".</div>
        ) : (
          <>
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['Název','Mn.','Jedn.','Cena/jedn.','DPH %','Celkem',''].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}
              </tr></thead>
              <tbody>
                {polozky.map((p, i) => {
                  const c = (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0);
                  const d = c*((p.dph_sazba||12)/100);
                  return (
                    <tr key={i} className={i < polozky.length-1 ? 'border-b border-stone-50' : ''}>
                      <td className="px-3 py-2"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.nazev} onChange={e => updatePolozkaF(i,'nazev',e.target.value)} placeholder="Název…"/></td>
                      <td className="px-3 py-2 w-20"><input type="number" min="0" step="0.1" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.mnozstvi} onChange={e => updatePolozkaF(i,'mnozstvi',e.target.value)}/></td>
                      <td className="px-3 py-2 w-20"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.jednotka} onChange={e => updatePolozkaF(i,'jednotka',e.target.value)}/></td>
                      <td className="px-3 py-2 w-28"><input type="number" min="0" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.cena_jednotka} onChange={e => updatePolozkaF(i,'cena_jednotka',e.target.value)}/></td>
                      <td className="px-3 py-2 w-20">
                        <select className="w-full border border-stone-200 rounded px-1 py-1 text-xs focus:outline-none bg-white"
                          value={p.dph_sazba} onChange={e => updatePolozkaF(i,'dph_sazba',parseInt(e.target.value))}>
                          <option value={0}>0 %</option><option value={12}>12 %</option><option value={21}>21 %</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 w-28 text-xs font-medium text-stone-700">{fmtC(c+d)}</td>
                      <td className="px-3 py-2 w-8">
                        <button onClick={() => removePolozkaF(i)} className="text-stone-300 hover:text-red-500"><Trash2 size={13}/></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex justify-end gap-4 text-sm">
              <span className="text-stone-500">Bez DPH: <strong>{fmtC(totalBezDph)}</strong></span>
              <span className="text-stone-500">DPH: <strong>{fmtC(totalDph)}</strong></span>
              <span className="text-stone-800 font-bold">Celkem: {fmtC(totalBezDph + totalDph)}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-3 justify-end">
        <Btn onClick={() => navigate('/faktury')}>Zrušit</Btn>
        <Btn variant="primary" onClick={handleSubmit} disabled={createMut.isPending}>
          <Receipt size={14}/> Vystavit fakturu
        </Btn>
      </div>
    </div>
  );
}

export default NovaFakturaPage;
