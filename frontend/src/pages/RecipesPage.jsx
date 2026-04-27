import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BookOpenText, Plus, Printer } from 'lucide-react';
import { recipesApi } from '../api';
import { Btn, EmptyState, Modal, PageHeader, Spinner } from '../components/ui';

const EMPTY_FORM = {
  nazev: '',
  interni_nazev: '',
  typ: 'final',
  kategorie: '',
  vydatnost_mnozstvi: 1,
  vydatnost_jednotka: 'porce',
  default_porce_mnozstvi: 1,
  default_porce_jednotka: 'porce',
  cas_pripravy_min: '',
  poznamka: '',
};

export default function RecipesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q: '', typ: '', aktivni: 'true' });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['recipes', filters],
    queryFn: () => recipesApi.list({
      q: filters.q || undefined,
      typ: filters.typ || undefined,
      aktivni: filters.aktivni,
    }),
  });

  const recipes = data?.data?.data || [];

  const createMut = useMutation({
    mutationFn: recipesApi.create,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Receptura byla založena.');
      setModalOpen(false);
      setForm(EMPTY_FORM);
      if (res.data?.id) navigate(`/receptury/${res.data.id}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Recepturu se nepodařilo vytvořit.'),
  });

  const openPrint = async (recipeId) => {
    try {
      const response = await recipesApi.printCard(recipeId);
      const win = window.open('', '_blank', 'width=980,height=720');
      win.document.write(response.data);
      win.document.close();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Tisk receptury se nepodařil.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Receptury"
        subtitle={`${recipes.length} receptur a komponent`}
        actions={<Btn variant="primary" size="sm" onClick={() => setModalOpen(true)}><Plus size={14} /> Nová receptura</Btn>}
      />

      <div className="px-8 pb-4 flex flex-wrap gap-3">
        <input
          className="w-72 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:outline-none"
          placeholder="Hledat podle názvu..."
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select className="border border-stone-200 rounded-xl px-4 py-2 text-sm" value={filters.typ} onChange={(e) => setFilters((f) => ({ ...f, typ: e.target.value }))}>
          <option value="">Všechny typy</option>
          <option value="final">Finální receptury</option>
          <option value="component">Komponenty</option>
        </select>
        <select className="border border-stone-200 rounded-xl px-4 py-2 text-sm" value={filters.aktivni} onChange={(e) => setFilters((f) => ({ ...f, aktivni: e.target.value }))}>
          <option value="true">Aktivní</option>
          <option value="false">Neaktivní</option>
        </select>
      </div>

      <div className="px-8 pb-8">
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !recipes.length ? (
            <EmptyState icon={BookOpenText} title="Zatím nemáte žádné receptury" desc="Začněte finálními pokrmy nebo komponentami, které pak navážete na ceník a kalkulace." />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100 text-xs text-stone-400 uppercase">
                  <th className="px-4 py-3 text-left">Receptura</th>
                  <th className="px-4 py-3 text-left">Typ</th>
                  <th className="px-4 py-3 text-left">Verze</th>
                  <th className="px-4 py-3 text-right">Náklad</th>
                  <th className="px-4 py-3 text-right">Dokumenty</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {recipes.map((recipe) => (
                  <tr key={recipe.id} className="hover:bg-stone-50 cursor-pointer" onClick={() => navigate(`/receptury/${recipe.id}`)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-800">{recipe.nazev}</div>
                      <div className="text-xs text-stone-400">{recipe.kategorie || 'Bez kategorie'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600">{recipe.typ === 'component' ? 'Komponenta' : 'Finální'}</td>
                    <td className="px-4 py-3 text-sm text-stone-600">
                      {recipe.active_version_number ? `aktivní v${recipe.active_version_number}` : recipe.latest_version_number ? `draft v${recipe.latest_version_number}` : 'bez verze'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-stone-700">
                      {recipe.current_cost != null ? `${Number(recipe.current_cost).toLocaleString('cs-CZ')} Kč` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-stone-500">{recipe.dokumenty_count || 0}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); openPrint(recipe.id); }}
                        className="text-stone-400 hover:text-stone-700 transition-colors"
                        title="Tisknout kartu receptury"
                      >
                        <Printer size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setForm(EMPTY_FORM); }}
        title="Nová receptura"
        footer={<><Btn onClick={() => { setModalOpen(false); setForm(EMPTY_FORM); }}>Zrušit</Btn><Btn variant="primary" onClick={() => createMut.mutate(form)} disabled={!form.nazev || createMut.isPending}>Vytvořit</Btn></>}
      >
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Název *</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.nazev} onChange={(e) => setForm((f) => ({ ...f, nazev: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Interní název</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.interni_nazev} onChange={(e) => setForm((f) => ({ ...f, interni_nazev: e.target.value }))} /></div>
            <div><label className="text-xs text-stone-500 block mb-1">Typ</label><select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.typ} onChange={(e) => setForm((f) => ({ ...f, typ: e.target.value }))}><option value="final">Finální receptura</option><option value="component">Komponenta</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Kategorie</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.kategorie} onChange={(e) => setForm((f) => ({ ...f, kategorie: e.target.value }))} /></div>
            <div><label className="text-xs text-stone-500 block mb-1">Čas přípravy (min)</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.cas_pripravy_min} onChange={(e) => setForm((f) => ({ ...f, cas_pripravy_min: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-stone-500 block mb-1">Vydatnost</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.vydatnost_mnozstvi} onChange={(e) => setForm((f) => ({ ...f, vydatnost_mnozstvi: e.target.value }))} /></div>
              <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.vydatnost_jednotka} onChange={(e) => setForm((f) => ({ ...f, vydatnost_jednotka: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-stone-500 block mb-1">Výchozí porce</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.default_porce_mnozstvi} onChange={(e) => setForm((f) => ({ ...f, default_porce_mnozstvi: e.target.value }))} /></div>
              <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={form.default_porce_jednotka} onChange={(e) => setForm((f) => ({ ...f, default_porce_jednotka: e.target.value }))} /></div>
            </div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Poznámka</label><textarea rows={3} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" value={form.poznamka} onChange={(e) => setForm((f) => ({ ...f, poznamka: e.target.value }))} /></div>
        </div>
      </Modal>
    </div>
  );
}
