import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText } from 'lucide-react';
import { clientPortalApi } from '../api';
import { EmptyState, Spinner, formatCena, formatDatum } from '../components/ui';
import { printFakturuPdf } from '../utils/print';

export default function ClientPortalFakturyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['client-portal-faktury'],
    queryFn: () => clientPortalApi.listFaktury(),
  });

  const faktury = data?.data?.data || [];

  const printInvoice = async (id) => {
    try {
      const response = await clientPortalApi.getFaktura(id);
      printFakturuPdf(response.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Fakturu se nepodařilo otevřít.');
    }
  };

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-stone-900">Faktury</h1>
      <p className="mt-1 text-sm text-stone-500">Přehled vystavených faktur navázaných na Vaše akce a klientský e-mail.</p>
      {!faktury.length ? (
        <EmptyState icon={FileText} title="Žádné faktury" desc="Jakmile bude k zakázce vystavená faktura, objeví se tady." />
      ) : (
        <div className="mt-5 space-y-3">
          {faktury.map((faktura) => (
            <div key={faktura.id} className="flex items-center justify-between rounded-2xl border border-stone-200 px-4 py-3">
              <div>
                <div className="font-medium text-stone-800">{faktura.cislo}</div>
                <div className="mt-1 text-xs text-stone-400">
                  {formatCena(faktura.cena_celkem)} • vystaveno {formatDatum(faktura.datum_vystaveni)} • splatnost {formatDatum(faktura.datum_splatnosti)}
                </div>
              </div>
              <button type="button" onClick={() => printInvoice(faktura.id)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50">
                Tisk / PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
