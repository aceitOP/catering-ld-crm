import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { zakazkyApi } from '../api';
import { PageHeader, StavBadge, TypBadge, formatCena, formatDatum, Spinner, EmptyState, ExportMenu, useSort, SortTh } from '../components/ui';
import { Plus, Search, ClipboardList, Printer } from 'lucide-react';
import { printKomandoPdf } from '../utils/print';

const STAVY  = ['nova_poptavka','rozpracovano','nabidka_pripravena','nabidka_odeslana','ceka_na_vyjadreni','potvrzeno','ve_priprave','realizovano','uzavreno','stornovano'];
const TYPY   = ['svatba','soukroma_akce','firemni_akce','zavoz','bistro','pohreb','ostatni'];
const STAV_LABELS = { nova_poptavka:'Nová poptávka',rozpracovano:'Rozpracováno',nabidka_pripravena:'Nabídka připravena',nabidka_odeslana:'Nabídka odeslána',ceka_na_vyjadreni:'Čeká na vyjádření',potvrzeno:'Potvrzeno',ve_priprave:'Ve přípravě',realizovano:'Realizováno',uzavreno:'Uzavřeno',stornovano:'Stornováno' };
const TYP_LABELS = { svatba:'Svatba',soukroma_akce:'Soukromá akce',firemni_akce:'Firemní akce',zavoz:'Závoz',bistro:'Bistro',pohreb:'Pohřeb',ostatni:'Ostatní' };

