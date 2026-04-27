import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, Users, FileText, Building2,
  Calendar, UserCheck, FolderOpen, Tag, Settings, LogOut, BarChart2,
  Bell, X, Globe, Info, Trash2, CheckCheck, Inbox, Receipt, Archive,
  ChevronDown, BookCopy, Mail, Sun, Moon, Clock, ShieldAlert, Bug, FlaskConical, BookOpenText, Gift, Briefcase,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { APP_VERSION, CHANGELOG } from '../data/changelog';
import { isModuleEnabled } from '../data/moduleConfig';
import { errorLogApi, notifikaceApi, zakazkyApi } from '../api';
import { Btn, Modal } from './ui';
import toast from 'react-hot-toast';

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

// ── Nav items (multi-level) ────────────────────────────────────
const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/owner', label: 'Majitelský přehled', icon: Briefcase, capability: 'owner_dashboard.view' },
  { to: '/poukazy', label: 'Poukazy', icon: Gift, capability: 'vouchers.manage', moduleKey: 'vouchers' },
  { to: '/venues', label: 'Prostory', icon: Building2, moduleKey: 'venues' },
  {
    label: 'Catering', icon: ClipboardList,
    children: [
      { to: '/poptavky', label: 'Poptávky',  icon: Inbox,         badge: 'poptavky' },
      { to: '/nabidky',  label: 'Nabídky',   icon: FileText },
      { to: '/zakazky',  label: 'Zakázky',   icon: ClipboardList },
      { to: '/faktury',  label: 'Fakturace', icon: Receipt, moduleKey: 'faktury' },
      { to: '/kalendar', label: 'Kalendář',  icon: Calendar, moduleKey: 'kalendar' },
      { to: '/sablony',  label: 'Šablony',   icon: BookCopy, moduleKey: 'sablony' },
    ],
  },
  {
    label: 'Správa', icon: Users,
    children: [
      { to: '/klienti',  label: 'Klienti',   icon: Users },
      { to: '/personal', label: 'Personál',  icon: UserCheck, moduleKey: 'personal' },
      { to: '/archiv',   label: 'Archiv',    icon: Archive, moduleKey: 'archiv' },
    ],
  },
  {
    label: 'Pro', icon: FlaskConical, moduleKey: 'pro',
    children: [
      { to: '/suroviny',  label: 'Suroviny',  icon: FlaskConical, moduleKey: 'pro' },
      { to: '/receptury', label: 'Receptury', icon: BookOpenText, moduleKey: 'pro' },
    ],
  },
  {
    label: 'Data', icon: BarChart2,
    children: [
      { to: '/dokumenty', label: 'Dokumenty', icon: FolderOpen, moduleKey: 'dokumenty' },
      { to: '/cenik',     label: 'Ceníky',    icon: Tag, moduleKey: 'cenik' },
      { to: '/reporty',   label: 'Reporty',   icon: BarChart2, moduleKey: 'reporty' },
      { to: '/error-log', label: 'Error log', icon: ShieldAlert, superAdminOnly: true, moduleKey: 'error_log' },
    ],
  },
  { to: '/email', label: 'E-mail', icon: Mail, moduleKey: 'email' },
  { to: '/nastaveni', label: 'Nastavení', icon: Settings },
];

// ── Brand logo ───────────────────────────────────────────────
function BrandLogo({ size = 28, logoUrl = '' }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="Logo aplikace" className="w-full h-full object-contain" />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 175.96 175.94" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="white" d="M49.83,8.82V125.99c.44,.02,.78,.05,1.12,.05,12.99,0,25.98,.2,38.97-.07,12.15-.25,23.11-4.29,32.82-11.61,5.61-4.23,10.28-9.32,14.01-15.27,.18-.3,.35-.6,.62-1.05h-59.33V.5c24.18-2.5,45.06,4.33,61.29,22.77,16.24,18.44,20.38,40.03,14.74,63.81h21.86c.91,33.63-21.01,75.19-67.41,86.34C59.78,185.12,14.29,154.81,2.86,110.06-8.8,64.41,16.84,23.86,49.83,8.82Zm-10.82,19.79C14.77,47.84,1.9,85.4,18.07,120.31c16.24,35.09,55.71,52.96,93.32,41.04,18.72-5.94,33.07-17.62,43.12-34.48,5.3-8.89,8.53-18.52,9.9-28.89h-1.12c-4.13,0-8.26,.03-12.39-.02-.84,0-1.22,.29-1.59,1.02-5.64,11.27-13.75,20.34-24.35,27.14-11.46,7.36-24.04,10.86-37.64,10.84-15.67-.03-31.34,0-47.02-.01-.41,0-.81-.03-1.28-.05V28.6Zm49.84,58.43c.32,.02,.53,.05,.74,.05,17.36,0,34.73,0,52.09,.02,.74,0,.93-.34,1.12-.93,3.13-9.85,3.69-19.85,1.44-29.93-3.66-16.39-12.89-28.82-27.19-37.48-7.25-4.39-15.19-6.79-23.61-7.64-1.52-.15-3.05-.18-4.59-.27V87.03Z"/>
    </svg>
  );
}

