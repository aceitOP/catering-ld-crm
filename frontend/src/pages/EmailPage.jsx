import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Mail, MailOpen, Inbox, Send, Trash2, Star, StarOff, RefreshCw,
  ChevronLeft, ChevronRight, Reply, Forward, Pencil, Plus,
  Loader2, AlertCircle, FolderOpen, ClipboardList, X, Check,
  ArrowRight, MoreHorizontal,
} from 'lucide-react';
import { emailApi, zakazkyApi } from '../api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  const now  = new Date();
  const diff = now - date;
  if (diff < 86400000 && date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 7 * 86400000) {
    return date.toLocaleDateString('cs-CZ', { weekday: 'short' });
  }
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function addrLabel(a) {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return a.name ? `${a.name} <${a.address}>` : (a.address || '');
}

function addrEmail(a) {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return a.address || '';
}

// Speciální složky (přizpůsobit dle localisation)
const SPECIAL = {
  '\\Inbox':  { label: 'Doručená pošta', icon: Inbox },
  '\\Sent':   { label: 'Odeslaná pošta', icon: Send },
  '\\Trash':  { label: 'Koš',            icon: Trash2 },
  '\\Drafts': { label: 'Koncepty',       icon: Pencil },
  '\\Junk':   { label: 'Spam',           icon: AlertCircle },
};

function folderLabel(f) {
  if (f.specialUse && SPECIAL[f.specialUse]) return SPECIAL[f.specialUse].label;
  return f.name || f.path;
}

function FolderIcon({ f, size = 15 }) {
  const spec = f.specialUse && SPECIAL[f.specialUse];
  const Icon = spec ? spec.icon : FolderOpen;
  return <Icon size={size} />;
}

const TYP_OPTIONS = [
  { v:'svatba',       l:'Svatba' },
  { v:'soukroma_akce',l:'Soukromá akce' },
  { v:'firemni_akce', l:'Firemní akce' },
  { v:'zavoz',        l:'Závoz / vyzvednutí' },
  { v:'bistro',       l:'Bistro / pronájem' },
  { v:'pohreb',       l:'Pohřeb' },
  { v:'ostatni',      l:'Ostatní' },
];

