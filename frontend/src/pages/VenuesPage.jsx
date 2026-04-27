import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { venuesApi } from '../api';
import { Btn, EmptyState, Modal, PageHeader, Spinner, formatDatum } from '../components/ui';
import { Building2, MapPin, Plus, Search, ShieldAlert, Truck, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';

const emptyForm = {
  name: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  postal_code: '',
  country: 'CZ',
  general_notes: '',
};

function SummaryBadge({ active, label, tone = 'stone' }) {
  const styles = {
    stone: active ? 'bg-stone-100 text-stone-700' : 'bg-stone-50 text-stone-300',
    blue: active ? 'bg-blue-50 text-blue-700' : 'bg-stone-50 text-stone-300',
    amber: active ? 'bg-amber-50 text-amber-700' : 'bg-stone-50 text-stone-300',
    red: active ? 'bg-red-50 text-red-700' : 'bg-stone-50 text-stone-300',
  };
  return <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${styles[tone]}`}>{label}</span>;
}

export default function VenuesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [maxSecurityDelay, setMaxSecurityDelay] = useState('');
  const [filters, setFilters] = useState({
    has_loading_dock: false,
    security_check_required: false,
    truck_friendly: false,
    parking_available: false,
    mobile_dead_spot_present: false,
  });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['venues', q, status, maxSecurityDelay, filters],
    queryFn: () => venuesApi.list({
      q,
      status,
      max_security_delay: maxSecurityDelay || undefined,
      ...Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value || undefined])),
      limit: 100,
    }),
  });

  const createMut = useMutation({
    mutationFn: venuesApi.create,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['venues'] });
      toast.success('Prostor byl vytvořen');
      setModal(false);
      setForm(emptyForm);
      navigate(`/venues/${res.data.id}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Prostor se nepodařilo vytvořit'),
  });

  const items = data?.data?.data || [];

  const setF = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (key) => setFilters((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Prostory"
        subtitle={`${items.length} prostorů`}
        actions={(
          <Btn variant="primary" size="sm" onClick={() => setModal(true)}>
            <Plus size={12}/> Nový prostor
          </Btn>
        )}
      />

      <div className="px-8 pb-6">
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
          <div className="grid md:grid-cols-[1.6fr_0.8fr_0.8fr] gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
              <input
                className="w-full border border-stone-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none"
                placeholder="Hledat podle názvu nebo adresy"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              className="border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Aktivní</option>
              <option value="archived">Archivované</option>
              <option value="all">Vše</option>
            </select>
            <input
              className="border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              placeholder="Max. zdržení na security (min)"
              value={maxSecurityDelay}
              onChange={(e) => setMaxSecurityDelay(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => toggle('has_loading_dock')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${filters.has_loading_dock ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Vykládka</button>
            <button type="button" onClick={() => toggle('security_check_required')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${filters.security_check_required ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Kontrola security</button>
            <button type="button" onClick={() => toggle('truck_friendly')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${filters.truck_friendly ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Pro kamion / dodávku</button>
            <button type="button" onClick={() => toggle('parking_available')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${filters.parking_available ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Parkování</button>
            <button type="button" onClick={() => toggle('mobile_dead_spot_present')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${filters.mobile_dead_spot_present ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Hluché místo signálu</button>
          </div>
        </div>
      </div>

      <div className="px-8 pb-8 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner/></div>
        ) : items.length === 0 ? (
          <EmptyState icon={Building2} title="Žádné prostory" desc="Založte první prostor a začněte sbírat provozní know-how." />
        ) : (
          <div className="grid xl:grid-cols-2 gap-4">
            {items.map((venue) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => navigate(`/venues/${venue.id}`)}
                className="text-left bg-white border border-stone-200 rounded-2xl p-5 hover:border-stone-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-stone-900">{venue.name}</div>
                    <div className="text-sm text-stone-500 mt-1 flex items-center gap-1.5">
                      <MapPin size={13}/>
                      {[venue.address_line_1, venue.city, venue.postal_code].filter(Boolean).join(', ') || 'Bez adresy'}
                    </div>
                  </div>
                  <SummaryBadge active={venue.status === 'active'} label={venue.status === 'active' ? 'Aktivní' : 'Archiv'} tone={venue.status === 'active' ? 'blue' : 'stone'} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <SummaryBadge active={venue.badges?.loading_dock} label="Vykládka" />
                  <SummaryBadge active={venue.badges?.security} label="Kontrola security" tone="amber" />
                  <SummaryBadge active={Number(venue.badges?.restrictions) > 0} label={`${venue.summary?.critical_restrictions_count || 0} omezení`} tone="red" />
                  <SummaryBadge active={venue.badges?.stale_data} label="Zastaralá data" tone="red" />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <div className="text-xs text-stone-500">Rezerva na security</div>
                    <div className="text-sm font-semibold text-stone-800 mt-1">{venue.summary?.expected_security_delay_min || 0} min</div>
                  </div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <div className="text-xs text-stone-500">Vykládka do sálu</div>
                    <div className="text-sm font-semibold text-stone-800 mt-1">{venue.summary?.expected_unload_to_room_min || 0} min</div>
                  </div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <div className="text-xs text-stone-500">Opakující se problémy</div>
                    <div className="text-sm font-semibold text-stone-800 mt-1">{venue.summary?.recurring_issues_count || 0}</div>
                  </div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <div className="text-xs text-stone-500">Zastaralé sekce</div>
                    <div className="text-sm font-semibold text-stone-800 mt-1">{venue.summary?.stale_sections_count || 0}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-xs text-stone-500">
                  {venue.summary?.parking_available && <span className="inline-flex items-center gap-1"><Truck size={12}/> parkování</span>}
                  {venue.summary?.mobile_dead_spot_present && <span className="inline-flex items-center gap-1"><WifiOff size={12}/> hluché místo</span>}
                  {venue.summary?.security_check_required && <span className="inline-flex items-center gap-1"><ShieldAlert size={12}/> check-in</span>}
                </div>

                <div className="mt-4 text-xs text-stone-400">
                  Poslední aktualizace {formatDatum(venue.updated_at)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nový prostor"
        footer={(
          <>
            <Btn onClick={() => setModal(false)}>Zrušit</Btn>
            <Btn variant="primary" onClick={() => createMut.mutate(form)} disabled={!form.name || createMut.isPending}>
              {createMut.isPending ? 'Ukládám...' : 'Vytvořit'}
            </Btn>
          </>
        )}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Název prostoru *</label>
            <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none" value={form.name} onChange={(e) => setF('name', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Adresa</label>
            <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none" value={form.address_line_1} onChange={(e) => setF('address_line_1', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Město</label>
              <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none" value={form.city} onChange={(e) => setF('city', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">PSČ</label>
              <input className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none" value={form.postal_code} onChange={(e) => setF('postal_code', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Obecné poznámky</label>
            <textarea className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none" rows={4} value={form.general_notes} onChange={(e) => setF('general_notes', e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
