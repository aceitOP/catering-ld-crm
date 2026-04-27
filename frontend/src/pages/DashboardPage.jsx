import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { zakazkyApi, kalendarApi, notifikaceApi, fakturyApi, klientiApi, followupApi, reportyApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { safeGetJson, safeSetItem } from '../utils/storage';

// ÄŚeskĂ˝ 5. pĂˇd (vokatĂ­v) pro pozdrav
function vocative(jmeno) {
  if (!jmeno) return '';
  const n = jmeno.trim();
  // Lookup pro nejÄŤastÄ›jĹˇĂ­ jmĂ©na
  const map = {
    // Ĺ˝eny
    'AdĂ©la':'AdĂ©lo','Jana':'Jano','Petra':'Petro','Martina':'Martino','Tereza':'Terezo',
    'Veronika':'Veroniko','MarkĂ©ta':'MarkĂ©to','Eva':'Evo','KateĹ™ina':'KateĹ™ino',
    'Anna':'Anno','Monika':'Moniko','Lenka':'Lenko','Michaela':'Michaelo',
    'Barbora':'Barbaro','Hana':'Hano','Jitka':'Jitko','Renata':'Renato',
    'Zuzana':'Zuzano','Ivana':'Ivano','Alena':'Aleno','Dana':'Dano',
    'Simona':'Simono','Andrea':'Andreo','KristĂ˝na':'KristĂ˝no','Nikola':'Nikolo',
    'KlĂˇra':'KlĂˇro','Gabriela':'Gabrielo','PavlĂ­na':'PavlĂ­no','EliĹˇka':'EliĹˇce',
    'KarolĂ­na':'KarolĂ­no','Lucie':'Lucie','Marie':'Marie','Julie':'Julie','Sofie':'Sofie',
    // MuĹľi
    'Martin':'Martine','Pavel':'Pavle','TomĂˇĹˇ':'TomĂˇĹˇi','Jan':'Jane','OndĹ™ej':'OndĹ™eji',
    'Jakub':'Jakube','Petr':'PetĹ™e','Filip':'Filipe','LukĂˇĹˇ':'LukĂˇĹˇi','David':'Davide',
    'JiĹ™Ă­':'JiĹ™Ă­','Michal':'Michale','Radek':'Radku','VladimĂ­r':'VladimĂ­re',
    'Roman':'Romane','Marek':'Marku','Karel':'Karle','Josef':'Josefe','VĂˇclav':'VĂˇclave',
    'ZdenÄ›k':'ZdeĹku','Miroslav':'Miroslave','Stanislav':'Stanislave','Ladislav':'Ladislave',
    'Jaroslav':'Jaroslave','FrantiĹˇek':'FrantiĹˇku','Libor':'Libore','VojtÄ›ch':'VojtÄ›chu',
    'Patrik':'Patriku','Daniel':'Danieli','MatÄ›j':'MatÄ›ji','Adam':'Adame',
    'Dominik':'Dominiku','Robert':'Roberte','Milan':'Milane','AleĹˇ':'AleĹˇi',
    'Radoslav':'Radoslave','MatyĂˇĹˇ':'MatyĂˇĹˇi',
  };
  if (map[n]) return map[n];
  // Fallback pravidla: jmĂ©no konÄŤĂ­ na 'a' nebo 'Ăˇ' â†’ -o
  if (/[aĂˇ]$/.test(n)) return n.slice(0, -1) + 'o';
  return n;
}
import { StavBadge, TypBadge, formatCena, Spinner } from '../components/ui';
import {
  Plus, ArrowRight, Bell, ClipboardList, TrendingUp, Calendar, Users, Inbox,
  DollarSign, Receipt, AlertTriangle, FileText, GripVertical, CheckCircle2,
  Clock, Banknote, LayoutDashboard, Star, RefreshCw, ListChecks,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// â”€â”€ Timeline helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const timeToMin  = (t) => { if (!t) return null; const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); };
const MIN_START  = 6 * 60;
const MIN_RANGE  = 18 * 60;
const HOUR_MARKS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
const TYP_CHIP   = {
  svatba:        'bg-blue-100 text-blue-700',
  soukroma_akce: 'bg-orange-100 text-orange-700',
  firemni_akce:  'bg-emerald-100 text-emerald-700',
  zavoz:         'bg-violet-100 text-violet-700',
  bistro:        'bg-amber-100 text-amber-700',
  pohreb:        'bg-slate-100 text-slate-600',
  ostatni:       'bg-stone-100 text-stone-500',
};
const TYP_DOT = {
  svatba: 'bg-blue-500', soukroma_akce: 'bg-orange-500',
  firemni_akce: 'bg-emerald-500', zavoz: 'bg-violet-500', bistro: 'bg-amber-500',
  pohreb: 'bg-slate-400', ostatni: 'bg-stone-400',
};

// â”€â”€ Widget definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const WIDGET_DEFS = {
  timeline:      { label: 'Timeline dne',           span: 'full' },
  upcoming:      { label: 'NadchĂˇzejĂ­cĂ­ akce',       span: 'wide' },
  pipeline:      { label: 'Pipeline zakĂˇzek',        span: 'narrow' },
  notifications: { label: 'Notifikace',              span: 'narrow' },
  faktury:       { label: 'Fakturace',               span: 'narrow' },
  poptavky:      { label: 'NovĂ© poptĂˇvky',           span: 'narrow' },
  pravidelni:    { label: 'PravidelnĂ­ klienti',      span: 'narrow' },
  followup:      { label: 'Follow-up Ăşkoly',         span: 'narrow' },
  'quick-actions':{ label: 'RychlĂ© akce',            span: 'narrow' },
};
const DEFAULT_ORDER = ['timeline', 'upcoming', 'pipeline', 'notifications', 'faktury', 'poptavky', 'pravidelni', 'followup', 'quick-actions'];

function loadOrder() {
  const arr = safeGetJson('dashboard-widget-order');
  if (Array.isArray(arr)) {
    const validIds = arr.filter((id) => DEFAULT_ORDER.includes(id));
    const missing = DEFAULT_ORDER.filter((id) => !validIds.includes(id));
    return [...validIds, ...missing];
  }
  return DEFAULT_ORDER;
}

// â”€â”€ Stat card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatCard({ icon: Icon, label, value, color = 'purple' }) {
  const colors = {
    purple: 'bg-brand-50 text-brand-600',
    amber:  'bg-amber-50 text-amber-600',
    green:  'bg-emerald-50 text-emerald-600',
    blue:   'bg-blue-50 text-blue-600',
    red:    'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-2xl shadow-card px-5 py-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${colors[color] || colors.purple}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs text-stone-400 font-medium">{label}</div>
        <div className="text-xl font-bold text-stone-800 leading-tight">{value}</div>
      </div>
    </div>
  );
}

