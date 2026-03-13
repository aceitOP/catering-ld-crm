import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, Users, FileText,
  Calendar, UserCheck, FolderOpen, Tag, Settings, LogOut, ChevronRight
} from 'lucide-react';

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/zakazky',    label: 'Zakázky',      icon: ClipboardList },
  { to: '/klienti',    label: 'Klienti',      icon: Users },
  { to: '/nabidky',    label: 'Nabídky',      icon: FileText },
  { to: '/kalendar',   label: 'Kalendář',     icon: Calendar },
  { to: '/personal',   label: 'Personál',     icon: UserCheck },
  { to: '/dokumenty',  label: 'Dokumenty',    icon: FolderOpen },
  { to: '/cenik',      label: 'Ceníky',       icon: Tag },
  { to: '/nastaveni',  label: 'Nastavení',    icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-stone-900 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-stone-700/50">
          <div className="text-white font-semibold text-sm tracking-wide">
            Catering <span className="text-stone-400 font-normal">LD</span>
          </div>
          <div className="text-stone-500 text-xs mt-0.5">CRM systém</div>
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
                    ? 'bg-stone-700 text-white font-medium'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                }`
              }
            >
              <Icon size={15} className="flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-stone-700/50">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md">
            <div className="w-7 h-7 rounded-full bg-stone-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
              {user?.jmeno?.[0]}{user?.prijmeni?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-stone-200 text-xs font-medium truncate">
                {user?.jmeno} {user?.prijmeni}
              </div>
              <div className="text-stone-500 text-xs capitalize">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-stone-500 hover:text-stone-300 transition-colors"
              title="Odhlásit se"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