// ── Layout ───────────────────────────────────────────────────
// ── Theme toggle ─────────────────────────────────────────────
function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const options = [
    { value: 'light', icon: Sun,   title: 'Světlý režim' },
    { value: 'auto',  icon: Clock, title: 'Automaticky (tmavý od 19:00)' },
    { value: 'dark',  icon: Moon,  title: 'Tmavý režim' },
  ];
  return (
    <div className="flex items-center gap-0.5 bg-stone-100 rounded-lg p-0.5">
      {options.map(({ value, icon: Icon, title }) => (
        <button
          key={value}
          onClick={() => setMode(value)}
          title={title}
          className={`flex items-center justify-center w-7 h-6 rounded-md transition-all ${
            mode === value
              ? 'bg-white shadow-sm text-brand-600'
              : 'text-stone-400 hover:text-stone-600'
          }`}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}

export default function Layout() {
  const { user, branding, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [notifOpen, setNotifOpen]         = useState(false);
  const [bugModalOpen, setBugModalOpen]   = useState(false);
  const [bugForm, setBugForm]             = useState({ message: '', description: '' });

  const location = useLocation();
  const isVisibleItem = (item) => (!item.moduleKey || isModuleEnabled(user?.modules, item.moduleKey))
    && (!item.adminOnly || user?.role === 'admin' || user?.role === 'majitel' || user?.role === 'super_admin')
    && (!item.superAdminOnly || user?.role === 'super_admin')
    && (!item.capability || user?.capabilities?.[item.capability]);
  const visibleNav = NAV
    .map((item) => item.children ? { ...item, children: item.children.filter(isVisibleItem) } : item)
    .filter((item) => (item.children ? item.children.length > 0 : isVisibleItem(item)));
  const [openSections, setOpenSections] = useState(() => {
    // Auto-open sections that contain the current route
    const open = new Set();
    visibleNav.forEach(item => {
      if (item.children?.some(c => location.pathname.startsWith(c.to))) {
        open.add(item.label);
      }
    });
    return open;
  });
  const toggleSection = (label) => setOpenSections(s => {
    const n = new Set(s);
    n.has(label) ? n.delete(label) : n.add(label);
    return n;
  });

  // Auto-open section when navigating to a child route
  useEffect(() => {
    visibleNav.forEach(item => {
      if (item.children?.some(c => location.pathname.startsWith(c.to))) {
        setOpenSections(s => { const n = new Set(s); n.add(item.label); return n; });
      }
    });
  }, [location.pathname, user?.modules, user?.role]);

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

  const readMut      = useMutation({ mutationFn: notifikaceApi.read,       onSuccess: () => qc.invalidateQueries({ queryKey: ['notifikace'] }) });
  const readAllMut   = useMutation({ mutationFn: notifikaceApi.readAll,    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifikace'] }) });
  const deleteMut    = useMutation({ mutationFn: notifikaceApi.delete,     onSuccess: () => qc.invalidateQueries({ queryKey: ['notifikace'] }) });
  const deleteReadMut= useMutation({ mutationFn: notifikaceApi.deleteRead, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifikace'] }) });
  const reportBugMut = useMutation({
    mutationFn: (payload) => errorLogApi.report(payload),
    onSuccess: () => {
      toast.success('Hlášení chyby bylo odesláno');
      closeBugModal();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Hlášení chyby se nepodařilo odeslat'),
  });

  const closeBugModal = () => {
    setBugModalOpen(false);
    setBugForm({ message: '', description: '' });
  };

  const handleNotifClick = (n) => {
    if (!n.procitana) readMut.mutate(n.id);
    if (n.odkaz) { navigate(n.odkaz); setNotifOpen(false); }
  };

  const submitBugReport = () => {
    const message = bugForm.message.trim();
    const description = bugForm.description.trim();
    if (message.length < 5) return;

    reportBugMut.mutate({
      message,
      description,
      current_path: `${location.pathname}${location.search}${location.hash}`,
      page_title: document.title,
      app_version: APP_VERSION,
      viewport: typeof window !== 'undefined'
        ? { width: window.innerWidth, height: window.innerHeight }
        : null,
      created_at_client: new Date().toISOString(),
    });
  };
  const canSubmitBugReport = bugForm.message.trim().length >= 5;

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[280px] bg-white flex flex-col flex-shrink-0 border-r border-stone-200/60 z-30">

        {/* Logo */}
        <div className="px-6 py-5 flex items-center justify-between">
          <NavLink to="/dashboard" className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center shadow-md shadow-brand-500/20 overflow-hidden">
              <BrandLogo size={22} logoUrl={branding?.app_logo_data_url} />
            </div>
            <div className="min-w-0">
              <div className="text-stone-900 font-bold text-[15px] tracking-tight leading-tight truncate">
                {branding?.app_title || 'Catering CRM'}
              </div>
              <div className="text-stone-400 text-xs mt-0.5 font-medium">CRM systém</div>
            </div>
          </NavLink>

          {/* Notification bell */}
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-2 rounded-xl hover:bg-surface transition-colors text-stone-400 hover:text-brand-600"
            title="Notifikace"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="mx-4 border-b border-stone-100" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {visibleNav.map((item) => {
            if (item.children) {
              const Icon = item.icon;
              const isOpen = openSections.has(item.label);
              const hasActive = item.children.some(c => location.pathname.startsWith(c.to));
              return (
                <div key={item.label} className="mb-1">
                  <button
                    onClick={() => toggleSection(item.label)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] transition-all duration-200 ${
                      hasActive && !isOpen
                        ? 'text-brand-600 font-semibold bg-brand-50'
                        : 'text-stone-500 hover:text-stone-800 hover:bg-surface font-medium'
                    }`}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.children.some(c => c.badge === 'poptavky') && poptavkyCount > 0 && !isOpen && (
                      <span className="min-w-[20px] h-5 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none">
                        {poptavkyCount}
                      </span>
                    )}
                    <ChevronDown size={14} className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="ml-4 mt-0.5 pl-3 border-l-2 border-stone-100 space-y-0.5">
                      {item.children.map(({ to, label, icon: CIcon, badge }) => (
                        <NavLink
                          key={to}
                          to={to}
                          className={({ isActive }) =>
                            `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-all duration-200 ${
                              isActive
                                ? 'bg-brand-600 text-white font-semibold shadow-sm shadow-brand-600/25'
                                : 'text-stone-500 hover:text-stone-800 hover:bg-surface font-medium'
                            }`
                          }
                        >
                          <CIcon size={15} className="flex-shrink-0" />
                          <span className="flex-1">{label}</span>
                          {badge === 'poptavky' && poptavkyCount > 0 && (
                            <span className="min-w-[20px] h-5 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 leading-none">
                              {poptavkyCount}
                            </span>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            // Top-level item (Dashboard, Nastavení)
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] mb-1 transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-600 text-white font-semibold shadow-md shadow-brand-600/25'
                      : 'text-stone-500 hover:text-stone-800 hover:bg-surface font-medium'
                  }`
                }
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-stone-100">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface transition-colors">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
              {user?.jmeno?.[0]}{user?.prijmeni?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-stone-800 text-sm font-semibold truncate">{user?.jmeno} {user?.prijmeni}</div>
              <div className="text-stone-400 text-xs capitalize">{user?.role}</div>
            </div>
            <button onClick={handleLogout} className="text-stone-400 hover:text-accent transition-colors p-1.5 rounded-lg hover:bg-stone-100" title="Odhlásit se">
              <LogOut size={16} />
            </button>
          </div>

          {/* Version badge + theme toggle */}
          <div className="mt-2 flex items-center gap-2 px-1">
            <button
              onClick={() => setChangelogOpen(true)}
              className="flex-1 px-2 py-2 flex items-center gap-1 rounded-xl hover:bg-surface transition-colors group"
              title="Zobrazit historii zm?n"
            >
              <span className="text-stone-400 text-xs font-medium group-hover:text-brand-600 transition-colors">v{APP_VERSION}</span>
            </button>
            <button
              onClick={() => setBugModalOpen(true)}
              className="px-2 py-2 flex items-center gap-1 rounded-xl hover:bg-surface transition-colors text-stone-400 hover:text-accent"
              title="Nahlasit chybu"
            >
              <Bug size={15} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <Modal
        open={bugModalOpen}
        onClose={closeBugModal}
        title="Nahlasit chybu"
        footer={(
          <>
            <Btn onClick={closeBugModal}>Zrušit</Btn>
            <Btn variant="primary" onClick={submitBugReport} disabled={reportBugMut.isPending || !canSubmitBugReport}>
              {reportBugMut.isPending ? 'Odesilam...' : 'Odeslat hlaseni'}
            </Btn>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-stone-50 border border-stone-200 px-4 py-3 text-xs text-stone-500">
            Odešleme hlášení spolu s aktuální URL stránky a verzí aplikace.
          </div>
          <div>
            <label className="block text-xs text-stone-500 font-semibold mb-1.5">Stručný popis chyby *</label>
            <input className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none" placeholder="Například: Při uložení zakázky se nic nestane" value={bugForm.message} maxLength={500} onChange={(e) => setBugForm((f) => ({ ...f, message: e.target.value }))} autoFocus />
            <div className="mt-1 text-[11px] text-stone-400 text-right">
              {bugForm.message.trim().length}/500
            </div>
          </div>
          <div>
            <label className="block text-xs text-stone-500 font-semibold mb-1.5">Co se stalo / jak chybu vyvolat</label>
            <textarea rows={5} className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none" placeholder="Popis kroku, co jsi cekal(a) a co aplikace udelala misto toho." value={bugForm.description} maxLength={5000} onChange={(e) => setBugForm((f) => ({ ...f, description: e.target.value }))} />
            <div className="mt-1 text-[11px] text-stone-400 text-right">
              {bugForm.description.length}/5000
            </div>
          </div>
          <div className="text-xs text-stone-400">
            Stranka: {location.pathname}{location.search}{location.hash}
          </div>
        </div>
      </Modal>

      {/* ── Notification panel ── */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
          <div className="fixed top-0 left-[280px] h-full w-[380px] bg-white shadow-2xl z-30 flex flex-col rounded-r-3xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
                  <Bell size={15} className="text-brand-600" />
                </div>
                <span className="text-sm font-bold text-stone-800">Notifikace</span>
                {unread > 0 && (
                  <span className="text-xs bg-accent/10 text-accent font-bold px-2 py-0.5 rounded-full">{unread} nových</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={() => readAllMut.mutate()} title="Označit vše jako přečtené"
                    className="p-2 hover:bg-surface rounded-xl text-stone-400 hover:text-brand-600 transition-colors">
                    <CheckCheck size={15} />
                  </button>
                )}
                {notifications.some(n => n.procitana) && (
                  <button onClick={() => deleteReadMut.mutate()} title="Smazat přečtené"
                    className="p-2 hover:bg-surface rounded-xl text-stone-400 hover:text-accent transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
                <button onClick={() => setNotifOpen(false)}
                  className="p-2 hover:bg-surface rounded-xl text-stone-400 hover:text-stone-600 transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
                  <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4">
                    <Bell size={28} className="text-stone-300" />
                  </div>
                  <p className="text-sm font-semibold text-stone-400">Žádné notifikace</p>
                  <p className="text-xs text-stone-300 mt-1.5">Nové zakázky, nabídky a poptávky se zobrazí zde</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {notifications.map(n => {
                    const cfg = NOTIF_TYPE[n.typ] || NOTIF_TYPE.system;
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={`flex gap-3 px-3 py-3 cursor-pointer rounded-xl hover:bg-surface transition-all group relative ${!n.procitana ? 'bg-brand-50/50' : ''}`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${cfg.bg}`}>
                          <Icon size={16} className={cfg.color} />
                        </div>
                        <div className="flex-1 min-w-0 pr-6">
                          <p className={`text-sm leading-snug ${!n.procitana ? 'font-semibold text-stone-800' : 'font-medium text-stone-600'}`}>
                            {n.titulek}
                          </p>
                          {n.zprava && (
                            <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{n.zprava}</p>
                          )}
                          <p className="text-xs text-stone-300 mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); deleteMut.mutate(n.id); }}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-all"
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
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-stone-100">
              <div>
                <h2 className="text-base font-bold text-stone-800">Historie změn</h2>
                <p className="text-xs text-stone-400 mt-0.5">Catering LD CRM · aktuální verze {APP_VERSION}</p>
              </div>
              <button onClick={() => setChangelogOpen(false)} className="p-2 hover:bg-surface rounded-xl text-stone-400 hover:text-stone-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 space-y-6">
              {CHANGELOG.map((ver, vi) => (
                <div key={ver.version}>
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className={`text-sm font-bold ${vi === 0 ? 'text-brand-600' : 'text-stone-700'}`}>v{ver.version}</span>
                    {vi === 0 && <span className="text-xs bg-brand-600 text-white font-semibold px-2 py-0.5 rounded-full">aktuální</span>}
                    <span className="text-xs text-stone-400 ml-auto">{ver.date}</span>
                  </div>
                  <ul className="space-y-2">
                    {ver.changes.map((ch, ci) => {
                      const t = TYPE_STYLE[ch.type] || TYPE_STYLE.improvement;
                      return (
                        <li key={ci} className="flex items-start gap-2">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5 ${t.cls}`}>{t.label}</span>
                          <span className="text-sm text-stone-600 leading-snug">{ch.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {vi < CHANGELOG.length - 1 && <div className="mt-5 border-b border-stone-100" />}
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
