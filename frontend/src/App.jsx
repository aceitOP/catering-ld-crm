import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ClientPortalAuthProvider, useClientPortalAuth } from './context/ClientPortalContext';
import { nastaveniApi } from './api';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ZakazkyPage from './pages/ZakazkyPage';
import ZakazkaDetail from './pages/ZakazkaDetail';
import NovaZakazka from './pages/NovaZakazka';
import KlientiPage from './pages/KlientiPage';
import VenuesPage from './pages/VenuesPage';
import NabidkyPage from './pages/NabidkyPage';
import NabidkaEditor from './pages/NabidkaEditor';
import NovaNabidka from './pages/NovaNabidka';
import KalendarPage from './pages/KalendarPage';
import PersonalPage from './pages/PersonalPage';
import DokumentyPage from './pages/DokumentyPage';
import CenikPage from './pages/CenikPage';
import IngredientsPage from './pages/IngredientsPage';
import NastaveniPage from './pages/NastaveniPage';
import ReportPage from './pages/ReportPage';
import PoptavkyPage from './pages/PoptavkyPage';
import FakturyPage from './pages/FakturyPage';
import FakturaDetail from './pages/FakturaDetail';
import NovaFakturaPage from './pages/NovaFakturaPage';
import VyrobniListPage from './pages/VyrobniListPage';
import ClientProposalPage from './pages/ClientProposalPage';
import ArchivPage from './pages/ArchivPage';
import SablonyPage from './pages/SablonyPage';
import EmailPage from './pages/EmailPage';
import ErrorLogPage from './pages/ErrorLogPage';
import SetupWizardPage from './pages/SetupWizardPage';
import VenueDetailPage from './pages/VenueDetailPage';
import RecipesPage from './pages/RecipesPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import ClientPortalLoginPage from './pages/ClientPortalLoginPage';
import ClientPortalAuthPage from './pages/ClientPortalAuthPage';
import ClientPortalDashboardPage from './pages/ClientPortalDashboardPage';
import ClientPortalZakazkaPage from './pages/ClientPortalZakazkaPage';
import ClientPortalDokumentyPage from './pages/ClientPortalDokumentyPage';
import ClientPortalFakturyPage from './pages/ClientPortalFakturyPage';
import OwnerDashboardPage from './pages/OwnerDashboardPage';
import VouchersPage from './pages/VouchersPage';
import VoucherDetailPage from './pages/VoucherDetailPage';
import PublicVoucherPage from './pages/PublicVoucherPage';
import VoucherShopPage from './pages/VoucherShopPage';
import VoucherShopOrderPage from './pages/VoucherShopOrderPage';
import Layout from './components/Layout';
import AppErrorBoundary from './components/AppErrorBoundary';
import ClientPortalLayout from './components/ClientPortalLayout';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function FullscreenLoader({ text }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-stone-400 text-sm">{text}</div>
    </div>
  );
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullscreenLoader text="Načítám..." />;
  return user ? children : <Navigate to="/login" replace />;
}

function ModuleRoute({ moduleKey, children }) {
  const { loading, hasModule } = useAuth();
  if (loading) return null;
  return hasModule(moduleKey) ? children : <Navigate to="/dashboard" replace />;
}

function SuperAdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user?.role === 'super_admin' ? children : <Navigate to="/dashboard" replace />;
}

function SetupGuard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const setupQuery = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => nastaveniApi.setupStatus(),
    enabled: !loading && !!user && user.role === 'super_admin',
    select: (res) => res.data,
    staleTime: 10_000,
  });

  if (loading || (user?.role === 'super_admin' && setupQuery.isLoading)) {
    return <FullscreenLoader text="Připravuji instalaci..." />;
  }

  if (user?.role === 'super_admin' && !setupQuery.data?.completed && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  return children;
}

function SetupWizardRoute() {
  const { user, loading } = useAuth();
  const setupQuery = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => nastaveniApi.setupStatus(),
    enabled: !loading && !!user && user.role === 'super_admin',
    select: (res) => res.data,
    staleTime: 10_000,
  });

  if (loading || (user?.role === 'super_admin' && setupQuery.isLoading)) {
    return <FullscreenLoader text="Načítám setup wizard..." />;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'super_admin') return <Navigate to="/dashboard" replace />;
  if (setupQuery.data?.completed) return <Navigate to="/dashboard" replace />;

  return <SetupWizardPage />;
}

function ClientPortalRoute({ children }) {
  const { clientUser, loading } = useClientPortalAuth();
  if (loading) return <FullscreenLoader text="Načítám klientský portál..." />;
  return clientUser ? children : <Navigate to="/portal/login" replace />;
}

function OwnerRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user?.capabilities?.['owner_dashboard.view'] ? children : <Navigate to="/dashboard" replace />;
}

