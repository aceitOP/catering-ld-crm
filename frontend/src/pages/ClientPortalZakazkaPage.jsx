import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { clientPortalApi } from '../api';
import { Btn, Spinner, StavBadge, TypBadge, formatCena, formatDatum } from '../components/ui';

export default function ClientPortalZakazkaPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [soubor, setSoubor] = useState(null);
  const [poznamka, setPoznamka] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['client-portal-zakazka', id],
    queryFn: () => clientPortalApi.getZakazka(id),
  });

  const uploadMut = useMutation({
    mutationFn: (formData) => clientPortalApi.uploadDokument(formData),
    onSuccess: () => {
      toast.success('Podklady byly nahrány.');
      setSoubor(null);
      setPoznamka('');
      qc.invalidateQueries({ queryKey: ['client-portal-zakazka', id] });
      qc.invalidateQueries({ queryKey: ['client-portal-dashboard'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Nahrání podkladů se nepodařilo.'),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  const zakazka = data?.data;
  if (!zakazka) return null;

  const submitUpload = () => {
    if (!soubor) return;
    const formData = new FormData();
    formData.append('soubor', soubor);
    formData.append('zakazka_id', zakazka.id);
    formData.append('poznamka', poznamka);
    uploadMut.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-stone-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-stone-900">{zakazka.nazev}</h1>
          <span className="text-sm text-stone-400">{zakazka.cislo}</span>
          <StavBadge stav={zakazka.stav} />
          <TypBadge typ={zakazka.typ} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Datum akce</div><div className="font-semibold text-stone-900">{formatDatum(zakazka.datum_akce)}</div></div>
          <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Čas</div><div className="font-semibold text-stone-900">{zakazka.cas_zacatek || '—'}{zakazka.cas_konec ? ` – ${zakazka.cas_konec}` : ''}</div></div>
          <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Místo</div><div className="font-semibold text-stone-900">{zakazka.venue_name || zakazka.misto || 'Bude upřesněno'}</div></div>
          <div className="rounded-2xl bg-stone-50 px-4 py-3"><div className="text-xs text-stone-400">Počet hostů</div><div className="font-semibold text-stone-900">{zakazka.pocet_hostu || '—'}</div></div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-900">Dokumenty a podklady</h2>
          <div className="mt-4 space-y-3">
            {(zakazka.dokumenty || []).map((doc) => (
              <div key={doc.id} className="rounded-2xl border border-stone-200 px-4 py-3">
                <div className="font-medium text-stone-800">{doc.nazev}</div>
                <div className="mt-1 text-xs text-stone-400">{doc.kategorie} • {formatDatum(doc.created_at)}</div>
              </div>
            ))}
            {!zakazka.dokumenty?.length && <div className="text-sm text-stone-400">K zakázce zatím nejsou přiložené žádné dokumenty.</div>}
          </div>

          <div className="mt-5 rounded-2xl bg-stone-50 p-4">
            <div className="text-sm font-semibold text-stone-800">Doplnit podklady</div>
            <input type="file" className="mt-3 block w-full text-sm text-stone-600" onChange={(e) => setSoubor(e.target.files?.[0] || null)} />
            <textarea
              rows={3}
              className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none"
              placeholder="Krátká poznámka k nahranému souboru"
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
            />
            <div className="mt-3">
              <Btn variant="primary" onClick={submitUpload} disabled={!soubor || uploadMut.isPending}>
                <Upload size={14} />
                {uploadMut.isPending ? 'Nahrávám…' : 'Nahrát podklady'}
              </Btn>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-stone-900">Faktury</h2>
            <div className="mt-4 space-y-3">
              {(zakazka.faktury || []).map((faktura) => (
                <div key={faktura.id} className="rounded-2xl border border-stone-200 px-4 py-3">
                  <div className="font-medium text-stone-800">{faktura.cislo}</div>
                  <div className="mt-1 text-sm text-stone-500">{formatCena(faktura.cena_celkem)} • splatnost {formatDatum(faktura.datum_splatnosti)}</div>
                </div>
              ))}
              {!zakazka.faktury?.length && <div className="text-sm text-stone-400">K této zakázce zatím neevidujeme žádnou fakturu.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-stone-900">Výběr menu / nabídky</h2>
            <div className="mt-4 space-y-3">
              {(zakazka.proposals || []).map((proposal) => (
                <a key={proposal.id} href={proposal.url} className="block rounded-2xl border border-stone-200 px-4 py-3 hover:bg-stone-50">
                  <div className="font-medium text-stone-800">{proposal.nazev}</div>
                  <div className="mt-1 text-sm text-stone-500">{proposal.status} • {formatCena(proposal.total_price)}</div>
                </a>
              ))}
              {!zakazka.proposals?.length && <div className="text-sm text-stone-400">Klientský návrh menu zatím není k dispozici.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
