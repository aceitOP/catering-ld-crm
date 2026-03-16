import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { zakazkyApi, kalendarApi, notifikaceApi } from '../api';
import { PageHeader, StatCard, StavBadge, TypBadge, formatCena, Spinner } from '../components/ui';
import { Plus, ArrowRight, Bell, ClipboardList, TrendingUp, Calendar, Users, Inbox, DollarSign } from 'lucide-react';

// Timeline helpers
const timeToMin  = (t) => { if (!t) return null; const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); };
const MIN_START  = 6 * 60;
const MIN_RANGE  = 18 * 60;
const HOUR_MARKS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
const TYP_CHIP   = {
  svatba:        'bg-blue-100 text-blue-700',
  soukroma_akce: 'bg-orange-100 text-orange-700',
  firemni_akce:  'bg-emerald-100 text-emerald-700',
  zavoz:         'bg-violet-100 text-violet-700',
  bistro:        'bg-amber-100 text-amber-700',
};
const TYP_DOT = {
  svatba: 'bg-blue-500', soukroma_akce: 'bg-orange-500',
  firemni_akce: 'bg-emerald-500', zavoz: 'bg-violet-500', bistro: 'bg-amber-500',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const now      = new Date();
  const today    = now.toISOString().slice(0, 10);
  const startOfYear = `${now.getFullYear()}-01-01`;
  const endOfMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const in30days    = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const nowPct      = ((now.getHours() * 60 + now.getMinutes() - MIN_START) / MIN_RANGE) * 100;

  const { data: zakazkyData, isLoading } = useQuery({
    queryKey: ['zakazky-dashboard'],
    queryFn:  () => zakazkyApi.list({ limit: 200 }),
  });
  const { data: kalData } = useQuery({
    queryKey: ['kalendar-dashboard'],
    queryFn:  () => kalendarApi.list({ od: today, doo: in30days }),
  });
  const { data: notifData } = useQuery({
    queryKey:       ['notifikace'],
    queryFn:        () => notifikaceApi.list(),
    refetchInterval: 30_000,
  });

  const zakazky       = zakazkyData?.data?.data || [];
  const upcoming      = kalData?.data?.data || [];
  const notifications = notifData?.data?.data || [];
  const unreadNotifs  = notifData?.data?.unread || 0;

  // Stats
  const novePoptavky   = zakazky.filter(z => z.stav === 'nova_poptavka').length;
  const cekaNaAkci     = zakazky.filter(z => ['nabidka_pripravena','nabidka_odeslana','ceka_na_vyjadreni'].includes(z.stav)).length;
  const potvrzenoLetos = zakazky.filter(z => z.stav === 'potvrzeno' && z.datum_akce >= startOfYear).length;
  const obratMesic     = zakazky
    .filter(z => z.datum_akce >= today && z.datum_akce <= endOfMonth && ['potvrzeno','ve_priprave','realizovano','uzavreno'].includes(z.stav))
    .reduce((s, z) => s + parseFloat(z.cena_celkem || 0), 0);

  // Pipeline
  const PIPELINE = [
    { stav: 'nova_poptavka',      label: 'Nová poptávka',      color: 'bg-stone-400' },
    { stav: 'rozpracovano',       label: 'Rozpracováno',       color: 'bg-blue-400' },
    { stav: 'nabidka_pripravena', label: 'Nabídka připravena', color: 'bg-amber-400' },
    { stav: 'nabidka_odeslana',   label: 'Nabídka odeslána',   color: 'bg-orange-400' },
    { stav: 'ceka_na_vyjadreni',  label: 'Čeká na vyjádření',  color: 'bg-violet-400' },
    { stav: 'potvrzeno',          label: 'Potvrzeno',          color: 'bg-emerald-400' },
  ];
  const pipelineCounts = PIPELINE.map(p => ({ ...p, count: zakazky.filter(z => z.stav === p.stav).length }));
  const maxPipeline    = Math.max(...pipelineCounts.map(p => p.count), 1);

  // Nearest day with events
  const nearestDate = upcoming[0]?.datum_akce ?? null;
  const nearestEvts = nearestDate
    ? [...upcoming.filter(e => e.datum_akce === nearestDate)]
        .sort((a, b) => (timeToMin(a.cas_zacatek) ?? 0) - (timeToMin(b.cas_zacatek) ?? 0))
    : [];
  const nearestD  = nearestDate ? new Date(nearestDate + 'T00:00:00') : null;
  const isTodayTl = nearestDate === today;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/klienti')}
              className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-semibold px-3 py-2.5 rounded-xl hover:bg-surface shadow-sm transition-all">
              <Plus size={13} /> Nový klient
            </button>
            <button onClick={() => navigate('/nabidky/nova')}
              className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-semibold px-3 py-2.5 rounded-xl hover:bg-surface shadow-sm transition-all">
              <Plus size={13} /> Nová nabídka
            </button>
            <button
              onClick={() => navigate('/zakazky/nova')}
              className="inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-brand-700 shadow-md shadow-brand-600/20 transition-all"
            >
              <Plus size={16} /> Nová zakázka
            </button>
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-6">
        {/* ── Stats ── */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size={24} /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard icon={Inbox}         label="Nové poptávky"    value={novePoptavky}            color={novePoptavky > 0 ? 'amber' : 'purple'} />
            <StatCard icon={ClipboardList} label="Čeká na akci"     value={cekaNaAkci}              color={cekaNaAkci > 0 ? 'amber' : 'blue'} />
            <StatCard icon={Users}         label="Potvrzeno letos"  value={potvrzenoLetos}          color="green" />
            <StatCard icon={DollarSign}    label="Obrat tento měsíc" value={formatCena(obratMesic)} color="blue" />
          </div>
        )}

        {/* ── Mini Timeline ── */}
        {nearestDate && nearestEvts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden overflow-x-auto">
            <div style={{ minWidth: '600px' }}>
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
                    <Calendar size={15} className="text-brand-600" />
                  </div>
                  {isTodayTl
                    ? 'Dnes'
                    : nearestD.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {isTodayTl && (
                    <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-1 rounded-lg">
                      {nearestD.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-400 font-medium">{nearestEvts.length} {nearestEvts.length === 1 ? 'akce' : 'akcí'}</span>
                  <button onClick={() => navigate('/kalendar')}
                    className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                    Detail <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              <div className="flex bg-surface/50 border-y border-stone-100">
                <div className="w-48 flex-shrink-0 border-r border-stone-100 px-5 py-2">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Akce</span>
                </div>
                <div className="flex-1 relative" style={{ height: '30px' }}>
                  {HOUR_MARKS.map(h => (
                    <div key={h}
                      style={{ left: `${((h * 60 - MIN_START) / MIN_RANGE) * 100}%` }}
                      className="absolute top-0 h-full border-l border-stone-200/70">
                      <span className="text-xs text-stone-400 pl-1.5 pt-1.5 inline-block leading-none font-medium">{h}:00</span>
                    </div>
                  ))}
                </div>
              </div>

              {nearestEvts.map(e => {
                const sMin     = timeToMin(e.cas_zacatek);
                const eMin     = timeToMin(e.cas_konec);
                const hasTimes = sMin !== null && eMin !== null && eMin > sMin;
                const barS     = hasTimes ? Math.max(sMin, MIN_START) : MIN_START;
                const barE     = hasTimes ? Math.min(eMin, MIN_START + MIN_RANGE) : MIN_START + MIN_RANGE;
                const leftPct  = ((barS - MIN_START) / MIN_RANGE) * 100;
                const widthPct = Math.max(((barE - barS) / MIN_RANGE) * 100, 0.8);
                return (
                  <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                    className="flex items-center min-h-[48px] border-b border-stone-50 last:border-b-0 hover:bg-surface/50 cursor-pointer group">
                    <div className="w-48 flex-shrink-0 border-r border-stone-100 px-5 py-2.5">
                      <div className="text-xs font-semibold text-stone-800 truncate">{e.nazev}</div>
                      <div className="mt-1"><StavBadge stav={e.stav} /></div>
                    </div>
                    <div className="flex-1 relative" style={{ height: '48px' }}>
                      {HOUR_MARKS.map(h => (
                        <div key={h}
                          style={{ left: `${((h * 60 - MIN_START) / MIN_RANGE) * 100}%` }}
                          className="absolute top-0 h-full border-l border-stone-100/70 pointer-events-none" />
                      ))}
                      {isTodayTl && nowPct >= 0 && nowPct <= 100 && (
                        <div style={{ left: `${nowPct}%` }}
                          className="absolute top-0 h-full border-l-2 border-accent/70 z-10 pointer-events-none" />
                      )}
                      <div
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        title={`${e.nazev}${hasTimes ? ` · ${e.cas_zacatek?.slice(0,5)}–${e.cas_konec?.slice(0,5)}` : ''}`}
                        className={`absolute top-1/2 -translate-y-1/2 rounded-lg flex items-center px-2.5 overflow-hidden transition-all group-hover:opacity-85
                          ${hasTimes ? 'h-8 shadow-sm' : 'h-2 opacity-40 rounded-full'}
                          ${TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700'}`}>
                        {hasTimes && (
                          <>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-2 ${TYP_DOT[e.typ] || 'bg-stone-400'}`} />
                            <span className="text-xs font-semibold truncate whitespace-nowrap">
                              {e.cas_zacatek?.slice(0,5)}–{e.cas_konec?.slice(0,5)}&nbsp;·&nbsp;{e.nazev}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Main two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Upcoming events */}
            <div className="bg-white rounded-2xl shadow-card">
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Calendar size={15} className="text-blue-600" />
                  </div>
                  Nadcházející akce
                  <span className="text-xs text-stone-400 font-medium">(30 dní)</span>
                </span>
                <button onClick={() => navigate('/kalendar')}
                  className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                  Kalendář <ArrowRight size={12} />
                </button>
              </div>
              <div className="divide-y divide-stone-50">
                {upcoming.slice(0, 8).map(e => {
                  const d       = new Date(e.datum_akce + 'T00:00:00');
                  const isToday = e.datum_akce === today;
                  return (
                    <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                      className={`flex gap-4 px-6 py-3.5 hover:bg-surface/50 cursor-pointer transition-colors ${isToday ? 'bg-brand-50/30' : ''}`}>
                      <div className={`rounded-xl px-3 py-2 text-center min-w-[48px] flex-shrink-0 ${isToday ? 'bg-brand-600 shadow-sm shadow-brand-600/30' : 'bg-surface'}`}>
                        <div className={`text-sm font-bold leading-none ${isToday ? 'text-white' : 'text-stone-800'}`}>{d.getDate()}</div>
                        <div className={`text-xs uppercase mt-0.5 font-semibold ${isToday ? 'text-brand-200' : 'text-stone-500'}`}>
                          {d.toLocaleString('cs-CZ', { month: 'short' })}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-stone-800 truncate">{e.nazev}</div>
                        <div className="text-xs text-stone-400 mt-0.5 truncate">
                          {e.misto || ''}{e.misto && e.pocet_hostu ? ' · ' : ''}{e.pocet_hostu ? `${e.pocet_hostu} hostů` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <TypBadge typ={e.typ} />
                        <StavBadge stav={e.stav} />
                      </div>
                    </div>
                  );
                })}
                {!upcoming.length && (
                  <div className="py-12 text-center text-sm text-stone-400 font-medium">Žádné nadcházející akce</div>
                )}
              </div>
            </div>

            {/* Pipeline */}
            {!isLoading && zakazky.length > 0 && (
              <div className="bg-white rounded-2xl shadow-card px-6 py-5">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <TrendingUp size={15} className="text-emerald-600" />
                    </div>
                    Zakázky v pipeline
                  </span>
                  <button onClick={() => navigate('/zakazky')}
                    className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                    Všechny <ArrowRight size={12} />
                  </button>
                </div>
                <div className="space-y-3">
                  {pipelineCounts.filter(p => p.count > 0).map(p => (
                    <div key={p.stav} className="flex items-center gap-3">
                      <div className="text-xs text-stone-500 w-40 truncate flex-shrink-0 font-medium">{p.label}</div>
                      <div className="flex-1 bg-surface rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full transition-all ${p.color}`}
                          style={{ width: `${(p.count / maxPipeline) * 100}%` }} />
                      </div>
                      <div className="text-xs font-bold text-stone-700 w-6 text-right">{p.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Notifications */}
            <div className="bg-white rounded-2xl shadow-card">
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Bell size={15} className="text-accent" />
                  </div>
                  Notifikace
                  {unreadNotifs > 0 && (
                    <span className="bg-accent text-white text-[10px] font-bold rounded-full px-2 py-0.5 leading-none">
                      {unreadNotifs > 99 ? '99+' : unreadNotifs}
                    </span>
                  )}
                </span>
              </div>
              <div className="divide-y divide-stone-50">
                {notifications.slice(0, 6).map(n => (
                  <div key={n.id}
                    onClick={() => n.odkaz && navigate(n.odkaz)}
                    className={`px-5 py-3 ${n.odkaz ? 'cursor-pointer hover:bg-surface/50' : ''} ${!n.procitana ? 'bg-brand-50/30' : ''} transition-colors`}>
                    <div className="flex items-start gap-2.5 min-w-0">
                      {!n.procitana && <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />}
                      <div className={`min-w-0 overflow-hidden ${!n.procitana ? '' : 'ml-4'}`}>
                        <div className="text-xs font-semibold text-stone-800 line-clamp-2">{n.titulek}</div>
                        {n.zprava && <div className="text-xs text-stone-400 mt-0.5 truncate">{n.zprava}</div>}
                      </div>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="py-10 text-center text-xs text-stone-400 font-medium">Žádné notifikace</div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl shadow-card px-5 py-5">
              <div className="text-sm font-bold text-stone-800 mb-4">Rychlé akce</div>
              <div className="space-y-1">
                {[
                  { icon: Plus,          label: 'Nová zakázka',    path: '/zakazky/nova', color: 'bg-brand-50 text-brand-600' },
                  { icon: ClipboardList, label: 'Všechny zakázky', path: '/zakazky',      color: 'bg-blue-50 text-blue-600' },
                  { icon: Calendar,      label: 'Kalendář',        path: '/kalendar',     color: 'bg-emerald-50 text-emerald-600' },
                  { icon: Users,         label: 'Klienti',         path: '/klienti',      color: 'bg-orange-50 text-orange-600' },
                ].map(a => (
                  <button key={a.path} onClick={() => navigate(a.path)}
                    className="w-full flex items-center gap-3 text-sm px-3 py-3 rounded-xl hover:bg-surface transition-all text-left group">
                    <div className={`w-8 h-8 rounded-xl ${a.color} flex items-center justify-center flex-shrink-0`}>
                      <a.icon size={15} />
                    </div>
                    <span className="text-stone-700 font-medium">{a.label}</span>
                    <ArrowRight size={13} className="ml-auto text-stone-300 group-hover:text-brand-600 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
