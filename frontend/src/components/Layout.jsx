import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, Users, FileText,
  Calendar, UserCheck, FolderOpen, Tag, Settings, LogOut,
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

// Brand logo – white version for dark sidebar
function BrandLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 175.96 175.94" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="white" d="M49.83,8.82V125.99c.44,.02,.78,.05,1.12,.05,12.99,0,25.98,.2,38.97-.07,12.15-.25,23.11-4.29,32.82-11.61,5.61-4.23,10.28-9.32,14.01-15.27,.18-.3,.35-.6,.62-1.05h-59.33V.5c24.18-2.5,45.06,4.33,61.29,22.77,16.24,18.44,20.38,40.03,14.74,63.81h21.86c.91,33.63-21.01,75.19-67.41,86.34C59.78,185.12,14.29,154.81,2.86,110.06-8.8,64.41,16.84,23.86,49.83,8.82Zm-10.82,19.79C14.77,47.84,1.9,85.4,18.07,120.31c16.24,35.09,55.71,52.96,93.32,41.04,18.72-5.94,33.07-17.62,43.12-34.48,5.3-8.89,8.53-18.52,9.9-28.89h-1.12c-4.13,0-8.26,.03-12.39-.02-.84,0-1.22,.29-1.59,1.02-5.64,11.27-13.75,20.34-24.35,27.14-11.46,7.36-24.04,10.86-37.64,10.84-15.67-.03-31.34,0-47.02-.01-.41,0-.81-.03-1.28-.05V28.6Zm49.84,58.43c.32,.02,.53,.05,.74,.05,17.36,0,34.73,0,52.09,.02,.74,0,.93-.34,1.12-.93,3.13-9.85,3.69-19.85,1.44-29.93-3.66-16.39-12.89-28.82-27.19-37.48-7.25-4.39-15.19-6.79-23.61-7.64-1.52-.15-3.05-.18-4.59-.27V87.03Z"/>
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-brand-900 flex flex-col flex-shrink-0 shadow-xl">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={26} />
            <div>
              <div className="text-white font-semibold text-sm tracking-wide leading-tight">
                Catering <span className="text-accent-400 font-bold">LD</span>
              </div>
              <div className="text-brand-300 text-xs mt-0.5 font-normal">CRM systém</div>
            </div>
          </div>
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
              {label}
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
              <div className="text-white text-xs font-medium truncate">
                {user?.jmeno} {user?.prijmeni}
              </div>
              <div className="text-brand-300 text-xs capitalize">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-brand-300 hover:text-white transition-colors"
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
