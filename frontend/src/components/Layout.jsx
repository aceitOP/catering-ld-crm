import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, Users, FileText,
  Calendar, UserCheck, FolderOpen, Tag, Settings, LogOut, BarChart2,
  Bell, X, Globe, Info, Trash2, CheckCheck, Inbox,
} from 'lucide-react';
import { APP_VERSION, CHANGELOG } from '../data/changelog';
import { notifikaceApi, zakazkyApi } from '../api';

// ── Changelog type badges ────────────────────────────────────
const TYPE_STYLE = {
  new:         { label: 'Nové',        cls: 'bg-emerald-100 text-emerald-700' },
  improvement: { label: 'Vylepšení',   cls: 'bg-blue-100 text-blue-700' },
  fix:         { label: 'Oprava',      cls: 'bg-orange-100 text-orange-700' },
  security:    { label: 'Bezpečnost',  cls: 'bg-red-100 text-red-700' },
};

// ── Notification type config ─────────────────────────────────
const NOTIF_TYPE = {
  nova_zakazka:  { icon: ClipboardList, bg: 'bg-blue-100',   color: 'text-blue-600'   },
  nova_nabidka:  { icon: FileText,      bg: 'bg-purple-100', color: 'text-purple-600' },
  nova_klient:   { icon: Users,         bg: 'bg-emerald-100',color: 'text-emerald-600'},
  nova_poptavka: { icon: Globe,         bg: 'bg-orange-100', color: 'text-orange-600' },
  termin:        { icon: Calendar,      bg: 'bg-yellow-100', color: 'text-yellow-600' },
  system:        { icon: Info,          bg: 'bg-stone-100',  color: 'text-stone-500'  },
};

