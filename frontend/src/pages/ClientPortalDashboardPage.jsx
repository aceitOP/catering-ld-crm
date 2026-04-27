import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, FileText, FolderOpen, Receipt } from 'lucide-react';
import { clientPortalApi } from '../api';
import { EmptyState, Spinner, StavBadge, TypBadge, formatCena, formatDatum } from '../components/ui';

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon size={18} />
        </div>
        <div>
          <div className="text-xs font-medium text-stone-400">{label}</div>
          <div className="text-xl font-bold text-stone-900">{value}</div>
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['client-portal-dashboard'],
    queryFn: () => clientPortalApi.dashboard(),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  const dashboard = data?.data;
  const zakazky = dashboard?.scope?.zakazky || [];
  const dokumenty = dashboard?.dokumenty || [];
  const faktury = dashboard?.faktury || [];
  const proposals = dashboard?.proposals || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Přehled klienta</h1>
        <p className="mt-1 text-sm text-stone-500">Všechny Vaše zakázky, dokumenty, faktury a aktivní výběry menu na jednom místě.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatTile icon={CalendarDays} label="Zakázky" value={zakazky.length} />
        <StatTile icon={FolderOpen} label="Dokumenty" value={dokumenty.length} />
        <StatTile icon={Receipt} label="Faktury" value={faktury.length} />
        <StatTile icon={FileText} label="Výběry menu" value={proposals.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Zakázky a termíny</h2>
          </div>
          {!zakazky.length ? (
            <EmptyState icon={CalendarDays} title="Zatím tu nevidíme žádné zakázky" desc="Jakmile bude k Vašemu e-mailu navázaná akce, zobrazí se tady." />
          ) : (
            <div className="space-y-3">
              {zakazky.map((zakazka) => (
                <Link key={zakazka.id} to={`/portal/zakazky/${zakazka.id}`} className="block rounded-2xl border border-stone-200 px-4 py-4 hover:bg-stone-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-stone-900">{zakazka.nazev}</div>
                    <span className="text-xs font-medium text-stone-400">{zakazka.cislo}</span>
                    <StavBadge stav={zakazka.stav} />
                    <TypBadge typ={zakazka.typ} />
                  </div>
                  <div className="mt-2 text-sm text-stone-500">
                    {formatDatum(zakazka.datum_akce)} • {zakazka.venue_name || zakazka.misto || 'Místo bude upřesněno'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900">Dokumenty</h2>
              <Link to="/portal/dokumenty" className="text-sm font-medium text-brand-600">Všechny</Link>
            </div>
            <div className="space-y-3">
              {dokumenty.slice(0, 4).map((doc) => (
                <div key={doc.id} className="rounded-2xl bg-stone-50 px-4 py-3">
                  <div className="font-medium text-stone-800">{doc.nazev}</div>
                  <div className="text-xs text-stone-400">{formatDatum(doc.created_at)} • {doc.zakazka_cislo || 'Bez zakázky'}</div>
                </div>
              ))}
              {!dokumenty.length && <div className="text-sm text-stone-400">Zatím nejsou dostupné žádné dokumenty.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900">Aktivní výběry menu</h2>
            </div>
            <div className="space-y-3">
              {proposals.slice(0, 4).map((proposal) => (
                <a key={proposal.id} href={proposal.url} className="block rounded-2xl bg-stone-50 px-4 py-3 hover:bg-stone-100">
                  <div className="font-medium text-stone-800">{proposal.nazev}</div>
                  <div className="text-xs text-stone-400">
                    {proposal.zakazka_cislo} • {proposal.status} • {formatCena(proposal.total_price)}
                  </div>
                </a>
              ))}
              {!proposals.length && <div className="text-sm text-stone-400">Momentálně tu není žádný klientský návrh menu.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
