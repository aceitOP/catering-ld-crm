import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zakazkyApi, personalApi, dokumentyApi, proposalsApi, nabidkyApi, uzivateleApi, followupApi, emailApi, venuesApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { StavBadge, TypBadge, formatCena, formatDatum, Spinner, Btn, Modal } from '../components/ui';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronRight, Send, Heart, Printer, Pencil, Upload, UserPlus, Trash2, Search, Receipt, ChefHat, Link, Plus, ExternalLink, Copy, CheckSquare, Square, X as XIcon, ListChecks, Check, LockOpen, FileText, MapPin, AlertTriangle } from 'lucide-react';
import { printKomandoPdf } from '../utils/print';

const WORKFLOW = [
  { stav: 'nova_poptavka',      label: 'NovÄ‚Ë‡ poptÄ‚Ë‡vka' },
  { stav: 'rozpracovano',       label: 'RozpracovÄ‚Ë‡no' },
  { stav: 'nabidka_pripravena', label: 'NabÄ‚Â­dka pÄąâ„˘ipravena' },
  { stav: 'nabidka_odeslana',   label: 'NabÄ‚Â­dka odeslÄ‚Ë‡na' },
  { stav: 'ceka_na_vyjadreni',  label: 'Ă„ĹšekÄ‚Ë‡ na vyjÄ‚Ë‡dÄąâ„˘enÄ‚Â­' },
  { stav: 'potvrzeno',          label: 'Potvrzeno' },
  { stav: 've_priprave',        label: 'Ve pÄąâ„˘Ä‚Â­pravĂ„â€ş' },
  { stav: 'realizovano',        label: 'RealizovÄ‚Ë‡no' },
  { stav: 'uzavreno',           label: 'UzavÄąâ„˘eno' },
];

const TYP_OPTIONS = [
  {v:'svatba',l:'Svatba'},{v:'soukroma_akce',l:'SoukromÄ‚Ë‡ akce'},{v:'firemni_akce',l:'FiremnÄ‚Â­ akce'},
  {v:'zavoz',l:'ZÄ‚Ë‡voz'},{v:'bistro',l:'Bistro'},{v:'pohreb',l:'PohÄąâ„˘eb'},{v:'ostatni',l:'OstatnÄ‚Â­'},
];
const MAX_FILE_SIZE_MB = 15;

function normalizeChecklist(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (typeof item === 'string') {
        return { key: `custom_${index}`, label: item, done: false, requiredBy: null };
      }
      if (!item?.label) return null;
      return {
        key: item.key || `custom_${index}`,
        label: item.label,
        done: Boolean(item.done),
        requiredBy: item.requiredBy || null,
      };
    })
    .filter(Boolean);
}

function mergeChecklistTemplate(current = [], template = []) {
  const normalizedCurrent = normalizeChecklist(current);
  const normalizedTemplate = normalizeChecklist(template);
  if (!normalizedTemplate.length) return normalizedCurrent;
  if (!normalizedCurrent.length) return normalizedTemplate;

  const byKey = new Map(normalizedCurrent.map((item) => [item.key, item]));
  const byLabel = new Map(normalizedCurrent.map((item) => [item.label.trim().toLowerCase(), item]));

  const merged = normalizedTemplate.map((item) => {
    const existing = byKey.get(item.key) || byLabel.get(item.label.trim().toLowerCase());
    return existing ? { ...item, ...existing, done: Boolean(existing.done) } : item;
  });

  const mergedKeys = new Set(merged.map((item) => item.key));
  const customItems = normalizedCurrent.filter((item) => !mergedKeys.has(item.key));
  return [...merged, ...customItems];
}

function getChecklistProgress(items = []) {
  const normalized = normalizeChecklist(items);
  const total = normalized.length;
  const done = normalized.filter((item) => item.done).length;
  return { total, done, pending: Math.max(total - done, 0) };
}

function requiredByLabel(stav) {
  const match = WORKFLOW.find((item) => item.stav === stav);
  return match?.label || stav;
}

// Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬ EmailyTab Ă˘â‚¬â€ś propojenÄ‚Â© e-maily zakÄ‚Ë‡zky Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬
function EmailyTab({ zakazkaId }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['email-links', zakazkaId],
    queryFn:  () => emailApi.getLinks(zakazkaId),
  });
  const links = data?.data?.data || data?.data || [];

  const unlinkMut = useMutation({
    mutationFn: ({ uid }) => emailApi.unlinkZakazka(uid, zakazkaId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-links', zakazkaId] }); toast.success('PropojenÄ‚Â­ odstranĂ„â€şno'); },
    onError: () => toast.error('NepodaÄąâ„˘ilo se odebrat propojenÄ‚Â­'),
  });

  if (isLoading) return <div className="px-6 py-8 text-center text-sm text-stone-400">NaĂ„Ĺ¤Ä‚Â­tÄ‚Ë‡mĂ˘â‚¬Â¦</div>;

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-stone-800">PropojenÄ‚Â© e-maily</h3>
          <p className="text-xs text-stone-500 mt-0.5">E-maily pÄąâ„˘iÄąâ„˘azenÄ‚Â© k tÄ‚Â©to zakÄ‚Ë‡zce z e-mailovÄ‚Â©ho modulu</p>
        </div>
        <Btn size="sm" onClick={() => window.location.href = '/email'}>
          OtevÄąâ„˘Ä‚Â­t poÄąË‡tu
        </Btn>
      </div>

      {links.length === 0 ? (
        <div className="bg-stone-50 rounded-xl border border-stone-100 px-5 py-8 text-center">
          <div className="text-2xl mb-2">Ä‘Ĺşâ€śÂ­</div>
          <div className="text-sm text-stone-400">ÄąËťÄ‚Ë‡dnÄ‚Â© propojenÄ‚Â© e-maily</div>
          <div className="text-xs text-stone-400 mt-1">PÄąâ„˘iÄąâ„˘aĂ„Ĺąte e-mail pomocÄ‚Â­ tlaĂ„Ĺ¤Ä‚Â­tka Ă˘â‚¬ĹľPÄąâ„˘iÄąâ„˘adit" v e-mailovÄ‚Â©m modulu</div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
          {links.map(l => (
            <div key={l.id} className="flex items-start justify-between px-4 py-3 hover:bg-stone-50">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-stone-800 truncate">{l.subject || '(bez pÄąâ„˘edmĂ„â€ştu)'}</div>
                <div className="text-xs text-stone-500 mt-0.5">
                  Od: {l.from_name ? `${l.from_name} <${l.from_email}>` : l.from_email}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">
                  {new Date(l.linked_at).toLocaleString('cs-CZ', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  {l.linked_by_jmeno && ` Ă‚Â· ${l.linked_by_jmeno}`}
                </div>
              </div>
              <button
                onClick={() => { if (confirm('Odebrat toto propojenÄŹĹĽËť?')) unlinkMut.mutate({ uid: l.uid }); }}
                className="ml-3 p-1 text-stone-300 hover:text-red-500 transition-colors flex-shrink-0"
                title="Odebrat propojenÄ‚Â­"
              >
                <Trash2 size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ZakazkaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasModule } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef(null);

  const [tab, setTab] = useState('detaily');
  const [stavModal, setStavModal] = useState(false);
  const [novyStav, setNovyStav] = useState('');
  const [stavPozn, setStavPozn] = useState('');
  const [komandoModal, setKomandoModal] = useState(false);
  const [komandoPozn, setKomandoPozn] = useState('');
  const [komandoExtraEmails, setKomandoExtraEmails] = useState('');
  const [komandoIncludeAssigned, setKomandoIncludeAssigned] = useState(true);
  const [dekujemeModal, setDekujemeModal] = useState(false);
  const [venueDebriefModal, setVenueDebriefModal] = useState(false);
  const personalEnabled = hasModule('personal');
  const dokumentyEnabled = hasModule('dokumenty');
  const emailEnabled = hasModule('email');
  const [venueDebriefForm, setVenueDebriefForm] = useState({
    access_as_expected: 'yes',
    actual_security_delay_minutes: '',
    actual_unload_to_service_area_minutes: '',
    loading_issue: false,
    loading_issue_note: '',
    route_bottleneck: false,
    route_bottleneck_note: '',
    parking_issue: false,
    parking_issue_note: '',
    connectivity_issue: false,
    connectivity_issue_note: '',
    restriction_discovered: false,
    new_restriction_note: '',
    propose_master_update: true,
  });

  useEffect(() => {
    if (tab === 'personal' && !personalEnabled) setTab('detaily');
    if (tab === 'dokumenty' && !dokumentyEnabled) setTab('detaily');
    if (tab === 'emaily' && !emailEnabled) setTab('detaily');
  }, [tab, personalEnabled, dokumentyEnabled, emailEnabled]);

  const handleDocumentDownload = async (doc) => {
    try {
      await dokumentyApi.download(doc.id, doc.nazev || doc.filename);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Dokument se nepodaYilo stÄŹĹĽËťhnout');
    }
  };
  const [dekujemeForm, setDekujemeForm] = useState({ to: '', text: '' });

  // KlientskÄ‚Ëť vÄ‚ËťbĂ„â€şr (proposals)
  const [proposalModal, setProposalModal] = useState(false);
  const [proposalForm, setProposalForm] = useState({ nazev: '', uvodni_text: '', expires_at: '' });
  const [sendLinkModal, setSendLinkModal] = useState(null); // proposal object
  const [sendEmail, setSendEmail] = useState('');
  const [editingProposalId, setEditingProposalId] = useState(null);
  const [sectionModal, setSectionModal] = useState(false);
  const [sectionForm, setSectionForm] = useState({ nazev: '', typ: 'single', povinne: true });
  const [itemModal, setItemModal] = useState(null); // { sekceId }
  const [itemForm, setItemForm] = useState({ nazev: '', popis: '', cena_os: '' });

  // Edit zakÄ‚Ë‡zka
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});

  // PlÄ‚Ë‡novÄ‚Ë‡nÄ‚Â­
  const [planForm, setPlanForm] = useState({
    harmonogram: '', kontaktni_osoby_misto: '', rozsah_sluzeb: '',
    personalni_pozadavky: '', logistika: '', technicke_pozadavky: '',
    alergeny: '', specialni_prani: '', checklist: [],
  });
  const [newCheckItem, setNewCheckItem] = useState('');
  const [newFollowupTitle, setNewFollowupTitle] = useState('');

  // PersonÄ‚Ë‡l modal
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
    enabled: personalEnabled && personalModal,
  });

  const { data: nabidkyData } = useQuery({
    queryKey: ['nabidky-zakazka', id],
    queryFn: () => nabidkyApi.list({ zakazka_id: id }),
  });

  const { data: uzivateleData } = useQuery({
    queryKey: ['uzivatele'],
    queryFn: () => uzivateleApi.list(),
    enabled: editModal,
  });
  const { data: venuesData } = useQuery({
    queryKey: ['venues-lite'],
    queryFn: () => venuesApi.list({ limit: 200, status: 'active' }),
    enabled: editModal || tab === 'venue',
  });
  const { data: venueBriefData, refetch: refetchVenueBrief } = useQuery({
    queryKey: ['zakazka-venue-brief', id],
    queryFn: () => zakazkyApi.getVenueBrief(id),
    enabled: !!id && tab === 'venue',
  });

  const { data: proposalsData, refetch: refetchProposals } = useQuery({
    queryKey: ['proposals', id],
    queryFn: () => proposalsApi.list({ zakazka_id: id }),
    enabled: tab === 'vybermenu',
  });

  const { data: editingProposalData, refetch: refetchEditingProposal } = useQuery({
    queryKey: ['proposal-detail', editingProposalId],
    queryFn: () => proposalsApi.get(editingProposalId),
    enabled: !!editingProposalId,
  });

  const { data: followupData, refetch: refetchFollowup } = useQuery({
    queryKey: ['followup', id],
    queryFn: () => followupApi.list({ zakazka_id: id }),
  });

  const createProposalMut = useMutation({
    mutationFn: (d) => proposalsApi.create(d),
    onSuccess: () => { refetchProposals(); toast.success('VÄ‚ËťbĂ„â€şr menu vytvoÄąâ„˘en'); setProposalModal(false); setProposalForm({ nazev: '', uvodni_text: '', expires_at: '' }); },
    onError: () => toast.error('Chyba pÄąâ„˘i vytvÄ‚Ë‡Äąâ„˘enÄ‚Â­'),
  });

  const deleteProposalMut = useMutation({
    mutationFn: (pid) => proposalsApi.delete(pid),
    onSuccess: () => { refetchProposals(); toast.success('OdstranĂ„â€şno'); },
  });

  const unlockProposalMut = useMutation({
    mutationFn: (pid) => proposalsApi.unlock(pid),
    onSuccess: () => { refetchProposals(); toast.success('VÄ‚ËťbĂ„â€şr odemknut Ă˘â‚¬â€ś klient mÄąĹ»ÄąÄľe znovu upravovat'); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba pYi odemykÄŹĹĽËťnÄŹĹĽËť'),
  });

  const sendProposalMut = useMutation({
    mutationFn: ({ pid, email }) => proposalsApi.send(pid, { email }),
    onSuccess: (res) => { toast.success('Odkaz odeslÄ‚Ë‡n'); setSendLinkModal(null); setSendEmail(''); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba pYi odesÄŹĹĽËťlÄŹĹĽËťnÄŹĹĽËť'),
  });

  const addSekseMut = useMutation({
    mutationFn: (d) => proposalsApi.addSekce(editingProposalId, d),
    onSuccess: () => { refetchEditingProposal(); toast.success('Sekce pÄąâ„˘idÄ‚Ë‡na'); setSectionModal(false); setSectionForm({ nazev: '', typ: 'single', povinne: true }); },
    onError: () => toast.error('Chyba pÄąâ„˘i pÄąâ„˘idÄ‚Ë‡vÄ‚Ë‡nÄ‚Â­ sekce'),
  });

  const deleteSekseMut = useMutation({
    mutationFn: (sekceId) => proposalsApi.deleteSekce(editingProposalId, sekceId),
    onSuccess: () => refetchEditingProposal(),
  });

  const addPolozkyMut = useMutation({
    mutationFn: ({ sekceId, data }) => proposalsApi.addPolozka(sekceId, data),
    onSuccess: () => { refetchEditingProposal(); toast.success('PoloÄąÄľka pÄąâ„˘idÄ‚Ë‡na'); setItemModal(null); setItemForm({ nazev: '', popis: '', cena_os: '' }); },
    onError: () => toast.error('Chyba pÄąâ„˘i pÄąâ„˘idÄ‚Ë‡vÄ‚Ë‡nÄ‚Â­ poloÄąÄľky'),
  });

  const deletePolozkyMut = useMutation({
    mutationFn: (polozkaId) => proposalsApi.deletePolozka(polozkaId),
    onSuccess: () => refetchEditingProposal(),
  });

  const stavMut = useMutation({
    mutationFn: ({ stav, poznamka }) => zakazkyApi.setStav(id, { stav, poznamka }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zakazka', id] }); toast.success('Stav zakÄ‚Ë‡zky aktualizovÄ‚Ë‡n'); setStavModal(false); },
    onError: (err) => {
      if (err?.response?.status === 400) {
        setTab('planovanÄ‚Â­');
        initPlan();
      }
      toast.error(err?.response?.data?.error || 'NepodaYilo se zmnit stav', { duration: 8000 });
    },
  });

  const archivMut = useMutation({
    mutationFn: () => zakazkyApi.archivovat(id),
    onSuccess: () => { toast.success('ZakÄ‚Ë‡zka archivovÄ‚Ë‡na'); navigate('/zakazky'); },
    onError: () => toast.error('NepodaÄąâ„˘ilo se archivovat zakÄ‚Ë‡zku'),
  });

  const komandoMut = useMutation({
    mutationFn: (d) => zakazkyApi.komando(id, d),
    onSuccess: (res) => {
      toast.success(res.data.message);
      setKomandoModal(false);
      setKomandoPozn('');
      setKomandoExtraEmails('');
      setKomandoIncludeAssigned(true);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba pĹ™i odesĂ­lĂˇnĂ­ komanda'),
  });

  const dekujemeMut = useMutation({
    mutationFn: (d) => zakazkyApi.dekujeme(id, d),
    onSuccess: (res) => { toast.success(res.data.message); setDekujemeModal(false); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při odesílání e-mailu'),
  });

  const editMut = useMutation({
    mutationFn: (d) => zakazkyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zakazka', id] }); toast.success('ZakÄ‚Ë‡zka uloÄąÄľena'); setEditModal(false); },
    onError: () => toast.error('Chyba pÄąâ„˘i uklÄ‚Ë‡dÄ‚Ë‡nÄ‚Â­'),
  });

  const planMut = useMutation({
    mutationFn: (d) => zakazkyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zakazka', id] }); toast.success('PlÄ‚Ë‡novÄ‚Ë‡nÄ‚Â­ uloÄąÄľeno'); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba pYi uklÄŹĹĽËťdÄŹĹĽËťnÄŹĹĽËť'),
  });

  const followupCreateMut = useMutation({
    mutationFn: (d) => followupApi.create(d),
    onSuccess: () => { refetchFollowup(); toast.success('Ä‚Ĺˇkol pÄąâ„˘idÄ‚Ë‡n'); setNewFollowupTitle(''); },
    onError: () => toast.error('Chyba pÄąâ„˘i vytvÄ‚Ë‡Äąâ„˘enÄ‚Â­ Ä‚Ĺźkolu'),
  });

  const followupDoneMut = useMutation({
    mutationFn: ({ taskId, splneno }) => followupApi.update(taskId, { splneno }),
    onSuccess: () => refetchFollowup(),
  });

  const followupDeleteMut = useMutation({
    mutationFn: (taskId) => followupApi.delete(taskId),
    onSuccess: () => refetchFollowup(),
  });

  const addPersonalMut = useMutation({
    mutationFn: (d) => personalApi.priradZakazku(d.personal_id, { zakazka_id: id, role_na_akci: d.role_na_akci, cas_prichod: d.cas_prichod, cas_odchod: d.cas_odchod }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zakazka', id] }); toast.success('PersonÄ‚Ë‡l pÄąâ„˘iÄąâ„˘azen'); setPersonalModal(false); setPersonalForm({ personal_id: '', role_na_akci: '', cas_prichod: '', cas_odchod: '' }); },
    onError: () => toast.error('Chyba pÄąâ„˘i pÄąâ„˘iÄąâ„˘azovÄ‚Ë‡nÄ‚Â­ personÄ‚Ë‡lu'),
  });

  const removePersonalMut = useMutation({
    mutationFn: (pid) => zakazkyApi.removePersonal(id, pid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zakazka', id] }); toast.success('PersonÄ‚Ë‡l odebrÄ‚Ë‡n'); },
    onError: () => toast.error('Chyba pÄąâ„˘i odebÄ‚Â­rÄ‚Ë‡nÄ‚Â­ personÄ‚Ë‡lu'),
  });

  const uploadMut = useMutation({
    mutationFn: (formData) => dokumentyApi.upload(formData),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zakazka', id] }); toast.success('Dokument nahrÄ‚Ë‡n'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Chyba pYi nahrÄŹĹĽËťvÄŹĹĽËťnÄŹĹĽËť dokumentu'),
  });

  const venueSnapshotMut = useMutation({
    mutationFn: () => zakazkyApi.createVenueSnapshot(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zakazka-venue-brief', id] }); toast.success('Snapshot prostoru byl vytvořen'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Snapshot prostoru se nepodařilo vytvořit'),
  });

  const venueDebriefMut = useMutation({
    mutationFn: (payload) => zakazkyApi.submitVenueDebrief(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zakazka', id] });
      qc.invalidateQueries({ queryKey: ['zakazka-venue-brief', id] });
      toast.success('Debrief prostoru byl uložen');
      setVenueDebriefModal(false);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Debrief se nepodařilo uložit'),
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`Soubor je pÄąâ„˘Ä‚Â­liÄąË‡ velkÄ‚Ëť. Maximum je ${MAX_FILE_SIZE_MB} MB.`);
      e.target.value = '';
      return;
    }
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
      venue_id: z.venue_id || '', venue_loading_zone_id: z.venue_loading_zone_id || '',
      venue_service_area_id: z.venue_service_area_id || '', venue_route_id: z.venue_route_id || '',
      obchodnik_id: z.obchodnik_id || '',
    });
    setEditModal(true);
  };

  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }));
  const setPF = (k, v) => setPlanForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  const z = data?.data;
  if (!z) return <div className="p-6 text-stone-500">ZakÄ‚Ë‡zka nenalezena</div>;

  const venueOptions = venuesData?.data?.data || [];
  const venueBrief = venueBriefData?.data;
  const curIdx = WORKFLOW.findIndex(s => s.stav === z.stav);
  const checklistTemplate = Array.isArray(z.checklist_template) ? z.checklist_template : [];
  const suggestedChecklist = mergeChecklistTemplate(z.checklist, checklistTemplate);
  const checklistStats = getChecklistProgress(planForm.checklist);

  // Sync planForm from z if not yet edited (use z as source of truth on first load)
  const initPlan = () => setPlanForm({
    harmonogram: z.harmonogram || '',
    kontaktni_osoby_misto: z.kontaktni_osoby_misto || '',
    rozsah_sluzeb: z.rozsah_sluzeb || '',
    personalni_pozadavky: z.personalni_pozadavky || '',
    logistika: z.logistika || '',
    technicke_pozadavky: z.technicke_pozadavky || '',
    alergeny: z.alergeny || '',
    specialni_prani: z.specialni_prani || '',
    checklist: suggestedChecklist,
  });
  const personalList = personalListData?.data?.data || personalListData?.data || [];

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-6 py-4">
        <button onClick={() => navigate('/zakazky')}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 mb-3 transition-colors">
          <ArrowLeft size={12} /> ZakÄ‚Ë‡zky
        </button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-base font-semibold text-stone-900">{z.nazev}</h1>
              <TypBadge typ={z.typ} />
              <StavBadge stav={z.stav} />
            </div>
            <div className="text-xs text-stone-400">{z.cislo} Ă‚Â· VytvoÄąâ„˘eno {formatDatum(z.created_at)}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Btn size="sm" onClick={openEdit}><Pencil size={12}/> Upravit</Btn>
            <Btn size="sm" onClick={() => { setNovyStav(z.stav); setStavModal(true); }}>
              ZmĂ„â€şnit stav
            </Btn>
            <Btn size="sm" variant="primary" onClick={() => {
              const list = nabidkyData?.data?.data || [];
              if (list.length > 0) navigate(`/nabidky/${list[0].id}/edit`);
              else navigate(`/nabidky/nova?zakazka_id=${id}`);
            }}>
              NabÄ‚Â­dka
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
                  {done && <span className="text-stone-500">Ă˘Ĺ›â€ś</span>}
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
        {[
          ['detaily','Detaily'],
          ['venue','Brief prostoru'],
          ['planovanÄ‚Â­','PlÄ‚Ë‡novÄ‚Ë‡nÄ‚Â­'],
          ['historie','Historie'],
          ...(personalEnabled ? [['personal','PersonÄŹĹĽËťl']] : []),
          ...(dokumentyEnabled ? [['dokumenty','Dokumenty']] : []),
          ['vybermenu','VÄ‚ËťbĂ„â€şr menu'],
          ...(emailEnabled ? [['emaily','E-maily']] : []),
        ].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); if (k === 'planovanÄ‚Â­') initPlan(); }}
            className={`px-4 py-3 text-sm border-b-2 transition-colors ${
              tab === k ? 'border-stone-900 text-stone-900 font-medium' : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}>{l}</button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {tab === 'detaily' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LevÄ‚Ëť sloupec */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl border border-stone-200 p-5">
                <h3 className="text-sm font-semibold text-stone-700 mb-4">ZÄ‚Ë‡kladnÄ‚Â­ informace</h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    ['Datum akce',   formatDatum(z.datum_akce)],
                    ['ZaĂ„Ĺ¤Ä‚Ë‡tek',      z.cas_zacatek || 'Ă˘â‚¬â€ť'],
                    ['Konec',        z.cas_konec || 'Ă˘â‚¬â€ť'],
                    ['MÄ‚Â­sto konÄ‚Ë‡nÄ‚Â­', z.misto || 'Ă˘â‚¬â€ť'],
                    ['PoĂ„Ĺ¤et hostÄąĹ»',  z.pocet_hostu || 'Ă˘â‚¬â€ť'],
                    ['RozpoĂ„Ĺ¤et klienta', formatCena(z.rozpocet_klienta)],
                  ].map(([k,v]) => (
                    <div key={k}><dt className="text-stone-500 text-xs">{k}</dt><dd className="font-medium text-stone-800 mt-0.5">{v}</dd></div>
                  ))}
                </dl>
              </div>
              {z.nabidka && (
                <div className="bg-white rounded-xl border border-stone-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-stone-700">NabÄ‚Â­dka</h3>
                    <button
                      onClick={() => navigate(`/nabidky/${z.nabidka.id}/edit`)}
                      className="text-xs text-stone-400 hover:text-brand-600 flex items-center gap-1 transition-colors"
                    >
                      <Pencil size={11}/> Upravit
                    </button>
                  </div>
                  <div className="text-xs text-stone-500 mb-2">
                    {z.nabidka.nazev || 'NabÄ‚Â­dka'} Ă‚Â· v{z.nabidka.verze}
                    {z.nabidka.cena_celkem > 0 && <span className="ml-2 font-medium text-stone-700">{formatCena(z.nabidka.cena_celkem)}</span>}
                  </div>
                  {(z.nabidka.polozky || []).length > 0 && (
                    <ul className="space-y-1 border-t border-stone-100 pt-2 mt-2">
                      {z.nabidka.polozky.slice(0, 6).map((p, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-stone-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-stone-300 flex-shrink-0"/>
                          <span>{p.nazev}</span>
                          {p.mnozstvi && p.jednotka && <span className="text-stone-400 ml-auto">{p.mnozstvi} {p.jednotka}</span>}
                        </li>
                      ))}
                      {z.nabidka.polozky.length > 6 && (
                        <li className="text-xs text-stone-400 pt-0.5">Ă˘â‚¬Â¦a {z.nabidka.polozky.length - 6} dalÄąË‡Ä‚Â­ch</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
              {z.poznamka_klient && (
                <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
                  <div className="text-xs font-medium text-blue-700 mb-1">PoznÄ‚Ë‡mka klienta</div>
                  <p className="text-sm text-blue-800">{z.poznamka_klient}</p>
                </div>
              )}
              {z.poznamka_interni && (
                <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
                  <div className="text-xs font-medium text-amber-700 mb-1">InternÄ‚Â­ poznÄ‚Ë‡mka</div>
                  <p className="text-sm text-amber-800">{z.poznamka_interni}</p>
                </div>
              )}
            </div>

            {/* PravÄ‚Ëť sloupec */}
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
                  <div className="flex justify-between"><span className="text-stone-500">NÄ‚Ë‡klady</span><span className="text-stone-700">{formatCena(z.cena_naklady)}</span></div>
                  {z.cena_celkem && z.cena_naklady && (
                    <div className="flex justify-between"><span className="text-stone-500">MarÄąÄľe</span>
                      <span className="text-green-700 font-medium">
                        {formatCena(z.cena_celkem - z.cena_naklady)} ({Math.round((z.cena_celkem - z.cena_naklady)/z.cena_celkem*100)} %)
                      </span>
                    </div>
                  )}
                  <div className="border-t border-stone-100 pt-2">
                    <div className="flex justify-between"><span className="text-stone-500">ZÄ‚Ë‡loha</span><span className="text-stone-700">{formatCena(z.zaloha)}</span></div>
                    <div className="flex justify-between"><span className="text-stone-500">Doplatek</span><span className="text-stone-700">{formatCena(z.doplatek)}</span></div>
                  </div>
                </div>
              </div>

              {z.obchodnik_jmeno && (
                <div className="bg-white rounded-xl border border-stone-200 p-4">
                  <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Odpov?dn?</h3>
                  <div className="text-sm font-medium text-stone-700">{z.obchodnik_jmeno} {z.obchodnik_prijmeni}</div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Akce</h3>
                <div className="flex flex-col gap-2">
                  {emailEnabled && (
                    <Btn size="sm" onClick={() => { setDekujemeForm({ to: z.klient_email || '', text: '' }); setDekujemeModal(true); }}>
                      <Heart size={12}/> D?kovac? e-mail
                    </Btn>
                  )}
                  {emailEnabled && (
                    <Btn size="sm" onClick={() => {
                      setKomandoPozn('');
                      setKomandoExtraEmails('');
                      setKomandoIncludeAssigned(true);
                      setKomandoModal(true);
                    }}>
                      <Send size={12}/> Komando e-mail
                    </Btn>
                  )}
                  <Btn size="sm" onClick={() => printKomandoPdf(z)}>
                    <Printer size={12}/> Komando PDF
                  </Btn>
                  <Btn size="sm" onClick={() => navigate(`/faktury/nova?zakazka_id=${id}`)}>
                    <Receipt size={12}/> Vystavit fakturu
                  </Btn>
                  <Btn size="sm" onClick={() => navigate(`/zakazky/${id}/vyrobni-list`)}>
                    <ChefHat size={12}/> V?robn? list
                  </Btn>
                  <Btn size="sm" onClick={async () => {
                    try {
                      const res = await zakazkyApi.getDodaciList(id);
                      const blob = new Blob([res.data], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const win = window.open(url, '_blank');
                      if (win) win.onload = () => URL.revokeObjectURL(url);
                    } catch {
                      toast.error('Nepoda?ilo se na??st dodac? list');
                    }
                  }}>
                    <FileText size={12}/> Dodac? list
                  </Btn>
                  <Btn size="sm" onClick={async () => {
                    try {
                      const res = await zakazkyApi.getPodklady(id);
                      const blob = new Blob([res.data], { type: 'text/html;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const win = window.open(url, '_blank');
                      if (win) win.onload = () => URL.revokeObjectURL(url);
                    } catch {
                      toast.error('Nepoda?ilo se na??st podklady');
                    }
                  }}>
                    <FileText size={12}/> Podklady k fakturaci
                  </Btn>
                  <button
                    onClick={() => window.confirm('Archivovat zak?zku?') && archivMut.mutate()}
                    disabled={archivMut.isPending}
                    className="text-xs text-stone-400 hover:text-red-600 transition-colors mt-1 text-left">
                    Archivovat zak?zku
                  </button>
                </div>
              </div>

              {/* Follow-up Ä‚Ĺźkoly */}
              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ListChecks size={13} className="text-stone-400"/>
                  <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Follow-up Ä‚Ĺźkoly</h3>
                </div>
                <div className="space-y-2 mb-3">
                  {(followupData?.data?.data || []).length === 0 && (
                    <p className="text-xs text-stone-400">ÄąËťÄ‚Ë‡dnÄ‚Â© Ä‚Ĺźkoly</p>
                  )}
                  {(followupData?.data?.data || []).map(t => (
                    <div key={t.id} className="flex items-start gap-2">
                      <button onClick={() => followupDoneMut.mutate({ taskId: t.id, splneno: !t.splneno })} className="mt-0.5 flex-shrink-0">
                        {t.splneno
                          ? <CheckSquare size={14} className="text-green-500"/>
                          : <Square size={14} className="text-stone-300 hover:text-stone-500"/>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs leading-snug ${t.splneno ? 'line-through text-stone-400' : 'text-stone-700'}`}>{t.titulek}</div>
                        {t.termin && (
                          <div className={`text-xs mt-0.5 ${!t.splneno && new Date(t.termin) < new Date() ? 'text-red-500' : 'text-stone-400'}`}>
                            {formatDatum(t.termin)}
                          </div>
                        )}
                      </div>
                      <button onClick={() => followupDeleteMut.mutate(t.id)} className="text-stone-300 hover:text-red-400 flex-shrink-0 mt-0.5">
                        <XIcon size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={e => { e.preventDefault(); if (newFollowupTitle.trim()) followupCreateMut.mutate({ zakazka_id: parseInt(id), titulek: newFollowupTitle.trim() }); }} className="flex gap-1">
                  <input
                    className="flex-1 border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none min-w-0"
                    placeholder="NovÄ‚Ëť Ä‚ĹźkolĂ˘â‚¬Â¦"
                    value={newFollowupTitle}
                    onChange={e => setNewFollowupTitle(e.target.value)}
                  />
                  <button type="submit" disabled={followupCreateMut.isPending} className="px-2 py-1 bg-stone-900 text-white rounded text-xs hover:bg-stone-700 flex-shrink-0">
                    <Plus size={11}/>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {tab === 'planovanÄ‚Â­' && (
          <div className="max-w-3xl space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-stone-700">PlÄ‚Ë‡novÄ‚Ë‡nÄ‚Â­ akce</h3>
                <p className="text-xs text-stone-400 mt-0.5">Harmonogram, logistika, personÄ‚Ë‡l a speciÄ‚Ë‡lnÄ‚Â­ poÄąÄľadavky pro realizaci zakÄ‚Ë‡zky.</p>
              </div>
              <Btn size="sm" variant="primary" onClick={() => planMut.mutate(planForm)} disabled={planMut.isPending}>
                {planMut.isPending ? 'UklÄŹĹĽËťdÄŹĹĽËťm&' : 'Ulo~it plÄŹĹĽËťnovÄŹĹĽËťnÄŹĹĽËť'}
              </Btn>
            </div>

            {/* Harmonogram */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
              <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Harmonogram</label>
              <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={4}
                placeholder="PÄąâ„˘ibliÄąÄľnÄ‚Ëť Ă„Ĺ¤asovÄ‚Ëť plÄ‚Ë‡n akce Ă˘â‚¬â€ś pÄąâ„˘Ä‚Â­jezd, pÄąâ„˘Ä‚Â­prava, servis, Ä‚ĹźklidĂ˘â‚¬Â¦"
                value={planForm.harmonogram} onChange={e => setPF('harmonogram', e.target.value)}/>
            </div>

            {/* KontaktnÄ‚Â­ osoby na mÄ‚Â­stĂ„â€ş */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
              <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">KontaktnÄ‚Â­ osoby na mÄ‚Â­stĂ„â€ş</label>
              <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={3}
                placeholder="JmÄ‚Â©no, telefon, role (sprÄ‚Ë‡vce objektu, koordinÄ‚Ë‡tor klientaĂ˘â‚¬Â¦)"
                value={planForm.kontaktni_osoby_misto} onChange={e => setPF('kontaktni_osoby_misto', e.target.value)}/>
            </div>

            {/* Rozsah sluÄąÄľeb */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
              <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Rozsah sluÄąÄľeb</label>
              <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={3}
                placeholder="Co zajiÄąË‡ÄąÄ„ujeme Ă˘â‚¬â€ś catering, obsluha, pronÄ‚Ë‡jem nÄ‚Ë‡dobÄ‚Â­, vÄ‚ËťzdobaĂ˘â‚¬Â¦"
                value={planForm.rozsah_sluzeb} onChange={e => setPF('rozsah_sluzeb', e.target.value)}/>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PersonÄ‚Ë‡lnÄ‚Â­ poÄąÄľadavky */}
              <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
                <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">PersonÄ‚Ë‡lnÄ‚Â­ poÄąÄľadavky</label>
                <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={4}
                  placeholder="PoĂ„Ĺ¤et kuchaÄąâ„˘ÄąĹ», Ă„Ĺ¤Ä‚Â­ÄąË‡nÄ‚Â­kÄąĹ», Äąâ„˘idiĂ„Ĺ¤ÄąĹ»; dress code; speciÄ‚Ë‡lnÄ‚Â­ roleĂ˘â‚¬Â¦"
                  value={planForm.personalni_pozadavky} onChange={e => setPF('personalni_pozadavky', e.target.value)}/>
              </div>

              {/* Logistika */}
              <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
                <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Logistika</label>
                <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={4}
                  placeholder="ParkovÄ‚Ë‡nÄ‚Â­, naklÄ‚Ë‡dka/vyklÄ‚Ë‡dka, pÄąâ„˘Ä‚Â­stup do objektu, pÄąâ„˘eprava zboÄąÄľÄ‚Â­Ă˘â‚¬Â¦"
                  value={planForm.logistika} onChange={e => setPF('logistika', e.target.value)}/>
              </div>

              {/* TechnickÄ‚Â© poÄąÄľadavky */}
              <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
                <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">TechnickÄ‚Â© poÄąÄľadavky</label>
                <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={4}
                  placeholder="ElektrickÄ‚Â© pÄąâ„˘Ä‚Â­pojky, chlazenÄ‚Â­, vybavenÄ‚Â­ kuchynĂ„â€ş na mÄ‚Â­stĂ„â€şĂ˘â‚¬Â¦"
                  value={planForm.technicke_pozadavky} onChange={e => setPF('technicke_pozadavky', e.target.value)}/>
              </div>

              {/* Alergeny */}
              <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
                <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Alergeny a diety</label>
                <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={4}
                  placeholder="SpecifickÄ‚Â© alergie hostÄąĹ», vegetariÄ‚Ë‡ni, vegani, bezlepkovÄ‚Ë‡ dietaĂ˘â‚¬Â¦"
                  value={planForm.alergeny} onChange={e => setPF('alergeny', e.target.value)}/>
              </div>
            </div>

            {/* SpeciÄ‚Ë‡lnÄ‚Â­ pÄąâ„˘Ä‚Ë‡nÄ‚Â­ klienta */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
              <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">SpeciÄ‚Ë‡lnÄ‚Â­ pÄąâ„˘Ä‚Ë‡nÄ‚Â­ klienta</label>
              <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={3}
                placeholder="DortovÄ‚Ëť servis, welcome drink, speciÄ‚Ë‡lnÄ‚Â­ vÄ‚Ëťzdoba, hudbaĂ˘â‚¬Â¦"
                value={planForm.specialni_prani} onChange={e => setPF('specialni_prani', e.target.value)}/>
            </div>

            {/* Checklist realizace */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Checklist realizace</label>
                  <p className="text-xs text-stone-400 mt-1">
                    Hotovo {checklistStats.done}/{checklistStats.total || suggestedChecklist.length || 0}
                    {checklistStats.pending > 0 ? `, chybi ${checklistStats.pending}` : ''}
                  </p>
                </div>
                {checklistTemplate.length > 0 && (
                  <Btn
                    size="sm"
                    onClick={() => setPF('checklist', mergeChecklistTemplate(planForm.checklist, checklistTemplate))}
                  >
                    <Copy size={12}/> Doplni sablonu
                  </Btn>
                )}
              </div>
              <div className="space-y-2">
                {(planForm.checklist || []).map((item, i) => (
                  <div key={item.key || i} className="flex items-start gap-2 group">
                    <button onClick={() => {
                      const c = [...planForm.checklist];
                      c[i] = { ...c[i], done: !c[i].done };
                      setPF('checklist', c);
                    }} className="text-stone-400 hover:text-stone-700 flex-shrink-0 mt-0.5">
                      {item.done ? <CheckSquare size={16} className="text-green-600"/> : <Square size={16}/>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${item.done ? 'line-through text-stone-400' : 'text-stone-700'}`}>{item.label}</div>
                      {item.requiredBy && (
                        <div className="mt-1">
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                            Povinne do: {requiredByLabel(item.requiredBy)}
                          </span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => {
                      const c = planForm.checklist.filter((_, j) => j !== i);
                      setPF('checklist', c);
                    }} className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-500 transition-all flex-shrink-0">
                      <XIcon size={13}/>
                    </button>
                  </div>
                ))}
                {(planForm.checklist || []).length === 0 && <p className="text-xs text-stone-400">ZatÄ‚Â­m ÄąÄľÄ‚Ë‡dnÄ‚Â© Ä‚Ĺźkoly. PÄąâ„˘idejte nÄ‚Â­ÄąÄľe.</p>}
              </div>
              <div className="flex gap-2 pt-1">
                <input className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder="NovÄ‚Ë‡ poloÄąÄľka checklistuĂ˘â‚¬Â¦"
                  value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCheckItem.trim()) {
                      setPF('checklist', [...(planForm.checklist || []), { label: newCheckItem.trim(), done: false }]);
                      setNewCheckItem('');
                    }
                  }}/>
                <Btn size="sm" onClick={() => {
                  if (!newCheckItem.trim()) return;
                  setPF('checklist', [...(planForm.checklist || []), { label: newCheckItem.trim(), done: false }]);
                  setNewCheckItem('');
                }}><Plus size={12}/></Btn>
              </div>
              <div className="flex justify-end pt-1">
                <Btn size="sm" variant="primary" onClick={() => planMut.mutate(planForm)} disabled={planMut.isPending}>
                  {planMut.isPending ? 'UklÄŹĹĽËťdÄŹĹĽËťm&' : 'Ulo~it plÄŹĹĽËťnovÄŹĹĽËťnÄŹĹĽËť'}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {tab === 'venue' && (
          <div className="max-w-5xl space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-stone-400"/>
                    <h3 className="text-sm font-semibold text-stone-800">Brief prostoru</h3>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">Provozní brief pro den akce se snapshotem prostoru a riziky.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn size="sm" onClick={() => venueSnapshotMut.mutate()} disabled={venueSnapshotMut.isPending}>
                    {venueSnapshotMut.isPending ? 'Ukládám...' : 'Vytvořit snapshot'}
                  </Btn>
                  <Btn size="sm" variant="primary" onClick={() => setVenueDebriefModal(true)}>
                    Debrief po akci
                  </Btn>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Prostor</label>
                  <select
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={editForm.venue_id ?? z.venue_id ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, venue_id: e.target.value || null, venue_loading_zone_id: null, venue_service_area_id: null, venue_route_id: null }))}
                  >
                    <option value="">-- bez prostoru --</option>
                    {venueOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <div className="mt-2">
                    <Btn size="sm" onClick={() => editMut.mutate({ venue_id: editForm.venue_id || null, venue_loading_zone_id: null, venue_service_area_id: null, venue_route_id: null }, { onSuccess: () => refetchVenueBrief() })}>
                      Uložit prostor
                    </Btn>
                  </div>
                </div>
                <div className="rounded-xl bg-stone-50 px-4 py-3">
                  {venueBrief?.venue ? (
                    <>
                      <div className="text-sm font-semibold text-stone-800">{venueBrief.venue.name}</div>
                      <div className="text-xs text-stone-500 mt-1">{[venueBrief.venue.address_line_1, venueBrief.venue.city, venueBrief.venue.postal_code].filter(Boolean).join(', ')}</div>
                      {venueBrief.stale_warning && <div className="mt-2 text-xs text-red-600">{venueBrief.stale_warning}</div>}
                    </>
                  ) : (
                    <div className="text-sm text-stone-400">K zakázce zatím není přiřazený prostor.</div>
                  )}
                </div>
              </div>
            </div>

            {venueBrief?.venue && (
              <>
                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-stone-200 p-4"><div className="text-xs text-stone-500">Rezerva na security</div><div className="text-lg font-semibold text-stone-800 mt-1">{venueBrief.summary?.expected_security_delay_min || 0} min</div></div>
                  <div className="bg-white rounded-xl border border-stone-200 p-4"><div className="text-xs text-stone-500">Vykládka do sálu</div><div className="text-lg font-semibold text-stone-800 mt-1">{venueBrief.summary?.expected_unload_to_room_min || 0} min</div></div>
                  <div className="bg-white rounded-xl border border-stone-200 p-4"><div className="text-xs text-stone-500">Omezení</div><div className="text-lg font-semibold text-stone-800 mt-1">{venueBrief.summary?.critical_restrictions_count || 0}</div></div>
                  <div className="bg-white rounded-xl border border-stone-200 p-4"><div className="text-xs text-stone-500">Opakující se problémy</div><div className="text-lg font-semibold text-stone-800 mt-1">{venueBrief.summary?.recurring_issues_count || 0}</div></div>
                </div>

                <div className="grid xl:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-stone-800">Operativní instrukce</h4>
                    <div className="text-sm text-stone-700 space-y-2">
                      <div><span className="text-stone-500">Check-in:</span> {venueBrief.access_rule?.check_in_point || 'neuvedeno'}</div>
                      <div><span className="text-stone-500">Loading zóna:</span> {venueBrief.loading_zone?.name || 'neuvedeno'}</div>
                      <div><span className="text-stone-500">Servisní zóna:</span> {venueBrief.service_area?.name || 'neuvedeno'}</div>
                      <div><span className="text-stone-500">Trasa:</span> {venueBrief.route?.name || 'neuvedeno'}</div>
                    </div>
                    {(venueBrief.route_steps || []).length > 0 && (
                      <div className="space-y-2">
                        {(venueBrief.route_steps || []).map((step) => (
                          <div key={step.id || step.step_index} className="rounded-xl bg-stone-50 px-3 py-2">
                            <div className="text-xs text-stone-500">Krok {step.step_index}</div>
                            <div className="text-sm text-stone-700 mt-1">{step.instruction}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-stone-800">Rizika a kontakty</h4>
                    {(venueBrief.risks || []).length > 0 ? (
                      <div className="space-y-2">
                        {venueBrief.risks.map((risk, idx) => (
                          <div key={`${risk.type}-${idx}`} className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/>
                            <span>{risk.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-sm text-stone-400">Bez výrazných rizik.</div>}
                    {(venueBrief.contacts || []).map((contact) => (
                      <div key={contact.id} className="rounded-xl bg-stone-50 px-3 py-2">
                        <div className="text-sm font-medium text-stone-800">{contact.name}</div>
                        <div className="text-xs text-stone-500 mt-1">{[contact.role, contact.phone, contact.email].filter(Boolean).join(' Ă‚Â· ')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
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
                      {h.jmeno} {h.prijmeni} ? {formatDatum(h.created_at)}
                    </div>
                  </div>
                </div>
              ))}
              {!z.history?.length && <div className="py-8 text-center text-sm text-stone-400">??dn? historie</div>}
            </div>
          </div>
        )}

        {tab === 'personal' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-stone-200">
              <div className="px-5 py-3.5 border-b border-stone-100 flex justify-between items-center">
                <span className="text-sm font-semibold text-stone-700">P?i?azen? person?l</span>
                <Btn size="sm" onClick={() => setPersonalModal(true)}><UserPlus size={12}/> P?idat</Btn>
              </div>
              {(z.personal || []).map(p => (
                <div key={p.personal_id} className="flex items-center gap-3 px-5 py-3 border-b border-stone-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-medium text-stone-600">
                    {p.jmeno[0]}{p.prijmeni[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-800">{p.jmeno} {p.prijmeni}</div>
                    <div className="text-xs text-stone-400">{p.role_na_akci || p.role} ? {p.cas_prichod}?{p.cas_odchod}</div>
                  </div>
                  <div className="text-xs text-stone-500">{p.telefon}</div>
                  <button onClick={() => removePersonalMut.mutate(p.personal_id)}
                    className="text-stone-300 hover:text-red-500 transition-colors p-1" title="Odebrat">
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
              {!z.personal?.length && <div className="py-8 text-center text-sm text-stone-400">??dn? person?l p?i?azen</div>}
            </div>
          </div>
        )}

        {tab === 'dokumenty' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-stone-200">
              <div className="px-5 py-3.5 border-b border-stone-100 flex justify-between items-center">
                <div>
                  <span className="text-sm font-semibold text-stone-700">P??lohy a dokumenty</span>
                  <div className="text-xs text-stone-400 mt-1">Maxim?ln? velikost souboru: {MAX_FILE_SIZE_MB} MB</div>
                </div>
                <div>
                  <Btn size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}>
                    <Upload size={12}/> {uploadMut.isPending ? 'Nahr?v?m...' : 'Nahr?t'}
                  </Btn>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange}/>
                </div>
              </div>
              {(z.dokumenty || []).map(d => (
                <div key={d.id} className="flex items-center gap-3 px-5 py-3 border-b border-stone-50 last:border-0">
                  <div className="w-8 h-8 rounded-md bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500 uppercase">
                    {d.filename.split('.').pop()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-800">{d.nazev}</div>
                    <div className="text-xs text-stone-400">{d.kategorie} ? {Math.round(d.velikost/1024)} KB ? {formatDatum(d.created_at)}</div>
                  </div>
                  <button
                    onClick={() => handleDocumentDownload(d)}
                    type="button"
                    className="text-xs text-stone-500 hover:text-stone-800 transition-colors">
                    St?hnout
                  </button>
                </div>
              ))}
              {!z.dokumenty?.length && <div className="py-8 text-center text-sm text-stone-400">??dn? dokumenty</div>}
            </div>
          </div>
        )}

        {tab === 'vybermenu' && (
          <div className="max-w-3xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-stone-700">KlientskÄ‚Ëť vÄ‚ËťbĂ„â€şr menu</h3>
                <p className="text-xs text-stone-400 mt-0.5">Generuj unikÄ‚Ë‡tnÄ‚Â­ odkaz pro klienta Ă˘â‚¬â€ś vybere si menu a zÄ‚Ë‡vaznĂ„â€ş potvrdÄ‚Â­.</p>
              </div>
              <Btn size="sm" variant="primary" onClick={() => { setProposalForm({ nazev: z.nazev || '', uvodni_text: '', expires_at: '', guest_count: z.pocet_hostu || 1 }); setProposalModal(true); }}>
                <Plus size={12}/> NovÄ‚Ëť vÄ‚ËťbĂ„â€şr
              </Btn>
            </div>

            {(proposalsData?.data?.data || []).length === 0 && (
              <div className="bg-white rounded-xl border border-stone-200 py-12 text-center text-sm text-stone-400">
                ZatÄ‚Â­m ÄąÄľÄ‚Ë‡dnÄ‚Ëť vÄ‚ËťbĂ„â€şr menu. KliknĂ„â€şte na Ă˘â‚¬ĹľNovÄ‚Ëť vÄ‚ËťbĂ„â€şr" pro vytvoÄąâ„˘enÄ‚Â­.
              </div>
            )}

            {(proposalsData?.data?.data || []).map(pr => {
              const statusColors = {
                draft: 'bg-stone-100 text-stone-600',
                sent: 'bg-blue-100 text-blue-700',
                signed: 'bg-green-100 text-green-700',
              };
              return (
                <div key={pr.id} className="bg-white rounded-xl border border-stone-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-stone-800">{pr.nazev || 'Bez nÄ‚Ë‡zvu'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[pr.status] || 'bg-stone-100 text-stone-600'}`}>
                          {pr.status === 'draft' ? 'Koncept' : pr.status === 'sent' ? 'OdeslÄŹĹĽËťno' : pr.status === 'signed' ? 'Potvrzeno' : pr.status}
                        </span>
                      </div>
                      <div className="text-xs text-stone-400 mt-1 flex flex-wrap gap-3">
                        <span>Ä‘Ĺşâ€Ä„ {pr.guest_count} hostÄąĹ»</span>
                        {pr.total_price > 0 && <span>Ä‘Ĺşâ€™Â° {new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(pr.total_price)} celkem</span>}
                        {pr.signed_by && <span>Ă˘Ĺ›â€¦ Potvrdil(a): {pr.signed_by}</span>}
                        {pr.expires_at && <span>Ă˘ĹąÂ° Platnost do: {new Date(pr.expires_at).toLocaleDateString('cs-CZ')}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => { navigator.clipboard.writeText(pr.url); toast.success('Odkaz zkopÄ‚Â­rovÄ‚Ë‡n'); }}
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors" title="KopÄ‚Â­rovat odkaz">
                        <Copy size={13}/>
                      </button>
                      <a href={pr.url} target="_blank" rel="noreferrer"
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors" title="OtevÄąâ„˘Ä‚Â­t jako klient">
                        <ExternalLink size={13}/>
                      </a>
                      {emailEnabled && pr.status !== 'signed' && (
                        <button
                          onClick={() => { setSendLinkModal(pr); setSendEmail(z.klient_email || ''); }}
                          className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Odeslat odkaz emailem">
                          <Send size={13}/>
                        </button>
                      )}
                      <button
                        onClick={() => setEditingProposalId(editingProposalId === pr.id ? null : pr.id)}
                        className={`p-1.5 rounded-lg transition-colors ${editingProposalId === pr.id ? 'bg-purple-100 text-purple-700' : 'text-stone-400 hover:text-purple-600 hover:bg-purple-50'}`} title="Upravit menu">
                        <Pencil size={13}/>
                      </button>
                      {pr.status === 'signed' && (
                        <button
                          onClick={() => { if (confirm('Odemknout vÄŹĹĽËťbr? Klient bude moci znovu upravovat svoj vÄŹĹĽËťbr.')) unlockProposalMut.mutate(pr.id); }}
                          className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Odemknout vÄ‚ËťbĂ„â€şr">
                          <LockOpen size={13}/>
                        </button>
                      )}
                      {pr.status !== 'signed' && (
                        <button
                          onClick={() => { if (confirm('Odstranit tento vÄŹĹĽËťbr menu?')) deleteProposalMut.mutate(pr.id); }}
                          className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Odstranit">
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-stone-50 flex items-center gap-2">
                    <Link size={10} className="text-stone-300 flex-shrink-0"/>
                    <a href={pr.url} target="_blank" rel="noreferrer"
                      className="text-xs text-stone-400 hover:text-purple-600 truncate transition-colors">
                      {pr.url}
                    </a>
                  </div>

                  {editingProposalId === pr.id && (() => {
                    const ep = editingProposalData?.data || editingProposalData;
                    const sekce = ep?.sekce || [];
                    return (
                      <div className="mt-4 pt-4 border-t border-stone-100 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-stone-600">Sekce a poloÄąÄľky menu</span>
                          <Btn size="sm" onClick={() => setSectionModal(true)}><Plus size={11}/> PÄąâ„˘idat sekci</Btn>
                        </div>
                        {sekce.length === 0 && (
                          <p className="text-xs text-stone-400 text-center py-4">ÄąËťÄ‚Ë‡dnÄ‚Â© sekce. PÄąâ„˘idejte sekci (napÄąâ„˘. Ă˘â‚¬ĹľPÄąâ„˘edkrm", Ă˘â‚¬ĹľHlavnÄ‚Â­ chod").</p>
                        )}
                        {sekce.map(s => (
                          <div key={s.id} className="border border-stone-100 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-stone-50">
                              <div>
                                <span className="text-xs font-semibold text-stone-700">{s.nazev}</span>
                                <span className="ml-2 text-xs text-stone-400">{s.typ === 'single' ? 'VÄŹĹĽËťbr 1' : `VÄŹĹĽËťbr ${s.min_vyberu}${s.max_vyberu}`}</span>
                              </div>
                              <div className="flex gap-1">
                                <Btn size="sm" onClick={() => setItemModal({ sekceId: s.id })}><Plus size={11}/> PoloÄąÄľka</Btn>
                                <button onClick={() => { if (confirm('Smazat sekci i se vaemi polo~kami?')) deleteSekseMut.mutate(s.id); }}
                                  className="p-1 text-stone-300 hover:text-red-500 transition-colors"><Trash2 size={12}/></button>
                              </div>
                            </div>
                            {(s.polozky || []).map(pol => (
                              <div key={pol.id} className="flex items-center justify-between px-3 py-2 border-t border-stone-50">
                                <div>
                                  <span className="text-xs font-medium text-stone-700">{pol.nazev}</span>
                                  {pol.cena_os > 0 && <span className="ml-2 text-xs text-stone-400">+{new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(pol.cena_os)}/os.</span>}
                                  {pol.popis && <div className="text-xs text-stone-400">{pol.popis}</div>}
                                </div>
                                <button onClick={() => deletePolozkyMut.mutate(pol.id)}
                                  className="p-1 text-stone-300 hover:text-red-500 transition-colors flex-shrink-0"><Trash2 size={12}/></button>
                              </div>
                            ))}
                            {(s.polozky || []).length === 0 && <div className="px-3 py-2 text-xs text-stone-300">ÄąËťÄ‚Ë‡dnÄ‚Â© poloÄąÄľky</div>}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {/* Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬ Tab: E-maily Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬ */}
        {tab === 'emaily' && (
          <EmailyTab zakazkaId={id} />
        )}
      </div>

      {/* Modal: zmĂ„â€şna stavu */}
      <Modal open={stavModal} onClose={() => setStavModal(false)} title="ZmĂ„â€şna stavu zakÄ‚Ë‡zky"
        footer={<>
          <Btn onClick={() => setStavModal(false)}>ZruÄąË‡it</Btn>
          <Btn variant="primary" onClick={() => stavMut.mutate({ stav: novyStav, poznamka: stavPozn })}>
            UloÄąÄľit
          </Btn>
        </>}>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-stone-500 block mb-1.5">NovÄ‚Ëť stav</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={novyStav} onChange={e => setNovyStav(e.target.value)}>
              {WORKFLOW.map(s => <option key={s.stav} value={s.stav}>{s.label}</option>)}
              <option value="stornovano">StornovÄ‚Ë‡no</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1.5">PoznÄ‚Ë‡mka (volitelnÄ‚Â©)</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              rows={3} value={stavPozn} onChange={e => setStavPozn(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Modal: Komando */}
      <Modal open={komandoModal} onClose={() => setKomandoModal(false)} title="Odeslat komando"
        footer={<>
          <Btn onClick={() => setKomandoModal(false)}>Zru?it</Btn>
          <Btn
            variant="primary"
            onClick={() => komandoMut.mutate({
              poznamka: komandoPozn,
              extraEmails: komandoExtraEmails,
              includeAssignedStaff: komandoIncludeAssigned,
            })}
            disabled={komandoMut.isPending || (!komandoIncludeAssigned && !komandoExtraEmails.trim())}
          >
            {komandoMut.isPending ? 'Odes?l?m...' : 'Odeslat komando'}
          </Btn>
        </>}>
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={komandoIncludeAssigned}
              onChange={(e) => setKomandoIncludeAssigned(e.target.checked)}
            />
            Poslat i p?i?azen?mu person?lu s vypln?n?m e-mailem
          </label>

          {z?.personal?.length > 0 ? (
            <div>
              <div className="text-xs text-stone-500 mb-2">P?i?azen? person?l:</div>
              <div className="bg-stone-50 rounded-lg border border-stone-200 divide-y divide-stone-100">
                {z.personal.map((p) => (
                  <div key={p.personal_id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-stone-800">{p.jmeno} {p.prijmeni}</span>
                    <span className="text-xs text-stone-500">{p.email || <span className="text-red-400">bez e-mailu</span>}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              K zak?zce nen? p?i?azen ??dn? person?l. Komando m??ete poslat na libovoln? adresy n??e.
            </p>
          )}

          <div>
            <label className="text-xs text-stone-500 block mb-1">Dal?? e-mailov? adresy</label>
            <textarea
              rows={3}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              placeholder="ops@firma.cz, externista@email.cz"
              value={komandoExtraEmails}
              onChange={(e) => setKomandoExtraEmails(e.target.value)}
            />
            <p className="text-xs text-stone-400 mt-1">Odd?lte adresy ??rkou, st?edn?kem nebo nov?m ??dkem.</p>
          </div>

          <div>
            <label className="text-xs text-stone-500 block mb-1">Dopl?uj?c? pozn?mka</label>
            <textarea
              rows={3}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              placeholder="Speci?ln? instrukce, parking, dress code, kontakt na m?st?..."
              value={komandoPozn}
              onChange={(e) => setKomandoPozn(e.target.value)}
            />
          </div>

          <p className="text-xs text-stone-400">E-mail obsahuje detaily akce, t?m a p?i odesl?n? zam?stnanc?m i jejich konkr?tn? ?asy.</p>
        </div>
      </Modal>

      {/* Modal: DĂ„â€şkovacÄ‚Â­ email */}
      <Modal open={dekujemeModal} onClose={() => setDekujemeModal(false)} title="Odeslat dĂ„â€şkovacÄ‚Â­ email"
        footer={<>
          <Btn onClick={() => setDekujemeModal(false)}>ZruÄąË‡it</Btn>
          <Btn variant="primary" onClick={() => dekujemeMut.mutate(dekujemeForm)} disabled={!dekujemeForm.to || dekujemeMut.isPending}>
            {dekujemeMut.isPending ? 'OdesÄŹĹĽËťlÄŹĹĽËťm&' : 'Odeslat'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">E-mail pÄąâ„˘Ä‚Â­jemce *</label>
            <input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={dekujemeForm.to} onChange={e => setDekujemeForm(f => ({ ...f, to: e.target.value }))}
              placeholder="klient@email.cz" autoFocus/>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Text emailu (volitelnÄ‚Â©)</label>
            <textarea rows={5} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              placeholder="Pokud nevyplnÄ‚Â­te, pouÄąÄľije se vÄ‚ËťchozÄ‚Â­ dĂ„â€şkovacÄ‚Â­ textĂ˘â‚¬Â¦"
              value={dekujemeForm.text} onChange={e => setDekujemeForm(f => ({ ...f, text: e.target.value }))}/>
          </div>
          <p className="text-xs text-stone-400">Email bude obsahovat souhrn akce (datum, mÄ‚Â­sto, poĂ„Ĺ¤et hostÄąĹ», cena).</p>
        </div>
      </Modal>

      {/* Modal: Upravit zakÄ‚Ë‡zku */}
      <Modal open={venueDebriefModal} onClose={() => setVenueDebriefModal(false)} title="Debrief prostoru"
        footer={<>
          <Btn onClick={() => setVenueDebriefModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => venueDebriefMut.mutate(venueDebriefForm)} disabled={venueDebriefMut.isPending}>
            {venueDebriefMut.isPending ? 'Ukládám...' : 'Uložit debrief'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Byl přístup podle očekávání?</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm" value={venueDebriefForm.access_as_expected} onChange={e => setVenueDebriefForm(f => ({ ...f, access_as_expected: e.target.value }))}>
              <option value="yes">Ano</option>
              <option value="no">Ne</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm" placeholder="Skutečné zdržení na security" value={venueDebriefForm.actual_security_delay_minutes} onChange={e => setVenueDebriefForm(f => ({ ...f, actual_security_delay_minutes: e.target.value }))} />
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm" placeholder="Vykládka -> servisní zóna" value={venueDebriefForm.actual_unload_to_service_area_minutes} onChange={e => setVenueDebriefForm(f => ({ ...f, actual_unload_to_service_area_minutes: e.target.value }))} />
          </div>
          {[
            ['loading_issue', 'loading_issue_note', 'Problém s vykládkou'],
            ['route_bottleneck', 'route_bottleneck_note', 'Zdržení na trase'],
            ['parking_issue', 'parking_issue_note', 'Problém s parkováním'],
            ['connectivity_issue', 'connectivity_issue_note', 'Problém s konektivitou'],
            ['restriction_discovered', 'new_restriction_note', 'Nově zjištěné omezení'],
          ].map(([flag, note, label]) => (
            <div key={flag} className="rounded-xl bg-stone-50 px-3 py-3">
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <input type="checkbox" checked={!!venueDebriefForm[flag]} onChange={e => setVenueDebriefForm(f => ({ ...f, [flag]: e.target.checked }))} />
                {label}
              </label>
              <textarea className="w-full mt-2 border border-stone-200 rounded-lg px-3 py-2 text-sm resize-none" rows={2} value={venueDebriefForm[note]} onChange={e => setVenueDebriefForm(f => ({ ...f, [note]: e.target.value }))} />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={!!venueDebriefForm.propose_master_update} onChange={e => setVenueDebriefForm(f => ({ ...f, propose_master_update: e.target.checked }))} />
            Navrhnout promítnutí do master dat prostoru
          </label>
        </div>
      </Modal>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Upravit zakÄ‚Ë‡zku"
        footer={<>
          <Btn onClick={() => setEditModal(false)}>ZruÄąË‡it</Btn>
          <Btn variant="primary" onClick={() => editMut.mutate(editForm)} disabled={editMut.isPending}>
            {editMut.isPending ? 'UklÄŹĹĽËťdÄŹĹĽËťm&' : 'Ulo~it'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">NÄ‚Ë‡zev zakÄ‚Ë‡zky</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={editForm.nazev || ''} onChange={e => setEF('nazev', e.target.value)}/></div>
          <div><label className="text-xs text-stone-500 block mb-1">Typ akce</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={editForm.typ || ''} onChange={e => setEF('typ', e.target.value)}>
              {TYP_OPTIONS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">OdpovĂ„â€şdnÄ‚Ë‡ osoba</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={editForm.obchodnik_id || ''} onChange={e => setEF('obchodnik_id', e.target.value || null)}>
              <option value="">Ă˘â‚¬â€ť nepÄąâ„˘iÄąâ„˘azeno Ă˘â‚¬â€ť</option>
              {(uzivateleData?.data?.data || uzivateleData?.data || []).map(u => (
                <option key={u.id} value={u.id}>{u.jmeno} {u.prijmeni}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Datum akce</label>
              <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.datum_akce || ''} onChange={e => setEF('datum_akce', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">PoĂ„Ĺ¤et hostÄąĹ»</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.pocet_hostu || ''} onChange={e => setEF('pocet_hostu', e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">ZaĂ„Ĺ¤Ä‚Ë‡tek</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.cas_zacatek || ''} onChange={e => setEF('cas_zacatek', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Konec</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.cas_konec || ''} onChange={e => setEF('cas_konec', e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">MÄ‚Â­sto konÄ‚Ë‡nÄ‚Â­</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={editForm.misto || ''} onChange={e => setEF('misto', e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Cena celkem (KĂ„Ĺ¤)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.cena_celkem || ''} onChange={e => setEF('cena_celkem', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">NÄ‚Ë‡klady (KĂ„Ĺ¤)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.cena_naklady || ''} onChange={e => setEF('cena_naklady', e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">ZÄ‚Ë‡loha (KĂ„Ĺ¤)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.zaloha || ''} onChange={e => setEF('zaloha', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Doplatek (KĂ„Ĺ¤)</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.doplatek || ''} onChange={e => setEF('doplatek', e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">PoznÄ‚Ë‡mka klienta</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={2}
              value={editForm.poznamka_klient || ''} onChange={e => setEF('poznamka_klient', e.target.value)}/></div>
          <div><label className="text-xs text-stone-500 block mb-1">InternÄ‚Â­ poznÄ‚Ë‡mka</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={2}
              value={editForm.poznamka_interni || ''} onChange={e => setEF('poznamka_interni', e.target.value)}/></div>
        </div>
      </Modal>

      {/* Modal: NovÄ‚Ëť vÄ‚ËťbĂ„â€şr menu */}
      <Modal open={proposalModal} onClose={() => setProposalModal(false)} title="NovÄ‚Ëť vÄ‚ËťbĂ„â€şr menu"
        footer={<>
          <Btn onClick={() => setProposalModal(false)}>ZruÄąË‡it</Btn>
          <Btn variant="primary" onClick={() => createProposalMut.mutate({ ...proposalForm, zakazka_id: id })} disabled={createProposalMut.isPending}>
            {createProposalMut.isPending ? 'VytvÄŹĹĽËťYÄŹĹĽËťm&' : 'VytvoYit'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">NÄ‚Ë‡zev vÄ‚ËťbĂ„â€şru *</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="VÄ‚ËťbĂ„â€şr menu Ă˘â‚¬â€ś NovÄ‚Ë‡kovi"
              value={proposalForm.nazev} onChange={e => setProposalForm(f => ({ ...f, nazev: e.target.value }))} autoFocus/>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Ä‚ĹˇvodnÄ‚Â­ text pro klienta</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" rows={3}
              placeholder="VÄ‚Ë‡ÄąÄľenÄ‚Â­ hostÄ‚Â©, pÄąâ„˘ipravili jsme pro vÄ‚Ë‡s vÄ‚ËťbĂ„â€şr z naÄąË‡eho menuĂ˘â‚¬Â¦"
              value={proposalForm.uvodni_text} onChange={e => setProposalForm(f => ({ ...f, uvodni_text: e.target.value }))}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">PoĂ„Ĺ¤et hostÄąĹ»</label>
              <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={proposalForm.guest_count || ''} onChange={e => setProposalForm(f => ({ ...f, guest_count: e.target.value }))}/>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Platnost do</label>
              <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={proposalForm.expires_at} onChange={e => setProposalForm(f => ({ ...f, expires_at: e.target.value }))}/>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Odeslat odkaz */}
      <Modal open={!!sendLinkModal} onClose={() => { setSendLinkModal(null); setSendEmail(''); }} title="Odeslat odkaz klientovi"
        footer={<>
          <Btn onClick={() => { setSendLinkModal(null); setSendEmail(''); }}>ZruÄąË‡it</Btn>
          <Btn variant="primary" onClick={() => sendProposalMut.mutate({ pid: sendLinkModal?.id, email: sendEmail })}
            disabled={!sendEmail || sendProposalMut.isPending}>
            {sendProposalMut.isPending ? 'OdesÄŹĹĽËťlÄŹĹĽËťm&' : 'Odeslat'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">E-mail pÄąâ„˘Ä‚Â­jemce</label>
            <input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="klient@email.cz" value={sendEmail} onChange={e => setSendEmail(e.target.value)} autoFocus/>
          </div>
          <div className="text-xs text-stone-400 bg-stone-50 rounded-lg px-3 py-2">
            Klient obdrÄąÄľÄ‚Â­ email s odkazem na vÄ‚ËťbĂ„â€şr menu. Odkaz si takÄ‚Â© mÄąĹ»ÄąÄľete zkopÄ‚Â­rovat tlaĂ„Ĺ¤Ä‚Â­tkem vpravo.
          </div>
        </div>
      </Modal>

      {/* Modal: PÄąâ„˘idat sekci */}
      <Modal open={sectionModal} onClose={() => setSectionModal(false)} title="PÄąâ„˘idat sekci"
        footer={<>
          <Btn onClick={() => setSectionModal(false)}>ZruÄąË‡it</Btn>
          <Btn variant="primary" onClick={() => addSekseMut.mutate(sectionForm)} disabled={!sectionForm.nazev || addSekseMut.isPending}>
            {addSekseMut.isPending ? 'PYidÄŹĹĽËťvÄŹĹĽËťm&' : 'PYidat sekci'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">NÄ‚Ë‡zev sekce *</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="PÄąâ„˘edkrm, HlavnÄ‚Â­ chod, DezertĂ˘â‚¬Â¦"
              value={sectionForm.nazev} onChange={e => setSectionForm(f => ({ ...f, nazev: e.target.value }))} autoFocus/>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Typ vÄ‚ËťbĂ„â€şru</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={sectionForm.typ} onChange={e => setSectionForm(f => ({ ...f, typ: e.target.value }))}>
              <option value="single">VÄ‚ËťbĂ„â€şr 1 moÄąÄľnosti</option>
              <option value="multi">VÄ‚ËťbĂ„â€şr vÄ‚Â­ce moÄąÄľnostÄ‚Â­</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Modal: PÄąâ„˘idat poloÄąÄľku */}
      <Modal open={!!itemModal} onClose={() => { setItemModal(null); setItemForm({ nazev: '', popis: '', cena_os: '' }); }} title="PÄąâ„˘idat poloÄąÄľku"
        footer={<>
          <Btn onClick={() => { setItemModal(null); setItemForm({ nazev: '', popis: '', cena_os: '' }); }}>ZruÄąË‡it</Btn>
          <Btn variant="primary"
            onClick={() => addPolozkyMut.mutate({ sekceId: itemModal?.sekceId, data: { ...itemForm, cena_os: parseFloat(itemForm.cena_os) || 0 } })}
            disabled={!itemForm.nazev || addPolozkyMut.isPending}>
            {addPolozkyMut.isPending ? 'PYidÄŹĹĽËťvÄŹĹĽËťm&' : 'PYidat'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">NÄ‚Ë‡zev poloÄąÄľky *</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="SvÄ‚Â­Ă„Ĺ¤kovÄ‚Ë‡ na smetanĂ„â€ş, LososĂ˘â‚¬Â¦"
              value={itemForm.nazev} onChange={e => setItemForm(f => ({ ...f, nazev: e.target.value }))} autoFocus/>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Popis (volitelnÄ‚Â©)</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="SloÄąÄľenÄ‚Â­, alergieĂ˘â‚¬Â¦"
              value={itemForm.popis} onChange={e => setItemForm(f => ({ ...f, popis: e.target.value }))}/>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">PÄąâ„˘Ä‚Â­platek za osobu (KĂ„Ĺ¤)</label>
            <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="0"
              value={itemForm.cena_os} onChange={e => setItemForm(f => ({ ...f, cena_os: e.target.value }))}/>
          </div>
        </div>
      </Modal>

      {/* Modal: PÄąâ„˘idat personÄ‚Ë‡l */}
      <Modal open={personalModal} onClose={() => setPersonalModal(false)} title="PÄąâ„˘idat personÄ‚Ë‡l"
        footer={<>
          <Btn onClick={() => setPersonalModal(false)}>ZruÄąË‡it</Btn>
          <Btn variant="primary"
            onClick={() => addPersonalMut.mutate(personalForm)}
            disabled={!personalForm.personal_id || addPersonalMut.isPending}>
            {addPersonalMut.isPending ? 'PYiYazuji&' : 'PYiYadit'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Hledat personÄ‚Ë‡l</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
              <input className="w-full pl-7 pr-2 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none"
                placeholder="JmÄ‚Â©noĂ˘â‚¬Â¦" value={personalSearch} onChange={e => setPersonalSearch(e.target.value)}/>
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
              placeholder="Ă„ĹšÄ‚Â­ÄąË‡nÄ‚Â­k, kuchaÄąâ„˘, koordinÄ‚Ë‡torĂ˘â‚¬Â¦"
              value={personalForm.role_na_akci} onChange={e => setPersonalForm(f => ({ ...f, role_na_akci: e.target.value }))}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">PÄąâ„˘Ä‚Â­chod</label>
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
