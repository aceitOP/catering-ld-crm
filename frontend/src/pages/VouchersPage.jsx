import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Gift, Mail, Plus, Printer } from 'lucide-react';
import { klientiApi, vouchersApi, zakazkyApi } from '../api';
import { Btn, EmptyState, Modal, PageHeader, Spinner, formatDatum } from '../components/ui';

const EMPTY_FORM = {
  title: '',
  nominal_value: '',
  fulfillment_note: '',
  recipient_name: '',
  recipient_email: '',
  buyer_name: '',
  buyer_email: '',
  klient_id: '',
  zakazka_id: '',
  expires_at: '',
  status: 'draft',
  design_style: '',
  accent_color: '',
  footer_text: '',
  image_data_url: '',
  note: '',
};

const VOUCHER_DESIGN_OPTIONS = [
  { value: '', label: 'Výchozí' },
  { value: 'classic', label: 'Klasický' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'premium', label: 'Premium' },
  { value: 'festive', label: 'Slavnostní' },
];

export default function VouchersPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ status: '', q: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [previewHtml, setPreviewHtml] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vouchers', filters],
    queryFn: () => vouchersApi.list({ status: filters.status || undefined, q: filters.q || undefined }),
  });

  const clientsQuery = useQuery({ queryKey: ['voucher-klienti'], queryFn: () => klientiApi.list({ limit: 200 }), staleTime: 60_000 });
  const zakazkyQuery = useQuery({ queryKey: ['voucher-zakazky'], queryFn: () => zakazkyApi.list({ limit: 200 }), staleTime: 60_000 });

  const createMut = useMutation({
    mutationFn: vouchersApi.create,
    onSuccess: () => {
      toast.success('Poukaz byl vytvořen.');
      qc.invalidateQueries({ queryKey: ['vouchers'] });
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Vytvoření poukazu se nepodařilo.'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data: payload }) => vouchersApi.update(id, payload),
    onSuccess: () => {
      toast.success('Poukaz byl upraven.');
      qc.invalidateQueries({ queryKey: ['vouchers'] });
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Uložení změn se nepodařilo.'),
  });

  const sendMut = useMutation({
    mutationFn: ({ id, email }) => vouchersApi.send(id, { email }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Poukaz byl odeslán.');
      qc.invalidateQueries({ queryKey: ['vouchers'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Odeslání poukazu se nepodařilo.'),
  });

  const previewMut = useMutation({
    mutationFn: vouchersApi.preview,
    onSuccess: (res) => setPreviewHtml(res.data),
    onError: () => setPreviewHtml(''),
  });

  const vouchers = data?.data?.data || [];
  const klienti = clientsQuery.data?.data?.data || [];
  const zakazky = zakazkyQuery.data?.data?.data || [];

  const statusOptions = useMemo(() => [
    { value: '', label: 'Vše' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Aktivní' },
    { value: 'redeemed', label: 'Čerpaný' },
    { value: 'expired', label: 'Expirovaný' },
    { value: 'cancelled', label: 'Zrušený' },
  ], []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (voucher) => {
    setEditing(voucher);
    setForm({
      title: voucher.title || '',
      nominal_value: voucher.nominal_value || '',
      fulfillment_note: voucher.fulfillment_note || '',
      recipient_name: voucher.recipient_name || '',
      recipient_email: voucher.recipient_email || '',
      buyer_name: voucher.buyer_name || '',
      buyer_email: voucher.buyer_email || '',
      klient_id: voucher.klient_id || '',
      zakazka_id: voucher.zakazka_id || '',
      expires_at: voucher.expires_at ? String(voucher.expires_at).slice(0, 10) : '',
      status: voucher.status || 'draft',
      design_style: voucher.design_style || '',
      accent_color: voucher.accent_color || '',
      footer_text: voucher.footer_text || '',
      image_data_url: voucher.image_data_url || '',
      note: voucher.note || '',
    });
    setModalOpen(true);
  };

  const submit = () => {
    const payload = {
      ...form,
      nominal_value: form.nominal_value || null,
      klient_id: form.klient_id || null,
      zakazka_id: form.zakazka_id || null,
      expires_at: form.expires_at || null,
    };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  };

  const printVoucher = async (voucher) => {
    try {
      const res = await vouchersApi.print(voucher.id);
      const win = window.open('', '_blank', 'width=960,height=800');
      if (!win) {
        toast.error('Povolte vyskakovací okna pro tisk poukazu.');
        return;
      }
      win.document.write(res.data);
      win.document.close();
      win.onload = () => win.print();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Tisk poukazu se nepodařil.');
    }
  };

  const handleVoucherImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      toast.error('Obrázek musí být PNG, JPG, WebP nebo SVG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Obrázek poukazu může mít maximálně 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image_data_url: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!modalOpen) {
      setPreviewHtml('');
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      previewMut.mutate(form);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [modalOpen, form]);

  const sendVoucher = (voucher) => {
    const defaultEmail = voucher.recipient_email || voucher.buyer_email || '';
    const email = window.prompt('E-mail pro odeslání poukazu:', defaultEmail);
    if (email === null) return;
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Zadejte e-mail příjemce.');
      return;
    }
    sendMut.mutate({ id: voucher.id, email: trimmed });
  };

  return (
    <div>
      <PageHeader
        title="Poukazy"
        subtitle={`${vouchers.length} evidovaných dárkových certifikátů`}
        actions={<Btn variant="primary" size="sm" onClick={openCreate}><Plus size={14} /> Nový poukaz</Btn>}
      />

      <div className="px-8 pb-4 flex flex-wrap gap-3">
        <input className="w-72 rounded-xl border border-stone-200 px-4 py-2 text-sm focus:outline-none" placeholder="Hledat podle kódu, názvu nebo příjemce…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <select className="rounded-xl border border-stone-200 px-4 py-2 text-sm focus:outline-none" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      <div className="px-8 pb-8">
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !vouchers.length ? (
            <EmptyState icon={Gift} title="Zatím nemáte žádné poukazy" desc="Začněte vytvořením prvního interně evidovaného dárkového certifikátu." />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-400">
                  <th className="px-4 py-3">Kód</th>
                  <th className="px-4 py-3">Název</th>
                  <th className="px-4 py-3">Příjemce</th>
                  <th className="px-4 py-3">Stav</th>
                  <th className="px-4 py-3">Expirace</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {vouchers.map((voucher) => (
                  <tr key={voucher.id}>
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-stone-800">{voucher.kod}</td>
                    <td className="px-4 py-3 text-sm text-stone-700">
                      <Link to={`/poukazy/${voucher.id}`} className="font-medium text-brand-600 hover:underline">{voucher.title}</Link>
                      <div className="text-xs text-stone-400">{voucher.nominal_value ? `${Number(voucher.nominal_value).toLocaleString('cs-CZ')} Kč` : 'Plnění dle popisu'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600">{voucher.recipient_name || voucher.klient_firma || '—'}</td>
                    <td className="px-4 py-3 text-sm text-stone-600">{voucher.status}</td>
                    <td className="px-4 py-3 text-sm text-stone-600">{voucher.expires_at ? formatDatum(voucher.expires_at) : 'Bez expirace'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Btn size="sm" onClick={() => printVoucher(voucher)}>
                          <Printer size={12} />
                          PDF
                        </Btn>
                        <Btn size="sm" onClick={() => sendVoucher(voucher)} disabled={sendMut.isPending}>
                          <Mail size={12} />
                          Poslat
                        </Btn>
                        <Btn size="sm" onClick={() => openEdit(voucher)}>Upravit</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }}
        title={editing ? 'Upravit poukaz' : 'Nový poukaz'}
        width="max-w-6xl"
        footer={<><Btn onClick={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }}>Zrušit</Btn><Btn variant="primary" onClick={submit} disabled={!form.title || createMut.isPending || updateMut.isPending}>{editing ? 'Uložit změny' : 'Vytvořit'}</Btn></>}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,.9fr)]">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-stone-500">Název *</label><input className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">Hodnota</label><input type="number" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.nominal_value} onChange={(e) => setForm((f) => ({ ...f, nominal_value: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">Expirace</label><input type="date" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">Příjemce</label><input className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.recipient_name} onChange={(e) => setForm((f) => ({ ...f, recipient_name: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">E-mail příjemce</label><input type="email" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.recipient_email} onChange={(e) => setForm((f) => ({ ...f, recipient_email: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">Kupující</label><input className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.buyer_name} onChange={(e) => setForm((f) => ({ ...f, buyer_name: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">E-mail kupujícího</label><input type="email" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.buyer_email} onChange={(e) => setForm((f) => ({ ...f, buyer_email: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">Klient</label><select className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.klient_id} onChange={(e) => setForm((f) => ({ ...f, klient_id: e.target.value }))}><option value="">Bez vazby</option>{klienti.map((klient) => <option key={klient.id} value={klient.id}>{klient.firma || [klient.jmeno, klient.prijmeni].filter(Boolean).join(' ')}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-stone-500">Zakázka</label><select className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.zakazka_id} onChange={(e) => setForm((f) => ({ ...f, zakazka_id: e.target.value }))}><option value="">Bez vazby</option>{zakazky.map((zakazka) => <option key={zakazka.id} value={zakazka.id}>{zakazka.cislo} • {zakazka.nazev}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-stone-500">Stav</label><select className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>{statusOptions.filter((item) => item.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-stone-500">Šablona vzhledu</label><select className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.design_style} onChange={(e) => setForm((f) => ({ ...f, design_style: e.target.value }))}>{VOUCHER_DESIGN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-stone-500">Akcentní barva</label><input type="color" className="h-[38px] w-full rounded-xl border border-stone-200 px-2 py-1" value={form.accent_color || '#0f766e'} onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-stone-500">Vlastní obrázek</label><div className="flex flex-wrap items-center gap-2"><label className="inline-flex cursor-pointer items-center rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium hover:bg-stone-50">Nahrát obrázek<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleVoucherImage} /></label>{form.image_data_url && <button type="button" className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium hover:bg-stone-50" onClick={() => setForm((f) => ({ ...f, image_data_url: '' }))}>Odebrat obrázek</button>}</div></div>
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-stone-500">Text v patičce</label><input className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.footer_text} onChange={(e) => setForm((f) => ({ ...f, footer_text: e.target.value }))} placeholder="Např. Platí po předchozí rezervaci termínu." /></div>
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-stone-500">Rozsah plnění</label><textarea rows={3} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.fulfillment_note} onChange={(e) => setForm((f) => ({ ...f, fulfillment_note: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-stone-500">Interní poznámka</label><textarea rows={3} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
          </div>
          <div className="min-h-[520px] rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Náhled poukazu</div>
              {previewMut.isPending && <div className="text-xs text-stone-400">Obnovuji...</div>}
            </div>
            {previewHtml ? (
              <iframe title="Náhled poukazu" srcDoc={previewHtml} className="h-[520px] w-full rounded-xl border border-stone-200 bg-white" />
            ) : (
              <div className="flex h-[520px] items-center justify-center text-sm text-stone-400">Náhled se připravuje...</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
