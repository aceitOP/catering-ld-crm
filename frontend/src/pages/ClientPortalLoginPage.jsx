import { useState } from 'react';
import toast from 'react-hot-toast';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClientPortalAuth } from '../context/ClientPortalContext';

export default function ClientPortalLoginPage() {
  const { branding } = useAuth();
  const { requestLink } = useClientPortalAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      const response = await requestLink(email.trim());
      toast.success(response.data?.message || 'Přihlašovací odkaz byl odeslán.');
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Odeslání odkazu se nepodařilo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-lg">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Klientský portál</div>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">{branding?.app_title || 'Catering CRM'}</h1>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Přihlaste se přes jednorázový odkaz do přehledu svých zakázek, dokumentů, faktur a výběrů menu.
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">E-mail klienta</label>
            <input
              type="email"
              className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              placeholder="např. klient@firma.cz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={sending || !email.trim()}
            className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? 'Odesílám odkaz…' : 'Poslat magic link'}
          </button>
        </form>

        {sent && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <div className="flex items-start gap-2">
              <MailCheck size={16} className="mt-0.5" />
              <span>Pokud je e-mail v systému navázaný na klienta nebo zakázku, poslali jsme přihlašovací odkaz.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
