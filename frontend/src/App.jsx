import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LoginPage       from './pages/LoginPage';
import DashboardPage   from './pages/DashboardPage';
import ZakazkyPage     from './pages/ZakazkyPage';
import ZakazkaDetail   from './pages/ZakazkaDetail';
import NovaZakazka     from './pages/NovaZakazka';
import KlientiPage     from './pages/KlientiPage';
import NabidkyPage     from './pages/NabidkyPage';
import NabidkaEditor   from './pages/NabidkaEditor';
import NovaNabidka     from './pages/NovaNabidka';
import KalendarPage    from './pages/KalendarPage';
import PersonalPage    from './pages/PersonalPage';
import DokumentyPage   from './pages/DokumentyPage';
import CenikPage       from './pages/CenikPage';
import NastaveniPage   from './pages/NastaveniPage';
import ReportPage      from './pages/ReportPage';
import Layout          from './components/Layout';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-stone-400 text-sm">Načítám…</div>
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="bottom-right" toastOptions={{
            style: { fontSize: '13px', background: '#1c1917', color: '#fafaf9' },
          }} />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"         element={<DashboardPage />} />
              <Route path="zakazky"           element={<ZakazkyPage />} />
              <Route path="zakazky/nova"      element={<NovaZakazka />} />
              <Route path="zakazky/:id"       element={<ZakazkaDetail />} />
              <Route path="klienti"           element={<KlientiPage />} />
              <Route path="nabidky"           element={<NabidkyPage />} />
              <Route path="nabidky/nova"      element={<NovaNabidka />} />
              <Route path="nabidky/:id/edit"  element={<NabidkaEditor />} />
              <Route path="kalendar"          element={<KalendarPage />} />
              <Route path="personal"          element={<PersonalPage />} />
              <Route path="dokumenty"         element={<DokumentyPage />} />
              <Route path="cenik"             element={<CenikPage />} />
              <Route path="reporty"           element={<ReportPage />} />
              <Route path="nastaveni"         element={<NastaveniPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
