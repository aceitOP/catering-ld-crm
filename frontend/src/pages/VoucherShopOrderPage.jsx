import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Gift } from 'lucide-react';
import { voucherShopApi } from '../api';
import { Spinner } from '../components/ui';

function money(value) {
  return `${Number(value || 0).toLocaleString('cs-CZ')} Kč`;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABELS = {
  pending_payment: 'Čeká na platbu',
  paid: 'Zaplaceno',
  voucher_created: 'Poukaz připraven',
  sent: 'Poukaz odeslán',
  cancelled: 'Zrušeno',
};

export default function VoucherShopOrderPage() {
  const { token } = useParams();
  const orderQuery = useQuery({
    queryKey: ['voucher-shop-order', token],
    queryFn: () => voucherShopApi.getOrder(token),
    select: (res) => res.data,
  });

  if (orderQuery.isLoading) return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Spinner /></div>;

  const order = orderQuery.data;
  if (!order) {
    return <div className="min-h-screen bg-stone-50 flex items-center justify-center text-sm text-stone-500">Objednávka nebyla nalezena.</div>;
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-brand-600">
          {order.status === 'sent' ? <CheckCircle2 size={26} /> : <Clock size={26} />}
          <div className="text-xs font-semibold uppercase tracking-[0.18em]">Objednávka poukazu</div>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-stone-900">{order.order_number}</h1>
        <p className="mt-1 text-sm text-stone-500">Stav: <strong className="text-stone-900">{STATUS_LABELS[order.status] || order.status}</strong></p>

        <div className="mt-6 rounded-2xl bg-stone-50 p-5">
          <div className="text-sm text-stone-500">Částka k úhradě</div>
          <div className="mt-1 text-3xl font-bold text-stone-900">{money(order.amount)}</div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-stone-400">IBAN</span><div className="font-semibold text-stone-900">{order.payment_iban}</div></div>
            <div><span className="text-stone-400">Variabilní symbol</span><div className="font-semibold text-stone-900">{order.payment_variable_symbol}</div></div>
          </div>
          {order.payment_qr_data_url && <img src={order.payment_qr_data_url} alt="QR platba" className="mt-5 h-52 w-52 rounded-xl border border-stone-200 bg-white p-2" />}
        </div>

        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-4"><div className="text-xs text-stone-400">Kupující</div><div className="font-semibold text-stone-900">{order.buyer_name}</div><div className="text-stone-500">{order.buyer_email}</div></div>
          <div className="rounded-xl border border-stone-200 p-4"><div className="text-xs text-stone-400">Odeslání</div><div className="font-semibold text-stone-900">{order.delivery_mode === 'scheduled' ? formatDateTime(order.delivery_scheduled_at) : 'Ihned po zaplacení'}</div><div className="text-stone-500">{order.recipient_choice === 'recipient' ? order.recipient_email : order.buyer_email}</div></div>
        </div>

        {(order.billing_company || order.billing_name || order.billing_address) && (
          <div className="mt-5 rounded-xl border border-stone-200 p-4 text-sm">
            <div className="text-xs text-stone-400">Fakturační údaje</div>
            <div className="mt-1 font-semibold text-stone-900">{order.billing_company || order.billing_name}</div>
            {(order.billing_ico || order.billing_dic) && <div className="text-stone-500">{order.billing_ico ? `IČO: ${order.billing_ico}` : ''}{order.billing_ico && order.billing_dic ? ' · ' : ''}{order.billing_dic ? `DIČ: ${order.billing_dic}` : ''}</div>}
            {order.billing_address && <div className="mt-2 whitespace-pre-wrap text-stone-500">{order.billing_address}</div>}
            {order.billing_email && <div className="mt-2 text-stone-500">{order.billing_email}</div>}
          </div>
        )}

        {order.voucher_kod && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <Gift size={20} />
            Poukaz {order.voucher_kod} je vytvořený.
          </div>
        )}
      </div>
    </div>
  );
}
