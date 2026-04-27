import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';
import { EmptyState, Spinner } from '../components/ui';
import { BarChart2, Clock, Users } from 'lucide-react';

const MODULE_LABELS = {
  core: 'Jádro CRM',
  pro: 'Gastro',
  vouchers: 'Poukazy',
  venues: 'Prostory',
  faktury: 'Fakturace',
  kalendar: 'Kalendář',
  reporty: 'Reporty',
  dokumenty: 'Dokumenty',
  cenik: 'Ceníky',
  personal: 'Personál',
  archiv: 'Archiv',
  sablony: 'Šablony',
  email: 'E-mail',
  error_log: 'Error log',
  module_analytics: 'Analytika modulů',
};

function fmtDate(value) {
  return value ? new Date(value).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}

export function ModuleAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useQuery({
    queryKey: ['module-analytics', days],
    queryFn: () => analyticsApi.moduleUsageSummary({ days }),
  });
  const report = data?.data;
  const summary = report?.summary || [];
  const users = report?.users || [];
  const recent = report?.recent || [];
  const totalVisits = summary.reduce((sum, row) => sum + Number(row.visits || 0), 0);
  const activeUsers = new Set(users.map((row) => row.id || row.email).filter(Boolean)).size;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 size={20} className="text-stone-600" />
            <h1 className="text-xl font-bold text-stone-900">Analytika modulů</h1>
          </div>
          <p className="text-sm text-stone-400 mt-0.5">Super-admin přehled používání jednotlivých částí systému</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((value) => (
            <button key={value} onClick={() => setDays(value)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${days === value ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
              {value} dní
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : error ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          {error.response?.data?.error || 'Analytiku se nepodařilo načíst.'}
        </div>
      ) : !summary.length ? (
        <EmptyState icon={BarChart2} title="Zatím nejsou data" desc="Po pohybu uživatelů v systému se tady objeví přehled návštěv modulů." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Návštěvy modulů', value: totalVisits, icon: BarChart2 },
              { label: 'Aktivní uživatelé', value: activeUsers, icon: Users },
              { label: 'Sledované období', value: `${days} dní`, icon: Clock },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600"><Icon size={18} /></div>
                <div>
                  <div className="text-xs text-stone-400">{label}</div>
                  <div className="text-lg font-bold text-stone-900">{value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.85fr] gap-5">
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 font-semibold text-sm">Používání modulů</div>
              <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100 text-left text-xs text-stone-500">
                    <th className="px-4 py-2 font-medium">Modul</th>
                    <th className="px-4 py-2 font-medium text-right">Návštěvy</th>
                    <th className="px-4 py-2 font-medium text-right">Uživatelé</th>
                    <th className="px-4 py-2 font-medium">Naposledy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {summary.map((row) => (
                    <tr key={row.module_key} className="text-sm">
                      <td className="px-4 py-3 font-medium text-stone-800">{MODULE_LABELS[row.module_key] || row.module_key}</td>
                      <td className="px-4 py-3 text-right text-stone-700">{Number(row.visits || 0).toLocaleString('cs-CZ')}</td>
                      <td className="px-4 py-3 text-right text-stone-700">{Number(row.users || 0).toLocaleString('cs-CZ')}</td>
                      <td className="px-4 py-3 text-stone-500">{fmtDate(row.last_used_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-5">
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 font-semibold text-sm">Nejaktivnější uživatelé</div>
                <div className="divide-y divide-stone-50">
                  {users.map((row) => (
                    <div key={row.id || row.email || 'anonymous'} className="px-4 py-3 flex justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-stone-800">{[row.jmeno, row.prijmeni].filter(Boolean).join(' ') || row.email || 'Neznámý uživatel'}</div>
                        <div className="text-xs text-stone-400">{row.email || '—'} · {row.modules_used} modulů</div>
                      </div>
                      <div className="text-sm font-semibold text-stone-900">{row.visits}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 font-semibold text-sm">Poslední aktivita</div>
                <div className="divide-y divide-stone-50 max-h-[420px] overflow-auto">
                  {recent.map((row, index) => (
                    <div key={`${row.created_at}-${index}`} className="px-4 py-3">
                      <div className="text-sm font-medium text-stone-800">{MODULE_LABELS[row.module_key] || row.module_key}</div>
                      <div className="text-xs text-stone-400 mt-0.5">{row.path} · {fmtDate(row.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ModuleAnalyticsPage;
