import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Gift, Send, ShieldCheck } from 'lucide-react';
import { voucherShopApi } from '../api';
import { Btn, Spinner } from '../components/ui';

const EMPTY_FORM = {
  amount: '',
  buyer_name: '',
  buyer_email: '',
  recipient_choice: 'buyer',
  recipient_name: '',
  recipient_email: '',
  fulfillment_note: '',
  delivery_mode: 'immediate',
  delivery_scheduled_at: '',
};

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('cs-CZ')} Kč`;
}

function minDateTimeLocal() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

export default function VoucherShopPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);

  const configQuery = useQuery({
    queryKey: ['voucher-shop-config'],
    queryFn: voucherShopApi.config,
    select: (res) => res.data,
  });

  const createMut = useMutation({
    mutationFn: voucherShopApi.createOrder,
    onSuccess: (res) => {
      toast.success('Objednávka poukazu byla vytvořena.');
      navigate(`/shop/objednavka/${res.data.public_token}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Objednávku se nepodařilo vytvořit.'),
  });

  const config = configQuery.data;
  const values = config?.values || [];
  const selectedAmount = Number(form.amount || 0);
  const minDelivery = useMemo(() => minDateTimeLocal(), []);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event) => {
    event.preventDefault();
    createMut.mutate({
      ...form,
      amount: selectedAmount,
      delivery_scheduled_at: form.delivery_mode === 'scheduled' ? form.delivery_scheduled_at : null,
    });
  };

  if (configQuery.isLoading) {
    return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Spinner /></div>;
  }

  if (!config?.enabled || !config?.bank_ready) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <Gift className="mx-auto text-stone-400" size={32} />
          <h1 className="mt-4 text-xl font-bold text-stone-900">Prodej poukazů není aktivní</h1>
          <p className="mt-2 text-sm text-stone-500">Zkuste to prosím později nebo nás kontaktujte přímo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {config.branding?.app_logo_data_url ? (
              <img src={config.branding.app_logo_data_url} alt={config.branding.firma_nazev || config.branding.app_title} className="h-10 w-10 object-contain" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Gift size={20} /></div>
            )}
            <div>
              <div className="text-sm font-semibold text-stone-900">{config.branding?.firma_nazev || config.branding?.app_title || 'Dárkové poukazy'}</div>
              <div className="text-xs text-stone-500">Dárkové poukazy</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-stone-500 sm:flex">
            <ShieldCheck size={15} className="text-emerald-600" />
            Platba bankovním převodem
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-5 py-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Vyberte dárkový poukaz</h1>
            <p className="mt-1 text-sm text-stone-500">Po odeslání objednávky dostanete platební údaje a QR platbu.</p>
          </div>

          <section>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">Hodnota</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {values.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setField('amount', String(value))}
                  className={`h-12 rounded-xl border text-sm font-bold transition-colors ${selectedAmount === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'}`}
                >
                  {formatMoney(value)}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div><label className="mb-1 block text-xs text-stone-500">Jméno kupujícího</label><input required className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.buyer_name} onChange={(e) => setField('buyer_name', e.target.value)} /></div>
            <div><label className="mb-1 block text-xs text-stone-500">E-mail kupujícího</label><input required type="email" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.buyer_email} onChange={(e) => setField('buyer_email', e.target.value)} /></div>
          </section>

          <section className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">Komu poukaz poslat</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[['buyer', 'Mně'], ['recipient', 'Někomu jinému']].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setField('recipient_choice', value)} className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${form.recipient_choice === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-200 text-stone-700 hover:bg-stone-50'}`}>{label}</button>
              ))}
            </div>
            {form.recipient_choice === 'recipient' && (
              <div className="grid gap-3 md:grid-cols-2">
                <div><label className="mb-1 block text-xs text-stone-500">Jméno obdarovaného</label><input required className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.recipient_name} onChange={(e) => setField('recipient_name', e.target.value)} /></div>
                <div><label className="mb-1 block text-xs text-stone-500">E-mail obdarovaného</label><input required type="email" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.recipient_email} onChange={(e) => setField('recipient_email', e.target.value)} /></div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">Kdy poukaz odeslat</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[['immediate', 'Ihned po zaplacení'], ['scheduled', 'V konkrétní datum a čas']].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setField('delivery_mode', value)} className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold ${form.delivery_mode === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-200 text-stone-700 hover:bg-stone-50'}`}>{label}</button>
              ))}
            </div>
            {form.delivery_mode === 'scheduled' && (
              <input required type="datetime-local" min={minDelivery} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.delivery_scheduled_at} onChange={(e) => setField('delivery_scheduled_at', e.target.value)} />
            )}
          </section>

          <div>
            <label className="mb-1 block text-xs text-stone-500">Popis / věnování</label>
            <textarea rows={4} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" value={form.fulfillment_note} onChange={(e) => setField('fulfillment_note', e.target.value)} />
          </div>

          {config.terms_text && <div className="rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-500 whitespace-pre-wrap">{config.terms_text}</div>}

          <Btn type="submit" variant="primary" disabled={!selectedAmount || createMut.isPending}>
            <Send size={14} />
            {createMut.isPending ? 'Vytvářím objednávku...' : 'Objednat poukaz'}
          </Btn>
        </form>

        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Souhrn</div>
          <div className="mt-3 text-3xl font-bold text-stone-900">{selectedAmount ? formatMoney(selectedAmount) : '—'}</div>
          <div className="mt-3 space-y-2 text-sm text-stone-500">
            <div>Platnost: {config.validity_months} měsíců od potvrzení platby</div>
            <div>Platba: bankovní převod / QR platba</div>
            <div>Měna: CZK</div>
          </div>
        </aside>
      </main>
    </div>
  );
}
