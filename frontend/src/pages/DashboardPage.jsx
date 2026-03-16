import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { zakazkyApi, kalendarApi } from '../api';
import { PageHeader, StatCard, StavBadge, TypBadge, formatCena, formatDatum, Spinner } from '../components/ui';
import { Plus, ArrowRight } from 'lucide-react';

const STAVY_AKCE = ['nabidka_pripravena', 'ceka_na_vyjadreni', 'nabidka_odeslana'];

export default function DashboardPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: zakazkyData, isLoading } = useQuery({
    queryKey: ['zakazky-dashboard'],
    queryFn: () => zakazkyApi.list({ limit: 100 }),
  });

  const { data: kalData } = useQuery({
    queryKey: ['kalendar-dashboard'],
    queryFn: () => kalendarApi.list({ od: today }),
  });

  const zakazky = zakazkyData?.data?.data || [];
  const upcoming = kalData?.data?.data?.slice(0, 6) || [];

  // Metriky
  const potvrzene   = zakazky.filter(z => z.stav === 'potvrzeno').length;
  const cekaNaAkci  = zakazky.filter(z => STAVY_AKCE.includes(z.stav)).length;
  const obratMesic  = zakazky.filter(z => z.datum_akce >= today && z.datum_akce <= endOfMonth)
    .reduce((s, z) => s + parseFloat(z.cena_celkem || 0), 0);
  const posledni    = zakazky.slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <button
            onClick={() => navigate('/zakazky/nova')}
            className="inline-flex items-center gap-1.5 bg-stone-900 text-white text-xs font-medium px-3 py-2 rounded-md hover:bg-stone-800 transition-colors"
          >
            <Plus size={13} /> Nová zakázka
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Zakázky celkem" value={zakazky.length} />
            <StatCard label="Čeká na akci" value={cekaNaAkci} color="amber" />
            <StatCard label="Potvrzených akcí" value={potvrzene} color="green" />
            <StatCard label="Obrat tento měsíc" value={formatCena(obratMesic)} color="blue" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Nadcházející akce – nyní první + větší */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-stone-200">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
              <span className="text-sm font-semibold text-stone-800">Nadcházející akce</span>
              <button
                onClick={() => navigate('/kalendar')}
                className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors"
              >
                Kalendář <ArrowRight size={11} />
              </button>
            </div>
            <div className="divide-y divide-stone-50">
              {upcoming.map(e => {
                const d = new Date(e.datum_akce);
                return (
                  <div
                    key={e.id}
                    onClick={() => navigate(`/zakazky/${e.id}`)}
                    className="flex gap-3 px-5 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                  >
                    <div className="bg-stone-100 rounded-lg px-2.5 py-1.5 text-center min-w-[44px] flex-shrink-0">
                      <div className="text-sm font-semibold text-stone-800 leading-none">{d.getDate()}</div>
                      <div className="text-xs text-stone-500 uppercase mt-0.5">
                        {d.toLocaleString('cs-CZ', { month: 'short' })}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-stone-800 truncate">{e.nazev}</div>
                      <div className="text-xs text-stone-400 mt-0.5 truncate">
                        {e.misto || ''}{e.misto && e.pocet_hostu ? ' · ' : ''}{e.pocet_hostu ? `${e.pocet_hostu} hostů` : ''}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <TypBadge typ={e.typ} />
                      {e.cas_zacatek && <span className="text-xs text-stone-400">{e.cas_zacatek.slice(0,5)}</span>}
                    </div>
                  </div>
                );
              })}
              {!upcoming.length && (
                <div className="py-10 text-center text-sm text-stone-400">Žádné nadcházející akce</div>
              )}
            </div>
          </div>

          {/* Poslední zakázky */}
          <div className="bg-white rounded-xl border border-stone-200">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
              <span className="text-sm font-semibold text-stone-800">Poslední zakázky</span>
              <button
                onClick={() => navigate('/zakazky')}
                className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors"
              >
                Všechny <ArrowRight size={11} />
              </button>
            </div>
            <div>
              {posledni.map((z, i) => (
                <div
                  key={z.id}
                  onClick={() => navigate(`/zakazky/${z.id}`)}
                  className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors ${i < posledni.length - 1 ? 'border-b border-stone-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-stone-900 truncate">{z.nazev}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{formatDatum(z.datum_akce)}</div>
                  </div>
                  <StavBadge stav={z.stav} />
                </div>
              ))}
              {!isLoading && !posledni.length && (
                <div className="py-10 text-center text-sm text-stone-400">Žádné zakázky</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
