import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CalendarDays, FileText, FolderOpen, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClientPortalAuth } from '../context/ClientPortalContext';

export default function ClientPortalLayout() {
  const navigate = useNavigate();
  const { branding } = useAuth();
  const { clientUser, logout } = useClientPortalAuth();

  const items = [
    { to: '/portal', label: 'Zakázky', icon: CalendarDays, end: true },
    { to: '/portal/dokumenty', label: 'Dokumenty', icon: FolderOpen },
    { to: '/portal/faktury', label: 'Faktury', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Klientský portál</div>
            <div className="text-lg font-bold text-stone-900">{branding?.app_title || 'Catering CRM'}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-semibold text-stone-800">{clientUser?.primary_client?.firma || [clientUser?.primary_client?.jmeno, clientUser?.primary_client?.prijmeni].filter(Boolean).join(' ') || clientUser?.email}</div>
              <div className="text-xs text-stone-400">{clientUser?.email}</div>
            </div>
            <button
              type="button"
              onClick={() => { logout(); navigate('/portal/login'); }}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              <LogOut size={14} />
              Odhlásit
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-2 px-6 pb-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <item.icon size={14} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