// ── ZakazkaModal – vytvoření zakázky z e-mailu s pre-fill formulářem ─────────
function ZakazkaModal({ uid, folder, onClose, onCreated }) {
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({});
  const [existingKlient, setExistingKlient] = useState(null);
  const [useExisting, setUseExisting]       = useState(true);
  const [preview, setPreview]   = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const sk = (k, v) => setForm(f => ({ ...f, klient: { ...f.klient, [k]: v } }));

  useEffect(() => {
    emailApi.extractData(uid, folder)
      .then(res => {
        const d = res.data;
        const ex = d.existingKlient;
        setExistingKlient(ex || null);
        setPreview(d.textPreview || '');
        setForm({
          nazev:             d.predmet || '',
          typ:               d.extracted?.typ || 'soukroma_akce',
          datum_akce:        d.extracted?.datum_akce || '',
          cas_zacatek:       d.extracted?.cas_zacatek || '',
          misto:             d.extracted?.misto_hint || '',
          pocet_hostu:       d.extracted?.pocet_hostu || '',
          rozpocet_klienta:  d.extracted?.rozpocet_klienta || '',
          poznamka_klient:   d.textPreview || '',
          klient: ex ? {
            klient_id: ex.id, jmeno: ex.jmeno, prijmeni: ex.prijmeni || '',
            email: ex.email, telefon: ex.telefon || '', firma: ex.firma || '',
          } : {
            jmeno: d.sender?.jmeno || '', prijmeni: d.sender?.prijmeni || '',
            email: d.sender?.email || '',
            telefon: d.extracted?.telefon || '',
            firma: d.extracted?.firma || '',
          },
        });
        setUseExisting(!!ex);
      })
      .catch(() => {
        toast.error('Nepodařilo se načíst data z e-mailu');
        onClose();
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!form.nazev) return toast.error('Zadejte název zakázky');
    setSubmitting(true);
    try {
      const klientPayload = useExisting && existingKlient
        ? { klient_id: existingKlient.id, ...form.klient }
        : { ...form.klient, klient_id: undefined };
      const res = await emailApi.createZakazka(uid, folder, { ...form, klient: klientPayload });
      toast.success(`Zakázka ${res.data.cislo} vytvořena`);
      onCreated(res.data.zakazka_id);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Nepodařilo se vytvořit zakázku');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div className="font-semibold text-stone-800 text-sm flex items-center gap-2">
            <ClipboardList size={15} className="text-purple-600"/>
            Vytvořit zakázku z e-mailu
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-lg"><X size={16}/></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-stone-300"/>
            <span className="ml-3 text-sm text-stone-400">Analyzuji e-mail…</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Klient */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Klient</span>
                {existingKlient && (
                  <label className="flex items-center gap-1.5 text-xs text-stone-500 cursor-pointer">
                    <input type="checkbox" checked={useExisting} onChange={e => setUseExisting(e.target.checked)}
                      className="accent-purple-600 w-3.5 h-3.5"/>
                    Použít existujícího ({existingKlient.jmeno} {existingKlient.prijmeni})
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-stone-400 block mb-0.5">Jméno</label>
                  <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 disabled:bg-stone-50"
                    value={form.klient?.jmeno || ''} onChange={e => sk('jmeno', e.target.value)} disabled={useExisting && !!existingKlient}/></div>
                <div><label className="text-xs text-stone-400 block mb-0.5">Příjmení</label>
                  <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 disabled:bg-stone-50"
                    value={form.klient?.prijmeni || ''} onChange={e => sk('prijmeni', e.target.value)} disabled={useExisting && !!existingKlient}/></div>
                <div><label className="text-xs text-stone-400 block mb-0.5">E-mail</label>
                  <input type="email" className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 disabled:bg-stone-50"
                    value={form.klient?.email || ''} onChange={e => sk('email', e.target.value)} disabled={useExisting && !!existingKlient}/></div>
                <div><label className="text-xs text-stone-400 block mb-0.5">Telefon</label>
                  <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 disabled:bg-stone-50"
                    value={form.klient?.telefon || ''} onChange={e => sk('telefon', e.target.value)} disabled={useExisting && !!existingKlient}/></div>
                <div className="col-span-2"><label className="text-xs text-stone-400 block mb-0.5">Firma</label>
                  <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 disabled:bg-stone-50"
                    value={form.klient?.firma || ''} onChange={e => sk('firma', e.target.value)} disabled={useExisting && !!existingKlient}/></div>
              </div>
            </div>

            {/* Zakázka */}
            <div>
              <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Zakázka</div>
              <div className="space-y-2">
                <div><label className="text-xs text-stone-400 block mb-0.5">Název *</label>
                  <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                    value={form.nazev || ''} onChange={e => sf('nazev', e.target.value)}/></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-stone-400 block mb-0.5">Typ akce</label>
                    <select className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                      value={form.typ || 'soukroma_akce'} onChange={e => sf('typ', e.target.value)}>
                      {TYP_OPTIONS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                    </select></div>
                  <div><label className="text-xs text-stone-400 block mb-0.5">Počet hostů</label>
                    <input type="number" min="0" className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                      value={form.pocet_hostu || ''} onChange={e => sf('pocet_hostu', e.target.value)}/></div>
                  <div><label className="text-xs text-stone-400 block mb-0.5">Datum akce</label>
                    <input type="date" className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                      value={form.datum_akce || ''} onChange={e => sf('datum_akce', e.target.value)}/></div>
                  <div><label className="text-xs text-stone-400 block mb-0.5">Čas začátku</label>
                    <input type="time" className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                      value={form.cas_zacatek || ''} onChange={e => sf('cas_zacatek', e.target.value)}/></div>
                </div>
                <div><label className="text-xs text-stone-400 block mb-0.5">Místo konání</label>
                  <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                    value={form.misto || ''} onChange={e => sf('misto', e.target.value)}/></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-stone-400 block mb-0.5">Rozpočet klienta (Kč)</label>
                    <input type="number" min="0" className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                      value={form.rozpocet_klienta || ''} onChange={e => sf('rozpocet_klienta', e.target.value)}/></div>
                </div>
                <div><label className="text-xs text-stone-400 block mb-0.5">Poznámka / text e-mailu</label>
                  <textarea rows={4} className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 resize-none font-mono"
                    value={form.poznamka_klient || ''} onChange={e => sf('poznamka_klient', e.target.value)}/></div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && (
          <div className="flex gap-2 px-5 py-3 border-t border-stone-100">
            <button onClick={onClose} className="flex-1 border border-stone-200 text-stone-600 py-2 rounded-xl text-xs font-medium hover:bg-stone-50 transition-colors">
              Zrušit
            </button>
            <button onClick={submit} disabled={submitting || !form.nazev}
              className="flex-1 bg-gradient-to-r from-stone-800 to-stone-700 text-white py-2 rounded-xl text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
              {submitting ? <><Loader2 size={13} className="animate-spin"/>Vytvářím…</> : <><Check size={13}/>Vytvořit zakázku</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FollowupModal ─────────────────────────────────────────────────────────────
function FollowupModal({ uid, subject, onClose }) {
  const [form, setForm] = useState({ zakazka_id: '', titulek: subject || '', termin: '', poznamka: '' });
  const [submitting, setSubmitting] = useState(false);
  const { data: zakazkyRaw } = useQuery({ queryKey: ['zakazky-list'], queryFn: () => zakazkyApi.list({ limit: 100 }) });
  const zakazky = zakazkyRaw?.data?.data || zakazkyRaw?.data || [];

  const submit = async () => {
    if (!form.zakazka_id || !form.titulek) return toast.error('Vyplňte zakázku a titulek');
    setSubmitting(true);
    try {
      await emailApi.createFollowup(uid, form);
      toast.success('Followup úkol vytvořen');
      onClose();
    } catch { toast.error('Nepodařilo se vytvořit followup'); setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <span className="font-semibold text-stone-800 text-sm flex items-center gap-2"><ArrowRight size={14} className="text-blue-600"/>Přidat followup úkol</span>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="text-xs text-stone-400 block mb-1">Zakázka *</label>
            <select className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
              value={form.zakazka_id} onChange={e => setForm(f=>({...f, zakazka_id: e.target.value}))}>
              <option value="">— vyberte zakázku —</option>
              {zakazky.map(z => <option key={z.id} value={z.id}>{z.cislo} – {z.nazev}</option>)}
            </select></div>
          <div><label className="text-xs text-stone-400 block mb-1">Titulek *</label>
            <input className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
              value={form.titulek} onChange={e => setForm(f=>({...f, titulek: e.target.value}))}/></div>
          <div><label className="text-xs text-stone-400 block mb-1">Termín</label>
            <input type="date" className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
              value={form.termin} onChange={e => setForm(f=>({...f, termin: e.target.value}))}/></div>
          <div><label className="text-xs text-stone-400 block mb-1">Poznámka</label>
            <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none resize-none"
              value={form.poznamka} onChange={e => setForm(f=>({...f, poznamka: e.target.value}))}/></div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 border border-stone-200 text-stone-600 py-2 rounded-xl text-xs font-medium hover:bg-stone-50">Zrušit</button>
          <button onClick={submit} disabled={submitting || !form.zakazka_id || !form.titulek}
            className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-xs font-semibold disabled:opacity-40 hover:bg-blue-700 flex items-center justify-center gap-1.5">
            {submitting ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
            {submitting ? 'Vytvářím…' : 'Vytvořit úkol'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LinkModal – propojit e-mail se zakázkou ───────────────────────────────────
function LinkModal({ uid, folder, subject, onClose }) {
  const [search, setSearch] = useState('');
  const [linking, setLinking] = useState(null);
  const { data: zakazkyRaw } = useQuery({ queryKey: ['zakazky-list'], queryFn: () => zakazkyApi.list({ limit: 100 }) });
  const zakazky = (zakazkyRaw?.data?.data || zakazkyRaw?.data || []).filter(z =>
    !search || `${z.cislo} ${z.nazev}`.toLowerCase().includes(search.toLowerCase())
  );

  const link = async (zid) => {
    setLinking(zid);
    try {
      await emailApi.linkZakazka(uid, folder, zid);
      toast.success('E-mail propojen se zakázkou');
      onClose();
    } catch { toast.error('Propojení selhalo'); setLinking(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <span className="font-semibold text-stone-800 text-sm flex items-center gap-2"><MoreHorizontal size={14} className="text-purple-600"/>Přiřadit k zakázce</span>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700"><X size={16}/></button>
        </div>
        <div className="px-4 py-3 border-b border-stone-100">
          <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
            placeholder="Hledat zakázku…" value={search} onChange={e => setSearch(e.target.value)} autoFocus/>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-stone-50">
          {zakazky.slice(0, 30).map(z => (
            <div key={z.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-stone-50">
              <div>
                <div className="text-xs font-semibold text-stone-800">{z.nazev}</div>
                <div className="text-xs text-stone-400">{z.cislo} · {z.klient_jmeno} {z.klient_prijmeni || ''}</div>
              </div>
              <button onClick={() => link(z.id)} disabled={linking === z.id}
                className="text-xs font-medium px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {linking === z.id ? <Loader2 size={11} className="animate-spin"/> : 'Přiřadit'}
              </button>
            </div>
          ))}
          {zakazky.length === 0 && <div className="text-xs text-stone-400 text-center py-6">Žádná zakázka</div>}
        </div>
      </div>
    </div>
  );
}

// ── AttachmentsModal – uložit přílohy do dokumentů ───────────────────────────
function AttachmentsModal({ uid, folder, attachments, onClose }) {
  const [saving, setSaving] = useState({});
  const [saved,  setSaved]  = useState({});
  const [zakazkaId, setZakazkaId] = useState('');
  const { data: zakazkyRaw } = useQuery({ queryKey: ['zakazky-list'], queryFn: () => zakazkyApi.list({ limit: 100 }) });
  const zakazky = zakazkyRaw?.data?.data || zakazkyRaw?.data || [];

  const save = async (idx, filename) => {
    setSaving(s => ({ ...s, [idx]: true }));
    try {
      await emailApi.saveAttachment(uid, idx, folder, { zakazka_id: zakazkaId || undefined });
      setSaved(s => ({ ...s, [idx]: true }));
      toast.success(`${filename} uloženo do dokumentů`);
    } catch { toast.error(`Nepodařilo se uložit ${filename}`); }
    setSaving(s => ({ ...s, [idx]: false }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <span className="font-semibold text-stone-800 text-sm flex items-center gap-2"><Plus size={14} className="text-stone-600"/>Uložit přílohy do dokumentů</span>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700"><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3">
          <div><label className="text-xs text-stone-400 block mb-1">Přiřadit k zakázce (volitelné)</label>
            <select className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
              value={zakazkaId} onChange={e => setZakazkaId(e.target.value)}>
              <option value="">— bez zakázky —</option>
              {zakazky.map(z => <option key={z.id} value={z.id}>{z.cislo} – {z.nazev}</option>)}
            </select></div>
          <div className="divide-y divide-stone-100 border border-stone-100 rounded-xl overflow-hidden">
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <div className="text-xs font-medium text-stone-800">{att.filename || `Příloha ${idx+1}`}</div>
                  <div className="text-xs text-stone-400">{att.contentType || att.mimeType || ''}</div>
                </div>
                <button onClick={() => save(idx, att.filename)} disabled={saving[idx] || saved[idx]}
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${saved[idx] ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-50'}`}>
                  {saving[idx] ? <Loader2 size={11} className="animate-spin"/> : saved[idx] ? <Check size={11}/> : 'Uložit'}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full border border-stone-200 text-stone-600 py-2 rounded-xl text-xs font-medium hover:bg-stone-50">Zavřít</button>
        </div>
      </div>
    </div>
  );
}

// ── Compose / Reply modal ─────────────────────────────────────────────────────
function ComposeModal({ initial, onClose, onSent }) {
  const [to,      setTo]      = useState(initial?.to      || '');
  const [cc,      setCc]      = useState(initial?.cc      || '');
  const [subject, setSubject] = useState(initial?.subject || '');
  const [body,    setBody]    = useState(initial?.body    || '');
  const [showCc,  setShowCc]  = useState(!!initial?.cc);
  const [showSablony, setShowSablony] = useState(false);

  const { data: sablonyData } = useQuery({
    queryKey: ['email-sablony'],
    queryFn:  () => emailApi.listSablony(),
  });
  const sablony = sablonyData?.data?.data || sablonyData?.data || [];

  const sendMut = useMutation({
    mutationFn: (d) => emailApi.send(d),
    onSuccess: () => {
      toast.success('E-mail odeslán');
      onSent?.();
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Chyba při odesílání'),
  });

  const handleSend = () => {
    if (!to.trim()) return toast.error('Zadejte příjemce');
    if (!subject.trim()) return toast.error('Zadejte předmět');
    sendMut.mutate({
      to:         to.trim(),
      cc:         cc.trim() || undefined,
      subject:    subject.trim(),
      html:       body ? `<div style="font-family:sans-serif;font-size:14px;">${body.replace(/\n/g, '<br>')}</div>` : undefined,
      text:       body || undefined,
      inReplyTo:  initial?.inReplyTo  || undefined,
      references: initial?.references || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col border border-stone-200" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-stone-800 rounded-t-2xl">
          <span className="text-sm font-semibold text-white">{initial?.isReply ? 'Odpovědět' : 'Nová zpráva'}</span>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Fields */}
        <div className="border-b border-stone-100 divide-y divide-stone-100">
          <div className="flex items-center px-4 py-2 gap-2">
            <span className="text-xs text-stone-400 w-10 flex-shrink-0">Komu</span>
            <input
              className="flex-1 text-sm outline-none text-stone-800 placeholder:text-stone-300"
              placeholder="příjemce@email.cz"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
            {!showCc && (
              <button onClick={() => setShowCc(true)} className="text-xs text-stone-400 hover:text-brand-600">+Cc</button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center px-4 py-2 gap-2">
              <span className="text-xs text-stone-400 w-10 flex-shrink-0">Cc</span>
              <input
                className="flex-1 text-sm outline-none text-stone-800 placeholder:text-stone-300"
                placeholder="kopie@email.cz"
                value={cc}
                onChange={e => setCc(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center px-4 py-2 gap-2">
            <span className="text-xs text-stone-400 w-10 flex-shrink-0">Věc</span>
            <input
              className="flex-1 text-sm outline-none text-stone-800 placeholder:text-stone-300"
              placeholder="Předmět zprávy"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
        </div>

        {/* Body */}
        <textarea
          className="flex-1 px-4 py-3 text-sm text-stone-800 outline-none resize-none placeholder:text-stone-300"
          placeholder="Napište zprávu…"
          value={body}
          onChange={e => setBody(e.target.value)}
          style={{ minHeight: 160 }}
        />

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-600 px-3 py-1.5 rounded-lg hover:bg-surface transition-colors">
              Zahodit
            </button>
            {sablony.length > 0 && (
              <div className="relative">
                <button onClick={() => setShowSablony(s => !s)}
                  className="text-xs text-stone-500 hover:text-stone-700 px-2.5 py-1.5 rounded-lg hover:bg-surface transition-colors border border-stone-200">
                  Šablony ▾
                </button>
                {showSablony && (
                  <div className="absolute bottom-full left-0 mb-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 min-w-[200px] overflow-hidden">
                    {sablony.map(s => (
                      <button key={s.id}
                        onClick={() => {
                          if (s.predmet_prefix && !subject.startsWith(s.predmet_prefix)) setSubject(s.predmet_prefix + ' ' + subject);
                          setBody(b => s.telo + (b ? '\n\n---\n' + b : ''));
                          setShowSablony(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 text-stone-700">
                        {s.nazev}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={sendMut.isPending}
            className="flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {sendMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Odeslat
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main EmailPage ─────────────────────────────────────────────────────────────
export default function EmailPage() {
  const qc       = useQueryClient();
  const navigate = useNavigate();

  const [folder,    setFolder]    = useState('INBOX');
  const [page,      setPage]      = useState(1);
  const [selUid,    setSelUid]    = useState(null);
  const [compose,   setCompose]   = useState(null);  // null | compose options
  const iframeRef = useRef(null);

  // ── Queries ──────────────────────────────────────────────────
  const statusQ = useQuery({
    queryKey: ['email', 'status'],
    queryFn:  () => emailApi.status(),
    select:   r  => r.data,
    retry:    false,
    staleTime: 60_000,
  });

  const foldersQ = useQuery({
    queryKey: ['email', 'folders'],
    queryFn:  () => emailApi.folders(),
    select:   r  => r.data?.data || [],
    enabled:  statusQ.data?.connected === true,
    staleTime: 300_000,
  });

  const msgsQ = useQuery({
    queryKey: ['email', 'messages', folder, page],
    queryFn:  () => emailApi.messages({ folder, page, limit: 30 }),
    select:   r  => r.data?.data || { messages: [], total: 0, unseen: 0 },
    enabled:  statusQ.data?.connected === true,
    keepPreviousData: true,
  });

  const msgQ = useQuery({
    queryKey: ['email', 'message', folder, selUid],
    queryFn:  () => emailApi.getMessage(selUid, folder),
    select:   r  => r.data?.data,
    enabled:  !!selUid,
  });

  // ── Mutations ─────────────────────────────────────────────────
  const seenMut = useMutation({
    mutationFn: ({ uid, seen }) => emailApi.markSeen(uid, seen, folder),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email', 'messages', folder] }),
  });

  const flagMut = useMutation({
    mutationFn: ({ uid, flagged }) => emailApi.markFlagged(uid, flagged, folder),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email', 'messages', folder] }),
  });

  const deleteMut = useMutation({
    mutationFn: ({ uid }) => emailApi.delete(uid, folder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email', 'messages', folder] });
      if (selUid === deleteMut.variables?.uid) setSelUid(null);
      toast.success('Zpráva přesunuta do koše');
    },
    onError: () => toast.error('Nepodařilo se smazat zprávu'),
  });

  const moveMut = useMutation({
    mutationFn: ({ uid, target }) => emailApi.move(uid, folder, target),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email', 'messages', folder] });
      if (selUid === moveMut.variables?.uid) setSelUid(null);
      toast.success('Zpráva přesunuta');
    },
    onError: () => toast.error('Nepodařilo se přesunout zprávu'),
  });

  const [zakazkaModal,  setZakazkaModal]  = useState(false);
  const [followupModal, setFollowupModal] = useState(false);
  const [linkModal,     setLinkModal]     = useState(false);
  const [attModal,      setAttModal]      = useState(false);
  const [checkResult,   setCheckResult]   = useState(null);

  const checkInboxMut = useMutation({
    mutationFn: () => emailApi.checkInbox(folder),
    onSuccess: (res) => {
      const d = res.data;
      if (d.matches > 0) toast.success(`${d.matches} e-mail(ů) od klientů — notifikace vytvořeny`);
      else toast.success(`Zkontrolováno ${d.checked} zpráv, žádný nový klient`);
      setCheckResult(d);
    },
    onError: () => toast.error('Kontrola selhala'),
  });

  // Při změně složky resetuj stránku a výběr
  useEffect(() => { setPage(1); setSelUid(null); }, [folder]);

  // ── Render helpers ────────────────────────────────────────────
  const msgs    = msgsQ.data?.messages || [];
  const total   = msgsQ.data?.total    || 0;
  const unseen  = msgsQ.data?.unseen   || 0;
  const totalPages = Math.ceil(total / 30);
  const msg     = msgQ.data;

  // Když se otevře zpráva, nastavíme iframe obsah
  useEffect(() => {
    if (!msg || !iframeRef.current) return;
    const html = msg.html || `<pre style="font-family:sans-serif;font-size:13px;white-space:pre-wrap;">${msg.text || ''}</pre>`;
    iframeRef.current.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:12px;font-family:system-ui,sans-serif;font-size:13px;color:#1c1917;line-height:1.6;}a{color:#6d28d9;}img{max-width:100%;}</style></head><body>${html}</body></html>`;
  }, [msg]);

  // ── Stav: nepřipojeno ─────────────────────────────────────────
  if (statusQ.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 size={28} className="animate-spin text-stone-300" />
      </div>
    );
  }

  if (!statusQ.data?.connected) {
    return (
      <div className="flex-1 flex items-center justify-center h-full p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <Mail size={28} className="text-stone-300" />
          </div>
          <h2 className="text-base font-bold text-stone-700 mb-2">E-mail není nakonfigurován</h2>
          <p className="text-sm text-stone-400 mb-5">Přejděte do Nastavení → E-mail a zadejte IMAP přístupové údaje.</p>
          <button
            onClick={() => navigate('/nastaveni')}
            className="inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-brand-700 transition-colors"
          >
            <ArrowRight size={15} />
            Otevřít nastavení
          </button>
          {statusQ.data?.error && (
            <p className="mt-3 text-xs text-red-500 bg-red-50 rounded-xl p-3">{statusQ.data.error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Panel 1: Složky ──────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 bg-stone-50 border-r border-stone-200 flex flex-col">
        <div className="px-4 py-4 flex items-center justify-between">
          <span className="text-sm font-bold text-stone-800">Pošta</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => checkInboxMut.mutate()}
              disabled={checkInboxMut.isPending}
              title="Zkontrolovat nové e-maily od klientů"
              className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {checkInboxMut.isPending ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
            </button>
            <button
              onClick={() => setCompose({})}
              className="flex items-center gap-1.5 bg-brand-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Plus size={13} />
              Napsat
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {/* INBOX vždy první */}
          <button
            onClick={() => setFolder('INBOX')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] transition-colors ${
              folder === 'INBOX'
                ? 'bg-brand-600 text-white font-semibold'
                : 'text-stone-600 hover:bg-white hover:text-stone-800 font-medium'
            }`}
          >
            <Inbox size={14} className="flex-shrink-0" />
            <span className="flex-1 text-left">Doručená pošta</span>
            {unseen > 0 && folder !== 'INBOX' && (
              <span className="min-w-[18px] h-[18px] bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unseen}
              </span>
            )}
          </button>

          {foldersQ.isLoading && (
            <div className="px-3 py-2 flex items-center gap-2 text-stone-300 text-xs">
              <Loader2 size={12} className="animate-spin" /> Načítám…
            </div>
          )}

          {(foldersQ.data || [])
            .filter(f => f.path !== 'INBOX')
            .sort((a, b) => {
              // Prioritizovat speciální složky
              const order = ['\\Sent', '\\Drafts', '\\Trash', '\\Junk'];
              const ai = order.indexOf(a.specialUse);
              const bi = order.indexOf(b.specialUse);
              if (ai !== -1 && bi !== -1) return ai - bi;
              if (ai !== -1) return -1;
              if (bi !== -1) return 1;
              return (a.name || '').localeCompare(b.name || '', 'cs');
            })
            .map(f => (
              <button
                key={f.path}
                onClick={() => setFolder(f.path)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] transition-colors ${
                  folder === f.path
                    ? 'bg-brand-600 text-white font-semibold'
                    : 'text-stone-600 hover:bg-white hover:text-stone-800 font-medium'
                }`}
              >
                <FolderIcon f={f} size={14} />
                <span className="flex-1 text-left truncate">{folderLabel(f)}</span>
              </button>
            ))}
        </nav>

        {/* Refresh */}
        <div className="px-3 pb-3">
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['email', 'messages', folder] });
              qc.invalidateQueries({ queryKey: ['email', 'status'] });
            }}
            className="w-full flex items-center justify-center gap-1.5 text-stone-400 text-xs py-2 rounded-xl hover:bg-white hover:text-stone-600 transition-colors"
          >
            <RefreshCw size={12} />
            Obnovit
          </button>
        </div>
      </div>

      {/* ── Panel 2: Seznam zpráv ─────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-stone-200 flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-stone-100 flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-stone-800">
              {folder === 'INBOX' ? 'Doručená pošta' : (foldersQ.data?.find(f => f.path === folder) ? folderLabel(foldersQ.data.find(f => f.path === folder)) : folder)}
            </span>
            {total > 0 && (
              <span className="ml-2 text-xs text-stone-400">{total} zpráv</span>
            )}
            {unseen > 0 && (
              <span className="ml-1 text-xs font-semibold text-accent">{unseen} nových</span>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-stone-50">
          {msgsQ.isLoading && (
            <div className="flex items-center justify-center py-16 text-stone-300">
              <Loader2 size={22} className="animate-spin" />
            </div>
          )}
          {msgsQ.isError && (
            <div className="p-4 text-center">
              <AlertCircle size={20} className="mx-auto text-red-400 mb-2" />
              <p className="text-xs text-stone-500">{msgsQ.error?.response?.data?.error || 'Chyba načítání'}</p>
            </div>
          )}
          {!msgsQ.isLoading && msgs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MailOpen size={28} className="text-stone-200 mb-3" />
              <p className="text-sm text-stone-400 font-medium">Složka je prázdná</p>
            </div>
          )}
          {msgs.map(m => (
            <button
              key={m.uid}
              onClick={() => setSelUid(m.uid)}
              className={`w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors relative group ${
                selUid === m.uid ? 'bg-brand-50 border-l-2 border-brand-500' : ''
              }`}
            >
              {/* Unread dot */}
              {!m.seen && (
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-brand-500" />
              )}

              <div className="flex items-start justify-between gap-2 mb-0.5">
                <span className={`text-[12px] truncate ${!m.seen ? 'font-bold text-stone-800' : 'font-medium text-stone-600'}`}>
                  {m.from?.name || m.from?.address || 'Neznámý odesílatel'}
                </span>
                <span className="text-[10px] text-stone-400 flex-shrink-0">{formatDate(m.date)}</span>
              </div>

              <p className={`text-[11px] truncate ${!m.seen ? 'text-stone-700 font-semibold' : 'text-stone-500'}`}>
                {m.subject || '(bez předmětu)'}
              </p>

              <div className="flex items-center justify-between mt-1">
                {m.size ? <span className="text-[10px] text-stone-300">{formatBytes(m.size)}</span> : <span />}
                {m.flagged && <Star size={10} className="text-amber-400 fill-amber-400" />}
              </div>

              {/* Quick actions on hover */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-white rounded-lg shadow-sm border border-stone-100 p-1">
                <button
                  onClick={e => { e.stopPropagation(); flagMut.mutate({ uid: m.uid, flagged: !m.flagged }); }}
                  className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-amber-500 transition-colors"
                  title={m.flagged ? 'Odznačit' : 'Označit hvězdičkou'}
                >
                  {m.flagged ? <StarOff size={12} /> : <Star size={12} />}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteMut.mutate({ uid: m.uid }); }}
                  className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-red-500 transition-colors"
                  title="Smazat"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </button>
          ))}
        </div>

        {/* Paginace */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-100">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30 text-stone-500 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-stone-400">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30 text-stone-500 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ── Panel 3: Detail zprávy ────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {!selUid ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <MailOpen size={28} className="text-stone-200" />
              </div>
              <p className="text-sm font-semibold text-stone-400">Vyberte zprávu</p>
              <p className="text-xs text-stone-300 mt-1">Klikněte na zprávu vlevo pro zobrazení</p>
            </div>
          </div>
        ) : msgQ.isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-stone-300" />
          </div>
        ) : msgQ.isError ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <AlertCircle size={24} className="mx-auto text-red-400 mb-2" />
              <p className="text-sm text-stone-500">Nepodařilo se načíst zprávu</p>
            </div>
          </div>
        ) : msg ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-100 flex-shrink-0">
              <button
                onClick={() => setCompose({
                  isReply: true,
                  to:         addrEmail(msg.from?.[0]),
                  subject:    msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`,
                  inReplyTo:  msg.messageId,
                  references: msg.references || msg.messageId,
                  body:       `\n\n---\nOd: ${addrLabel(msg.from?.[0])}\n${msg.text || ''}`.slice(0, 2000),
                })}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
              >
                <Reply size={13} />
                Odpovědět
              </button>

              <button
                onClick={() => setCompose({
                  subject: `Fwd: ${msg.subject || ''}`,
                  body:    `\n\n---\nZpráva přeposlaná od: ${addrLabel(msg.from?.[0])}\n${msg.text || ''}`.slice(0, 2000),
                })}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-surface text-stone-600 transition-colors"
              >
                <Forward size={13} />
                Přeposlat
              </button>

              <div className="flex-1" />

              <button
                onClick={() => setZakazkaModal(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                title="Vytvořit zakázku z tohoto e-mailu"
              >
                <ClipboardList size={13} />
                Zakázka
              </button>

              <button
                onClick={() => setFollowupModal(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                title="Přidat followup úkol"
              >
                <ArrowRight size={13} />
                Followup
              </button>

              <button
                onClick={() => setLinkModal(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                title="Propojit s zakázkou"
              >
                <MoreHorizontal size={13} />
                Přiřadit
              </button>

              {(msg.attachments?.length > 0) && (
                <button
                  onClick={() => setAttModal(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-stone-50 text-stone-600 hover:bg-stone-100 transition-colors"
                  title="Uložit přílohy do dokumentů"
                >
                  <Plus size={13} />
                  Přílohy ({msg.attachments.length})
                </button>
              )}

              <button
                onClick={() => flagMut.mutate({ uid: selUid, flagged: !msg.flagged })}
                className={`p-2 rounded-xl transition-colors ${msg.flagged ? 'text-amber-400 bg-amber-50 hover:bg-amber-100' : 'text-stone-400 hover:bg-surface hover:text-amber-500'}`}
                title={msg.flagged ? 'Odznačit hvězdičku' : 'Označit hvězdičkou'}
              >
                <Star size={15} className={msg.flagged ? 'fill-amber-400' : ''} />
              </button>

              <button
                onClick={() => { deleteMut.mutate({ uid: selUid }); }}
                className="p-2 rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Smazat"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Záhlaví zprávy */}
            <div className="px-5 py-4 border-b border-stone-100 flex-shrink-0">
              <h2 className="text-base font-bold text-stone-800 mb-3 leading-tight">
                {msg.subject || '(bez předmětu)'}
              </h2>
              <div className="space-y-1 text-xs text-stone-500">
                <div className="flex gap-2">
                  <span className="text-stone-400 w-6 flex-shrink-0">Od</span>
                  <span className="font-medium text-stone-700">{addrLabel(msg.from?.[0])}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-stone-400 w-6 flex-shrink-0">Komu</span>
                  <span>{msg.to?.map(addrLabel).join(', ')}</span>
                </div>
                {msg.cc?.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-stone-400 w-6 flex-shrink-0">Cc</span>
                    <span>{msg.cc.map(addrLabel).join(', ')}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-stone-400 w-6 flex-shrink-0">Kdy</span>
                  <span>{msg.date ? new Date(msg.date).toLocaleString('cs-CZ') : '–'}</span>
                </div>
              </div>

              {/* Přílohy */}
              {msg.attachments?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {msg.attachments.map((att, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 text-xs bg-stone-100 text-stone-600 rounded-lg px-2.5 py-1.5"
                    >
                      <FolderOpen size={11} />
                      {att.filename || 'příloha'}
                      {att.size ? <span className="text-stone-400">({formatBytes(att.size)})</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Tělo zprávy – sandboxed iframe */}
            <div className="flex-1 overflow-hidden">
              <iframe
                ref={iframeRef}
                className="w-full h-full border-0"
                sandbox="allow-same-origin"
                title="email-body"
              />
            </div>
          </>
        ) : null}
      </div>

      {/* ── Compose modal ─────────────────────────────────────────── */}
      {compose !== null && (
        <ComposeModal
          initial={compose}
          onClose={() => setCompose(null)}
          onSent={() => qc.invalidateQueries({ queryKey: ['email', 'messages', folder] })}
        />
      )}

      {/* ── Zakázka modal ──────────────────────────────────────────── */}
      {zakazkaModal && selUid && (
        <ZakazkaModal
          uid={selUid}
          folder={folder}
          onClose={() => setZakazkaModal(false)}
          onCreated={(id) => { setZakazkaModal(false); navigate(`/zakazky/${id}`); }}
        />
      )}

      {/* ── Followup modal ─────────────────────────────────────────── */}
      {followupModal && selUid && msg && (
        <FollowupModal
          uid={selUid}
          subject={msg.subject}
          onClose={() => setFollowupModal(false)}
        />
      )}

      {/* ── Link zakázka modal ─────────────────────────────────────── */}
      {linkModal && selUid && msg && (
        <LinkModal
          uid={selUid}
          folder={folder}
          subject={msg.subject}
          onClose={() => setLinkModal(false)}
        />
      )}

      {/* ── Přílohy modal ──────────────────────────────────────────── */}
      {attModal && selUid && msg && (
        <AttachmentsModal
          uid={selUid}
          folder={folder}
          attachments={msg.attachments || []}
          onClose={() => setAttModal(false)}
        />
      )}
    </div>
  );
}
