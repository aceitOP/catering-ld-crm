import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Gift, ShieldCheck } from 'lucide-react';
import { vouchersApi } from '../api';
import { Spinner, formatDatum } from '../components/ui';

export default function PublicVoucherPage() {
  const { token } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-voucher', token],
    queryFn: () => vouchersApi.publicGet(token),
  });

  if (isLoading) return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Spinner /></div>;

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-lg">
          <div className="text-xl font-bold text-stone-900">Poukaz nebyl nalezen</div>
          <div className="mt-2 text-sm text-stone-500">Zkontrolujte prosím kód nebo QR odkaz.</div>
        </div>
      </div>
    );
  }

  const voucher = data?.data;

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-lg">
        <div className="flex items-center gap-3 text-brand-600">
          <Gift size={24} />
          <div className="text-xs font-semibold uppercase tracking-[0.18em]">Ověření poukazu</div>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-stone-900">{voucher.title}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-stone-500">
          <ShieldCheck size={16} className="text-emerald-600" />
          Stav: <strong className="text-stone-900">{voucher.status}</strong>
        </div>
        <div className="mt-6 grid gap-3">
          <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Kód poukazu</div><div className="font-semibold text-stone-900">{voucher.kod}</div></div>
          <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Příjemce</div><div className="font-semibold text-stone-900">{voucher.recipient_name || 'Neuvedeno'}</div></div>
          <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Expirace</div><div className="font-semibold text-stone-900">{voucher.expires_at ? formatDatum(voucher.expires_at) : 'Bez expirace'}</div></div>
        </div>
        {voucher.fulfillment_note && (
          <div className="mt-6 rounded-2xl border border-stone-200 px-4 py-4 text-sm leading-6 text-stone-600">
            {voucher.fulfillment_note}
          </div>
        )}
      </div>
    </div>
  );
}
