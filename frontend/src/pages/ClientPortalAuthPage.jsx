import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useClientPortalAuth } from '../context/ClientPortalContext';

export default function ClientPortalAuthPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { consumeLink } = useClientPortalAuth();

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      navigate('/portal/login', { replace: true });
      return;
    }

    consumeLink(token)
      .then(() => {
        toast.success('Klientský portál je připraven.');
        navigate('/portal', { replace: true });
      })
      .catch((err) => {
        toast.error(err.response?.data?.error || 'Odkaz už není platný.');
        navigate('/portal/login', { replace: true });
      });
  }, [consumeLink, navigate, params]);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="rounded-3xl border border-stone-200 bg-white px-8 py-10 text-center shadow-lg">
        <div className="text-lg font-semibold text-stone-900">Přihlašuji do klientského portálu…</div>
        <div className="mt-2 text-sm text-stone-500">Chvíli strpení, ověřuji magic link.</div>
      </div>
    </div>
  );
}
