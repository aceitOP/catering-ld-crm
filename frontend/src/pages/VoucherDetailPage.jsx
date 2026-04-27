import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Send } from 'lucide-react';
import { vouchersApi } from '../api';
import { Btn, Spinner, formatDatum } from '../components/ui';

export default function VoucherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sendEmail, setSendEmail] = useState('');

  const voucherQuery = useQuery({ queryKey: ['voucher', id], queryFn: () => vouchersApi.get(id) });
  const historyQuery = useQuery({ queryKey: ['voucher-history', id], queryFn: () => vouchersApi.history(id) });

  const sendMut = useMutation({
    mutationFn: (payload) => vouchersApi.send(id, payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Poukaz byl odeslán.');
      qc.invalidateQueries({ queryKey: ['voucher-history', id] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Odeslání poukazu se nepodařilo.'),
  });
  const redeemMut = useMutation({
    mutationFn: () => vouchersApi.redeem(id),
    onSuccess: () => {
      toast.success('Poukaz byl označen jako čerpaný.');
      qc.invalidateQueries({ queryKey: ['voucher', id] });
      qc.invalidateQueries({ queryKey: ['voucher-history', id] });
      qc.invalidateQueries({ queryKey: ['vouchers'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Změna stavu se nepodařila.'),
  });
  const expireMut = useMutation({
    mutationFn: () => vouchersApi.expire(id),
    onSuccess: () => {
      toast.success('Poukaz byl označen jako expirovaný.');
      qc.invalidateQueries({ queryKey: ['voucher', id] });
      qc.invalidateQueries({ queryKey: ['voucher-history', id] });
      qc.invalidateQueries({ queryKey: ['vouchers'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Změna stavu se nepodařila.'),
  });

  const printVoucher = async () => {
    try {
      const res = await vouchersApi.print(id);
      const win = window.open('', '_blank', 'width=960,height=800');
      win.document.write(res.data);
      win.document.close();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Tisk poukazu se nepodařil.');
    }
  };

  if (voucherQuery.isLoading || historyQuery.isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  const voucher = voucherQuery.data?.data;
  const history = historyQuery.data?.data?.data || [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button type="button" onClick={() => navigate('/poukazy')} className="text-sm font-medium text-brand-600">← Zpět na poukazy</button>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">{voucher.title}</h1>
          <p className="mt-1 text-sm text-stone-500">{voucher.kod} • stav {voucher.status}</p>
        </div>
        <div className="flex gap-2">
          <Btn onClick={printVoucher}>Tisk / PDF</Btn>
          <Btn variant="primary" onClick={() => redeemMut.mutate()} disabled={redeemMut.isPending || voucher.status === 'redeemed'}>Označit čerpání</Btn>
          <Btn variant="danger" onClick={() => expireMut.mutate()} disabled={expireMut.isPending || voucher.status === 'expired'}>Expirovat</Btn>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Hodnota</div><div className="font-semibold text-stone-900">{voucher.nominal_value ? `${Number(voucher.nominal_value).toLocaleString('cs-CZ')} Kč` : 'Plnění dle popisu'}</div></div>
            <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Expirace</div><div className="font-semibold text-stone-900">{voucher.expires_at ? formatDatum(voucher.expires_at) : 'Bez expirace'}</div></div>
            <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Příjemce</div><div className="font-semibold text-stone-900">{voucher.recipient_name || '—'}</div></div>
            <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Kupující</div><div className="font-semibold text-stone-900">{voucher.buyer_name || '—'}</div></div>
          </div>

          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Rozsah plnění</div>
            <div className="mt-2 rounded-2xl border border-stone-200 px-4 py-4 text-sm leading-6 text-stone-600 whitespace-pre-wrap">{voucher.fulfillment_note || voucher.note || 'Bez doplňujícího popisu.'}</div>
          </div>

          <div className="mt-5 rounded-2xl bg-stone-50 p-4">
            <div className="text-sm font-semibold text-stone-800">Odeslání voucheru e-mailem</div>
            <div className="mt-3 flex gap-3">
              <input className="flex-1 rounded-xl border border-stone-200 px-4 py-2 text-sm focus:outline-none" placeholder={voucher.recipient_email || voucher.buyer_email || 'email@domena.cz'} value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} />
              <Btn variant="primary" onClick={() => sendMut.mutate({ email: sendEmail || undefined })} disabled={sendMut.isPending}>
                <Send size={14} />
                {sendMut.isPending ? 'Odesílám…' : 'Poslat'}
              </Btn>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-900">Historie</h2>
          <div className="mt-4 space-y-3">
            {history.map((item) => (
              <div key={item.id} className="rounded-2xl border border-stone-200 px-4 py-3">
                <div className="font-medium text-stone-800">{item.event_type}</div>
                <div className="mt-1 text-xs text-stone-400">{formatDatum(item.created_at)} • {[item.jmeno, item.prijmeni].filter(Boolean).join(' ') || item.actor_label || 'Systém'}</div>
                {(item.previous_status || item.next_status) && (
                  <div className="mt-1 text-sm text-stone-500">{item.previous_status || '—'} → {item.next_status || '—'}</div>
                )}
              </div>
            ))}
            {!history.length && <div className="text-sm text-stone-400">Historie je zatím prázdná.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