function timeAgo(ts) {
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60)    return 'právě teď';
  if (s < 3600)  return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} hod`;
  if (s < 604800)return `${Math.floor(s / 86400)} d`;
  return new Date(ts).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

// ── Nav items ────────────────────────────────────────────────
const NAV = [
  { to: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/poptavky',   label: 'Poptávky',     icon: Inbox },
  { to: '/zakazky',    label: 'Zakázky',      icon: ClipboardList },
  { to: '/klienti',    label: 'Klienti',      icon: Users },
  { to: '/nabidky',    label: 'Nabídky',      icon: FileText },
  { to: '/kalendar',   label: 'Kalendář',     icon: Calendar },
  { to: '/personal',   label: 'Personál',     icon: UserCheck },
  { to: '/dokumenty',  label: 'Dokumenty',    icon: FolderOpen },
  { to: '/cenik',      label: 'Ceníky',       icon: Tag },
  { to: '/reporty',    label: 'Reporty',      icon: BarChart2 },
  { to: '/nastaveni',  label: 'Nastavení',    icon: Settings },
];

// ── Brand logo ───────────────────────────────────────────────
function BrandLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 175.96 175.94" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="white" d="M49.83,8.82V125.99c.44,.02,.78,.05,1.12,.05,12.99,0,25.98,.2,38.97-.07,12.15-.25,23.11-4.29,32.82-11.61,5.61-4.23,10.28-9.32,14.01-15.27,.18-.3,.35-.6,.62-1.05h-59.33V.5c24.18-2.5,45.06,4.33,61.29,22.77,16.24,18.44,20.38,40.03,14.74,63.81h21.86c.91,33.63-21.01,75.19-67.41,86.34C59.78,185.12,14.29,154.81,2.86,110.06-8.8,64.41,16.84,23.86,49.83,8.82Zm-10.82,19.79C14.77,47.84,1.9,85.4,18.07,120.31c16.24,35.09,55.71,52.96,93.32,41.04,18.72-5.94,33.07-17.62,43.12-34.48,5.3-8.89,8.53-18.52,9.9-28.89h-1.12c-4.13,0-8.26,.03-12.39-.02-.84,0-1.22,.29-1.59,1.02-5.64,11.27-13.75,20.34-24.35,27.14-11.46,7.36-24.04,10.86-37.64,10.84-15.67-.03-31.34,0-47.02-.01-.41,0-.81-.03-1.28-.05V28.6Zm49.84,58.43c.32,.02,.53,.05,.74,.05,17.36,0,34.73,0,52.09,.02,.74,0,.93-.34,1.12-.93,3.13-9.85,3.69-19.85,1.44-29.93-3.66-16.39-12.89-28.82-27.19-37.48-7.25-4.39-15.19-6.79-23.61-7.64-1.52-.15-3.05-.18-4.59-.27V87.03Z"/>
    </svg>
  );
}

// ── Layout ───────────────────────────────────────────────────
export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [notifOpen, setNotifOpen]         = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Poptávky count – poll every 60 s
  const { data: poptavkyData } = useQuery({
    queryKey: ['poptavky'],
    queryFn:  () => zakazkyApi.list({ stav: 'nova_poptavka', limit: 1 }),
    refetchInterval: 60_000,
    select: (res) => res.data?.meta?.total ?? 0,
  });
  const poptavkyCount = poptavkyData ?? 0;

  // Notifications – poll every 30 s
  const { data: notifData } = useQuery({
    queryKey: ['notifikace'],
    queryFn:  notifikaceApi.list,
    refetchInterval: 30_000,
    select: (res) => res.data,
  });
  const notifications = notifData?.data    || [];
  const unread        = notifData?.unread  ?? 0;

  const readMut      = useMutation({ mutationFn: notifikaceApi.read,       onSuccess: () => qc.invalidateQueries(['notifikace']) });
  const readAllMut   = useMutation({ mutationFn: notifikaceApi.readAll,    onSuccess: () => qc.invalidateQueries(['notifikace']) });
  const deleteMut    = useMutation({ mutationFn: notifikaceApi.delete,     onSuccess: () => qc.invalidateQueries(['notifikace']) });
  const deleteReadMut= useMutation({ mutationFn: notifikaceApi.deleteRead, onSuccess: () => qc.invalidateQueries(['notifikace']) });

  const handleNotifClick = (n) => {
    if (!n.procitana) readMut.mutate(n.id);
    if (n.odkaz) { navigate(n.odkaz); setNotifOpen(false); }
  };

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-56 bg-brand-900 flex flex-col flex-shrink-0 shadow-xl z-30">

        {/* Logo + Bell */}
        <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={26} />
            <div>
              <div className="text-white font-semibold text-sm tracking-wide leading-tight">
                Catering <span className="text-accent-400 font-bold">LD</span>
              </div>
              <div className="text-brand-300 text-xs mt-0.5 font-normal">CRM systém</div>
            </div>
          </div>

          {/* Notification bell */}
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors text-brand-300 hover:text-white"
            title="Notifikace"
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm mb-0.5 transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white font-semibold border-l-2 border-accent-DEFAULT pl-[10px]'
                    : 'text-brand-200 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={15} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {to === '/poptavky' && poptavkyCount > 0 && (
                <span className="min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {poptavkyCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md">
            <div className="w-7 h-7 rounded-full bg-accent-DEFAULT flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {user?.jmeno?.[0]}{user?.prijmeni?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-medium truncate">{user?.jmeno} {user?.prijmeni}</div>
              <div className="text-brand-300 text-xs capitalize">{user?.role}</div>
            </div>
            <button onClick={handleLogout} className="text-brand-300 hover:text-white transition-colors" title="Odhlásit se">
              <LogOut size={14} />
            </button>
          </div>

          {/* Version badge */}
          <button
            onClick={() => setChangelogOpen(true)}
            className="w-full mt-1 px-2 py-1 flex items-center justify-center gap-1.5 rounded-md hover:bg-white/10 transition-colors group"
            title="Zobrazit historii změn"
          >
            <span className="text-brand-400 text-xs group-hover:text-brand-200 transition-colors">v{APP_VERSION}</span>
            <span className="text-brand-500 text-xs group-hover:text-brand-300 transition-colors">· Co je nového?</span>
          </button>
        </div>
      </aside>

      {/* ── Notification panel ── */}
      {notifOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />

          {/* Panel */}
          <div className="fixed top-0 left-56 h-full w-[360px] bg-white shadow-2xl z-30 flex flex-col border-r border-stone-200">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-stone-600" />
                <span className="text-sm font-semibold text-stone-800">Notifikace</span>
                {unread > 0 && (
                  <span className="text-xs bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded-full">{unread} nových</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={() => readAllMut.mutate()} title="Označit vše jako přečtené"
                    className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors">
                    <CheckCheck size={14} />
                  </button>
                )}
                {notifications.some(n => n.procitana) && (
                  <button onClick={() => deleteReadMut.mutate()} title="Smazat přečtené"
                    className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
                <button onClick={() => setNotifOpen(false)}
                  className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
                  <Bell size={32} className="text-stone-200 mb-3" />
                  <p className="text-sm font-medium text-stone-400">Žádné notifikace</p>
                  <p className="text-xs text-stone-300 mt-1">Nové zakázky, nabídky a poptávky se zobrazí zde</p>
                </div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {notifications.map(n => {
                    const cfg = NOTIF_TYPE[n.typ] || NOTIF_TYPE.system;
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={`flex gap-3 px-4 py-3.5 cursor-pointer hover:bg-stone-50 transition-colors group relative ${!n.procitana ? 'bg-blue-50/40' : ''}`}
                      >
                        {/* Unread dot */}
                        {!n.procitana && (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}

                        {/* Type icon */}
                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${cfg.bg}`}>
                          <Icon size={15} className={cfg.color} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pr-6">
                          <p className={`text-sm leading-snug ${!n.procitana ? 'font-semibold text-stone-800' : 'font-medium text-stone-700'}`}>
                            {n.titulek}
                          </p>
                          {n.zprava && (
                            <p className="text-xs text-stone-400 mt-0.5 line-clamp-2 whitespace-pre-line">{n.zprava}</p>
                          )}
                          <p className="text-xs text-stone-300 mt-1">{timeAgo(n.created_at)}</p>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={e => { e.stopPropagation(); deleteMut.mutate(n.id); }}
                          className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-600 transition-all"
                          title="Smazat"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Changelog modal ── */}
      {changelogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setChangelogOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <div>
                <h2 className="text-base font-semibold text-stone-800">Historie změn</h2>
                <p className="text-xs text-stone-400 mt-0.5">Catering LD CRM · aktuální verze {APP_VERSION}</p>
              </div>
              <button onClick={() => setChangelogOpen(false)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-6">
              {CHANGELOG.map((ver, vi) => (
                <div key={ver.version}>
                  <div className="flex items-baseline gap-3 mb-2.5">
                    <span className={`text-sm font-bold ${vi === 0 ? 'text-brand-900' : 'text-stone-700'}`}>v{ver.version}</span>
                    {vi === 0 && <span className="text-xs bg-accent-DEFAULT text-white font-semibold px-1.5 py-0.5 rounded-full">aktuální</span>}
                    <span className="text-xs text-stone-400 ml-auto">{ver.date}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {ver.changes.map((ch, ci) => {
                      const t = TYPE_STYLE[ch.type] || TYPE_STYLE.improvement;
                      return (
                        <li key={ci} className="flex items-start gap-2">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${t.cls}`}>{t.label}</span>
                          <span className="text-sm text-stone-600 leading-snug">{ch.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {vi < CHANGELOG.length - 1 && <div className="mt-4 border-b border-stone-100" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
