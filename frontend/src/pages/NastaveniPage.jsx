import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { nastaveniApi, uzivateleApi, authApi, googleCalendarApi, emailApi, backupApi, loginLogApi, notificationRulesApi } from '../api';
import { useAuth as useAuthNS } from '../context/AuthContext';
import { PageHeader, Btn, Modal, Spinner } from '../components/ui';
import { MODULE_DEFINITIONS, MODULE_SETTING_KEYS } from '../data/moduleConfig';
import { BRAND_THEMES } from '../data/brandThemes';
import toast from 'react-hot-toast';
import { Plus, Settings, Trash2 as Trash2NS, Pencil, Download, Database, ShieldCheck, ShieldAlert } from 'lucide-react';

const DOCUMENT_FONT_OPTIONS = [
  { value: 'syne', label: 'Syne', description: 'Výrazné moderní písmo pro nabídky a promo materiály.' },
  { value: 'manrope', label: 'Manrope', description: 'Čisté firemní sans-serif písmo pro univerzální použití.' },
  { value: 'merriweather', label: 'Merriweather', description: 'Serifová varianta pro elegantnější dokumenty.' },
  { value: 'source_sans_3', label: 'Source Sans 3', description: 'Neutrální čitelné písmo pro faktury a provozní tisk.' },
];

const VOUCHER_DESIGN_OPTIONS = [
  { value: 'classic', label: 'Klasický', description: 'Univerzální dárkový certifikát s výraznou barevnou hlavičkou.' },
  { value: 'minimal', label: 'Minimal', description: 'Čistý světlý vzhled pro decentní firemní branding.' },
  { value: 'premium', label: 'Premium', description: 'Tmavší elegantní karta pro luxusnější poukazy.' },
  { value: 'festive', label: 'Slavnostní', description: 'Výraznější dekorativní vzhled pro dárkové použití.' },
];

function formatBackupStatus(status) {
  if (status === 'success') return { label: 'V pořádku', className: 'text-emerald-700' };
  if (status === 'error') return { label: 'Chyba', className: 'text-red-600' };
  return { label: '—', className: 'text-stone-700' };
}

