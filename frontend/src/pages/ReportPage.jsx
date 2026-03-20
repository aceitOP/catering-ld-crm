import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportyApi } from '../api';
import { PageHeader, EmptyState, Btn, Spinner, ExportMenu, useSort, SortTh, TypBadge } from '../components/ui';
import { BarChart2 } from 'lucide-react';

const TYP_LABELS_R = { svatba:'Svatba', soukroma_akce:'Soukromá akce', firemni_akce:'Firemní akce', zavoz:'Závoz', bistro:'Bistro', pohreb:'Pohřeb', ostatni:'Ostatní' };

export function ReportPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ od: '', do: '' });
  const [applied, setApplied] = useState({ od: '', do: '' });

  const applyQuick = (od, d) => { setFilters({ od, do: d }); setApplied({ od, do: d }); };

  const QUICK = [
    { l: 'Tento týden', fn: () => {
      const n = new Date(); const dow = (n.getDay() + 6) % 7;
      const mon = new Date(n); mon.setDate(n.getDate() - dow);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      applyQuick(mon.toISOString().slice(0,10), sun.toISOString().slice(0,10));
    }},
    { l: 'Minulý měsíc', fn: () => {
      const n = new Date();
      const f = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      const l = new Date(n.getFullYear(), n.getMonth(), 0);
      applyQuick(f.toISOString().slice(0,10), l.toISOString().slice(0,10));
    }},
    { l: 'Poslední 3 měs.', fn: () => {
      const n = new Date();
      const f = new Date(n.getFullYear(), n.getMonth() - 3, 1);
      applyQuick(f.toISOString().slice(0,10), n.toISOString().slice(0,10));
    }},
    { l: 'Posledních 6 měs.', fn: () => {
      const n = new Date();
      const f = new Date(n.getFullYear(), n.getMonth() - 6, 1);
      applyQuick(f.toISOString().slice(0,10), n.toISOString().slice(0,10));
    }},
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['reporty', applied],
    queryFn: () => reportyApi.get(applied),
  });

  const report  = data?.data;
  const souhrn  = report?.souhrn || {};
  const zakazkyRaw = report?.zakazky || [];

  const sortR = useSort();
  const SORT_ACC_R = { datum: 'datum_akce', zakazka: 'nazev', klient: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`, typ: 'typ', cena: r => parseFloat(r.cena_celkem)||0, naklady: r => parseFloat(r.cena_naklady)||0, zisk: r => (parseFloat(r.cena_celkem)||0)-(parseFloat(r.cena_naklady)||0) };
  const zakazky = sortR.sortFn(zakazkyRaw, SORT_ACC_R);

  const fmtC = (n) => n == null ? '—' : new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(n);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('cs-CZ') : '—';

  const ZAKAZKY_COLS = [
    { header: 'Číslo',   accessor: 'cislo' },
    { header: 'Název',   accessor: 'nazev' },
    { header: 'Typ',     accessor: r => TYP_LABELS_R[r.typ] || r.typ },
    { header: 'Datum',   accessor: r => fmtD(r.datum_akce) },
    { header: 'Klient',  accessor: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`.trim() },
    { header: 'Cena',    accessor: r => r.cena_celkem != null ? Number(r.cena_celkem).toFixed(0) : '—' },
    { header: 'Náklady', accessor: r => r.cena_naklady != null ? Number(r.cena_naklady).toFixed(0) : '—' },
    { header: 'Zisk',    accessor: r => (r.cena_celkem != null && r.cena_naklady != null) ? (r.cena_celkem - r.cena_naklady).toFixed(0) : '—' },
  ];

  return (
    <div>
      <PageHeader title="Reporty" subtitle="Přehled realizovaných akcí a obratu"
        actions={zakazky.length > 0 ? <ExportMenu data={zakazky} columns={ZAKAZKY_COLS} filename="report"/> : null}/>

      {/* Filtry */}
      <div className="bg-stone-50 border-b border-stone-100 px-6 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500 font-medium">Období:</span>
        <div className="flex gap-1 flex-wrap">
          {QUICK.map(b => (
            <button key={b.l} onClick={b.fn}
              className="text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg hover:bg-stone-100 text-stone-600 bg-white transition-colors whitespace-nowrap">
              {b.l}
            </button>
          ))}
        </div>
        <span className="text-stone-300 text-xs hidden sm:block">|</span>
        <input type="date" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
          value={filters.od} onChange={e => setFilters(f => ({ ...f, od: e.target.value }))}/>
        <span className="text-stone-400 text-xs">–</span>
        <input type="date" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
          value={filters.do} onChange={e => setFilters(f => ({ ...f, do: e.target.value }))}/>
        <Btn size="sm" variant="primary" onClick={() => setApplied({ ...filters })}>Zobrazit</Btn>
        {(applied.od || applied.do) && (
          <Btn size="sm" onClick={() => { setFilters({ od:'', do:'' }); setApplied({ od:'', do:'' }); }}>Vše</Btn>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner/></div>
      ) : (
        <div className="p-6 space-y-5">
          {/* Souhrnné karty */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Celkem zakázek', value: souhrn.total_zakazek || 0, color: '' },
              { label: 'Realizovaných',  value: souhrn.realizovano || 0,   color: 'text-green-700' },
              { label: 'Obrat',          value: fmtC(souhrn.obrat),        color: 'text-blue-700' },
              { label: 'Náklady',        value: fmtC(souhrn.naklady),      color: 'text-amber-700' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="text-xs text-stone-500 mb-1">{s.label}</div>
                <div className={`text-xl font-semibold ${s.color || 'text-stone-900'}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Obrat podle typu */}
          {(report?.podle_typu||[]).length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <h3 className="text-sm font-semibold text-stone-700 mb-4">Obrat podle typu akce</h3>
              <div className="space-y-3">
                {report.podle_typu.map(t => {
                  const total = report.podle_typu.reduce((s,r) => s + parseFloat(r.obrat||0), 0);
                  const pct = total > 0 ? Math.round(parseFloat(t.obrat||0) / total * 100) : 0;
                  return (
                    <div key={t.typ} className="flex items-center gap-3">
                      <div className="w-36 text-xs text-stone-600 flex-shrink-0">{TYP_LABELS_R[t.typ] || t.typ}</div>
                      <div className="flex-1 bg-stone-100 rounded-full h-2">
                        <div className="bg-brand-700 h-2 rounded-full" style={{ width: `${pct}%` }}/>
                      </div>
                      <div className="text-xs font-medium text-stone-700 w-28 text-right">{fmtC(t.obrat)}</div>
                      <div className="text-xs text-stone-400 w-8 text-right">{t.pocet}×</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabulka realizovaných zakázek */}
          {zakazky.length > 0 ? (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-stone-100">
                <span className="text-sm font-semibold text-stone-700">Realizované akce ({zakazky.length})</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    {[['Datum','datum'],['Zakázka','zakazka'],['Klient','klient'],['Typ','typ'],['Cena','cena'],['Náklady','naklady'],['Zisk','zisk']].map(([l,k]) =>
                      <SortTh key={k} label={l} sortKey={k} active={sortR.sortKey===k} dir={sortR.sortDir} onSort={sortR.toggle}/>)}
                  </tr>
                </thead>
                <tbody>
                  {zakazky.map((z,i) => {
                    const zisk = (parseFloat(z.cena_celkem)||0) - (parseFloat(z.cena_naklady)||0);
                    return (
                      <tr key={z.id} onClick={() => navigate(`/zakazky/${z.id}`)}
                        className={`cursor-pointer hover:bg-stone-50 transition-colors ${i<zakazky.length-1?'border-b border-stone-50':''}`}>
                        <td className="px-4 py-3 text-sm text-stone-500 whitespace-nowrap">{fmtD(z.datum_akce)}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-stone-900">{z.nazev}</div>
                          <div className="text-xs text-stone-400">{z.cislo}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-600">{z.klient_firma || `${z.klient_jmeno||''} ${z.klient_prijmeni||''}`.trim() || '—'}</td>
                        <td className="px-4 py-3"><TypBadge typ={z.typ}/></td>
                        <td className="px-4 py-3 text-sm font-medium text-stone-700">{fmtC(z.cena_celkem)}</td>
                        <td className="px-4 py-3 text-sm text-stone-500">{z.cena_naklady != null ? fmtC(z.cena_naklady) : '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-700">{z.cena_naklady != null ? fmtC(zisk) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={BarChart2} title="Žádné realizované akce" desc="Vyberte období nebo označte zakázky jako realizované."/>
          )}
        </div>
      )}
    </div>
  );
}

export default ReportPage;
