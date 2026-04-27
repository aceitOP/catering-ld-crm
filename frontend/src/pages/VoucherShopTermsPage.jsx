import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { voucherShopApi } from '../api';
import { Spinner } from '../components/ui';

export default function VoucherShopTermsPage() {
  const configQuery = useQuery({
    queryKey: ['voucher-shop-config'],
    queryFn: voucherShopApi.config,
    select: (res) => res.data,
  });

  if (configQuery.isLoading) {
    return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Spinner /></div>;
  }

  const config = configQuery.data || {};
  const title = config.branding?.firma_nazev || config.branding?.app_title || 'Dárkové poukazy';
  const terms = String(config.terms_text || '').trim();

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {config.branding?.app_logo_data_url ? (
              <img src={config.branding.app_logo_data_url} alt={title} className="h-10 w-10 object-contain" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Gift size={20} /></div>
            )}
            <div>
              <div className="text-sm font-semibold text-stone-900">{title}</div>
              <div className="text-xs text-stone-500">Obchodní podmínky</div>
            </div>
          </div>
          <Link to="/shop" className="text-sm font-medium text-brand-700 hover:underline">Zpět do shopu</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-stone-900">Obchodní podmínky</h1>
          <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-stone-600">
            {terms || 'Obchodní podmínky zatím nejsou vyplněné. Kontaktujte nás prosím přímo.'}
          </div>
        </div>
      </main>
    </div>
  );
}
