// ── KalendarPage.jsx ─────────────────────────────────────────
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { kalendarApi } from '../api';
import { PageHeader, TypBadge, StavBadge, formatDatum } from '../components/ui';

export function KalendarPage() {
  const navigate = useNavigate();
  const now  = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const od  = new Date(year, month, 1).toISOString().slice(0,10);
  const doo = new Date(year, month+1, 0).toISOString().slice(0,10);

  const { data } = useQuery({
    queryKey: ['kalendar', od, doo],
    queryFn: () => kalendarApi.list({ od, doo }),
  });
  const events = data?.data?.data || [];

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const offset = (firstDay + 6) % 7; // Monday start
  const days = [];
  for (let i = 0; i < offset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const eventsForDay = (d) => {
    if (!d) return [];
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return events.filter(e => e.datum_akce === ds);
  };

  const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  const DAYS   = ['Po','Út','St','Čt','Pá','So','Ne'];

  const TYP_COLOR = { svatba:'bg-blue-200',soukroma_akce:'bg-orange-200',firemni_akce:'bg-green-200',zavoz:'bg-purple-200',bistro:'bg-stone-200' };

  return (
    <div>
      <PageHeader
        title="Kalendář"
        subtitle={`${MONTHS[month]} ${year}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }}
              className="px-2 py-1.5 text-sm border border-stone-200 rounded-md hover:bg-stone-50">←</button>
            <button onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); }}
              className="px-3 py-1.5 text-xs border border-stone-200 rounded-md hover:bg-stone-50">Dnes</button>
            <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }}
              className="px-2 py-1.5 text-sm border border-stone-200 rounded-md hover:bg-stone-50">→</button>
          </div>
        }
      />
      <div className="p-6">
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-stone-100">
            {DAYS.map(d => <div key={d} className="py-2 text-center text-xs font-medium text-stone-500">{d}</div>)}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const evs = eventsForDay(d);
              const isToday = d && year===now.getFullYear() && month===now.getMonth() && d===now.getDate();
              return (
                <div key={i} className={`min-h-[90px] p-2 border-b border-r border-stone-50 ${!d?'bg-stone-50/50':''}`}>
                  {d && (
                    <>
                      <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday?'bg-stone-900 text-white':'text-stone-600'}`}>{d}</div>
                      {evs.map(e => (
                        <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                          className={`text-xs px-1.5 py-0.5 rounded mb-0.5 cursor-pointer truncate ${TYP_COLOR[e.typ]||'bg-stone-200'} text-stone-700 hover:opacity-80`}
                          title={e.nazev}>
                          {e.cas_zacatek ? e.cas_zacatek.slice(0,5)+' ' : ''}{e.nazev}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming list */}
        {events.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-stone-700 mb-3">Akce v {MONTHS[month].toLowerCase()}</h3>
            <div className="space-y-2">
              {events.sort((a,b) => a.datum_akce.localeCompare(b.datum_akce)).map(e => (
                <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                  className="flex items-center gap-3 bg-white rounded-lg border border-stone-200 px-4 py-3 cursor-pointer hover:bg-stone-50">
                  <div className="text-sm font-medium text-stone-800 w-24 flex-shrink-0">{formatDatum(e.datum_akce)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-800 truncate">{e.nazev}</div>
                    <div className="text-xs text-stone-400">{e.misto || '—'} · {e.pocet_hostu ? e.pocet_hostu+' hostů' : ''}</div>
                  </div>
                  <TypBadge typ={e.typ}/>
                  <StavBadge stav={e.stav}/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PersonalPage.jsx ──────────────────────────────────────────
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { personalApi } from '../api';
import { EmptyState, Btn, Modal, Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, UserCheck } from 'lucide-react';

const ROLE_LABELS = { koordinator:'Koordinátor', cisnik:'Číšník / servírka', kuchar:'Kuchař', ridic:'Řidič', barman:'Barman', pomocna_sila:'Pomocná síla' };

export function PersonalPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState({ jmeno:'', prijmeni:'', typ:'interni', role:'cisnik', email:'', telefon:'', specializace:'' });

  const { data, isLoading } = useQuery({
    queryKey: ['personal'],
    queryFn: () => personalApi.list(),
  });

  const createMut = useMutation({
    mutationFn: (d) => personalApi.create({ ...d, specializace: d.specializace.split(',').map(s=>s.trim()).filter(Boolean) }),
    onSuccess: () => { qc.invalidateQueries(['personal']); toast.success('Osoba přidána'); setModal(false); },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const personal = data?.data?.data || [];
  const interni  = personal.filter(p => p.typ === 'interni');
  const externi  = personal.filter(p => p.typ === 'externi');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const Card = ({ p }) => (
    <div className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-xs font-medium text-stone-600 flex-shrink-0">
          {p.jmeno[0]}{p.prijmeni[0]}
        </div>
        <div>
          <div className="text-sm font-medium text-stone-800">{p.jmeno} {p.prijmeni}</div>
          <div className="text-xs text-stone-500">{ROLE_LABELS[p.role] || p.role}</div>
        </div>
      </div>
      {p.telefon && <div className="text-xs text-stone-500 mb-1">📞 {p.telefon}</div>}
      {p.email   && <div className="text-xs text-stone-500 mb-1">✉ {p.email}</div>}
      {p.specializace?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {p.specializace.map(s => <span key={s} className="text-xs bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-full">{s}</span>)}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Personál" subtitle={`${personal.length} osob`}
        actions={<Btn variant="primary" size="sm" onClick={() => setModal(true)}><Plus size={12}/> Přidat osobu</Btn>}/>
      <div className="p-6 space-y-6">
        {isLoading ? <div className="flex justify-center py-10"><Spinner/></div> : <>
          {interni.length > 0 && <>
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Interní personál ({interni.length})</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{interni.map(p=><Card key={p.id} p={p}/>)}</div>
          </>}
          {externi.length > 0 && <>
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Externí personál ({externi.length})</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{externi.map(p=><Card key={p.id} p={p}/>)}</div>
          </>}
          {personal.length === 0 && <EmptyState icon={UserCheck} title="Žádný personál"/>}
        </>}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Přidat osobu"
        footer={<><Btn onClick={() => setModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={() => createMut.mutate(form)} disabled={!form.jmeno||!form.prijmeni||createMut.isPending}>{createMut.isPending?'Ukládám…':'Přidat'}</Btn></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Jméno</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.jmeno} onChange={e=>set('jmeno',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Příjmení</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.prijmeni} onChange={e=>set('prijmeni',e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Typ</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.typ} onChange={e=>set('typ',e.target.value)}><option value="interni">Interní</option><option value="externi">Externí</option></select></div>
            <div><label className="text-xs text-stone-500 block mb-1">Role</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.role} onChange={e=>set('role',e.target.value)}>{Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">E-mail</label><input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.email} onChange={e=>set('email',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Telefon</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.telefon} onChange={e=>set('telefon',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Specializace (čárkou oddělené)</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Servírování, Fine dining" value={form.specializace} onChange={e=>set('specializace',e.target.value)}/></div>
        </div>
      </Modal>
    </div>
  );
}

// ── DokumentyPage.jsx ─────────────────────────────────────────
import { dokumentyApi } from '../api';
import { FolderOpen } from 'lucide-react';

const KAT_LABELS = { nabidka:'Nabídka', kalkulace:'Kalkulace', smlouva:'Smlouva', poptavka:'Poptávka', podklady:'Podklady', foto:'Foto', interni:'Interní' };

export function DokumentyPage() {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['dokumenty'],
    queryFn: () => dokumentyApi.list(),
  });
  const docs = data?.data?.data || [];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('soubor', file);
    fd.append('kategorie', 'interni');
    try {
      await dokumentyApi.upload(fd);
      qc.invalidateQueries(['dokumenty']);
      toast.success('Soubor nahrán');
    } catch { toast.error('Chyba při nahrávání'); }
    setUploading(false);
  };

  const deleteMut = useMutation({
    mutationFn: dokumentyApi.delete,
    onSuccess: () => { qc.invalidateQueries(['dokumenty']); toast.success('Dokument smazán'); },
  });

  const formatSize = (b) => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)} MB` : `${Math.round(b/1024)} KB`;
  const formatDatum = (d) => new Date(d).toLocaleDateString('cs-CZ');

  return (
    <div>
      <PageHeader title="Dokumenty a přílohy" subtitle={`${docs.length} souborů`}
        actions={
          <label className="inline-flex items-center gap-1.5 bg-stone-900 text-white text-xs font-medium px-3 py-2 rounded-md hover:bg-stone-800 cursor-pointer transition-colors">
            <Plus size={12}/> {uploading ? 'Nahrávám…' : 'Nahrát soubor'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading}/>
          </label>
        }/>
      <div className="p-6">
        {isLoading ? <div className="flex justify-center py-10"><Spinner/></div> :
         docs.length === 0 ? <EmptyState icon={FolderOpen} title="Žádné dokumenty" desc="Nahrajte první soubor tlačítkem nahoře."/> :
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-stone-50 border-b border-stone-100">
              {['Název','Kategorie','Velikost','Nahráno','Akce'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-stone-500">{h}</th>)}
            </tr></thead>
            <tbody>{docs.map((d,i)=>(
              <tr key={d.id} className={`${i<docs.length-1?'border-b border-stone-50':''} hover:bg-stone-50`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500 uppercase">{d.filename.split('.').pop()}</div>
                    <div className="text-sm font-medium text-stone-800">{d.nazev}</div>
                  </div>
                </td>
                <td className="px-4 py-3"><span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{KAT_LABELS[d.kategorie]||d.kategorie}</span></td>
                <td className="px-4 py-3 text-xs text-stone-500">{d.velikost ? formatSize(d.velikost) : '—'}</td>
                <td className="px-4 py-3 text-xs text-stone-500">{formatDatum(d.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <a href={`/uploads/${d.filename}`} target="_blank" rel="noreferrer" className="text-xs text-stone-500 hover:text-stone-800">Stáhnout</a>
                    <button onClick={() => deleteMut.mutate(d.id)} className="text-xs text-red-500 hover:text-red-700">Smazat</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}

// ── CenikPage.jsx ─────────────────────────────────────────────
import { cenikApi } from '../api';
import { Tag } from 'lucide-react';

const KAT_CENIK = { jidlo:'Jídlo', napoje:'Nápoje', personal:'Personál', doprava:'Doprava', vybaveni:'Vybavení', pronajem:'Pronájem', externi:'Externí' };

export function CenikPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [katFilter, setKatFilter] = useState('');
  const [editRow, setEditRow] = useState(null);
  const [cenaEdit, setCenaEdit] = useState('');
  const [form, setForm] = useState({ nazev:'', kategorie:'jidlo', jednotka:'os.', cena_nakup:0, cena_prodej:0, dph_sazba:12 });

  const { data, isLoading } = useQuery({
    queryKey: ['cenik', katFilter],
    queryFn: () => cenikApi.list({ kategorie: katFilter||undefined, aktivni: 'true' }),
  });

  const createMut = useMutation({
    mutationFn: cenikApi.create,
    onSuccess: () => { qc.invalidateQueries(['cenik']); toast.success('Položka přidána'); setModal(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => cenikApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['cenik']); setEditRow(null); toast.success('Cena aktualizována'); },
  });

  const items = data?.data?.data || [];
  const grouped = items.reduce((acc, item) => { (acc[item.kategorie] = acc[item.kategorie]||[]).push(item); return acc; }, {});
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const marze = (n,p) => p>0 ? Math.round((p-n)/p*100) : 0;
  const marze_color = (m) => m >= 40 ? 'text-green-700' : m >= 25 ? 'text-amber-700' : 'text-red-600';

  return (
    <div>
      <PageHeader title="Ceníky a číselníky" subtitle={`${items.length} aktivních položek`}
        actions={<Btn variant="primary" size="sm" onClick={() => setModal(true)}><Plus size={12}/> Nová položka</Btn>}/>
      <div className="bg-stone-50 border-b border-stone-100 px-6 py-3 flex gap-2 flex-wrap">
        <button onClick={() => setKatFilter('')} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!katFilter?'bg-stone-900 text-white border-stone-900':'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}>Vše</button>
        {Object.entries(KAT_CENIK).map(([k,l]) => (
          <button key={k} onClick={() => setKatFilter(k)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${katFilter===k?'bg-stone-900 text-white border-stone-900':'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}>{l}</button>
        ))}
      </div>
      <div className="p-6 space-y-6">
        {isLoading ? <div className="flex justify-center py-10"><Spinner/></div> :
         items.length === 0 ? <EmptyState icon={Tag} title="Žádné položky ceníku"/> :
         Object.entries(grouped).map(([kat, polozky]) => (
           <div key={kat} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
             <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
               <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">{KAT_CENIK[kat]} ({polozky.length})</span>
             </div>
             <table className="w-full">
               <thead><tr className="border-b border-stone-50">
                 {['Název','Jedn.','Nákup','Prodej','DPH','Marže',''].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}
               </tr></thead>
               <tbody>{polozky.map((p,i)=>(
                 <tr key={p.id} className={`${i<polozky.length-1?'border-b border-stone-50':''} hover:bg-stone-50`}>
                   <td className="px-4 py-2.5 text-sm text-stone-800">{p.nazev}</td>
                   <td className="px-4 py-2.5 text-xs text-stone-500">{p.jednotka}</td>
                   <td className="px-4 py-2.5 text-sm text-stone-600">{Number(p.cena_nakup).toLocaleString('cs-CZ')} Kč</td>
                   <td className="px-4 py-2.5 text-sm font-medium text-stone-800">
                     {editRow === p.id ? (
                       <div className="flex items-center gap-1">
                         <input type="number" className="w-20 border border-stone-300 rounded px-2 py-1 text-xs focus:outline-none"
                           value={cenaEdit} onChange={e=>setCenaEdit(e.target.value)}
                           onKeyDown={e=>{ if(e.key==='Enter') updateMut.mutate({id:p.id,cena_prodej:parseFloat(cenaEdit)}); if(e.key==='Escape') setEditRow(null); }}
                           autoFocus/>
                         <button onClick={() => updateMut.mutate({id:p.id,cena_prodej:parseFloat(cenaEdit)})} className="text-green-700 text-xs font-medium">✓</button>
                       </div>
                     ) : (
                       <span onClick={() => {setEditRow(p.id);setCenaEdit(p.cena_prodej);}} className="cursor-pointer hover:underline">
                         {Number(p.cena_prodej).toLocaleString('cs-CZ')} Kč
                       </span>
                     )}
                   </td>
                   <td className="px-4 py-2.5 text-xs text-stone-500">{p.dph_sazba} %</td>
                   <td className={`px-4 py-2.5 text-sm font-medium ${marze_color(marze(p.cena_nakup, p.cena_prodej))}`}>
                     {marze(p.cena_nakup, p.cena_prodej)} %
                   </td>
                   <td className="px-4 py-2.5">
                     <button onClick={() => cenikApi.delete(p.id).then(()=>qc.invalidateQueries(['cenik']))} className="text-xs text-stone-400 hover:text-red-600">Skrýt</button>
                   </td>
                 </tr>
               ))}</tbody>
             </table>
           </div>
         ))}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Nová položka ceníku"
        footer={<><Btn onClick={()=>setModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={()=>createMut.mutate(form)} disabled={!form.nazev||createMut.isPending}>{createMut.isPending?'Ukládám…':'Přidat'}</Btn></>}>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Název *</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.nazev} onChange={e=>set('nazev',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Kategorie</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.kategorie} onChange={e=>set('kategorie',e.target.value)}>{Object.entries(KAT_CENIK).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.jednotka} onChange={e=>set('jednotka',e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Nákupní cena</label><input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.cena_nakup} onChange={e=>set('cena_nakup',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Prodejní cena</label><input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.cena_prodej} onChange={e=>set('cena_prodej',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">DPH %</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.dph_sazba} onChange={e=>set('dph_sazba',e.target.value)}><option value={12}>12 %</option><option value={21}>21 %</option><option value={0}>0 %</option></select></div>
          </div>
          {form.cena_prodej > 0 && <div className="text-xs text-stone-500">Marže: <span className={`font-medium ${marze_color(marze(form.cena_nakup, form.cena_prodej))}`}>{marze(form.cena_nakup, form.cena_prodej)} %</span></div>}
        </div>
      </Modal>
    </div>
  );
}

// ── NabidkyPage.jsx ───────────────────────────────────────────
import { nabidkyApi, zakazkyApi } from '../api';
import { FileText, ArrowLeft, Trash2, PlusCircle } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';

const STAV_LABELS_N = { koncept:'Koncept', odeslano:'Odesláno', prijato:'Přijato', zamitnuto:'Zamítnuto', expirovano:'Expirováno' };
const STAV_CLS = { koncept:'bg-amber-50 text-amber-700', odeslano:'bg-purple-50 text-purple-700', prijato:'bg-green-50 text-green-700', zamitnuto:'bg-red-50 text-red-600', expirovano:'bg-stone-100 text-stone-500' };

export function NabidkyPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['nabidky'],
    queryFn: () => nabidkyApi.list({ limit: 100 }),
  });
  const nabidky = data?.data?.data || [];
  const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(n);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('cs-CZ') : '—';

  return (
    <div>
      <PageHeader title="Nabídky" subtitle={`${nabidky.length} nabídek`}
        actions={<Btn variant="primary" size="sm" onClick={() => navigate('/nabidky/nova')}><Plus size={12}/> Nová nabídka</Btn>}/>
      <div className="p-6">
        {isLoading ? <div className="flex justify-center py-10"><Spinner/></div> :
         nabidky.length === 0 ? <EmptyState icon={FileText} title="Žádné nabídky" desc="Nabídky se vytvářejí z detailu zakázky."/> :
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-stone-50 border-b border-stone-100">
              {['Nabídka','Zakázka','Klient','Stav','Platnost','Cena celkem'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-stone-500">{h}</th>)}
            </tr></thead>
            <tbody>{nabidky.map((n,i)=>(
              <tr key={n.id} onClick={() => navigate(`/nabidky/${n.id}/edit`)} className={`cursor-pointer hover:bg-stone-50 ${i<nabidky.length-1?'border-b border-stone-50':''}`}>
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
    </div>
  );
}

// ── NabidkaEditor.jsx ─────────────────────────────────────────
export function NabidkaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: nabData, isLoading } = useQuery({
    queryKey: ['nabidka', id],
    queryFn: () => nabidkyApi.get(id),
    enabled: !!id && id !== 'nova',
  });
  const n = nabData?.data;
  const fmt = (v) => v == null ? '—' : new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(v);

  if (isLoading) return <div className="flex justify-center py-20"><Spinner/></div>;

  return (
    <div>
      <PageHeader title={n?.nazev || 'Nabídka'} subtitle={`v${n?.verze || 1} · ${n?.stav || ''}`}
        actions={<button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft size={13}/> Zpět</button>}/>
      <div className="p-6 max-w-3xl">
        {n && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <h3 className="text-sm font-semibold text-stone-700 mb-3">Přehled nabídky</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><div className="text-xs text-stone-400">Cena bez DPH</div><div className="font-semibold text-stone-800">{fmt(n.cena_bez_dph)}</div></div>
                <div><div className="text-xs text-stone-400">DPH</div><div className="font-semibold text-stone-800">{fmt(n.dph)}</div></div>
                <div><div className="text-xs text-stone-400">Celkem s DPH</div><div className="font-semibold text-lg text-stone-900">{fmt(n.cena_celkem)}</div></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-stone-100"><span className="text-sm font-semibold text-stone-700">Položky nabídky</span></div>
              <table className="w-full">
                <thead><tr className="bg-stone-50 border-b border-stone-100">{['Název','Mn.','Jedn.','Cena/jedn.','Celkem'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}</tr></thead>
                <tbody>{(n.polozky||[]).map((p,i)=>(
                  <tr key={p.id} className={`${i<n.polozky.length-1?'border-b border-stone-50':''}`}>
                    <td className="px-4 py-2.5 text-sm text-stone-800">{p.nazev}</td>
                    <td className="px-4 py-2.5 text-sm text-stone-600">{p.mnozstvi}</td>
                    <td className="px-4 py-2.5 text-sm text-stone-500">{p.jednotka}</td>
                    <td className="px-4 py-2.5 text-sm text-stone-700">{Number(p.cena_jednotka).toLocaleString('cs-CZ')} Kč</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-stone-800">{Number(p.cena_celkem).toLocaleString('cs-CZ')} Kč</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex gap-2">
              {['odeslano','prijato','zamitnuto'].map(s => (
                <Btn key={s} onClick={() => nabidkyApi.setStav(n.id,{stav:s}).then(()=>{ qc.invalidateQueries(['nabidka',id]); toast.success('Stav aktualizován'); })}>
                  → {STAV_LABELS_N[s]}
                </Btn>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── NovaNabidka.jsx ───────────────────────────────────────────
export function NovaNabidka() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    zakazka_id: searchParams.get('zakazka_id') || '',
    nazev: '',
    uvodni_text: '',
    zaverecny_text: '',
    platnost_do: '',
    sleva_procent: 0,
  });
  const [polozky, setPolozky] = useState([]);
  const [cenikFilter, setCenikFilter] = useState('');

  const { data: zakazkyData } = useQuery({
    queryKey: ['zakazky-select'],
    queryFn: () => zakazkyApi.list({ limit: 200 }),
  });
  const { data: cenikData } = useQuery({
    queryKey: ['cenik-all'],
    queryFn: () => cenikApi.list({ aktivni: 'true' }),
  });

  const zakazky = zakazkyData?.data?.data || [];
  const cenik   = cenikData?.data?.data || [];

  const totalBezDph = polozky.reduce((s, p) => s + (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0), 0);
  const sleva       = totalBezDph * ((parseFloat(form.sleva_procent) || 0) / 100);
  const dph         = (totalBezDph - sleva) * 0.12;
  const celkem      = totalBezDph - sleva + dph;
  const fmt = (n) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addFromCenik = (item) => {
    setPolozky(ps => [...ps, { kategorie: item.kategorie, nazev: item.nazev, jednotka: item.jednotka, mnozstvi: 1, cena_jednotka: parseFloat(item.cena_prodej) }]);
    setCenikFilter('');
  };
  const addBlank = () => setPolozky(ps => [...ps, { kategorie: 'jidlo', nazev: '', jednotka: 'os.', mnozstvi: 1, cena_jednotka: 0 }]);
  const updatePolozka = (i, k, v) => setPolozky(ps => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removePolozka = (i) => setPolozky(ps => ps.filter((_, idx) => idx !== i));

  const createMut = useMutation({
    mutationFn: (data) => nabidkyApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries(['nabidky']);
      toast.success('Nabídka vytvořena');
      navigate(`/nabidky/${res.data.id}/edit`);
    },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const handleSubmit = () => {
    if (!form.zakazka_id || !form.nazev) return toast.error('Vyplňte zakázku a název');
    if (polozky.length === 0) return toast.error('Přidejte alespoň jednu položku');
    createMut.mutate({ ...form, polozky });
  };

  const filteredCenik = cenikFilter
    ? cenik.filter(c => c.nazev.toLowerCase().includes(cenikFilter.toLowerCase()))
    : cenik;

  return (
    <div>
      <PageHeader title="Nová nabídka"
        actions={<button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft size={13}/> Zpět</button>}/>
      <div className="p-6 max-w-4xl space-y-5">

        {/* Základní informace */}
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">Základní informace</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Zakázka *</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={form.zakazka_id} onChange={e => set('zakazka_id', e.target.value)}>
                <option value="">— vyberte zakázku —</option>
                {zakazky.map(z => <option key={z.id} value={z.id}>{z.cislo} · {z.nazev}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Název nabídky *</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                placeholder="např. Nabídka svatební hostiny 2026"
                value={form.nazev} onChange={e => set('nazev', e.target.value)}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1">Platnost do</label>
                <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={form.platnost_do} onChange={e => set('platnost_do', e.target.value)}/>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Sleva %</label>
                <input type="number" min="0" max="100" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={form.sleva_procent} onChange={e => set('sleva_procent', e.target.value)}/>
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Úvodní text</label>
              <textarea rows={3} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                placeholder="Oslovení a úvod nabídky…"
                value={form.uvodni_text} onChange={e => set('uvodni_text', e.target.value)}/>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Závěrečný text</label>
              <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                placeholder="Poděkování, podmínky, kontakt…"
                value={form.zaverecny_text} onChange={e => set('zaverecny_text', e.target.value)}/>
            </div>
          </div>
        </div>

        {/* Položky */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-700">Položky nabídky</span>
            <button onClick={addBlank} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
              <PlusCircle size={13}/> Vlastní položka
            </button>
          </div>
          <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
            <input className="w-full border border-stone-200 rounded-md px-3 py-1.5 text-xs focus:outline-none bg-white"
              placeholder="Hledat v ceníku a přidat…"
              value={cenikFilter} onChange={e => setCenikFilter(e.target.value)}/>
            {cenikFilter && filteredCenik.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-stone-200 bg-white divide-y divide-stone-50">
                {filteredCenik.slice(0, 10).map(c => (
                  <button key={c.id} onClick={() => addFromCenik(c)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center justify-between">
                    <span className="text-stone-700">{c.nazev} <span className="text-stone-400">({c.jednotka})</span></span>
                    <span className="text-stone-500 font-medium">{Number(c.cena_prodej).toLocaleString('cs-CZ')} Kč</span>
                  </button>
                ))}
              </div>
            )}
            {cenikFilter && filteredCenik.length === 0 && (
              <div className="mt-2 text-xs text-stone-400 py-2 text-center">Žádná položka nebyla nalezena</div>
            )}
          </div>
          {polozky.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-stone-400">
              Vyhledejte položku v ceníku nebo klikněte na „Vlastní položka".
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  {['Název','Množství','Jednotka','Cena/jedn.','Celkem',''].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {polozky.map((p, i) => (
                  <tr key={i} className={i < polozky.length - 1 ? 'border-b border-stone-50' : ''}>
                    <td className="px-3 py-2">
                      <input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.nazev} onChange={e => updatePolozka(i, 'nazev', e.target.value)} placeholder="Název…"/>
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input type="number" min="0" step="0.1" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.mnozstvi} onChange={e => updatePolozka(i, 'mnozstvi', e.target.value)}/>
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.jednotka} onChange={e => updatePolozka(i, 'jednotka', e.target.value)}/>
                    </td>
                    <td className="px-3 py-2 w-32">
                      <input type="number" min="0" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.cena_jednotka} onChange={e => updatePolozka(i, 'cena_jednotka', e.target.value)}/>
                    </td>
                    <td className="px-3 py-2 w-32 text-xs font-medium text-stone-700">
                      {((parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0)).toLocaleString('cs-CZ')} Kč
                    </td>
                    <td className="px-3 py-2 w-8">
                      <button onClick={() => removePolozka(i)} className="text-stone-300 hover:text-red-500"><Trash2 size={13}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Přehled cen */}
        {polozky.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="flex justify-end">
              <div className="space-y-1.5 text-sm min-w-[260px]">
                <div className="flex justify-between text-stone-600">
                  <span>Cena bez DPH</span><span>{fmt(totalBezDph)}</span>
                </div>
                {parseFloat(form.sleva_procent) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Sleva {form.sleva_procent} %</span><span>− {fmt(sleva)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-600">
                  <span>DPH 12 %</span><span>{fmt(dph)}</span>
                </div>
                <div className="flex justify-between font-semibold text-stone-900 text-base border-t border-stone-100 pt-2 mt-2">
                  <span>Celkem s DPH</span><span>{fmt(celkem)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Akce */}
        <div className="flex justify-end gap-2">
          <Btn onClick={() => navigate(-1)}>Zrušit</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={!form.zakazka_id || !form.nazev || createMut.isPending}>
            {createMut.isPending ? 'Ukládám…' : 'Vytvořit nabídku'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── NastaveniPage.jsx ─────────────────────────────────────────
import { nastaveniApi, uzivateleApi } from '../api';
import { Settings } from 'lucide-react';

export function NastaveniPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('firma');
  const [form, setForm] = useState({});
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ jmeno:'', prijmeni:'', email:'', heslo:'', role:'obchodnik', telefon:'' });

  const { data: nastavData } = useQuery({ queryKey:['nastaveni'], queryFn: nastaveniApi.get });
  const { data: uzivData }   = useQuery({ queryKey:['uzivatele'], queryFn: uzivateleApi.list, enabled: tab==='uziv' });

  useState(() => { if (nastavData?.data) setForm(nastavData.data); }, [nastavData]);

  const saveMut  = useMutation({ mutationFn: nastaveniApi.update, onSuccess: () => toast.success('Nastavení uloženo') });
  const userMut  = useMutation({ mutationFn: uzivateleApi.create, onSuccess: () => { qc.invalidateQueries(['uzivatele']); toast.success('Uživatel přidán'); setUserModal(false); } });
  const toggleMut = useMutation({ mutationFn: ({id,aktivni}) => uzivateleApi.update(id,{aktivni}), onSuccess: () => qc.invalidateQueries(['uzivatele']) });

  const TABS = [['firma','Profil firmy'],['uziv','Uživatelé'],['notif','Notifikace']];
  const uzivatele = uzivData?.data?.data || [];
  const setU = (k,v) => setUserForm(f=>({...f,[k]:v}));
  const ROLES = {admin:'Administrátor', obchodnik:'Obchodník / koordinátor', provoz:'Provoz / realizace'};

  return (
    <div>
      <PageHeader title="Nastavení"/>
      <div className="bg-white border-b border-stone-100 px-6 flex">
        {TABS.map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-3 text-sm border-b-2 transition-colors ${tab===k?'border-stone-900 text-stone-900 font-medium':'border-transparent text-stone-500 hover:text-stone-700'}`}>{l}</button>
        ))}
      </div>
      <div className="p-6 max-w-2xl">
        {tab === 'firma' && nastavData && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              {[['firma_nazev','Název firmy'],['firma_ico','IČO'],['firma_dic','DIČ'],['firma_adresa','Adresa'],['firma_email','E-mail'],['firma_telefon','Telefon'],['firma_web','Web'],['firma_iban','Bankovní účet (IBAN)']].map(([k,l])=>(
                <div key={k}><label className="text-xs text-stone-500 block mb-1">{l}</label>
                  <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    defaultValue={nastavData?.data?.[k]||''} onChange={e => setForm(f=>({...f,[k]:e.target.value}))}/>
                </div>
              ))}
              <div className="flex justify-end">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit změny'}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {tab === 'uziv' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Btn variant="primary" size="sm" onClick={() => setUserModal(true)}><Plus size={12}/> Nový uživatel</Btn>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-50">
              {uzivatele.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">{u.jmeno[0]}{u.prijmeni[0]}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-800">{u.jmeno} {u.prijmeni}</div>
                    <div className="text-xs text-stone-400">{u.email} · {ROLES[u.role]||u.role}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.aktivni?'bg-green-50 text-green-700':'bg-stone-100 text-stone-400'}`}>{u.aktivni?'Aktivní':'Neaktivní'}</span>
                  <button onClick={() => toggleMut.mutate({id:u.id,aktivni:!u.aktivni})} className="text-xs text-stone-400 hover:text-stone-700">{u.aktivni?'Deaktivovat':'Aktivovat'}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'notif' && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <p className="text-sm text-stone-500">Nastavení notifikací bude dostupné po propojení s e-mailovým systémem.</p>
          </div>
        )}
      </div>

      <Modal open={userModal} onClose={() => setUserModal(false)} title="Nový uživatel"
        footer={<><Btn onClick={() => setUserModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={() => userMut.mutate(userForm)} disabled={!userForm.jmeno||!userForm.email||userMut.isPending}>{userMut.isPending?'Ukládám…':'Přidat'}</Btn></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Jméno</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.jmeno} onChange={e=>setU('jmeno',e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Příjmení</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.prijmeni} onChange={e=>setU('prijmeni',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">E-mail</label><input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.email} onChange={e=>setU('email',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Role</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.role} onChange={e=>setU('role',e.target.value)}>{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="text-xs text-stone-500 block mb-1">Telefon</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={userForm.telefon} onChange={e=>setU('telefon',e.target.value)}/></div>
          </div>
          <div><label className="text-xs text-stone-500 block mb-1">Heslo (výchozí)</label><input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="min. 8 znaků" value={userForm.heslo} onChange={e=>setU('heslo',e.target.value)}/></div>
        </div>
      </Modal>
    </div>
  );
}
