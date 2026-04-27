import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { klientiApi } from '../api';
import { PageHeader, KlientTypBadge, StavBadge, formatCena, formatDatum, Spinner, EmptyState, Btn, Modal, ExportMenu } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, Pencil, Search, Users, X, RefreshCw, Archive, Star, Upload, Link as LinkIcon } from 'lucide-react';
import { ImportModal } from '../components/ImportModal';

async function fetchAres(ico) {
  const res = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico.trim()}`);
  if (!res.ok) throw new Error('IČO nenalezeno v ARES');
  return res.json();
}

function parseAres(data) {
  const adresaObj = data.sidlo;
  const adresa = adresaObj
    ? [adresaObj.nazevUlice, adresaObj.cisloDomovni, adresaObj.nazevObce, adresaObj.psc].filter(Boolean).join(' ')
    : '';
  return {
    firma: data.obchodniJmeno || '',
    dic: data.dic || '',
    adresa,
  };
}

const TYPY = [{v:'soukromy',l:'Soukromý'},{v:'firemni',l:'Firemní'},{v:'vip',l:'VIP'}];

const emptyForm = { jmeno:'', prijmeni:'', firma:'', typ:'soukromy', email:'', telefon:'', adresa:'', ico:'', dic:'', zdroj:'', poznamka:'' };

export default function KlientiPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const qc        = useQueryClient();
  const [q, setQ] = useState('');
  const [typ, setTyp] = useState('');
  const [selected, setSelected] = useState(null);
  const [modal, setModal]       = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [form, setForm]         = useState(emptyForm);

  // Otevři modal pokud přišel navigate('/klienti', { state: { openNew: true } })
  useEffect(() => {
    if (location.state?.openNew) {
      setModal(true);
      window.history.replaceState({}, '');
    }
  }, []);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm]   = useState(emptyForm);
  const [aresLoading, setAresLoading] = useState(false);

  const handleAres = async (ico, setF) => {
    if (!ico) return toast.error('Zadejte IČO');
    setAresLoading(true);
    try {
      const data = await fetchAres(ico);
      const parsed = parseAres(data);
      setF(f => ({ ...f, ...parsed, ico }));
      toast.success('Údaje z ARES doplněny');
    } catch {
      toast.error('IČO nenalezeno v ARES');
    } finally {
      setAresLoading(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['klienti', q, typ],
    queryFn: () => klientiApi.list({ q, typ, sort: 'datum', limit: 200 }),
  });
  const { data: detailData } = useQuery({
    queryKey: ['klient', selected],
    queryFn: () => klientiApi.get(selected),
    enabled: !!selected,
  });

  const createMut = useMutation({
    mutationFn: klientiApi.create,
    handleSuccess: (response) => {
      const created = response?.data;
      setQ('');
      setTyp('');
      setModal(false);
      setForm(emptyForm);
      if (created?.id) {
        setSelected(created.id);
        qc.invalidateQueries({ queryKey: ['klient', created.id] });
      }
      qc.invalidateQueries({ queryKey: ['klienti'] });
      toast.success('Klient přidán');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['klienti'] }); toast.success('Klient přidán'); setModal(false); setForm(emptyForm); },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => klientiApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['klienti'] }); qc.invalidateQueries({ queryKey: ['klient', selected] }); toast.success('Klient uložen'); setEditModal(false); },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const archivMut = useMutation({
    mutationFn: (id) => klientiApi.archivovat(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['klienti'] }); setSelected(null); toast.success('Klient archivován'); },
    onError: () => toast.error('Nepodařilo se archivovat klienta'),
  });

  const pravidelnyMut = useMutation({
    mutationFn: ({ id, value }) => klientiApi.setPravidelny(id, value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['klienti'] }); qc.invalidateQueries({ queryKey: ['klient', selected] }); qc.invalidateQueries({ queryKey: ['pravidelni-klienti'] }); },
    onError: () => toast.error('Chyba při aktualizaci'),
  });

  const openEdit = () => {
    if (!detail) return;
    setEditForm({ jmeno: detail.jmeno||'', prijmeni: detail.prijmeni||'', firma: detail.firma||'',
      typ: detail.typ||'soukromy', email: detail.email||'', telefon: detail.telefon||'',
      adresa: detail.adresa||'', ico: detail.ico||'', dic: detail.dic||'',
      zdroj: detail.zdroj||'', poznamka: detail.poznamka||'' });
    setEditModal(true);
  };

  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  const klienti = data?.data?.data || [];
  const detail  = detailData?.data;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const copyClientPortalUrl = async () => {
    const url = `${window.location.origin}/portal/login`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL klientské sekce zkopírována');
    } catch {
      window.prompt('URL klientské sekce:', url);
    }
  };

  const [sel, setSel] = useState(new Set());
  const toggleSel = (id, e) => { e.stopPropagation(); setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const allChecked = klienti.length > 0 && klienti.every(k => sel.has(k.id));
  const toggleAll  = () => setSel(allChecked ? new Set() : new Set(klienti.map(k => k.id)));

  const exportSelCsv = () => {
    const cols = [
      { h: 'Jméno', fn: r => `${r.jmeno} ${r.prijmeni||''}`.trim() },
      { h: 'Firma', fn: r => r.firma || '' },
      { h: 'Typ', fn: r => ({soukromy:'Soukromý',firemni:'Firemní',vip:'VIP'})[r.typ]||r.typ },
      { h: 'E-mail', fn: r => r.email||'' }, { h: 'Telefon', fn: r => r.telefon||'' },
    ];
    const selRows = klienti.filter(r => sel.has(r.id));
    const csv = [cols.map(c=>c.h), ...selRows.map(r => cols.map(c => String(c.fn(r))))].map(r => r.map(c=>`"${c.replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement('a'),{href:url,download:'vybrani-klienti.csv'}); a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Klienti"
        subtitle={`${klienti.length} klientů`}
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu
              data={klienti}
              columns={[
                { header: 'Jméno',        accessor: r => `${r.jmeno} ${r.prijmeni||''}`.trim() },
                { header: 'Firma',        accessor: 'firma' },
                { header: 'Typ',          accessor: r => ({ soukromy:'Soukromý', firemni:'Firemní', vip:'VIP' })[r.typ] || r.typ },
                { header: 'E-mail',       accessor: 'email' },
                { header: 'Telefon',      accessor: 'telefon' },
                { header: 'Počet zakázek',accessor: 'pocet_zakazek' },
              ]}
              filename="klienti"
            />
            <Btn size="sm" onClick={() => setImportModal(true)}>
              <Upload size={12}/> Import CSV
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => setModal(true)}>
              <Plus size={12}/> Nový klient
            </Btn>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Seznam */}
        <div className={`${selected ? 'w-80 flex-shrink-0' : 'flex-1'} border-r border-stone-100 flex flex-col overflow-hidden`}>
          {/* Select all bar */}
          {klienti.length > 0 && (
            <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 flex items-center gap-2">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded cursor-pointer"/>
              <span className="text-xs text-stone-500">Vybrat vše</span>
            </div>
          )}
          {/* Filtry */}
          <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex gap-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
              <input className="w-full pl-7 pr-2 py-2 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none"
                placeholder="Hledat…" value={q} onChange={e=>setQ(e.target.value)}/>
            </div>
            <select className="text-xs border border-stone-200 rounded-lg px-2 py-2 bg-white focus:outline-none"
              value={typ} onChange={e=>setTyp(e.target.value)}>
              <option value="">Vše</option>
              {TYPY.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner/></div>
            ) : klienti.length === 0 ? (
              <EmptyState icon={Users} title="Žádní klienti"/>
            ) : klienti.map(k => (
              <div key={k.id}
                onClick={() => setSelected(selected===k.id ? null : k.id)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-stone-50 hover:bg-stone-50 transition-colors ${selected===k.id||sel.has(k.id)?'bg-stone-50':''}`}>
                <input type="checkbox" checked={sel.has(k.id)} onChange={() => {}} onClick={e => toggleSel(k.id, e)} className="rounded cursor-pointer flex-shrink-0"/>
                <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600 flex-shrink-0">
                  {k.jmeno?.[0]}{(k.prijmeni||k.firma)?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-800 truncate">
                    {k.firma || `${k.jmeno} ${k.prijmeni||''}`}
                  </div>
                </div>
                {k.pravidelny && <Star size={12} className="text-yellow-400 fill-yellow-400 flex-shrink-0"/>}
                <KlientTypBadge typ={k.typ}/>
                <div className="text-xs font-medium text-stone-500 w-8 text-right flex-shrink-0">
                  {k.pocet_realizovano > 0 ? `${k.pocet_realizovano}×` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {selected && detail && (
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="px-6 py-4 border-b border-stone-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-stone-900">
                    {detail.firma || `${detail.jmeno} ${detail.prijmeni||''}`}
                  </h2>
                  <KlientTypBadge typ={detail.typ}/>
                </div>
                {detail.firma && <div className="text-xs text-stone-500 mt-0.5">{detail.jmeno} {detail.prijmeni}</div>}
              </div>
              <div className="flex gap-2 items-center">
                <Btn size="sm" onClick={() => navigate('/zakazky/nova')}>+ Zakázka</Btn>
                <Btn size="sm" onClick={copyClientPortalUrl}>
                  <LinkIcon size={12} />
                  Portál
                </Btn>
                <button
                  onClick={() => pravidelnyMut.mutate({ id: selected, value: !detail.pravidelny })}
                  disabled={pravidelnyMut.isPending}
                  className={`p-1 transition-colors ${detail.pravidelny ? 'text-yellow-500 hover:text-yellow-600' : 'text-stone-300 hover:text-yellow-500'}`}
                  title={detail.pravidelny ? 'Označen jako pravidelný – kliknutím zrušit' : 'Označit jako pravidelného klienta'}>
                  <Star size={14} className={detail.pravidelny ? 'fill-yellow-400' : ''}/>
                </button>
                <button onClick={openEdit} className="text-stone-400 hover:text-stone-700 p-1" title="Upravit klienta"><Pencil size={14}/></button>
                <button onClick={() => window.confirm('Archivovat klienta?') && archivMut.mutate(selected)} disabled={archivMut.isPending} className="text-stone-400 hover:text-red-500 p-1" title="Archivovat klienta"><Archive size={14}/></button>
                <button onClick={() => setSelected(null)} className="text-stone-400 hover:text-stone-700 p-1"><X size={14}/></button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Kontakty */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[['E-mail', detail.email],['Telefon', detail.telefon],['Adresa', detail.adresa],
                  ...(detail.typ==='firemni'?[['IČO',detail.ico],['DIČ',detail.dic]]:[])]
                  .filter(([,v])=>v)
                  .map(([k,v]) => (
                    <div key={k}><div className="text-xs text-stone-400">{k}</div><div className="font-medium text-stone-800 mt-0.5">{v}</div></div>
                  ))}
              </div>

              {/* Statistiky */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['Zakázky', detail.pocet_zakazek || 0],
                  ['Obrat', formatCena(detail.obrat_celkem || 0)],
                  ['Zdroj', detail.zdroj || '—'],
                ].map(([k,v]) => (
                  <div key={k} className="bg-stone-50 rounded-lg p-3">
                    <div className="text-xs text-stone-500">{k}</div>
                    <div className="text-sm font-semibold text-stone-800 mt-0.5">{v}</div>
                  </div>
                ))}
              </div>

              {/* Zakázky */}
              {detail.zakazky?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Historie zakázek</div>
                  <div className="space-y-2">
                    {detail.zakazky.map(z => (
                      <div key={z.id}
                        onClick={() => navigate(`/zakazky/${z.id}`)}
                        className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer hover:bg-stone-100 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-stone-800 truncate">{z.nazev}</div>
                          <div className="text-xs text-stone-400">{z.cislo} · {formatDatum(z.datum_akce)}</div>
                        </div>
                        <StavBadge stav={z.stav}/>
                        <div className="text-xs font-medium text-stone-700">{formatCena(z.cena_celkem)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Poznámka */}
              {detail.poznamka && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <div className="text-xs font-medium text-amber-700 mb-1">Poznámka</div>
                  <p className="text-sm text-amber-800">{detail.poznamka}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal edit klienta */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Upravit klienta"
        footer={<>
          <Btn onClick={() => setEditModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => updateMut.mutate({ id: selected, data: editForm })} disabled={!editForm.jmeno || updateMut.isPending}>
            {updateMut.isPending ? 'Ukládám…' : 'Uložit'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Jméno *</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.jmeno} onChange={e=>setE('jmeno',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Příjmení</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.prijmeni} onChange={e=>setE('prijmeni',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Typ</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.typ} onChange={e=>setE('typ',e.target.value)}>
              {TYPY.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          {editForm.typ === 'firemni' && <>
            <div><label className="text-xs text-stone-500 block mb-1">Název firmy</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.firma} onChange={e=>setE('firma',e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1">IČO</label>
                <div className="flex gap-1.5">
                  <input className="min-w-0 flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.ico} onChange={e=>setE('ico',e.target.value)}/>
                  <button type="button" onClick={() => handleAres(editForm.ico, setEditForm)}
                    disabled={aresLoading}
                    className="flex items-center gap-1 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 text-blue-600 text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0 whitespace-nowrap" title="Doplnit z ARES">
                    <RefreshCw size={12} className={aresLoading ? 'animate-spin' : ''}/>
                    ARES
                  </button>
                </div>
              </div>
              <div><label className="text-xs text-stone-500 block mb-1">DIČ</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.dic} onChange={e=>setE('dic',e.target.value)}/></div>
            </div>
          </>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">E-mail</label>
              <input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.email} onChange={e=>setE('email',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Telefon</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.telefon} onChange={e=>setE('telefon',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Adresa</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editForm.adresa} onChange={e=>setE('adresa',e.target.value)}/></div>
          <div><label className="text-xs text-stone-500 block mb-1">Interní poznámka</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={2} value={editForm.poznamka} onChange={e=>setE('poznamka',e.target.value)}/></div>
        </div>
      </Modal>

      {sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-stone-900 text-white rounded-xl px-5 py-3 shadow-2xl z-30">
          <span className="text-sm font-medium">{sel.size} vybráno</span>
          <button onClick={exportSelCsv} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors">Export CSV</button>
          <button onClick={() => setSel(new Set())} className="text-xs text-stone-400 hover:text-white ml-1 transition-colors">✕</button>
        </div>
      )}

      {importModal && (
        <ImportModal
          type="klienti"
          onClose={() => setImportModal(false)}
          onDone={() => { setImportModal(false); qc.invalidateQueries({ queryKey: ['klienti'] }); }}
        />
      )}

      {/* Modal nový klient */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nový klient"
        footer={<>
          <Btn onClick={() => setModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => createMut.mutate(form)} disabled={!form.jmeno || createMut.isPending}>
            {createMut.isPending ? 'Ukládám…' : 'Přidat klienta'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Jméno *</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.jmeno} onChange={e=>set('jmeno',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Příjmení</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.prijmeni} onChange={e=>set('prijmeni',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Typ</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.typ} onChange={e=>set('typ',e.target.value)}>
              {TYPY.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          {form.typ === 'firemni' && <>
            <div><label className="text-xs text-stone-500 block mb-1">Název firmy</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.firma} onChange={e=>set('firma',e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1">IČO</label>
                <div className="flex gap-1.5">
                  <input className="min-w-0 flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.ico} onChange={e=>set('ico',e.target.value)}/>
                  <button type="button" onClick={() => handleAres(form.ico, setForm)}
                    disabled={aresLoading}
                    className="flex items-center gap-1 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 text-blue-600 text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0 whitespace-nowrap" title="Doplnit z ARES">
                    <RefreshCw size={12} className={aresLoading ? 'animate-spin' : ''}/>
                    ARES
                  </button>
                </div>
              </div>
              <div><label className="text-xs text-stone-500 block mb-1">DIČ</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.dic} onChange={e=>set('dic',e.target.value)}/></div>
            </div>
          </>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">E-mail</label>
              <input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.email} onChange={e=>set('email',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Telefon</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.telefon} onChange={e=>set('telefon',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Adresa</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.adresa} onChange={e=>set('adresa',e.target.value)}/></div>
          <div><label className="text-xs text-stone-500 block mb-1">Interní poznámka</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={2} value={form.poznamka} onChange={e=>set('poznamka',e.target.value)}/></div>
        </div>
      </Modal>
    </div>
  );
}