// â”€â”€ Draggable widget wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Widget({ id, label, span, dragging, dragOver, onDragStart, onDragEnter, onDragEnd, editMode, children }) {
  const spanCls = span === 'full' ? 'col-span-3' : span === 'wide' ? 'col-span-2' : 'col-span-1';
  const isDragging = dragging === id;
  const isOver = dragOver === id;
  return (
    <div
      className={`${spanCls} transition-all duration-150 ${isDragging ? 'opacity-40 scale-[0.98]' : ''} ${isOver && !isDragging ? 'ring-2 ring-brand-400 ring-offset-2 rounded-2xl' : ''}`}
      draggable={editMode}
      onDragStart={() => onDragStart(id)}
      onDragEnter={() => onDragEnter(id)}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
    >
      {editMode && (
        <div className="flex items-center gap-1.5 mb-1.5 px-1">
          <GripVertical size={13} className="text-stone-400 cursor-grab" />
          <span className="text-[11px] text-stone-400 font-medium">{label}</span>
        </div>
      )}
      {children}
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, hasModule } = useAuth();
  const now      = new Date();
  const today    = now.toISOString().slice(0, 10);
  const in30days    = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const nowPct      = ((now.getHours() * 60 + now.getMinutes() - MIN_START) / MIN_RANGE) * 100;
  const hasKalendarModule = hasModule('kalendar');
  const hasFakturyModule = hasModule('faktury');
  const hasReportyModule = hasModule('reporty');

  // â”€â”€ Data â”€â”€
  const { data: zakazkyData, isLoading } = useQuery({
    queryKey: ['zakazky-dashboard'],
    queryFn:  () => zakazkyApi.list({ limit: 200 }),
  });
  const { data: kalData } = useQuery({
    queryKey: ['kalendar-dashboard'],
    queryFn:  () => kalendarApi.list({ od: today, doo: in30days }),
    enabled: hasKalendarModule,
  });
  const { data: notifData } = useQuery({
    queryKey:       ['notifikace'],
    queryFn:        () => notifikaceApi.list(),
    refetchInterval: 30_000,
  });
  const { data: fakturyData } = useQuery({
    queryKey: ['faktury-dashboard'],
    queryFn:  () => fakturyApi.list({}),
    enabled: hasFakturyModule,
  });
  const { data: pravidelniData } = useQuery({
    queryKey: ['pravidelni-klienti'],
    queryFn:  () => klientiApi.pravidelni(),
    retry: false,
  });
  const { data: followupData } = useQuery({
    queryKey: ['followup-dashboard'],
    queryFn:  () => followupApi.list({ splneno: 'false', limit: 10 }),
    refetchInterval: 60_000,
  });
  const { data: poptavkyData } = useQuery({
    queryKey: ['poptavky-dashboard'],
    queryFn:  () => zakazkyApi.list({ stav: 'nova_poptavka', limit: 4 }),
    refetchInterval: 60_000,
  });
  const { data: dashboardSummaryData } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn:  () => reportyApi.dashboardSummary(),
    refetchInterval: 60_000,
    enabled: hasReportyModule,
  });
  const qcDash = useQueryClient();
  const followupDoneMut = useMutation({
    mutationFn: (id) => followupApi.update(id, { splneno: true }),
    onSuccess:  () => { qcDash.invalidateQueries({ queryKey: ['followup-dashboard'] }); },
  });

  const zakazky       = zakazkyData?.data?.data || [];
  const upcoming      = (kalData?.data?.data || []).filter(e => (e.datum_akce||'').slice(0,10) >= today);
  const notifications = notifData?.data?.data || [];
  const unreadNotifs  = notifData?.data?.unread || 0;
  const allFaktury        = fakturyData?.data?.data || [];
  const pravidelniKlienti = (pravidelniData?.data?.data || []).filter(k => Math.abs(k.dni_do_pristi) <= 90);
  const followupUkoly     = followupData?.data?.data || [];

  // â”€â”€ Stats â”€â”€
  const novePoptavky   = hasReportyModule ? Number(dashboardSummaryData?.data?.nove_poptavky ?? 0) : Number(poptavkyData?.data?.meta?.total ?? 0);
  const cekaNaAkci     = hasReportyModule ? Number(dashboardSummaryData?.data?.ceka_na_akci ?? 0) : 'â€”';
  const potvrzenoLetos = hasReportyModule ? Number(dashboardSummaryData?.data?.potvrzeno_letos ?? 0) : 'â€”';
  const obratMesic     = hasReportyModule ? Number(dashboardSummaryData?.data?.obrat_mesic ?? 0) : null;

  // â”€â”€ Faktury stats â”€â”€
  const dnes = new Date();
  const fakturyNezaplacene = allFaktury.filter(f => ['vystavena','odeslana'].includes(f.stav));
  const fakturyPosplatnosti = fakturyNezaplacene.filter(f => new Date(f.datum_splatnosti) < dnes);
  const totalNezaplaceno = fakturyNezaplacene.reduce((s,f) => s + parseFloat(f.cena_celkem||0), 0);
  const urgentItems = [
    fakturyPosplatnosti.length > 0 ? {
      key: 'faktury-po-splatnosti',
      label: `${fakturyPosplatnosti.length} faktur po splatnosti`,
      action: () => navigate('/faktury'),
    } : null,
    followupUkoly.length > 0 ? {
      key: 'followup-ukoly',
      label: `${followupUkoly.length} otevĹ™enĂ˝ch follow-up ĂşkolĹŻ`,
      action: () => navigate('/zakazky'),
    } : null,
    unreadNotifs > 0 ? {
      key: 'notifikace',
      label: `${unreadNotifs} nepĹ™eÄŤtenĂ˝ch notifikacĂ­`,
      action: () => navigate('/dashboard'),
    } : null,
    novePoptavky > 0 ? {
      key: 'poptavky',
      label: `${novePoptavky} novĂ˝ch poptĂˇvek`,
      action: () => navigate('/poptavky'),
    } : null,
  ].filter(Boolean);

  // â”€â”€ Pipeline â”€â”€
  const PIPELINE = [
    { stav: 'nova_poptavka',      label: 'NovĂˇ poptĂˇvka',      color: 'bg-stone-400' },
    { stav: 'rozpracovano',       label: 'RozpracovĂˇno',       color: 'bg-blue-400' },
    { stav: 'nabidka_pripravena', label: 'NabĂ­dka pĹ™ipravena', color: 'bg-amber-400' },
    { stav: 'nabidka_odeslana',   label: 'NabĂ­dka odeslĂˇna',   color: 'bg-orange-400' },
    { stav: 'ceka_na_vyjadreni',  label: 'ÄŚekĂˇ na vyjĂˇdĹ™enĂ­',  color: 'bg-violet-400' },
    { stav: 'potvrzeno',          label: 'Potvrzeno',          color: 'bg-emerald-400' },
  ];
  const pipelineCounts = PIPELINE.map(p => ({ ...p, count: zakazky.filter(z => z.stav === p.stav).length }));
  const maxPipeline    = Math.max(...pipelineCounts.map(p => p.count), 1);

  // â”€â”€ Mini timeline â”€â”€
  const nearestDate = upcoming[0]?.datum_akce?.slice(0,10) ?? null;
  const nearestEvts = nearestDate
    ? [...upcoming.filter(e => (e.datum_akce||'').slice(0,10) === nearestDate)]
        .sort((a, b) => (timeToMin(a.cas_zacatek) ?? 0) - (timeToMin(b.cas_zacatek) ?? 0))
    : [];
  const nearestD  = nearestDate ? new Date(nearestDate + 'T00:00:00') : null;
  const isTodayTl = nearestDate === today;

  // â”€â”€ PoptĂˇvky widget â”€â”€
  const novePoptavkyList = poptavkyData?.data?.data || [];

  // â”€â”€ DnD state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [widgetOrder,     setWidgetOrder]     = useState(loadOrder);
  const [editMode,        setEditMode]        = useState(false);
  const [savedOrderSnap,  setSavedOrderSnap]  = useState(null);
  const [dragging,        setDragging]        = useState(null);
  const [dragOver,        setDragOver]        = useState(null);

  const handleDragStart = (id) => setDragging(id);
  const handleDragEnter = (id) => setDragOver(id);
  const handleDragEnd   = () => {
    if (dragging && dragOver && dragging !== dragOver) {
      setWidgetOrder(prev => {
        const next = [...prev];
        const from = next.indexOf(dragging);
        const to   = next.indexOf(dragOver);
        next.splice(from, 1);
        next.splice(to, 0, dragging);
        return next;
      });
    }
    setDragging(null);
    setDragOver(null);
  };

  const wrapperProps = (id) => ({
    id, label: WIDGET_DEFS[id]?.label, span: WIDGET_DEFS[id]?.span,
    dragging, dragOver, onDragStart: handleDragStart,
    onDragEnter: handleDragEnter, onDragEnd: handleDragEnd, editMode,
  });

  // â”€â”€ Widget renderers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderWidget = (id) => {
    switch (id) {

      case 'timeline': return hasKalendarModule && (nearestDate && nearestEvts.length > 0) ? (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden overflow-x-auto">
            <div style={{ minWidth: '600px' }}>
              <div className="flex items-center justify-between px-6 py-4">
                <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
                    <Calendar size={15} className="text-brand-600" />
                  </div>
                  {isTodayTl ? 'Dnes' : nearestD.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {isTodayTl && (
                    <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-1 rounded-lg">
                      {nearestD.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-400 font-medium">{nearestEvts.length} {nearestEvts.length === 1 ? 'akce' : 'akcĂ­'}</span>
                  <button onClick={() => navigate('/kalendar')}
                    className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                    Detail <ArrowRight size={12} />
                  </button>
                </div>
              </div>
              <div className="flex bg-surface/50 border-y border-stone-100">
                <div className="w-48 flex-shrink-0 border-r border-stone-100 px-5 py-2">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Akce</span>
                </div>
                <div className="flex-1 relative" style={{ height: '30px' }}>
                  {HOUR_MARKS.map(h => (
                    <div key={h} style={{ left: `${((h * 60 - MIN_START) / MIN_RANGE) * 100}%` }}
                      className="absolute top-0 h-full border-l border-stone-200/70">
                      <span className="text-xs text-stone-400 pl-1.5 pt-1.5 inline-block leading-none font-medium">{h}:00</span>
                    </div>
                  ))}
                </div>
              </div>
              {nearestEvts.map(e => {
                const sMin = timeToMin(e.cas_zacatek), eMin = timeToMin(e.cas_konec);
                const hasTimes = sMin !== null && eMin !== null && eMin > sMin;
                const barS = hasTimes ? Math.max(sMin, MIN_START) : MIN_START;
                const barE = hasTimes ? Math.min(eMin, MIN_START + MIN_RANGE) : MIN_START + MIN_RANGE;
                const leftPct = ((barS - MIN_START) / MIN_RANGE) * 100;
                const widthPct = Math.max(((barE - barS) / MIN_RANGE) * 100, 0.8);
                return (
                  <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                    className="flex items-center min-h-[48px] border-b border-stone-50 last:border-b-0 hover:bg-surface/50 cursor-pointer group">
                    <div className="w-48 flex-shrink-0 border-r border-stone-100 px-5 py-2.5">
                      <div className="text-xs font-semibold text-stone-800 truncate">{e.nazev}</div>
                      <div className="mt-1"><StavBadge stav={e.stav} /></div>
                    </div>
                    <div className="flex-1 relative" style={{ height: '48px' }}>
                      {HOUR_MARKS.map(h => (
                        <div key={h} style={{ left: `${((h * 60 - MIN_START) / MIN_RANGE) * 100}%` }}
                          className="absolute top-0 h-full border-l border-stone-100/70 pointer-events-none" />
                      ))}
                      {isTodayTl && nowPct >= 0 && nowPct <= 100 && (
                        <div style={{ left: `${nowPct}%` }} className="absolute top-0 h-full border-l-2 border-red-400/70 z-10 pointer-events-none" />
                      )}
                      <div style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        title={`${e.nazev}${hasTimes ? ` Â· ${e.cas_zacatek?.slice(0,5)}â€“${e.cas_konec?.slice(0,5)}` : ''}`}
                        className={`absolute top-1/2 -translate-y-1/2 rounded-lg flex items-center px-2.5 overflow-hidden transition-all group-hover:opacity-85
                          ${hasTimes ? 'h-8 shadow-sm' : 'h-2 opacity-40 rounded-full'}
                          ${TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700'}`}>
                        {hasTimes && (
                          <>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-2 ${TYP_DOT[e.typ] || 'bg-stone-400'}`} />
                            <span className="text-xs font-semibold truncate whitespace-nowrap">
                              {e.cas_zacatek?.slice(0,5)}â€“{e.cas_konec?.slice(0,5)}&nbsp;Â·&nbsp;{e.nazev}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Widget>
      ) : null;

      case 'upcoming': return (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card h-full">
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Calendar size={15} className="text-blue-600" />
                </div>
                NadchĂˇzejĂ­cĂ­ akce
                <span className="text-xs text-stone-400 font-medium">(30 dnĂ­)</span>
              </span>
              <button onClick={() => navigate('/kalendar')}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                KalendĂˇĹ™ <ArrowRight size={12} />
              </button>
            </div>
            <div className="divide-y divide-stone-50">
              {upcoming.slice(0, 8).map(e => {
                const d = new Date((e.datum_akce||'').slice(0,10) + 'T00:00:00');
                const isToday = (e.datum_akce||'').slice(0,10) === today;
                return (
                  <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                    className={`flex gap-4 px-6 py-3.5 hover:bg-surface/50 cursor-pointer transition-colors ${isToday ? 'bg-brand-50/30' : ''}`}>
                    <div className={`rounded-xl px-3 py-2 text-center min-w-[48px] flex-shrink-0 ${isToday ? 'bg-brand-600 shadow-sm shadow-brand-600/30' : 'bg-surface'}`}>
                      <div className={`text-sm font-bold leading-none ${isToday ? 'text-white' : 'text-stone-800'}`}>{d.getDate()}</div>
                      <div className={`text-xs uppercase mt-0.5 font-semibold ${isToday ? 'text-brand-200' : 'text-stone-500'}`}>
                        {d.toLocaleString('cs-CZ', { month: 'short' })}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-stone-800 truncate">{e.nazev}</div>
                      <div className="text-xs text-stone-400 mt-0.5 truncate">
                        {e.misto || ''}{e.misto && e.pocet_hostu ? ' Â· ' : ''}{e.pocet_hostu ? `${e.pocet_hostu} hostĹŻ` : ''}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <TypBadge typ={e.typ} />
                      <StavBadge stav={e.stav} />
                    </div>
                  </div>
                );
              })}
              {!upcoming.length && (
                <div className="py-12 text-center text-sm text-stone-400 font-medium">Ĺ˝ĂˇdnĂ© nadchĂˇzejĂ­cĂ­ akce</div>
              )}
            </div>
          </div>
        </Widget>
      );

      case 'pipeline': return !isLoading && zakazky.length > 0 ? (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card px-6 py-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <TrendingUp size={15} className="text-emerald-600" />
                </div>
                Pipeline zakĂˇzek
              </span>
              <button onClick={() => navigate('/zakazky')}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                VĹˇechny <ArrowRight size={12} />
              </button>
            </div>
            <div className="space-y-3">
              {pipelineCounts.filter(p => p.count > 0).map(p => (
                <div key={p.stav} className="flex items-center gap-3">
                  <div className="text-xs text-stone-500 w-40 truncate flex-shrink-0 font-medium">{p.label}</div>
                  <div className="flex-1 bg-surface rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full transition-all ${p.color}`} style={{ width: `${(p.count / maxPipeline) * 100}%` }} />
                  </div>
                  <div className="text-xs font-bold text-stone-700 w-6 text-right">{p.count}</div>
                </div>
              ))}
              {pipelineCounts.every(p => p.count === 0) && (
                <div className="text-center text-sm text-stone-400 py-4">Ĺ˝ĂˇdnĂ© aktivnĂ­ zakĂˇzky</div>
              )}
            </div>
          </div>
        </Widget>
      ) : null;

      case 'notifications': return (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card">
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Bell size={15} className="text-orange-500" />
                </div>
                Notifikace
                {unreadNotifs > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5 leading-none">
                    {unreadNotifs > 99 ? '99+' : unreadNotifs}
                  </span>
                )}
              </span>
            </div>
            <div className="divide-y divide-stone-50">
              {notifications.slice(0, 5).map(n => (
                <div key={n.id}
                  className={`px-5 py-3 ${!n.procitana ? 'bg-brand-50/30' : ''} transition-colors`}>
                  <div className="flex items-start gap-2.5 min-w-0">
                    {!n.procitana && <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />}
                    <div className={`min-w-0 overflow-hidden ${!n.procitana ? '' : 'ml-4'}`}>
                      <div className="text-xs font-semibold text-stone-800 line-clamp-2">{n.titulek}</div>
                      {n.zprava && <div className="text-xs text-stone-400 mt-0.5 truncate">{n.zprava}</div>}
                    </div>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="py-10 text-center text-xs text-stone-400 font-medium">Ĺ˝ĂˇdnĂ© notifikace</div>
              )}
            </div>
          </div>
        </Widget>
      );

      case 'faktury': return hasFakturyModule ? (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Receipt size={15} className="text-violet-600" />
                </div>
                Fakturace
              </span>
              <button onClick={() => navigate('/faktury')}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                PĹ™ehled <ArrowRight size={12} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-blue-500" />
                  <span className="text-xs font-medium text-stone-600">Nezaplaceno</span>
                </div>
                <span className="text-sm font-bold text-stone-800">{formatCena(totalNezaplaceno)}</span>
              </div>
              {fakturyPosplatnosti.length > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-500" />
                    <span className="text-xs font-medium text-red-700">Po splatnosti</span>
                  </div>
                  <span className="text-sm font-bold text-red-700">{fakturyPosplatnosti.length}Ă—</span>
                </div>
              )}
              {fakturyNezaplacene.length === 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-700">VĹˇe zaplaceno</span>
                </div>
              )}
              <button onClick={() => navigate('/faktury/nova')}
                className="w-full text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center justify-center gap-1.5 py-2 border border-dashed border-brand-200 rounded-xl hover:border-brand-400 transition-colors">
                <Plus size={12} /> NovĂˇ faktura
              </button>
            </div>
          </div>
        </Widget>
      ) : null;

      case 'poptavky': return (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Inbox size={15} className="text-amber-600" />
                </div>
                NovĂ© poptĂˇvky
                {novePoptavky > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5 leading-none">{novePoptavky}</span>
                )}
              </span>
              <button onClick={() => navigate('/poptavky')}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                VĹˇe <ArrowRight size={12} />
              </button>
            </div>
            {novePoptavkyList.length > 0 ? (
              <div className="space-y-2">
                {novePoptavkyList.map(z => (
                  <div key={z.id} onClick={() => navigate(`/zakazky/${z.id}`)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface cursor-pointer transition-colors group">
                    <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-stone-800 truncate">{z.nazev}</div>
                      <div className="text-[11px] text-stone-400 truncate">
                        {z.klient_firma || [z.klient_jmeno, z.klient_prijmeni].filter(Boolean).join(' ') || 'â€”'}
                      </div>
                    </div>
                    <ArrowRight size={12} className="text-stone-300 group-hover:text-brand-600 transition-colors flex-shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-stone-400">
                <Inbox size={24} className="mx-auto mb-2 text-stone-200" />
                Ĺ˝ĂˇdnĂ© novĂ© poptĂˇvky
              </div>
            )}
          </div>
        </Widget>
      );

      case 'followup': return (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                  <ListChecks size={15} className="text-blue-600" />
                </div>
                Follow-up Ăşkoly
                {followupUkoly.length > 0 && (
                  <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5 leading-none">{followupUkoly.length}</span>
                )}
              </span>
            </div>
            {followupUkoly.length > 0 ? (
              <div className="space-y-1.5">
                {followupUkoly.slice(0, 6).map(u => {
                  const isOverdue = u.termin && new Date(u.termin) < new Date();
                  return (
                    <div key={u.id} className="flex items-start gap-2.5 px-2 py-2 rounded-xl hover:bg-surface group">
                      <button
                        onClick={() => followupDoneMut.mutate(u.id)}
                        className="mt-0.5 w-4 h-4 rounded border border-stone-300 hover:border-blue-500 hover:bg-blue-50 flex-shrink-0 transition-colors"
                        title="OznaÄŤit jako splnÄ›no"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          onClick={() => navigate(`/zakazky/${u.zakazka_id}`)}
                          className="text-xs font-medium text-stone-700 truncate cursor-pointer hover:text-brand-600 transition-colors"
                        >{u.titulek}</div>
                        <div className="text-[11px] text-stone-400 truncate mt-0.5">
                          {u.zakazka_nazev}
                          {u.termin && (
                            <span className={`ml-1.5 font-semibold ${isOverdue ? 'text-red-500' : 'text-stone-500'}`}>
                              Â· {new Date(u.termin).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                              {isOverdue && ' âš '}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {followupUkoly.length > 6 && (
                  <div className="text-[11px] text-stone-400 text-center pt-1">â€¦a {followupUkoly.length - 6} dalĹˇĂ­ch</div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-stone-400">
                <ListChecks size={24} className="mx-auto mb-2 text-stone-200" />
                Ĺ˝ĂˇdnĂ© ÄŤekajĂ­cĂ­ Ăşkoly
              </div>
            )}
          </div>
        </Widget>
      );

      case 'quick-actions': return (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card px-5 py-5">
            <div className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-surface flex items-center justify-center">
                <LayoutDashboard size={15} className="text-stone-500" />
              </div>
              RychlĂ© akce
            </div>
            <div className="space-y-1">
              {[
                { icon: Plus,          label: 'NovĂˇ zakĂˇzka',    path: '/zakazky/nova',  color: 'bg-brand-50 text-brand-600' },
                { icon: FileText,      label: 'NovĂˇ nabĂ­dka',    path: '/nabidky/nova',  color: 'bg-blue-50 text-blue-600' },
                ...(hasFakturyModule ? [{ icon: Receipt, label: 'NovĂˇ faktura', path: '/faktury/nova', color: 'bg-violet-50 text-violet-600' }] : []),
                { icon: Users,         label: 'NovĂ˝ klient',     path: '/klienti',       color: 'bg-orange-50 text-orange-600', state: { openNew: true } },
                ...(hasKalendarModule ? [{ icon: Calendar, label: 'KalendĂˇĹ™', path: '/kalendar', color: 'bg-emerald-50 text-emerald-600' }] : []),
                { icon: ClipboardList, label: 'VĹˇechny zakĂˇzky', path: '/zakazky',       color: 'bg-stone-50 text-stone-600' },
              ].map(a => (
                <button key={a.path} onClick={() => navigate(a.path, a.state ? { state: a.state } : undefined)}
                  className="w-full flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl hover:bg-surface transition-all text-left group">
                  <div className={`w-7 h-7 rounded-xl ${a.color} flex items-center justify-center flex-shrink-0`}>
                    <a.icon size={13} />
                  </div>
                  <span className="text-stone-700 font-medium text-xs">{a.label}</span>
                  <ArrowRight size={12} className="ml-auto text-stone-300 group-hover:text-brand-600 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </Widget>
      );

      case 'pravidelni': return (
        <Widget key={id} {...wrapperProps(id)}>
          <div className="bg-white rounded-2xl shadow-card px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-stone-800 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-yellow-50 flex items-center justify-center">
                  <Star size={15} className="text-yellow-500" />
                </div>
                PravidelnĂ­ klienti
              </span>
              <button onClick={() => navigate('/klienti')}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                Klienti <ArrowRight size={12} />
              </button>
            </div>
            {pravidelniKlienti.length > 0 ? (
              <div className="space-y-2">
                {pravidelniKlienti.slice(0, 6).map(k => {
                  const dni = k.dni_do_pristi;
                  const urgency = dni < -30 ? 'overdue' : dni < 30 ? 'soon' : 'upcoming';
                  const dot = urgency === 'overdue' ? 'bg-red-400' : urgency === 'soon' ? 'bg-amber-400' : 'bg-emerald-400';
                  const label = urgency === 'overdue'
                    ? `${Math.abs(dni)} dnĂ­ po vĂ˝roÄŤĂ­`
                    : urgency === 'soon'
                    ? (dni <= 0 ? 'VĂ˝roÄŤĂ­ dnes!' : `Za ${dni} dnĂ­`)
                    : `Za ${dni} dnĂ­`;
                  const labelCls = urgency === 'overdue' ? 'text-red-600' : urgency === 'soon' ? 'text-amber-600' : 'text-emerald-600';
                  return (
                    <div key={k.id} onClick={() => navigate('/klienti')}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface cursor-pointer transition-colors group">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-stone-800 truncate">
                          {k.firma || `${k.jmeno} ${k.prijmeni || ''}`}
                        </div>
                        <div className="text-[11px] text-stone-400 truncate">
                          {k.pocet_akci}Ă— Â· poslednĂ­ {new Date(k.posledni_akce).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <span className={`text-[11px] font-semibold flex-shrink-0 ${labelCls}`}>{label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-stone-400">
                <RefreshCw size={24} className="mx-auto mb-2 text-stone-200" />
                ZatĂ­m ĹľĂˇdnĂ­ pravidelnĂ­ klienti
              </div>
            )}
          </div>
        </Widget>
      );

      default: return null;
    }
  };

  return (
    <div>
      {/* â”€â”€ Header â”€â”€ */}
      <div className="flex items-center justify-between px-8 py-5">
        <div>
          <h1 className="text-lg font-bold text-stone-900">
            {user?.jmeno ? `VĂ­tej, ${vocative(user.jmeno)}!` : 'Dashboard'}
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            {now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={() => { setWidgetOrder(savedOrderSnap); setEditMode(false); setDragging(null); setDragOver(null); }}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-500 hover:bg-surface transition-all"
            >
              Storno
            </button>
          )}
            <button
              onClick={() => {
                if (!editMode) setSavedOrderSnap([...widgetOrder]);
                else safeSetItem('dashboard-widget-order', JSON.stringify(widgetOrder));
                setEditMode(e => !e);
              }}
            className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-all ${
              editMode
                ? 'bg-brand-600 text-white border-brand-600 shadow-md shadow-brand-600/20'
                : 'bg-white border-stone-200 text-stone-600 hover:bg-surface'
            }`}
          >
            {editMode ? 'âś“ UloĹľit rozvrĹľenĂ­' : 'â ż Upravit rozvrĹľenĂ­'}
          </button>
          <button onClick={() => navigate('/zakazky/nova')}
            className="inline-flex items-center gap-2 bg-brand-600 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-brand-700 shadow-md shadow-brand-600/20 transition-all">
            <Plus size={13} /> NovĂˇ zakĂˇzka
          </button>
          <button onClick={() => navigate('/nabidky/nova')}
            className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-surface shadow-sm transition-all">
            <Plus size={13} /> NovĂˇ nabĂ­dka
          </button>
          <button onClick={() => navigate('/klienti', { state: { openNew: true } })}
            className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-surface shadow-sm transition-all">
            <Plus size={13} /> NovĂ˝ klient
          </button>
        </div>
      </div>

      <div className="px-8 pb-8 space-y-5">
        {/* â”€â”€ Stats row â”€â”€ */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size={24} /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Inbox}         label="NovĂ© poptĂˇvky"     value={novePoptavky}            color={novePoptavky > 0 ? 'amber' : 'purple'} />
            <StatCard icon={ClipboardList} label="ÄŚekĂˇ na akci"      value={cekaNaAkci}              color={cekaNaAkci > 0 ? 'amber' : 'blue'} />
            <StatCard icon={Users}         label="Potvrzeno letos"   value={potvrzenoLetos}          color="green" />
            <StatCard icon={DollarSign}    label="Obrat tento mÄ›sĂ­c" value={obratMesic == null ? 'â€”' : formatCena(obratMesic)}  color="blue" />
          </div>
        )}

        {urgentItems.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle size={16} />
              Co hoří dnes
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {urgentItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.action}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* â”€â”€ Edit mode hint â”€â”€ */}
        {editMode && (
          <div className="flex items-center gap-3 bg-brand-50 border border-brand-100 text-brand-700 text-xs font-medium px-4 py-3 rounded-xl">
            <GripVertical size={14} />
            PĹ™etĂˇhnÄ›te widgety myĹˇĂ­ pro zmÄ›nu poĹ™adĂ­. KliknÄ›te â€žUloĹľit rozvrĹľenĂ­" pro potvrzenĂ­ nebo â€žStorno" pro zruĹˇenĂ­ zmÄ›n.
          </div>
        )}

        {/* â”€â”€ Draggable 3-column widget grid â”€â”€ */}
        <div className="grid grid-cols-3 gap-5 items-start">
          {widgetOrder.map(id => renderWidget(id))}
        </div>
      </div>
    </div>
  );
}
