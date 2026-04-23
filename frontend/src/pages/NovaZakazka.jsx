import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { zakazkyApi, klientiApi, uzivateleApi, sablonyApi, nabidkyApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Btn } from '../components/ui';
import toast from 'react-hot-toast';
import { ArrowLeft, Check } from 'lucide-react';

const TYPY = [
  { v:'svatba',       l:'Svatba',         e:'💒' },
  { v:'soukroma_akce',l:'Soukromá akce',  e:'🥂' },
  { v:'firemni_akce', l:'Firemní akce',   e:'🏢' },
  { v:'zavoz',        l:'Závoz / vyzvednutí', e:'🚚' },
  { v:'bistro',       l:'Bistro / pronájem',  e:'☕' },
  { v:'pohreb',       l:'Pohřeb',             e:'🕯️' },
  { v:'ostatni',      l:'Ostatní',            e:'📋' },
];

const TYP_EMOJI = { svatba:'💒', soukroma_akce:'🥂', firemni_akce:'🏢', zavoz:'🚚', bistro:'☕', pohreb:'🕯️', ostatni:'📋' };

export default function NovaZakazka() {
  const navigate = useNavigate();
  const { hasModule } = useAuth();
  const [step, setStep]         = useState(0);
  const [sablonaPolozky, setSablonaPolozky] = useState([]);
  const [form, setForm]   = useState({
    typ:'', nazev:'', klient_id:'', obchodnik_id:'', datum_akce:'', cas_zacatek:'',
    cas_konec:'', misto:'', pocet_hostu:'', rozpocet_klienta:'',
    poznamka_klient:'', poznamka_interni:'',
  });

  const { data: klientiData } = useQuery({
    queryKey: ['klienti-select'],
    queryFn: () => klientiApi.list({ limit: 200 }),
  });
  const klienti = klientiData?.data?.data || [];

  const { data: uzivateleData } = useQuery({
    queryKey: ['uzivatele'],
    queryFn: uzivateleApi.list,
  });
  const uzivatele = uzivateleData?.data?.data || uzivateleData?.data || [];

  const { data: sablonyData } = useQuery({
    queryKey: ['sablony'],
    queryFn: () => sablonyApi.list().then(r => r.data.data),
    enabled: sablonyEnabled,
  });
  const sablony = sablonyEnabled ? (sablonyData || []) : [];

  const nabidkaMut = useMutation({
    mutationFn: (data) => nabidkyApi.create(data),
  });

  const mut = useMutation({
    mutationFn: (data) => zakazkyApi.create(data),
    onSuccess: (r) => {
      if (sablonaPolozky.length > 0) {
        nabidkaMut.mutate(
          { zakazka_id: r.data.id, nazev: 'Nabídka ze šablony', polozky: sablonaPolozky },
          {
            onSettled: () => {
              toast.success(`Zakázka ${r.data.cislo} vytvořena · nabídka ze šablony přidána`);
              navigate(`/zakazky/${r.data.id}`);
            },
          }
        );
      } else {
        toast.success(`Zakázka ${r.data.cislo} vytvořena`);
        navigate(`/zakazky/${r.data.id}`);
      }
    },
    onError: () => toast.error('Nepodařilo se vytvořit zakázku'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const applyTemplate = (s) => {
    setSablonaPolozky(s.polozky || []);
    setForm(f => ({
      ...f,
      typ: s.typ || f.typ,
      cas_zacatek: s.cas_zacatek?.slice(0,5) || f.cas_zacatek,
      cas_konec: s.cas_konec?.slice(0,5) || f.cas_konec,
      misto: s.misto || f.misto,
      pocet_hostu: s.pocet_hostu || f.pocet_hostu,
      poznamka_klient: s.poznamka_klient || f.poznamka_klient,
      poznamka_interni: s.poznamka_interni || f.poznamka_interni,
    }));
    setStep(2); // jump to Základní info (step 0=Šablona, 1=Typ, 2=Základní info, 3=Klient, 4=Shrnutí)
  };

  // steps[0] = Šablona (only when templates exist, otherwise skipped by starting at step 1)
  const steps = sablony.length > 0
    ? ['Šablona', 'Typ akce', 'Základní info', 'Klient', 'Shrnutí']
    : ['Typ akce', 'Základní info', 'Klient', 'Shrnutí'];
  const offset = sablony.length > 0 ? 0 : -1; // if no templates, step 0 = Typ akce

  // Actual form step relative to offset
  const formStep = sablony.length > 0 ? step : step + 1;

  const canNext = () => {
    if (formStep === 1) return !!form.typ;
    if (formStep === 2) return !!form.nazev && !!form.datum_akce;
    if (formStep === 0) return true; // template selection, always can continue
    return true;
  };

  const handleSubmit = () => mut.mutate(form);

  return (
    <div>
      <PageHeader
        title="Nová zakázka"
        actions={<button onClick={() => navigate('/zakazky')} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft size={13}/> Zpět</button>}
      />

      {/* Progress */}
      <div className="bg-white border-b border-stone-100 px-6 py-3">
        <div className="flex items-center gap-0">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                i < step  ? 'text-stone-600 bg-stone-100' :
                i === step ? 'bg-stone-900 text-white' :
                             'text-stone-400'
              }`}>
                {i < step ? <Check size={11}/> : <span>{i+1}</span>}
                {s}
              </div>
              {i < steps.length-1 && <div className={`w-6 h-px mx-1 ${i < step ? 'bg-stone-400' : 'bg-stone-200'}`}/>}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-2xl">
        {/* Krok 0: Šablona (pouze pokud existují šablony) */}
        {sablony.length > 0 && step === 0 && (
          <div>
            <h2 className="text-sm font-semibold text-stone-800 mb-1">Vyberte šablonu</h2>
            <p className="text-xs text-stone-500 mb-4">Šablona předvyplní typ, časy, místo a poznámky. Nebo pokračujte bez šablony.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              {sablony.map(s => (
                <button key={s.id} onClick={() => applyTemplate(s)}
                  className="flex items-start gap-3 p-4 rounded-xl border-2 border-stone-200 hover:border-stone-900 hover:bg-stone-50 text-left transition-all">
                  <span className="text-2xl shrink-0 mt-0.5">{TYP_EMOJI[s.typ] || '📋'}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-800">{s.nazev}</div>
                    {s.popis && <div className="text-xs text-stone-400 mt-0.5 line-clamp-1">{s.popis}</div>}
                    <div className="flex gap-3 mt-1.5 text-xs text-stone-500 flex-wrap">
                      {s.cas_zacatek && <span>⏰ {s.cas_zacatek.slice(0,5)}{s.cas_konec ? `–${s.cas_konec.slice(0,5)}` : ''}</span>}
                      {s.misto && <span>📍 {s.misto}</span>}
                      {s.pocet_hostu > 0 && <span>👥 {s.pocet_hostu}</span>}
                      {s.polozky?.length > 0 && <span className="text-violet-600 font-medium">🍽️ {s.polozky.length} položek</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setStep(1)} className="text-sm text-stone-400 hover:text-stone-700 underline underline-offset-2 transition-colors">
              Pokračovat bez šablony →
            </button>
          </div>
        )}

        {/* Krok 0 (bez šablon) nebo Krok 1 (se šablonami): Typ */}
        {formStep === 1 && (
          <div>
            <h2 className="text-sm font-semibold text-stone-800 mb-4">Vyberte typ akce</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TYPY.map(t => (
                <button key={t.v} onClick={() => set('typ', t.v)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    form.typ === t.v ? 'border-stone-900 bg-stone-50' : 'border-stone-200 hover:border-stone-300'
                  }`}>
                  <span className="text-2xl">{t.e}</span>
                  <span className="text-sm font-medium text-stone-700">{t.l}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Základní info */}
        {formStep === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-stone-800 mb-4">Základní informace</h2>
            <div>
              <label className="text-xs text-stone-500 block mb-1.5">Název zakázky *</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400"
                placeholder="např. Svatba Novák – Malá"
                value={form.nazev} onChange={e => set('nazev', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1.5">Zodpovědná osoba</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400"
                value={form.obchodnik_id} onChange={e => set('obchodnik_id', e.target.value)}>
                <option value="">— přiřadit automaticky —</option>
                {uzivatele.map(u => (
                  <option key={u.id} value={u.id}>{u.jmeno} {u.prijmeni}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-stone-500 block mb-1.5">Datum akce *</label>
                <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400"
                  value={form.datum_akce} onChange={e => set('datum_akce', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1.5">
                  Počet hostů
                  {form.pocet_hostu > 0 && (
                    <span className="ml-2 font-semibold text-stone-800">{form.pocet_hostu}</span>
                  )}
                </label>
                <input type="range" min="0" max="500" step="5"
                  className="w-full accent-stone-800 mb-1.5"
                  value={form.pocet_hostu || 0}
                  onChange={e => set('pocet_hostu', e.target.value)} />
                <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-stone-400"
                  placeholder="nebo zadejte ručně" value={form.pocet_hostu} onChange={e => set('pocet_hostu', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-stone-500 block mb-1.5">Začátek</label>
                <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400"
                  value={form.cas_zacatek} onChange={e => set('cas_zacatek', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1.5">Konec</label>
                <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400"
                  value={form.cas_konec} onChange={e => set('cas_konec', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1.5">Místo konání</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400"
                placeholder="Adresa nebo název místa"
                value={form.misto} onChange={e => set('misto', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1.5">Orientační rozpočet klienta (Kč)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400"
                placeholder="0" value={form.rozpocet_klienta} onChange={e => set('rozpocet_klienta', e.target.value)} />
            </div>
          </div>
        )}

        {/* Klient */}
        {formStep === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-stone-800 mb-4">Přiřadit klienta</h2>
            <div>
              <label className="text-xs text-stone-500 block mb-1.5">Vybrat existujícího klienta</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400"
                value={form.klient_id} onChange={e => set('klient_id', e.target.value)}>
                <option value="">— bez klienta —</option>
                {klienti.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.firma || `${k.jmeno} ${k.prijmeni || ''}`} {k.email ? `(${k.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1.5">Poznámka klienta</label>
              <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
                rows={3} value={form.poznamka_klient} onChange={e => set('poznamka_klient', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1.5">Interní poznámka</label>
              <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
                rows={3} value={form.poznamka_interni} onChange={e => set('poznamka_interni', e.target.value)} />
            </div>
          </div>
        )}

        {/* Shrnutí */}
        {formStep === 4 && (
          <div>
            <h2 className="text-sm font-semibold text-stone-800 mb-4">Shrnutí zakázky</h2>
            <div className="bg-stone-50 rounded-xl border border-stone-200 p-5 space-y-3">
              {[
                ['Typ akce',      TYPY.find(t=>t.v===form.typ)?.l],
                ['Název',         form.nazev],
                ['Zodpovědná os.', uzivatele.find(u=>String(u.id)===String(form.obchodnik_id)) ? `${uzivatele.find(u=>String(u.id)===String(form.obchodnik_id)).jmeno} ${uzivatele.find(u=>String(u.id)===String(form.obchodnik_id)).prijmeni}` : '— automaticky'],
                ['Datum akce',    form.datum_akce],
                ['Čas',           `${form.cas_zacatek || '?'} – ${form.cas_konec || '?'}`],
                ['Místo',         form.misto || '—'],
                ['Počet hostů',   form.pocet_hostu || '—'],
                ['Rozpočet kl.',  form.rozpocet_klienta ? `${Number(form.rozpocet_klienta).toLocaleString('cs-CZ')} Kč` : '—'],
                ['Klient',        klienti.find(k=>String(k.id)===String(form.klient_id))?.firma ||
                                  (() => { const k = klienti.find(k=>String(k.id)===String(form.klient_id)); return k ? `${k.jmeno} ${k.prijmeni||''}` : '—'; })()],
              ].map(([k,v]) => (
                <div key={k} className="flex gap-4 text-sm">
                  <span className="text-stone-500 w-36 flex-shrink-0">{k}</span>
                  <span className="font-medium text-stone-800">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation – hide default nav on template step (it has its own buttons) */}
        {!(sablony.length > 0 && step === 0) && (
          <div className="flex justify-between mt-8">
            <Btn onClick={() => step > 0 ? setStep(s=>s-1) : navigate('/zakazky')}>
              {step > 0 ? '← Zpět' : 'Zrušit'}
            </Btn>
            {step < steps.length - 1 ? (
              <Btn variant="primary" disabled={!canNext()} onClick={() => setStep(s=>s+1)}>
                Pokračovat →
              </Btn>
            ) : (
              <Btn variant="primary" onClick={handleSubmit} disabled={mut.isPending}>
                {mut.isPending ? 'Ukládám…' : '✓ Vytvořit zakázku'}
              </Btn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
  const sablonyEnabled = hasModule('sablony');
