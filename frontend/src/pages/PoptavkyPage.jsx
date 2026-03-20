import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { zakazkyApi } from '../api';
import { PageHeader, EmptyState, formatDatum, formatCena } from '../components/ui';
import toast from 'react-hot-toast';
import { Inbox, Check, X as XIcon, Phone, MapPin, Users, Banknote, Mail } from 'lucide-react';

const TYP_LABELS_P = { svatba:'Svatba', soukroma_akce:'Soukromá akce', firemni_akce:'Firemní akce', zavoz:'Závoz', bistro:'Bistro', pohreb:'Pohřeb', ostatni:'Ostatní' };
const TYP_CHIP_P   = { svatba:'bg-blue-50 text-blue-700', soukroma_akce:'bg-orange-50 text-orange-700', firemni_akce:'bg-emerald-50 text-emerald-700', zavoz:'bg-violet-50 text-violet-700', bistro:'bg-amber-50 text-amber-700', pohreb:'bg-slate-100 text-slate-600', ostatni:'bg-stone-100 text-stone-500' };

export function PoptavkyPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['poptavky'],
    queryFn: () => zakazkyApi.list({ stav: 'nova_poptavka', limit: 100 }),
    refetchInterval: 60_000,
  });
  const rows = data?.data?.data || [];

  const prijmutMut = useMutation({
    mutationFn: (id) => zakazkyApi.setStav(id, { stav: 'rozpracovano' }),
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['poptavky'] }); qc.invalidateQueries({ queryKey: ['zakazky'] }); navigate(`/zakazky/${id}`); },
  });
  const stornMut = useMutation({
    mutationFn: (id) => zakazkyApi.setStav(id, { stav: 'stornovano' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['poptavky'] }); toast.success('Poptávka stornována'); },
  });

  return (
    <div>
      <PageHeader title="Poptávky" subtitle={rows.length > 0 ? `${rows.length} nových poptávek čeká na zpracování` : 'Žádné nové poptávky'} />
      <div className="p-6">
        {isLoading && <div className="flex justify-center py-12"><span className="text-stone-400 text-sm">Načítám…</span></div>}

        {!isLoading && rows.length === 0 && (
          <EmptyState icon={Inbox} title="Žádné nové poptávky" desc="Nové poptávky z Tally.so nebo webu se zobrazí zde automaticky." />
        )}

        {!isLoading && rows.length > 0 && (
          <div className="space-y-3 max-w-4xl">
            {rows.map(r => {
              const klient = [r.klient_jmeno, r.klient_prijmeni].filter(Boolean).join(' ') || r.klient_firma || '—';
              return (
                <div key={r.id} className="bg-white rounded-xl border border-stone-200 p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start gap-4">
                    {/* Barevný typ pruh */}
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${r.typ ? TYP_CHIP_P[r.typ]?.split(' ')[0].replace('bg-','bg-').replace('50','400') : 'bg-stone-300'}`} />

                    {/* Obsah */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-stone-800">{r.nazev}</span>
                        {r.typ && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYP_CHIP_P[r.typ] || 'bg-stone-100 text-stone-600'}`}>{TYP_LABELS_P[r.typ] || r.typ}</span>}
                        <span className="text-xs text-stone-400 ml-auto">{r.cislo}</span>
                      </div>

                      {/* Klient + kontakt */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500 mb-2">
                        <span className="font-medium text-stone-700">{klient}</span>
                        {r.klient_email && <span className="flex items-center gap-1"><Mail size={11}/>{r.klient_email}</span>}
                        {r.klient_telefon && <span className="flex items-center gap-1"><Phone size={11}/>{r.klient_telefon}</span>}
                      </div>

                      {/* Detaily akce */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500 mb-2">
                        {r.datum_akce && <span>📅 {formatDatum(r.datum_akce)}</span>}
                        {r.misto && <span className="flex items-center gap-1"><MapPin size={11}/>{r.misto}</span>}
                        {r.pocet_hostu && <span className="flex items-center gap-1"><Users size={11}/>{r.pocet_hostu} hostů</span>}
                        {r.rozpocet_klienta && <span className="flex items-center gap-1"><Banknote size={11}/>{formatCena(r.rozpocet_klienta)}</span>}
                      </div>

                      {/* Zpráva / poznámka */}
                      {r.poznamka_klient && (
                        <div className="bg-stone-50 rounded-lg px-3 py-2 text-xs text-stone-600 border border-stone-100 mb-2">
                          {r.poznamka_klient}
                        </div>
                      )}

                      {/* Datum přijetí */}
                      <div className="text-xs text-stone-300">Přijato: {new Date(r.created_at).toLocaleString('cs-CZ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
                    </div>

                    {/* Akce */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => navigate(`/zakazky/${r.id}`)}
                        className="px-3 py-1.5 text-xs border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-600 whitespace-nowrap"
                      >Detail</button>
                      <button
                        onClick={() => prijmutMut.mutate(r.id)}
                        disabled={prijmutMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                      ><Check size={12}/>Převést na zakázku</button>
                      <button
                        onClick={() => stornMut.mutate(r.id)}
                        disabled={stornMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                      ><XIcon size={12}/>Stornovat</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default PoptavkyPage;
