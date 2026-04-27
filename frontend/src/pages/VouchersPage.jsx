import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, ExternalLink, Gift, Mail, Plus, Printer, RefreshCw, XCircle } from 'lucide-react';
import { klientiApi, voucherOrdersApi, vouchersApi } from '../api';
import { Btn, EmptyState, Modal, PageHeader, Spinner, formatDatum } from '../components/ui';

const EMPTY_FORM = {
  kod: '',
  title: '',
  nominal_value: '',
  fulfillment_note: '',
  recipient_name: '',
  recipient_email: '',
  buyer_name: '',
  buyer_email: '',
  klient_id: '',
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

const ORDER_STATUS_LABELS = {
  pending_payment: 'Čeká na platbu',
  paid: 'Zaplaceno',
  voucher_created: 'Poukaz připraven',
  sent: 'Odesláno',
  cancelled: 'Zrušeno',
};

const QUICK_VOUCHER_VALUES = [1000, 2000, 3000, 5000, 10000];

function formatVoucherValue(value) {
  return `${Number(value).toLocaleString('cs-CZ')} Kč`;
}

export default function VouchersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('vouchers');
  const [filters, setFilters] = useState({ status: '', q: '' });
  const [orderFilters, setOrderFilters] = useState({ status: '', q: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [previewHtml, setPreviewHtml] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vouchers', filters],
    queryFn: () => vouchersApi.list({ status: filters.status || undefined, q: filters.q || undefined }),
  });

  const clientsQuery = useQuery({ queryKey: ['voucher-klienti'], queryFn: () => klientiApi.list({ limit: 200 }), staleTime: 60_000 });
  const ordersQuery = useQuery({
    queryKey: ['voucher-orders', orderFilters],
    queryFn: () => voucherOrdersApi.list({ status: orderFilters.status || undefined, q: orderFilters.q || undefined }),
  });

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
  const markPaidMut = useMutation({
    mutationFn: voucherOrdersApi.markPaid,
    onSuccess: () => {
      toast.success('Objednávka byla označena jako zaplacená.');
      qc.invalidateQueries({ queryKey: ['voucher-orders'] });
      qc.invalidateQueries({ queryKey: ['vouchers'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Potvrzení platby se nepodařilo.'),
  });
  const cancelOrderMut = useMutation({
    mutationFn: voucherOrdersApi.cancel,
    onSuccess: () => {
      toast.success('Objednávka byla zrušena.');
      qc.invalidateQueries({ queryKey: ['voucher-orders'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Zrušení objednávky se nepodařilo.'),
  });
  const resendOrderMut = useMutation({
    mutationFn: voucherOrdersApi.resend,
    onSuccess: () => {
      toast.success('Poukaz byl znovu odeslán.');
      qc.invalidateQueries({ queryKey: ['voucher-orders'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Odeslání se nepodařilo.'),
  });

  const previewMut = useMutation({
    mutationFn: vouchersApi.preview,
    onSuccess: (res) => setPreviewHtml(res.data),
    onError: () => setPreviewHtml(''),
  });

  const vouchers = data?.data?.data || [];
  const orders = ordersQuery.data?.data?.data || [];
  const klienti = clientsQuery.data?.data?.data || [];
  const selectedQuickValue = QUICK_VOUCHER_VALUES.includes(Number(form.nominal_value))
    ? Number(form.nominal_value)
    : null;

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
      kod: voucher.kod || '',
      nominal_value: voucher.nominal_value || '',
      fulfillment_note: voucher.fulfillment_note || '',
      recipient_name: voucher.recipient_name || '',
      recipient_email: voucher.recipient_email || '',
      buyer_name: voucher.buyer_name || '',
      buyer_email: voucher.buyer_email || '',
      klient_id: voucher.klient_id || '',
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
        subtitle={`${vouchers.length} poukazů · ${orders.length} objednávek`}
        actions={<Btn variant="primary" size="sm" onClick={openCreate}><Plus size={14} /> Nový poukaz</Btn>}
      />

      <div className="px-8 pb-4 flex gap-2">
        {[['vouchers', 'Poukazy'], ['orders', 'Objednávky ze shopu']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-xl border px-4 py-2 text-sm font-medium ${tab === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'vouchers' ? (
        <div className="px-8 pb-4 flex flex-wrap gap-3">
          <input className="w-72 rounded-xl border border-stone-200 px-4 py-2 text-sm focus:outline-none" placeholder="Hledat podle kódu, názvu nebo příjemce…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
          <select className="rounded-xl border border-stone-200 px-4 py-2 text-sm focus:outline-none" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      ) : (
        <div className="px-8 pb-4 flex flex-wrap gap-3">
          <input className="w-72 rounded-xl border border-stone-200 px-4 py-2 text-sm focus:outline-none" placeholder="Hledat objednávku, e-mail nebo VS…" value={orderFilters.q} onChange={(e) => setOrderFilters((f) => ({ ...f, q: e.target.value }))} />
          <select className="rounded-xl border border-stone-200 px-4 py-2 text-sm focus:outline-none" value={orderFilters.status} onChange={(e) => setOrderFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Vše</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      )}

      <div className="px-8 pb-8">
        {tab === 'orders' ? (
          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            {ordersQuery.isLoading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : !orders.length ? (
              <EmptyState icon={Gift} title="Zatím žádné objednávky" desc="Veřejné objednávky poukazů se zobrazí tady." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-400">
                    <th className="px-4 py-3">Objednávka</th>
                    <th className="px-4 py-3">Kupující</th>
                    <th className="px-4 py-3">Platba</th>
                    <th className="px-4 py-3">Doručení</th>
                    <th className="px-4 py-3">Stav</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-semibold text-stone-800">{order.order_number}</div>
                        <div className="text-xs text-stone-400">VS {order.payment_variable_symbol}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-600">
                        <div>{order.buyer_name}</div>
                        <div className="text-xs text-stone-400">{order.buyer_email}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-700">
                        <div className="font-semibold">{Number(order.amount).toLocaleString('cs-CZ')} Kč</div>
                        <div className="text-xs text-stone-400">{order.payment_iban}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-600">{order.delivery_mode === 'scheduled' ? formatDatum(order.delivery_scheduled_at) : 'Ihned po platbě'}</td>
                      <td className="px-4 py-3 text-sm text-stone-600">{ORDER_STATUS_LABELS[order.status] || order.status}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {order.status === 'pending_payment' && <Btn size="sm" onClick={() => markPaidMut.mutate(order.id)} disabled={markPaidMut.isPending}><CheckCircle2 size={12} /> Zaplaceno</Btn>}
                          {order.status !== 'sent' && order.status !== 'cancelled' && <Btn size="sm" onClick={() => cancelOrderMut.mutate(order.id)} disabled={cancelOrderMut.isPending}><XCircle size={12} /> Zrušit</Btn>}
                          {order.voucher_id && <Btn size="sm" onClick={() => resendOrderMut.mutate(order.id)} disabled={resendOrderMut.isPending}><RefreshCw size={12} /> Odeslat</Btn>}
                          {order.voucher_id && <Link to={`/poukazy/${order.voucher_id}`} className="inline-flex items-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"><ExternalLink size={12} /> Poukaz</Link>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
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
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }}
        title={editing ? 'Upravit poukaz' : 'Nový poukaz'}
        width="max-w-6xl"
        footer={<><Btn onClick={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }}>Zrušit</Btn><Btn variant="primary" onClick={submit} disabled={createMut.isPending || updateMut.isPending}>{editing ? 'Uložit změny' : 'Vytvořit'}</Btn></>}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,.9fr)]">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <div className="text-xs text-stone-500">Název poukazu</div>
              <div className="mt-0.5 text-sm font-semibold text-stone-800">{editing?.kod || 'Doplní se automaticky podle přiděleného kódu'}</div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-stone-500">Hodnota</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {QUICK_VOUCHER_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, nominal_value: String(value) }))}
                    className={`h-10 rounded-xl border px-2 text-sm font-semibold transition-colors ${
                      selectedQuickValue === value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {formatVoucherValue(value)}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="0"
                step="1"
                className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                placeholder="Vlastní hodnota"
                value={form.nominal_value}
                onChange={(e) => setForm((f) => ({ ...f, nominal_value: e.target.value }))}
              />
            </div>
            <div><label className="mb-1 block text-xs text-stone-500">Expirace</label><input type="date" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">Příjemce</label><input className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.recipient_name} onChange={(e) => setForm((f) => ({ ...f, recipient_name: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">E-mail příjemce</label><input type="email" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.recipient_email} onChange={(e) => setForm((f) => ({ ...f, recipient_email: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">Kupující</label><input className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.buyer_name} onChange={(e) => setForm((f) => ({ ...f, buyer_name: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">E-mail kupujícího</label><input type="email" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.buyer_email} onChange={(e) => setForm((f) => ({ ...f, buyer_email: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">Klient</label><select className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.klient_id} onChange={(e) => setForm((f) => ({ ...f, klient_id: e.target.value }))}><option value="">Bez vazby</option>{klienti.map((klient) => <option key={klient.id} value={klient.id}>{klient.firma || [klient.jmeno, klient.prijmeni].filter(Boolean).join(' ')}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-stone-500">Stav</label><select className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>{statusOptions.filter((item) => item.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-stone-500">Šablona vzhledu</label><select className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.design_style} onChange={(e) => setForm((f) => ({ ...f, design_style: e.target.value }))}>{VOUCHER_DESIGN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className="mb-1 block text-xs text-stone-500">Akcentní barva</label><input type="color" className="h-[38px] w-full rounded-xl border border-stone-200 px-2 py-1" value={form.accent_color || '#0f766e'} onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-stone-500">Vlastní obrázek</label><div className="flex flex-wrap items-center gap-2"><label className="inline-flex cursor-pointer items-center rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium hover:bg-stone-50">Nahrát obrázek<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleVoucherImage} /></label>{form.image_data_url && <button type="button" className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium hover:bg-stone-50" onClick={() => setForm((f) => ({ ...f, image_data_url: '' }))}>Odebrat obrázek</button>}</div></div>
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-stone-500">Text v patičce</label><input className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.footer_text} onChange={(e) => setForm((f) => ({ ...f, footer_text: e.target.value }))} placeholder="Např. Platí po předchozí rezervaci termínu." /></div>
            <div className="md:col-span-2"><label className="mb-1 block text-xs text-stone-500">Popis</label><textarea rows={3} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.fulfillment_note} onChange={(e) => setForm((f) => ({ ...f, fulfillment_note: e.target.value }))} /></div>
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
