import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sablonyApi } from '../api';
import { PageHeader, EmptyState, Btn, Modal, Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, FileText } from 'lucide-react';

const TYP_OPTIONS_S = [
  { v: '', l: '— universal (všechny typy) —' },
  { v: 'svatba', l: 'Svatba 💒' },
  { v: 'soukroma_akce', l: 'Soukromá akce 🥂' },
  { v: 'firemni_akce', l: 'Firemní akce 🏢' },
  { v: 'zavoz', l: 'Závoz / vyzvednutí 🚚' },
  { v: 'bistro', l: 'Bistro / pronájem ☕' },
  { v: 'pohreb', l: 'Pohřeb 🕯️' },
  { v: 'ostatni', l: 'Ostatní 📋' },
];

const emptySablonaForm = { nazev: '', popis: '', typ: '', cas_zacatek: '', cas_konec: '', misto: '', pocet_hostu: '', poznamka_klient: '', poznamka_interni: '', polozky: [] };
const emptyPolSablona = { kategorie: 'jidlo', nazev: '', jednotka: 'os.', mnozstvi: 1, cena_jednotka: 0 };

const KAT_SABLONA = [
  { v: 'jidlo',    l: 'Jídlo' },
  { v: 'napoj',    l: 'Nápoj' },
  { v: 'sladky',   l: 'Sladkosti' },
  { v: 'personal', l: 'Personál' },
  { v: 'ostatni',  l: 'Ostatní' },
];

