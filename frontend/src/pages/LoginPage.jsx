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
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-2xl font-semibold text-stone-900 mb-1">
            Catering <span className="text-stone-400 font-normal">LD</span>
          </div>
          <div className="text-sm text-stone-500">Interní CRM systém</div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-stone-800 mb-5">Přihlásit se</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-stone-600 mb-1.5">E-mail</label>
              <input
                type="email"
                required
                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400 transition-colors"
                placeholder="vas@email.cz"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1.5">Heslo</label>
              <input
                type="password"
                required
                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400 transition-colors"
                placeholder="••••••••"
                value={form.heslo}
                onChange={e => setForm(f => ({ ...f, heslo: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-stone-900 text-white text-sm font-medium rounded-lg py-2.5 hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Přihlašuji…' : 'Přihlásit se'}
            </button>
          </form>
        </div>

        <div className="text-center mt-4 text-xs text-stone-400">
          Demo: l.dvorackova@catering-ld.cz · Demo1234!
        </div>
      </div>
    </div>
  );
}
