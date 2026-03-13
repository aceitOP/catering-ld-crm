import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { zakazkyApi } from '../api';
import { PageHeader, StavBadge, TypBadge, formatCena, formatDatum, Spinner, EmptyState } from '../components/ui';
import { Plus, Search, ClipboardList, ArrowUpDown } from 'lucide-react';

const STAVY  = ['nova_poptavka','rozpracovano','nabidka_pripravena','nabidka_odeslana','ceka_na_vyjadreni','potvrzeno','ve_priprave','realizovano','uzavreno','stornovano'];
const TYPY   = ['svatba','soukroma_akce','firemni_akce','zavoz','bistro'];
const STAV_LABELS = { nova_poptavka:'Nová poptávka',rozpracovano:'Rozpracováno',nabidka_pripravena:'Nabídka připravena',nabidka_odeslana:'Nabídka odeslána',ceka_na_vyjadreni:'Čeká na vyjádření',potvrzeno:'Potvrzeno',ve_priprave:'Ve přípravě',realizovano:'Realizováno',uzavreno:'Uzavřeno',stornovano:'Stornováno' };
const TYP_LABELS = { svatba:'Svatba',soukroma_akce:'Soukromá akce',firemni_akce:'Firemní akce',zavoz:'Závoz',bistro:'Bistro' };

export default function ZakazkyPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q:'', stav:'', typ:'', od:'', do:'', page:1 });

  const { data, isLoading } = useQuery({
    queryKey: ['zakazky', filters],
    queryFn: () => zakazkyApi.list({ ...filters, limit: 15 }),
  });

  const rows  = data?.data?.data  || [];
  const meta  = data?.data?.meta  || {};

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }));

  // Souhrn
  const obrat = rows.reduce((s, z) => s + parseFloat(z.cena_celkem || 0), 0);
  const potvrzene = rows.filter(z => z.stav === 'potvrzeno').length;
  const cekaNa    = rows.filter(z => ['nabidka_pripravena','nabidka_odeslana','ceka_na_vyjadreni'].includes(z.stav)).length;

  return (
    <div>
      <PageHeader
        title="Zakázky"
        subtitle={meta.total ? `${meta.total} zakázek celkem` : ''}
        actions={
          <button
            onClick={() => navigate('/zakazky/nova')}
            className="inline-flex items-center gap-1.5 bg-stone-900 text-white text-xs font-medium px-3 py-2 rounded-md hover:bg-stone-800 transition-colors"
          >
            <Plus size={13} /> Nová zakázka
          </button>
        }
      />

      {/* Filtry */}
      <div className="bg-stone-50 border-b border-stone-100 px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="w-full pl-8 pr-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:border-stone-400"
            placeholder="Hledat zakázku, číslo, klient…"
            value={filters.q}
            onChange={e => setF('q', e.target.value)}
          />
        </div>
        <select className="text-sm border border-stone-200 rounded-lg px-2 py-2 bg-white focus:outline-none"
          value={filters.stav} onChange={e => setF('stav', e.target.value)}>
          <option value="">Všechny stavy</option>
          {STAVY.map(s => <option key={s} value={s}>{STAV_LABELS[s]}</option>)}
        </select>
        <select className="text-sm border border-stone-200 rounded-lg px-2 py-2 bg-white focus:outline-none"
          value={filters.typ} onChange={e => setF('typ', e.target.value)}>
          <option value="">Všechny typy</option>
          {TYPY.map(t => <option key={t} value={t}>{TYP_LABELS[t]}</option>)}
        </select>
        <input type="date" className="text-sm border border-stone-200 rounded-lg px-2 py-2 bg-white focus:outline-none"
          value={filters.od} onChange={e => setF('od', e.target.value)} />
        <span className="text-stone-400 text-xs">–</span>
        <input type="date" className="text-sm border border-stone-200 rounded-lg px-2 py-2 bg-white focus:outline-none"
          value={filters.do} onChange={e => setF('do', e.target.value)} />
      </div>

      {/* Souhrn */}
      {rows.length > 0 && (
        <div className="bg-white border-b border-stone-100 px-6 py-2 flex items-center gap-6 text-xs text-stone-500">
          <span>{rows.length} z {meta.total} zakázek</span>
          <span className="text-green-700">✓ Potvrzeno: {potvrzene}</span>
          <span className="text-amber-700">⟳ Čeká na akci: {cekaNa}</span>
          <span className="text-blue-700">Obrat: {formatCena(obrat)}</span>
        </div>
      )}

      {/* Tabulka */}
      <div className="px-6 py-4">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Žádné zakázky" desc="Vytvořte první zakázku tlačítkem nahoře." />
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  {['Zakázka','Klient','Typ','Stav','Datum','Cena'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-stone-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((z, i) => (
                  <tr
                    key={z.id}
                    onClick={() => navigate(`/zakazky/${z.id}`)}
                    className={`cursor-pointer hover:bg-stone-50 transition-colors ${i < rows.length-1 ? 'border-b border-stone-50' : ''}`}
                  >
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
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Stránkování */}
            {meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100 text-xs text-stone-500">
                <span>Strana {meta.page} z {meta.pages}</span>
                <div className="flex gap-2">
                  <button
                    disabled={meta.page <= 1}
                    onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                    className="px-3 py-1.5 border border-stone-200 rounded-md hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >← Předchozí</button>
                  <button
                    disabled={meta.page >= meta.pages}
                    onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                    className="px-3 py-1.5 border border-stone-200 rounded-md hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >Další →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
