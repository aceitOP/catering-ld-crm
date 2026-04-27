import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dokumentyApi, venuesApi } from '../api';
import { Btn, EmptyState, Modal, PageHeader, Spinner, formatDatum } from '../components/ui';
import toast from 'react-hot-toast';
import { ArrowLeft, Building2, Plus, Trash2, Upload } from 'lucide-react';

const TABS = [
  ['overview', 'Přehled'],
  ['access', 'Přístup a security'],
  ['loading', 'Vykládka'],
  ['routes', 'Trasy'],
  ['service_areas', 'Servisní zóny'],
  ['restrictions', 'Omezení'],
  ['parking', 'Parkování'],
  ['connectivity', 'Konektivita'],
  ['contacts', 'Kontakty'],
  ['history', 'Historie akcí'],
  ['attachments', 'Přílohy'],
];

const SECTION_LABELS = Object.fromEntries(TABS);

const FRESHNESS_LABELS = {
  fresh: 'čerstvé',
  aging: 'stárne',
  stale: 'zastaralé',
};

const CONFIDENCE_LABELS = {
  high: 'vysoká důvěra',
  medium: 'střední důvěra',
  low: 'nízká důvěra',
};

const ROUTE_DIFFICULTY_LABELS = {
  low: 'nízká',
  medium: 'střední',
  high: 'vysoká',
};

const SIGNAL_QUALITY_LABELS = {
  none: 'žádný',
  weak: 'slabý',
  usable: 'použitelný',
  good: 'dobrý',
};

const CONTACT_ROLE_LABELS = {
  venue_manager: 'správce prostoru',
  security: 'bezpečnost',
  loading_dock: 'vykládka',
  reception: 'recepce',
  facilities: 'správa budovy',
  av_support: 'AV podpora',
  parking: 'parkování',
  other: 'jiné',
};

const RESTRICTION_CATEGORY_LABELS = {
  noise: 'hluk',
  open_fire: 'otevřený oheň',
  alcohol: 'alkohol',
  glass: 'sklo',
  decorations: 'dekorace',
  waste_disposal: 'odpad',
  power_usage: 'elektřina',
  vendor_access: 'přístup dodavatelů',
  timing: 'časování',
  security: 'bezpečnost',
  photography: 'fotografie',
  parking: 'parkování',
  other: 'ostatní',
};

const SEVERITY_LABELS = {
  info: 'info',
  warning: 'varování',
  critical: 'kritické',
};

function Meta({ meta }) {
  if (!meta) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${meta.freshness_status === 'fresh' ? 'bg-emerald-50 text-emerald-700' : meta.freshness_status === 'aging' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{FRESHNESS_LABELS[meta.freshness_status] || meta.freshness_status}</span>
      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700">{CONFIDENCE_LABELS[meta.confidence_level] || meta.confidence_level}</span>
      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700">{formatDatum(meta.last_verified_at)}</span>
    </div>
  );
}

function Card({ title, subtitle, right, children }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-800">{title}</div>
          {subtitle && <div className="text-xs text-stone-500 mt-1">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children && <div className="mt-3 space-y-2 text-sm text-stone-700">{children}</div>}
    </div>
  );
}

