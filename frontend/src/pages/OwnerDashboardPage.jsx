import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { reportyApi } from '../api';
import { PageHeader, Spinner, formatCena } from '../components/ui';

function MetricCard({ icon: Icon, title, value, sub, tone = 'brand' }) {
  const tones = {
    brand: 'from-brand-50 to-white text-brand-700 border-brand-100',
    emerald: 'from-emerald-50 to-white text-emerald-700 border-emerald-100',
    amber: 'from-amber-50 to-white text-amber-700 border-amber-100',
    rose: 'from-rose-50 to-white text-rose-700 border-rose-100',
    stone: 'from-stone-50 to-white text-stone-700 border-stone-200',
  };

  return (
    <div className={`rounded-3xl border bg-gradient-to-br ${tones[tone]} p-5 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
          <Icon size={19} />
        </div>
        <ArrowUpRight size={15} className="opacity-35" />
      </div>
      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">{title}</div>
        <div className="mt-1 text-3xl font-bold text-stone-950">{value}</div>
        {sub && <div className="mt-1 text-sm text-stone-500">{sub}</div>}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children, accent = 'bg-brand-500' }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <span className={`mt-1 h-9 w-1.5 rounded-full ${accent}`} />
        <div>
          <h2 className="text-base font-bold text-stone-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function LineItem({ label, value, tone = 'text-stone-900' }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 px-4 py-3">
      <span className="text-sm text-stone-500">{label}</span>
      <span className={`text-sm font-bold ${tone}`}>{value}</span>
    </div>
  );
}

function ProgressBar({ value, tone = 'bg-brand-600' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
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
  const pipeline = summary.pipeline || {};
  const cashflow = summary.cashflow || {};
  const profitability = summary.profitability || {};
  const staff = summary.staff || {};
  const notifications = summary.notifications || {};
  const marginPct = Number(profitability.marze_procent || 0);
  const unpaidTotal = Number(cashflow.unpaid_total || 0);
  const overdueTotal = Number(cashflow.overdue_total || 0);
  const urgentCount = Number(cashflow.overdue_count || 0)
    + Number(staff.unstaffed_events || 0)
    + Number(notifications.unread_notifications || 0);

  return (
    <div className="min-h-full bg-gradient-to-br from-stone-50 via-white to-brand-50/30">
      <PageHeader
        title="Majitelský přehled"
        subtitle="Rychlý executive pohled na zakázky, cashflow, marže, personál a urgentní provozní položky."
      />

      <div className="px-8 pb-8 space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-stone-950 text-white shadow-xl shadow-stone-900/10">
          <div className="relative p-7">
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-brand-500/20 blur-3xl" />
            <div className="absolute bottom-0 right-32 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
            <div className="relative grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                  <CheckCircle2 size={13} />
                  Stav firmy dnes
                </div>
                <h2 className="mt-4 text-3xl font-bold tracking-tight">
                  {urgentCount > 0 ? `${urgentCount} věcí čeká na pozornost` : 'Provoz vypadá klidně'}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
                  Sledujeme peníze, poptávky, marži a kapacitu týmu v jednom rychlém provozním pohledu.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-xs text-white/55">Po splatnosti</div>
                  <div className="mt-1 text-xl font-bold">{cashflow.overdue_count || 0}</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-xs text-white/55">Bez posádky</div>
                  <div className="mt-1 text-xl font-bold">{staff.unstaffed_events || 0}</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="text-xs text-white/55">Notifikace</div>
                  <div className="mt-1 text-xl font-bold">{notifications.unread_notifications || 0}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Briefcase} title="Zakázky" value={pipeline.total || 0} sub={`${pipeline.akce_30_dni || 0} akcí v dalších 30 dnech`} />
          <MetricCard icon={BarChart3} title="Otevřené nabídky" value={pipeline.otevrene_nabidky || 0} sub={`${pipeline.nove_poptavky || 0} nových poptávek`} tone="emerald" />
          <MetricCard icon={Wallet} title="Nezaplaceno" value={formatCena(unpaidTotal)} sub={`${cashflow.unpaid_count || 0} faktur`} tone={unpaidTotal > 0 ? 'amber' : 'stone'} />
          <MetricCard icon={AlertTriangle} title="Po splatnosti" value={formatCena(overdueTotal)} sub={`${cashflow.overdue_count || 0} faktur`} tone={overdueTotal > 0 ? 'rose' : 'stone'} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
          <Panel title="Profitabilita" subtitle="Hrubý finanční pohled přes nestornované zakázky" accent="bg-emerald-500">
            <div className="space-y-4">
              <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm text-stone-500">Aktuální marže</div>
                    <div className="mt-1 text-4xl font-bold text-emerald-700">{marginPct} %</div>
                  </div>
                  <TrendingUp className="text-emerald-600" size={32} />
                </div>
                <div className="mt-4">
                  <ProgressBar value={marginPct} tone={marginPct >= 25 ? 'bg-emerald-600' : 'bg-amber-500'} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <LineItem label="Obrat" value={formatCena(profitability.obrat || 0)} />
                <LineItem label="Náklady" value={formatCena(profitability.naklady || 0)} />
                <LineItem label="Nízké marže" value={`${profitability.low_margin_count || 0} zakázek`} tone="text-amber-700" />
                <LineItem label="Hrubý výsledek" value={formatCena((Number(profitability.obrat || 0) - Number(profitability.naklady || 0)))} tone="text-emerald-700" />
              </div>
            </div>
          </Panel>

          <Panel title="Cashflow" subtitle="Faktury, které mohou blokovat peníze" accent="bg-amber-500">
            <div className="space-y-3">
              <LineItem label="Nezaplacené faktury" value={`${cashflow.unpaid_count || 0}`} />
              <LineItem label="Nezaplaceno celkem" value={formatCena(unpaidTotal)} tone="text-amber-700" />
              <LineItem label="Faktury po splatnosti" value={`${cashflow.overdue_count || 0}`} tone="text-red-700" />
              <LineItem label="Po splatnosti celkem" value={formatCena(overdueTotal)} tone="text-red-700" />
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {overdueTotal > 0 ? 'Doporučení: projít upomínky a největší položky po splatnosti.' : 'Žádná kritická položka po splatnosti.'}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Pipeline" subtitle="Co se mění v obchodním toku" accent="bg-brand-500">
            <div className="space-y-3">
              <LineItem label="Nové poptávky" value={pipeline.nove_poptavky || 0} />
              <LineItem label="Otevřené nabídky" value={pipeline.otevrene_nabidky || 0} />
              <LineItem label="Potvrzeno / příprava" value={pipeline.potvrzene_a_priprava || 0} tone="text-emerald-700" />
              <LineItem label="Akce do 30 dní" value={pipeline.akce_30_dni || 0} />
            </div>
          </Panel>

          <Panel title="Personál" subtitle="Kapacita pro nejbližší měsíc" accent="bg-rose-500">
            <div className="space-y-3">
              <LineItem label="Přiřazení lidé" value={staff.assigned_staff_30_days || 0} />
              <LineItem label="Akce bez posádky" value={staff.unstaffed_events || 0} tone={staff.unstaffed_events > 0 ? 'text-red-700' : 'text-emerald-700'} />
              <div className="rounded-2xl bg-stone-50 px-4 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <Users size={16} />
                  Kapacitní signál
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  {staff.unstaffed_events > 0 ? 'Některé potvrzené akce ještě nemají přiřazený tým.' : 'Nejbližší potvrzené akce mají pokrytý tým.'}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Operativa" subtitle="Upozornění a dnešní dohled" accent="bg-stone-800">
            <div className="space-y-3">
              <LineItem label="Nepřečtené notifikace" value={notifications.unread_notifications || 0} tone={notifications.unread_notifications > 0 ? 'text-amber-700' : 'text-emerald-700'} />
              <LineItem label="Nové za týden" value={notifications.unread_last_week || 0} />
              <div className="rounded-2xl bg-stone-950 px-4 py-4 text-white">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Bell size={16} />
                  Priorita
                </div>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Nejprve cashflow po splatnosti, potom akce bez personálu a nové poptávky.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white px-5 py-4 text-sm text-stone-500 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <CalendarDays size={16} className="text-brand-600" />
            <span>Dashboard se obnovuje automaticky každých 60 sekund.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
