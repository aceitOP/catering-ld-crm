import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zakazkyApi, personalApi, dokumentyApi } from '../api';
import { StavBadge, TypBadge, formatCena, formatDatum, Spinner, Btn, Modal } from '../components/ui';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronRight, Send, Heart, Printer, Pencil, Upload, UserPlus, Trash2, Search } from 'lucide-react';
import { printKomandoPdf } from '../utils/print';

const WORKFLOW = [
  { stav: 'nova_poptavka',      label: 'Nová poptávka' },
  { stav: 'rozpracovano',       label: 'Rozpracováno' },
  { stav: 'nabidka_pripravena', label: 'Nabídka připravena' },
  { stav: 'nabidka_odeslana',   label: 'Nabídka odeslána' },
  { stav: 'ceka_na_vyjadreni',  label: 'Čeká na vyjádření' },
  { stav: 'potvrzeno',          label: 'Potvrzeno' },
  { stav: 've_priprave',        label: 'Ve přípravě' },
  { stav: 'realizovano',        label: 'Realizováno' },
  { stav: 'uzavreno',           label: 'Uzavřeno' },
];

const TYP_OPTIONS = [
  {v:'svatba',l:'Svatba'},{v:'soukroma_akce',l:'Soukromá akce'},{v:'firemni_akce',l:'Firemní akce'},
  {v:'zavoz',l:'Závoz'},{v:'bistro',l:'Bistro'},
];