export default function VenueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState('overview');
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({});

  const { data, isLoading } = useQuery({ queryKey: ['venue', id], queryFn: () => venuesApi.get(id) });
  const venue = data?.data;
  const meta = venue?.summary?.section_meta || {};

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['venue', id] });
    qc.invalidateQueries({ queryKey: ['venues'] });
  };

  const updateMut = useMutation({
    mutationFn: (payload) => venuesApi.update(id, payload),
    onSuccess: () => { invalidate(); toast.success('Prostor byl uložen'); setEditModal(false); },
    onError: (err) => toast.error(err.response?.data?.error || 'Prostor se nepodařilo uložit'),
  });
  const deleteMut = useMutation({
    mutationFn: ({ section, rowId }) => venuesApi.deleteSection(id, section, rowId),
    onSuccess: () => { invalidate(); toast.success('Položka byla smazána'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Smazání se nepovedlo'),
  });
  const promoteMut = useMutation({
    mutationFn: (observationId) => venuesApi.promoteObservation(id, observationId),
    onSuccess: () => { invalidate(); toast.success('Pozorování bylo potvrzeno'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Potvrzení se nepovedlo'),
  });
  const uploadMut = useMutation({
    mutationFn: (formData) => dokumentyApi.upload(formData),
    onSuccess: () => { invalidate(); toast.success('Příloha byla nahrána'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Upload selhal'),
  });
  const createMut = useMutation({
    mutationFn: ({ section, payload }) => ({
      contacts: venuesApi.addContact,
      access: venuesApi.addAccessRule,
      loading: venuesApi.addLoadingZone,
      routes: venuesApi.addRoute,
      service_areas: venuesApi.addServiceArea,
      restrictions: venuesApi.addRestriction,
      parking: venuesApi.addParkingOption,
      connectivity: venuesApi.addConnectivityZone,
    }[section](id, payload)),
    onSuccess: () => { invalidate(); toast.success('Položka byla přidána'); setAddModal(false); setAddForm({}); },
    onError: (err) => toast.error(err.response?.data?.error || 'Položku se nepodařilo vytvořit'),
  });

  const openEdit = () => {
    setEditForm({
      name: venue.name || '',
      address_line_1: venue.address_line_1 || '',
      city: venue.city || '',
      postal_code: venue.postal_code || '',
      status: venue.status || 'active',
      general_notes: venue.general_notes || '',
    });
    setEditModal(true);
  };
  const openAdd = () => { setAddForm({}); setAddModal(true); };
  const setAF = (key, value) => setAddForm((current) => ({ ...current, [key]: value }));

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('soubor', file);
    formData.append('venue_id', id);
    formData.append('kategorie', file.type.startsWith('image/') ? 'foto' : 'interni');
    uploadMut.mutate(formData);
    event.target.value = '';
  };
  const submitAdd = () => {
    const payloadMap = {
      contacts: { name: addForm.name, role: addForm.role || 'other', phone: addForm.phone, email: addForm.email, notes: addForm.notes, is_primary: !!addForm.is_primary },
      access: { title: addForm.title, check_in_point: addForm.check_in_point, security_check_required: !!addForm.security_check_required, avg_security_minutes: addForm.avg_security_minutes, notes: addForm.notes, is_default: true },
      loading: { name: addForm.name, arrival_instructions: addForm.arrival_instructions, distance_to_service_area_min: addForm.distance_to_service_area_min, is_default: true },
      service_areas: { name: addForm.name, floor: addForm.floor, capacity: addForm.capacity, has_power_access: !!addForm.has_power_access, has_water_access: !!addForm.has_water_access, has_cold_storage_access: !!addForm.has_cold_storage_access, notes: addForm.notes },
      routes: {
        name: addForm.name,
        estimated_walk_minutes: addForm.estimated_walk_minutes,
        route_difficulty: addForm.route_difficulty || 'low',
        from_loading_zone_id: addForm.from_loading_zone_id || null,
        to_service_area_id: addForm.to_service_area_id || null,
        is_default: true,
        steps: String(addForm.steps || '').split('\n').map((line) => line.trim()).filter(Boolean).map((instruction, index) => ({ step_index: index + 1, instruction })),
      },
      restrictions: { title: addForm.title, category: addForm.category || 'other', severity: addForm.severity || 'warning', description: addForm.description, notes: addForm.notes },
      parking: { location_description: addForm.location_description, vehicle_type: addForm.vehicle_type || 'mixed', walking_minutes_to_venue: addForm.walking_minutes_to_venue, notes: addForm.notes },
      connectivity: { zone_name: addForm.zone_name, signal_quality: addForm.signal_quality || 'usable', dead_spot: !!addForm.dead_spot, wifi_available: !!addForm.wifi_available, notes: addForm.notes },
    };
    createMut.mutate({ section: tab, payload: payloadMap[tab] || {} });
  };

  if (isLoading) return <div className="py-20 flex justify-center"><Spinner/></div>;
  if (!venue) return <EmptyState icon={Building2} title="Prostor nenalezen" />;

  const renderList = (items, sectionKey, titleFn, subtitleFn, extraFn) => {
    if (!items?.length) return <EmptyState icon={Building2} title="Zatím prázdné" />;
    return items.map((item) => (
      <Card
        key={item.id}
        title={titleFn(item)}
        subtitle={subtitleFn?.(item)}
        right={sectionKey === 'history' || sectionKey === 'attachments' ? null : <button onClick={() => window.confirm('Smazat položku?') && deleteMut.mutate({ section: sectionKey, rowId: item.id })} className="text-stone-300 hover:text-red-500"><Trash2 size={14}/></button>}
      >
        {extraFn?.(item)}
      </Card>
    ));
  };

  const content = {
    overview: (
      <div className="space-y-5">
        <div className="grid lg:grid-cols-4 gap-4">
          <Card title="Rezerva na security" subtitle="Očekávané zdržení">{venue.summary?.expected_security_delay_min || 0} min</Card>
          <Card title="Vykládka do sálu" subtitle="Výchozí trasa">{venue.summary?.expected_unload_to_room_min || 0} min</Card>
          <Card title="Kritická omezení">{venue.summary?.critical_restrictions_count || 0}</Card>
          <Card title="Opakující se problémy">{venue.summary?.recurring_issues_count || 0}</Card>
        </div>
        <Card title="Provozní souhrn" subtitle={[venue.address_line_1, venue.city, venue.postal_code].filter(Boolean).join(', ')} right={<Btn size="sm" onClick={openEdit}>Upravit</Btn>}>
          <Meta meta={meta.overview} />
          {venue.general_notes && <div>{venue.general_notes}</div>}
          {venue.summary?.stale_sections_count > 0 && <div className="text-sm text-red-700">Zastaralé sekce: {venue.summary.stale_sections.map((section) => SECTION_LABELS[section] || section).join(', ')}</div>}
        </Card>
        <Card title="Opakující se problémy">
          {(venue.summary?.top_recurring_issues || []).map((item) => <div key={item.key}>{item.title} · {item.count}x</div>)}
          {!venue.summary?.top_recurring_issues?.length && <div className="text-sm text-stone-400">Bez opakovaných problémů.</div>}
        </Card>
        <Card title="Poslední pozorování">
          {(venue.summary?.recent_observations || []).map((item) => (
            <div key={item.id} className="rounded-xl bg-stone-50 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-stone-500 mt-1">{item.description || 'Bez detailu'} · {formatDatum(item.happened_at)}</div>
                </div>
                {item.propose_master_update && !item.is_verified && <Btn size="sm" onClick={() => promoteMut.mutate(item.id)}>Potvrdit</Btn>}
              </div>
            </div>
          ))}
          {!venue.summary?.recent_observations?.length && <div className="text-sm text-stone-400">Bez pozorování.</div>}
        </Card>
      </div>
    ),
    access: <div className="space-y-4"><Meta meta={meta.access} />{renderList(venue.access_rules, 'access-rules', (i) => i.title, (i) => `${i.check_in_point || 'bez check-in pointu'} · ${i.avg_security_minutes || 0} min`, (i) => <div>{i.notes}</div>)}</div>,
    loading: <div className="space-y-4"><Meta meta={meta.loading} />{renderList(venue.loading_zones, 'loading-zones', (i) => i.name, (i) => `${i.distance_to_service_area_min || 0} min do servisní zóny`, (i) => <div>{i.arrival_instructions}</div>)}</div>,
    routes: <div className="space-y-4"><Meta meta={meta.routes} />{renderList(venue.routes, 'routes', (i) => i.name, (i) => `${i.estimated_walk_minutes || 0} min · ${ROUTE_DIFFICULTY_LABELS[i.route_difficulty] || i.route_difficulty}`, (i) => (i.steps || []).map((s) => <div key={s.id} className="rounded-xl bg-stone-50 px-3 py-2 text-sm">#{s.step_index} {s.instruction}</div>))}</div>,
    service_areas: <div className="space-y-4"><Meta meta={meta.service_areas} />{renderList(venue.service_areas, 'service-areas', (i) => i.name, (i) => [i.floor && `patro ${i.floor}`, i.capacity && `${i.capacity} osob`].filter(Boolean).join(' · '), (i) => <div>Elektřina: {i.has_power_access ? 'ano' : 'ne'} · Voda: {i.has_water_access ? 'ano' : 'ne'}</div>)}</div>,
    restrictions: <div className="space-y-4"><Meta meta={meta.restrictions} />{renderList(venue.restrictions, 'restrictions', (i) => i.title, (i) => `${RESTRICTION_CATEGORY_LABELS[i.category] || i.category} · ${SEVERITY_LABELS[i.severity] || i.severity}`, (i) => <div>{i.description}</div>)}</div>,
    parking: <div className="space-y-4"><Meta meta={meta.parking} />{renderList(venue.parking_options, 'parking-options', (i) => i.location_description, (i) => `${i.vehicle_type} · ${i.walking_minutes_to_venue || 0} min`, (i) => <div>{i.notes}</div>)}</div>,
    connectivity: <div className="space-y-4"><Meta meta={meta.connectivity} />{renderList(venue.connectivity_zones, 'connectivity-zones', (i) => i.zone_name, (i) => `${SIGNAL_QUALITY_LABELS[i.signal_quality] || i.signal_quality} · hluché místo: ${i.dead_spot ? 'ano' : 'ne'}`, (i) => <div>{i.notes}</div>)}</div>,
    contacts: <div className="space-y-4"><Meta meta={meta.contacts} />{renderList(venue.contacts, 'contacts', (i) => i.name, (i) => [CONTACT_ROLE_LABELS[i.role] || i.role, i.phone, i.email].filter(Boolean).join(' · '), (i) => <div>{i.notes}</div>)}</div>,
    history: <div className="space-y-4">{renderList(venue.event_history, 'history', (i) => i.nazev, (i) => `${i.cislo} · ${formatDatum(i.datum_akce)}`, () => null)}</div>,
    attachments: (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Btn size="sm" onClick={() => fileInputRef.current?.click()}><Upload size={12}/> Nahrát</Btn>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        </div>
        {renderList(venue.attachments, 'attachments', (i) => i.nazev, (i) => `${i.kategorie} · ${formatDatum(i.created_at)}`, (i) => <Btn size="sm" onClick={() => dokumentyApi.download(i.id, i.nazev || i.filename)}>Stáhnout</Btn>)}
      </div>
    ),
  }[tab];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={venue.name}
        subtitle={[venue.address_line_1, venue.city, venue.postal_code].filter(Boolean).join(', ')}
        actions={<>
          <Btn size="sm" onClick={() => navigate('/venues')}><ArrowLeft size={12}/> Zpět</Btn>
          {['contacts','access','loading','routes','service_areas','restrictions','parking','connectivity'].includes(tab) && <Btn size="sm" onClick={openAdd}><Plus size={12}/> Přidat</Btn>}
          <Btn variant="primary" size="sm" onClick={openEdit}>Upravit</Btn>
        </>}
      />
      <div className="px-8 pb-5 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`px-3 py-1.5 rounded-xl text-sm border ${tab === key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>{label}</button>)}
      </div>
      <div className="px-8 pb-8 flex-1 overflow-y-auto space-y-4">{content}</div>

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Přidat položku" footer={<><Btn onClick={() => setAddModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={submitAdd} disabled={createMut.isPending}>{createMut.isPending ? 'Ukládám...' : 'Uložit'}</Btn></>}>
        <div className="space-y-3">
          {tab === 'contacts' && <><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Jméno" value={addForm.name || ''} onChange={(e) => setAF('name', e.target.value)} /><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Telefon" value={addForm.phone || ''} onChange={(e) => setAF('phone', e.target.value)} /><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="E-mail" value={addForm.email || ''} onChange={(e) => setAF('email', e.target.value)} /></>}
          {tab === 'access' && <><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Název pravidla" value={addForm.title || ''} onChange={(e) => setAF('title', e.target.value)} /><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Místo check-inu" value={addForm.check_in_point || ''} onChange={(e) => setAF('check_in_point', e.target.value)} /><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Zdržení na security (min)" value={addForm.avg_security_minutes || ''} onChange={(e) => setAF('avg_security_minutes', e.target.value)} /></>}
          {tab === 'loading' && <><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Název vykládky" value={addForm.name || ''} onChange={(e) => setAF('name', e.target.value)} /><textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" rows={3} placeholder="Instrukce k příjezdu" value={addForm.arrival_instructions || ''} onChange={(e) => setAF('arrival_instructions', e.target.value)} /><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Vzdálenost do servisní zóny (min)" value={addForm.distance_to_service_area_min || ''} onChange={(e) => setAF('distance_to_service_area_min', e.target.value)} /></>}
          {tab === 'service_areas' && <><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Název servisní zóny" value={addForm.name || ''} onChange={(e) => setAF('name', e.target.value)} /><div className="grid grid-cols-2 gap-3"><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Patro" value={addForm.floor || ''} onChange={(e) => setAF('floor', e.target.value)} /><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Kapacita" value={addForm.capacity || ''} onChange={(e) => setAF('capacity', e.target.value)} /></div></>}
          {tab === 'routes' && <><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Název trasy" value={addForm.name || ''} onChange={(e) => setAF('name', e.target.value)} /><div className="grid grid-cols-2 gap-3"><select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={addForm.from_loading_zone_id || ''} onChange={(e) => setAF('from_loading_zone_id', e.target.value)}><option value="">Vykládka</option>{(venue.loading_zones || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select><select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={addForm.to_service_area_id || ''} onChange={(e) => setAF('to_service_area_id', e.target.value)}><option value="">Servisní zóna</option>{(venue.service_areas || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Odhad času chůze (min)" value={addForm.estimated_walk_minutes || ''} onChange={(e) => setAF('estimated_walk_minutes', e.target.value)} /><textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" rows={4} placeholder="Každý krok na nový řádek" value={addForm.steps || ''} onChange={(e) => setAF('steps', e.target.value)} /></>}
          {tab === 'restrictions' && <><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Název omezení" value={addForm.title || ''} onChange={(e) => setAF('title', e.target.value)} /><div className="grid grid-cols-2 gap-3"><select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={addForm.category || 'other'} onChange={(e) => setAF('category', e.target.value)}>{['noise','open_fire','alcohol','glass','decorations','waste_disposal','power_usage','vendor_access','timing','security','photography','parking','other'].map((option) => <option key={option} value={option}>{RESTRICTION_CATEGORY_LABELS[option] || option}</option>)}</select><select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={addForm.severity || 'warning'} onChange={(e) => setAF('severity', e.target.value)}>{['info','warning','critical'].map((option) => <option key={option} value={option}>{SEVERITY_LABELS[option] || option}</option>)}</select></div><textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" rows={3} placeholder="Popis omezení" value={addForm.description || ''} onChange={(e) => setAF('description', e.target.value)} /></>}
          {tab === 'parking' && <><textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" rows={3} placeholder="Popis parkování" value={addForm.location_description || ''} onChange={(e) => setAF('location_description', e.target.value)} /><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Pěšky k prostoru (min)" value={addForm.walking_minutes_to_venue || ''} onChange={(e) => setAF('walking_minutes_to_venue', e.target.value)} /></>}
          {tab === 'connectivity' && <><input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Název zóny" value={addForm.zone_name || ''} onChange={(e) => setAF('zone_name', e.target.value)} /><select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={addForm.signal_quality || 'usable'} onChange={(e) => setAF('signal_quality', e.target.value)}>{['none','weak','usable','good'].map((option) => <option key={option} value={option}>{SIGNAL_QUALITY_LABELS[option] || option}</option>)}</select><textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" rows={3} placeholder="Poznámky" value={addForm.notes || ''} onChange={(e) => setAF('notes', e.target.value)} /></>}
        </div>
      </Modal>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Upravit prostor" footer={<><Btn onClick={() => setEditModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={() => updateMut.mutate(editForm)} disabled={!editForm.name || updateMut.isPending}>{updateMut.isPending ? 'Ukládám...' : 'Uložit'}</Btn></>}>
        <div className="space-y-3">
          <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Název" value={editForm.name || ''} onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))} />
          <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Adresa" value={editForm.address_line_1 || ''} onChange={(e) => setEditForm((c) => ({ ...c, address_line_1: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="Město" value={editForm.city || ''} onChange={(e) => setEditForm((c) => ({ ...c, city: e.target.value }))} />
            <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" placeholder="PSČ" value={editForm.postal_code || ''} onChange={(e) => setEditForm((c) => ({ ...c, postal_code: e.target.value }))} />
          </div>
          <select className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm" value={editForm.status || 'active'} onChange={(e) => setEditForm((c) => ({ ...c, status: e.target.value }))}>
            <option value="active">aktivní</option>
            <option value="archived">archivovaný</option>
          </select>
          <textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm resize-none" rows={4} placeholder="Obecné poznámky" value={editForm.general_notes || ''} onChange={(e) => setEditForm((c) => ({ ...c, general_notes: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
