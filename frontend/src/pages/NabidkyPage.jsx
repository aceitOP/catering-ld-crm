import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { nabidkyApi, zakazkyApi } from '../api';
import { PageHeader, EmptyState, Btn, Spinner, ExportMenu, useSort, SortTh } from '../components/ui';
import { Plus, FileText } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';

const STAV_LABELS_N = { koncept:'Koncept', odeslano:'Odesláno', prijato:'Přijato', zamitnuto:'Zamítnuto', expirovano:'Expirováno' };
const STAV_CLS = { koncept:'bg-amber-50 text-amber-700', odeslano:'bg-purple-50 text-purple-700', prijato:'bg-green-50 text-green-700', zamitnuto:'bg-red-50 text-red-600', expirovano:'bg-stone-100 text-stone-500' };

export function NabidkyPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['nabidky'],
    queryFn: () => nabidkyApi.list({ limit: 100 }),
  });
  const nabidkyRaw = data?.data?.data || [];
  const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(n);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('cs-CZ') : '—';

  const sortN = useSort();
  const SORT_ACC_N = { nabidka: 'nazev', zakazka: 'zakazka_cislo', klient: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`, stav: 'stav', platnost: 'platnost_do', cena: r => parseFloat(r.cena_celkem)||0 };
  const nabidky = sortN.sortFn(nabidkyRaw, SORT_ACC_N);

  const [selN, setSelN] = useState(new Set());
  const toggleSelN = (id, e) => { e.stopPropagation(); setSelN(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; }); };
  const allCheckedN = nabidky.length > 0 && nabidky.every(r => selN.has(r.id));
  const exportSelNabCsv = () => {
    const cols = [['Název','nazev'],['Verze',r=>`v${r.verze}`],['Zakázka','zakazka_cislo'],['Stav',r=>STAV_LABELS_N[r.stav]||r.stav],['Cena',r=>r.cena_celkem!=null?Number(r.cena_celkem).toFixed(0):'—']];
    const rows = nabidky.filter(r => selN.has(r.id));
    const csv = [cols.map(c=>Array.isArray(c)?c[0]:c[0]), ...rows.map(r => cols.map(c => String(typeof c[1]==='function'?c[1](r):(r[c[1]]??''))))].map(r=>r.map(c=>`"${c.replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement('a'),{href:url,download:'vybrane-nabidky.csv'}); a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Nabídky" subtitle={`${nabidky.length} nabídek`}
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu
              data={nabidky}
              columns={[
                { header: 'Název',      accessor: 'nazev' },
                { header: 'Verze',      accessor: r => `v${r.verze}` },
                { header: 'Zakázka',    accessor: 'zakazka_cislo' },
                { header: 'Klient',     accessor: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`.trim() },
                { header: 'Stav',       accessor: r => STAV_LABELS_N[r.stav] || r.stav },
                { header: 'Platnost do',accessor: r => r.platnost_do ? new Date(r.platnost_do).toLocaleDateString('cs-CZ') : '—' },
                { header: 'Cena',       accessor: r => r.cena_celkem != null ? Number(r.cena_celkem).toFixed(0) : '—' },
              ]}
              filename="nabidky"
            />
            <Btn variant="primary" size="sm" onClick={() => navigate('/nabidky/nova')}><Plus size={12}/> Nová nabídka</Btn>
          </div>
        }/>
      <div className="p-6">
        {isLoading ? <div className="flex justify-center py-10"><Spinner/></div> :
         nabidky.length === 0 ? <EmptyState icon={FileText} title="Žádné nabídky" desc="Nabídky se vytvářejí z detailu zakázky."/> :
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-stone-50 border-b border-stone-100">
              <th className="pl-4 pr-2 py-3 w-8"><input type="checkbox" checked={allCheckedN} onChange={() => setSelN(allCheckedN ? new Set() : new Set(nabidky.map(r=>r.id)))} className="rounded cursor-pointer"/></th>
              {[['Nabídka','nabidka'],['Zakázka','zakazka'],['Klient','klient'],['Stav','stav'],['Platnost','platnost'],['Cena celkem','cena']].map(([l,k])=><SortTh key={k} label={l} sortKey={k} active={sortN.sortKey===k} dir={sortN.sortDir} onSort={sortN.toggle}/>)}
            </tr></thead>
            <tbody>{nabidky.map((n,i)=>(
              <tr key={n.id} onClick={() => navigate(`/nabidky/${n.id}/edit`)} className={`cursor-pointer hover:bg-stone-50 ${selN.has(n.id)?'bg-stone-50':''} ${i<nabidky.length-1?'border-b border-stone-50':''}`}>
                <td className="pl-4 pr-2 w-8" onClick={e=>toggleSelN(n.id,e)}><input type="checkbox" checked={selN.has(n.id)} onChange={()=>{}} className="rounded cursor-pointer"/></td>
                <td className="px-4 py-3"><div className="text-sm font-medium text-stone-800">{n.nazev}</div><div className="text-xs text-stone-400">v{n.verze}</div></td>
                <td className="px-4 py-3 text-sm text-stone-600">{n.zakazka_cislo}</td>
                <td className="px-4 py-3 text-sm text-stone-600">{n.klient_firma || `${n.klient_jmeno||''} ${n.klient_prijmeni||''}`}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAV_CLS[n.stav]||'bg-stone-100 text-stone-500'}`}>{STAV_LABELS_N[n.stav]||n.stav}</span></td>
                <td className="px-4 py-3 text-sm text-stone-500">{fmtD(n.platnost_do)}</td>
                <td className="px-4 py-3 text-sm font-medium text-stone-700">{fmt(n.cena_celkem)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </div>
      {selN.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-stone-900 text-white rounded-xl px-5 py-3 shadow-2xl z-30">
          <span className="text-sm font-medium">{selN.size} vybráno</span>
          <button onClick={exportSelNabCsv} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors">Export CSV</button>
          <button onClick={() => setSelN(new Set())} className="text-xs text-stone-400 hover:text-white ml-1 transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}

export default NabidkyPage;
