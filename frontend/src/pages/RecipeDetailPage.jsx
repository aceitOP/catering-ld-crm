import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, FileDown, FileText, ImagePlus, Plus, Printer, Save, X } from 'lucide-react';
import { dokumentyApi, ingredientsApi, recipesApi } from '../api';
import { Btn, Modal, PageHeader, Spinner } from '../components/ui';

function blankItem() {
  return { item_type: 'ingredient', ingredient_id: '', subrecipe_id: '', mnozstvi: 0, jednotka: 'kg', poznamka: '' };
}

function blankStep(index = 1) {
  return { krok_index: index, nazev: '', instrukce: '', pracoviste: '', cas_min: '', kriticky_bod: false, photo_document_id: '', photo_nazev: '', poznamka: '' };
}

export default function RecipeDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [versionDraft, setVersionDraft] = useState({ items: [], steps: [] });
  const [metaDraft, setMetaDraft] = useState(null);
  const [versionModal, setVersionModal] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ soubor: null, poznamka: '' });
  const [photoUploadingIndex, setPhotoUploadingIndex] = useState(null);

  const detailQuery = useQuery({
    queryKey: ['recipe-detail', id],
    queryFn: () => recipesApi.get(id),
  });

  const ingredientsQuery = useQuery({
    queryKey: ['ingredients-picker'],
    queryFn: () => ingredientsApi.list({ aktivni: 'true' }),
  });

  const recipesQuery = useQuery({
    queryKey: ['recipes-picker'],
    queryFn: () => recipesApi.list({ aktivni: 'true' }),
  });

  const detail = detailQuery.data?.data;
  const versionIds = detail?.versions || [];
  const versionQuery = useQuery({
    queryKey: ['recipe-version-detail', id, activeVersionId],
    queryFn: () => recipesApi.getVersion(id, activeVersionId),
    enabled: !!activeVersionId,
  });

  useEffect(() => {
    if (!detail) return;
    setMetaDraft({
      nazev: detail.nazev || '',
      interni_nazev: detail.interni_nazev || '',
      typ: detail.typ || 'final',
      kategorie: detail.kategorie || '',
      vydatnost_mnozstvi: detail.vydatnost_mnozstvi || 1,
      vydatnost_jednotka: detail.vydatnost_jednotka || 'porce',
      default_porce_mnozstvi: detail.default_porce_mnozstvi || 1,
      default_porce_jednotka: detail.default_porce_jednotka || 'porce',
      cas_pripravy_min: detail.cas_pripravy_min || '',
      poznamka: detail.poznamka || '',
      aktivni: detail.aktivni !== false,
    });
    setActiveVersionId(detail.active_version_id || detail.versions?.[0]?.id || null);
  }, [detail]);

  useEffect(() => {
    if (!versionQuery.data?.data) return;
    const version = versionQuery.data.data;
    setVersionDraft({
      items: (version.items || []).map((item) => ({
        id: item.id,
        item_type: item.item_type,
        ingredient_id: item.ingredient_id || '',
        subrecipe_id: item.subrecipe_id || '',
        mnozstvi: item.mnozstvi,
        jednotka: item.jednotka || 'kg',
        poradi: item.poradi,
        poznamka: item.poznamka || '',
      })),
      steps: (version.steps || []).map((step) => ({
        id: step.id,
        krok_index: step.krok_index,
        nazev: step.nazev || '',
        instrukce: step.instrukce || '',
        pracoviste: step.pracoviste || '',
        cas_min: step.cas_min || '',
        kriticky_bod: step.kriticky_bod || false,
        photo_document_id: step.photo_document_id || '',
        photo_nazev: step.photo_nazev || '',
        poznamka: step.poznamka || '',
      })),
    });
  }, [versionQuery.data]);

  const ingredients = ingredientsQuery.data?.data?.data || [];
  const recipeOptions = useMemo(
    () => (recipesQuery.data?.data?.data || []).filter((recipe) => Number(recipe.id) !== Number(id)),
    [recipesQuery.data, id]
  );
  const currentVersion = versionQuery.data?.data;
  const currentCost = currentVersion?.cost;

  const updateRecipeMut = useMutation({
    mutationFn: (payload) => recipesApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-detail', id] });
      toast.success('Hlavička receptury byla upravena.');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Uložení receptury se nepodařilo.'),
  });

  const updateVersionMut = useMutation({
    mutationFn: (payload) => recipesApi.updateVersion(id, activeVersionId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-detail', id] });
      qc.invalidateQueries({ queryKey: ['recipe-version-detail', id, activeVersionId] });
      toast.success('Verze receptury byla uložena.');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Uložení verze se nepodařilo.'),
  });

  const activateVersionMut = useMutation({
    mutationFn: () => recipesApi.activateVersion(id, activeVersionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-detail', id] });
      qc.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Verze byla aktivována.');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Aktivace verze se nepodařila.'),
  });

  const createVersionMut = useMutation({
    mutationFn: (payload) => recipesApi.createVersion(id, payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['recipe-detail', id] });
      toast.success('Byla založena nová pracovní verze.');
      setVersionModal(false);
      if (res.data?.id) setActiveVersionId(res.data.id);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Novou verzi se nepodařilo vytvořit.'),
  });

  const uploadMut = useMutation({
    mutationFn: (payload) => dokumentyApi.upload(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-detail', id] });
      toast.success('Dokument byl nahrán.');
      setUploadModal(false);
      setUploadForm({ soubor: null, poznamka: '' });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Nahrání dokumentu se nepodařilo.'),
  });

  const handleStepPhotoUpload = async (stepIndex, file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      toast.error('Vyberte fotku ve formátu PNG, JPG, GIF nebo WebP.');
      return;
    }
    if (!activeVersionId) {
      toast.error('Nejdřív vyberte nebo vytvořte verzi receptury.');
      return;
    }

    const formData = new FormData();
    formData.append('soubor', file);
    formData.append('recipe_id', id);
    formData.append('recipe_version_id', activeVersionId);
    formData.append('kategorie', 'foto');
    formData.append('poznamka', `Fotka ke kroku ${stepIndex + 1}`);

    setPhotoUploadingIndex(stepIndex);
    try {
      const res = await dokumentyApi.upload(formData);
      const doc = res.data;
      setVersionDraft((prev) => ({
        ...prev,
        steps: prev.steps.map((row, rowIndex) => rowIndex === stepIndex
          ? { ...row, photo_document_id: doc.id, photo_nazev: doc.nazev || doc.filename || file.name }
          : row),
      }));
      qc.invalidateQueries({ queryKey: ['recipe-detail', id] });
      toast.success('Fotka kroku byla nahrána. Nezapomeňte uložit verzi.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Nahrání fotky se nepodařilo.');
    } finally {
      setPhotoUploadingIndex(null);
    }
  };

  const saveVersion = () => {
    updateVersionMut.mutate({
      items: versionDraft.items.map((item, index) => ({ ...item, poradi: index })),
      steps: versionDraft.steps.map((step, index) => ({ ...step, krok_index: index + 1 })),
    });
  };

  const openPrint = async () => {
    try {
      const response = await recipesApi.printCard(id, activeVersionId ? { version_id: activeVersionId } : undefined);
      const win = window.open('', '_blank', 'width=980,height=720');
      win.document.write(response.data);
      win.document.close();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Tisk receptury se nepodařil.');
    }
  };

  const openStaffProcedure = async () => {
    try {
      const response = await recipesApi.staffProcedure(id, activeVersionId ? { version_id: activeVersionId } : undefined);
      const win = window.open('', '_blank', 'width=980,height=720');
      win.document.write(response.data);
      win.document.close();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Export postupu se nepodařil.');
    }
  };

  if (detailQuery.isLoading || !metaDraft) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  if (!detail) {
    return <div className="p-8 text-sm text-stone-500">Receptura nebyla nalezena.</div>;
  }

  return (
    <div>
      <PageHeader
        title={detail.nazev}
        subtitle={`${detail.typ === 'component' ? 'Komponenta' : 'Finální receptura'} · ${detail.kategorie || 'Bez kategorie'}`}
        actions={
          <div className="flex gap-2">
            <Btn size="sm" onClick={() => setVersionModal(true)}><Plus size={14} /> Nová verze</Btn>
            <Btn size="sm" onClick={() => setUploadModal(true)}><FileText size={14} /> Dokument</Btn>
            <Btn size="sm" onClick={openPrint}><Printer size={14} /> Tisk</Btn>
            <Btn size="sm" variant="primary" onClick={openStaffProcedure}><FileDown size={14} /> Postup PDF</Btn>
          </div>
        }
      />

      <div className="px-8 pb-4">
        <Link to="/receptury" className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700">
          <ArrowLeft size={12} /> Zpět na receptury
        </Link>
      </div>

      <div className="px-8 pb-8 grid grid-cols-1 2xl:grid-cols-[1.2fr_1fr] gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-800 uppercase tracking-wide">Hlavička receptury</h2>
              <Btn size="sm" variant="primary" onClick={() => updateRecipeMut.mutate(metaDraft)} disabled={updateRecipeMut.isPending}><Save size={14} /> Uložit</Btn>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-stone-500 block mb-1">Název</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.nazev} onChange={(e) => setMetaDraft((f) => ({ ...f, nazev: e.target.value }))} /></div>
              <div><label className="text-xs text-stone-500 block mb-1">Interní název</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.interni_nazev} onChange={(e) => setMetaDraft((f) => ({ ...f, interni_nazev: e.target.value }))} /></div>
              <div><label className="text-xs text-stone-500 block mb-1">Typ</label><select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.typ} onChange={(e) => setMetaDraft((f) => ({ ...f, typ: e.target.value }))}><option value="final">Finální receptura</option><option value="component">Komponenta</option></select></div>
              <div><label className="text-xs text-stone-500 block mb-1">Kategorie</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.kategorie} onChange={(e) => setMetaDraft((f) => ({ ...f, kategorie: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><label className="text-xs text-stone-500 block mb-1">Vydatnost</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.vydatnost_mnozstvi} onChange={(e) => setMetaDraft((f) => ({ ...f, vydatnost_mnozstvi: e.target.value }))} /></div>
              <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.vydatnost_jednotka} onChange={(e) => setMetaDraft((f) => ({ ...f, vydatnost_jednotka: e.target.value }))} /></div>
              <div><label className="text-xs text-stone-500 block mb-1">Výchozí porce</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.default_porce_mnozstvi} onChange={(e) => setMetaDraft((f) => ({ ...f, default_porce_mnozstvi: e.target.value }))} /></div>
              <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.default_porce_jednotka} onChange={(e) => setMetaDraft((f) => ({ ...f, default_porce_jednotka: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-stone-500 block mb-1">Čas přípravy (min)</label><input type="number" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={metaDraft.cas_pripravy_min} onChange={(e) => setMetaDraft((f) => ({ ...f, cas_pripravy_min: e.target.value }))} /></div>
              <label className="inline-flex items-center gap-2 text-sm text-stone-600 pt-6"><input type="checkbox" checked={metaDraft.aktivni} onChange={(e) => setMetaDraft((f) => ({ ...f, aktivni: e.target.checked }))} /> Aktivní receptura</label>
            </div>
            <div><label className="text-xs text-stone-500 block mb-1">Poznámka</label><textarea rows={3} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" value={metaDraft.poznamka} onChange={(e) => setMetaDraft((f) => ({ ...f, poznamka: e.target.value }))} /></div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-800 uppercase tracking-wide">Verze receptury</h2>
                <div className="text-xs text-stone-400 mt-1">Kalkulace se fixují na konkrétní verzi, aby zůstala zachovaná historie.</div>
              </div>
              <div className="flex gap-2">
                <select className="border border-stone-200 rounded-xl px-3 py-2 text-sm" value={activeVersionId || ''} onChange={(e) => setActiveVersionId(e.target.value)}>
                  {versionIds.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.verze} · {version.stav}
                    </option>
                  ))}
                </select>
                <Btn size="sm" onClick={() => activateVersionMut.mutate()} disabled={!activeVersionId || activateVersionMut.isPending}>Aktivovat</Btn>
              </div>
            </div>

            {versionQuery.isLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : currentVersion ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-stone-700">Suroviny a podreceptury</h3>
                      <Btn size="sm" onClick={() => setVersionDraft((prev) => ({ ...prev, items: [...prev.items, blankItem()] }))}><Plus size={13} /> Přidat řádek</Btn>
                    </div>
                    <div className="space-y-3">
                      {versionDraft.items.map((item, index) => (
                        <div key={`item-${index}`} className="border border-stone-200 rounded-2xl p-3 space-y-2">
                          <div className="grid grid-cols-[140px_1fr_110px_90px_auto] gap-2">
                            <select className="border border-stone-200 rounded-xl px-3 py-2 text-sm" value={item.item_type} onChange={(e) => setVersionDraft((prev) => ({ ...prev, items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, item_type: e.target.value, ingredient_id: '', subrecipe_id: '' } : row) }))}>
                              <option value="ingredient">Surovina</option>
                              <option value="subrecipe">Podreceptura</option>
                            </select>
                            {item.item_type === 'ingredient' ? (
                              <select className="border border-stone-200 rounded-xl px-3 py-2 text-sm" value={item.ingredient_id} onChange={(e) => setVersionDraft((prev) => ({ ...prev, items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, ingredient_id: e.target.value } : row) }))}>
                                <option value="">Vyberte surovinu</option>
                                {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.nazev}</option>)}
                              </select>
                            ) : (
                              <select className="border border-stone-200 rounded-xl px-3 py-2 text-sm" value={item.subrecipe_id} onChange={(e) => setVersionDraft((prev) => ({ ...prev, items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, subrecipe_id: e.target.value } : row) }))}>
                                <option value="">Vyberte podrecepturu</option>
                                {recipeOptions.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.nazev}</option>)}
                              </select>
                            )}
                            <input type="number" className="border border-stone-200 rounded-xl px-3 py-2 text-sm" value={item.mnozstvi} onChange={(e) => setVersionDraft((prev) => ({ ...prev, items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, mnozstvi: e.target.value } : row) }))} />
                            <input className="border border-stone-200 rounded-xl px-3 py-2 text-sm" value={item.jednotka} onChange={(e) => setVersionDraft((prev) => ({ ...prev, items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, jednotka: e.target.value } : row) }))} />
                            <button className="text-xs text-red-500" onClick={() => setVersionDraft((prev) => ({ ...prev, items: prev.items.filter((_, rowIndex) => rowIndex !== index) }))}>Odebrat</button>
                          </div>
                          <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Poznámka k řádku" value={item.poznamka || ''} onChange={(e) => setVersionDraft((prev) => ({ ...prev, items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, poznamka: e.target.value } : row) }))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-stone-700">Technologické kroky</h3>
                      <Btn size="sm" onClick={() => setVersionDraft((prev) => ({ ...prev, steps: [...prev.steps, blankStep(prev.steps.length + 1)] }))}><Plus size={13} /> Přidat krok</Btn>
                    </div>
                    <div className="space-y-3">
                      {versionDraft.steps.map((step, index) => (
                        <div key={`step-${index}`} className="border border-stone-200 rounded-2xl p-3 space-y-2">
                          <div className="grid grid-cols-[70px_1fr_120px_auto] gap-2">
                            <input type="number" className="border border-stone-200 rounded-xl px-3 py-2 text-sm" value={step.krok_index} onChange={(e) => setVersionDraft((prev) => ({ ...prev, steps: prev.steps.map((row, rowIndex) => rowIndex === index ? { ...row, krok_index: e.target.value } : row) }))} />
                            <input className="border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Název kroku" value={step.nazev} onChange={(e) => setVersionDraft((prev) => ({ ...prev, steps: prev.steps.map((row, rowIndex) => rowIndex === index ? { ...row, nazev: e.target.value } : row) }))} />
                            <input className="border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Pracoviště" value={step.pracoviste} onChange={(e) => setVersionDraft((prev) => ({ ...prev, steps: prev.steps.map((row, rowIndex) => rowIndex === index ? { ...row, pracoviste: e.target.value } : row) }))} />
                            <button className="text-xs text-red-500" onClick={() => setVersionDraft((prev) => ({ ...prev, steps: prev.steps.filter((_, rowIndex) => rowIndex !== index) }))}>Odebrat</button>
                          </div>
                          <textarea rows={3} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" placeholder="Instrukce" value={step.instrukce} onChange={(e) => setVersionDraft((prev) => ({ ...prev, steps: prev.steps.map((row, rowIndex) => rowIndex === index ? { ...row, instrukce: e.target.value } : row) }))} />
                          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-2 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-stone-700">Fotka ke kroku</div>
                              <div className="text-xs text-stone-500 truncate">
                                {step.photo_document_id ? (step.photo_nazev || `Dokument #${step.photo_document_id}`) : 'Volitelné. Hodí se pro foto manuál s popisem.'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {step.photo_document_id && (
                                <>
                                  <Btn size="sm" onClick={() => dokumentyApi.download(step.photo_document_id, step.photo_nazev || `foto-kroku-${index + 1}`)}>Stáhnout</Btn>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                                    onClick={() => setVersionDraft((prev) => ({
                                      ...prev,
                                      steps: prev.steps.map((row, rowIndex) => rowIndex === index ? { ...row, photo_document_id: '', photo_nazev: '' } : row),
                                    }))}
                                  >
                                    <X size={13} /> Odebrat
                                  </button>
                                </>
                              )}
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50">
                                <ImagePlus size={13} />
                                {photoUploadingIndex === index ? 'Nahrávám…' : 'Nahrát fotku'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={photoUploadingIndex === index}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    handleStepPhotoUpload(index, file);
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                          <div className="grid grid-cols-[120px_auto_1fr] gap-3 items-center">
                            <input type="number" className="border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Čas (min)" value={step.cas_min} onChange={(e) => setVersionDraft((prev) => ({ ...prev, steps: prev.steps.map((row, rowIndex) => rowIndex === index ? { ...row, cas_min: e.target.value } : row) }))} />
                            <label className="inline-flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={step.kriticky_bod} onChange={(e) => setVersionDraft((prev) => ({ ...prev, steps: prev.steps.map((row, rowIndex) => rowIndex === index ? { ...row, kriticky_bod: e.target.checked } : row) }))} /> Kritický bod</label>
                            <input className="border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Poznámka" value={step.poznamka || ''} onChange={(e) => setVersionDraft((prev) => ({ ...prev, steps: prev.steps.map((row, rowIndex) => rowIndex === index ? { ...row, poznamka: e.target.value } : row) }))} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Btn variant="primary" onClick={saveVersion} disabled={updateVersionMut.isPending}><Save size={14} /> Uložit verzi</Btn>
                </div>
              </div>
            ) : (
              <div className="text-sm text-stone-400">Vybraná verze nebyla načtena.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-stone-800 uppercase tracking-wide mb-4">Cost summary</h2>
            {currentCost ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-xs text-stone-400">Celkový náklad</div><div className="font-semibold">{Number(currentCost.total_cost || 0).toLocaleString('cs-CZ')} Kč</div></div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-xs text-stone-400">Náklad / porce</div><div className="font-semibold">{currentCost.cost_per_portion != null ? `${Number(currentCost.cost_per_portion).toLocaleString('cs-CZ')} Kč` : '—'}</div></div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-xs text-stone-400">Vydatnost</div><div className="font-semibold">{currentCost.output_amount} {currentCost.output_unit}</div></div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2"><div className="text-xs text-stone-400">Alergeny</div><div className="font-semibold">{currentCost.allergens?.length || 0}</div></div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Agregované suroviny</div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {(currentCost.ingredients || []).map((ingredient) => (
                      <div key={`${ingredient.ingredient_id}-${ingredient.jednotka}`} className="rounded-xl border border-stone-200 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-stone-800">{ingredient.ingredient_name}</span>
                          <span className="text-stone-600">{Number(ingredient.total_cost || 0).toLocaleString('cs-CZ')} Kč</span>
                        </div>
                        <div className="text-xs text-stone-400 mt-1">
                          čisté {ingredient.mnozstvi} {ingredient.jednotka} · nákup {ingredient.nakupni_mnozstvi} {ingredient.jednotka}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-stone-400">Náklad zatím nelze spočítat. Zkontrolujte složení a vydatnost.</div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-stone-800 uppercase tracking-wide mb-4">Dokumenty a fotky</h2>
            <div className="space-y-2">
              {(detail.documents || []).length ? (
                detail.documents.map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-stone-200 px-3 py-2 text-sm flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-stone-800">{doc.nazev}</div>
                      <div className="text-xs text-stone-400">{doc.recipe_version_id ? `verze ${doc.recipe_version_id}` : 'obecný dokument'}</div>
                    </div>
                    <Btn size="sm" onClick={() => dokumentyApi.download(doc.id, doc.nazev)}>Stáhnout</Btn>
                  </div>
                ))
              ) : (
                <div className="text-sm text-stone-400">K receptuře zatím nejsou nahrané žádné dokumenty.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={versionModal}
        onClose={() => setVersionModal(false)}
        title="Nová verze receptury"
        footer={<><Btn onClick={() => setVersionModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={() => createVersionMut.mutate({ source_version_id: activeVersionId, poznamka_zmeny: 'Nová pracovní verze' })} disabled={createVersionMut.isPending}>Vytvořit verzi</Btn></>}
      >
        <p className="text-sm text-stone-600">Nová verze se založí jako draft a převezme aktuální složení i technologické kroky.</p>
      </Modal>

      <Modal
        open={uploadModal}
        onClose={() => setUploadModal(false)}
        title="Nahrát dokument k receptuře"
        footer={<><Btn onClick={() => setUploadModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={() => {
          const formData = new FormData();
          formData.append('soubor', uploadForm.soubor);
          formData.append('recipe_id', id);
          if (activeVersionId) formData.append('recipe_version_id', activeVersionId);
          formData.append('poznamka', uploadForm.poznamka);
          uploadMut.mutate(formData);
        }} disabled={!uploadForm.soubor || uploadMut.isPending}>Nahrát</Btn></>}
      >
        <div className="space-y-3">
          <input type="file" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" onChange={(e) => setUploadForm((f) => ({ ...f, soubor: e.target.files?.[0] || null }))} />
          <textarea rows={3} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" placeholder="Poznámka k dokumentu" value={uploadForm.poznamka} onChange={(e) => setUploadForm((f) => ({ ...f, poznamka: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
