import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, Bell, Briefcase, Receipt, Users } from 'lucide-react';
import { reportyApi } from '../api';
import { PageHeader, Spinner, formatCena } from '../components/ui';

function Card({ icon: Icon, title, value, sub }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon size={18} />
        </div>
        <div>
          <div className="text-xs font-medium text-stone-400">{title}</div>
          <div className="text-2xl font-bold text-stone-900">{value}</div>
          {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export default function OwnerDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['owner-dashboard'],
    queryFn: () => reportyApi.ownerSummary(),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  const summary = data?.data || {};

  return (
    <div>
      <PageHeader
        title="Majitelský přehled"
        subtitle="Rozšířený pohled na pipeline, cashflow, marže, personál, venue rizika a notifikace."
      />

      <div className="px-8 pb-8 space-y-6">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Card icon={Briefcase} title="Zakázky celkem" value={summary.pipeline?.total || 0} sub={`${summary.pipeline?.akce_30_dni || 0} akcí v dalších 30 dnech`} />
          <Card icon={BarChart3} title="Otevřené nabídky" value={summary.pipeline?.otevrene_nabidky || 0} sub={`${summary.pipeline?.nove_poptavky || 0} nových poptávek`} />
          <Card icon={Receipt} title="Nezaplaceno" value={summary.cashflow ? formatCena(summary.cashflow.unpaid_total) : '—'} sub={`${summary.cashflow?.unpaid_count || 0} faktur`} />
          <Card icon={AlertTriangle} title="Po splatnosti" value={summary.cashflow ? formatCena(summary.cashflow.overdue_total) : '—'} sub={`${summary.cashflow?.overdue_count || 0} faktur`} />
          <Card icon={Users} title="Personál 30 dní" value={summary.staff?.assigned_staff_30_days || 0} sub={`${summary.staff?.unstaffed_events || 0} akcí bez posádky`} />
          <Card icon={Bell} title="Nepřečtené notifikace" value={summary.notifications?.unread_notifications || 0} sub={`${summary.notifications?.unread_last_week || 0} za poslední týden`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-stone-900">Profitabilita</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-stone-500">Obrat</span><span className="font-semibold text-stone-900">{formatCena(summary.profitability?.obrat || 0)}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Náklady</span><span className="font-semibold text-stone-900">{formatCena(summary.profitability?.naklady || 0)}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Marže</span><span className="font-semibold text-emerald-700">{summary.profitability?.marze_procent || 0} %</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Nízké marže</span><span className="font-semibold text-amber-700">{summary.profitability?.low_margin_count || 0} zakázek</span></div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-stone-900">Venue rizika</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-stone-500">Stale venue u upcoming akcí</span><span className="font-semibold text-amber-700">{summary.venue?.stale_upcoming_venues || 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Varovné observation signály</span><span className="font-semibold text-stone-900">{summary.venue?.recurring_risk_signals || 0}</span></div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-stone-900">Pipeline</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-stone-500">Nové poptávky</span><span className="font-semibold text-stone-900">{summary.pipeline?.nove_poptavky || 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Otevřené nabídky</span><span className="font-semibold text-stone-900">{summary.pipeline?.otevrene_nabidky || 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Potvrzeno / příprava</span><span className="font-semibold text-stone-900">{summary.pipeline?.potvrzene_a_priprava || 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Akce do 30 dní</span><span className="font-semibold text-stone-900">{summary.pipeline?.akce_30_dni || 0}</span></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