function App() {
  const isShopHost = typeof window !== 'undefined' && window.location.hostname.startsWith('shop.');
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <ClientPortalAuthProvider>
              <BrowserRouter>
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    style: { fontSize: '13px', background: '#2d1b69', color: '#fafaf9', borderRadius: '12px' },
                  }}
                />
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/shop" element={<VoucherShopPage />} />
                  <Route path="/shop/objednavka/:token" element={<VoucherShopOrderPage />} />
                  <Route path="/nabidka/:token" element={<ClientProposalPage />} />
                  <Route path="/voucher/:token" element={<PublicVoucherPage />} />
                  <Route path="/portal/login" element={<ClientPortalLoginPage />} />
                  <Route path="/portal/auth" element={<ClientPortalAuthPage />} />
                  <Route
                    path="/portal"
                    element={
                      <ClientPortalRoute>
                        <ClientPortalLayout />
                      </ClientPortalRoute>
                    }
                  >
                    <Route index element={<ClientPortalDashboardPage />} />
                    <Route path="zakazky/:id" element={<ClientPortalZakazkaPage />} />
                    <Route path="dokumenty" element={<ClientPortalDokumentyPage />} />
                    <Route path="faktury" element={<ClientPortalFakturyPage />} />
                  </Route>
                  <Route path="/setup" element={<PrivateRoute><SetupWizardRoute /></PrivateRoute>} />
                  <Route path="/" element={isShopHost ? <VoucherShopPage /> : <PrivateRoute><SetupGuard><Layout /></SetupGuard></PrivateRoute>}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="dashboard/owner" element={<OwnerRoute><OwnerDashboardPage /></OwnerRoute>} />
                    <Route path="poptavky" element={<PoptavkyPage />} />
                    <Route path="zakazky" element={<ZakazkyPage />} />
                    <Route path="zakazky/nova" element={<NovaZakazka />} />
                    <Route path="zakazky/:id" element={<ZakazkaDetail />} />
                    <Route path="zakazky/:id/vyrobni-list" element={<VyrobniListPage />} />
                    <Route path="klienti" element={<KlientiPage />} />
                    <Route path="venues" element={<ModuleRoute moduleKey="venues"><VenuesPage /></ModuleRoute>} />
                    <Route path="venues/:id" element={<ModuleRoute moduleKey="venues"><VenueDetailPage /></ModuleRoute>} />
                    <Route path="nabidky" element={<NabidkyPage />} />
                    <Route path="nabidky/nova" element={<NovaNabidka />} />
                    <Route path="nabidky/:id/edit" element={<NabidkaEditor />} />
                    <Route path="kalendar" element={<ModuleRoute moduleKey="kalendar"><KalendarPage /></ModuleRoute>} />
                    <Route path="personal" element={<ModuleRoute moduleKey="personal"><PersonalPage /></ModuleRoute>} />
                    <Route path="dokumenty" element={<ModuleRoute moduleKey="dokumenty"><DokumentyPage /></ModuleRoute>} />
                    <Route path="cenik" element={<ModuleRoute moduleKey="cenik"><CenikPage /></ModuleRoute>} />
                    <Route path="suroviny" element={<ModuleRoute moduleKey="pro"><IngredientsPage /></ModuleRoute>} />
                    <Route path="receptury" element={<ModuleRoute moduleKey="pro"><RecipesPage /></ModuleRoute>} />
                    <Route path="receptury/:id" element={<ModuleRoute moduleKey="pro"><RecipeDetailPage /></ModuleRoute>} />
                    <Route path="reporty" element={<ModuleRoute moduleKey="reporty"><ReportPage /></ModuleRoute>} />
                    <Route path="faktury" element={<ModuleRoute moduleKey="faktury"><FakturyPage /></ModuleRoute>} />
                    <Route path="faktury/nova" element={<ModuleRoute moduleKey="faktury"><NovaFakturaPage /></ModuleRoute>} />
                    <Route path="faktury/:id" element={<ModuleRoute moduleKey="faktury"><FakturaDetail /></ModuleRoute>} />
                    <Route path="poukazy" element={<ModuleRoute moduleKey="vouchers"><VouchersPage /></ModuleRoute>} />
                    <Route path="poukazy/:id" element={<ModuleRoute moduleKey="vouchers"><VoucherDetailPage /></ModuleRoute>} />
                    <Route path="nastaveni" element={<NastaveniPage />} />
                    <Route path="archiv" element={<ModuleRoute moduleKey="archiv"><ArchivPage /></ModuleRoute>} />
                    <Route path="sablony" element={<ModuleRoute moduleKey="sablony"><SablonyPage /></ModuleRoute>} />
                    <Route path="email" element={<ModuleRoute moduleKey="email"><EmailPage /></ModuleRoute>} />
                    <Route
                      path="error-log"
                      element={<SuperAdminRoute><ModuleRoute moduleKey="error_log"><ErrorLogPage /></ModuleRoute></SuperAdminRoute>}
                    />
                  </Route>
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </BrowserRouter>
            </ClientPortalAuthProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;
