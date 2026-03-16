import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { zakazkyApi, kalendarApi, notifikaceApi } from '../api';
import { PageHeader, StatCard, StavBadge, TypBadge, formatCena, formatDatum, Spinner } from '../components/ui';
import { Plus, ArrowRight, Bell, ClipboardList, TrendingUp, Calendar, Users } from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const startOfYear = `${now.getFullYear()}-01-01`;
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const in30days = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const { data: zakazkyData, isLoading } = useQuery({
    queryKey: ['zakazky-dashboard'],
    queryFn: () => zakazkyApi.list({ limit: 200 }),
  });

  const { data: kalData } = useQuery({
    queryKey: ['kalendar-dashboard'],
    queryFn: () => kalendarApi.list({ od: today, doo: in30days }),
  });

  const { data: notifData } = useQuery({
    queryKey: ['notifikace'],
    queryFn: () => notifikaceApi.list(),
    refetchInterval: 30_000,
  });

  const zakazky      = zakazkyData?.data?.data || [];
  const upcoming     = kalData?.data?.data?.slice(0, 8) || [];
  const notifications = notifData?.data?.data || [];
  const unreadNotifs = notifData?.data?.unread || 0;

  // Stats
  const novePoptavky   = zakazky.filter(z => z.stav === 'nova_poptavka').length;
  const cekaNaAkci     = zakazky.filter(z => ['nabidka_pripravena', 'nabidka_odeslana', 'ceka_na_vyjadreni'].includes(z.stav)).length;
  const potvrzenoLetos = zakazky.filter(z => z.stav === 'potvrzeno' && z.datum_akce >= startOfYear).length;
  const obratMesic     = zakazky
    .filter(z => z.datum_akce >= today && z.datum_akce <= endOfMonth && ['potvrzeno', 've_priprave', 'realizovano', 'uzavreno'].includes(z.stav))
    .reduce((s, z) => s + parseFloat(z.cena_celkem || 0), 0);

  // Pipeline
  const PIPELINE = [
    { stav: 'nova_poptavka',      label: 'Nová poptávka',     color: 'bg-stone-400' },
    { stav: 'rozpracovano',       label: 'Rozpracováno',      color: 'bg-blue-400' },
    { stav: 'nabidka_pripravena', label: 'Nabídka připravena', color: 'bg-amber-400' },
    { stav: 'nabidka_odeslana',   label: 'Nabídka odeslána',  color: 'bg-orange-400' },
    { stav: 'ceka_na_vyjadreni',  label: 'Čeká na vyjádření', color: 'bg-violet-400' },
    { stav: 'potvrzeno',          label: 'Potvrzeno',         color: 'bg-emerald-400' },
  ];
  const pipelineCounts = PIPELINE.map(p => ({ ...p, count: zakazky.filter(z => z.stav === p.stav).length }));
  const maxPipeline = Math.max(...pipelineCounts.map(p => p.count), 1);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <button
            onClick={() => navigate('/zakazky/nova')}
            className="inline-flex items-center gap-1.5 bg-stone-900 text-white text-xs font-medium px-3 py-2 rounded-md hover:bg-stone-800 transition-colors"
          >
            <Plus size={13} /> Nová zakázka
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Nové poptávky" value={novePoptavky} color={novePoptavky > 0 ? 'amber' : undefined} />
            <StatCard label="Čeká na akci" value={cekaNaAkci} color={cekaNaAkci > 0 ? 'amber' : undefined} />
            <StatCard label="Potvrzeno letos" value={potvrzenoLetos} color="green" />
            <StatCard label="Obrat tento měsíc" value={formatCena(obratMesic)} color="blue" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Upcoming events */}
            <div className="bg-white rounded-xl border border-stone-200">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
                <span className="text-sm font-semibold text-stone-800 flex items-center gap-2">
                  <Calendar size={15} className="text-stone-400" /> Nadcházející akce (30 dní)
                </span>
                <button onClick={() => navigate('/kalendar')}
                  className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors">
                  Kalendář <ArrowRight size={11} />
                </button>
              </div>
              <div className="divide-y divide-stone-50">
                {upcoming.map(e => {
                  const d = new Date(e.datum_akce + 'T00:00:00');
                  const isToday = e.datum_akce === today;
                  return (
                    <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                      className={`flex gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors ${isToday ? 'bg-blue-50/30' : ''}`}>
                      <div className={`rounded-lg px-2.5 py-1.5 text-center min-w-[44px] flex-shrink-0 ${isToday ? 'bg-blue-600' : 'bg-stone-100'}`}>
                        <div className={`text-sm font-semibold leading-none ${isToday ? 'text-white' : 'text-stone-800'}`}>{d.getDate()}</div>
                        <div className={`text-xs uppercase mt-0.5 ${isToday ? 'text-blue-200' : 'text-stone-500'}`}>
                          {d.toLocaleString('cs-CZ', { month: 'short' })}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-800 truncate">{e.nazev}</div>
                        <div className="text-xs text-stone-400 mt-0.5 truncate">
                          {e.misto || ''}{e.misto && e.pocet_hostu ? ' · ' : ''}{e.pocet_hostu ? `${e.pocet_hostu} hostů` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <TypBadge typ={e.typ} />
                        <StavBadge stav={e.stav} />
                      </div>
                    </div>
                  );
                })}
                {!upcoming.length && (
                  <div className="py-10 text-center text-sm text-stone-400">Žádné nadcházející akce</div>
                )}
              </div>
            </div>

            {/* Pipeline */}
            {!isLoading && zakazky.length > 0 && (
              <div className="bg-white rounded-xl border border-stone-200 px-5 py-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-stone-800 flex items-center gap-2">
                    <TrendingUp size={15} className="text-stone-400" /> Zakázky v pipeline
                  </span>
                  <button onClick={() => navigate('/zakazky')}
                    className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors">
                    Všechny <ArrowRight size={11} />
                  </button>
                </div>
                <div className="space-y-2.5">
                  {pipelineCounts.filter(p => p.count > 0).map(p => (
                    <div key={p.stav} className="flex items-center gap-3">
                      <div className="text-xs text-stone-500 w-40 truncate flex-shrink-0">{p.label}</div>
                      <div className="flex-1 bg-stone-100 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${p.color}`}
                          style={{ width: `${(p.count / maxPipeline) * 100}%` }} />
                      </div>
                      <div className="text-xs font-semibold text-stone-700 w-6 text-right">{p.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Notifications */}
            <div className="bg-white rounded-xl border border-stone-200">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
                <span className="text-sm font-semibold text-stone-800 flex items-center gap-2">
                  <Bell size={15} className="text-stone-400" />
                  Notifikace
                  {unreadNotifs > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">{unreadNotifs > 99 ? '99+' : unreadNotifs}</span>
                  )}
                </span>
              </div>
              <div className="divide-y divide-stone-50">
                {notifications.slice(0, 6).map(n => (
                  <div key={n.id}
                    onClick={() => n.odkaz && navigate(n.odkaz)}
                    className={`px-4 py-3 ${n.odkaz ? 'cursor-pointer hover:bg-stone-50' : ''} ${!n.procitana ? 'bg-blue-50/20' : ''}`}>
                    <div className="flex items-start gap-2">
                      {!n.procitana && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
                      <div className={!n.procitana ? '' : 'ml-3.5'}>
                        <div className="text-xs font-medium text-stone-800 line-clamp-2">{n.titulek}</div>
                        {n.zprava && <div className="text-xs text-stone-400 mt-0.5 truncate">{n.zprava}</div>}
                      </div>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="py-8 text-center text-xs text-stone-400">Žádné notifikace</div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-xl border border-stone-200 px-5 py-4">
              <div className="text-sm font-semibold text-stone-800 mb-3">Rychlé akce</div>
              <div className="space-y-1">
                {[
                  { icon: Plus,          label: 'Nová zakázka',    path: '/zakazky/nova' },
                  { icon: ClipboardList, label: 'Všechny zakázky', path: '/zakazky' },
                  { icon: Calendar,      label: 'Kalendář',        path: '/kalendar' },
                  { icon: Users,         label: 'Klienti',         path: '/klienti' },
                ].map(a => (
                  <button key={a.path} onClick={() => navigate(a.path)}
                    className="w-full flex items-center gap-2.5 text-sm px-3 py-2.5 rounded-lg hover:bg-stone-50 transition-colors text-left">
                    <a.icon size={15} className="text-stone-400 flex-shrink-0" />
                    <span className="text-stone-700">{a.label}</span>
                    <ArrowRight size={11} className="ml-auto text-stone-300" />
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
