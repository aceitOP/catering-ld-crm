import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, ChevronRight, Mail, Palette, Settings2, Users2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { nastaveniApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { BRAND_THEMES } from '../data/brandThemes';
import { Btn, Spinner } from '../components/ui';

const STEPS = [
  { key: 'company', label: 'Firma', icon: Settings2 },
  { key: 'branding', label: 'Branding', icon: Palette },
  { key: 'email', label: 'E-mail', icon: Mail },
  { key: 'team', label: 'Tým', icon: Users2 },
];

const INITIAL_FORM = {
  app_title: 'Catering CRM',
  app_color_theme: 'ocean',
  firma_nazev: '',
  firma_ico: '',
  firma_dic: '',
  firma_adresa: '',
  firma_email: '',
  firma_telefon: '',
  firma_web: '',
  firma_iban: '',
  email_smtp_host: '',
  email_smtp_port: '587',
  email_smtp_secure: 'false',
  email_smtp_user: '',
  email_smtp_pass: '',
  email_smtp_from: '',
  email_imap_host: '',
  email_imap_port: '993',
  email_imap_tls: 'true',
  email_imap_user: '',
  email_imap_pass: '',
};

const INITIAL_USER = {
  enabled: false,
  jmeno: '',
  prijmeni: '',
  email: '',
  telefon: '',
  role: 'admin',
  heslo: '',
};

function StepBadge({ active, done, step, index }) {
  const Icon = step.icon;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition-all ${
        active
          ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-600/25'
          : done
            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
            : 'bg-white border-stone-200 text-stone-400'
      }`}>
        {done && !active ? <CheckCircle2 size={18} /> : <Icon size={18} />}
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold">Krok {index + 1}</div>
        <div className={`text-sm font-semibold ${active ? 'text-stone-900' : 'text-stone-500'}`}>{step.label}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder = '', type = 'text' }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-stone-500 mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { refreshBranding, refreshUser } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [additionalUser, setAdditionalUser] = useState(INITIAL_USER);

  const setupQuery = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => nastaveniApi.setupStatus(),
    select: (res) => res.data,
  });

  useEffect(() => {
    if (!setupQuery.data?.settings) return;
    setForm((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(setupQuery.data.settings).filter(([, value]) => value != null)
      ),
    }));
  }, [setupQuery.data]);

  const submitMut = useMutation({
    mutationFn: (payload) => nastaveniApi.submitSetupWizard(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['setup-status'] }),
        refreshBranding(),
        refreshUser(),
      ]);
      toast.success('Základní nastavení je uloženo');
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Setup wizard se nepodařilo uložit'),
  });

  const stepKey = STEPS[stepIndex].key;
  const doneKeys = useMemo(() => {
    const sections = setupQuery.data?.sections || {};
    return Object.entries(sections)
      .filter(([, section]) => section.ready)
      .map(([key]) => key);
  }, [setupQuery.data]);

  const canContinue = useMemo(() => {
    if (stepKey === 'company') {
      return form.firma_nazev.trim() && form.firma_email.trim();
    }
    if (stepKey === 'branding') {
      return form.app_title.trim() && form.app_color_theme.trim();
    }
    if (stepKey === 'email') {
      return true;
    }
    if (stepKey === 'team') {
      if (!additionalUser.enabled) return true;
      return additionalUser.jmeno.trim()
        && additionalUser.prijmeni.trim()
        && additionalUser.email.trim()
        && additionalUser.heslo.length >= 8;
    }
    return true;
  }, [additionalUser, form, stepKey]);

  const finishSetup = () => {
    submitMut.mutate({
      settings: form,
      additional_user: additionalUser.enabled
        ? {
            jmeno: additionalUser.jmeno,
            prijmeni: additionalUser.prijmeni,
            email: additionalUser.email,
            telefon: additionalUser.telefon,
            role: additionalUser.role,
            heslo: additionalUser.heslo,
          }
        : null,
      mark_complete: true,
    });
  };

  if (setupQuery.isLoading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <Spinner size={18} />
          Načítám setup wizard...
        </div>
      </div>
    );
  }

  const recommendations = setupQuery.data?.suggestions || [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.10),_transparent_32%),linear-gradient(180deg,#fafaf9_0%,#f5f5f4_100%)] px-6 py-8">
      <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[300px,1fr]">
        <aside className="rounded-[28px] bg-white border border-stone-200/80 shadow-xl shadow-stone-200/50 p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-stone-400 font-semibold">První spuštění</div>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">Setup wizard</h1>
          <p className="mt-2 text-sm text-stone-500">
            Čistá instalace je připravena. Teď jen nastavíme firmu, vzhled a základní e-mailové kanály.
          </p>

          <div className="mt-8 space-y-5">
            {STEPS.map((step, index) => (
              <StepBadge
                key={step.key}
                step={step}
                index={index}
                active={index === stepIndex}
                done={doneKeys.includes(step.key)}
              />
            ))}
          </div>

          <div className="mt-8 rounded-3xl bg-stone-50 border border-stone-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Doporučení</div>
            {recommendations.length ? (
              <ul className="mt-3 space-y-2 text-sm text-stone-600">
                {recommendations.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    {item === 'company' && 'Doplnit firemní identitu pro PDF, nabídky a faktury'}
                    {item === 'branding' && 'Nastavit název aplikace a barevnou šablonu'}
                    {item === 'smtp' && 'Nastavit SMTP, aby šla odesílat pošta přímo z CRM'}
                    {item === 'team' && 'Volitelně přidat dalšího uživatele nebo admina'}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 text-sm text-emerald-600 font-medium">Všechny doporučené sekce jsou vyplněné.</div>
            )}
          </div>
        </aside>

        <section className="rounded-[32px] bg-white border border-stone-200/80 shadow-xl shadow-stone-200/50 p-8 lg:p-10">
          {stepKey === 'company' && (
            <div className="space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">Firma</div>
                <h2 className="mt-2 text-2xl font-bold text-stone-900">Základní firemní údaje</h2>
                <p className="mt-2 text-sm text-stone-500">Tyto hodnoty se propíšou do nabídek, faktur, PDF výstupů i podpisů.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Název firmy *" value={form.firma_nazev} onChange={(e) => setForm((f) => ({ ...f, firma_nazev: e.target.value }))} />
                <Field label="Firemní e-mail *" value={form.firma_email} onChange={(e) => setForm((f) => ({ ...f, firma_email: e.target.value }))} type="email" />
                <Field label="Telefon" value={form.firma_telefon} onChange={(e) => setForm((f) => ({ ...f, firma_telefon: e.target.value }))} />
                <Field label="Web" value={form.firma_web} onChange={(e) => setForm((f) => ({ ...f, firma_web: e.target.value }))} placeholder="https://..." />
                <Field label="IČO" value={form.firma_ico} onChange={(e) => setForm((f) => ({ ...f, firma_ico: e.target.value }))} />
                <Field label="DIČ" value={form.firma_dic} onChange={(e) => setForm((f) => ({ ...f, firma_dic: e.target.value }))} />
                <div className="md:col-span-2">
                  <Field label="Adresa sidla" value={form.firma_adresa} onChange={(e) => setForm((f) => ({ ...f, firma_adresa: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Field label="Bankovni ucet / IBAN" value={form.firma_iban} onChange={(e) => setForm((f) => ({ ...f, firma_iban: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {stepKey === 'branding' && (
            <div className="space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">Branding</div>
                <h2 className="mt-2 text-2xl font-bold text-stone-900">Jak ma aplikace vypadat</h2>
                <p className="mt-2 text-sm text-stone-500">Tady nastavime titulek aplikace a jednu ze ctyr firemnich barevnych sablon.</p>
              </div>
              <Field label="Nazev aplikace *" value={form.app_title} onChange={(e) => setForm((f) => ({ ...f, app_title: e.target.value }))} />
              <div>
                <div className="text-xs font-semibold text-stone-500 mb-2">Barevna sablona *</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {BRAND_THEMES.map((theme) => (
                    <button
                      key={theme.key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, app_color_theme: theme.key }))}
                      className={`rounded-3xl border p-4 text-left transition-all ${
                        form.app_color_theme === theme.key
                          ? 'border-brand-500 bg-brand-50 shadow-md shadow-brand-500/10'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-stone-800">{theme.label}</div>
                        {form.app_color_theme === theme.key && <CheckCircle2 size={18} className="text-brand-600" />}
                      </div>
                      <div className="mt-2 text-xs text-stone-500">{theme.description}</div>
                      <div className="mt-4 flex gap-2">
                        {theme.preview.map((color) => (
                          <span key={color} className="h-8 flex-1 rounded-2xl border border-white/60" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stepKey === 'email' && (
            <div className="space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">E-mail</div>
                <h2 className="mt-2 text-2xl font-bold text-stone-900">SMTP a IMAP nastaveni</h2>
                <p className="mt-2 text-sm text-stone-500">
                  SMTP doporučuji nastavit hned, IMAP je volitelný. Pokud to chceš dodělat později, tento krok může zůstat i prázdný.
                </p>
              </div>

              <div className="rounded-3xl border border-stone-200 p-5">
                <div className="text-sm font-semibold text-stone-800 mb-4">Odchozi posta (SMTP)</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="SMTP server" value={form.email_smtp_host} onChange={(e) => setForm((f) => ({ ...f, email_smtp_host: e.target.value }))} />
                  <Field label="Port" value={form.email_smtp_port} onChange={(e) => setForm((f) => ({ ...f, email_smtp_port: e.target.value }))} />
                  <Field label="Uživatel" value={form.email_smtp_user} onChange={(e) => setForm((f) => ({ ...f, email_smtp_user: e.target.value }))} />
                  <Field label="Odesilaci adresa" value={form.email_smtp_from} onChange={(e) => setForm((f) => ({ ...f, email_smtp_from: e.target.value }))} />
                  <Field label="Heslo" type="password" value={form.email_smtp_pass} onChange={(e) => setForm((f) => ({ ...f, email_smtp_pass: e.target.value }))} />
                  <label className="block">
                    <div className="text-xs font-semibold text-stone-500 mb-1.5">Zabezpecene spojeni</div>
                    <select
                      value={form.email_smtp_secure}
                      onChange={(e) => setForm((f) => ({ ...f, email_smtp_secure: e.target.value }))}
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="false">STARTTLS / bez secure</option>
                      <option value="true">Secure TLS</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-3xl border border-stone-200 p-5">
                <div className="text-sm font-semibold text-stone-800 mb-4">Prichozi posta (IMAP)</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="IMAP server" value={form.email_imap_host} onChange={(e) => setForm((f) => ({ ...f, email_imap_host: e.target.value }))} />
                  <Field label="Port" value={form.email_imap_port} onChange={(e) => setForm((f) => ({ ...f, email_imap_port: e.target.value }))} />
                  <Field label="Uživatel" value={form.email_imap_user} onChange={(e) => setForm((f) => ({ ...f, email_imap_user: e.target.value }))} />
                  <Field label="Heslo" type="password" value={form.email_imap_pass} onChange={(e) => setForm((f) => ({ ...f, email_imap_pass: e.target.value }))} />
                  <label className="block md:col-span-2">
                    <div className="text-xs font-semibold text-stone-500 mb-1.5">TLS</div>
                    <select
                      value={form.email_imap_tls}
                      onChange={(e) => setForm((f) => ({ ...f, email_imap_tls: e.target.value }))}
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="true">Pouzit TLS</option>
                      <option value="false">Bez TLS</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}

          {stepKey === 'team' && (
            <div className="space-y-6">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-400 font-semibold">Tým</div>
                <h2 className="mt-2 text-2xl font-bold text-stone-900">První další uživatel</h2>
                <p className="mt-2 text-sm text-stone-500">
                  Tento krok je volitelný. Klidně nech zatím jen super admin účet a další lidi přidej až později v Nastavení.
                </p>
              </div>

              <label className="flex items-center gap-3 rounded-3xl border border-stone-200 bg-stone-50 px-4 py-4">
                <input
                  type="checkbox"
                  checked={additionalUser.enabled}
                  onChange={(e) => setAdditionalUser((u) => ({ ...u, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <div className="text-sm font-semibold text-stone-800">Vytvořit další účet hned teď</div>
                  <div className="text-xs text-stone-500">Třeba pro admina, event managera nebo obchodníka.</div>
                </div>
              </label>

              {additionalUser.enabled && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Jméno *" value={additionalUser.jmeno} onChange={(e) => setAdditionalUser((u) => ({ ...u, jmeno: e.target.value }))} />
                  <Field label="Příjmení *" value={additionalUser.prijmeni} onChange={(e) => setAdditionalUser((u) => ({ ...u, prijmeni: e.target.value }))} />
                  <Field label="E-mail *" type="email" value={additionalUser.email} onChange={(e) => setAdditionalUser((u) => ({ ...u, email: e.target.value }))} />
                  <Field label="Telefon" value={additionalUser.telefon} onChange={(e) => setAdditionalUser((u) => ({ ...u, telefon: e.target.value }))} />
                  <label className="block">
                    <div className="text-xs font-semibold text-stone-500 mb-1.5">Role</div>
                    <select
                      value={additionalUser.role}
                      onChange={(e) => setAdditionalUser((u) => ({ ...u, role: e.target.value }))}
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="admin">Admin</option>
                      <option value="uzivatel">Uživatel</option>
                    </select>
                  </label>
                  <Field label="Dočasné heslo *" type="password" value={additionalUser.heslo} onChange={(e) => setAdditionalUser((u) => ({ ...u, heslo: e.target.value }))} />
                </div>
              )}

              <div className="rounded-3xl bg-emerald-50 border border-emerald-100 px-5 py-4 text-sm text-emerald-800">
                Po dokončení se aplikace odemkne do běžného provozu. Vše další potom nastavíte standardně v modulu Nastavení.
              </div>
            </div>
          )}

          <div className="mt-10 flex items-center justify-between border-t border-stone-100 pt-6">
            <Btn onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>
              <ChevronLeft size={15} />
              Zpět
            </Btn>

            <div className="flex items-center gap-3">
              {stepIndex < STEPS.length - 1 ? (
                <Btn variant="primary" onClick={() => setStepIndex((i) => i + 1)} disabled={!canContinue}>
                  Pokračovat
                  <ChevronRight size={15} />
                </Btn>
              ) : (
                <Btn variant="primary" onClick={finishSetup} disabled={!canContinue || submitMut.isPending}>
                  {submitMut.isPending ? 'Ukládám…' : 'Dokončit setup'}
                </Btn>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

