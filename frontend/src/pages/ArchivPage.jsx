import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { archivApi, zakazkyApi, klientiApi, personalApi } from '../api';
import { PageHeader, EmptyState } from '../components/ui';
import toast from 'react-hot-toast';
import { RotateCcw, Archive as ArchiveIcon, UserX, HardHat } from 'lucide-react';

export function ArchivPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('zakazky');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['archiv'],
    queryFn: () => archivApi.list().then(r => r.data),
  });

  const zakazky = data?.zakazky || [];
  const klienti = data?.klienti || [];
  const personal = data?.personal || [];

  const obnovitMut = useMutation({
    mutationFn: ({ druh, id }) => {
      if (druh === 'zakazka') return zakazkyApi.obnovit(id);
      if (druh === 'klient') return klientiApi.obnovit(id);
      return personalApi.obnovit(id);
    },
    onSuccess: () => { toast.success('Obnoveno'); refetch(); qc.invalidateQueries(['zakazky']); qc.invalidateQueries(['klienti']); qc.invalidateQueries(['personal']); },
    onError: () => toast.error('Nepodařilo se obnovit'),
  });

  const STAVOVE_BARVY = {
    nova_poptavka: 'bg-blue-100 text-blue-700',
    rozpracovano:  'bg-yellow-100 text-yellow-700',
    potvrzeno:     'bg-green-100 text-green-700',
    stornovano:    'bg-red-100 text-red-700',
    realizovano:   'bg-stone-100 text-stone-700',
    uzavreno:      'bg-stone-200 text-stone-600',
  };

  const tabs = [
    { k: 'zakazky', l: 'Zakázky', count: zakazky.length },
    { k: 'klienti', l: 'Klienti', count: klienti.length },
    { k: 'personal', l: 'Personál', count: personal.length },
  ];

  return (
    <div>
      <PageHeader title="Archiv" />
      <div className="border-b border-stone-100 bg-white px-6">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
              {t.l} {t.count > 0 && <span className="ml-1.5 text-xs bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-full">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {isLoading && <div className="text-sm text-stone-500">Načítám…</div>}

        {/* Zakázky */}
        {tab === 'zakazky' && !isLoading && (
          zakazky.length === 0 ? (
            <EmptyState icon={ArchiveIcon} title="Žádné archivované zakázky" />
          ) : (
            <div className="space-y-2">
              {zakazky.map(z => (
                <div key={z.id} className="bg-white border border-stone-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-xs text-stone-400 font-mono shrink-0">{z.cislo}</span>
                    <span className="text-sm font-medium text-stone-800 truncate">{z.nazev}</span>
                    {z.klient_firma || z.klient_jmeno ? (
                      <span className="text-xs text-stone-500 shrink-0">{z.klient_firma || `${z.klient_jmeno} ${z.klient_prijmeni || ''}`}</span>
                    ) : null}
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STAVOVE_BARVY[z.stav] || 'bg-stone-100 text-stone-600'}`}>{z.stav}</span>
                  </div>
                  <button onClick={() => obnovitMut.mutate({ druh: 'zakazka', id: z.id })}
                    disabled={obnovitMut.isPending}
                    className="flex items-center gap-1.5 text-xs text-stone-600 border border-stone-200 hover:border-stone-400 hover:text-stone-900 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                    <RotateCcw size={11} /> Obnovit
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* Klienti */}
        {tab === 'klienti' && !isLoading && (
          klienti.length === 0 ? (
            <EmptyState icon={UserX} title="Žádní archivovaní klienti" />
          ) : (
            <div className="space-y-2">
              {klienti.map(k => (
                <div key={k.id} className="bg-white border border-stone-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-sm font-medium text-stone-800 truncate">{k.firma || `${k.jmeno} ${k.prijmeni || ''}`}</span>
                    {k.email && <span className="text-xs text-stone-500 shrink-0">{k.email}</span>}
                    <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full shrink-0">{k.typ}</span>
                  </div>
                  <button onClick={() => obnovitMut.mutate({ druh: 'klient', id: k.id })}
                    disabled={obnovitMut.isPending}
                    className="flex items-center gap-1.5 text-xs text-stone-600 border border-stone-200 hover:border-stone-400 hover:text-stone-900 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                    <RotateCcw size={11} /> Obnovit
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* Personál */}
        {tab === 'personal' && !isLoading && (
          personal.length === 0 ? (
            <EmptyState icon={HardHat} title="Žádní archivovaní pracovníci" />
          ) : (
            <div className="space-y-2">
              {personal.map(p => (
                <div key={p.id} className="bg-white border border-stone-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-sm font-medium text-stone-800 truncate">{`${p.jmeno} ${p.prijmeni || ''}`}</span>
                    {p.role && <span className="text-xs text-stone-500 shrink-0">{p.role}</span>}
                    <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full shrink-0">{p.typ}</span>
                  </div>
                  <button onClick={() => obnovitMut.mutate({ druh: 'personal', id: p.id })}
                    disabled={obnovitMut.isPending}
                    className="flex items-center gap-1.5 text-xs text-stone-600 border border-stone-200 hover:border-stone-400 hover:text-stone-900 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                    <RotateCcw size={11} /> Obnovit
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default ArchivPage;
