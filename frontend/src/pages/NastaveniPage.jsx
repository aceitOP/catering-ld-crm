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

function formatBackupStatus(status) {
  if (status === 'success') return { label: 'V poĹ™Ăˇdku', className: 'text-emerald-700' };
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
  const [form, setForm] = useState({ nazev: '', predmet_prefix: '', telo: '', poradi: 0 });

  const createMut = useMutation({
    mutationFn: (d) => emailApi.createSablona(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-sablony'] }); setEditing(null); toast.success('Ĺ ablona pĹ™idĂˇna'); },
    onError: () => toast.error('Chyba pĹ™i uklĂˇdĂˇnĂ­'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => emailApi.updateSablona(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-sablony'] }); setEditing(null); toast.success('Ĺ ablona upravena'); },
    onError: () => toast.error('Chyba pĹ™i uklĂˇdĂˇnĂ­'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => emailApi.deleteSablona(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-sablony'] }),
  });

  const openNew  = () => { setForm({ nazev: '', predmet_prefix: '', telo: '', poradi: 0 }); setEditing({}); };
  const openEdit = (s) => { setForm({ nazev: s.nazev, predmet_prefix: s.predmet_prefix || '', telo: s.telo, poradi: s.poradi }); setEditing(s); };
  const save     = () => editing?.id ? updateMut.mutate({ id: editing.id, ...form }) : createMut.mutate(form);

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-stone-800">Ĺ ablony odpovÄ›dĂ­</div>
          <div className="text-xs text-stone-500">PĹ™ipravenĂ© texty pro rychlĂ© vloĹľenĂ­ pĹ™i psanĂ­ e-mailu</div>
        </div>
        <Btn size="sm" onClick={openNew}><Plus size={12}/> PĹ™idat</Btn>
      </div>

      {sablony.length === 0 && !editing && (
        <div className="text-xs text-stone-400 py-3 text-center">Ĺ˝ĂˇdnĂ© Ĺˇablony - kliknÄ›te PĹ™idat</div>
      )}

      {sablony.map(s => (
        <div key={s.id} className="flex items-start justify-between gap-3 py-2 border-t border-stone-100">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-stone-800">{s.nazev}</div>
            {s.predmet_prefix && <div className="text-xs text-stone-400">Předmět: {s.predmet_prefix}</div>}
            <div className="text-xs text-stone-500 truncate mt-0.5">{s.telo?.slice(0, 80)}{s.telo?.length > 80 ? '...' : ''}</div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => openEdit(s)} className="p-1 text-stone-400 hover:text-stone-700 rounded transition-colors"><Pencil size={12}/></button>
            <button onClick={() => { if (confirm('Smazat Ĺˇablonu?')) deleteMut.mutate(s.id); }}
              className="p-1 text-stone-300 hover:text-red-500 rounded transition-colors"><Trash2NS size={12}/></button>
          </div>
        </div>
      ))}

      {editing !== null && (
        <div className="border-t border-stone-100 pt-3 space-y-2">
          <div className="text-xs font-semibold text-stone-700">{editing?.id ? 'Upravit Ĺˇablonu' : 'NovĂˇ Ĺˇablona'}</div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-stone-400 block mb-0.5">NĂˇzev *</label>
              <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                value={form.nazev} onChange={e => setForm(f=>({...f, nazev: e.target.value}))} autoFocus/></div>
            <div><label className="text-xs text-stone-400 block mb-0.5">Prefix pĹ™edmÄ›tu</label>
              <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                placeholder="PotvrzenĂ­: / NabĂ­dka:" value={form.predmet_prefix} onChange={e => setForm(f=>({...f, predmet_prefix: e.target.value}))}/></div>
          </div>
          <div><label className="text-xs text-stone-400 block mb-0.5">Text Ĺˇablony</label>
            <textarea rows={4} className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none resize-none"
              placeholder="VĂˇĹľenĂ˝ zĂˇkaznĂ­ku, potvrzujeme VĂˇĹˇ termĂ­n..."
              value={form.telo} onChange={e => setForm(f=>({...f, telo: e.target.value}))}/></div>
          <div className="flex gap-2 pt-1">
            <Btn size="sm" onClick={() => setEditing(null)}>ZruĹˇit</Btn>
            <Btn size="sm" variant="primary" onClick={save}
              disabled={!form.nazev || createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit Ĺˇablonu'}
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
        {testing ? 'Testuji spojenĂ­...' : 'Otestovat SMTP pĹ™ipojenĂ­'}
      </button>
      {result && (
        <div className={`rounded-lg p-3 text-xs space-y-1 ${result.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
          <div className="font-semibold">{result.ok ? 'PĹ™ipojenĂ­ ĂşspÄ›ĹˇnĂ©' : 'PĹ™ipojenĂ­ selhalo'}</div>
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
      toast.success('NastavenĂ­ uloĹľeno');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'NastavenĂ­ se nepodaĹ™ilo uloĹľit'),
  });
  const userMut   = useMutation({
    mutationFn: uzivateleApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uzivatele'] });
      toast.success('UĹľivatel pĹ™idĂˇn');
      setUserModal(false);
      setUserForm({ jmeno:'', prijmeni:'', email:'', heslo:'', role:'uzivatel', telefon:'' });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'UĹľivatele se nepodaĹ™ilo pĹ™idat'),
  });
  const toggleMut = useMutation({
    mutationFn: ({id,aktivni}) => uzivateleApi.update(id,{aktivni}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uzivatele'] });
      toast.success('Stav uĹľivatele byl upraven');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Stav uĹľivatele se nepodaĹ™ilo zmÄ›nit'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => uzivateleApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uzivatele'] }); toast.success('UĹľivatel smazĂˇn'); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Chyba pĹ™i mazĂˇnĂ­'),
  });
  const passMut  = useMutation({
    mutationFn: (d) => authApi.changePassword({ stare_heslo: d.stare_heslo, nove_heslo: d.nove_heslo }),
    onSuccess: () => { toast.success('Heslo bylo ĂşspÄ›ĹˇnÄ› zmÄ›nÄ›no'); setPassForm({ stare_heslo:'', nove_heslo:'', nove_heslo2:'' }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Chyba pĹ™i zmÄ›nÄ› hesla'),
  });

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const TABS = [['firma','Profil firmy'],...(isSuperAdmin ? [['moduly','Moduly']] : []),['uziv','UĹľivatelĂ©'],['heslo','ZmÄ›na hesla'],['podpis','E-mail podpis'],['notif','Notifikace'],['integrace','Integrace'],['google','Google KalendĂˇĹ™'],['kapacity','Kapacity'],['email','E-mail (IMAP)'],['zaloha','ZĂˇlohy'],['login-log','PĹ™ihlĂˇĹˇenĂ­']];
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
    onError: () => toast.error('Chyba pĹ™i mazĂˇnĂ­'),
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
      toast.success('ZĂˇloha staĹľena');
    } catch {
      toast.error('ZĂˇlohu se nepodaĹ™ilo vytvoĹ™it');
    } finally {
      setBackupLoading(false);
    }
  };
  const handleRunBackup = async () => {
    setBackupRunLoading(true);
    try {
      const res = await backupApi.run();
      await qc.invalidateQueries({ queryKey: ['backup-info'] });
      toast.success(res.data?.message || 'ZĂˇloha byla vytvoĹ™ena');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Serverovou zĂˇlohu se nepodaĹ™ilo vytvoĹ™it');
    } finally {
      setBackupRunLoading(false);
    }
  };
  const handleStoredBackupDownload = async (name) => {
    try {
      await backupApi.downloadFile(name);
      toast.success('ZĂˇloha staĹľena');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'ZĂˇlohu se nepodaĹ™ilo stĂˇhnout');
    }
  };
  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      toast.error('Logo musĂ­ bĂ˝t PNG, JPG, SVG nebo WEBP');
      return;
    }
    if (file.size > 512 * 1024) {
      toast.error('Logo mĹŻĹľe mĂ­t maximĂˇlnÄ› 512 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, app_logo_data_url: String(reader.result || '') }));
    };
    reader.onerror = () => toast.error('Logo se nepodaĹ™ilo naÄŤĂ­st');
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
    admin:    'AdministrĂˇtor',
    uzivatel: 'UĹľivatel',
  };

  return (
    <div>
      <PageHeader title="NastavenĂ­"/>
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
                  <div className="text-xs text-stone-400 mt-0.5">ZobrazujĂ­ se zastaralĂˇ data? VymaĹľte cache a naÄŤtÄ›te vĹˇe znovu.</div>
                </div>
                <Btn size="sm" onClick={() => { qc.clear(); qc.invalidateQueries(); toast.success('Cache vymazĂˇna, data se obnovujĂ­...'); }}>Vymazat cache</Btn>
              </div>
              {[['firma_nazev','NĂˇzev firmy'],['firma_ico','IÄŚO'],['firma_dic','DIÄŚ'],['firma_adresa','Adresa'],['firma_email','E-mail'],['firma_telefon','Telefon'],['firma_web','Web'],['firma_iban','BankovnĂ­ ĂşÄŤet (IBAN)']].map(([k,l])=>(
                <div key={k}><label className="text-xs text-stone-500 block mb-1">{l}</label>
                  <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    defaultValue={nastavData?.data?.[k]||''} onChange={e => setForm(f=>({...f,[k]:e.target.value}))}/>
                </div>
              ))}
              <div><label className="text-xs text-stone-500 block mb-1">NĂˇzev aplikace / &lt;title&gt;</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={form.app_title ?? nastavData?.data?.app_title ?? 'Catering CRM'}
                  onChange={e => setForm(f => ({ ...f, app_title: e.target.value }))}
                  placeholder="Catering CRM"/>
              </div>
              <div className="rounded-xl border border-stone-200 p-4 space-y-3">
                <div>
                  <div className="text-sm font-medium text-stone-800">BarevnĂˇ Ĺˇablona</div>
                  <div className="text-xs text-stone-500 mt-1">Vyberte jednu ze 4 nejbÄ›ĹľnÄ›jĹˇĂ­ch firemnĂ­ch barevnĂ˝ch variant.</div>
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
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-stone-800">Logo aplikace</div>
                    <div className="text-xs text-stone-500 mt-1">PouĹľije se v loginu i v hlaviÄŤce aplikace. KdyĹľ logo nevloĹľĂ­te, zobrazĂ­ se text Catering CRM.</div>
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
                    NahrĂˇt logo
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoChange}/>
                  </label>
                  {(form.app_logo_data_url ?? nastavData?.data?.app_logo_data_url) && (
                    <button type="button" className="px-3 py-2 text-xs font-medium border border-stone-200 rounded-lg hover:bg-stone-50"
                      onClick={() => setForm(f => ({ ...f, app_logo_data_url: '' }))}>
                      Odebrat logo
                    </button>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit zmÄ›ny'}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {tab === 'moduly' && isSuperAdmin && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800">AktivnĂ­ moduly instalace</div>
                <div className="text-xs text-stone-500 mt-1">VypnutĂ˝ modul zmizĂ­ z menu a backend zablokuje jeho endpointy. ZĂˇkladnĂ­ ÄŤĂˇsti CRM jako dashboard, zakĂˇzky, nabĂ­dky, klienti a nastavenĂ­ zĹŻstĂˇvajĂ­ vĹľdy aktivnĂ­.</div>
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
                  {saveMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit moduly'}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {tab === 'uziv' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Btn variant="primary" size="sm" onClick={openUserCreateModal}><Plus size={12}/> NovĂ˝ uĹľivatel</Btn>
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
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.aktivni?'bg-green-50 text-green-700':'bg-stone-100 text-stone-400'}`}>{u.aktivni?'AktivnĂ­':'NeaktivnĂ­'}</span>
                  <button onClick={() => toggleMut.mutate({id:u.id,aktivni:!u.aktivni})} className="text-xs text-stone-400 hover:text-stone-700">{u.aktivni?'Deaktivovat':'Aktivovat'}</button>
                  {String(u.id) !== String(currentUser?.id) && (
                    <button onClick={() => { if (window.confirm(`Opravdu smazat uĹľivatele ${u.jmeno} ${u.prijmeni}? Tato akce je nevratnĂˇ.`)) deleteMut.mutate(u.id); }}
                      className="p-1 text-stone-300 hover:text-red-500 transition-colors" title="Smazat uĹľivatele">
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
            <p className="text-sm text-stone-500 mb-2">ZmÄ›na platĂ­ pouze pro vĂˇĹˇ ĂşÄŤet. NovĂ© heslo musĂ­ mĂ­t alespoĹ 8 znakĹŻ.</p>
            <div>
              <label className="text-xs text-stone-500 block mb-1">StĂˇvajĂ­cĂ­ heslo</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                value={passForm.stare_heslo} onChange={e => setPassForm(f=>({...f, stare_heslo:e.target.value}))} autoComplete="current-password" />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">NovĂ© heslo</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                placeholder="min. 8 znakĹŻ" value={passForm.nove_heslo} onChange={e => setPassForm(f=>({...f, nove_heslo:e.target.value}))} autoComplete="new-password" />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">NovĂ© heslo (potvrzenĂ­)</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                value={passForm.nove_heslo2} onChange={e => setPassForm(f=>({...f, nove_heslo2:e.target.value}))} autoComplete="new-password" />
              {passForm.nove_heslo && passForm.nove_heslo2 && passForm.nove_heslo !== passForm.nove_heslo2 && (
                <p className="text-xs text-red-500 mt-1">Hesla se neshodujĂ­</p>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Btn variant="primary"
                onClick={() => passMut.mutate(passForm)}
                disabled={!passForm.stare_heslo || !passForm.nove_heslo || passForm.nove_heslo.length < 8 || passForm.nove_heslo !== passForm.nove_heslo2 || passMut.isPending}>
                {passMut.isPending ? 'MÄ›nĂ­m...' : 'ZmÄ›nit heslo'}
              </Btn>
            </div>
          </div>
        )}

        {tab === 'podpis' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">HTML podpis e-mailu</div>
                <div className="text-xs text-stone-500 mb-3">Podpis se automaticky pĹ™ipojĂ­ ke vĹˇem odchozĂ­m e-mailĹŻm (nabĂ­dky, komando, dÄ›kovacĂ­ maily). Zadejte libovolnĂ˝ HTML kĂłd.</div>
                <textarea
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none font-mono resize-y"
                  rows={10}
                  placeholder="<p>S pozdravem,<br><strong>JmĂ©no PĹ™Ă­jmenĂ­</strong><br>+420 123 456 789</p>"
                  defaultValue={nastavData?.data?.email_podpis_html || ''}
                  onChange={e => setForm(f => ({ ...f, email_podpis_html: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => setPodpisPreview(v => !v)} className="text-xs text-stone-500 hover:text-stone-700 underline underline-offset-2">
                  {podpisPreview ? 'SkrĂ˝t nĂˇhled' : 'Zobrazit nĂˇhled'}
                </button>
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit podpis'}
                </Btn>
              </div>
              {podpisPreview && (
                <div className="border border-stone-200 rounded-lg p-4 bg-stone-50">
                  <div className="text-xs text-stone-400 mb-2 uppercase tracking-wide font-medium">NĂˇhled</div>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: form.email_podpis_html || nastavData?.data?.email_podpis_html || '<em class="text-stone-400">Podpis je prĂˇzdnĂ˝</em>' }}
                  />
                </div>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
              <div className="font-semibold mb-1">Tipy pro HTML podpis:</div>
              <div>â€˘ PouĹľĂ­vejte inline styly: <code className="bg-blue-100 px-1 rounded">style="color:#333;"</code></div>
              <div>â€˘ Pro obrĂˇzek (logo): <code className="bg-blue-100 px-1 rounded">{'<img src="URL" style="height:40px;">'}</code></div>
              <div>â€˘ Pro odkaz: <code className="bg-blue-100 px-1 rounded">{'<a href="https://...">text</a>'}</code></div>
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
                  <div className="text-sm font-semibold text-stone-800 mb-0.5">Google KalendĂˇĹ™</div>
                  <div className="text-xs text-stone-500">PotvrzenĂ© zakĂˇzky se automaticky propisujĂ­ do sdĂ­lenĂ©ho firemnĂ­ho Google KalendĂˇĹ™e. StornovanĂ© zakĂˇzky se z kalendĂˇĹ™e odstranĂ­.</div>
                </div>
                {gcStatus && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ml-4 ${gcStatus.connected ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                    {gcStatus.connected ? 'PĹ™ipojeno' : 'NepĹ™ipojeno'}
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
                    placeholder="napĹ™. abc123@group.calendar.google.com nebo primĂˇrnĂ­: vasuzemail@gmail.com"
                    defaultValue={nastavData?.data?.google_calendar_id || ''}
                    onChange={e => setForm(f => ({ ...f, google_calendar_id: e.target.value }))}
                  />
                  <Btn variant="primary" onClick={() => { saveMut.mutate(form); setTimeout(() => refetchGcStatus(), 1000); }} disabled={saveMut.isPending}>
                    {saveMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit'}
                  </Btn>
                </div>
                <div className="text-xs text-stone-400 mt-1">KalendĂˇĹ™ ID najdete v Google Calendar â†’ NastavenĂ­ kalendĂˇĹ™e â†’ ID kalendĂˇĹ™e</div>
              </div>

              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">Jak nastavit:</div>
                <ol className="text-xs text-stone-500 space-y-1 list-decimal pl-4">
                  <li>V Google Cloud Console vytvoĹ™te <strong>Service Account</strong> a stĂˇhnÄ›te JSON klĂ­ÄŤ</li>
                  <li>Nastavte promÄ›nnou prostĹ™edĂ­ <code className="bg-stone-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> v <code className="bg-stone-100 px-1 rounded">backend/.env</code> (obsah celĂ©ho JSON souboru)</li>
                  <li>V Google Calendar sdĂ­lejte vĂˇĹˇ kalendĂˇĹ™ s emailem service accountu (role: <strong>SprĂˇva udĂˇlostĂ­</strong>)</li>
                  <li>ZkopĂ­rujte Calendar ID (viz nastavenĂ­ kalendĂˇĹ™e) a vloĹľte ho vĂ˝Ĺˇe</li>
                  <li>KliknÄ›te <strong>UloĹľit</strong> a ovÄ›Ĺ™te stav pĹ™ipojenĂ­</li>
                </ol>
              </div>

              <div className="border-t border-stone-100 pt-4">
                <div className="text-xs font-medium text-stone-700 mb-2">Co se synchronizuje:</div>
                <div className="text-xs text-stone-500 space-y-1">
                  <div>â€˘ ZakĂˇzka zmÄ›nÄ›na na stav <strong>Potvrzeno</strong> â†’ event vytvoĹ™en/aktualizovĂˇn v Google KalendĂˇĹ™i</div>
                  <div>â€˘ ZakĂˇzka zmÄ›nÄ›na na stav <strong>StornovĂˇno</strong> â†’ event smazĂˇn z Google KalendĂˇĹ™e</div>
                  <div>â€˘ Editace potvrzenĂ© zakĂˇzky (datum, mĂ­sto) â†’ event automaticky aktualizovĂˇn</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'kapacity' && nastavData && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-5">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">KalendĂˇĹ™ kapacit â€“ limity</div>
                <div className="text-xs text-stone-500">Nastavte dennĂ­ kapacitnĂ­ limity pro barevnĂ© oznaÄŤenĂ­ vytĂ­Ĺľenosti v pohledu Kapacity v kalendĂˇĹ™i. Dny nad 85 % jsou oznaÄŤeny ÄŤervenÄ›, nad 60 % oranĹľovÄ›.</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Max. poÄŤet akcĂ­ za den</label>
                  <input
                    type="number" min="0"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="napĹ™. 3"
                    defaultValue={nastavData?.data?.kapacity_max_akci_den || ''}
                    onChange={e => setForm(f => ({ ...f, kapacity_max_akci_den: e.target.value }))}
                  />
                  <div className="text-xs text-stone-400 mt-1">Hodnota 0 = neomezeno (bez barevnĂ©ho oznaÄŤenĂ­)</div>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Max. poÄŤet hostĹŻ za den</label>
                  <input
                    type="number" min="0"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="napĹ™. 500"
                    defaultValue={nastavData?.data?.kapacity_max_hoste_den || ''}
                    onChange={e => setForm(f => ({ ...f, kapacity_max_hoste_den: e.target.value }))}
                  />
                  <div className="text-xs text-stone-400 mt-1">SouÄŤet hostĹŻ ze vĹˇech akcĂ­ danĂ©ho dne</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit limity'}
                </Btn>
                <div className="flex items-center gap-3 text-xs text-stone-400">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"/>Volno (&lt;60 %)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"/>VytĂ­Ĺľeno (60â€“85 %)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/>PlnĂˇ kapacita (&gt;85 %)</span>
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
                <div className="text-sm font-semibold text-stone-800 mb-0.5">IMAP â€“ pĹ™Ă­chozĂ­ poĹˇta</div>
                <div className="text-xs text-stone-500">PĹ™ipojenĂ­ k e-mailovĂ©mu ĂşÄŤtu pĹ™es IMAP pro ÄŤtenĂ­ a sprĂˇvu poĹˇty pĹ™Ă­mo v CRM.</div>
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
                    <option value="true">Zapnuto (doporuÄŤeno)</option>
                    <option value="false">Vypnuto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">UĹľivatelskĂ© jmĂ©no (e-mail)</label>
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
                    placeholder="â€˘â€˘â€˘â€˘â€˘â€˘â€˘â€˘"
                    defaultValue={nastavData?.data?.email_imap_pass || ''}
                    onChange={e => setForm(f => ({ ...f, email_imap_pass: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                    {saveMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit nastavenĂ­'}
                </Btn>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">SMTP â€“ odchozĂ­ poĹˇta</div>
                <div className="text-xs text-stone-500">Konfigurace pro odesĂ­lĂˇnĂ­ e-mailĹŻ. U vÄ›tĹˇiny serverĹŻ je SMTP host stejnĂ˝ jako IMAP host. Na Render.com pouĹľijte port <strong>2525</strong> mĂ­sto 587 (Render blokuje standardnĂ­ SMTP porty).</div>
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
                  <label className="text-xs text-stone-500">Ĺ ifrovĂˇnĂ­</label>
                  <select
                    className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={form.email_smtp_secure ?? 'false'}
                    onChange={e => setForm(f => ({ ...f, email_smtp_secure: e.target.value }))}
                  >
                    <option value="false">STARTTLS â€“ port 587 / 2525 (doporuÄŤeno)</option>
                    <option value="true">SSL/TLS â€“ port 465</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">UĹľivatelskĂ© jmĂ©no (e-mail)</label>
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
                    placeholder="â€˘â€˘â€˘â€˘â€˘â€˘â€˘â€˘"
                    value={form.email_smtp_pass || ''}
                    onChange={e => setForm(f => ({ ...f, email_smtp_pass: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-stone-500 block mb-1.5">OdesĂ­lacĂ­ adresa (From)</label>
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
                    {saveMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit nastavenĂ­'}
                </Btn>
              </div>
            </div>
              </>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                NastavenĂ­ IMAP / SMTP pĹ™ipojenĂ­ mĹŻĹľe upravovat pouze super admin.
              </div>
            )}

            {/* Ĺ ablony odpovÄ›dĂ­ */}
            <EmailSablonyManager />
          </div>
        )}

        {tab === 'integrace' && (
          <div className="space-y-4">
            {/* Tally.so */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">Tally.so â€“ PoptĂˇvkovĂ˝ formulĂˇĹ™</div>
                <div className="text-xs text-stone-500">PoptĂˇvky odeslanĂ© pĹ™es Tally.so formulĂˇĹ™ se automaticky uloĹľĂ­ jako novĂˇ zakĂˇzka (stav: NovĂˇ poptĂˇvka) a vytvoĹ™Ă­ nebo doplnĂ­ klienta.</div>
              </div>
              <div>
                <div className="text-xs text-stone-500 mb-1">Webhook URL (vloĹľte do Tally â†’ Integrations â†’ Webhooks)</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-700 break-all select-all">
                    {window.location.origin}/api/tally/webhook
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/tally/webhook`); toast.success('URL zkopĂ­rovĂˇno'); }}
                    className="shrink-0 px-3 py-2 text-xs border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-600"
                  >KopĂ­rovat</button>
                </div>
              </div>
              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">Jak nastavit:</div>
                <ol className="text-xs text-stone-500 space-y-1 list-decimal pl-4">
                  <li>V Tally otevĹ™ete svĹŻj formulĂˇĹ™ â†’ <strong>Integrate</strong> â†’ <strong>Webhooks</strong></li>
                  <li>KliknÄ›te <strong>Add webhook</strong> a vloĹľte URL vĂ˝Ĺˇe</li>
                  <li>Jako trigger zvolte <strong>New submission</strong></li>
                  <li>UloĹľte a otestujte testovacĂ­m odeslĂˇnĂ­m formulĂˇĹ™e</li>
                </ol>
              </div>
              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">MapovĂˇnĂ­ polĂ­ formulĂˇĹ™e:</div>
                <div className="text-xs text-stone-500">CRM rozpoznĂˇ pole podle jejich <em>popisku (label)</em>. DoporuÄŤenĂ© nĂˇzvy:</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-1">
                  {[
                    ['JmĂ©no','jmeno / KĹ™estnĂ­ jmĂ©no'],
                    ['PĹ™Ă­jmenĂ­','prijmeni / PĹ™Ă­jmenĂ­'],
                    ['E-mail','email / E-mailovĂˇ adresa'],
                    ['Telefon','telefon / TelefonnĂ­ ÄŤĂ­slo'],
                    ['Firma','firma / SpoleÄŤnost / Company'],
                    ['Typ akce','typ akce / Druh akce'],
                    ['Datum','datum / Datum akce'],
                    ['PoÄŤet hostĹŻ','poÄŤet hostĹŻ / HostĂ©'],
                    ['MĂ­sto','mĂ­sto / Venue / Location'],
                    ['RozpoÄŤet','rozpoÄŤet / Budget'],
                    ['ZprĂˇva','zprĂˇva / Vzkaz / PoznĂˇmka'],
                  ].map(([crm, tally]) => (
                    <div key={crm} className="flex gap-1">
                      <span className="text-stone-400 w-20 shrink-0">{crm}:</span>
                      <span className="text-stone-600">{tally}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <strong>PovinnĂ© zabezpeÄŤenĂ­:</strong> Nastavte promÄ›nnou prostĹ™edĂ­ <code className="bg-amber-100 px-1 rounded">TALLY_KEY</code> a stejnĂ˝ klĂ­ÄŤ zadejte v Tally jako <em>Secret key</em> (hlaviÄŤka <code className="bg-amber-100 px-1 rounded">x-api-key</code>). Bez nÄ›j webhook poĹľadavky odmĂ­tne.
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
                  ['Celkem zĂˇznamĹŻ', loginLogData.stats.total, 'text-stone-700'],
                  ['ĂšspÄ›ĹˇnĂ˝ch', loginLogData.stats.uspesnych, 'text-green-700'],
                  ['NeĂşspÄ›ĹˇnĂ˝ch', loginLogData.stats.neuspesnych, 'text-red-600'],
                  ['SelhĂˇnĂ­ za 24 h', loginLogData.stats.neuspesnych_24h, loginLogData.stats.neuspesnych_24h > 5 ? 'text-red-600 font-bold' : 'text-stone-700'],
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
                Jen neĂşspÄ›ĹˇnĂˇ pĹ™ihlĂˇĹˇenĂ­
              </label>
              <div className="flex-1"/>
              {isSuperAdmin && (
                <Btn size="sm" variant="ghost"
                  onClick={() => window.confirm('Smazat zĂˇznamy starĹˇĂ­ neĹľ 90 dnĂ­?') && deleteOldMut.mutate(90)}
                  disabled={deleteOldMut.isPending}>
                  <Trash2NS size={12}/> Smazat starĹˇĂ­ 90 dnĂ­
                </Btn>
              )}
              <Btn size="sm" onClick={() => refetchLog()}>Obnovit</Btn>
            </div>

            {/* Tabulka */}
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {loginLogLoading ? (
                <div className="p-8 text-center text-sm text-stone-400">NaÄŤĂ­tĂˇm...</div>
              ) : !loginLogData?.data?.length ? (
                <div className="p-8 text-center text-sm text-stone-400">Ĺ˝ĂˇdnĂ© zĂˇznamy</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 border-b border-stone-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">Datum a ÄŤas</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">UĹľivatel / E-mail</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">VĂ˝sledek</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">IP adresa</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-500">ProhlĂ­ĹľeÄŤ</th>
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
                                <ShieldCheck size={11}/> ĂšspÄ›ch
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium">
                                <ShieldAlert size={11}/>
                                {r.duvod === 'neaktivni_ucet' ? 'NeaktivnĂ­ ĂşÄŤet' : 'ChybnĂ© heslo'}
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
                  <div className="text-sm font-semibold text-stone-800 mb-0.5">ZĂˇloha databĂˇze</div>
                  <div className="text-xs text-stone-500">StĂˇhne kompletnĂ­ zĂˇlohu vĹˇech dat CRM jako JSON soubor. ZĂˇlohu si uklĂˇdejte pravidelnÄ› na bezpeÄŤnĂ© mĂ­sto.</div>
                </div>
              </div>

              {backupInfoLoading ? (
                <div className="text-xs text-stone-400">NaÄŤĂ­tĂˇm pĹ™ehled...</div>
              ) : backupInfo?.counts ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {[
                    ['ZakĂˇzky', backupInfo.counts.zakazky],
                    ['Klienti', backupInfo.counts.klienti],
                    ['PersonĂˇl', backupInfo.counts.personal],
                    ['Faktury', backupInfo.counts.faktury],
                    ['NabĂ­dky', backupInfo.counts.nabidky],
                    ['Dokumenty', backupInfo.counts.dokumenty],
                    ['CenĂ­k', backupInfo.counts.cenik],
                    ['UĹľivatelĂ©', backupInfo.counts.uzivatele],
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
                  <label className="text-xs text-stone-500 block mb-1">AutomatickĂ© zĂˇlohy</label>
                  <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                    value={String(form.backup_auto_enabled ?? backupInfo?.settings?.autoEnabled ?? true)}
                    onChange={e => setForm(f => ({ ...f, backup_auto_enabled: e.target.value }))}>
                    <option value="true">Zapnuto</option>
                    <option value="false">Vypnuto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">ÄŚas auto-backupu</label>
                  <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
                    disabled={String(form.backup_auto_enabled ?? backupInfo?.settings?.autoEnabled ?? true) === 'false'}
                    value={form.backup_auto_time ?? backupInfo?.settings?.autoTime ?? '02:30'}
                    onChange={e => setForm(f => ({ ...f, backup_auto_time: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Retence (poÄŤet souborĹŻ)</label>
                  <input type="number" min="1" max="90" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={form.backup_retention_count ?? backupInfo?.settings?.retentionCount ?? 14}
                    onChange={e => setForm(f => ({ ...f, backup_retention_count: e.target.value }))}/>
                </div>
                <div className="rounded-lg bg-stone-50 border border-stone-200 px-3 py-2 text-xs text-stone-500 space-y-1">
                  <div>PoslednĂ­ bÄ›h: <span className="font-medium text-stone-700">{backupInfo?.settings?.lastRunAt ? new Date(backupInfo.settings.lastRunAt).toLocaleString('cs-CZ') : '—'}</span></div>
                  <div>Stav: <span className={`font-medium ${formatBackupStatus(backupInfo?.settings?.lastStatus).className}`}>{formatBackupStatus(backupInfo?.settings?.lastStatus).label}</span></div>
                  {backupInfo?.settings?.lastError && <div className="text-red-600">{backupInfo.settings.lastError}</div>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100">
                <Btn onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'UklĂˇdĂˇm...' : 'UloĹľit nastavenĂ­ zĂˇloh'}
                </Btn>
                <Btn variant="primary" onClick={handleRunBackup} disabled={backupRunLoading}>
                  <Database size={12}/>
                  {backupRunLoading ? 'VytvĂˇĹ™Ă­m serverovou zĂˇlohu...' : 'VytvoĹ™it serverovou zĂˇlohu'}
                </Btn>
                <Btn variant="primary" onClick={handleDownloadBackup} disabled={backupLoading}>
                  <Download size={12}/>
                  {backupLoading ? 'PĹ™ipravuji zĂˇlohu...' : 'StĂˇhnout zĂˇlohu (JSON)'}
                </Btn>
              </div>
            </div>

            {!!backupInfo?.files?.length && (
              <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
                <div className="text-sm font-semibold text-stone-800">UloĹľenĂ© serverovĂ© zĂˇlohy</div>
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
                      StĂˇhnout
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!backupInfoLoading && backupInfo && !backupInfo.files?.length && (
              <div className="bg-white rounded-xl border border-dashed border-stone-200 p-5 text-sm text-stone-500">
                ZatĂ­m tu nejsou uloĹľenĂ© ĹľĂˇdnĂ© serverovĂ© zĂˇlohy. VytvoĹ™te prvnĂ­ ruÄŤnÄ› nebo poÄŤkejte na auto-backup.
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
              <div className="font-medium">Jak zĂˇlohu obnovit?</div>
              <p>ZĂˇloha je ve formĂˇtu JSON se strukturou tabulek. Pro obnovu kontaktujte sprĂˇvce systĂ©mu nebo pouĹľijte pĹ™Ă­mĂ˝ pĹ™Ă­stup k PostgreSQL databĂˇzi.</p>
              <p>DoporuÄŤujeme zĂˇlohu provĂˇdÄ›t alespoĹ jednou tĂ˝dnÄ›, ideĂˇlnÄ› kaĹľdĂ˝ den.</p>
            </div>
          </div>
        )}
      </div>

      <Modal open={userModal} onClose={() => setUserModal(false)} title="NovĂ˝ uĹľivatel"
        footer={<><Btn onClick={() => setUserModal(false)}>ZruĹˇit</Btn><Btn variant="primary" onClick={() => userMut.mutate(userForm)} disabled={!userForm.jmeno||!userForm.email||userMut.isPending}>{userMut.isPending?'UklĂˇdĂˇm...':'PĹ™idat'}</Btn></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">JmĂ©no</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.jmeno} onChange={e=>setU('jmeno',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">PĹ™Ă­jmenĂ­</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.prijmeni} onChange={e=>setU('prijmeni',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">E-mail</label><input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.email} onChange={e=>setU('email',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Role</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.role} onChange={e=>setU('role',e.target.value)}>{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="text-xs text-stone-500 block mb-1">Telefon</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.telefon} onChange={e=>setU('telefon',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Heslo (vĂ˝chozĂ­)</label><input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="min. 8 znakĹŻ" value={userForm.heslo} onChange={e=>setU('heslo',e.target.value)}/></div>
        </div>
      </Modal>
    </div>
  );
}

export default NastaveniPage;