export default function ZakazkaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef(null);

  const [tab, setTab] = useState('detaily');
  const [stavModal, setStavModal] = useState(false);
  const [novyStav, setNovyStav] = useState('');
  const [stavPozn, setStavPozn] = useState('');
  const [komandoModal, setKomandoModal] = useState(false);
  const [komandoPozn, setKomandoPozn] = useState('');
  const [dekujemeModal, setDekujemeModal] = useState(false);
  const [dekujemeForm, setDekujemeForm] = useState({ to: '', text: '' });

  // Edit zakázka
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Personál modal
  const [personalModal, setPersonalModal] = useState(false);
  const [personalSearch, setPersonalSearch] = useState('');
  const [personalForm, setPersonalForm] = useState({ personal_id: '', role_na_akci: '', cas_prichod: '', cas_odchod: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['zakazka', id],
    queryFn: () => zakazkyApi.get(id),
  });

  const { data: personalListData } = useQuery({
    queryKey: ['personal-list', personalSearch],
    queryFn: () => personalApi.list({ q: personalSearch, limit: 50 }),
    enabled: personalModal,
  });

  const stavMut = useMutation({
    mutationFn: ({ stav, poznamka }) => zakazkyApi.setStav(id, { stav, poznamka }),
    onSuccess: () => { qc.invalidateQueries(['zakazka', id]); toast.success('Stav zakázky aktualizován'); setStavModal(false); },
    onError: () => toast.error('Nepodařilo se změnit stav'),
  });

  const komandoMut = useMutation({
    mutationFn: (d) => zakazkyApi.komando(id, d),
    onSuccess: (res) => { toast.success(res.data.message); setKomandoModal(false); setKomandoPozn(''); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při odesílání komanda'),
  });

  const dekujemeMut = useMutation({
    mutationFn: (d) => zakazkyApi.dekujeme(id, d),
    onSuccess: (res) => { toast.success(res.data.message); setDekujemeModal(false); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při odesílání emailu'),
  });

  const editMut = useMutation({
    mutationFn: (d) => zakazkyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['zakazka', id]); toast.success('Zakázka uložena'); setEditModal(false); },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const addPersonalMut = useMutation({
    mutationFn: (d) => personalApi.priradZakazku(d.personal_id, { zakazka_id: id, role_na_akci: d.role_na_akci, cas_prichod: d.cas_prichod, cas_odchod: d.cas_odchod }),
    onSuccess: () => { qc.invalidateQueries(['zakazka', id]); toast.success('Personál přiřazen'); setPersonalModal(false); setPersonalForm({ personal_id: '', role_na_akci: '', cas_prichod: '', cas_odchod: '' }); },
    onError: () => toast.error('Chyba při přiřazování personálu'),
  });

  const removePersonalMut = useMutation({
    mutationFn: (pid) => zakazkyApi.removePersonal(id, pid),
    onSuccess: () => { qc.invalidateQueries(['zakazka', id]); toast.success('Personál odebrán'); },
    onError: () => toast.error('Chyba při odebírání personálu'),
  });

  const uploadMut = useMutation({
    mutationFn: (formData) => dokumentyApi.upload(formData),
    onSuccess: () => { qc.invalidateQueries(['zakazka', id]); toast.success('Dokument nahrán'); },
    onError: () => toast.error('Chyba při nahrávání dokumentu'),
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('soubor', file);
    fd.append('zakazka_id', id);
    fd.append('kategorie', 'interni');
    uploadMut.mutate(fd);
    e.target.value = '';
  };

  const openEdit = () => {
    if (!z) return;
    setEditForm({
      nazev: z.nazev || '', typ: z.typ || '', datum_akce: z.datum_akce?.slice(0, 10) || '',
      cas_zacatek: z.cas_zacatek || '', cas_konec: z.cas_konec || '', misto: z.misto || '',
      pocet_hostu: z.pocet_hostu || '', rozpocet_klienta: z.rozpocet_klienta || '',
      cena_celkem: z.cena_celkem || '', cena_naklady: z.cena_naklady || '',
      zaloha: z.zaloha || '', doplatek: z.doplatek || '',
      poznamka_klient: z.poznamka_klient || '', poznamka_interni: z.poznamka_interni || '',
    });
    setEditModal(true);
  };

  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  const z = data?.data;
  if (!z) return <div className="p-6 text-stone-500">Zakázka nenalezena</div>;

  const curIdx = WORKFLOW.findIndex(s => s.stav === z.stav);
  const personalList = personalListData?.data?.data || personalListData?.data || [];

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-6 py-4">
        <button onClick={() => navigate('/zakazky')}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 mb-3 transition-colors">
          <ArrowLeft size={12} /> Zakázky
        </button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-base font-semibold text-stone-900">{z.nazev}</h1>
              <TypBadge typ={z.typ} />
              <StavBadge stav={z.stav} />
            </div>
            <div className="text-xs text-stone-400">{z.cislo} · Vytvořeno {formatDatum(z.created_at)}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Btn size="sm" onClick={openEdit}><Pencil size={12}/> Upravit</Btn>
            <Btn size="sm" onClick={() => { setNovyStav(z.stav); setStavModal(true); }}>
              Změnit stav
            </Btn>
            <Btn size="sm" onClick={() => { setKomandoPozn(''); setKomandoModal(true); }}>
              <Send size={12}/> Komando e-mail
            </Btn>
            <Btn size="sm" onClick={() => printKomandoPdf(z)}>
              <Printer size={12}/> Komando PDF
            </Btn>
            <Btn size="sm" onClick={() => { setDekujemeForm({ to: z.klient_email || '', text: '' }); setDekujemeModal(true); }}>
              <Heart size={12}/> Děkovací email
            </Btn>
            <Btn size="sm" variant="primary" onClick={() => navigate(`/nabidky/${id}/edit`)}>
              Nabídka
            </Btn>
          </div>
        </div>
      </div>

      {/* Workflow */}
      <div className="bg-white border-b border-stone-100 px-6 py-3 overflow-x-auto">
        <div className="flex items-center gap-0 min-w-max">
          {WORKFLOW.map((s, i) => {
            const done    = i < curIdx;
            const current = i === curIdx;
            return (
              <div key={s.stav} className="flex items-center">
                <div
                  onClick={() => { setNovyStav(s.stav); setStavModal(true); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
                    current ? 'bg-stone-900 text-white' :
                    done    ? 'bg-stone-100 text-stone-600 hover:bg-stone-200' :
                              'text-stone-400 hover:bg-stone-50'
                  }`}
                >
                  {done && <span className="text-stone-500">✓</span>}
                  {s.label}
                </div>
                {i < WORKFLOW.length - 1 && (
                  <ChevronRight size={12} className={done || current ? 'text-stone-400 mx-0.5' : 'text-stone-200 mx-0.5'} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-stone-100 px-6 flex gap-0">
        {[['detaily','Detaily'],['historie','Historie'],['personal','Personál'],['dokumenty','Dokumenty']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-3 text-sm border-b-2 transition-colors ${
              tab === k ? 'border-stone-900 text-stone-900 font-medium' : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}>{l}</button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {tab === 'detaily' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Levý sloupec */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <h3 className="text-sm font-semibold text-stone-700 mb-4">Základní informace</h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    ['Datum akce',   formatDatum(z.datum_akce)],
                    ['Začátek',      z.cas_zacatek || '—'],
                    ['Konec',        z.cas_konec || '—'],
                    ['Místo konání', z.misto || '—'],
                    ['Počet hostů',  z.pocet_hostu || '—'],
                    ['Rozpočet klienta', formatCena(z.rozpocet_klienta)],
                  ].map(([k,v]) => (
                    <div key={k}><dt className="text-stone-500 text-xs">{k}</dt><dd className="font-medium text-stone-800 mt-0.5">{v}</dd></div>
                  ))}
                </dl>
              </div>
              {z.poznamka_klient && (
                <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
                  <div className="text-xs font-medium text-blue-700 mb-1">Poznámka klienta</div>
                  <p className="text-sm text-blue-800">{z.poznamka_klient}</p>
                </div>
              )}
              {z.poznamka_interni && (
                <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
                  <div className="text-xs font-medium text-amber-700 mb-1">Interní poznámka</div>
                  <p className="text-sm text-amber-800">{z.poznamka_interni}</p>
                </div>
              )}
            </div>

            {/* Pravý sloupec */}
            <div className="space-y-4">
              {z.klient_jmeno && (
                <div className="bg-white rounded-xl border border-stone-200 p-4">
                  <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Klient</h3>
                  <div className="text-sm font-semibold text-stone-800">
                    {z.klient_firma || `${z.klient_jmeno} ${z.klient_prijmeni || ''}`}
                  </div>
                  {z.klient_email && <div className="text-xs text-stone-500 mt-1">{z.klient_email}</div>}
                  {z.klient_telefon && <div className="text-xs text-stone-500">{z.klient_telefon}</div>}
                </div>
              )}

              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Finance</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-stone-500">Cena celkem</span><span className="font-semibold text-stone-800">{formatCena(z.cena_celkem)}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Náklady</span><span className="text-stone-700">{formatCena(z.cena_naklady)}</span></div>
                  {z.cena_celkem && z.cena_naklady && (
                    <div className="flex justify-between"><span className="text-stone-500">Marže</span>
                      <span className="text-green-700 font-medium">
                        {formatCena(z.cena_celkem - z.cena_naklady)} ({Math.round((z.cena_celkem - z.cena_naklady)/z.cena_celkem*100)} %)
                      </span>
                    </div>
                  )}
                  <div className="border-t border-stone-100 pt-2">
                    <div className="flex justify-between"><span className="text-stone-500">Záloha</span><span className="text-stone-700">{formatCena(z.zaloha)}</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">Doplatek</span><span className="text-stone-700">{formatCena(z.doplatek)}</span></div>
                  </div>
                </div>
              </div>

              {z.obchodnik_jmeno && (
                <div className="bg-white rounded-xl border border-stone-200 p-4">
                  <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Odpovědný</h3>
                  <div className="text-sm font-medium text-stone-700">{z.obchodnik_jmeno} {z.obchodnik_prijmeni}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'historie' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-50">
              {(z.history || []).map((h, i) => (
                <div key={h.id} className="flex gap-4 px-5 py-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-stone-400 mt-1 flex-shrink-0" />
                    {i < z.history.length - 1 && <div className="w-px flex-1 bg-stone-100 mt-1" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2">
                      <StavBadge stav={h.stav_po} />
                      {h.stav_pred && <span className="text-xs text-stone-400">z: {h.stav_pred}</span>}
                    </div>
                    {h.poznamka && <p className="text-sm text-stone-600 mt-1">{h.poznamka}</p>}
                    <div className="text-xs text-stone-400 mt-1">
                      {h.jmeno} {h.prijmeni} · {formatDatum(h.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              {!z.history?.length && <div className="py-8 text-center text-sm text-stone-400">Žádná historie</div>}
            </div>
          </div>
        )}

        {tab === 'personal' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-stone-200">
              <div className="px-5 py-3.5 border-b border-stone-100 flex justify-between items-center">
                <span className="text-sm font-semibold text-stone-700">Přiřazený personál</span>
                <Btn size="sm" onClick={() => setPersonalModal(true)}><UserPlus size={12}/> Přidat</Btn>
              </div>
              {(z.personal || []).map(p => (
                <div key={p.personal_id} className="flex items-center gap-3 px-5 py-3 border-b border-stone-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-medium text-stone-600">
                    {p.jmeno[0]}{p.prijmeni[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-800">{p.jmeno} {p.prijmeni}</div>
                    <div className="text-xs text-stone-400">{p.role_na_akci || p.role} · {p.cas_prichod}–{p.cas_odchod}</div>
                  </div>
                  <div className="text-xs text-stone-500">{p.telefon}</div>
                  <button onClick={() => removePersonalMut.mutate(p.personal_id)}
                    className="text-stone-300 hover:text-red-500 transition-colors p-1" title="Odebrat">
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
              {!z.personal?.length && <div className="py-8 text-center text-sm text-stone-400">Žádný personál přiřazen</div>}
            </div>
          </div>
        )}

        {tab === 'dokumenty' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-stone-200">
              <div className="px-5 py-3.5 border-b border-stone-100 flex justify-between items-center">
                <span className="text-sm font-semibold text-stone-700">Přílohy a dokumenty</span>
                <Btn size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}>
                  <Upload size={12}/> {uploadMut.isPending ? 'Nahrávám…' : 'Nahrát'}
                </Btn>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange}/>
              </div>
              {(z.dokumenty || []).map(d => (
                <div key={d.id} className="flex items-center gap-3 px-5 py-3 border-b border-stone-50 last:border-0">
                  <div className="w-8 h-8 rounded-md bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500 uppercase">
                    {d.filename.split('.').pop()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-800">{d.nazev}</div>
                    <div className="text-xs text-stone-400">{d.kategorie} · {Math.round(d.velikost/1024)} KB · {formatDatum(d.created_at)}</div>
                  </div>
                  <a href={`/uploads/${d.filename}`} target="_blank" rel="noreferrer"
                    className="text-xs text-stone-500 hover:text-stone-800 transition-colors">
                    Stáhnout
                  </a>
                </div>
              ))}
              {!z.dokumenty?.length && <div className="py-8 text-center text-sm text-stone-400">Žádné dokumenty</div>}
            </div>
          </div>
        )}
      </div>

      {/* Modal: změna stavu */}
      <Modal open={stavModal} onClose={() => setStavModal(false)} title="Změna stavu zakázky"
        footer={<>
          <Btn onClick={() => setStavModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => stavMut.mutate({ stav: novyStav, poznamka: stavPozn })}>
            Uložit
          </Btn>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-stone-500 block mb-1.5">Nový stav</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={novyStav} onChange={e => setNovyStav(e.target.value)}>
              {WORKFLOW.map(s => <option key={s.stav} value={s.stav}>{s.label}</option>)}
              <option value="stornovano">Stornováno</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1.5">Poznámka (volitelné)</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              rows={3} value={stavPozn} onChange={e => setStavPozn(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Modal: Komando */}
      <Modal open={komandoModal} onClose={() => setKomandoModal(false)} title="Odeslat Komando"
        footer={<>
          <Btn onClick={() => setKomandoModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => komandoMut.mutate({ poznamka: komandoPozn })} disabled={komandoMut.isPending}>
            {komandoMut.isPending ? 'Odesílám…' : 'Odeslat komando'}
          </Btn>
        </>}>
        <div className="space-y-3">
          {z?.personal?.length > 0 ? (
            <div>
              <div className="text-xs text-stone-500 mb-2">Email bude odeslán personálu s vyplněným emailem:</div>
              <div className="bg-stone-50 rounded-lg border border-stone-200 divide-y divide-stone-100">
                {z.personal.map(p => (
                  <div key={p.personal_id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-stone-800">{p.jmeno} {p.prijmeni}</span>
                    <span className="text-xs text-stone-500">{p.email || <span className="text-red-400">bez emailu</span>}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              K zakázce není přiřazen žádný personál.
            </p>
          )}
          <div>
            <label className="text-xs text-stone-500 block mb-1">Doplňující poznámka (volitelné)</label>
            <textarea rows={3} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              placeholder="Speciální instrukce, parkování, dress code…"
              value={komandoPozn} onChange={e => setKomandoPozn(e.target.value)}/>
          </div>
          <p className="text-xs text-stone-400">Email bude obsahovat detaily akce, harmonogram a tým. Každý člen dostane email s jeho konkrétními časy.</p>
        </div>
      </Modal>

      {/* Modal: Děkovací email */}
      <Modal open={dekujemeModal} onClose={() => setDekujemeModal(false)} title="Odeslat děkovací email"
        footer={<>
          <Btn onClick={() => setDekujemeModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => dekujemeMut.mutate(dekujemeForm)} disabled={!dekujemeForm.to || dekujemeMut.isPending}>
            {dekujemeMut.isPending ? 'Odesílám…' : 'Odeslat'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">E-mail příjemce *</label>
            <input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={dekujemeForm.to} onChange={e => setDekujemeForm(f => ({ ...f, to: e.target.value }))}
              placeholder="klient@email.cz" autoFocus/>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Text emailu (volitelné)</label>
            <textarea rows={5} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              placeholder="Pokud nevyplníte, použije se výchozí děkovací text…"
              value={dekujemeForm.text} onChange={e => setDekujemeForm(f => ({ ...f, text: e.target.value }))}/>
          </div>
          <p className="text-xs text-stone-400">Email bude obsahovat souhrn akce (datum, místo, počet hostů, cena).</p>
        </div>
      </Modal>

      {/* Modal: Upravit zakázku */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Upravit zakázku"
        footer={<>
          <Btn onClick={() => setEditModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => editMut.mutate(editForm)} disabled={editMut.isPending}>
            {editMut.isPending ? 'Ukládám…' : 'Uložit'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Název zakázky</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={editForm.nazev || ''} onChange={e => setEF('nazev', e.target.value)}/></div>
          <div><label className="text-xs text-stone-500 block mb-1">Typ akce</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={editForm.typ || ''} onChange={e => setEF('typ', e.target.value)}>
              {TYP_OPTIONS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Datum akce</label>
              <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.datum_akce || ''} onChange={e => setEF('datum_akce', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Počet hostů</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.pocet_hostu || ''} onChange={e => setEF('pocet_hostu', e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Začátek</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.cas_zacatek || ''} onChange={e => setEF('cas_zacatek', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Konec</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.cas_konec || ''} onChange={e => setEF('cas_konec', e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Místo konání</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={editForm.misto || ''} onChange={e => setEF('misto', e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Cena celkem (Kč)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.cena_celkem || ''} onChange={e => setEF('cena_celkem', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Náklady (Kč)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.cena_naklady || ''} onChange={e => setEF('cena_naklady', e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Záloha (Kč)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.zaloha || ''} onChange={e => setEF('zaloha', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Doplatek (Kč)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.doplatek || ''} onChange={e => setEF('doplatek', e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Poznámka klienta</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={2}
              value={editForm.poznamka_klient || ''} onChange={e => setEF('poznamka_klient', e.target.value)}/></div>
          <div><label className="text-xs text-stone-500 block mb-1">Interní poznámka</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={2}
              value={editForm.poznamka_interni || ''} onChange={e => setEF('poznamka_interni', e.target.value)}/></div>
        </div>
      </Modal>

      {/* Modal: Přidat personál */}
      <Modal open={personalModal} onClose={() => setPersonalModal(false)} title="Přidat personál"
        footer={<>
          <Btn onClick={() => setPersonalModal(false)}>Zrušit</Btn>
          <Btn variant="primary"
            onClick={() => addPersonalMut.mutate(personalForm)}
            disabled={!personalForm.personal_id || addPersonalMut.isPending}>
            {addPersonalMut.isPending ? 'Přiřazuji…' : 'Přiřadit'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Hledat personál</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
              <input className="w-full pl-7 pr-2 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none"
                placeholder="Jméno…" value={personalSearch} onChange={e => setPersonalSearch(e.target.value)}/>
            </div>
            {personalList.length > 0 && (
              <div className="mt-1 border border-stone-200 rounded-lg divide-y divide-stone-50 max-h-40 overflow-y-auto">
                {personalList.map(p => (
                  <div key={p.id}
                    onClick={() => setPersonalForm(f => ({ ...f, personal_id: p.id }))}
                    className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                      personalForm.personal_id === p.id ? 'bg-stone-900 text-white' : 'hover:bg-stone-50 text-stone-700'
                    }`}>
                    {p.jmeno} {p.prijmeni} <span className="text-xs opacity-60">{p.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Role na akci</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="Číšník, kuchař, koordinátor…"
              value={personalForm.role_na_akci} onChange={e => setPersonalForm(f => ({ ...f, role_na_akci: e.target.value }))}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Příchod</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={personalForm.cas_prichod} onChange={e => setPersonalForm(f => ({ ...f, cas_prichod: e.target.value }))}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Odchod</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={personalForm.cas_odchod} onChange={e => setPersonalForm(f => ({ ...f, cas_odchod: e.target.value }))}/></div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
