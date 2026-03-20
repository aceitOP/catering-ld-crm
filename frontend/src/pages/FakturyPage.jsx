import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fakturyApi, klientiApi } from '../api';
import { PageHeader, EmptyState, Btn, Spinner, useSort, SortTh } from '../components/ui';
import { Plus, Receipt, CreditCard, CheckCircle2, Clock, Ban } from 'lucide-react';
import { printFakturuPdf } from '../utils/print';

const FAKTURA_STAV = {
  vystavena: { label: 'Vystavena', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  odeslana:  { label: 'Odeslána',  cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  zaplacena: { label: 'Zaplacena', cls: 'bg-green-50 text-green-700 border border-green-200' },
  storno:    { label: 'Storno',    cls: 'bg-red-50 text-red-400 border border-red-200' },
};

function FakturaStavBadge({ stav }) {
  const cfg = FAKTURA_STAV[stav] || { label: stav, cls: 'bg-stone-100 text-stone-500' };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

export function FakturyPage() {
  const navigate = useNavigate();
  const [stavFilter, setStavFilter] = useState('');
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['faktury', stavFilter, q],
    queryFn: () => fakturyApi.list({ stav: stavFilter || undefined, q: q || undefined }),
  });
  const fakturyRaw = data?.data?.data || [];

  const sortF = useSort();
  const SORT_ACC_F = { cislo: 'cislo', klient: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`, zakazka: 'zakazka_cislo', vystavena: 'datum_vystaveni', splatnost: 'datum_splatnosti', celkem: r => parseFloat(r.cena_celkem)||0, stav: 'stav' };
  const faktury = sortF.sortFn(fakturyRaw, SORT_ACC_F);

  const fmtC = (n) => n != null ? Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč' : '—';
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('cs-CZ') : '—';

  const totalVystavena = faktury.filter(f => f.stav === 'vystavena').reduce((s, f) => s + parseFloat(f.cena_celkem || 0), 0);
  const totalOdeslana  = faktury.filter(f => f.stav === 'odeslana').reduce((s, f) => s + parseFloat(f.cena_celkem || 0), 0);
  const totalZaplacena = faktury.filter(f => f.stav === 'zaplacena').reduce((s, f) => s + parseFloat(f.cena_celkem || 0), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Fakturace</h1>
          <p className="text-sm text-stone-400 mt-0.5">Vydané faktury za catering zakázky</p>
        </div>
        <Btn variant="primary" onClick={() => navigate('/faktury/nova')}><Plus size={14}/> Nová faktura</Btn>
      </div>

      {/* Statistiky */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Vystaveno', value: totalVystavena, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Odesláno', value: totalOdeslana, icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Zaplaceno', value: totalZaplacena, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <div className="text-xs text-stone-400">{s.label}</div>
              <div className={`text-base font-bold ${s.color}`}>{fmtC(s.value)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtry */}
      <div className="flex gap-3 items-center">
        <input
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 w-60 bg-white"
          placeholder="Hledat (číslo, klient)…"
          value={q} onChange={e => setQ(e.target.value)}
        />
        <div className="flex gap-1">
          {['', 'vystavena', 'odeslana', 'zaplacena', 'storno'].map(s => (
            <button key={s}
              onClick={() => setStavFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                stavFilter === s ? 'bg-stone-800 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-300'
              }`}
            >{s === '' ? 'Vše' : FAKTURA_STAV[s]?.label || s}</button>
          ))}
        </div>
      </div>

      {/* Tabulka */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : faktury.length === 0 ? (
        <EmptyState icon={Receipt} title="Žádné faktury" desc={'Vystavte první fakturu kliknutím na \u201eNová faktura\u201c.'} />
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                {[['Číslo','cislo'],['Klient','klient'],['Zakázka','zakazka'],['Vystavena','vystavena'],['Splatnost','splatnost'],['Celkem','celkem'],['Stav','stav']].map(([l,k]) =>
                  <SortTh key={k} label={l} sortKey={k} active={sortF.sortKey===k} dir={sortF.sortDir} onSort={sortF.toggle}/>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {faktury.map(f => {
                const overdue = f.stav === 'vystavena' || f.stav === 'odeslana'
                  ? new Date(f.datum_splatnosti) < new Date() : false;
                return (
                  <tr key={f.id} onClick={() => navigate(`/faktury/${f.id}`)}
                    className="hover:bg-stone-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-stone-800 font-mono">{f.cislo}</td>
                    <td className="px-4 py-3 text-sm text-stone-700">
                      {f.klient_firma || [f.klient_jmeno, f.klient_prijmeni].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-500">{f.zakazka_cislo || '—'}</td>
                    <td className="px-4 py-3 text-sm text-stone-500">{fmtD(f.datum_vystaveni)}</td>
                    <td className={`px-4 py-3 text-sm font-medium ${overdue ? 'text-red-600' : 'text-stone-500'}`}>
                      {fmtD(f.datum_splatnosti)}
                      {overdue && <span className="ml-1 text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">Po splatnosti</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-stone-800">{fmtC(f.cena_celkem)}</td>
                    <td className="px-4 py-3"><FakturaStavBadge stav={f.stav} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default FakturyPage;
