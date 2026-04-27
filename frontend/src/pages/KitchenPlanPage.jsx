import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { productionApi } from '../api';
import { EmptyState, Spinner, formatDatum } from '../components/ui';
import { ChefHat, Printer, CalendarDays, Users, Package, AlertTriangle } from 'lucide-react';

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function fmtQty(value, unit) {
  const number = Number(value || 0);
  const rounded = Math.round(number * 100) / 100;
  return `${rounded.toLocaleString('cs-CZ')} ${unit || ''}`.trim();
}

export function KitchenPlanPage() {
  const [filters, setFilters] = useState({ date_from: isoDate(0), date_to: isoDate(7) });
  const { data, isLoading, error } = useQuery({
    queryKey: ['kitchen-plan', filters],
    queryFn: () => productionApi.kitchenPlan(filters),
  });

  const plan = data?.data;
  const events = plan?.events || [];
  const items = plan?.production_items || [];
  const allergens = plan?.allergens || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ChefHat size={20} className="text-stone-600" />
            <h1 className="text-xl font-bold text-stone-900">Výrobní plán kuchyně</h1>
          </div>
          <p className="text-sm text-stone-400 mt-0.5">Souhrn zakázek, mise en place a alergenů pro vybrané období</p>
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white hover:bg-stone-50 print:hidden">
          <Printer size={14} /> Tisknout
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Od</label>
          <input type="date" className="border border-stone-200 rounded-lg px-3 py-2 text-sm" value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Do</label>
          <input type="date" className="border border-stone-200 rounded-lg px-3 py-2 text-sm" value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} />
        </div>
        {[
          ['Dnes', 0, 0],
          ['7 dní', 0, 7],
          ['14 dní', 0, 14],
        ].map(([label, from, to]) => (
          <button key={label} onClick={() => setFilters({ date_from: isoDate(from), date_to: isoDate(to) })} className="px-3 py-2 text-xs font-medium border border-stone-200 rounded-lg hover:bg-stone-50">
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : error ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          {error.response?.data?.error || 'Výrobní plán se nepodařilo načíst.'}
        </div>
      ) : !events.length ? (
        <EmptyState icon={ChefHat} title="Žádné zakázky v období" desc="Změňte datumový rozsah nebo přidejte zakázku s termínem akce." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Akce', value: plan.summary?.events_count || 0, icon: CalendarDays },
              { label: 'Hosté', value: plan.summary?.guests_count || 0, icon: Users },
              { label: 'Výrobní položky', value: plan.summary?.items_count || 0, icon: Package },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600"><Icon size={18} /></div>
                <div>
                  <div className="text-xs text-stone-400">{label}</div>
                  <div className="text-lg font-bold text-stone-900">{Number(value).toLocaleString('cs-CZ')}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 font-semibold text-sm">Zakázky v plánu</div>
              <div className="divide-y divide-stone-50">
                {events.map((event) => (
                  <div key={event.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link to={`/zakazky/${event.id}`} className="text-sm font-semibold text-stone-900 hover:text-brand-700">{event.cislo} · {event.nazev}</Link>
                        <div className="text-xs text-stone-400 mt-1">
                          {formatDatum(event.datum_akce)} {event.cas_zacatek || ''} · {event.pocet_hostu || event.sheet?.pocet_hostu || 0} hostů
                          {event.misto ? ` · ${event.misto}` : ''}
                        </div>
                      </div>
                      <Link to={`/zakazky/${event.id}/vyrobni-list`} className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50">Výrobní list</Link>
                    </div>
                    {event.error ? (
                      <div className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{event.error}</div>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(event.sheet?.sekce_b || []).slice(0, 6).map((item) => (
                          <div key={`${event.id}-${item.poradi}-${item.nazev}`} className="text-xs rounded-lg bg-stone-50 px-3 py-2 flex justify-between gap-3">
                            <span className="text-stone-700">{item.nazev}</span>
                            <span className="font-medium text-stone-900 whitespace-nowrap">{fmtQty(item.porce, item.jednotka)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 font-semibold text-sm">Souhrn mise en place</div>
                <div className="divide-y divide-stone-50 max-h-[560px] overflow-auto">
                  {items.map((item) => (
                    <div key={`${item.nazev}-${item.jednotka}-${item.kategorie}`} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-stone-800">{item.nazev}</div>
                        <div className="text-xs text-stone-400">{item.kategorie} · {item.zakazky?.length || 0} zak.</div>
                      </div>
                      <div className="text-sm font-semibold text-stone-900 whitespace-nowrap">{fmtQty(item.mnozstvi, item.jednotka)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="flex items-center gap-2 font-semibold text-sm mb-3"><AlertTriangle size={15} /> Alergeny</div>
                <div className="flex flex-wrap gap-2">
                  {allergens.length ? allergens.map((group) => (
                    <span key={group.alergen} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-100" title={(group.jidla || []).join(', ')}>
                      {group.alergen}
                    </span>
                  )) : <span className="text-xs text-stone-400">Bez detekovaných alergenů.</span>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default KitchenPlanPage;
