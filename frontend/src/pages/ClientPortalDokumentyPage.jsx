import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, FolderOpen } from 'lucide-react';
import { clientPortalApi } from '../api';
import { EmptyState, Spinner, formatDatum } from '../components/ui';

export default function ClientPortalDokumentyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['client-portal-dokumenty'],
    queryFn: () => clientPortalApi.listDokumenty(),
  });

  const dokumenty = data?.data?.data || [];

  const download = async (doc) => {
    try {
      await clientPortalApi.downloadDokument(doc.id, doc.nazev);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Stažení dokumentu se nepodařilo.');
    }
  };

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-stone-900">Dokumenty</h1>
      <p className="mt-1 text-sm text-stone-500">Přehled všech podkladů a příloh dostupných ve Vašem klientském portálu.</p>
      {!dokumenty.length ? (
        <EmptyState icon={FolderOpen} title="Žádné dokumenty" desc="Jakmile budou k zakázkám připojené soubory, uvidíte je tady." />
      ) : (
        <div className="mt-5 space-y-3">
          {dokumenty.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-2xl border border-stone-200 px-4 py-3">
              <div>
                <div className="font-medium text-stone-800">{doc.nazev}</div>
                <div className="mt-1 text-xs text-stone-400">{doc.kategorie} • {doc.zakazka_cislo || 'Bez zakázky'} • {formatDatum(doc.created_at)}</div>
              </div>
              <button type="button" onClick={() => download(doc)} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50">
                <Download size={14} />
                Stáhnout
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
