import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { personalApi } from '../api';
import { PageHeader, EmptyState, Btn, Modal, Spinner, ExportMenu, useSort, SortTh } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, UserCheck, Pencil, Trash2 as Trash2Personal, Archive as ArchivePersonal } from 'lucide-react';

const ROLE_LABELS = { koordinator:'Koordinátor', cisnik:'Číšník / servírka', kuchar:'Kuchař', ridic:'Řidič', barman:'Barman', pomocna_sila:'Pomocná síla' };

const PERSONAL_EXPORT_COLS = [
  { header: 'Jméno',       accessor: 'jmeno' },
  { header: 'Příjmení',    accessor: 'prijmeni' },
  { header: 'Typ',         accessor: r => r.typ === 'interni' ? 'Interní' : 'Externí' },
  { header: 'Role',        accessor: r => ROLE_LABELS[r.role] || r.role },
  { header: 'E-mail',      accessor: 'email' },
  { header: 'Telefon',     accessor: 'telefon' },
  { header: 'Specializace',accessor: r => (r.specializace || []).join(', ') },
];

const EMPTY_PERSON = { jmeno:'', prijmeni:'', typ:'interni', role:'cisnik', email:'', telefon:'', specializace:'' };

export function PersonalPage() {
  const qc = useQueryClient();
  const [modal, setModal]       = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editPerson, setEditPerson] = useState(null);
  const [form, setForm]         = useState(EMPTY_PERSON);
  const [editForm, setEditForm] = useState(EMPTY_PERSON);
  const [filterRole, setFilterRole] = useState('');
  const [filterTyp, setFilterTyp] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['personal'],
    queryFn: () => personalApi.list(),
  });

  const specsToArr = (s) => typeof s === 'string' ? s.split(',').map(x => x.trim()).filter(Boolean) : (s || []);

  const createMut = useMutation({
    mutationFn: (d) => personalApi.create({ ...d, specializace: specsToArr(d.specializace) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['personal'] }); toast.success('Osoba přidána'); setModal(false); setForm(EMPTY_PERSON); },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => personalApi.update(d.id, { ...d, specializace: specsToArr(d.specializace) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['personal'] }); toast.success('Uloženo'); setEditModal(false); setEditPerson(null); },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => personalApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['personal'] }); toast.success('Osoba smazána'); },
    onError: () => toast.error('Chybu při mazání'),
  });

  const archivPersonalMut = useMutation({
    mutationFn: (id) => personalApi.archivovat(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['personal'] }); toast.success('Osoba archivována'); },
    onError: () => toast.error('Nepodařilo se archivovat'),
  });

  const personalAll = data?.data?.data || [];
  const personal = personalAll.filter(p => {
    if (filterRole && p.role !== filterRole) return false;
    if (filterTyp && p.typ !== filterTyp) return false;
    return true;
  });
  const interni  = personal.filter(p => p.typ === 'interni');
  const externi  = personal.filter(p => p.typ === 'externi');

  const openEdit = (p) => {
    setEditPerson(p);
    setEditForm({ ...p, specializace: (p.specializace || []).join(', ') });
    setEditModal(true);
  };

  const handleDelete = (p) => {
    if (window.confirm(`Opravdu smazat ${p.jmeno} ${p.prijmeni}?`)) {
      deleteMut.mutate(p.id);
    }
  };

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  const [selP, setSelP] = useState(new Set());
  const toggleSelP = (id) => setSelP(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const exportSelPersCsv = () => {
    const rows = personal.filter(r => selP.has(r.id));
    const cols = PERSONAL_EXPORT_COLS;
    const getCell = (r, acc) => typeof acc === 'function' ? acc(r) : (r[acc] ?? '');
    const csv = [cols.map(c=>c.header), ...rows.map(r => cols.map(c => String(getCell(r, c.accessor))))].map(r => r.map(c=>`"${c.replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement('a'),{href:url,download:'vybrani-personal.csv'}); a.click(); URL.revokeObjectURL(url);
  };
  const bulkDeletePersonal = () => {
    if (!window.confirm(`Smazat ${selP.size} osob?`)) return;
    Promise.all([...selP].map(id => personalApi.delete(id))).then(() => { qc.invalidateQueries({ queryKey: ['personal'] }); setSelP(new Set()); toast.success('Osoby smazány'); });
  };

  const PersonForm = ({ f, onChange, prefix = '' }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs text-stone-500 block mb-1">Jméno</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={f.jmeno} onChange={e=>onChange('jmeno',e.target.value)}/></div>
        <div><label className="text-xs text-stone-500 block mb-1">Příjmení</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={f.prijmeni} onChange={e=>onChange('prijmeni',e.target.value)}/></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs text-stone-500 block mb-1">Typ</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={f.typ} onChange={e=>onChange('typ',e.target.value)}><option value="interni">Interní</option><option value="externi">Externí</option></select></div>
        <div><label className="text-xs text-stone-500 block mb-1">Role</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={f.role} onChange={e=>onChange('role',e.target.value)}>{Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs text-stone-500 block mb-1">E-mail</label><input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={f.email} onChange={e=>onChange('email',e.target.value)}/></div>
        <div><label className="text-xs text-stone-500 block mb-1">Telefon</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={f.telefon} onChange={e=>onChange('telefon',e.target.value)}/></div>
      </div>
      <div><label className="text-xs text-stone-500 block mb-1">Specializace (čárkou oddělené)</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Servírování, Fine dining" value={f.specializace} onChange={e=>onChange('specializace',e.target.value)}/></div>
    </div>
  );

  const Card = ({ p }) => (
    <div className={`bg-white rounded-lg border p-4 relative group transition-colors ${selP.has(p.id) ? 'border-stone-400 bg-stone-50' : 'border-stone-200'}`}>
      {/* Checkbox */}
      <input type="checkbox" checked={selP.has(p.id)} onChange={() => toggleSelP(p.id)}
        className="absolute top-2.5 left-2.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"/>
      {/* Action buttons – shown on hover */}
      <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => openEdit(p)}
          className="p-1.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-700 transition-colors"
          title="Upravit">
          <Pencil size={12}/>
        </button>
        <button onClick={() => window.confirm(`Archivovat ${p.jmeno} ${p.prijmeni}?`) && archivPersonalMut.mutate(p.id)}
          className="p-1.5 rounded-md bg-stone-100 hover:bg-orange-100 text-stone-500 hover:text-orange-600 transition-colors"
          title="Archivovat">
          <ArchivePersonal size={12}/>
        </button>
        <button onClick={() => handleDelete(p)}
          className="p-1.5 rounded-md bg-stone-100 hover:bg-red-100 text-stone-500 hover:text-red-600 transition-colors"
          title="Smazat">
          <Trash2Personal size={12}/>
        </button>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-xs font-medium text-stone-600 flex-shrink-0">
          {p.jmeno?.[0]}{p.prijmeni?.[0]}
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
      <PageHeader title="Personál" subtitle={`${personal.length} osob${personalAll.length !== personal.length ? ` z ${personalAll.length}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu data={personal} columns={PERSONAL_EXPORT_COLS} filename="personal"/>
            <Btn variant="primary" size="sm" onClick={() => setModal(true)}><Plus size={12}/> Přidat osobu</Btn>
          </div>
        }/>
      <div className="p-6 space-y-6">
        {/* Filtry */}
        <div className="flex flex-wrap gap-3">
          <select className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" value={filterTyp} onChange={e => setFilterTyp(e.target.value)}>
            <option value="">Všechny typy</option>
            <option value="interni">Interní</option>
            <option value="externi">Externí</option>
          </select>
          <select className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
            <option value="">Všechny role</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(filterTyp || filterRole) && <button onClick={() => { setFilterTyp(''); setFilterRole(''); }} className="text-xs text-stone-400 hover:text-stone-600 underline">Zrušit filtry</button>}
        </div>
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

      {/* Modal – přidat */}
      <Modal open={modal} onClose={() => { setModal(false); setForm(EMPTY_PERSON); }} title="Přidat osobu"
        footer={<><Btn onClick={() => { setModal(false); setForm(EMPTY_PERSON); }}>Zrušit</Btn><Btn variant="primary" onClick={() => createMut.mutate(form)} disabled={!form.jmeno||!form.prijmeni||createMut.isPending}>{createMut.isPending?'Ukládám…':'Přidat'}</Btn></>}>
        <PersonForm f={form} onChange={set}/>
      </Modal>

      {/* Modal – editovat */}
      <Modal open={editModal} onClose={() => { setEditModal(false); setEditPerson(null); }} title={editPerson ? `Upravit – ${editPerson.jmeno} ${editPerson.prijmeni}` : ''}
        footer={<><Btn onClick={() => { setEditModal(false); setEditPerson(null); }}>Zrušit</Btn><Btn variant="primary" onClick={() => updateMut.mutate({ id: editPerson.id, ...editForm })} disabled={!editForm.jmeno||!editForm.prijmeni||updateMut.isPending}>{updateMut.isPending?'Ukládám…':'Uložit'}</Btn></>}>
        <PersonForm f={editForm} onChange={setE}/>
      </Modal>

      {selP.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-stone-900 text-white rounded-xl px-5 py-3 shadow-2xl z-30">
          <span className="text-sm font-medium">{selP.size} vybráno</span>
          <button onClick={exportSelPersCsv} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors">Export CSV</button>
          <button onClick={bulkDeletePersonal} className="text-xs bg-red-500/70 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors">Smazat</button>
          <button onClick={() => setSelP(new Set())} className="text-xs text-stone-400 hover:text-white ml-1 transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}

export default PersonalPage;