export function SablonyPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null); // null = new, otherwise id
  const [form, setForm] = useState(emptySablonaForm);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addPol    = () => setForm(f => ({ ...f, polozky: [...f.polozky, { ...emptyPolSablona }] }));
  const remPol    = (i) => setForm(f => ({ ...f, polozky: f.polozky.filter((_, idx) => idx !== i) }));
  const updPol    = (i, k, v) => setForm(f => ({ ...f, polozky: f.polozky.map((p, idx) => idx === i ? { ...p, [k]: v } : p) }));

  const { data, isLoading } = useQuery({
    queryKey: ['sablony'],
    queryFn: () => sablonyApi.list().then(r => r.data.data),
  });
  const sablony = data || [];

  const createMut = useMutation({
    mutationFn: sablonyApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sablony'] }); toast.success('Šablona vytvořena'); setModal(false); },
    onError: () => toast.error('Chyba při ukládání'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => sablonyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sablony'] }); toast.success('Šablona uložena'); setModal(false); },
    onError: () => toast.error('Chyba při ukládání'),
  });
  const deleteMut = useMutation({
    mutationFn: sablonyApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sablony'] }); toast.success('Šablona smazána'); },
    onError: () => toast.error('Chyba při mazání'),
  });

  const openCreate = () => { setEditing(null); setForm(emptySablonaForm); setModal(true); };
  const openEdit = (s) => { setEditing(s.id); setForm({ nazev: s.nazev || '', popis: s.popis || '', typ: s.typ || '', cas_zacatek: s.cas_zacatek?.slice(0,5) || '', cas_konec: s.cas_konec?.slice(0,5) || '', misto: s.misto || '', pocet_hostu: s.pocet_hostu || '', poznamka_klient: s.poznamka_klient || '', poznamka_interni: s.poznamka_interni || '', polozky: s.polozky || [] }); setModal(true); };
  const handleSave = () => { editing ? updateMut.mutate({ id: editing, d: form }) : createMut.mutate(form); };
  const isPending = createMut.isPending || updateMut.isPending;

  const TYP_EMOJI = { svatba: '💒', soukroma_akce: '🥂', firemni_akce: '🏢', zavoz: '🚚', bistro: '☕', pohreb: '🕯️', ostatni: '📋' };
  const TYP_LABEL = { svatba: 'Svatba', soukroma_akce: 'Soukromá akce', firemni_akce: 'Firemní akce', zavoz: 'Závoz', bistro: 'Bistro', pohreb: 'Pohřeb', ostatni: 'Ostatní' };

  return (
    <div>
      <PageHeader
        title="Šablony zakázek"
        actions={<Btn variant="primary" onClick={openCreate}><Plus size={13}/> Nová šablona</Btn>}
      />

      <div className="p-6">
        {isLoading && <div className="text-sm text-stone-500">Načítám…</div>}

        {!isLoading && sablony.length === 0 && (
          <EmptyState icon={FileText} title="Žádné šablony"
            desc="Vytvořte šablonu pro opakující se typy akcí a ušetřete čas při zakládání zakázek." />
        )}

        {!isLoading && sablony.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sablony.map(s => (
              <div key={s.id} className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col gap-3 hover:border-stone-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {s.typ && <span className="text-xl shrink-0">{TYP_EMOJI[s.typ] || '📋'}</span>}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-stone-800 truncate">{s.nazev}</div>
                      {s.typ && <div className="text-xs text-stone-400">{TYP_LABEL[s.typ]}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-stone-400 hover:text-stone-700 rounded-md hover:bg-stone-100 transition-colors"><Pencil size={13}/></button>
                    <button onClick={() => window.confirm('Smazat šablonu?') && deleteMut.mutate(s.id)} className="p-1.5 text-stone-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"><Trash2 size={13}/></button>
                  </div>
                </div>
                {s.popis && <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">{s.popis}</p>}
                <div className="grid grid-cols-2 gap-1.5 text-xs text-stone-500 border-t border-stone-100 pt-3">
                  {(s.cas_zacatek || s.cas_konec) && (
                    <div>⏰ {s.cas_zacatek?.slice(0,5) || '?'} – {s.cas_konec?.slice(0,5) || '?'}</div>
                  )}
                  {s.misto && <div>📍 <span className="truncate">{s.misto}</span></div>}
                  {s.pocet_hostu > 0 && <div>👥 {s.pocet_hostu} hostů</div>}
                  {s.polozky?.length > 0 && (
                    <div className="col-span-2 flex items-center gap-1 text-violet-600 font-medium">
                      <FileText size={10}/> {s.polozky.length} položek v nabídce
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Upravit šablonu' : 'Nová šablona'}
        footer={<>
          <Btn onClick={() => setModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={!form.nazev || isPending}>
            {isPending ? 'Ukládám…' : (editing ? 'Uložit' : 'Vytvořit')}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Název šablony *</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="např. Firemní oběd – standardní" value={form.nazev} onChange={e => set('nazev', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Popis (interní poznámka k šabloně)</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="Volitelný popis pro orientaci v šablonách" value={form.popis} onChange={e => set('popis', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Typ akce</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.typ} onChange={e => set('typ', e.target.value)}>
              {TYP_OPTIONS_S.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Začátek</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={form.cas_zacatek} onChange={e => set('cas_zacatek', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Konec</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={form.cas_konec} onChange={e => set('cas_konec', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Místo konání</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="Adresa nebo název místa" value={form.misto} onChange={e => set('misto', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Výchozí počet hostů</label>
            <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="0" value={form.pocet_hostu} onChange={e => set('pocet_hostu', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Poznámka pro klienta</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              rows={2} value={form.poznamka_klient} onChange={e => set('poznamka_klient', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Interní poznámka</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              rows={2} value={form.poznamka_interni} onChange={e => set('poznamka_interni', e.target.value)} />
          </div>

          {/* Položky šablony */}
          <div className="border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-stone-700">Položky nabídky</label>
              <button type="button" onClick={addPol}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium">
                <Plus size={11}/> Přidat položku
              </button>
            </div>
            {form.polozky.length === 0 ? (
              <p className="text-xs text-stone-400 italic py-1">
                Žádné položky — po přidání se automaticky vytvoří nabídka při zakládání zakázky ze šablony.
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-1 text-xs text-stone-400 px-0.5 mb-0.5">
                  <span className="col-span-2">Kat.</span>
                  <span className="col-span-4">Název</span>
                  <span className="col-span-2">Jedn.</span>
                  <span className="col-span-1">Mn.</span>
                  <span className="col-span-2">Kč/j</span>
                </div>
                {form.polozky.map((pol, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <select
                      className="col-span-2 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      value={pol.kategorie} onChange={e => updPol(i, 'kategorie', e.target.value)}>
                      {KAT_SABLONA.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                    </select>
                    <input
                      className="col-span-4 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      placeholder="Název položky" value={pol.nazev}
                      onChange={e => updPol(i, 'nazev', e.target.value)} />
                    <input
                      className="col-span-2 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      placeholder="os." value={pol.jednotka}
                      onChange={e => updPol(i, 'jednotka', e.target.value)} />
                    <input type="number" min="0"
                      className="col-span-1 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      placeholder="1" value={pol.mnozstvi}
                      onChange={e => updPol(i, 'mnozstvi', e.target.value)} />
                    <input type="number" min="0"
                      className="col-span-2 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      placeholder="0" value={pol.cena_jednotka}
                      onChange={e => updPol(i, 'cena_jednotka', e.target.value)} />
                    <button type="button" onClick={() => remPol(i)}
                      className="col-span-1 flex justify-center text-stone-300 hover:text-red-500 transition-colors">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default SablonyPage;
