import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { branding, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', heslo: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetForm, setResetForm] = useState({ heslo: '', hesloZnovu: '' });
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const mode = searchParams.get('mode') === 'forgot' ? 'forgot' : 'login';
  const resetToken = searchParams.get('token');
  const isResetMode = searchParams.get('mode') === 'reset' && Boolean(resetToken);

  const switchToLogin = () => setSearchParams({});
  const switchToForgot = () => setSearchParams({ mode: 'forgot' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.heslo);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Přihlášení se nezdařilo');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const response = await authApi.forgotPassword({ email: forgotEmail });
      toast.success(response.data.message || 'Pokud účet existuje, poslali jsme e-mail s instrukcemi.');
      setForgotEmail('');
      switchToLogin();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Odeslání reset e-mailu se nezdařilo');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (resetForm.heslo.length < 8) {
      toast.error('Nové heslo musí mít alespoň 8 znaků');
      return;
    }
    if (resetForm.heslo !== resetForm.hesloZnovu) {
      toast.error('Zadaná hesla se neshodují');
      return;
    }

    setResetLoading(true);
    try {
      const response = await authApi.resetPassword({
        token: resetToken,
        nove_heslo: resetForm.heslo,
      });
      toast.success(response.data.message || 'Heslo bylo obnoveno');
      setResetForm({ heslo: '', hesloZnovu: '' });
      switchToLogin();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Obnova hesla se nezdařila');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 mx-auto mb-4 flex items-center justify-center shadow-lg shadow-brand-500/25 overflow-hidden">
            {branding?.app_logo_data_url ? (
              <img src={branding.app_logo_data_url} alt="Logo aplikace" className="w-full h-full object-contain" />
            ) : (
              <span className="text-white text-[11px] font-bold tracking-tight">Catering CRM</span>
            )}
          </div>
          <div className="text-2xl font-bold text-stone-900 mb-1">{branding?.app_title || 'Catering CRM'}</div>
          <div className="text-sm text-stone-400 font-medium">Interní CRM systém</div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-card p-7">
          {isResetMode ? (
            <>
              <h2 className="text-base font-bold text-stone-800 mb-2">Nastavit nové heslo</h2>
              <p className="text-sm text-stone-500 mb-6">
                Zadejte nové heslo pro svůj účet. Reset odkaz je jednorázový a časově omezený.
              </p>
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-stone-500 font-semibold mb-1.5">Nové heslo</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                    placeholder="Alespoň 8 znaků"
                    value={resetForm.heslo}
                    onChange={e => setResetForm((f) => ({ ...f, heslo: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 font-semibold mb-1.5">Potvrzení hesla</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                    placeholder="Zopakujte nové heslo"
                    value={resetForm.hesloZnovu}
                    onChange={e => setResetForm((f) => ({ ...f, hesloZnovu: e.target.value }))}
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full bg-brand-600 text-white text-sm font-semibold rounded-xl py-3 hover:bg-brand-700 shadow-md shadow-brand-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {resetLoading ? 'Ukládám...' : 'Uložit nové heslo'}
                </button>
              </form>
              <button
                type="button"
                onClick={switchToLogin}
                className="w-full mt-3 text-sm text-brand-700 font-semibold hover:text-brand-800 transition-colors"
              >
                Zpět na přihlášení
              </button>
            </>
          ) : mode === 'forgot' ? (
            <>
              <h2 className="text-base font-bold text-stone-800 mb-2">Obnovit heslo</h2>
              <p className="text-sm text-stone-500 mb-6">
                Pošleme vám e-mail s odkazem, přes který si nastavíte nové heslo.
              </p>
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-stone-500 font-semibold mb-1.5">E-mail</label>
                  <input
                    type="email"
                    required
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                    placeholder="vas@email.cz"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-brand-600 text-white text-sm font-semibold rounded-xl py-3 hover:bg-brand-700 shadow-md shadow-brand-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {forgotLoading ? 'Odesílám...' : 'Poslat reset odkaz'}
                </button>
              </form>
              <button
                type="button"
                onClick={switchToLogin}
                className="w-full mt-3 text-sm text-brand-700 font-semibold hover:text-brand-800 transition-colors"
              >
                Zpět na přihlášení
              </button>
            </>
          ) : (
            <>
              <h2 className="text-base font-bold text-stone-800 mb-6">Přihlásit se</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-stone-500 font-semibold mb-1.5">E-mail</label>
                  <input
                    type="email"
                    required
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                    placeholder="vas@email.cz"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 font-semibold mb-1.5">Heslo</label>
                  <input
                    type="password"
                    required
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                    placeholder="••••••••"
                    value={form.heslo}
                    onChange={e => setForm(f => ({ ...f, heslo: e.target.value }))}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 text-white text-sm font-semibold rounded-xl py-3 hover:bg-brand-700 shadow-md shadow-brand-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? 'Přihlašuji...' : 'Přihlásit se'}
                </button>
              </form>
              <button
                type="button"
                onClick={switchToForgot}
                className="w-full mt-3 text-sm text-brand-700 font-semibold hover:text-brand-800 transition-colors"
              >
                Zapomněli jste heslo?
              </button>
            </>
          )}
        </div>

        <div className="text-center mt-5 text-xs text-stone-400">
          Demo: l.dvorackova@catering-ld.cz Â· Demo1234!
        </div>
      </div>
    </div>
  );
}

