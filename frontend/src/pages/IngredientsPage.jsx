import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FlaskConical, Pencil, Plus, TrendingUp } from 'lucide-react';
import { ingredientsApi } from '../api';
import { Btn, EmptyState, Modal, PageHeader, Spinner } from '../components/ui';

const EMPTY_FORM = {
  nazev: '',
  jednotka: 'kg',
  nakupni_jednotka: 'kg',
  aktualni_cena_za_jednotku: 0,
  vytiznost_procent: 100,
  odpad_procent: 0,
  alergeny: '',
  poznamka: '',
  aktivni: true,
};

function toAllergenString(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

export default function IngredientsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: '', aktivni: 'true', jednotka: '', zdrazene: false });
  const [modalOpen, setModalOpen] = useState(false);
  const [priceModal, setPriceModal] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [priceForm, setPriceForm] = useState({ cena_za_jednotku: '', platne_od: '', zdroj: 'manual', poznamka: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['ingredients', filters],
    queryFn: () => ingredientsApi.list({
      q: filters.q || undefined,
      aktivni: filters.aktivni,
      jednotka: filters.jednotka || undefined,
      zdrazene: filters.zdrazene ? 'true' : undefined,
    }),
  });

  const ingredients = data?.data?.data || [];
  const selected = useQuery({
    queryKey: ['ingredient', selectedId],
    queryFn: () => ingredientsApi.get(selectedId),
    enabled: !!selectedId,
  });

  const units = useMemo(
    () => [...new Set(ingredients.map((item) => item.jednotka).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs')),
    [ingredients]
  );

  const createMut = useMutation({
    mutationFn: ingredientsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success('Surovina byla přidána.');
      setModalOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Uložení suroviny se nepodařilo.'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data: payload }) => ingredientsApi.update(id, payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['ingredient', variables.id] });
      toast.success('Surovina byla upravena.');
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Uložení změn se nepodařilo.'),
  });

  const priceMut = useMutation({
    mutationFn: ({ id, data: payload }) => ingredientsApi.addPriceHistory(id, payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['ingredient', variables.id] });
      toast.success('Historie ceny byla přidána.');
      setPriceModal(null);
      setPriceForm({ cena_za_jednotku: '', platne_od: '', zdroj: 'manual', poznamka: '' });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Cenu se nepodařilo uložit.'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (ingredient) => {
    setEditing(ingredient);
    setForm({
      nazev: ingredient.nazev || '',
      jednotka: ingredient.jednotka || 'kg',
      nakupni_jednotka: ingredient.nakupni_jednotka || ingredient.jednotka || 'kg',
      aktualni_cena_za_jednotku: ingredient.aktualni_cena_za_jednotku || 0,
      vytiznost_procent: ingredient.vytiznost_procent || 100,
      odpad_procent: ingredient.odpad_procent || 0,
      alergeny: toAllergenString(ingredient.alergeny),
      poznamka: ingredient.poznamka || '',
      aktivni: ingredient.aktivni !== false,
    });
    setModalOpen(true);
  };

  const submit = () => {
    const payload = {
      ...form,
      alergeny: form.alergeny,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  return (
    <div>
      <PageHeader
        title="Suroviny"
        subtitle={`${ingredients.length} položek v databázi surovin`}
        actions={<Btn variant="primary" size="sm" onClick={openCreate}><Plus size={14} /> Nová surovina</Btn>}
      />

      <div className="px-8 pb-4 flex flex-wrap gap-3">
        <input
          className="w-72 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:outline-none"
          placeholder="Hledat podle názvu nebo slug..."
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select
          className="border border-stone-200 rounded-xl px-4 py-2 text-sm focus:outline-none"
          value={filters.aktivni}
          onChange={(e) => setFilters((f) => ({ ...f, aktivni: e.target.value }))}
        >
          <option value="true">Aktivní</option>
          <option value="false">Neaktivní</option>
        </select>
        <select
          className="border border-stone-200 rounded-xl px-4 py-2 text-sm focus:outline-none"
          value={filters.jednotka}
          onChange={(e) => setFilters((f) => ({ ...f, jednotka: e.target.value }))}
        >
          <option value="">Všechny jednotky</option>
          {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={filters.zdrazene}
            onChange={(e) => setFilters((f) => ({ ...f, zdrazene: e.target.checked }))}
          />
          Jen zdražené položky
        </label>
      </div>

      <div className="px-8 pb-8 grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !ingredients.length ? (
            <EmptyState icon={FlaskConical} title="Zatím nemáte žádné suroviny" desc="Začněte založením základních položek a jejich nákupních cen." />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100 text-xs text-stone-400 uppercase">
                  <th className="px-4 py-3 text-left">Surovina</th>
                  <th className="px-4 py-3 text-left">Jednotka</th>
                  <th className="px-4 py-3 text-right">Cena</th>
                  <th className="px-4 py-3 text-right">Výtěžnost</th>
                  <th className="px-4 py-3 text-right">Odpad</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {ingredients.map((ingredient) => (
                  <tr
                    key={ingredient.id}
                    className={`hover:bg-stone-50 cursor-pointer ${selectedId === ingredient.id ? 'bg-brand-50/40' : ''}`}
                    onClick={() => setSelectedId(ingredient.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-800">{ingredient.nazev}</div>
                      <div className="text-xs text-stone-400">{ingredient.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-500">{ingredient.jednotka}</td>
                    <td className="px-4 py-3 text-sm text-right text-stone-700">
                      {Number(ingredient.aktualni_cena_za_jednotku || 0).toLocaleString('cs-CZ')} Kč
                      {ingredient.zdrazena && <TrendingUp size={12} className="inline ml-1 text-amber-600" />}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-stone-500">{ingredient.vytiznost_procent} %</td>
                    <td className="px-4 py-3 text-sm text-right text-stone-500">{ingredient.odpad_procent} %</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(ingredient); }}
                        className="text-stone-400 hover:text-stone-700 transition-colors"
                        title="Upravit"
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          {!selectedId || selected.isLoading ? (
            <div className="flex justify-center py-12">
              {selectedId ? <Spinner /> : <div className="text-sm text-stone-400">Vyberte surovinu pro detail.</div>}
            </div>
          ) : selected.data?.data ? (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900">{selected.data.data.nazev}</h2>
                    <div className="text-xs text-stone-400">{selected.data.data.slug}</div>
                  </div>
                  <Btn size="sm" onClick={() => { setPriceModal(selected.data.data); }}>Nová cena</Btn>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-xs text-stone-400">Aktuální cena</div><div className="font-semibold">{Number(selected.data.data.aktualni_cena_za_jednotku || 0).toLocaleString('cs-CZ')} Kč</div></div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-xs text-stone-400">Jednotka</div><div className="font-semibold">{selected.data.data.jednotka}</div></div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-xs text-stone-400">Výtěžnost</div><div className="font-semibold">{selected.data.data.vytiznost_procent} %</div></div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-xs text-stone-400">Odpad</div><div className="font-semibold">{selected.data.data.odpad_procent} %</div></div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Alergeny</div>
                <div className="flex flex-wrap gap-2">
                  {(selected.data.data.alergeny || []).length
                    ? selected.data.data.alergeny.map((alergen) => (
                        <span key={alergen} className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">{alergen}</span>
                      ))
                    : <span className="text-sm text-stone-400">Bez zadaných alergenů</span>}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Historie cen</div>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {(selected.data.data.price_history || []).map((row) => (
                    <div key={row.id} className="rounded-xl border border-stone-200 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-stone-800">{Number(row.cena_za_jednotku || 0).toLocaleString('cs-CZ')} Kč</span>
                        <span className="text-xs text-stone-400">{row.platne_od}</span>
                      </div>
                      <div className="text-xs text-stone-500 mt-1">{row.zdroj || 'manual'}{row.poznamka ? ` · ${row.poznamka}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Vazby na receptury</div>
                <div className="space-y-2">
                  {(selected.data.data.recipes || []).length
                    ? selected.data.data.recipes.map((row) => (
                        <div key={`${row.id}-${row.recipe_version_id}`} className="rounded-xl border border-stone-200 px-3 py-2 text-sm">
                          <div className="font-medium text-stone-800">{row.nazev}</div>
                          <div className="text-xs text-stone-400">verze {row.verze} · {row.stav}</div>
                        </div>
                      ))
                    : <div className="text-sm text-stone-400">Surovina zatím není použitá v žádné receptuře.</div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-stone-400">Detail suroviny se nepodařilo načíst.</div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }}
        title={editing ? 'Upravit surovinu' : 'Nová surovina'}
        footer={<><Btn onClick={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }}>Zrušit</Btn><Btn variant="primary" onClick={submit} disabled={!form.nazev || createMut.isPending || updateMut.isPending}>{editing ? 'Uložit změny' : 'Vytvořit'}</Btn></>}
      >
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Název *</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.nazev} onChange={(e) => setForm((f) => ({ ...f, nazev: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.jednotka} onChange={(e) => setForm((f) => ({ ...f, jednotka: e.target.value }))} /></div>
            <div><label className="text-xs text-stone-500 block mb-1">Nákupní jednotka</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.nakupni_jednotka} onChange={(e) => setForm((f) => ({ ...f, nakupni_jednotka: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Cena / jednotku</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.aktualni_cena_za_jednotku} onChange={(e) => setForm((f) => ({ ...f, aktualni_cena_za_jednotku: e.target.value }))} /></div>
            <div><label className="text-xs text-stone-500 block mb-1">Výtěžnost %</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.vytiznost_procent} onChange={(e) => setForm((f) => ({ ...f, vytiznost_procent: e.target.value }))} /></div>
            <div><label className="text-xs text-stone-500 block mb-1">Odpad %</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.odpad_procent} onChange={(e) => setForm((f) => ({ ...f, odpad_procent: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Alergeny</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="např. lepek, mléko, vejce" value={form.alergeny} onChange={(e) => setForm((f) => ({ ...f, alergeny: e.target.value }))} /></div>
          <div><label className="text-xs text-stone-500 block mb-1">Poznámka</label><textarea rows={3} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" value={form.poznamka} onChange={(e) => setForm((f) => ({ ...f, poznamka: e.target.value }))} /></div>
          <label className="inline-flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={form.aktivni} onChange={(e) => setForm((f) => ({ ...f, aktivni: e.target.checked }))} /> Aktivní surovina</label>
        </div>
      </Modal>

      <Modal
        open={!!priceModal}
        onClose={() => setPriceModal(null)}
        title={`Nová cena · ${priceModal?.nazev || ''}`}
        footer={<><Btn onClick={() => setPriceModal(null)}>Zrušit</Btn><Btn variant="primary" onClick={() => priceMut.mutate({ id: priceModal.id, data: priceForm })} disabled={!priceForm.cena_za_jednotku || priceMut.isPending}>Uložit cenu</Btn></>}
      >
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Cena za jednotku *</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={priceForm.cena_za_jednotku} onChange={(e) => setPriceForm((f) => ({ ...f, cena_za_jednotku: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Platné od</label><input type="date" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={priceForm.platne_od} onChange={(e) => setPriceForm((f) => ({ ...f, platne_od: e.target.value }))} /></div>
            <div><label className="text-xs text-stone-500 block mb-1">Zdroj</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={priceForm.zdroj} onChange={(e) => setPriceForm((f) => ({ ...f, zdroj: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Poznámka</label><textarea rows={3} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" value={priceForm.poznamka} onChange={(e) => setPriceForm((f) => ({ ...f, poznamka: e.target.value }))} /></div>
        </div>
      </Modal>
    </div>
  );
}