function formatFileSize(size) {
  if (size == null) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNotificationStatus(status) {
  if (status === 'sent') return { label: 'Odesláno', className: 'bg-emerald-50 text-emerald-700' };
  if (status === 'failed') return { label: 'Chyba', className: 'bg-red-50 text-red-700' };
  if (status === 'skipped') return { label: 'Přeskočeno', className: 'bg-amber-50 text-amber-700' };
  return { label: 'Ve frontě', className: 'bg-stone-100 text-stone-600' };
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('cs-CZ');
}

function NotificationRulesManager() {
  const qc = useQueryClient();
  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: notificationRulesApi.list,
    select: (response) => response.data?.data || [],
  });
  const { data: dispatchLogData, isLoading: dispatchLoading } = useQuery({
    queryKey: ['notification-dispatch-log'],
    queryFn: () => notificationRulesApi.dispatchLog(20),
    select: (response) => response.data?.data || [],
  });

  const updateRuleMut = useMutation({
    mutationFn: ({ id, payload }) => notificationRulesApi.update(id, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notification-rules'] });
      await qc.invalidateQueries({ queryKey: ['notification-dispatch-log'] });
      toast.success('Pravidlo bylo uloženo');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Pravidlo se nepodařilo uložit'),
  });

  const runSweepMut = useMutation({
    mutationFn: notificationRulesApi.runSweep,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notification-dispatch-log'] });
      toast.success('Kontrolní sweep byl spuštěn');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Sweep se nepodařilo spustit'),
  });

  const rules = rulesData || [];
  const dispatches = dispatchLogData || [];

  if (rulesLoading) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <div className="text-sm text-stone-500">Načítám pravidla notifikací...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-stone-800">Pravidla notifikací</div>
            <div className="text-xs text-stone-500 mt-1">
              Scénáře používají interní centrum notifikací a podle SMTP nastavení i e-mail. Duplicitní rozesílky
              hlídá backend přes dispatch log.
            </div>
          </div>
          <Btn size="sm" variant="primary" onClick={() => runSweepMut.mutate()} disabled={runSweepMut.isPending}>
            {runSweepMut.isPending ? 'Spouštím kontrolu...' : 'Spustit kontrolní sweep'}
          </Btn>
        </div>

        <div className="grid gap-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-stone-200 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-stone-800">{rule.title}</div>
                  <div className="text-xs text-stone-500 mt-1">{rule.description || 'Bez popisu.'}</div>
                </div>
                <div className="text-xs text-stone-400">
                  Poslední odeslání: <span className="text-stone-600">{formatDateTime(rule.last_dispatched_at)}</span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={Boolean(rule.enabled)}
                    onChange={(e) => updateRuleMut.mutate({ id: rule.id, payload: { enabled: e.target.checked } })}
                  />
                  Pravidlo je aktivní
                </label>
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={Boolean(rule.include_admins)}
                    onChange={(e) => updateRuleMut.mutate({ id: rule.id, payload: { include_admins: e.target.checked } })}
                  />
                  Posílat interním adminům
                </label>
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={Boolean(rule.include_assigned_staff)}
                    onChange={(e) => updateRuleMut.mutate({ id: rule.id, payload: { include_assigned_staff: e.target.checked } })}
                  />
                  Zahrnout přiřazený personál
                </label>
                <div className="text-xs text-stone-500">
                  Event typ: <span className="font-medium text-stone-700">{rule.event_type}</span>
                </div>
              </div>

              <div className="grid gap-3">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Další e-maily</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    defaultValue={rule.extra_emails || ''}
                    placeholder="ops@firma.cz, manager@firma.cz"
                    onBlur={(e) => {
                      if ((rule.extra_emails || '') !== e.target.value) {
                        updateRuleMut.mutate({ id: rule.id, payload: { extra_emails: e.target.value } });
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Předmět</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    defaultValue={rule.subject_template || ''}
                    onBlur={(e) => {
                      if ((rule.subject_template || '') !== e.target.value) {
                        updateRuleMut.mutate({ id: rule.id, payload: { subject_template: e.target.value } });
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Text zprávy</label>
                  <textarea
                    rows={3}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-y"
                    defaultValue={rule.body_template || ''}
                    onBlur={(e) => {
                      if ((rule.body_template || '') !== e.target.value) {
                        updateRuleMut.mutate({ id: rule.id, payload: { body_template: e.target.value } });
                      }
                    }}
                  />
                  <div className="text-[11px] text-stone-400 mt-1">
                    Dostupné proměnné: <code>{'{cislo}'}</code>, <code>{'{nazev}'}</code>, <code>{'{datum_akce}'}</code>, <code>{'{misto}'}</code>, <code>{'{cas_zacatek}'}</code>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-stone-800">Poslední dispatch log</div>
            <div className="text-xs text-stone-500 mt-1">Přehled posledních odeslaných, přeskočených a neúspěšných notifikací.</div>
          </div>
          {dispatchLoading && <Spinner size="sm" />}
        </div>

        {dispatches.length === 0 ? (
          <div className="text-sm text-stone-500">Zatím nebyla odeslána žádná notifikace.</div>
        ) : (
          <div className="space-y-2">
            {dispatches.map((entry) => {
              const status = formatNotificationStatus(entry.status);
              return (
                <div key={entry.id} className="rounded-xl border border-stone-200 px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800">{entry.rule_title || entry.event_type}</div>
                    <div className="text-xs text-stone-500 mt-1">
                      {entry.zakazka_cislo ? `${entry.zakazka_cislo} · ` : ''}{entry.zakazka_nazev || 'Bez zakázky'} · {formatDateTime(entry.created_at)}
                    </div>
                    {entry.error_message && <div className="text-xs text-red-600 mt-1">{entry.error_message}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status.className}`}>{status.label}</span>
                    <span className="text-xs text-stone-400">{entry.recipient_count || 0} příjemců</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailSablonyManager() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['email-sablony'], queryFn: emailApi.listSablony });
  const sablony  = data?.data?.data || data?.data || [];
  const [editing, setEditing] = useState(null); // null | {} | { id, ... }
  const [form, setForm] = useState({ nazev: '', use_case: 'reply', subject_template: '', body_template: '', popis: '', poradi: 0, aktivni: true });
  const useCaseOptions = [
    { value: 'reply', label: 'Obecná odpověď' },
    { value: 'thank_you', label: 'Děkovací e-mail' },
    { value: 'proposal', label: 'Nabídka' },
    { value: 'invoice', label: 'Faktura' },
    { value: 'voucher', label: 'Poukaz' },
  ];

  const createMut = useMutation({
    mutationFn: (d) => emailApi.createSablona(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-sablony'] }); setEditing(null); toast.success('Šablona přidána'); },
    onError: () => toast.error('Chyba při ukládání'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => emailApi.updateSablona(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-sablony'] }); setEditing(null); toast.success('Šablona upravena'); },
    onError: () => toast.error('Chyba při ukládání'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => emailApi.deleteSablona(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-sablony'] }),
  });

  const normalizePayload = (payload) => ({
    ...payload,
    predmet_prefix: payload.subject_template,
    telo: payload.body_template,
  });
  const openNew  = () => { setForm({ nazev: '', use_case: 'reply', subject_template: '', body_template: '', popis: '', poradi: 0, aktivni: true }); setEditing({}); };
  const openEdit = (s) => {
    setForm({
      nazev: s.nazev || '',
      use_case: s.use_case || 'reply',
      subject_template: s.subject_template || s.predmet_prefix || '',
      body_template: s.body_template || s.telo || '',
      popis: s.popis || '',
      poradi: s.poradi || 0,
      aktivni: s.aktivni !== false,
    });
    setEditing(s);
  };
  const save     = () => editing?.id ? updateMut.mutate({ id: editing.id, ...normalizePayload(form) }) : createMut.mutate(normalizePayload(form));

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-stone-800">E-mailové šablony</div>
          <div className="text-xs text-stone-500">Texty pro odpovědi, děkovací e-maily a další automatizované scénáře</div>
        </div>
        <Btn size="sm" onClick={openNew}><Plus size={12}/> Přidat</Btn>
      </div>

      {sablony.length === 0 && !editing && (
        <div className="text-xs text-stone-400 py-3 text-center">Žádné šablony - klikněte Přidat</div>
      )}

      {sablony.map(s => (
        <div key={s.id} className="flex items-start justify-between gap-3 py-2 border-t border-stone-100">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-stone-800">{s.nazev}</div>
            <div className="text-xs text-stone-400">{useCaseOptions.find(o => o.value === (s.use_case || 'reply'))?.label || s.use_case}</div>
            {(s.subject_template || s.predmet_prefix) && <div className="text-xs text-stone-400">Předmět: {s.subject_template || s.predmet_prefix}</div>}
            <div className="text-xs text-stone-500 truncate mt-0.5">{(s.body_template || s.telo)?.slice(0, 80)}{(s.body_template || s.telo)?.length > 80 ? '...' : ''}</div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => openEdit(s)} className="p-1 text-stone-400 hover:text-stone-700 rounded transition-colors"><Pencil size={12}/></button>
            <button onClick={() => { if (confirm('Smazat šablonu?')) deleteMut.mutate(s.id); }}
              className="p-1 text-stone-300 hover:text-red-500 rounded transition-colors"><Trash2NS size={12}/></button>
          </div>
        </div>
      ))}

      {editing !== null && (
        <div className="border-t border-stone-100 pt-3 space-y-2">
          <div className="text-xs font-semibold text-stone-700">{editing?.id ? 'Upravit šablonu' : 'Nová šablona'}</div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-stone-400 block mb-0.5">Název *</label>
              <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                value={form.nazev} onChange={e => setForm(f=>({...f, nazev: e.target.value}))} autoFocus/></div>
            <div><label className="text-xs text-stone-400 block mb-0.5">Použití</label>
              <select className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                value={form.use_case} onChange={e => setForm(f=>({...f, use_case: e.target.value}))}>
                {useCaseOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></div>
            <div><label className="text-xs text-stone-400 block mb-0.5">Předmět</label>
              <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                placeholder="Děkujeme za spolupráci - {nazev}" value={form.subject_template} onChange={e => setForm(f=>({...f, subject_template: e.target.value}))}/></div>
            <div><label className="text-xs text-stone-400 block mb-0.5">Pořadí</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                value={form.poradi} onChange={e => setForm(f=>({...f, poradi: e.target.value}))}/></div>
          </div>
          <div><label className="text-xs text-stone-400 block mb-0.5">Popis / interní poznámka</label>
            <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
              placeholder="Kdy se šablona používá" value={form.popis} onChange={e => setForm(f=>({...f, popis: e.target.value}))}/></div>
          <div><label className="text-xs text-stone-400 block mb-0.5">Text šablony</label>
            <textarea rows={6} className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none resize-none"
              placeholder="Vážený zákazníku, děkujeme za spolupráci na akci {nazev}..."
              value={form.body_template} onChange={e => setForm(f=>({...f, body_template: e.target.value}))}/></div>
          <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
            Proměnné: {'{nazev}'}, {'{cislo}'}, {'{datum_akce}'}, {'{misto}'}, {'{pocet_hostu}'}, {'{klient_jmeno}'}, {'{firma_nazev}'}, {'{firma_email}'}, {'{cena_celkem}'}.
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={form.aktivni} onChange={e => setForm(f=>({...f, aktivni: e.target.checked}))} />
            Aktivní šablona
          </label>
          <div className="flex gap-2 pt-1">
            <Btn size="sm" onClick={() => setEditing(null)}>Zrušit</Btn>
            <Btn size="sm" variant="primary" onClick={save}
              disabled={!form.nazev || createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? 'Ukládám...' : 'Uložit šablonu'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function SmtpTestButton() {
  const [result, setResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const run = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await emailApi.smtpTest();
      setResult(res.data);
    } catch (err) {
      setResult({ ok: false, error: err.response?.data?.error || err.message });
    }
    setTesting(false);
  };

  return (
    <div className="pt-2 border-t border-stone-100 space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={testing}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition-colors disabled:opacity-50"
      >
        {testing ? 'Testuji spojení...' : 'Otestovat SMTP připojení'}
      </button>
      {result && (
        <div className={`rounded-lg p-3 text-xs space-y-1 ${result.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
          <div className="font-semibold">{result.ok ? 'Připojení úspěšné' : 'Připojení selhalo'}</div>
          {result.info && <div className="text-stone-500">{result.info.host}:{result.info.port} · {result.info.secure ? 'SSL' : 'STARTTLS'} · {result.info.user}</div>}
          {!result.ok && <div>{result.error}</div>}
          {result.hint && <div className="font-medium mt-1">{result.hint}</div>}
        </div>
      )}
    </div>
  );
}

export function NastaveniPage() {
  const qc = useQueryClient();
  const { user: currentUser, refreshBranding, refreshUser } = useAuthNS();
  const [tab, setTab] = useState('firma');
  const [form, setForm] = useState({});
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ jmeno:'', prijmeni:'', email:'', heslo:'', role:'uzivatel', telefon:'' });
  const [passForm, setPassForm] = useState({ stare_heslo:'', nove_heslo:'', nove_heslo2:'' });

  const { data: nastavData } = useQuery({ queryKey:['nastaveni'], queryFn: nastaveniApi.get });
  const { data: uzivData }   = useQuery({ queryKey:['uzivatele'], queryFn: uzivateleApi.list, enabled: tab==='uziv' });

  const saveMut   = useMutation({
    mutationFn: nastaveniApi.update,
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['nastaveni'] });
      qc.invalidateQueries({ queryKey: ['backup-info'] });
      await refreshBranding();
      await refreshUser();
      toast.success('Nastavení uloženo');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Nastavení se nepodařilo uložit'),
  });
  const userMut   = useMutation({
    mutationFn: uzivateleApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uzivatele'] });
      toast.success('Uživatel přidán');
      setUserModal(false);
      setUserForm({ jmeno:'', prijmeni:'', email:'', heslo:'', role:'uzivatel', telefon:'' });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Uživatele se nepodařilo přidat'),
  });
  const toggleMut = useMutation({
    mutationFn: ({id,aktivni}) => uzivateleApi.update(id,{aktivni}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uzivatele'] });
      toast.success('Stav uživatele byl upraven');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Stav uživatele se nepodařilo změnit'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => uzivateleApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uzivatele'] }); toast.success('Uživatel smazán'); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Chyba při mazání'),
  });
  const passMut  = useMutation({
    mutationFn: (d) => authApi.changePassword({ stare_heslo: d.stare_heslo, nove_heslo: d.nove_heslo }),
    onSuccess: () => { toast.success('Heslo bylo úspěšně změněno'); setPassForm({ stare_heslo:'', nove_heslo:'', nove_heslo2:'' }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Chyba při změně hesla'),
  });

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const TABS = [['firma','Profil firmy'],...(isSuperAdmin ? [['moduly','Moduly']] : []),['uziv','Uživatelé'],['heslo','Změna hesla'],['podpis','E-mail podpis'],['notif','Notifikace'],['integrace','Integrace'],['google','Google Kalendář'],['kapacity','Kapacity'],['email','E-mail (IMAP)'],['zaloha','Zálohy'],['login-log','Přihlášení']];
  const [podpisPreview, setPodpisPreview] = useState(false);

  const { data: gcStatus, refetch: refetchGcStatus } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: googleCalendarApi.status,
    enabled: tab === 'google',
    retry: false,
    select: (r) => r.data,
  });

  const [loginFilter, setLoginFilter] = useState({ only_failures: false });
  const { data: loginLogData, isLoading: loginLogLoading, refetch: refetchLog } = useQuery({
    queryKey: ['login-log', loginFilter],
    queryFn: () => loginLogApi.list(loginFilter),
    enabled: tab === 'login-log' && isSuperAdmin,
    select: (r) => r.data,
  });
  const deleteOldMut = useMutation({
    mutationFn: (days) => loginLogApi.deleteOld(days),
    onSuccess: (r) => { toast.success(r.data.message); refetchLog(); },
    onError: () => toast.error('Chyba při mazání'),
  });

  const { data: backupInfo, isLoading: backupInfoLoading } = useQuery({
    queryKey: ['backup-info'],
    queryFn: backupApi.info,
    enabled: tab === 'zaloha',
    retry: false,
    select: (r) => r.data,
  });
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupRunLoading, setBackupRunLoading] = useState(false);
  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    try {
      await backupApi.download();
      toast.success('Záloha stažena');
    } catch {
      toast.error('Zálohu se nepodařilo vytvořit');
    } finally {
      setBackupLoading(false);
    }
  };
  const handleRunBackup = async () => {
    setBackupRunLoading(true);
    try {
      const res = await backupApi.run();
      await qc.invalidateQueries({ queryKey: ['backup-info'] });
      toast.success(res.data?.message || 'Záloha byla vytvořena');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Serverovou zálohu se nepodařilo vytvořit');
    } finally {
      setBackupRunLoading(false);
    }
  };
  const handleStoredBackupDownload = async (name) => {
    try {
      await backupApi.downloadFile(name);
      toast.success('Záloha stažena');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Zálohu se nepodařilo stáhnout');
    }
  };
  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/svg+xml'].includes(file.type)) {
      toast.error('Logo musí být PNG nebo SVG');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error('Logo může mít maximálně 1 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, app_logo_data_url: String(reader.result || '') }));
    };
    reader.onerror = () => toast.error('Logo se nepodařilo načíst');
    reader.readAsDataURL(file);
  };
  const uzivatele = uzivData?.data?.data || [];
  const setU = (k,v) => setUserForm(f=>({...f,[k]:v}));
  const openUserCreateModal = () => {
    setUserForm({ jmeno:'', prijmeni:'', email:'', heslo:'', role:'uzivatel', telefon:'' });
    setUserModal(true);
  };
  const ROLES = {
    ...(isSuperAdmin ? { super_admin: 'Super admin' } : {}),
    admin:    'Administrátor',
    uzivatel: 'Uživatel',
  };

  return (
    <div>
      <PageHeader title="Nastavení"/>
      <div className="bg-white border-b border-stone-100 px-6 flex">
        {TABS.filter(([k]) => isSuperAdmin || k !== 'login-log').map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-3 text-sm border-b-2 transition-colors ${tab===k?'border-stone-900 text-stone-900 font-medium':'border-transparent text-stone-500 hover:text-stone-700'}`}>{l}</button>
        ))}
      </div>
      <div className="p-6 max-w-2xl">
        {tab === 'firma' && nastavData && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 mb-1 border-b border-stone-100">
                <div>
                  <div className="text-xs font-semibold text-stone-700">Cache aplikace</div>
                  <div className="text-xs text-stone-400 mt-0.5">Zobrazují se zastaralá data? Vymažte cache a načtěte vše znovu.</div>
                </div>
                <Btn size="sm" onClick={() => { qc.clear(); qc.invalidateQueries(); toast.success('Cache vymazána, data se obnovují...'); }}>Vymazat cache</Btn>
              </div>
              {[['firma_nazev','Název firmy'],['firma_ico','IČO'],['firma_dic','DIČ'],['firma_adresa','Adresa'],['firma_email','E-mail'],['firma_telefon','Telefon'],['firma_web','Web'],['firma_iban','Bankovní účet (IBAN)']].map(([k,l])=>(
                <div key={k}><label className="text-xs text-stone-500 block mb-1">{l}</label>
                  <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    defaultValue={nastavData?.data?.[k]||''} onChange={e => setForm(f=>({...f,[k]:e.target.value}))}/>
                </div>
              ))}
              <div><label className="text-xs text-stone-500 block mb-1">Název aplikace / &lt;title&gt;</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={form.app_title ?? nastavData?.data?.app_title ?? 'Catering CRM'}
                  onChange={e => setForm(f => ({ ...f, app_title: e.target.value }))}
                  placeholder="Catering CRM"/>
              </div>
              <div className="rounded-xl border border-stone-200 p-4 space-y-3">
                <div>
                  <div className="text-sm font-medium text-stone-800">Barevná šablona</div>
                  <div className="text-xs text-stone-500 mt-1">Vyberte jednu ze 4 nejběžnějších firemních barevných variant.</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {BRAND_THEMES.map((theme) => {
                    const selected = (form.app_color_theme ?? nastavData?.data?.app_color_theme ?? 'ocean') === theme.key;
                    return (
                      <button
                        key={theme.key}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, app_color_theme: theme.key }))}
                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${selected ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50/40' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {theme.preview.map((color) => (
                            <span
                              key={color}
                              className="w-5 h-5 rounded-full border border-white shadow-sm"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="text-sm font-semibold text-stone-800">{theme.label}</div>
                        <div className="text-xs text-stone-500 mt-1">{theme.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-stone-200 p-4 space-y-3">
                <div>
                  <div className="text-sm font-medium text-stone-800">Písmo pro PDF a tisk</div>
                  <div className="text-xs text-stone-500 mt-1">Použije se pro nabídky, faktury, komando, dodací listy, poukazy a další výstupy.</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DOCUMENT_FONT_OPTIONS.map((font) => {
                    const selected = (form.app_document_font_family ?? nastavData?.data?.app_document_font_family ?? 'syne') === font.value;
                    return (
                      <button
                        key={font.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, app_document_font_family: font.value }))}
                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${selected ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50/40' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`}
                      >
                        <div className="text-sm font-semibold text-stone-800">{font.label}</div>
                        <div className="text-xs text-stone-500 mt-1">{font.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-stone-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-stone-800">Logo aplikace</div>
                    <div className="text-xs text-stone-500 mt-1">Použije se v loginu, hlavičce aplikace, PDF a tiskových dokumentech. Podporované formáty: PNG nebo SVG do 1 MB.</div>
                  </div>
                  <div className="w-20 h-20 rounded-2xl border border-dashed border-stone-300 bg-stone-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {(form.app_logo_data_url ?? nastavData?.data?.app_logo_data_url) ? (
                      <img src={form.app_logo_data_url ?? nastavData?.data?.app_logo_data_url} alt="Logo" className="w-full h-full object-contain"/>
                    ) : (
                      <span className="text-[10px] font-semibold text-stone-400 text-center px-2">Catering CRM</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center justify-center px-3 py-2 text-xs font-medium border border-stone-200 rounded-lg hover:bg-stone-50 cursor-pointer">
                    Nahrát logo
                    <input type="file" accept="image/png,image/svg+xml,.png,.svg" className="hidden" onChange={handleLogoChange}/>
                  </label>
                  {(form.app_logo_data_url ?? nastavData?.data?.app_logo_data_url) && (
                    <button type="button" className="px-3 py-2 text-xs font-medium border border-stone-200 rounded-lg hover:bg-stone-50"
                      onClick={() => setForm(f => ({ ...f, app_logo_data_url: '' }))}>
                      Odebrat logo
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-stone-200 p-4 space-y-3">
                <div>
                  <div className="text-sm font-medium text-stone-800">Vzhled poukazu</div>
                  <div className="text-xs text-stone-500 mt-1">Jednoduchá šablona pro PDF/tisk dárkových poukazů. Barvy a logo se berou z firemního brandingu výše.</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {VOUCHER_DESIGN_OPTIONS.map((style) => {
                    const selected = (form.voucher_design_style ?? nastavData?.data?.voucher_design_style ?? 'classic') === style.value;
                    return (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, voucher_design_style: style.value }))}
                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${selected ? 'border-brand-500 ring-2 ring-brand-100 bg-brand-50/40' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`}
                      >
                        <div className="text-sm font-semibold text-stone-800">{style.label}</div>
                        <div className="text-xs text-stone-500 mt-1">{style.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám...' : 'Uložit změny'}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {tab === 'moduly' && isSuperAdmin && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800">Aktivní moduly instalace</div>
                <div className="text-xs text-stone-500 mt-1">Vypnutý modul zmizí z menu a backend zablokuje jeho endpointy. Základní části CRM jako dashboard, zakázky, nabídky, klienti a nastavení zůstávají vždy aktivní.</div>
              </div>
              <div className="space-y-2">
                {MODULE_DEFINITIONS.map((module) => {
                  const settingKey = MODULE_SETTING_KEYS[module.key];
                  const checked = String(form?.[settingKey] ?? nastavData?.data?.[settingKey] ?? 'true') !== 'false';
                  return (
                    <label key={module.key} className="flex items-start gap-3 rounded-xl border border-stone-200 px-4 py-3 cursor-pointer hover:border-stone-300 transition-colors">
                      <input
                        type="checkbox"
                        className="mt-1 rounded"
                        checked={checked}
                        onChange={(e) => setForm((f) => ({ ...f, [settingKey]: String(e.target.checked) }))}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-stone-800">{module.label}</div>
                        <div className="text-xs text-stone-500 mt-0.5">{module.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám...' : 'Uložit moduly'}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {tab === 'uziv' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Btn variant="primary" size="sm" onClick={openUserCreateModal}><Plus size={12}/> Nový uživatel</Btn>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-50">
              {uzivatele.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">{u.jmeno?.[0]}{u.prijmeni?.[0]}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-800">{u.jmeno} {u.prijmeni}</div>
                    <div className="text-xs text-stone-400 flex items-center gap-1.5">
                      {u.email}
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${u.role==='super_admin'?'bg-purple-100 text-purple-700':u.role==='admin'?'bg-blue-100 text-blue-700':'bg-stone-100 text-stone-500'}`}>
                        {ROLES[u.role]||u.role}
                      </span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.aktivni?'bg-green-50 text-green-700':'bg-stone-100 text-stone-400'}`}>{u.aktivni?'Aktivní':'Neaktivní'}</span>
                  <button onClick={() => toggleMut.mutate({id:u.id,aktivni:!u.aktivni})} className="text-xs text-stone-400 hover:text-stone-700">{u.aktivni?'Deaktivovat':'Aktivovat'}</button>
                  {String(u.id) !== String(currentUser?.id) && (
                    <button onClick={() => { if (window.confirm(`Opravdu smazat uživatele ${u.jmeno} ${u.prijmeni}? Tato akce je nevratná.`)) deleteMut.mutate(u.id); }}
                      className="p-1 text-stone-300 hover:text-red-500 transition-colors" title="Smazat uživatele">
                      <Trash2NS size={13}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'heslo' && (
          <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
            <p className="text-sm text-stone-500 mb-2">Změna platí pouze pro váš účet. Nové heslo musí mít alespoň 8 znaků.</p>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Stávající heslo</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                value={passForm.stare_heslo} onChange={e => setPassForm(f=>({...f, stare_heslo:e.target.value}))} autoComplete="current-password" />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Nové heslo</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                placeholder="min. 8 znaků" value={passForm.nove_heslo} onChange={e => setPassForm(f=>({...f, nove_heslo:e.target.value}))} autoComplete="new-password" />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Nové heslo (potvrzení)</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                value={passForm.nove_heslo2} onChange={e => setPassForm(f=>({...f, nove_heslo2:e.target.value}))} autoComplete="new-password" />
              {passForm.nove_heslo && passForm.nove_heslo2 && passForm.nove_heslo !== passForm.nove_heslo2 && (
                <p className="text-xs text-red-500 mt-1">Hesla se neshodují</p>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Btn variant="primary"
                onClick={() => passMut.mutate(passForm)}
                disabled={!passForm.stare_heslo || !passForm.nove_heslo || passForm.nove_heslo.length < 8 || passForm.nove_heslo !== passForm.nove_heslo2 || passMut.isPending}>
                {passMut.isPending ? 'Měním...' : 'Změnit heslo'}
              </Btn>
            </div>
          </div>
        )}

        {tab === 'podpis' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">HTML podpis e-mailu</div>
                <div className="text-xs text-stone-500 mb-3">Podpis se automaticky připojí ke všem odchozím e-mailům (nabídky, komando, děkovací maily). Zadejte libovolný HTML kód.</div>
                <textarea
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none font-mono resize-y"
                  rows={10}
                  placeholder="<p>S pozdravem,<br><strong>Jméno Příjmení</strong><br>+420 123 456 789</p>"
                  defaultValue={nastavData?.data?.email_podpis_html || ''}
                  onChange={e => setForm(f => ({ ...f, email_podpis_html: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => setPodpisPreview(v => !v)} className="text-xs text-stone-500 hover:text-stone-700 underline underline-offset-2">
                  {podpisPreview ? 'Skrýt náhled' : 'Zobrazit náhled'}
                </button>
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám...' : 'Uložit podpis'}
                </Btn>
              </div>
              {podpisPreview && (
                <div className="border border-stone-200 rounded-lg p-4 bg-stone-50">
                  <div className="text-xs text-stone-400 mb-2 uppercase tracking-wide font-medium">Náhled</div>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: form.email_podpis_html || nastavData?.data?.email_podpis_html || '<em class="text-stone-400">Podpis je prázdný</em>' }}
                  />
                </div>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
              <div className="font-semibold mb-1">Tipy pro HTML podpis:</div>
              <div>• Používejte inline styly: <code className="bg-blue-100 px-1 rounded">style="color:#333;"</code></div>
              <div>• Pro obrázek (logo): <code className="bg-blue-100 px-1 rounded">{'<img src="URL" style="height:40px;">'}</code></div>
              <div>• Pro odkaz: <code className="bg-blue-100 px-1 rounded">{'<a href="https://...">text</a>'}</code></div>
            </div>
          </div>
        )}

        {tab === 'notif' && (
          <NotificationRulesManager />
        )}

        {tab === 'google' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-stone-800 mb-0.5">Google Kalendář</div>
                  <div className="text-xs text-stone-500">Potvrzené zakázky se automaticky propisují do sdíleného firemního Google Kalendáře. Stornované zakázky se z kalendáře odstraní.</div>
                </div>
                {gcStatus && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ml-4 ${gcStatus.connected ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                    {gcStatus.connected ? 'Připojeno' : 'Nepřipojeno'}
                  </span>
                )}
              </div>

              {gcStatus && !gcStatus.connected && gcStatus.reason && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">{gcStatus.reason}</div>
              )}

              <div>
                <label className="text-xs text-stone-500 block mb-1">Google Calendar ID</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="např. abc123@group.calendar.google.com nebo primární: vasuzemail@gmail.com"
                    defaultValue={nastavData?.data?.google_calendar_id || ''}
                    onChange={e => setForm(f => ({ ...f, google_calendar_id: e.target.value }))}
                  />
                  <Btn variant="primary" onClick={() => { saveMut.mutate(form); setTimeout(() => refetchGcStatus(), 1000); }} disabled={saveMut.isPending}>
                    {saveMut.isPending ? 'Ukládám...' : 'Uložit'}
                  </Btn>
                </div>
                <div className="text-xs text-stone-400 mt-1">Kalendář ID najdete v Google Calendar → Nastavení kalendáře → ID kalendáře</div>
              </div>

              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">Jak nastavit:</div>
                <ol className="text-xs text-stone-500 space-y-1 list-decimal pl-4">
                  <li>V Google Cloud Console vytvořte <strong>Service Account</strong> a stáhněte JSON klíč</li>
                  <li>Nastavte proměnnou prostředí <code className="bg-stone-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> v <code className="bg-stone-100 px-1 rounded">backend/.env</code> (obsah celého JSON souboru)</li>
                  <li>V Google Calendar sdílejte váš kalendář s emailem service accountu (role: <strong>Správa událostí</strong>)</li>
                  <li>Zkopírujte Calendar ID (viz nastavení kalendáře) a vložte ho výše</li>
                  <li>Klikněte <strong>Uložit</strong> a ověřte stav připojení</li>
                </ol>
              </div>

              <div className="border-t border-stone-100 pt-4">
                <div className="text-xs font-medium text-stone-700 mb-2">Co se synchronizuje:</div>
                <div className="text-xs text-stone-500 space-y-1">
                  <div>• Zakázka změněna na stav <strong>Potvrzeno</strong> → event vytvořen/aktualizován v Google Kalendáři</div>
                  <div>• Zakázka změněna na stav <strong>Stornováno</strong> → event smazán z Google Kalendáře</div>
                  <div>• Editace potvrzené zakázky (datum, místo) → event automaticky aktualizován</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'kapacity' && nastavData && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-5">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">Kalendář kapacit – limity</div>
                <div className="text-xs text-stone-500">Nastavte denní kapacitní limity pro barevné označení vytíženosti v pohledu Kapacity v kalendáři. Dny nad 85 % jsou označeny červeně, nad 60 % oranžově.</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Max. počet akcí za den</label>
                  <input
                    type="number" min="0"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="např. 3"
                    defaultValue={nastavData?.data?.kapacity_max_akci_den || ''}
                    onChange={e => setForm(f => ({ ...f, kapacity_max_akci_den: e.target.value }))}
                  />
                  <div className="text-xs text-stone-400 mt-1">Hodnota 0 = neomezeno (bez barevného označení)</div>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Max. počet hostů za den</label>
                  <input
                    type="number" min="0"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="např. 500"
                    defaultValue={nastavData?.data?.kapacity_max_hoste_den || ''}
                    onChange={e => setForm(f => ({ ...f, kapacity_max_hoste_den: e.target.value }))}
                  />
                  <div className="text-xs text-stone-400 mt-1">Součet hostů ze všech akcí daného dne</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám...' : 'Uložit limity'}
                </Btn>
                <div className="flex items-center gap-3 text-xs text-stone-400">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"/>Volno (&lt;60 %)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"/>Vytíženo (60–85 %)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/>Plná kapacita (&gt;85 %)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'email' && nastavData && (
          <div className="space-y-4">
            {isSuperAdmin ? (
              <>
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">IMAP – příchozí pošta</div>
                <div className="text-xs text-stone-500">Připojení k e-mailovému účtu přes IMAP pro čtení a správu pošty přímo v CRM.</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-stone-500 block mb-1.5">IMAP server (host)</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="imap.vasdomena.cz"
                    defaultValue={nastavData?.data?.email_imap_host || ''}
                    onChange={e => setForm(f => ({ ...f, email_imap_host: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Port</label>
                  <input
                    type="number"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="993"
                    defaultValue={nastavData?.data?.email_imap_port || '993'}
                    onChange={e => setForm(f => ({ ...f, email_imap_port: e.target.value }))}
                  />
                </div>
                <div className="flex items-end pb-1 gap-3">
                  <label className="text-xs text-stone-500">TLS / SSL</label>
                  <select
                    className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    defaultValue={nastavData?.data?.email_imap_tls ?? 'true'}
                    onChange={e => setForm(f => ({ ...f, email_imap_tls: e.target.value }))}
                  >
                    <option value="true">Zapnuto (doporučeno)</option>
                    <option value="false">Vypnuto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Uživatelské jméno (e-mail)</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="info@vasdomena.cz"
                    defaultValue={nastavData?.data?.email_imap_user || ''}
                    onChange={e => setForm(f => ({ ...f, email_imap_user: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Heslo</label>
                  <input
                    type="password"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="••••••••"
                    defaultValue={nastavData?.data?.email_imap_pass || ''}
                    onChange={e => setForm(f => ({ ...f, email_imap_pass: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                    {saveMut.isPending ? 'Ukládám...' : 'Uložit nastavení'}
                </Btn>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">SMTP – odchozí pošta</div>
                <div className="text-xs text-stone-500">Konfigurace pro odesílání e-mailů. U většiny serverů je SMTP host stejný jako IMAP host. Na Render.com použijte port <strong>2525</strong> místo 587 (Render blokuje standardní SMTP porty).</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-stone-500 block mb-1.5">SMTP server (host)</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="smtp.vasdomena.cz"
                    value={form.email_smtp_host || ''}
                    onChange={e => setForm(f => ({ ...f, email_smtp_host: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Port</label>
                  <input
                    type="number"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="587"
                    value={form.email_smtp_port || '587'}
                    onChange={e => setForm(f => ({ ...f, email_smtp_port: e.target.value }))}
                  />
                </div>
                <div className="flex items-end pb-1 gap-3">
                  <label className="text-xs text-stone-500">Šifrování</label>
                  <select
                    className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={form.email_smtp_secure ?? 'false'}
                    onChange={e => setForm(f => ({ ...f, email_smtp_secure: e.target.value }))}
                  >
                    <option value="false">STARTTLS – port 587 / 2525 (doporučeno)</option>
                    <option value="true">SSL/TLS – port 465</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Uživatelské jméno (e-mail)</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="info@vasdomena.cz"
                    value={form.email_smtp_user || ''}
                    onChange={e => setForm(f => ({ ...f, email_smtp_user: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Heslo</label>
                  <input
                    type="password"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="••••••••"
                    value={form.email_smtp_pass || ''}
                    onChange={e => setForm(f => ({ ...f, email_smtp_pass: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-stone-500 block mb-1.5">Odesílací adresa (From)</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="Catering LD <info@vasdomena.cz>"
                    value={form.email_smtp_from || ''}
                    onChange={e => setForm(f => ({ ...f, email_smtp_from: e.target.value }))}
                  />
                </div>
              </div>
              <SmtpTestButton />

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                    {saveMut.isPending ? 'Ukládám...' : 'Uložit nastavení'}
                </Btn>
              </div>
            </div>
              </>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                Nastavení IMAP / SMTP připojení může upravovat pouze super admin.
              </div>
            )}

            {/* Šablony odpovědí */}
            <EmailSablonyManager />
          </div>
        )}

        {tab === 'integrace' && (
          <div className="space-y-4">
            {/* Tally.so */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">Tally.so – Poptávkový formulář</div>
                <div className="text-xs text-stone-500">Poptávky odeslané přes Tally.so formulář se automaticky uloží jako nová zakázka (stav: Nová poptávka) a vytvoří nebo doplní klienta.</div>
              </div>
              <div>
                <div className="text-xs text-stone-500 mb-1">Webhook URL (vložte do Tally → Integrations → Webhooks)</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-700 break-all select-all">
                    {window.location.origin}/api/tally/webhook
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/tally/webhook`); toast.success('URL zkopírováno'); }}
                    className="shrink-0 px-3 py-2 text-xs border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-600"
                  >Kopírovat</button>
                </div>
              </div>
              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">Jak nastavit:</div>
                <ol className="text-xs text-stone-500 space-y-1 list-decimal pl-4">
                  <li>V Tally otevřete svůj formulář → <strong>Integrate</strong> → <strong>Webhooks</strong></li>
                  <li>Klikněte <strong>Add webhook</strong> a vložte URL výše</li>
                  <li>Jako trigger zvolte <strong>New submission</strong></li>
                  <li>Uložte a otestujte testovacím odesláním formuláře</li>
                </ol>
              </div>
              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">Mapování polí formuláře:</div>
                <div className="text-xs text-stone-500">CRM rozpozná pole podle jejich <em>popisku (label)</em>. Doporučené názvy:</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-1">
                  {[
                    ['Jméno','jmeno / Křestní jméno'],
                    ['Příjmení','prijmeni / Příjmení'],
                    ['E-mail','email / E-mailová adresa'],
                    ['Telefon','telefon / Telefonní číslo'],
                    ['Firma','firma / Společnost / Company'],
                    ['Typ akce','typ akce / Druh akce'],
                    ['Datum','datum / Datum akce'],
                    ['Počet hostů','počet hostů / Hosté'],
                    ['Místo','místo / Venue / Location'],
                    ['Rozpočet','rozpočet / Budget'],
                    ['Zpráva','zpráva / Vzkaz / Poznámka'],
                  ].map(([crm, tally]) => (
                    <div key={crm} className="flex gap-1">
                      <span className="text-stone-400 w-20 shrink-0">{crm}:</span>
                      <span className="text-stone-600">{tally}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <strong>Povinné zabezpečení:</strong> Nastavte proměnnou prostředí <code className="bg-amber-100 px-1 rounded">TALLY_KEY</code> a stejný klíč zadejte v Tally jako <em>Secret key</em> (hlavička <code className="bg-amber-100 px-1 rounded">x-api-key</code>). Bez něj webhook požadavky odmítne.
              </div>
            </div>
          </div>
        )}

        {tab === 'login-log' && isSuperAdmin && (
          <div className="space-y-4">
            {/* Statistiky */}
            {loginLogData?.stats && (
              <div className="grid grid-cols-4 gap-3">
                {[
                  ['Celkem záznamů', loginLogData.stats.total, 'text-stone-700'],
                  ['Úspěšných', loginLogData.stats.uspesnych, 'text-green-700'],
                  ['Neúspěšných', loginLogData.stats.neuspesnych, 'text-red-600'],
                  ['Selhání za 24 h', loginLogData.stats.neuspesnych_24h, loginLogData.stats.neuspesnych_24h > 5 ? 'text-red-600 font-bold' : 'text-stone-700'],
                ].map(([label, val, cls]) => (
                  <div key={label} className="bg-white rounded-xl border border-stone-200 p-4 text-center">
                    <div className="text-xs text-stone-400 mb-1">{label}</div>
                    <div className={`text-2xl font-bold ${cls}`}>{val ?? '—'}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Filtry + akce */}
            <div className="bg-white rounded-xl border border-stone-200 p-4 flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="rounded" checked={loginFilter.only_failures}
                  onChange={e => setLoginFilter(f => ({ ...f, only_failures: e.target.checked }))}/>
                Jen neúspěšná přihlášení
              </label>
              <div className="flex-1"/>
              {isSuperAdmin && (
                <Btn size="sm" variant="ghost"
                  onClick={() => window.confirm('Smazat záznamy starší než 90 dní?') && deleteOldMut.mutate(90)}
                  disabled={deleteOldMut.isPending}>
                  <Trash2NS size={12}/> Smazat starší 90 dní
                </Btn>
              )}
              <Btn size="sm" onClick={() => refetchLog()}>Obnovit</Btn>
            </div>

            {/* Tabulka */}
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {loginLogLoading ? (
                <div className="p-8 text-center text-sm text-stone-400">Načítám...</div>
              ) : !loginLogData?.data?.length ? (
                <div className="p-8 text-center text-sm text-stone-400">Žádné záznamy</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 border-b border-stone-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Datum a čas</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Uživatel / E-mail</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Výsledek</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">IP adresa</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Prohlížeč</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {loginLogData.data.map(r => (
                        <tr key={r.id} className={r.uspech ? '' : 'bg-red-50/40'}>
                          <td className="px-4 py-2.5 text-xs text-stone-500 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString('cs-CZ')}
                          </td>
                          <td className="px-4 py-2.5">
                            {r.jmeno ? (
                              <div>
                                <div className="text-sm font-medium text-stone-800">{r.jmeno} {r.prijmeni}</div>
                                <div className="text-xs text-stone-400">{r.email}</div>
                              </div>
                            ) : (
                              <div className="text-sm text-stone-500">{r.email || '—'}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {r.uspech ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                                <ShieldCheck size={11}/> Úspěch
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium">
                                <ShieldAlert size={11}/>
                                {r.duvod === 'neaktivni_ucet' ? 'Neaktivní účet' : 'Chybné heslo'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-stone-500 font-mono">{r.ip_adresa || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-stone-400 max-w-[220px] truncate" title={r.user_agent}>
                            {r.user_agent ? r.user_agent.replace(/\(.*?\)/g, '').trim().split(' ')[0] : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'zaloha' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                  <Database size={16} className="text-stone-500"/>
                </div>
                <div>
                  <div className="text-sm font-semibold text-stone-800 mb-0.5">Záloha databáze</div>
                  <div className="text-xs text-stone-500">Stáhne kompletní zálohu všech dat CRM jako JSON soubor. Zálohu si ukládejte pravidelně na bezpečné místo.</div>
                </div>
              </div>

              {backupInfoLoading ? (
                <div className="text-xs text-stone-400">Načítám přehled...</div>
              ) : backupInfo?.counts ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {[
                    ['Zakázky', backupInfo.counts.zakazky],
                    ['Klienti', backupInfo.counts.klienti],
                    ['Personál', backupInfo.counts.personal],
                    ['Faktury', backupInfo.counts.faktury],
                    ['Nabídky', backupInfo.counts.nabidky],
                    ['Dokumenty', backupInfo.counts.dokumenty],
                    ['Ceník', backupInfo.counts.cenik],
                    ['Uživatelé', backupInfo.counts.uzivatele],
                  ].map(([label, count]) => (
                    <div key={label} className="bg-stone-50 rounded-lg p-2.5 text-center">
                      <div className="text-xs text-stone-400">{label}</div>
                      <div className="text-sm font-semibold text-stone-700 mt-0.5">{count ?? '—'}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-stone-100">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Automatické zálohy</label>
                  <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                    value={String(form.backup_auto_enabled ?? backupInfo?.settings?.autoEnabled ?? true)}
                    onChange={e => setForm(f => ({ ...f, backup_auto_enabled: e.target.value }))}>
                    <option value="true">Zapnuto</option>
                    <option value="false">Vypnuto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Čas auto-backupu</label>
                  <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
                    disabled={String(form.backup_auto_enabled ?? backupInfo?.settings?.autoEnabled ?? true) === 'false'}
                    value={form.backup_auto_time ?? backupInfo?.settings?.autoTime ?? '02:30'}
                    onChange={e => setForm(f => ({ ...f, backup_auto_time: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Retence (počet souborů)</label>
                  <input type="number" min="1" max="90" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={form.backup_retention_count ?? backupInfo?.settings?.retentionCount ?? 14}
                    onChange={e => setForm(f => ({ ...f, backup_retention_count: e.target.value }))}/>
                </div>
                <div className="rounded-lg bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-500 space-y-1">
                  <div>Poslední běh: <span className="font-medium text-stone-700">{backupInfo?.settings?.lastRunAt ? new Date(backupInfo.settings.lastRunAt).toLocaleString('cs-CZ') : '—'}</span></div>
                  <div>Stav: <span className={`font-medium ${formatBackupStatus(backupInfo?.settings?.lastStatus).className}`}>{formatBackupStatus(backupInfo?.settings?.lastStatus).label}</span></div>
                  {backupInfo?.settings?.lastError && <div className="text-red-600">{backupInfo.settings.lastError}</div>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100">
                <Btn onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám...' : 'Uložit nastavení záloh'}
                </Btn>
                <Btn variant="primary" onClick={handleRunBackup} disabled={backupRunLoading}>
                  <Database size={12}/>
                  {backupRunLoading ? 'Vytvářím serverovou zálohu...' : 'Vytvořit serverovou zálohu'}
                </Btn>
                <Btn variant="primary" onClick={handleDownloadBackup} disabled={backupLoading}>
                  <Download size={12}/>
                  {backupLoading ? 'Připravuji zálohu...' : 'Stáhnout zálohu (JSON)'}
                </Btn>
              </div>
            </div>

            {!!backupInfo?.files?.length && (
              <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
                <div className="text-sm font-semibold text-stone-800">Uložené serverové zálohy</div>
                {backupInfo.files.map((file) => (
                  <div key={file.name} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-stone-800 truncate">{file.name}</div>
                      <div className="text-xs text-stone-400">
                        {new Date(file.created_at).toLocaleString('cs-CZ')} · {formatFileSize(file.size)}
                      </div>
                    </div>
                    <button type="button" className="text-xs font-medium text-stone-600 hover:text-stone-900"
                      onClick={() => handleStoredBackupDownload(file.name)}>
                      Stáhnout
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!backupInfoLoading && backupInfo && !backupInfo.files?.length && (
              <div className="bg-white rounded-xl border border-dashed border-stone-200 p-5 text-sm text-stone-500">
                Zatím tu nejsou uložené žádné serverové zálohy. Vytvořte první ručně nebo počkejte na auto-backup.
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
              <div className="font-medium">Jak zálohu obnovit?</div>
              <p>Záloha je ve formátu JSON se strukturou tabulek. Pro obnovu kontaktujte správce systému nebo použijte přímý přístup k PostgreSQL databázi.</p>
              <p>Doporučujeme zálohu provádět alespoň jednou týdně, ideálně každý den.</p>
            </div>
          </div>
        )}
      </div>

      <Modal open={userModal} onClose={() => setUserModal(false)} title="Nový uživatel"
        footer={<><Btn onClick={() => setUserModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={() => userMut.mutate(userForm)} disabled={!userForm.jmeno||!userForm.email||userMut.isPending}>{userMut.isPending?'Ukládám...':'Přidat'}</Btn></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Jméno</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.jmeno} onChange={e=>setU('jmeno',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Příjmení</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.prijmeni} onChange={e=>setU('prijmeni',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">E-mail</label><input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.email} onChange={e=>setU('email',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Role</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.role} onChange={e=>setU('role',e.target.value)}>{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="text-xs text-stone-500 block mb-1">Telefon</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.telefon} onChange={e=>setU('telefon',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Heslo (výchozí)</label><input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="min. 8 znaků" value={userForm.heslo} onChange={e=>setU('heslo',e.target.value)}/></div>
        </div>
      </Modal>
    </div>
  );
}

export default NastaveniPage;



