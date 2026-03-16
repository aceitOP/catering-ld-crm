import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [form, setForm]     = useState({ email: '', heslo: '' });
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 mx-auto mb-4 flex items-center justify-center shadow-lg shadow-brand-500/25">
            <svg width="32" height="32" viewBox="0 0 175.96 175.94" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="white" d="M49.83,8.82V125.99c.44,.02,.78,.05,1.12,.05,12.99,0,25.98,.2,38.97-.07,12.15-.25,23.11-4.29,32.82-11.61,5.61-4.23,10.28-9.32,14.01-15.27,.18-.3,.35-.6,.62-1.05h-59.33V.5c24.18-2.5,45.06,4.33,61.29,22.77,16.24,18.44,20.38,40.03,14.74,63.81h21.86c.91,33.63-21.01,75.19-67.41,86.34C59.78,185.12,14.29,154.81,2.86,110.06-8.8,64.41,16.84,23.86,49.83,8.82Zm-10.82,19.79C14.77,47.84,1.9,85.4,18.07,120.31c16.24,35.09,55.71,52.96,93.32,41.04,18.72-5.94,33.07-17.62,43.12-34.48,5.3-8.89,8.53-18.52,9.9-28.89h-1.12c-4.13,0-8.26,.03-12.39-.02-.84,0-1.22,.29-1.59,1.02-5.64,11.27-13.75,20.34-24.35,27.14-11.46,7.36-24.04,10.86-37.64,10.84-15.67-.03-31.34,0-47.02-.01-.41,0-.81-.03-1.28-.05V28.6Zm49.84,58.43c.32,.02,.53,.05,.74,.05,17.36,0,34.73,0,52.09,.02,.74,0,.93-.34,1.12-.93,3.13-9.85,3.69-19.85,1.44-29.93-3.66-16.39-12.89-28.82-27.19-37.48-7.25-4.39-15.19-6.79-23.61-7.64-1.52-.15-3.05-.18-4.59-.27V87.03Z"/>
            </svg>
          </div>
          <div className="text-2xl font-bold text-stone-900 mb-1">
            Catering <span className="text-brand-600">LD</span>
          </div>
          <div className="text-sm text-stone-400 font-medium">Interní CRM systém</div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-card p-7">
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
              {loading ? 'Přihlašuji…' : 'Přihlásit se'}
            </button>
          </form>
        </div>

        <div className="text-center mt-5 text-xs text-stone-400">
          Demo: l.dvorackova@catering-ld.cz · Demo1234!
        </div>
      </div>
    </div>
  );
}