export default function ZakazkyPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q:'', stav:'', typ:'', od:'', do:'', page:1 });

  const { data, isLoading } = useQuery({
    queryKey: ['zakazky', filters],
    queryFn: () => zakazkyApi.list({ ...filters, limit: 15 }),
  });

  const rowsRaw = data?.data?.data  || [];
  const meta    = data?.data?.meta  || {};

  const sort = useSort();
  const SORT_ACC = {
    nazev: 'nazev', klient: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`,
    typ: 'typ', stav: 'stav', datum: 'datum_akce', cena: r => parseFloat(r.cena_celkem) || 0,
  };
  const rows = sort.sortFn(rowsRaw, SORT_ACC);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }));

  const [sel, setSel] = useState(new Set());
  const toggleSel = (id, e) => { e.stopPropagation(); setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const allChecked = rows.length > 0 && rows.every(r => sel.has(r.id));
  const toggleAll  = () => setSel(allChecked ? new Set() : new Set(rows.map(r => r.id)));

  const exportSelCsv = () => {
    const selRows = rows.filter(r => sel.has(r.id));
    const headers = ZAKAZKY_COLS.map(c => c.header);
    const csvData = selRows.map(r => ZAKAZKY_COLS.map(c => String(typeof c.accessor === 'function' ? (c.accessor(r) ?? '') : (r[c.accessor] ?? ''))));
    const csv = [headers, ...csvData].map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement('a'), { href: url, download: 'vybrane-zakazky.csv' }); a.click(); URL.revokeObjectURL(url);
  };

  // Souhrn
  const obrat = rows.reduce((s, z) => s + parseFloat(z.cena_celkem || 0), 0);
  const potvrzene = rows.filter(z => z.stav === 'potvrzeno').length;
  const cekaNa    = rows.filter(z => ['nabidka_pripravena','nabidka_odeslana','ceka_na_vyjadreni'].includes(z.stav)).length;

  const ZAKAZKY_COLS = [
    { header: 'Číslo',      accessor: 'cislo' },
    { header: 'Název',      accessor: 'nazev' },
    { header: 'Typ',        accessor: r => TYP_LABELS[r.typ] || r.typ },
    { header: 'Stav',       accessor: r => STAV_LABELS[r.stav] || r.stav },
    { header: 'Datum akce', accessor: r => r.datum_akce ? formatDatum(r.datum_akce) : '—' },
    { header: 'Klient',     accessor: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`.trim() },
    { header: 'Cena',       accessor: r => r.cena_celkem != null ? Number(r.cena_celkem).toFixed(0) : '—' },
  ];

  return (
    <div>
      <PageHeader
        title="Zakázky"
        subtitle={meta.total ? `${meta.total} zakázek celkem` : ''}
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu data={rows} columns={ZAKAZKY_COLS} filename="zakazky"/>
            <button onClick={() => navigate('/klienti')}
              className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-surface shadow-sm transition-all">
              <Plus size={13} /> Nový klient
            </button>
            <button onClick={() => navigate('/nabidky/nova')}
              className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-surface shadow-sm transition-all">
              <Plus size={13} /> Nová nabídka
            </button>
            <button
              onClick={() => navigate('/zakazky/nova')}
              className="inline-flex items-center gap-2 bg-brand-600 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-brand-700 shadow-md shadow-brand-600/20 transition-all"
            >
              <Plus size={13} /> Nová zakázka
            </button>
          </div>
        }
      />

      {/* Filtry */}
      <div className="px-8 pb-2 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="w-full pl-10 pr-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
            placeholder="Hledat zakázku, číslo, klient…"
            value={filters.q}
            onChange={e => setF('q', e.target.value)}
          />
        </div>
        <select className="text-sm border border-stone-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          value={filters.stav} onChange={e => setF('stav', e.target.value)}>
          <option value="">Všechny stavy</option>
          {STAVY.map(s => <option key={s} value={s}>{STAV_LABELS[s]}</option>)}
        </select>
        <select className="text-sm border border-stone-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          value={filters.typ} onChange={e => setF('typ', e.target.value)}>
          <option value="">Všechny typy</option>
          {TYPY.map(t => <option key={t} value={t}>{TYP_LABELS[t]}</option>)}
        </select>
        <input type="date" className="text-sm border border-stone-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          value={filters.od} onChange={e => setF('od', e.target.value)} />
        <span className="text-stone-300 text-xs font-bold">–</span>
        <input type="date" className="text-sm border border-stone-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          value={filters.do} onChange={e => setF('do', e.target.value)} />
      </div>

      {/* Souhrn */}
      {rows.length > 0 && (
        <div className="px-8 py-3 flex items-center gap-5 text-xs font-semibold">
          <span className="text-stone-400">{rows.length} z {meta.total} zakázek</span>
          <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">Potvrzeno: {potvrzene}</span>
          <span className="text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">Čeká: {cekaNa}</span>
          <span className="text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">Obrat: {formatCena(obrat)}</span>
        </div>
      )}

      {/* Tabulka */}
      <div className="px-8 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Žádné zakázky" desc="Vytvořte první zakázku tlačítkem nahoře." />
        ) : (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded cursor-pointer"/>
                  </th>
                  {[['Zakázka','nazev'],['Klient','klient'],['Typ','typ'],['Stav','stav'],['Datum','datum'],['Cena','cena']].map(([label,key]) => (
                    <SortTh key={key} label={label} sortKey={key} active={sort.sortKey===key} dir={sort.sortDir} onSort={sort.toggle}/>
                  ))}
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((z, i) => (
                  <tr
                    key={z.id}
                    onClick={() => navigate(`/zakazky/${z.id}`)}
                    className={`cursor-pointer hover:bg-surface/70 transition-colors ${sel.has(z.id) ? 'bg-surface' : ''} ${i < rows.length-1 ? 'border-b border-stone-50' : ''}`}
                  >
                    <td className="pl-4 pr-2 w-8" onClick={e => toggleSel(z.id, e)}>
                      <input type="checkbox" checked={sel.has(z.id)} onChange={() => {}} className="rounded cursor-pointer"/>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-stone-900">{z.nazev}</div>
                      <div className="text-xs text-stone-400">{z.cislo}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600">
                      {z.klient_firma || `${z.klient_jmeno || ''} ${z.klient_prijmeni || ''}`.trim() || '—'}
                    </td>
                    <td className="px-4 py-3"><TypBadge typ={z.typ} /></td>
                    <td className="px-4 py-3"><StavBadge stav={z.stav} /></td>
                    <td className="px-4 py-3 text-sm text-stone-500">{formatDatum(z.datum_akce)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-stone-700">{formatCena(z.cena_celkem)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => zakazkyApi.get(z.id).then(res => printKomandoPdf(res.data))}
                        className="p-1.5 text-stone-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        title="Komando PDF"
                      >
                        <Printer size={13}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Stránkování */}
            {meta.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-stone-100 text-xs text-stone-500 font-medium">
                <span>Strana {meta.page} z {meta.pages}</span>
                <div className="flex gap-2">
                  <button
                    disabled={meta.page <= 1}
                    onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                    className="px-4 py-2 border border-stone-200 rounded-xl hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-all font-semibold"
                  >← Předchozí</button>
                  <button
                    disabled={meta.page >= meta.pages}
                    onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                    className="px-4 py-2 border border-stone-200 rounded-xl hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-all font-semibold"
                  >Další →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-brand-800 text-white rounded-2xl px-6 py-3.5 shadow-2xl shadow-brand-800/30 z-30">
          <span className="text-sm font-semibold">{sel.size} vybráno</span>
          <button onClick={exportSelCsv} className="text-xs bg-white/15 hover:bg-white/25 px-4 py-2 rounded-xl transition-colors font-semibold">Export CSV</button>
          <button onClick={() => setSel(new Set())} className="text-xs text-brand-300 hover:text-white ml-1 transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}
