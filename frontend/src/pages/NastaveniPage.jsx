import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { nastaveniApi, uzivateleApi, authApi, googleCalendarApi } from '../api';
import { useAuth as useAuthNS } from '../context/AuthContext';
import { PageHeader, Btn, Modal, Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, Settings, Trash2 as Trash2NS } from 'lucide-react';

export function NastaveniPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthNS();
  const [tab, setTab] = useState('firma');
  const [form, setForm] = useState({});
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ jmeno:'', prijmeni:'', email:'', heslo:'', role:'obchodnik', telefon:'' });
  const [passForm, setPassForm] = useState({ stare_heslo:'', nove_heslo:'', nove_heslo2:'' });

  const { data: nastavData } = useQuery({ queryKey:['nastaveni'], queryFn: nastaveniApi.get });
  const { data: uzivData }   = useQuery({ queryKey:['uzivatele'], queryFn: uzivateleApi.list, enabled: tab==='uziv' });

  useEffect(() => { if (nastavData?.data) setForm(nastavData.data); }, [nastavData]);

  const saveMut   = useMutation({ mutationFn: nastaveniApi.update, onSuccess: () => { qc.invalidateQueries({ queryKey: ['nastaveni'] }); toast.success('Nastavení uloženo'); } });
  const userMut   = useMutation({ mutationFn: uzivateleApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['uzivatele'] }); toast.success('Uživatel přidán'); setUserModal(false); } });
  const toggleMut = useMutation({ mutationFn: ({id,aktivni}) => uzivateleApi.update(id,{aktivni}), onSuccess: () => qc.invalidateQueries({ queryKey: ['uzivatele'] }) });
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

  const TABS = [['firma','Profil firmy'],['uziv','Uživatelé'],['heslo','Změna hesla'],['podpis','E-mail podpis'],['notif','Notifikace'],['integrace','Integrace'],['google','Google Kalendář'],['kapacity','Kapacity'],['email','E-mail (IMAP)']];
  const [podpisPreview, setPodpisPreview] = useState(false);

  const { data: gcStatus, refetch: refetchGcStatus } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: googleCalendarApi.status,
    enabled: tab === 'google',
    retry: false,
    select: (r) => r.data,
  });
  const uzivatele = uzivData?.data?.data || [];
  const setU = (k,v) => setUserForm(f=>({...f,[k]:v}));
  const ROLES = {admin:'Administrátor', obchodnik:'Obchodník / koordinátor', provoz:'Provoz / realizace'};

  return (
    <div>
      <PageHeader title="Nastavení"/>
      <div className="bg-white border-b border-stone-100 px-6 flex">
        {TABS.map(([k,l]) => (
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
                <Btn size="sm" onClick={() => { qc.clear(); qc.invalidateQueries(); toast.success('Cache vymazána, data se obnovují…'); }}>Vymazat cache</Btn>
              </div>
              {[['firma_nazev','Název firmy'],['firma_ico','IČO'],['firma_dic','DIČ'],['firma_adresa','Adresa'],['firma_email','E-mail'],['firma_telefon','Telefon'],['firma_web','Web'],['firma_iban','Bankovní účet (IBAN)']].map(([k,l])=>(
                <div key={k}><label className="text-xs text-stone-500 block mb-1">{l}</label>
                  <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    defaultValue={nastavData?.data?.[k]||''} onChange={e => setForm(f=>({...f,[k]:e.target.value}))}/>
                </div>
              ))}
              <div className="flex justify-end">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit změny'}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {tab === 'uziv' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Btn variant="primary" size="sm" onClick={() => setUserModal(true)}><Plus size={12}/> Nový uživatel</Btn>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-50">
              {uzivatele.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">{u.jmeno?.[0]}{u.prijmeni?.[0]}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-800">{u.jmeno} {u.prijmeni}</div>
                    <div className="text-xs text-stone-400">{u.email} · {ROLES[u.role]||u.role}</div>
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
                {passMut.isPending ? 'Měním…' : 'Změnit heslo'}
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
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit podpis'}
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
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <p className="text-sm text-stone-500">Nastavení notifikací bude dostupné po propojení s e-mailovým systémem.</p>
          </div>
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
                    {gcStatus.connected ? '✓ Připojeno' : 'Nepřipojeno'}
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
                    {saveMut.isPending ? 'Ukládám…' : 'Uložit'}
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
              <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit limity'}
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
              <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit nastavení'}
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
              <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit nastavení'}
                </Btn>
              </div>
            </div>
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
                <strong>Volitelné zabezpečení:</strong> Nastavte proměnnou prostředí <code className="bg-amber-100 px-1 rounded">TALLY_KEY</code> a stejný klíč zadejte v Tally jako <em>Secret key</em> (hlavička <code className="bg-amber-100 px-1 rounded">x-api-key</code>).
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal open={userModal} onClose={() => setUserModal(false)} title="Nový uživatel"
        footer={<><Btn onClick={() => setUserModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={() => userMut.mutate(userForm)} disabled={!userForm.jmeno||!userForm.email||userMut.isPending}>{userMut.isPending?'Ukládám…':'Přidat'}</Btn></>}>
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
