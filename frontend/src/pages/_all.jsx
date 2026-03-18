// ── KalendarPage.jsx ─────────────────────────────────────────
import { useState, useEffect } from 'react';
import { useQuery, useMutation as useMutationKal, useQueryClient as useQueryClientKal } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { kalendarApi, googleCalendarApi, kapacityApi } from '../api';
import { TypBadge, StavBadge, formatDatum, formatCena } from '../components/ui';
import { ChevronDown } from 'lucide-react';

export function KalendarPage() {
  const navigate = useNavigate();
  const qcKal    = useQueryClientKal();
  const now = new Date();
  const [year, setYear]         = useState(now.getFullYear());
  const [month, setMonth]       = useState(now.getMonth());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  const [view, setView]             = useState('mesic');
  const [collapsed, setCollapsed]   = useState(new Set());
  const [kapSelectedDay, setKapSelectedDay] = useState(null);
  const [kapLimitsOpen, setKapLimitsOpen]   = useState(false);

  const [tlStartISO, setTlStartISO] = useState(() => now.toISOString().slice(0, 10));
  const [tlView, setTlView]         = useState('tyden'); // 'den' | 'tyden'

  const getTlAlignedStart = (iso, tv) => {
    if (tv === 'den') return iso;
    const d = new Date(iso + 'T00:00:00');
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return d.toISOString().slice(0, 10);
  };
  const tlWinStart = getTlAlignedStart(tlStartISO, tlView);
  const getTlWinEnd = (startISO, tv) => {
    if (tv === 'den') return startISO;
    const d = new Date(startISO + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  };
  const tlWinEnd = getTlWinEnd(tlWinStart, tlView);

  const navigateTl = (dir) => {
    const d = new Date(tlWinStart + 'T00:00:00');
    if (tlView === 'den') d.setDate(d.getDate() + dir);
    else                  d.setDate(d.getDate() + dir * 7);
    setTlStartISO(d.toISOString().slice(0, 10));
  };
  const getTlLabel = () => {
    const s = new Date(tlWinStart + 'T00:00:00');
    const e = new Date(tlWinEnd + 'T00:00:00');
    if (tlView === 'den')
      return s.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return `${s.getDate()}. – ${e.getDate()}. ${s.toLocaleString('cs-CZ', { month: 'long' })} ${s.getFullYear()}`;
  };

  const od  = view === 'timeline'
    ? tlWinStart
    : new Date(year, month, 1).toISOString().slice(0, 10);
  const doo = view === 'timeline'
    ? tlWinEnd
    : new Date(year, month + 1, 0).toISOString().slice(0, 10);
  // kapacity view uses same od/doo as mesic (both based on year/month)

  const { data } = useQuery({
    queryKey: ['kalendar', od, doo],
    queryFn: () => kalendarApi.list({ od, doo }),
  });
  const events = data?.data?.data || [];

  const { data: gcData } = useQuery({
    queryKey: ['google-calendar-events', od, doo],
    queryFn: () => googleCalendarApi.events({ od, do: doo }),
    retry: false,
    select: (r) => r.data?.data || [],
  });
  const gcEvents = gcData || [];

  const { data: kapData } = useQuery({
    queryKey: ['kapacity', od, doo],
    queryFn: () => kapacityApi.list({ od, do: doo }),
    enabled: view === 'kapacity',
    select: (r) => r.data?.data || [],
  });
  const kapDays = kapData || [];

  const { data: nastavKapData } = useQuery({
    queryKey: ['nastaveni'],
    queryFn: nastaveniApi.get,
    enabled: view === 'kapacity',
    select: (r) => r.data,
  });
  const kapMaxAkci  = parseInt(nastavKapData?.kapacity_max_akci_den  || '0', 10) || 0;
  const kapMaxHoste = parseInt(nastavKapData?.kapacity_max_hoste_den || '0', 10) || 0;

  const kapSaveMut = useMutationKal({
    mutationFn: (d) => nastaveniApi.update(d),
    onSuccess: () => { qcKal.invalidateQueries({ queryKey: ['nastaveni'] }); setKapLimitsOpen(false); },
  });

  // Build calendar grid (always full weeks)
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset      = (firstDay + 6) % 7; // Monday start
  const totalCells  = Math.ceil((offset + daysInMonth) / 7) * 7;
  const days = [];
  for (let i = 0; i < offset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length < totalCells) days.push(null);

  const gcDateStr = (start) => start ? String(start).slice(0, 10) : null;
  const gcTimeStr = (dt) => dt && dt.includes('T') ? dt.slice(11, 16) : null;

  const eventsForDay = (d) => {
    if (!d) return [];
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return events.filter(e => (e.datum_akce || '').slice(0, 10) === ds);
  };
  const gcEventsForDay = (ds) => gcEvents.filter(e => gcDateStr(e.start) === ds);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // Kapacity helpers
  const kapDataForDay = (ds) => kapDays.find(d => (d.datum || '').slice(0, 10) === ds) || null;
  const kapColor = (akce, hoste) => {
    if (kapMaxAkci || kapMaxHoste) {
      // Limity nastaveny → barva podle % vytížení
      const akciLoad  = kapMaxAkci  ? akce  / kapMaxAkci  : 0;
      const hosteLoad = kapMaxHoste ? hoste / kapMaxHoste : 0;
      const load = Math.max(akciLoad, hosteLoad);
      if (load >= 0.85) return 'red';
      if (load >= 0.60) return 'amber';
      return 'green';
    }
    // Bez limitů → barva podle počtu akcí
    if (akce >= 3) return 'red';
    if (akce >= 2) return 'amber';
    return 'green';
  };
  const kapColorCls = {
    green: { bar: 'bg-green-500',  bg: 'bg-green-50/50',  badge: 'bg-green-50 text-green-700' },
    amber: { bar: 'bg-amber-500',  bg: 'bg-amber-50/60',  badge: 'bg-amber-50 text-amber-700' },
    red:   { bar: 'bg-red-500',    bg: 'bg-red-50/60',    badge: 'bg-red-50 text-red-700' },
  };
  const [kapLimitForm, setKapLimitForm] = useState({ kapacity_max_akci_den: '', kapacity_max_hoste_den: '' });

  const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  const DAYS   = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

  const TYP_CHIP = {
    svatba:        'bg-blue-50 text-blue-700 border border-blue-200',
    soukroma_akce: 'bg-orange-50 text-orange-700 border border-orange-200',
    firemni_akce:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
    zavoz:         'bg-violet-50 text-violet-700 border border-violet-200',
    bistro:        'bg-amber-50 text-amber-700 border border-amber-200',
  };
  const TYP_DOT = {
    svatba: 'bg-blue-500', soukroma_akce: 'bg-orange-500',
    firemni_akce: 'bg-emerald-500', zavoz: 'bg-violet-500', bistro: 'bg-amber-500',
    pohreb: 'bg-slate-400', ostatni: 'bg-stone-400',
  };

  // ── Timeline helpers ──────────────────────────────────────────
  const timeToMin = (t) => { if (!t) return null; const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); };
  const TL_MIN_START  = 6 * 60;   // 6:00 = 360 min
  const TL_MIN_RANGE  = 18 * 60;  // 6:00–24:00 = 1080 min
  const HOUR_MARKS    = [6, 8, 10, 12, 14, 16, 18, 20, 22];
  const CZ_DAYS_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const todayStr = now.toISOString().slice(0, 10);

  // ── Overlap layout algorithm for day view ──
  // Assigns column index + total columns for each event to avoid visual stacking
  const computeOverlapLayout = (timedEvents) => {
    if (!timedEvents.length) return new Map();
    const sorted = [...timedEvents].sort((a, b) =>
      (timeToMin(a.cas_zacatek) || 0) - (timeToMin(b.cas_zacatek) || 0)
    );
    // Group overlapping events into clusters
    const clusters = [];
    let current = [sorted[0]];
    let clusterEnd = timeToMin(sorted[0].cas_konec) || (timeToMin(sorted[0].cas_zacatek) || 0) + 60;
    for (let i = 1; i < sorted.length; i++) {
      const start = timeToMin(sorted[i].cas_zacatek) || 0;
      if (start < clusterEnd) {
        current.push(sorted[i]);
        clusterEnd = Math.max(clusterEnd, timeToMin(sorted[i].cas_konec) || start + 60);
      } else {
        clusters.push(current);
        current = [sorted[i]];
        clusterEnd = timeToMin(sorted[i].cas_konec) || start + 60;
      }
    }
    clusters.push(current);
    // Assign columns within each cluster
    const layout = new Map();
    for (const cluster of clusters) {
      const cols = []; // each col = endTime of last placed event
      for (const evt of cluster) {
        const s = timeToMin(evt.cas_zacatek) || 0;
        const e = timeToMin(evt.cas_konec) || s + 60;
        let col = cols.findIndex(end => end <= s);
        if (col === -1) { col = cols.length; cols.push(e); } else { cols[col] = e; }
        layout.set(evt, { col, total: 0 });
      }
      const total = cols.length;
      for (const evt of cluster) layout.get(evt).total = total;
    }
    return layout;
  };

  // Týden: horizontal bar view – all 7 days (Mon–Sun) always visible
  const nowPct = ((now.getHours() * 60 + now.getMinutes() - TL_MIN_START) / TL_MIN_RANGE) * 100;
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(tlWinStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const crmEvts = events.filter(e => (e.datum_akce || '').slice(0, 10) === iso)
      .sort((a, b) => (timeToMin(a.cas_zacatek) ?? 0) - (timeToMin(b.cas_zacatek) ?? 0));
    const gcEvts = gcEvents.filter(e => gcDateStr(e.start) === iso)
      .map(e => ({ ...e, _google: true, cas_zacatek: gcTimeStr(e.start), cas_konec: gcTimeStr(e.end) }))
      .sort((a, b) => (timeToMin(a.cas_zacatek) ?? 0) - (timeToMin(b.cas_zacatek) ?? 0));
    return { date: iso, d, evts: [...crmEvts, ...gcEvts] };
  });

  // Den: vertical day-planner view
  const SLOT_H    = 56;  // px per hour
  const DEN_HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23
  const nowTopDen = (now.getHours() * 60 + now.getMinutes() - TL_MIN_START) / 60 * SLOT_H;
  const denEventsForDay = events.filter(e => (e.datum_akce || '').slice(0, 10) === tlWinStart);
  const denAllDay = denEventsForDay.filter(e => {
    const s = timeToMin(e.cas_zacatek); const en = timeToMin(e.cas_konec);
    return s === null || en === null || en <= s;
  });
  const denTimed = denEventsForDay.filter(e => {
    const s = timeToMin(e.cas_zacatek); const en = timeToMin(e.cas_konec);
    return s !== null && en !== null && en > s;
  });
  // Google events for day view
  const gcDenEvts = gcEvents
    .filter(e => gcDateStr(e.start) === tlWinStart)
    .map(e => ({ ...e, _google: true, cas_zacatek: gcTimeStr(e.start), cas_konec: gcTimeStr(e.end) }));
  const gcDenAllDay = gcDenEvts.filter(e => !e.cas_zacatek || !e.cas_konec || timeToMin(e.cas_zacatek) === null);
  const gcDenTimed  = gcDenEvts.filter(e => e.cas_zacatek && e.cas_konec && timeToMin(e.cas_zacatek) !== null);

  // Compute overlap layouts for day view
  const allDenTimed = [...denTimed, ...gcDenTimed];
  const denLayout = computeOverlapLayout(allDenTimed);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
        <div className="flex items-center gap-4">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-stone-100 rounded-lg p-0.5">
            <button onClick={() => setView('mesic')}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${view === 'mesic' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}>
              Měsíc
            </button>
            <button onClick={() => setView('timeline')}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${view === 'timeline' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}>
              Timeline
            </button>
            <button onClick={() => setView('kapacity')}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${view === 'kapacity' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}>
              Kapacity
            </button>
          </div>

          {/* Month picker (month + kapacity views) */}
          {(view === 'mesic' || view === 'kapacity') && (
            <div className="relative">
              <button
                onClick={() => { setPickerYear(year); setPickerOpen(p => !p); }}
                className="flex items-center gap-1.5 text-xl font-semibold text-stone-800 hover:text-stone-600 transition-colors"
              >
                {MONTHS[month]} {year}
                <ChevronDown size={18} className={`transition-transform duration-200 ${pickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {pickerOpen && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-stone-200 rounded-xl shadow-xl z-20 p-4 w-72">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => setPickerYear(y => y - 1)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-600 text-sm">←</button>
                    <span className="font-semibold text-stone-700">{pickerYear}</span>
                    <button onClick={() => setPickerYear(y => y + 1)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-600 text-sm">→</button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {MONTHS.map((m, i) => (
                      <button key={i}
                        onClick={() => { setYear(pickerYear); setMonth(i); setPickerOpen(false); }}
                        className={`py-2 text-xs rounded-lg transition-colors ${i === month && pickerYear === year ? 'bg-stone-900 text-white font-semibold' : 'hover:bg-stone-100 text-stone-600'}`}>
                        {m.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline sub-view toggle + period label */}
          {view === 'timeline' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5 bg-stone-100 rounded-lg p-0.5">
                {[['den','Den'],['tyden','Týden']].map(([v, lbl]) => (
                  <button key={v} onClick={() => setTlView(v)}
                    className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${tlView === v ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500 hover:text-stone-700'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              <span className="text-sm font-semibold text-stone-700">{getTlLabel()}</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          {(view === 'mesic' || view === 'kapacity') ? (
            <>
              <button onClick={prevMonth} className="p-2 hover:bg-stone-100 rounded-lg text-stone-600 text-sm transition-colors">←</button>
              <button onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); }} className="px-3 py-1.5 text-xs border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors">Dnes</button>
              <button onClick={nextMonth} className="p-2 hover:bg-stone-100 rounded-lg text-stone-600 text-sm transition-colors">→</button>
            </>
          ) : (
            <>
              <button onClick={() => navigateTl(-1)} className="p-2 hover:bg-stone-100 rounded-lg text-stone-600 text-sm transition-colors">←</button>
              <button onClick={() => setTlStartISO(now.toISOString().slice(0, 10))} className="px-3 py-1.5 text-xs border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors">Dnes</button>
              <button onClick={() => navigateTl(1)} className="p-2 hover:bg-stone-100 rounded-lg text-stone-600 text-sm transition-colors">→</button>
            </>
          )}
        </div>
      </div>

      {/* ── MONTH VIEW ── */}
      {view === 'mesic' && (
        <div className="p-6">
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-stone-100">
              {DAYS.map((d, i) => (
                <div key={d} className={`py-3 text-center text-xs font-semibold uppercase tracking-wide ${i >= 5 ? 'text-stone-400' : 'text-stone-500'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-stone-100">
              {days.map((d, i) => {
                const evs       = eventsForDay(d);
                const ds        = d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
                const gcEvs     = ds ? gcEventsForDay(ds) : [];
                const isToday   = d && year === now.getFullYear() && month === now.getMonth() && d === now.getDate();
                const isWeekend = i % 7 >= 5;
                const hasEvents = evs.length > 0 || gcEvs.length > 0;
                return (
                  <div key={i} className={`min-h-[120px] p-1.5 relative transition-colors
                    ${!d ? 'bg-stone-50/50' : isToday ? 'bg-brand-50/40' : hasEvents ? 'bg-amber-50/30' : isWeekend ? 'bg-stone-50/40' : 'bg-white'}`}>
                    {/* Colored top bar for days with events */}
                    {d && hasEvents && (
                      <div className="absolute top-0 left-0 right-0 h-[3px] flex">
                        {evs.slice(0, 6).map((e, idx) => (
                          <div key={idx} className={`flex-1 ${TYP_DOT[e.typ] || 'bg-stone-400'}`} />
                        ))}
                        {gcEvs.length > 0 && <div className="flex-1 bg-blue-500" />}
                      </div>
                    )}
                    {d && (
                      <>
                        <div className="mb-1 px-0.5 flex items-center gap-1.5">
                          <span className={`text-xs font-bold inline-flex items-center justify-center w-7 h-7 rounded-full select-none
                            ${isToday ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30' : hasEvents ? 'bg-stone-800 text-white' : isWeekend ? 'text-stone-400' : 'text-stone-600'}`}>{d}</span>
                          {hasEvents && (
                            <span className="text-[10px] font-bold text-stone-400">{evs.length + gcEvs.length}</span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {evs.map(e => (
                            <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)} title={e.nazev}
                              className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer hover:opacity-75 transition-opacity ${TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700 border border-stone-200'}`}>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYP_DOT[e.typ] || 'bg-stone-400'}`} />
                              <span className="truncate font-medium">{e.cas_zacatek ? e.cas_zacatek.slice(0, 5) + ' ' : ''}{e.nazev}</span>
                            </div>
                          ))}
                          {gcEvs.map(e => (
                            <div key={'gc-' + e.id} title={e.summary}
                              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-500" />
                              <span className="truncate font-medium">{gcTimeStr(e.start) ? gcTimeStr(e.start) + ' ' : ''}{e.summary}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {events.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-stone-700 mb-3">Akce v {MONTHS[month].toLowerCase()}</h3>
              <div className="space-y-2">
                {[...events].sort((a, b) => a.datum_akce.localeCompare(b.datum_akce)).map(e => (
                  <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                    className="flex items-center gap-3 bg-white rounded-lg border border-stone-200 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors">
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${TYP_DOT[e.typ] || 'bg-stone-400'}`} />
                    <div className="text-sm font-medium text-stone-500 w-24 flex-shrink-0">{formatDatum(e.datum_akce)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-stone-800 truncate">{e.nazev}</div>
                      <div className="text-xs text-stone-400">{e.misto || '—'} · {e.pocet_hostu ? e.pocet_hostu + ' hostů' : ''}</div>
                    </div>
                    <TypBadge typ={e.typ} />
                    <StavBadge stav={e.stav} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DEN VIEW — vertical day planner ── */}
      {view === 'timeline' && tlView === 'den' && (
        <div className="p-6">
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            {/* All-day strip */}
            {(denAllDay.length > 0 || gcDenAllDay.length > 0) && (
              <div className="flex border-b border-stone-200 bg-stone-50/60">
                <div className="w-16 flex-shrink-0 border-r border-stone-100 px-3 py-2.5 flex items-center justify-end">
                  <span className="text-xs text-stone-400 leading-tight text-right">celý<br/>den</span>
                </div>
                <div className="flex-1 px-3 py-2 flex flex-wrap gap-1.5">
                  {denAllDay.map(e => (
                    <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded cursor-pointer hover:opacity-75 transition-opacity ${TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700 border border-stone-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TYP_DOT[e.typ] || 'bg-stone-400'}`} />
                      {e.nazev}
                    </div>
                  ))}
                  {gcDenAllDay.map(e => (
                    <div key={'gc-' + e.id}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-500" />
                      {e.summary}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Time grid */}
            <div className="flex overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              {/* Hour labels */}
              <div className="w-16 flex-shrink-0 border-r border-stone-100 select-none bg-stone-50/30">
                {DEN_HOURS.map(h => (
                  <div key={h} style={{ height: `${SLOT_H}px` }}
                    className="border-b border-stone-50 flex items-start px-3 pt-1.5">
                    <span className="text-xs text-stone-400 leading-none">{h}:00</span>
                  </div>
                ))}
              </div>

              {/* Events area */}
              <div className="flex-1 relative">
                {/* Grid lines */}
                {DEN_HOURS.map((h, i) => (
                  <div key={h} style={{ height: `${SLOT_H}px` }}
                    className={`border-b ${i % 2 === 0 ? 'border-stone-100' : 'border-stone-50'}`} />
                ))}

                {/* "Now" line — only on today */}
                {tlWinStart === todayStr && nowTopDen >= 0 && nowTopDen <= DEN_HOURS.length * SLOT_H && (
                  <div style={{ top: `${nowTopDen}px` }}
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 flex-shrink-0" />
                    <div className="flex-1 border-t-2 border-red-500" />
                  </div>
                )}

                {/* Timed event blocks with overlap columns */}
                {allDenTimed.map(e => {
                  const isGc = !!e._google;
                  const sMin = timeToMin(e.cas_zacatek);
                  const eMin = timeToMin(e.cas_konec);
                  const topPx = Math.max((sMin - TL_MIN_START) / 60 * SLOT_H, 0);
                  const heightPx = Math.max((eMin - sMin) / 60 * SLOT_H, 32);
                  const info = denLayout.get(e) || { col: 0, total: 1 };
                  const MARGIN = 10; // px margin on sides
                  const widthPct = (1 / info.total) * 100 - 1;
                  const chipCls = isGc ? 'bg-blue-50 text-blue-700 border-blue-200' : (TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700 border border-stone-200');
                  const label = isGc ? e.summary : e.nazev;
                  const location = isGc ? e.location : e.misto;
                  return (
                    <div key={(isGc ? 'gc-' : '') + e.id}
                      onClick={isGc ? undefined : () => navigate(`/zakazky/${e.id}`)}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: `calc(${(info.col / info.total) * 100}% + ${MARGIN}px)`,
                        width: `calc(${widthPct}% - ${MARGIN}px)`,
                      }}
                      className={`absolute rounded-lg border ${isGc ? '' : 'cursor-pointer'} hover:shadow-md hover:brightness-95 transition-all px-2.5 py-1.5 overflow-hidden z-10 ${chipCls}`}>
                      <div className="text-xs font-semibold leading-tight truncate">{label}</div>
                      <div className="text-[11px] opacity-70 mt-0.5">{e.cas_zacatek?.slice(0,5)} – {e.cas_konec?.slice(0,5)}</div>
                      {location && heightPx > 60 && <div className="text-[11px] opacity-60 truncate mt-0.5">{location}</div>}
                      {heightPx > 80 && !isGc && e.pocet_hostu && (
                        <div className="text-[11px] opacity-50 mt-0.5">{e.pocet_hostu} hostů</div>
                      )}
                      {isGc && <div className="text-[10px] font-medium opacity-50 mt-0.5">Google</div>}
                    </div>
                  );
                })}

                {/* Empty state */}
                {allDenTimed.length === 0 && denAllDay.length === 0 && gcDenAllDay.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm text-stone-400">Žádné akce</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TÝDEN VIEW — horizontal Gantt, all 7 days ── */}
      {view === 'timeline' && tlView === 'tyden' && (
        <div className="p-6">
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
            <div style={{ minWidth: '640px' }}>

              {/* Time scale header */}
              <div className="flex border-b border-stone-200 bg-stone-50">
                <div className="w-[152px] flex-shrink-0 border-r border-stone-200 px-4 py-2.5">
                  <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Datum</span>
                </div>
                <div className="flex-1 relative" style={{ height: '36px' }}>
                  {HOUR_MARKS.map(h => (
                    <div key={h}
                      style={{ left: `${((h * 60 - TL_MIN_START) / TL_MIN_RANGE) * 100}%` }}
                      className="absolute top-0 h-full border-l border-stone-200">
                      <span className="text-xs text-stone-400 pl-1.5 pt-2 inline-block leading-none">{h}:00</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 7 day rows (Mon–Sun), always rendered */}
              {weekDays.map(({ date, d, evts }) => {
                const isToday   = date === todayStr;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const dateLbl = (
                  <div className={`text-xs font-bold leading-tight ${isToday ? 'text-brand-600' : isWeekend ? 'text-stone-400' : 'text-stone-700'}`}>
                    {CZ_DAYS_SHORT[d.getDay()]} {d.getDate()}. {d.toLocaleString('cs-CZ', { month: 'short' })}
                  </div>
                );
                const gridLines = HOUR_MARKS.map(h => (
                  <div key={h}
                    style={{ left: `${((h * 60 - TL_MIN_START) / TL_MIN_RANGE) * 100}%` }}
                    className="absolute top-0 h-full border-l border-stone-100 pointer-events-none" />
                ));
                const nowLine = isToday && nowPct >= 0 && nowPct <= 100 && (
                  <div key="now" style={{ left: `${nowPct}%` }}
                    className="absolute top-0 h-full border-l-2 border-red-400/70 z-10 pointer-events-none" />
                );
                // Compute bar rows to handle overlap – bars on same day that overlap in time go into separate rows
                const ROW_H = 32; // px per row
                const ROW_GAP = 3;
                const barRows = []; // each entry = { endPct, row }
                const evtRows = evts.map(e => {
                  const sMin     = timeToMin(e.cas_zacatek);
                  const eMin     = timeToMin(e.cas_konec);
                  const hasTimes = sMin !== null && eMin !== null && eMin > sMin;
                  const barS     = hasTimes ? Math.max(sMin, TL_MIN_START) : TL_MIN_START;
                  const barE     = hasTimes ? Math.min(eMin, TL_MIN_START + TL_MIN_RANGE) : TL_MIN_START + TL_MIN_RANGE;
                  const leftPct  = ((barS - TL_MIN_START) / TL_MIN_RANGE) * 100;
                  const widthPct = Math.max(((barE - barS) / TL_MIN_RANGE) * 100, 0.8);
                  // Find first row where this bar doesn't overlap
                  let row = barRows.findIndex(r => r.endPct <= leftPct + 0.3);
                  if (row === -1) { row = barRows.length; barRows.push({ endPct: leftPct + widthPct }); }
                  else { barRows[row].endPct = leftPct + widthPct; }
                  return { e, hasTimes, leftPct, widthPct, row };
                });
                const totalRows = Math.max(barRows.length, 1);
                const dayHeight = totalRows * (ROW_H + ROW_GAP) + ROW_GAP;

                if (evts.length === 0) {
                  return (
                    <div key={date}
                      className={`flex items-center border-b border-stone-100 last:border-b-0 min-h-[40px] ${isToday ? 'bg-brand-50/20' : isWeekend ? 'bg-stone-50/60' : ''}`}>
                      <div className="w-[152px] flex-shrink-0 border-r border-stone-100 px-4 py-2 self-stretch flex items-center">
                        {dateLbl}
                      </div>
                      <div className="flex-1 relative" style={{ height: '40px' }}>
                        {gridLines}{nowLine}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={date}
                    className={`flex border-b border-stone-100 last:border-b-0 ${isToday ? 'bg-brand-50/20' : isWeekend ? 'bg-stone-50/40' : ''}`}>
                    <div className="w-[152px] flex-shrink-0 border-r border-stone-100 px-4 py-2 flex flex-col justify-center">
                      {dateLbl}
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="text-[11px] font-bold text-stone-400">{evts.length} {evts.length === 1 ? 'akce' : evts.length < 5 ? 'akce' : 'akcí'}</span>
                      </div>
                    </div>
                    <div className="flex-1 relative" style={{ height: `${dayHeight}px` }}>
                      {gridLines}{nowLine}
                      {evtRows.map(({ e, hasTimes, leftPct, widthPct, row }) => {
                        const isGc    = !!e._google;
                        const chipCls = isGc ? 'bg-blue-50 text-blue-700 border border-blue-200' : (TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700 border border-stone-200');
                        const dotCls  = isGc ? 'bg-blue-500' : (TYP_DOT[e.typ] || 'bg-stone-400');
                        const label   = isGc ? e.summary : e.nazev;
                        const topPx   = ROW_GAP + row * (ROW_H + ROW_GAP);
                        return (
                          <div key={(isGc ? 'gc-' : '') + e.id}
                            onClick={isGc ? undefined : () => navigate(`/zakazky/${e.id}`)}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: `${topPx}px`, height: `${ROW_H}px` }}
                            title={`${label}${hasTimes ? ` · ${e.cas_zacatek?.slice(0,5)}–${e.cas_konec?.slice(0,5)}` : ''}`}
                            className={`absolute rounded-md flex items-center px-2 overflow-hidden transition-all z-10
                              ${isGc ? '' : 'cursor-pointer'} hover:opacity-85 hover:shadow-md
                              ${hasTimes ? 'shadow-sm' : 'opacity-40'}
                              ${chipCls}`}>
                            {hasTimes ? (
                              <>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 mr-1.5 ${dotCls}`} />
                                <span className="text-xs font-semibold truncate whitespace-nowrap">
                                  {e.cas_zacatek?.slice(0,5)}–{e.cas_konec?.slice(0,5)}&nbsp;·&nbsp;{label}
                                </span>
                                {!isGc && e.stav && (
                                  <span className="ml-auto pl-2 flex-shrink-0"><StavBadge stav={e.stav} /></span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs font-medium truncate">{label}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── KAPACITY VIEW ── */}
      {view === 'kapacity' && (
        <div className="p-6">
          {/* Settings bar */}
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-stone-500">Limity kapacity pro barevné označení:</span>
            <button
              onClick={() => { setKapLimitForm({ kapacity_max_akci_den: String(kapMaxAkci || ''), kapacity_max_hoste_den: String(kapMaxHoste || '') }); setKapLimitsOpen(p => !p); }}
              className="text-xs px-2.5 py-1 border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-600 transition-colors"
            >
              ⚙ Nastavit limity
            </button>
            {(kapMaxAkci > 0 || kapMaxHoste > 0) && (
              <div className="flex items-center gap-3 text-xs text-stone-500">
                {kapMaxAkci  > 0 && <span>Max akcí/den: <strong className="text-stone-700">{kapMaxAkci}</strong></span>}
                {kapMaxHoste > 0 && <span>Max hostů/den: <strong className="text-stone-700">{kapMaxHoste}</strong></span>}
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>Volno</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/>Vytíženo</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>Plná kapacita</span>
            </div>
          </div>

          {/* Limits form */}
          {kapLimitsOpen && (
            <div className="mb-4 bg-stone-50 border border-stone-200 rounded-xl p-4 flex items-end gap-4 flex-wrap">
              <div>
                <label className="text-xs text-stone-500 block mb-1">Max akcí za den</label>
                <input type="number" min="0" className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none w-28"
                  value={kapLimitForm.kapacity_max_akci_den}
                  onChange={e => setKapLimitForm(f => ({ ...f, kapacity_max_akci_den: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Max hostů za den</label>
                <input type="number" min="0" className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none w-28"
                  value={kapLimitForm.kapacity_max_hoste_den}
                  onChange={e => setKapLimitForm(f => ({ ...f, kapacity_max_hoste_den: e.target.value }))} />
              </div>
              <button
                onClick={() => kapSaveMut.mutate(kapLimitForm)}
                disabled={kapSaveMut.isPending}
                className="px-4 py-1.5 bg-stone-900 text-white rounded-lg text-sm hover:bg-stone-700 transition-colors"
              >
                {kapSaveMut.isPending ? 'Ukládám…' : 'Uložit'}
              </button>
              <span className="text-xs text-stone-400">Hodnota 0 = bez limitu (šedá)</span>
            </div>
          )}

          {/* Calendar grid */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-stone-100">
              {DAYS.map((d, i) => (
                <div key={d} className={`py-3 text-center text-xs font-semibold uppercase tracking-wide ${i >= 5 ? 'text-stone-400' : 'text-stone-500'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-stone-100">
              {days.map((d, i) => {
                const ds     = d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
                const kd     = ds ? kapDataForDay(ds) : null;
                const akce   = kd?.akce_celkem || 0;
                const hoste  = kd?.hoste_celkem || 0;
                const color  = kd ? kapColor(akce, hoste) : 'stone';
                const cls    = kapColorCls[color] || kapColorCls.stone;
                const isToday   = d && year === now.getFullYear() && month === now.getMonth() && d === now.getDate();
                const isWeekend = i % 7 >= 5;
                const isSelected = ds && kapSelectedDay === ds;
                return (
                  <div key={i}
                    onClick={() => ds && setKapSelectedDay(isSelected ? null : ds)}
                    className={`min-h-[100px] p-1.5 relative cursor-default transition-colors
                      ${!d ? 'bg-stone-50/50' : isSelected ? 'bg-stone-100' : kd ? cls.bg : isToday ? 'bg-brand-50/30' : isWeekend ? 'bg-stone-50/30' : 'bg-white'}
                      ${ds ? 'cursor-pointer hover:bg-stone-50' : ''}`}>
                    {/* Capacity bar */}
                    {d && kd && (
                      <div className={`absolute top-0 left-0 right-0 h-[3px] ${cls.bar}`} />
                    )}
                    {d && (
                      <>
                        <div className="mb-1.5 px-0.5 flex items-center gap-1.5">
                          <span className={`text-xs font-bold inline-flex items-center justify-center w-7 h-7 rounded-full select-none
                            ${isToday ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30' : kd ? 'bg-stone-800 text-white' : isWeekend ? 'text-stone-400' : 'text-stone-600'}`}>
                            {d}
                          </span>
                        </div>
                        {kd ? (
                          <div className="px-0.5 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls.badge}`}>
                                {akce} {akce === 1 ? 'akce' : akce < 5 ? 'akce' : 'akcí'}
                              </span>
                              {hoste > 0 && (
                                <span className="text-[10px] text-stone-500 font-medium">{hoste} hostů</span>
                              )}
                            </div>
                            {/* Capacity bars */}
                            {(kapMaxAkci > 0 || kapMaxHoste > 0) && (
                              <div className="space-y-0.5 mt-1">
                                {kapMaxAkci > 0 && (
                                  <div className="flex items-center gap-1">
                                    <div className="flex-1 bg-stone-100 rounded-full h-1 overflow-hidden">
                                      <div className={`h-full rounded-full ${cls.bar}`} style={{ width: `${Math.min(100, Math.round(akce / kapMaxAkci * 100))}%` }} />
                                    </div>
                                    <span className="text-[9px] text-stone-400 w-6 text-right">{Math.round(akce / kapMaxAkci * 100)}%</span>
                                  </div>
                                )}
                                {kapMaxHoste > 0 && hoste > 0 && (
                                  <div className="flex items-center gap-1">
                                    <div className="flex-1 bg-stone-100 rounded-full h-1 overflow-hidden">
                                      <div className={`h-full rounded-full ${cls.bar}`} style={{ width: `${Math.min(100, Math.round(hoste / kapMaxHoste * 100))}%` }} />
                                    </div>
                                    <span className="text-[9px] text-stone-400 w-6 text-right">{Math.round(hoste / kapMaxHoste * 100)}%</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Event names */}
                            <div className="space-y-0.5 mt-0.5">
                              {(kd.akce || []).slice(0, 3).map((e, idx) => (
                                <div key={idx}
                                  onClick={ev => { ev.stopPropagation(); navigate(`/zakazky/${e.id}`); }}
                                  className={`text-[10px] truncate px-1 py-0.5 rounded cursor-pointer hover:opacity-75 ${TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700 border border-stone-200'}`}>
                                  {e.nazev}
                                </div>
                              ))}
                              {(kd.akce || []).length > 3 && (
                                <div className="text-[10px] text-stone-400 pl-1">…a {kd.akce.length - 3} dalších</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="px-1 text-[10px] text-stone-300">volno</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {kapSelectedDay && (() => {
            const kd = kapDataForDay(kapSelectedDay);
            if (!kd) return null;
            return (
              <div className="mt-4 bg-white rounded-xl border border-stone-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-stone-800">
                    {new Date(kapSelectedDay + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-stone-500">
                    <span>{kd.akce_celkem} akcí celkem</span>
                    <span>{kd.akce_potvrzene} potvrzeno</span>
                    {kd.hoste_celkem > 0 && <span>{kd.hoste_celkem} hostů</span>}
                    {kd.hoste_potvrzene > 0 && kd.hoste_potvrzene !== kd.hoste_celkem && <span className="text-green-600">({kd.hoste_potvrzene} potvrzeno)</span>}
                  </div>
                </div>
                <div className="space-y-2">
                  {(kd.akce || []).map(e => (
                    <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-stone-100 cursor-pointer hover:bg-stone-50 transition-colors">
                      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${TYP_DOT[e.typ] || 'bg-stone-300'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-800 truncate">{e.nazev}</div>
                        <div className="text-xs text-stone-400">
                          {e.cas_zacatek ? e.cas_zacatek.slice(0, 5) : ''}{e.cas_zacatek && e.cas_konec ? '–' + e.cas_konec.slice(0, 5) : ''}
                          {e.pocet_hostu ? ` · ${e.pocet_hostu} hostů` : ''}
                        </div>
                      </div>
                      <TypBadge typ={e.typ} />
                      <StavBadge stav={e.stav} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── PersonalPage.jsx ──────────────────────────────────────────
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

// ── DokumentyPage.jsx ─────────────────────────────────────────
import { dokumentyApi } from '../api';
import { FolderOpen } from 'lucide-react';

const KAT_LABELS = { nabidka:'Nabídka', kalkulace:'Kalkulace', smlouva:'Smlouva', poptavka:'Poptávka', podklady:'Podklady', foto:'Foto', interni:'Interní' };

export function DokumentyPage() {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [selD, setSelD] = useState(new Set());
  const toggleSelD = (id, e) => { e.stopPropagation(); setSelD(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; }); };
  const bulkDeleteDocs = () => {
    if (!window.confirm(`Smazat ${selD.size} dokumentů?`)) return;
    Promise.all([...selD].map(id => dokumentyApi.delete(id))).then(() => { qc.invalidateQueries({ queryKey: ['dokumenty'] }); setSelD(new Set()); toast.success('Dokumenty smazány'); });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dokumenty'],
    queryFn: () => dokumentyApi.list(),
  });
  const docsRaw = data?.data?.data || [];
  const sortD = useSort();
  const SORT_ACC_D = { nazev: 'nazev', kategorie: 'kategorie', velikost: r => Number(r.velikost) || 0, nahrano: 'created_at' };
  const docs = sortD.sortFn(docsRaw, SORT_ACC_D);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('soubor', file);
    fd.append('kategorie', 'interni');
    try {
      await dokumentyApi.upload(fd);
      qc.invalidateQueries({ queryKey: ['dokumenty'] });
      toast.success('Soubor nahrán');
    } catch { toast.error('Chyba při nahrávání'); }
    setUploading(false);
  };

  const deleteMut = useMutation({
    mutationFn: dokumentyApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dokumenty'] }); toast.success('Dokument smazán'); },
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
              <th className="pl-4 pr-2 py-3 w-8"><input type="checkbox" checked={docs.length>0&&docs.every(r=>selD.has(r.id))} onChange={() => setSelD(docs.every(r=>selD.has(r.id))?new Set():new Set(docs.map(r=>r.id)))} className="rounded cursor-pointer"/></th>
              {[['Název','nazev'],['Kategorie','kategorie'],['Velikost','velikost'],['Nahráno','nahrano']].map(([l,k])=><SortTh key={k} label={l} sortKey={k} active={sortD.sortKey===k} dir={sortD.sortDir} onSort={sortD.toggle}/>)}
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Akce</th>
            </tr></thead>
            <tbody>{docs.map((d,i)=>(
              <tr key={d.id} className={`${selD.has(d.id)?'bg-stone-50':''} ${i<docs.length-1?'border-b border-stone-50':''} hover:bg-stone-50`}>
                <td className="pl-4 pr-2 w-8" onClick={e=>toggleSelD(d.id,e)}><input type="checkbox" checked={selD.has(d.id)} onChange={()=>{}} className="rounded cursor-pointer"/></td>
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
      {selD.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-stone-900 text-white rounded-xl px-5 py-3 shadow-2xl z-30">
          <span className="text-sm font-medium">{selD.size} vybráno</span>
          <button onClick={bulkDeleteDocs} className="text-xs bg-red-500/70 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors">Smazat</button>
          <button onClick={() => setSelD(new Set())} className="text-xs text-stone-400 hover:text-white ml-1 transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}

// ── CenikPage.jsx ─────────────────────────────────────────────
import { cenikApi } from '../api';
import { Tag, Pencil as PencilCenik } from 'lucide-react';

// Převede klíč enumu na zobrazitelný název: 'firemni_catering' → 'Firemní catering'
const katLabel = (k) => k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');

// Převede uživatelský vstup na platný klíč enumu
const toKlic = (s) => s.trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // odstranit diakritiku
  .replace(/\s+/g, '_')
  .replace(/[^a-z0-9_]/g, '');

export function CenikPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [katModal, setKatModal] = useState(false);
  const [katFilter, setKatFilter] = useState('');
  const [editRow, setEditRow] = useState(null);
  const [cenaEdit, setCenaEdit] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [editItemForm, setEditItemForm] = useState({ nazev:'', kategorie:'jidlo', jednotka:'os.', cena_nakup:0, cena_prodej:0, dph_sazba:12 });
  const [form, setForm] = useState({ nazev:'', kategorie:'jidlo', jednotka:'os.', cena_nakup:0, cena_prodej:0, dph_sazba:12 });
  const [katForm, setKatForm] = useState({ nazev:'' });

  const { data: katData } = useQuery({
    queryKey: ['cenik-kategorie'],
    queryFn: () => cenikApi.listKategorie(),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['cenik', katFilter],
    queryFn: () => cenikApi.list({ kategorie: katFilter||undefined, aktivni: 'true' }),
  });

  const createMut = useMutation({
    mutationFn: cenikApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cenik'] }); toast.success('Položka přidána'); setModal(false); },
  });

  const addKatMut = useMutation({
    mutationFn: (d) => cenikApi.addKategorie(d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cenik-kategorie'] });
      toast.success('Kategorie přidána');
      setKatModal(false);
      setKatForm({ nazev: '' });
      setForm(f => ({ ...f, kategorie: res.data.hodnota }));
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při přidávání kategorie'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => cenikApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cenik'] }); setEditRow(null); setEditItem(null); toast.success('Položka aktualizována'); },
  });
  const openEditItem = (p) => {
    setEditItemForm({ nazev: p.nazev, kategorie: p.kategorie, jednotka: p.jednotka, cena_nakup: p.cena_nakup, cena_prodej: p.cena_prodej, dph_sazba: p.dph_sazba });
    setEditItem(p.id);
  };
  const setEI = (k, v) => setEditItemForm(f => ({ ...f, [k]: v }));

  const kategorie = katData?.data?.data || [];
  const items = data?.data?.data || [];
  const sortC = useSort();
  const SORT_ACC_C = { nazev: 'nazev', jedn: 'jednotka', nakup: r => parseFloat(r.cena_nakup)||0, prodej: r => parseFloat(r.cena_prodej)||0, dph: r => parseFloat(r.dph_sazba)||0, marze: r => { const n=parseFloat(r.cena_nakup)||0,p=parseFloat(r.cena_prodej)||0; return p>0?(p-n)/p*100:0; } };
  const sortedItems = sortC.sortFn(items, SORT_ACC_C);
  const grouped = sortedItems.reduce((acc, item) => { (acc[item.kategorie] = acc[item.kategorie]||[]).push(item); return acc; }, {});
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const marze = (n,p) => p>0 ? Math.round((p-n)/p*100) : 0;
  const marze_color = (m) => m >= 40 ? 'text-green-700' : m >= 25 ? 'text-amber-700' : 'text-red-600';
  const klic = toKlic(katForm.nazev);

  return (
    <div>
      <PageHeader title="Ceníky a číselníky" subtitle={`${items.length} aktivních položek`}
        actions={
          <div className="flex gap-2">
            <ExportMenu
              data={items}
              columns={[
                { header: 'Název',          accessor: 'nazev' },
                { header: 'Kategorie',       accessor: r => katLabel(r.kategorie) },
                { header: 'Jednotka',        accessor: 'jednotka' },
                { header: 'Nákupní cena',   accessor: r => Number(r.cena_nakup).toFixed(2) },
                { header: 'Prodejní cena',  accessor: r => Number(r.cena_prodej).toFixed(2) },
                { header: 'DPH %',          accessor: 'dph_sazba' },
                { header: 'Marže %',        accessor: r => marze(r.cena_nakup, r.cena_prodej) },
              ]}
              filename="cenik"
            />
            <Btn size="sm" onClick={() => setKatModal(true)}><Plus size={12}/> Přidat kategorii</Btn>
            <Btn variant="primary" size="sm" onClick={() => setModal(true)}><Plus size={12}/> Nová položka</Btn>
          </div>
        }/>
      <div className="bg-stone-50 border-b border-stone-100 px-6 py-3 flex gap-2 flex-wrap">
        <button onClick={() => setKatFilter('')} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!katFilter?'bg-stone-900 text-white border-stone-900':'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}>Vše</button>
        {kategorie.map(k => (
          <button key={k} onClick={() => setKatFilter(k)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${katFilter===k?'bg-stone-900 text-white border-stone-900':'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}>{katLabel(k)}</button>
        ))}
      </div>
      <div className="p-6 space-y-6">
        {isLoading ? <div className="flex justify-center py-10"><Spinner/></div> :
         items.length === 0 ? <EmptyState icon={Tag} title="Žádné položky ceníku"/> :
         Object.entries(grouped).map(([kat, polozky]) => (
           <div key={kat} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
             <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
               <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">{katLabel(kat)} ({polozky.length})</span>
             </div>
             <table className="w-full">
               <thead><tr className="border-b border-stone-50">
                 {[['Název','nazev'],['Jedn.','jedn'],['Nákup','nakup'],['Prodej','prodej'],['DPH','dph'],['Marže','marze']].map(([l,k])=><SortTh key={k} label={l} sortKey={k} active={sortC.sortKey===k} dir={sortC.sortDir} onSort={sortC.toggle} className="py-2.5"/>)}
                 <th className="px-4 py-2.5"></th>
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
                     <div className="flex items-center gap-2">
                       <button onClick={() => openEditItem(p)} className="text-stone-400 hover:text-stone-700 transition-colors" title="Upravit položku"><PencilCenik size={13}/></button>
                       <button onClick={() => cenikApi.delete(p.id).then(()=>qc.invalidateQueries({ queryKey: ['cenik'] }))} className="text-xs text-stone-400 hover:text-red-600">Skrýt</button>
                     </div>
                   </td>
                 </tr>
               ))}</tbody>
             </table>
           </div>
         ))}
      </div>

      {/* Modal – nová položka ceníku */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nová položka ceníku"
        footer={<><Btn onClick={()=>setModal(false)}>Zrušit</Btn><Btn variant="primary" onClick={()=>createMut.mutate(form)} disabled={!form.nazev||createMut.isPending}>{createMut.isPending?'Ukládám…':'Přidat'}</Btn></>}>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Název *</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.nazev} onChange={e=>set('nazev',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Kategorie</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={form.kategorie} onChange={e=>set('kategorie',e.target.value)}>
                {kategorie.map(k => <option key={k} value={k}>{katLabel(k)}</option>)}
              </select>
            </div>
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

      {/* Modal – editace položky ceníku */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Upravit položku ceníku"
        footer={<><Btn onClick={() => setEditItem(null)}>Zrušit</Btn><Btn variant="primary" onClick={() => updateMut.mutate({ id: editItem, ...editItemForm })} disabled={!editItemForm.nazev || updateMut.isPending}>{updateMut.isPending ? 'Ukládám…' : 'Uložit'}</Btn></>}>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-500 block mb-1">Název *</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.nazev} onChange={e => setEI('nazev', e.target.value)} autoFocus/></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Kategorie</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.kategorie} onChange={e => setEI('kategorie', e.target.value)}>
                {kategorie.map(k => <option key={k} value={k}>{katLabel(k)}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-stone-500 block mb-1">Jednotka</label><input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.jednotka} onChange={e => setEI('jednotka', e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-stone-500 block mb-1">Nákupní cena</label><input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.cena_nakup} onChange={e => setEI('cena_nakup', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">Prodejní cena</label><input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.cena_prodej} onChange={e => setEI('cena_prodej', e.target.value)}/></div>
            <div><label className="text-xs text-stone-500 block mb-1">DPH %</label><select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={editItemForm.dph_sazba} onChange={e => setEI('dph_sazba', e.target.value)}><option value={12}>12 %</option><option value={21}>21 %</option><option value={0}>0 %</option></select></div>
          </div>
          {editItemForm.cena_prodej > 0 && <div className="text-xs text-stone-500">Marže: <span className={`font-medium ${marze_color(marze(editItemForm.cena_nakup, editItemForm.cena_prodej))}`}>{marze(editItemForm.cena_nakup, editItemForm.cena_prodej)} %</span></div>}
        </div>
      </Modal>

      {/* Modal – nová kategorie */}
      <Modal open={katModal} onClose={() => { setKatModal(false); setKatForm({ nazev: '' }); }} title="Přidat kategorii"
        footer={<><Btn onClick={() => { setKatModal(false); setKatForm({ nazev: '' }); }}>Zrušit</Btn><Btn variant="primary" onClick={() => addKatMut.mutate({ klic })} disabled={!klic||addKatMut.isPending}>{addKatMut.isPending?'Ukládám…':'Přidat kategorii'}</Btn></>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Název kategorie *</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="např. Dezerty, Speciální menu…"
              value={katForm.nazev} onChange={e => setKatForm({ nazev: e.target.value })} autoFocus/>
          </div>
          {katForm.nazev && (
            <div className="text-xs text-stone-400">
              Klíč v databázi: <span className="font-mono font-medium text-stone-600">{klic || '—'}</span>
            </div>
          )}
          <p className="text-xs text-stone-400">Kategorie se přidá do databáze a bude dostupná pro všechny položky ceníku. Tato operace je nevratná.</p>
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

// ── NabidkaEditor.jsx ─────────────────────────────────────────
import { Mail, Printer } from 'lucide-react';
import { printNabidkuPdf } from '../utils/print';

export function NabidkaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [emailModal, setEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: '', poznamka: '' });
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ nazev:'', uvodni_text:'', zaverecny_text:'', platnost_do:'', sleva_procent:0 });
  const [editPolozky, setEditPolozky] = useState([]);
  const [editCenikFilter, setEditCenikFilter] = useState('');

  const { data: nabData, isLoading } = useQuery({
    queryKey: ['nabidka', id],
    queryFn: () => nabidkyApi.get(id),
    enabled: !!id && id !== 'nova',
  });
  const n = nabData?.data;

  const { data: cenikEditData } = useQuery({
    queryKey: ['cenik-edit'],
    queryFn: () => cenikApi.list({ aktivni: 'true' }),
    enabled: editMode,
  });
  const cenikItems = cenikEditData?.data?.data || [];
  const filteredCenikEdit = editCenikFilter
    ? cenikItems.filter(c => c.nazev.toLowerCase().includes(editCenikFilter.toLowerCase()))
    : cenikItems;

  const fmt = (v) => v == null ? '—' : new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(v);
  const fmtN = (v) => new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(v || 0);

  const odeslatMut = useMutation({
    mutationFn: (d) => nabidkyApi.odeslat(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nabidka', id] }); qc.invalidateQueries({ queryKey: ['nabidky'] }); toast.success('Nabídka odeslána emailem'); setEmailModal(false); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při odesílání'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => nabidkyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nabidka', id] }); qc.invalidateQueries({ queryKey: ['nabidky'] }); toast.success('Nabídka uložena'); setEditMode(false); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při ukládání'),
  });

  const startEdit = () => {
    setEditForm({
      nazev: n.nazev || '',
      uvodni_text: n.uvodni_text || '',
      zaverecny_text: n.zaverecny_text || '',
      platnost_do: n.platnost_do ? n.platnost_do.slice(0,10) : '',
      sleva_procent: n.sleva_procent || 0,
    });
    setEditPolozky((n.polozky||[]).map(p => ({
      kategorie: p.kategorie || 'jidlo',
      nazev: p.nazev || '',
      jednotka: p.jednotka || 'os.',
      mnozstvi: parseFloat(p.mnozstvi) || 1,
      cena_jednotka: parseFloat(p.cena_jednotka) || 0,
    })));
    setEditCenikFilter('');
    setEditMode(true);
  };

  const setEF = (k,v) => setEditForm(f => ({ ...f, [k]: v }));
  const addFromCenikEdit = (item) => {
    setEditPolozky(ps => [...ps, { kategorie: item.kategorie, nazev: item.nazev, jednotka: item.jednotka, mnozstvi: 1, cena_jednotka: parseFloat(item.cena_prodej) }]);
    setEditCenikFilter('');
  };
  const addBlankEdit = () => setEditPolozky(ps => [...ps, { kategorie:'jidlo', nazev:'', jednotka:'os.', mnozstvi:1, cena_jednotka:0 }]);
  const updateEP = (i,k,v) => setEditPolozky(ps => ps.map((p,idx) => idx===i ? { ...p, [k]:v } : p));
  const removeEP = (i) => setEditPolozky(ps => ps.filter((_,idx) => idx!==i));

  const editTotal = editPolozky.reduce((s,p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
  const editSleva = editTotal * ((parseFloat(editForm.sleva_procent)||0)/100);
  const editDph   = (editTotal - editSleva) * 0.12;
  const editCelkem = editTotal - editSleva + editDph;

  const handleSave = () => {
    if (!editForm.nazev) return toast.error('Zadejte název nabídky');
    if (editPolozky.length === 0) return toast.error('Přidejte alespoň jednu položku');
    updateMut.mutate({ ...editForm, polozky: editPolozky });
  };

  if (isLoading) return <div className="flex justify-center py-20"><Spinner/></div>;

  return (
    <div>
      <PageHeader
        title={editMode ? 'Upravit nabídku' : (n?.nazev || 'Nabídka')}
        subtitle={editMode ? '' : `v${n?.verze || 1} · ${n?.stav || ''}`}
        actions={<button onClick={() => editMode ? setEditMode(false) : navigate(-1)} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft size={13}/> {editMode ? 'Zrušit úpravy' : 'Zpět'}</button>}/>

      {editMode ? (
        <div className="p-6 max-w-4xl space-y-5">
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <h3 className="text-sm font-semibold text-stone-700 mb-4">Základní informace</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-500 block mb-1">Název nabídky *</label>
                <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={editForm.nazev} onChange={e => setEF('nazev', e.target.value)}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Platnost do</label>
                  <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={editForm.platnost_do} onChange={e => setEF('platnost_do', e.target.value)}/>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Sleva %</label>
                  <input type="number" min="0" max="100" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    value={editForm.sleva_procent} onChange={e => setEF('sleva_procent', e.target.value)}/>
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Úvodní text</label>
                <textarea rows={3} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  value={editForm.uvodni_text} onChange={e => setEF('uvodni_text', e.target.value)}/>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Závěrečný text</label>
                <textarea rows={2} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  value={editForm.zaverecny_text} onChange={e => setEF('zaverecny_text', e.target.value)}/>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-700">Položky nabídky</span>
              <button onClick={addBlankEdit} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
                <PlusCircle size={13}/> Vlastní položka
              </button>
            </div>
            <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
              <input className="w-full border border-stone-200 rounded-md px-3 py-1.5 text-xs focus:outline-none bg-white"
                placeholder="Hledat v ceníku a přidat…"
                value={editCenikFilter} onChange={e => setEditCenikFilter(e.target.value)}/>
              {editCenikFilter && filteredCenikEdit.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-stone-200 bg-white divide-y divide-stone-50">
                  {filteredCenikEdit.slice(0,10).map(c => (
                    <button key={c.id} onClick={() => addFromCenikEdit(c)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center justify-between">
                      <span className="text-stone-700">{c.nazev} <span className="text-stone-400">({c.jednotka})</span></span>
                      <span className="text-stone-500 font-medium">{Number(c.cena_prodej).toLocaleString('cs-CZ')} Kč</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {editPolozky.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-stone-400">Vyhledejte položku v ceníku nebo klikněte na „Vlastní položka".</div>
            ) : (
              <table className="w-full">
                <thead><tr className="bg-stone-50 border-b border-stone-100">
                  {['Název','Množství','Jednotka','Cena/jedn.','Celkem',''].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}
                </tr></thead>
                <tbody>{editPolozky.map((p,i) => (
                  <tr key={i} className={i < editPolozky.length-1 ? 'border-b border-stone-50' : ''}>
                    <td className="px-3 py-2"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={p.nazev} onChange={e => updateEP(i,'nazev',e.target.value)} placeholder="Název…"/></td>
                    <td className="px-3 py-2 w-24"><input type="number" min="0" step="0.1" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={p.mnozstvi} onChange={e => updateEP(i,'mnozstvi',e.target.value)}/></td>
                    <td className="px-3 py-2 w-24"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={p.jednotka} onChange={e => updateEP(i,'jednotka',e.target.value)}/></td>
                    <td className="px-3 py-2 w-32"><input type="number" min="0" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={p.cena_jednotka} onChange={e => updateEP(i,'cena_jednotka',e.target.value)}/></td>
                    <td className="px-3 py-2 w-32 text-xs font-medium text-stone-700">
                      {((parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0)).toLocaleString('cs-CZ')} Kč
                    </td>
                    <td className="px-3 py-2 w-8"><button onClick={() => removeEP(i)} className="text-stone-300 hover:text-red-500"><Trash2 size={13}/></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          {editPolozky.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="flex justify-end">
                <div className="space-y-1.5 text-sm min-w-[260px]">
                  <div className="flex justify-between text-stone-600"><span>Cena bez DPH</span><span>{fmtN(editTotal)}</span></div>
                  {parseFloat(editForm.sleva_procent) > 0 && (
                    <div className="flex justify-between text-green-600"><span>Sleva {editForm.sleva_procent} %</span><span>− {fmtN(editSleva)}</span></div>
                  )}
                  <div className="flex justify-between text-stone-600"><span>DPH 12 %</span><span>{fmtN(editDph)}</span></div>
                  <div className="flex justify-between font-semibold text-stone-900 text-base border-t border-stone-100 pt-2 mt-2"><span>Celkem s DPH</span><span>{fmtN(editCelkem)}</span></div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Btn onClick={() => setEditMode(false)}>Zrušit</Btn>
            <Btn variant="primary" onClick={handleSave} disabled={updateMut.isPending}>
              {updateMut.isPending ? 'Ukládám…' : 'Uložit změny'}
            </Btn>
          </div>
        </div>
      ) : (
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
              <div className="flex gap-2 flex-wrap">
                <Btn onClick={startEdit}>Upravit nabídku</Btn>
                <Btn variant="primary" onClick={() => { setEmailForm({ to: '', poznamka: '' }); setEmailModal(true); }}>
                  <Mail size={13}/> Odeslat emailem
                </Btn>
                <Btn onClick={() => printNabidkuPdf(n)}>
                  <Printer size={13}/> Export PDF
                </Btn>
                {['odeslano','prijato','zamitnuto'].map(s => (
                  <Btn key={s} onClick={() => nabidkyApi.setStav(n.id,{stav:s}).then(()=>{ qc.invalidateQueries({ queryKey: ['nabidka',id] }); toast.success('Stav aktualizován'); })}>
                    → {STAV_LABELS_N[s]}
                  </Btn>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={emailModal} onClose={() => setEmailModal(false)} title="Odeslat nabídku emailem"
        footer={<>
          <Btn onClick={() => setEmailModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={() => odeslatMut.mutate(emailForm)} disabled={!emailForm.to || odeslatMut.isPending}>
            {odeslatMut.isPending ? 'Odesílám…' : 'Odeslat'}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">E-mail příjemce *</label>
            <input type="email" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="klient@email.cz"
              value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))} autoFocus/>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Osobní poznámka (volitelné)</label>
            <textarea rows={3} className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              placeholder="Doplňující text, který se zobrazí v emailu před tabulkou nabídky…"
              value={emailForm.poznamka} onChange={e => setEmailForm(f => ({ ...f, poznamka: e.target.value }))}/>
          </div>
          <p className="text-xs text-stone-400">Po odeslání se stav nabídky automaticky změní na „Odesláno".</p>
        </div>
      </Modal>
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
      qc.invalidateQueries({ queryKey: ['nabidky'] });
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
import { nastaveniApi, uzivateleApi, authApi } from '../api';
import { useAuth as useAuthNS } from '../context/AuthContext';
import { Settings, Trash2 as Trash2NS } from 'lucide-react';

export function NastaveniPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthNS();
  const [tab, setTab] = useState('firma');
  const [form, setForm] = useState({});
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ jmeno:'', prijmeni:'', email:'', heslo:'', role:'obchodnik', telefon:'' });
  const [passForm, setPassForm] = useState({ stare_heslo:'', nove_heslo:'', nove_heslo2:'' });

  const { data: nastavData } = useQuery({ queryKey:['nastaveni'], queryFn: nastaveniApi.get });
  const { data: uzivData }   = useQuery({ queryKey:['uzivatele'], queryFn: uzivateleApi.list, enabled: tab==='uziv' });

  useEffect(() => { if (nastavData?.data) setForm(nastavData.data); }, [nastavData]);

  const saveMut   = useMutation({ mutationFn: nastaveniApi.update, onSuccess: () => toast.success('Nastavení uloženo') });
  const userMut   = useMutation({ mutationFn: uzivateleApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['uzivatele'] }); toast.success('Uživatel přidán'); setUserModal(false); } });
  const toggleMut = useMutation({ mutationFn: ({id,aktivni}) => uzivateleApi.update(id,{aktivni}), onSuccess: () => qc.invalidateQueries({ queryKey: ['uzivatele'] }) });
  const deleteMut = useMutation({
    mutationFn: (id) => uzivateleApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uzivatele'] }); toast.success('Uživatel smazán'); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Chyba při mazání'),
  });
  const passMut  = useMutation({
    mutationFn: (d) => authApi.changePassword({ stare_heslo: d.stare_heslo, nove_heslo: d.nove_heslo }),
    onSuccess: () => { toast.success('Heslo bylo úspěšně změněno'); setPassForm({ stare_heslo:'', nove_heslo:'', nove_heslo2:'' }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Chyba při změně hesla'),
  });

  const TABS = [['firma','Profil firmy'],['uziv','Uživatelé'],['heslo','Změna hesla'],['podpis','E-mail podpis'],['notif','Notifikace'],['integrace','Integrace'],['google','Google Kalendář'],['kapacity','Kapacity'],['email','E-mail (IMAP)']];
  const [podpisPreview, setPodpisPreview] = useState(false);

  const { data: gcStatus, refetch: refetchGcStatus } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: googleCalendarApi.status,
    enabled: tab === 'google',
    retry: false,
    select: (r) => r.data,
  });
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
              <div className="flex items-center justify-between pb-3 mb-1 border-b border-stone-100">
                <div>
                  <div className="text-xs font-semibold text-stone-700">Cache aplikace</div>
                  <div className="text-xs text-stone-400 mt-0.5">Zobrazují se zastaralá data? Vymažte cache a načtěte vše znovu.</div>
                </div>
                <Btn size="sm" onClick={() => { qc.clear(); qc.invalidateQueries(); toast.success('Cache vymazána, data se obnovují…'); }}>Vymazat cache</Btn>
              </div>
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
                  <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">{u.jmeno?.[0]}{u.prijmeni?.[0]}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-stone-800">{u.jmeno} {u.prijmeni}</div>
                    <div className="text-xs text-stone-400">{u.email} · {ROLES[u.role]||u.role}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.aktivni?'bg-green-50 text-green-700':'bg-stone-100 text-stone-400'}`}>{u.aktivni?'Aktivní':'Neaktivní'}</span>
                  <button onClick={() => toggleMut.mutate({id:u.id,aktivni:!u.aktivni})} className="text-xs text-stone-400 hover:text-stone-700">{u.aktivni?'Deaktivovat':'Aktivovat'}</button>
                  {String(u.id) !== String(currentUser?.id) && (
                    <button onClick={() => { if (window.confirm(`Opravdu smazat uživatele ${u.jmeno} ${u.prijmeni}? Tato akce je nevratná.`)) deleteMut.mutate(u.id); }}
                      className="p-1 text-stone-300 hover:text-red-500 transition-colors" title="Smazat uživatele">
                      <Trash2NS size={13}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'heslo' && (
          <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
            <p className="text-sm text-stone-500 mb-2">Změna platí pouze pro váš účet. Nové heslo musí mít alespoň 8 znaků.</p>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Stávající heslo</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                value={passForm.stare_heslo} onChange={e => setPassForm(f=>({...f, stare_heslo:e.target.value}))} autoComplete="current-password" />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Nové heslo</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                placeholder="min. 8 znaků" value={passForm.nove_heslo} onChange={e => setPassForm(f=>({...f, nove_heslo:e.target.value}))} autoComplete="new-password" />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Nové heslo (potvrzení)</label>
              <input type="password" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
                value={passForm.nove_heslo2} onChange={e => setPassForm(f=>({...f, nove_heslo2:e.target.value}))} autoComplete="new-password" />
              {passForm.nove_heslo && passForm.nove_heslo2 && passForm.nove_heslo !== passForm.nove_heslo2 && (
                <p className="text-xs text-red-500 mt-1">Hesla se neshodují</p>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Btn variant="primary"
                onClick={() => passMut.mutate(passForm)}
                disabled={!passForm.stare_heslo || !passForm.nove_heslo || passForm.nove_heslo.length < 8 || passForm.nove_heslo !== passForm.nove_heslo2 || passMut.isPending}>
                {passMut.isPending ? 'Měním…' : 'Změnit heslo'}
              </Btn>
            </div>
          </div>
        )}

        {tab === 'podpis' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">HTML podpis e-mailu</div>
                <div className="text-xs text-stone-500 mb-3">Podpis se automaticky připojí ke všem odchozím e-mailům (nabídky, komando, děkovací maily). Zadejte libovolný HTML kód.</div>
                <textarea
                  className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none font-mono resize-y"
                  rows={10}
                  placeholder="<p>S pozdravem,<br><strong>Jméno Příjmení</strong><br>+420 123 456 789</p>"
                  defaultValue={nastavData?.data?.email_podpis_html || ''}
                  onChange={e => setForm(f => ({ ...f, email_podpis_html: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => setPodpisPreview(v => !v)} className="text-xs text-stone-500 hover:text-stone-700 underline underline-offset-2">
                  {podpisPreview ? 'Skrýt náhled' : 'Zobrazit náhled'}
                </button>
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit podpis'}
                </Btn>
              </div>
              {podpisPreview && (
                <div className="border border-stone-200 rounded-lg p-4 bg-stone-50">
                  <div className="text-xs text-stone-400 mb-2 uppercase tracking-wide font-medium">Náhled</div>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: form.email_podpis_html || nastavData?.data?.email_podpis_html || '<em class="text-stone-400">Podpis je prázdný</em>' }}
                  />
                </div>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
              <div className="font-semibold mb-1">Tipy pro HTML podpis:</div>
              <div>• Používejte inline styly: <code className="bg-blue-100 px-1 rounded">style="color:#333;"</code></div>
              <div>• Pro obrázek (logo): <code className="bg-blue-100 px-1 rounded">{'<img src="URL" style="height:40px;">'}</code></div>
              <div>• Pro odkaz: <code className="bg-blue-100 px-1 rounded">{'<a href="https://...">text</a>'}</code></div>
            </div>
          </div>
        )}

        {tab === 'notif' && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <p className="text-sm text-stone-500">Nastavení notifikací bude dostupné po propojení s e-mailovým systémem.</p>
          </div>
        )}

        {tab === 'google' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-stone-800 mb-0.5">Google Kalendář</div>
                  <div className="text-xs text-stone-500">Potvrzené zakázky se automaticky propisují do sdíleného firemního Google Kalendáře. Stornované zakázky se z kalendáře odstraní.</div>
                </div>
                {gcStatus && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ml-4 ${gcStatus.connected ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                    {gcStatus.connected ? '✓ Připojeno' : 'Nepřipojeno'}
                  </span>
                )}
              </div>

              {gcStatus && !gcStatus.connected && gcStatus.reason && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">{gcStatus.reason}</div>
              )}

              <div>
                <label className="text-xs text-stone-500 block mb-1">Google Calendar ID</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="např. abc123@group.calendar.google.com nebo primární: vasuzemail@gmail.com"
                    defaultValue={nastavData?.data?.google_calendar_id || ''}
                    onChange={e => setForm(f => ({ ...f, google_calendar_id: e.target.value }))}
                  />
                  <Btn variant="primary" onClick={() => { saveMut.mutate(form); setTimeout(() => refetchGcStatus(), 1000); }} disabled={saveMut.isPending}>
                    {saveMut.isPending ? 'Ukládám…' : 'Uložit'}
                  </Btn>
                </div>
                <div className="text-xs text-stone-400 mt-1">Kalendář ID najdete v Google Calendar → Nastavení kalendáře → ID kalendáře</div>
              </div>

              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">Jak nastavit:</div>
                <ol className="text-xs text-stone-500 space-y-1 list-decimal pl-4">
                  <li>V Google Cloud Console vytvořte <strong>Service Account</strong> a stáhněte JSON klíč</li>
                  <li>Nastavte proměnnou prostředí <code className="bg-stone-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> v <code className="bg-stone-100 px-1 rounded">backend/.env</code> (obsah celého JSON souboru)</li>
                  <li>V Google Calendar sdílejte váš kalendář s emailem service accountu (role: <strong>Správa událostí</strong>)</li>
                  <li>Zkopírujte Calendar ID (viz nastavení kalendáře) a vložte ho výše</li>
                  <li>Klikněte <strong>Uložit</strong> a ověřte stav připojení</li>
                </ol>
              </div>

              <div className="border-t border-stone-100 pt-4">
                <div className="text-xs font-medium text-stone-700 mb-2">Co se synchronizuje:</div>
                <div className="text-xs text-stone-500 space-y-1">
                  <div>• Zakázka změněna na stav <strong>Potvrzeno</strong> → event vytvořen/aktualizován v Google Kalendáři</div>
                  <div>• Zakázka změněna na stav <strong>Stornováno</strong> → event smazán z Google Kalendáře</div>
                  <div>• Editace potvrzené zakázky (datum, místo) → event automaticky aktualizován</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'kapacity' && nastavData && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-5">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">Kalendář kapacit – limity</div>
                <div className="text-xs text-stone-500">Nastavte denní kapacitní limity pro barevné označení vytíženosti v pohledu Kapacity v kalendáři. Dny nad 85 % jsou označeny červeně, nad 60 % oranžově.</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Max. počet akcí za den</label>
                  <input
                    type="number" min="0"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="např. 3"
                    defaultValue={nastavData?.data?.kapacity_max_akci_den || ''}
                    onChange={e => setForm(f => ({ ...f, kapacity_max_akci_den: e.target.value }))}
                  />
                  <div className="text-xs text-stone-400 mt-1">Hodnota 0 = neomezeno (bez barevného označení)</div>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Max. počet hostů za den</label>
                  <input
                    type="number" min="0"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="např. 500"
                    defaultValue={nastavData?.data?.kapacity_max_hoste_den || ''}
                    onChange={e => setForm(f => ({ ...f, kapacity_max_hoste_den: e.target.value }))}
                  />
                  <div className="text-xs text-stone-400 mt-1">Součet hostů ze všech akcí daného dne</div>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit limity'}
                </Btn>
                <div className="flex items-center gap-3 text-xs text-stone-400">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"/>Volno (&lt;60 %)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"/>Vytíženo (60–85 %)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/>Plná kapacita (&gt;85 %)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'email' && nastavData && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">IMAP – příchozí pošta</div>
                <div className="text-xs text-stone-500">Připojení k e-mailovému účtu přes IMAP pro čtení a správu pošty přímo v CRM.</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-stone-500 block mb-1.5">IMAP server (host)</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="imap.vasdomena.cz"
                    defaultValue={nastavData?.data?.email_imap_host || ''}
                    onChange={e => setForm(f => ({ ...f, email_imap_host: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Port</label>
                  <input
                    type="number"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="993"
                    defaultValue={nastavData?.data?.email_imap_port || '993'}
                    onChange={e => setForm(f => ({ ...f, email_imap_port: e.target.value }))}
                  />
                </div>
                <div className="flex items-end pb-1 gap-3">
                  <label className="text-xs text-stone-500">TLS / SSL</label>
                  <select
                    className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    defaultValue={nastavData?.data?.email_imap_tls ?? 'true'}
                    onChange={e => setForm(f => ({ ...f, email_imap_tls: e.target.value }))}
                  >
                    <option value="true">Zapnuto (doporučeno)</option>
                    <option value="false">Vypnuto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Uživatelské jméno (e-mail)</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="info@vasdomena.cz"
                    defaultValue={nastavData?.data?.email_imap_user || ''}
                    onChange={e => setForm(f => ({ ...f, email_imap_user: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1.5">Heslo</label>
                  <input
                    type="password"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="••••••••"
                    defaultValue={nastavData?.data?.email_imap_pass || ''}
                    onChange={e => setForm(f => ({ ...f, email_imap_pass: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                <Btn variant="primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Ukládám…' : 'Uložit nastavení'}
                </Btn>
              </div>
            </div>
            <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 text-xs text-stone-500 space-y-1.5">
              <div className="font-semibold text-stone-700 mb-2">Odchozí pošta (SMTP)</div>
              <p>Pro odesílání odpovědí se používá SMTP konfigurace nastavená přes proměnné prostředí (<code className="bg-stone-100 px-1 rounded">SMTP_HOST</code>, <code className="bg-stone-100 px-1 rounded">SMTP_USER</code>, <code className="bg-stone-100 px-1 rounded">SMTP_PASS</code> atd.). Tyto hodnoty jsou společné pro všechny odeslané e-maily ze systému. Pokud IMAP přihlašovací údaje a SMTP jsou totožné, systém je automaticky použije jako zálohu.</p>
            </div>
          </div>
        )}

        {tab === 'integrace' && (
          <div className="space-y-4">
            {/* Tally.so */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-stone-800 mb-0.5">Tally.so – Poptávkový formulář</div>
                <div className="text-xs text-stone-500">Poptávky odeslané přes Tally.so formulář se automaticky uloží jako nová zakázka (stav: Nová poptávka) a vytvoří nebo doplní klienta.</div>
              </div>
              <div>
                <div className="text-xs text-stone-500 mb-1">Webhook URL (vložte do Tally → Integrations → Webhooks)</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-700 break-all select-all">
                    {window.location.origin}/api/tally/webhook
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/tally/webhook`); toast.success('URL zkopírováno'); }}
                    className="shrink-0 px-3 py-2 text-xs border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-600"
                  >Kopírovat</button>
                </div>
              </div>
              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">Jak nastavit:</div>
                <ol className="text-xs text-stone-500 space-y-1 list-decimal pl-4">
                  <li>V Tally otevřete svůj formulář → <strong>Integrate</strong> → <strong>Webhooks</strong></li>
                  <li>Klikněte <strong>Add webhook</strong> a vložte URL výše</li>
                  <li>Jako trigger zvolte <strong>New submission</strong></li>
                  <li>Uložte a otestujte testovacím odesláním formuláře</li>
                </ol>
              </div>
              <div className="border-t border-stone-100 pt-4 space-y-2">
                <div className="text-xs font-medium text-stone-700">Mapování polí formuláře:</div>
                <div className="text-xs text-stone-500">CRM rozpozná pole podle jejich <em>popisku (label)</em>. Doporučené názvy:</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-1">
                  {[
                    ['Jméno','jmeno / Křestní jméno'],
                    ['Příjmení','prijmeni / Příjmení'],
                    ['E-mail','email / E-mailová adresa'],
                    ['Telefon','telefon / Telefonní číslo'],
                    ['Firma','firma / Společnost / Company'],
                    ['Typ akce','typ akce / Druh akce'],
                    ['Datum','datum / Datum akce'],
                    ['Počet hostů','počet hostů / Hosté'],
                    ['Místo','místo / Venue / Location'],
                    ['Rozpočet','rozpočet / Budget'],
                    ['Zpráva','zpráva / Vzkaz / Poznámka'],
                  ].map(([crm, tally]) => (
                    <div key={crm} className="flex gap-1">
                      <span className="text-stone-400 w-20 shrink-0">{crm}:</span>
                      <span className="text-stone-600">{tally}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <strong>Volitelné zabezpečení:</strong> Nastavte proměnnou prostředí <code className="bg-amber-100 px-1 rounded">TALLY_KEY</code> a stejný klíč zadejte v Tally jako <em>Secret key</em> (hlavička <code className="bg-amber-100 px-1 rounded">x-api-key</code>).
              </div>
            </div>
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

// ── PoptavkyPage.jsx ──────────────────────────────────────────
import { Inbox, Check, X as XIcon, Phone, MapPin, Users, Banknote } from 'lucide-react';

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

// ── ReportPage.jsx ─────────────────────────────────────────────
import { reportyApi } from '../api';
import { BarChart2 } from 'lucide-react';

const TYP_LABELS_R = { svatba:'Svatba', soukroma_akce:'Soukromá akce', firemni_akce:'Firemní akce', zavoz:'Závoz', bistro:'Bistro', pohreb:'Pohřeb', ostatni:'Ostatní' };

export function ReportPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ od: '', do: '' });
  const [applied, setApplied] = useState({ od: '', do: '' });

  const applyQuick = (od, d) => { setFilters({ od, do: d }); setApplied({ od, do: d }); };

  const QUICK = [
    { l: 'Tento týden', fn: () => {
      const n = new Date(); const dow = (n.getDay() + 6) % 7;
      const mon = new Date(n); mon.setDate(n.getDate() - dow);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      applyQuick(mon.toISOString().slice(0,10), sun.toISOString().slice(0,10));
    }},
    { l: 'Minulý měsíc', fn: () => {
      const n = new Date();
      const f = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      const l = new Date(n.getFullYear(), n.getMonth(), 0);
      applyQuick(f.toISOString().slice(0,10), l.toISOString().slice(0,10));
    }},
    { l: 'Poslední 3 měs.', fn: () => {
      const n = new Date();
      const f = new Date(n.getFullYear(), n.getMonth() - 3, 1);
      applyQuick(f.toISOString().slice(0,10), n.toISOString().slice(0,10));
    }},
    { l: 'Posledních 6 měs.', fn: () => {
      const n = new Date();
      const f = new Date(n.getFullYear(), n.getMonth() - 6, 1);
      applyQuick(f.toISOString().slice(0,10), n.toISOString().slice(0,10));
    }},
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['reporty', applied],
    queryFn: () => reportyApi.get(applied),
  });

  const report  = data?.data;
  const souhrn  = report?.souhrn || {};
  const zakazkyRaw = report?.zakazky || [];

  const sortR = useSort();
  const SORT_ACC_R = { datum: 'datum_akce', zakazka: 'nazev', klient: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`, typ: 'typ', cena: r => parseFloat(r.cena_celkem)||0, naklady: r => parseFloat(r.cena_naklady)||0, zisk: r => (parseFloat(r.cena_celkem)||0)-(parseFloat(r.cena_naklady)||0) };
  const zakazky = sortR.sortFn(zakazkyRaw, SORT_ACC_R);

  const fmtC = (n) => n == null ? '—' : new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(n);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('cs-CZ') : '—';

  const ZAKAZKY_COLS = [
    { header: 'Číslo',   accessor: 'cislo' },
    { header: 'Název',   accessor: 'nazev' },
    { header: 'Typ',     accessor: r => TYP_LABELS_R[r.typ] || r.typ },
    { header: 'Datum',   accessor: r => fmtD(r.datum_akce) },
    { header: 'Klient',  accessor: r => r.klient_firma || `${r.klient_jmeno||''} ${r.klient_prijmeni||''}`.trim() },
    { header: 'Cena',    accessor: r => r.cena_celkem != null ? Number(r.cena_celkem).toFixed(0) : '—' },
    { header: 'Náklady', accessor: r => r.cena_naklady != null ? Number(r.cena_naklady).toFixed(0) : '—' },
    { header: 'Zisk',    accessor: r => (r.cena_celkem != null && r.cena_naklady != null) ? (r.cena_celkem - r.cena_naklady).toFixed(0) : '—' },
  ];

  return (
    <div>
      <PageHeader title="Reporty" subtitle="Přehled realizovaných akcí a obratu"
        actions={zakazky.length > 0 ? <ExportMenu data={zakazky} columns={ZAKAZKY_COLS} filename="report"/> : null}/>

      {/* Filtry */}
      <div className="bg-stone-50 border-b border-stone-100 px-6 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500 font-medium">Období:</span>
        <div className="flex gap-1 flex-wrap">
          {QUICK.map(b => (
            <button key={b.l} onClick={b.fn}
              className="text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg hover:bg-stone-100 text-stone-600 bg-white transition-colors whitespace-nowrap">
              {b.l}
            </button>
          ))}
        </div>
        <span className="text-stone-300 text-xs hidden sm:block">|</span>
        <input type="date" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
          value={filters.od} onChange={e => setFilters(f => ({ ...f, od: e.target.value }))}/>
        <span className="text-stone-400 text-xs">–</span>
        <input type="date" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
          value={filters.do} onChange={e => setFilters(f => ({ ...f, do: e.target.value }))}/>
        <Btn size="sm" variant="primary" onClick={() => setApplied({ ...filters })}>Zobrazit</Btn>
        {(applied.od || applied.do) && (
          <Btn size="sm" onClick={() => { setFilters({ od:'', do:'' }); setApplied({ od:'', do:'' }); }}>Vše</Btn>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner/></div>
      ) : (
        <div className="p-6 space-y-5">
          {/* Souhrnné karty */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Celkem zakázek', value: souhrn.total_zakazek || 0, color: '' },
              { label: 'Realizovaných',  value: souhrn.realizovano || 0,   color: 'text-green-700' },
              { label: 'Obrat',          value: fmtC(souhrn.obrat),        color: 'text-blue-700' },
              { label: 'Náklady',        value: fmtC(souhrn.naklady),      color: 'text-amber-700' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="text-xs text-stone-500 mb-1">{s.label}</div>
                <div className={`text-xl font-semibold ${s.color || 'text-stone-900'}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Obrat podle typu */}
          {(report?.podle_typu||[]).length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <h3 className="text-sm font-semibold text-stone-700 mb-4">Obrat podle typu akce</h3>
              <div className="space-y-3">
                {report.podle_typu.map(t => {
                  const total = report.podle_typu.reduce((s,r) => s + parseFloat(r.obrat||0), 0);
                  const pct = total > 0 ? Math.round(parseFloat(t.obrat||0) / total * 100) : 0;
                  return (
                    <div key={t.typ} className="flex items-center gap-3">
                      <div className="w-36 text-xs text-stone-600 flex-shrink-0">{TYP_LABELS_R[t.typ] || t.typ}</div>
                      <div className="flex-1 bg-stone-100 rounded-full h-2">
                        <div className="bg-brand-700 h-2 rounded-full" style={{ width: `${pct}%` }}/>
                      </div>
                      <div className="text-xs font-medium text-stone-700 w-28 text-right">{fmtC(t.obrat)}</div>
                      <div className="text-xs text-stone-400 w-8 text-right">{t.pocet}×</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabulka realizovaných zakázek */}
          {zakazky.length > 0 ? (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-stone-100">
                <span className="text-sm font-semibold text-stone-700">Realizované akce ({zakazky.length})</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    {[['Datum','datum'],['Zakázka','zakazka'],['Klient','klient'],['Typ','typ'],['Cena','cena'],['Náklady','naklady'],['Zisk','zisk']].map(([l,k]) =>
                      <SortTh key={k} label={l} sortKey={k} active={sortR.sortKey===k} dir={sortR.sortDir} onSort={sortR.toggle}/>)}
                  </tr>
                </thead>
                <tbody>
                  {zakazky.map((z,i) => {
                    const zisk = (parseFloat(z.cena_celkem)||0) - (parseFloat(z.cena_naklady)||0);
                    return (
                      <tr key={z.id} onClick={() => navigate(`/zakazky/${z.id}`)}
                        className={`cursor-pointer hover:bg-stone-50 transition-colors ${i<zakazky.length-1?'border-b border-stone-50':''}`}>
                        <td className="px-4 py-3 text-sm text-stone-500 whitespace-nowrap">{fmtD(z.datum_akce)}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-stone-900">{z.nazev}</div>
                          <div className="text-xs text-stone-400">{z.cislo}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-600">{z.klient_firma || `${z.klient_jmeno||''} ${z.klient_prijmeni||''}`.trim() || '—'}</td>
                        <td className="px-4 py-3"><TypBadge typ={z.typ}/></td>
                        <td className="px-4 py-3 text-sm font-medium text-stone-700">{fmtC(z.cena_celkem)}</td>
                        <td className="px-4 py-3 text-sm text-stone-500">{z.cena_naklady != null ? fmtC(z.cena_naklady) : '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-700">{z.cena_naklady != null ? fmtC(zisk) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={BarChart2} title="Žádné realizované akce" desc="Vyberte období nebo označte zakázky jako realizované."/>
          )}
        </div>
      )}
    </div>
  );
}

// ── FakturyPage.jsx ────────────────────────────────────────────
import { fakturyApi, klientiApi } from '../api';
import { Receipt, CreditCard, CheckCircle2, Clock, Ban } from 'lucide-react';
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

// ── FakturaDetail.jsx ──────────────────────────────────────────
export function FakturaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editPolozky, setEditPolozky] = useState([]);
  const [cenikFilter, setCenikFilter] = useState('');
  const [klientEditSearch, setKlientEditSearch] = useState('');
  const [klientEditSelected, setKlientEditSelected] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['faktura', id],
    queryFn: () => fakturyApi.get(id),
  });
  const f = data?.data;

  const { data: cenikData } = useQuery({
    queryKey: ['cenik'],
    queryFn: () => cenikApi.list({ limit: 200 }),
    enabled: editMode,
  });
  const cenikItems = cenikData?.data?.data || [];
  const filteredCenik = cenikFilter
    ? cenikItems.filter(c => c.nazev.toLowerCase().includes(cenikFilter.toLowerCase()))
    : [];

  const { data: klientiEditData } = useQuery({
    queryKey: ['klienti-edit-search', klientEditSearch],
    queryFn: () => klientiApi.list({ q: klientEditSearch, limit: 10 }),
    enabled: editMode && klientEditSearch.length >= 1,
  });
  const klientiEditSuggestions = klientiEditData?.data?.data || [];

  useEffect(() => {
    if (f && editMode) {
      setEditForm({
        datum_splatnosti: f.datum_splatnosti?.slice(0, 10) || '',
        zpusob_platby: f.zpusob_platby || 'převod',
        variabilni_symbol: f.variabilni_symbol || '',
        poznamka: f.poznamka || '',
      });
      setEditPolozky((f.polozky || []).map(p => ({
        nazev: p.nazev, jednotka: p.jednotka, mnozstvi: parseFloat(p.mnozstvi),
        cena_jednotka: parseFloat(p.cena_jednotka), dph_sazba: p.dph_sazba || 12,
      })));
      setKlientEditSelected(f.klient_id ? {
        id: f.klient_id,
        jmeno: f.klient_jmeno, prijmeni: f.klient_prijmeni, firma: f.klient_firma,
      } : null);
      setKlientEditSearch('');
    }
  }, [f, editMode]);

  const stavMut = useMutation({
    mutationFn: (d) => fakturyApi.setStav(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['faktura', id] }); qc.invalidateQueries({ queryKey: ['faktury'] }); },
  });

  const updateMut = useMutation({
    mutationFn: (d) => fakturyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['faktura', id] }); setEditMode(false); toast.success('Faktura uložena'); },
  });

  const deleteMut = useMutation({
    mutationFn: () => fakturyApi.delete(id),
    onSuccess: () => { navigate('/faktury'); toast.success('Faktura smazána'); },
  });

  const updateEditPolozka = (i, k, v) => setEditPolozky(ps => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removeEditPolozka = (i) => setEditPolozky(ps => ps.filter((_, idx) => idx !== i));
  const addBlankPolozka = () => setEditPolozky(ps => [...ps, { nazev: '', jednotka: 'os.', mnozstvi: 1, cena_jednotka: 0, dph_sazba: 12 }]);
  const addFromCenikF = (item) => setEditPolozky(ps => [...ps, { nazev: item.nazev, jednotka: item.jednotka, mnozstvi: 1, cena_jednotka: parseFloat(item.cena_prodej), dph_sazba: item.dph_sazba || 12 }]);

  const fmtC = (n) => n != null ? Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč' : '—';
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('cs-CZ') : '—';

  const editTotalBezDph = editPolozky.reduce((s, p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
  const editDph = editPolozky.reduce((s, p) => { const c=(parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0); return s+c*((p.dph_sazba||12)/100); }, 0);

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!f) return <div className="p-6 text-stone-400">Faktura nenalezena</div>;

  const firma = f.dodavatel_json || {};

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/faktury')} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors">
            <ArrowLeft size={16}/>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-stone-800 font-mono">{f.cislo}</h1>
              <FakturaStavBadge stav={f.stav} />
            </div>
            <div className="text-xs text-stone-400 mt-0.5">
              Vystavena {fmtD(f.datum_vystaveni)}
              {f.zakazka_cislo && <> · <button onClick={() => navigate(`/zakazky/${f.zakazka_id}`)} className="hover:underline text-brand-600">{f.zakazka_cislo}</button></>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Btn size="sm" onClick={() => printFakturuPdf(f)}><Printer size={12}/> PDF</Btn>
          {f.stav === 'vystavena' && !editMode && (
            <Btn size="sm" onClick={() => setEditMode(true)}><Pencil size={12}/> Upravit</Btn>
          )}
          {f.stav === 'vystavena' && (
            <Btn size="sm" onClick={() => stavMut.mutate({ stav: 'odeslana' })} disabled={stavMut.isPending}>
              Označit jako odeslanou
            </Btn>
          )}
          {f.stav === 'odeslana' && (
            <Btn size="sm" variant="primary" onClick={() => stavMut.mutate({ stav: 'zaplacena' })} disabled={stavMut.isPending}>
              <CheckCircle2 size={12}/> Zaplacena
            </Btn>
          )}
          {(f.stav === 'vystavena' || f.stav === 'odeslana') && (
            <Btn size="sm" onClick={() => { if (window.confirm('Stornovat fakturu?')) stavMut.mutate({ stav: 'storno' }); }}>
              <Ban size={12}/> Storno
            </Btn>
          )}
          {f.stav === 'vystavena' && (
            <Btn size="sm" onClick={() => { if (window.confirm('Smazat fakturu?')) deleteMut.mutate(); }}>
              <Trash2 size={12}/> Smazat
            </Btn>
          )}
        </div>
      </div>

      {/* Dodavatel / Odběratel */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="text-xs text-stone-400 font-semibold uppercase tracking-wide mb-3">Dodavatel</div>
          <div className="text-sm font-bold text-stone-800">{firma.firma_nazev || '—'}</div>
          <div className="text-xs text-stone-500 mt-1 space-y-0.5">
            {firma.firma_adresa && <div>{firma.firma_adresa}</div>}
            {firma.firma_ico && <div>IČO: {firma.firma_ico}{firma.firma_dic && ` · DIČ: ${firma.firma_dic}`}</div>}
            {firma.firma_iban && <div>Účet: {firma.firma_iban}</div>}
            {firma.firma_email && <div>{firma.firma_email}</div>}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="text-xs text-stone-400 font-semibold uppercase tracking-wide mb-3">Odběratel</div>
          <div className="text-sm font-bold text-stone-800">
            {f.klient_firma || [f.klient_jmeno, f.klient_prijmeni].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="text-xs text-stone-500 mt-1 space-y-0.5">
            {f.klient_adresa && <div>{f.klient_adresa}</div>}
            {f.klient_ico && <div>IČO: {f.klient_ico}{f.klient_dic && ` · DIČ: ${f.klient_dic}`}</div>}
            {f.klient_email && <div>{f.klient_email}</div>}
          </div>
        </div>
      </div>

      {/* Meta info */}
      {editMode ? (
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          {/* Odběratel */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Odběratel</label>
            <div className="relative">
              {klientEditSelected ? (
                <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                  <div className="flex-1 text-sm font-medium text-stone-800">
                    {klientEditSelected.firma || [klientEditSelected.jmeno, klientEditSelected.prijmeni].filter(Boolean).join(' ')}
                  </div>
                  <button onClick={() => { setKlientEditSelected(null); setKlientEditSearch(''); }} className="text-stone-400 hover:text-red-500"><XIcon size={14}/></button>
                </div>
              ) : (
                <input
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder="Hledat klienta…"
                  value={klientEditSearch}
                  onChange={e => setKlientEditSearch(e.target.value)}
                />
              )}
              {!klientEditSelected && klientiEditSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {klientiEditSuggestions.map(k => (
                    <button key={k.id} onClick={() => { setKlientEditSelected(k); setKlientEditSearch(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 border-b border-stone-50 last:border-0">
                      <div className="text-sm font-medium text-stone-800">{k.firma || [k.jmeno, k.prijmeni].filter(Boolean).join(' ')}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Datum splatnosti</label>
              <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.datum_splatnosti} onChange={e => setEditForm(f => ({ ...f, datum_splatnosti: e.target.value }))}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Způsob platby</label>
              <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                value={editForm.zpusob_platby} onChange={e => setEditForm(f => ({ ...f, zpusob_platby: e.target.value }))}>
                <option value="převod">Bankovní převod</option>
                <option value="hotovost">Hotovost</option>
                <option value="karta">Platební karta</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Variabilní symbol</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.variabilni_symbol} onChange={e => setEditForm(f => ({ ...f, variabilni_symbol: e.target.value }))}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Poznámka</label>
              <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={editForm.poznamka} onChange={e => setEditForm(f => ({ ...f, poznamka: e.target.value }))}/>
            </div>
          </div>

          {/* Položky edit */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-stone-700">Položky</span>
              <div className="flex gap-2">
                <button onClick={addBlankPolozka} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
                  <Plus size={11}/> Vlastní položka
                </button>
              </div>
            </div>
            <div className="border border-stone-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-stone-50 border-b border-stone-100">
                <input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none bg-white"
                  placeholder="Hledat v ceníku…" value={cenikFilter} onChange={e => setCenikFilter(e.target.value)}/>
                {cenikFilter && filteredCenik.length > 0 && (
                  <div className="mt-1 max-h-36 overflow-y-auto rounded border border-stone-200 bg-white divide-y divide-stone-50">
                    {filteredCenik.slice(0, 8).map(c => (
                      <button key={c.id} onClick={() => { addFromCenikF(c); setCenikFilter(''); }}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-stone-50 flex justify-between">
                        <span>{c.nazev} <span className="text-stone-400">({c.jednotka})</span></span>
                        <span className="text-stone-500">{Number(c.cena_prodej).toLocaleString('cs-CZ')} Kč</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <table className="w-full">
                <thead><tr className="bg-stone-50 border-b border-stone-100">
                  {['Název','Mn.','Jedn.','Cena/jedn.','DPH %','Celkem',''].map(h =>
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-stone-400">{h}</th>)}
                </tr></thead>
                <tbody>
                  {editPolozky.map((p, i) => {
                    const celkem = (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0);
                    return (
                      <tr key={i} className="border-b border-stone-50">
                        <td className="px-3 py-1.5"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                          value={p.nazev} onChange={e => updateEditPolozka(i,'nazev',e.target.value)} placeholder="Název…"/></td>
                        <td className="px-3 py-1.5 w-20"><input type="number" min="0" step="0.1" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                          value={p.mnozstvi} onChange={e => updateEditPolozka(i,'mnozstvi',e.target.value)}/></td>
                        <td className="px-3 py-1.5 w-20"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                          value={p.jednotka} onChange={e => updateEditPolozka(i,'jednotka',e.target.value)}/></td>
                        <td className="px-3 py-1.5 w-28"><input type="number" min="0" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                          value={p.cena_jednotka} onChange={e => updateEditPolozka(i,'cena_jednotka',e.target.value)}/></td>
                        <td className="px-3 py-1.5 w-20">
                          <select className="w-full border border-stone-200 rounded px-1 py-1 text-xs focus:outline-none bg-white"
                            value={p.dph_sazba} onChange={e => updateEditPolozka(i,'dph_sazba',parseInt(e.target.value))}>
                            <option value={0}>0 %</option><option value={12}>12 %</option><option value={21}>21 %</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5 w-28 text-xs font-medium text-stone-700">{fmtC(celkem)}</td>
                        <td className="px-3 py-1.5 w-8">
                          <button onClick={() => removeEditPolozka(i)} className="text-stone-300 hover:text-red-500"><Trash2 size={13}/></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 flex justify-end gap-2 text-xs text-stone-500 bg-stone-50">
                <span>Bez DPH: <strong>{fmtC(editTotalBezDph)}</strong></span>
                <span className="text-stone-300">|</span>
                <span>DPH: <strong>{fmtC(editDph)}</strong></span>
                <span className="text-stone-300">|</span>
                <span className="text-stone-800 font-semibold">Celkem: {fmtC(editTotalBezDph + editDph)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Btn onClick={() => setEditMode(false)}>Zrušit</Btn>
            <Btn variant="primary" onClick={() => updateMut.mutate({ ...editForm, polozky: editPolozky, klient_id: klientEditSelected?.id || null })} disabled={updateMut.isPending}>
              Uložit fakturu
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Datum vystavení', value: fmtD(f.datum_vystaveni) },
              { label: 'Datum splatnosti', value: fmtD(f.datum_splatnosti) },
              { label: 'Způsob platby', value: f.zpusob_platby || '—' },
              { label: 'Variabilní symbol', value: f.variabilni_symbol || '—' },
            ].map(m => (
              <div key={m.label} className="bg-white border border-stone-200 rounded-xl px-4 py-3">
                <div className="text-xs text-stone-400 mb-1">{m.label}</div>
                <div className="text-sm font-semibold text-stone-800">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Položky */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-100">
              <span className="text-sm font-semibold text-stone-700">Položky ({(f.polozky||[]).length})</span>
            </div>
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['Název','Množství','Jednotka','Cena/jedn.','DPH','Celkem s DPH'].map(h =>
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-stone-500">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-stone-50">
                {(f.polozky || []).map((p, i) => {
                  const c = (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0);
                  const d = c * ((p.dph_sazba||12)/100);
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-sm text-stone-700">{p.nazev}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-600">{p.mnozstvi}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-600">{p.jednotka}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-600">{fmtC(p.cena_jednotka)}</td>
                      <td className="px-4 py-2.5 text-sm text-stone-500">{p.dph_sazba || 12} %</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-stone-800">{fmtC(c + d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-4 bg-stone-50 border-t border-stone-100 flex justify-end">
              <div className="space-y-1 min-w-[260px] text-sm">
                <div className="flex justify-between text-stone-600"><span>Základ daně</span><span>{fmtC(f.cena_bez_dph)}</span></div>
                <div className="flex justify-between text-stone-600"><span>DPH</span><span>{fmtC(f.dph)}</span></div>
                <div className="flex justify-between font-bold text-stone-900 text-base border-t border-stone-200 pt-2 mt-2">
                  <span>Celkem k úhradě</span><span>{fmtC(f.cena_celkem)}</span>
                </div>
                {f.stav === 'zaplacena' && f.datum_zaplaceni && (
                  <div className="text-xs text-green-600 text-right mt-1">Zaplaceno {fmtD(f.datum_zaplaceni)}</div>
                )}
              </div>
            </div>
          </div>
          {f.poznamka && (
            <div className="bg-white border border-stone-200 rounded-xl px-5 py-4">
              <div className="text-xs text-stone-400 mb-1">Poznámka</div>
              <div className="text-sm text-stone-600">{f.poznamka}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── NovaFakturaPage.jsx ────────────────────────────────────────
export function NovaFakturaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParamsF] = useSearchParams();
  const zakazkaIdParam = searchParamsF.get('zakazka_id');

  const [klientSearch, setKlientSearch] = useState('');
  const [klientSelected, setKlientSelected] = useState(null);
  const [klientOpen, setKlientOpen] = useState(false);
  const [polozky, setPolozky] = useState([]);
  const [cenikFilterN, setCenikFilterN] = useState('');
  const [form, setForm] = useState({
    datum_splatnosti: '',
    zpusob_platby: 'převod',
    variabilni_symbol: '',
    poznamka: '',
  });

  // Načti zakázku (pokud přišli z detailu zakázky)
  const { data: zakazkaData } = useQuery({
    queryKey: ['zakazka-pre', zakazkaIdParam],
    queryFn: () => zakazkyApi.get(zakazkaIdParam),
    enabled: !!zakazkaIdParam,
  });

  // Načti nastavení pro výchozí splatnost
  const { data: nastavData } = useQuery({
    queryKey: ['nastaveni'],
    queryFn: () => nastaveniApi.get(),
  });

  useEffect(() => {
    if (nastavData?.data) {
      const splatnost = parseInt(nastavData.data.faktura_splatnost) || 14;
      const d = new Date();
      d.setDate(d.getDate() + splatnost);
      setForm(f => ({ ...f, datum_splatnosti: d.toISOString().slice(0, 10) }));
    }
  }, [nastavData]);

  useEffect(() => {
    if (zakazkaData?.data) {
      const z = zakazkaData.data;
      if (z.klient_id) {
        setKlientSelected({
          id: z.klient_id,
          jmeno: z.klient_jmeno, prijmeni: z.klient_prijmeni, firma: z.klient_firma,
        });
      }
      if (z.nabidka?.polozky?.length > 0) {
        setPolozky(z.nabidka.polozky.map(p => ({
          nazev: p.nazev,
          jednotka: p.jednotka || 'os.',
          mnozstvi: parseFloat(p.mnozstvi) || 1,
          cena_jednotka: parseFloat(p.cena_jednotka) || 0,
          dph_sazba: p.dph_sazba || 12,
        })));
      }
    }
  }, [zakazkaData]);

  const { data: klientiData } = useQuery({
    queryKey: ['klienti-search', klientSearch],
    queryFn: () => klientiApi.list({ q: klientSearch, limit: 10 }),
    enabled: klientSearch.length >= 1,
  });
  const klientiSuggestions = klientiData?.data?.data || [];

  const { data: cenikDataN } = useQuery({
    queryKey: ['cenik'],
    queryFn: () => cenikApi.list({ limit: 200 }),
  });
  const cenikItemsN = cenikDataN?.data?.data || [];
  const filteredCenikN = cenikFilterN
    ? cenikItemsN.filter(c => c.nazev.toLowerCase().includes(cenikFilterN.toLowerCase()))
    : [];

  const updatePolozkaF = (i, k, v) => setPolozky(ps => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removePolozkaF = (i) => setPolozky(ps => ps.filter((_, idx) => idx !== i));
  const addBlankF = () => setPolozky(ps => [...ps, { nazev: '', jednotka: 'os.', mnozstvi: 1, cena_jednotka: 0, dph_sazba: 12 }]);
  const addFromCenikFN = (item) => { setPolozky(ps => [...ps, { nazev: item.nazev, jednotka: item.jednotka, mnozstvi: 1, cena_jednotka: parseFloat(item.cena_prodej), dph_sazba: item.dph_sazba || 12 }]); setCenikFilterN(''); };

  const totalBezDph = polozky.reduce((s, p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
  const totalDph = polozky.reduce((s, p) => { const c=(parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0); return s+c*((p.dph_sazba||12)/100); }, 0);
  const fmtC = (n) => n != null ? Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč' : '—';

  const createMut = useMutation({
    mutationFn: (d) => fakturyApi.create(d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['faktury'] });
      navigate(`/faktury/${res.data.id}`);
      toast.success('Faktura vystavena');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při vystavení faktury'),
  });

  const handleSubmit = () => {
    if (!klientSelected) return toast.error('Vyberte klienta');
    if (!form.datum_splatnosti) return toast.error('Zadejte datum splatnosti');
    if (polozky.length === 0) return toast.error('Přidejte alespoň jednu položku');
    createMut.mutate({
      klient_id: klientSelected.id,
      zakazka_id: zakazkaIdParam || null,
      ...form,
      polozky,
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/faktury')} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-colors">
          <ArrowLeft size={16}/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-stone-800">Nová faktura</h1>
          {zakazkaIdParam && <p className="text-xs text-stone-400 mt-0.5">Zakázka #{zakazkaIdParam}</p>}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Odběratel</h2>
        <div className="relative">
          <div className="flex gap-2 items-center">
            {klientSelected ? (
              <div className="flex-1 flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-stone-800">
                    {klientSelected.firma || [klientSelected.jmeno, klientSelected.prijmeni].filter(Boolean).join(' ')}
                  </div>
                  {klientSelected.firma && <div className="text-xs text-stone-400">{klientSelected.jmeno} {klientSelected.prijmeni}</div>}
                </div>
                <button onClick={() => setKlientSelected(null)} className="text-stone-400 hover:text-red-500"><XIcon size={14}/></button>
              </div>
            ) : (
              <input
                className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                placeholder="Hledat klienta…"
                value={klientSearch}
                onChange={e => { setKlientSearch(e.target.value); setKlientOpen(true); }}
                onFocus={() => setKlientOpen(true)}
              />
            )}
          </div>
          {!klientSelected && klientiSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 bg-white border border-stone-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
              {klientiSuggestions.map(k => (
                <button key={k.id} onClick={() => { setKlientSelected(k); setKlientOpen(false); setKlientSearch(''); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-stone-50 border-b border-stone-50 last:border-0">
                  <div className="text-sm font-medium text-stone-800">{k.firma || [k.jmeno, k.prijmeni].filter(Boolean).join(' ')}</div>
                  {k.firma && <div className="text-xs text-stone-400">{k.jmeno} {k.prijmeni}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Parametry faktury */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-stone-700 mb-4">Parametry faktury</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Datum splatnosti *</label>
            <input type="date" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.datum_splatnosti} onChange={e => setForm(f => ({ ...f, datum_splatnosti: e.target.value }))}/>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Způsob platby</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
              value={form.zpusob_platby} onChange={e => setForm(f => ({ ...f, zpusob_platby: e.target.value }))}>
              <option value="převod">Bankovní převod</option>
              <option value="hotovost">Hotovost</option>
              <option value="karta">Platební karta</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Variabilní symbol</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="Automaticky z čísla faktury…"
              value={form.variabilni_symbol} onChange={e => setForm(f => ({ ...f, variabilni_symbol: e.target.value }))}/>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Poznámka</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.poznamka} onChange={e => setForm(f => ({ ...f, poznamka: e.target.value }))}/>
          </div>
        </div>
      </div>

      {/* Položky */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-700">Položky faktury</span>
          <button onClick={addBlankF} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
            <Plus size={11}/> Vlastní položka
          </button>
        </div>

        <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
          <input className="w-full border border-stone-200 rounded-md px-3 py-1.5 text-xs focus:outline-none bg-white"
            placeholder="Hledat v ceníku a přidat…"
            value={cenikFilterN} onChange={e => setCenikFilterN(e.target.value)}/>
          {cenikFilterN && filteredCenikN.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-stone-200 bg-white divide-y divide-stone-50">
              {filteredCenikN.slice(0, 10).map(c => (
                <button key={c.id} onClick={() => addFromCenikFN(c)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center justify-between">
                  <span>{c.nazev} <span className="text-stone-400">({c.jednotka})</span></span>
                  <span className="text-stone-500 font-medium">{Number(c.cena_prodej).toLocaleString('cs-CZ')} Kč</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {polozky.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-stone-400">Přidejte položky z ceníku nebo klikněte na „Vlastní položka".</div>
        ) : (
          <>
            <table className="w-full">
              <thead><tr className="bg-stone-50 border-b border-stone-100">
                {['Název','Mn.','Jedn.','Cena/jedn.','DPH %','Celkem',''].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-stone-400">{h}</th>)}
              </tr></thead>
              <tbody>
                {polozky.map((p, i) => {
                  const c = (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0);
                  const d = c*((p.dph_sazba||12)/100);
                  return (
                    <tr key={i} className={i < polozky.length-1 ? 'border-b border-stone-50' : ''}>
                      <td className="px-3 py-2"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.nazev} onChange={e => updatePolozkaF(i,'nazev',e.target.value)} placeholder="Název…"/></td>
                      <td className="px-3 py-2 w-20"><input type="number" min="0" step="0.1" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.mnozstvi} onChange={e => updatePolozkaF(i,'mnozstvi',e.target.value)}/></td>
                      <td className="px-3 py-2 w-20"><input className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.jednotka} onChange={e => updatePolozkaF(i,'jednotka',e.target.value)}/></td>
                      <td className="px-3 py-2 w-28"><input type="number" min="0" className="w-full border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none"
                        value={p.cena_jednotka} onChange={e => updatePolozkaF(i,'cena_jednotka',e.target.value)}/></td>
                      <td className="px-3 py-2 w-20">
                        <select className="w-full border border-stone-200 rounded px-1 py-1 text-xs focus:outline-none bg-white"
                          value={p.dph_sazba} onChange={e => updatePolozkaF(i,'dph_sazba',parseInt(e.target.value))}>
                          <option value={0}>0 %</option><option value={12}>12 %</option><option value={21}>21 %</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 w-28 text-xs font-medium text-stone-700">{fmtC(c+d)}</td>
                      <td className="px-3 py-2 w-8">
                        <button onClick={() => removePolozkaF(i)} className="text-stone-300 hover:text-red-500"><Trash2 size={13}/></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex justify-end gap-4 text-sm">
              <span className="text-stone-500">Bez DPH: <strong>{fmtC(totalBezDph)}</strong></span>
              <span className="text-stone-500">DPH: <strong>{fmtC(totalDph)}</strong></span>
              <span className="text-stone-800 font-bold">Celkem: {fmtC(totalBezDph + totalDph)}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-3 justify-end">
        <Btn onClick={() => navigate('/faktury')}>Zrušit</Btn>
        <Btn variant="primary" onClick={handleSubmit} disabled={createMut.isPending}>
          <Receipt size={14}/> Vystavit fakturu
        </Btn>
      </div>
    </div>
  );
}

// ── VyrobniListPage.jsx ───────────────────────────────────────
import { useParams as useParamsVL, useNavigate as useNavigateVL } from 'react-router-dom';
import { useQuery as useQueryVL } from '@tanstack/react-query';
import { productionApi } from '../api';
import { formatDatum as formatDatumVL } from '../components/ui';
import { ArrowLeft as ArrowLeftVL, Printer as PrinterVL, ChefHat, AlertTriangle, Package, Users as UsersVL, Truck, Zap } from 'lucide-react';

const TYP_LABEL_VL = {
  svatba:        'Svatba',
  soukroma_akce: 'Soukromá akce',
  firemni_akce:  'Firemní akce',
  zavoz:         'Závoz',
  bistro:        'Bistro',
};

const KAT_COLOR = {
  jidlo:    'bg-amber-100 text-amber-800',
  napoje:   'bg-blue-100 text-blue-800',
  vybaveni: 'bg-stone-100 text-stone-700',
  pronajem: 'bg-purple-100 text-purple-700',
  doprava:  'bg-green-100 text-green-700',
  personal: 'bg-rose-100 text-rose-700',
  externi:  'bg-orange-100 text-orange-700',
};

function SectionHeader({ icon: Icon, title, count, color = 'text-stone-700' }) {
  return (
    <div className={`flex items-center gap-2 mb-3 pb-2 border-b border-stone-200 ${color}`}>
      <Icon size={16} />
      <h3 className="font-semibold text-sm">{title}</h3>
      {count != null && (
        <span className="ml-auto text-xs bg-stone-100 text-stone-600 rounded-full px-2 py-0.5">{count} položek</span>
      )}
    </div>
  );
}

export function VyrobniListPage() {
  const { id } = useParamsVL();
  const navigate = useNavigateVL();

  const { data, isLoading, error } = useQueryVL({
    queryKey: ['vyrobni-list', id],
    queryFn: () => productionApi.sheet(id),
  });

  const sheet = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-stone-400 text-sm">Generuji výrobní list…</div>
      </div>
    );
  }

  if (error || !sheet) {
    return (
      <div className="p-6">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 mb-4 transition-colors">
          <ArrowLeftVL size={12} /> Zpět
        </button>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-800 text-sm">
          <strong>Nelze vygenerovat výrobní list.</strong><br/>
          {error?.response?.data?.error || 'K zakázce není přiřazena žádná kalkulace. Nejprve vytvořte kalkulaci v editoru nabídky.'}
        </div>
      </div>
    );
  }

  const mul = sheet.spotreba?.multipliers || {};
  const mulPct = (v) => v != null ? `${Math.round(v * 100)} %` : '—';

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-6 py-4 print:hidden">
        <button onClick={() => navigate(`/zakazky/${id}`)}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 mb-3 transition-colors">
          <ArrowLeftVL size={12} /> {sheet.cislo}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ChefHat size={18} className="text-stone-600" />
              <h1 className="text-base font-semibold text-stone-900">Výrobní list</h1>
              <span className="text-xs bg-stone-100 text-stone-600 rounded-full px-2.5 py-0.5">
                {TYP_LABEL_VL[sheet.typ] || sheet.typ}
              </span>
            </div>
            <div className="text-xs text-stone-400 mt-0.5">
              {sheet.nazev} · {formatDatumVL(sheet.datum_akce)}
              {sheet.cas_zacatek && ` · ${sheet.cas_zacatek}`}
              {sheet.misto && ` · ${sheet.misto}`}
            </div>
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors">
            <PrinterVL size={14} /> Tisknout
          </button>
        </div>
      </div>

      {/* Print title */}
      <div className="hidden print:block px-6 pt-4 pb-2 border-b border-stone-300">
        <div className="text-lg font-bold">Výrobní list – {sheet.cislo}</div>
        <div className="text-sm text-stone-600">
          {sheet.nazev} · {formatDatumVL(sheet.datum_akce)}
          {sheet.cas_zacatek && ` · ${sheet.cas_zacatek}–${sheet.cas_konec || ''}`}
          {sheet.misto && ` · ${sheet.misto}`}
          {sheet.klient && ` · ${sheet.klient}`}
        </div>
        <div className="text-xs text-stone-400 mt-0.5">
          Vygenerováno: {new Date(sheet.generated_at).toLocaleString('cs-CZ')} · Hostů: {sheet.pocet_hostu}
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-5xl">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Počet hostů',    value: sheet.pocet_hostu },
            { label: 'Odhad hmotnost', value: `${sheet.shrnuti?.total_weight_kg ?? 0} kg` },
            { label: 'Alergeny',       value: `${sheet.shrnuti?.pocet_alergen_skupin ?? 0} skupin` },
            { label: 'Typ akce',       value: TYP_LABEL_VL[sheet.typ] || sheet.typ },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-stone-200 p-3.5">
              <div className="text-xs text-stone-500 mb-0.5">{c.label}</div>
              <div className="text-base font-semibold text-stone-800">{c.value}</div>
            </div>
          ))}
        </div>

        {/* Multiplier info */}
        {sheet.typ && (
          <div className="bg-stone-50 rounded-xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Zap size={12} /> Koeficienty spotřeby pro {TYP_LABEL_VL[sheet.typ]}
            </div>
            <div className="grid grid-cols-4 gap-3 text-sm">
              {[
                { label: 'Jídlo',    val: mul.food },
                { label: 'Nápoje',   val: mul.napoje },
                { label: 'Vybavení', val: mul.vybaveni },
                { label: 'Rezerva',  val: mul.buffer },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <div className="text-xs text-stone-500">{m.label}</div>
                  <div className={`font-semibold text-sm mt-0.5 ${m.val > 1 ? 'text-amber-700' : m.val < 1 ? 'text-blue-700' : 'text-stone-700'}`}>
                    {mulPct(m.val)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section A: Mise en place */}
        {sheet.sekce_a?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Package} title="A – Mise en place (objednávky & příprava)" count={sheet.sekce_a.length} color="text-amber-700" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium">Položka</th>
                  <th className="text-left pb-2 font-medium">Kategorie</th>
                  <th className="text-right pb-2 font-medium">Množství</th>
                  <th className="text-right pb-2 font-medium">Jednotka</th>
                  <th className="text-right pb-2 font-medium">/ host</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.sekce_a.map((p, i) => (
                  <tr key={i} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 pr-4 font-medium text-stone-800">{p.nazev}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${KAT_COLOR[p.kategorie] || 'bg-stone-100 text-stone-600'}`}>
                        {p.kategorie}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold text-stone-900">{p.mnozstvi}</td>
                    <td className="py-2 pl-1.5 text-right text-stone-500">{p.jednotka}</td>
                    <td className="py-2 pl-4 text-right text-stone-400 text-xs">
                      {p.na_hosta != null ? p.na_hosta : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Section B: Kompletace */}
        {sheet.sekce_b?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={ChefHat} title="B – Kompletace (přehled pokrmů)" count={sheet.sekce_b.length} color="text-stone-700" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium w-8">#</th>
                  <th className="text-left pb-2 font-medium">Pokrm / položka</th>
                  <th className="text-right pb-2 font-medium">Počet porcí</th>
                  <th className="text-right pb-2 font-medium">Jednotka</th>
                  <th className="text-right pb-2 font-medium print:w-32">Hotovo v</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.sekce_b.map((p) => (
                  <tr key={p.poradi} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 text-stone-400 text-xs">{p.poradi}</td>
                    <td className="py-2 pr-4 font-medium text-stone-800">{p.nazev}</td>
                    <td className="py-2 text-right font-semibold text-stone-900">{p.porce}</td>
                    <td className="py-2 pl-1.5 text-right text-stone-500">{p.jednotka}</td>
                    <td className="py-2 pl-4 text-right">
                      <span className="inline-block w-20 border-b border-stone-300 text-xs text-stone-300">____</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Section C: Allergens */}
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <SectionHeader icon={AlertTriangle} title="C – Alergeny & diety" color="text-red-700" />
          {sheet.sekce_c_alergeny?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sheet.sekce_c_alergeny.map((a) => (
                <div key={a.alergen} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold text-red-700 mb-1">{a.alergen}</div>
                  <div className="text-xs text-red-600">{a.jidla.join(', ')}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">Na základě názvů položek nebyly detekovány žádné alergeny. Ručně ověřte ingredience.</p>
          )}
          <p className="text-xs text-stone-400 mt-3">
            * Detekce alergenů je automatická a orientační. Vždy ověřte složení u dodavatelů.
          </p>
        </div>

        {/* Section D: Personnel */}
        {sheet.sekce_d_personal?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Users} title="D – Personál (dle kalkulace)" count={sheet.sekce_d_personal.length} color="text-rose-700" />
            <div className="divide-y divide-stone-50">
              {sheet.sekce_d_personal.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-stone-800">{p.nazev}</span>
                  <span className="text-stone-600 font-medium">{p.mnozstvi} {p.jednotka}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section E: Logistics */}
        {sheet.sekce_e_logistika?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Truck} title="E – Logistika & vybavení" count={sheet.sekce_e_logistika.length} color="text-green-700" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium">Položka</th>
                  <th className="text-left pb-2 font-medium">Typ</th>
                  <th className="text-right pb-2 font-medium">Množství</th>
                  <th className="text-right pb-2 font-medium">Jednotka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.sekce_e_logistika.map((p, i) => (
                  <tr key={i} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 pr-4 font-medium text-stone-800">{p.nazev}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${KAT_COLOR[p.kategorie] || 'bg-stone-100 text-stone-600'}`}>
                        {p.kategorie}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold text-stone-900">{p.mnozstvi}</td>
                    <td className="py-2 pl-1.5 text-right text-stone-500">{p.jednotka}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Spotřeba detail */}
        {sheet.spotreba?.polozky?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Zap} title="Spotřeba s koeficienty (detail)" color="text-stone-600" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium">Položka</th>
                  <th className="text-right pb-2 font-medium">Základ</th>
                  <th className="text-right pb-2 font-medium">Upraveno</th>
                  <th className="text-right pb-2 font-medium">Rozdíl</th>
                  <th className="text-left pb-2 pl-3 font-medium">Kat.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.spotreba.polozky.map((p, i) => (
                  <tr key={i} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 pr-4 text-stone-800">{p.nazev}</td>
                    <td className="py-2 text-right text-stone-500">{p.base_mnozstvi} {p.jednotka}</td>
                    <td className="py-2 text-right font-semibold text-stone-900">{p.adjusted_mnozstvi} {p.jednotka}</td>
                    <td className={`py-2 text-right text-xs font-medium ${p.rozdil > 0 ? 'text-amber-700' : 'text-stone-400'}`}>
                      {p.rozdil > 0 ? `+${p.rozdil}` : p.rozdil}
                    </td>
                    <td className="py-2 pl-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs ${KAT_COLOR[p.kategorie] || 'bg-stone-100 text-stone-600'}`}>
                        {p.kategorie}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 pt-3 border-t border-stone-100 flex justify-end gap-6 text-sm">
              <span className="text-stone-500">Základní náklady: <strong>{sheet.spotreba.total_nakup_base?.toLocaleString('cs-CZ')} Kč</strong></span>
              <span className="text-stone-500">Upravené náklady: <strong>{sheet.spotreba.total_nakup_adjusted?.toLocaleString('cs-CZ')} Kč</strong></span>
              {sheet.spotreba.extra_naklady > 0 && (
                <span className="text-amber-700">Příplatek za koeficient: <strong>+{sheet.spotreba.extra_naklady?.toLocaleString('cs-CZ')} Kč</strong></span>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── ClientProposalPage ────────────────────────────────────────
// Public standalone page (no auth, no sidebar). Accessed via /nabidka/:token
import { useState as useStateCPP } from 'react';
import { useParams as useParamsCPP } from 'react-router-dom';
import { useQuery as useQueryCPP, useMutation as useMutationCPP, useQueryClient as useQueryClientCPP } from '@tanstack/react-query';
import { publicProposalApi } from '../api';

const EU_ALERGENY_ICONS = {
  1:'🌾',2:'🦐',3:'🥚',4:'🐟',5:'🥜',
  6:'🫘',7:'🥛',8:'🌰',9:'🌿',10:'🌼',
  11:'🌱',12:'🍷',13:'🌾',14:'🦑',
};

function czk2(n) {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n || 0);
}

function datum2(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ClientProposalPage() {
  const { token } = useParamsCPP();
  const qc = useQueryClientCPP();

  const [confirmModal, setConfirmModal] = useStateCPP(false);
  const [confirmForm, setConfirmForm] = useStateCPP({ signed_by: '', souhlas: false });
  const [noteOpen, setNoteOpen] = useStateCPP({});
  const [notes, setNotes] = useStateCPP({});
  const [confirmed, setConfirmed] = useStateCPP(null);

  const { data: raw, isLoading, error } = useQueryCPP({
    queryKey: ['pub-proposal', token],
    queryFn: () => publicProposalApi.get(token),
    staleTime: 0,
    retry: false,
  });

  const proposal = raw?.data;

  const selectMut = useMutationCPP({
    mutationFn: ({ polozka_id, je_vybrana }) =>
      publicProposalApi.select(token, { polozka_id, je_vybrana }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pub-proposal', token] }),
  });

  const noteMut = useMutationCPP({
    mutationFn: ({ polozka_id, poznamka }) =>
      publicProposalApi.note(token, { polozka_id, poznamka }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pub-proposal', token] }),
  });

  const confirmMut = useMutationCPP({
    mutationFn: (d) => publicProposalApi.confirm(token, d),
    onSuccess: (res) => {
      setConfirmed(res.data);
      setConfirmModal(false);
    },
  });

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-purple-50 flex items-center justify-center">
      <div className="text-stone-400 text-sm">Načítám nabídku…</div>
    </div>
  );

  if (error || !proposal) return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-purple-50 flex items-center justify-center">
      <div className="text-center max-w-sm mx-auto px-6">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-lg font-semibold text-stone-800 mb-2">Odkaz nenalezen</h1>
        <p className="text-sm text-stone-500">Tento odkaz neexistuje nebo vypršela jeho platnost.</p>
      </div>
    </div>
  );

  const locked = proposal.locked;
  const isSigned = proposal.status === 'signed';
  const selectedItems = (proposal.sekce || []).flatMap(s => (s.polozky || []).filter(p => p.je_vybrana));
  const totalPerPerson = selectedItems.reduce((sum, p) => sum + parseFloat(p.cena_os || 0), 0);
  const totalPrice = totalPerPerson * (proposal.guest_count || 1);

  if (confirmed || isSigned) {
    const signedBy = confirmed?.signed_by || proposal.signed_by;
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-700 to-emerald-600 p-8 text-center">
            <div className="text-5xl mb-3">✅</div>
            <h1 className="text-xl font-bold text-white">Výběr potvrzen!</h1>
            {signedBy && <p className="text-green-200 text-sm mt-1">Potvrdil(a): {signedBy}</p>}
          </div>
          <div className="p-6">
            <p className="text-stone-700 text-sm text-center mb-4">
              Váš výběr menu byl závazně potvrzen. Na email jsme zaslali souhrn Vašeho výběru.
            </p>
            {selectedItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Potvrzený výběr</div>
                {selectedItems.map(item => (
                  <div key={item.id} className="flex justify-between text-sm py-1.5 border-b border-stone-50 last:border-0">
                    <span className="text-stone-700">{item.nazev}</span>
                    <span className="text-stone-500 text-xs">{czk2(item.cena_os)} / os.</span>
                  </div>
                ))}
                <div className="pt-3 flex justify-between text-sm font-semibold">
                  <span className="text-stone-700">Celková cena ({proposal.guest_count} hostů)</span>
                  <span className="text-purple-700">{czk2(totalPrice)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="bg-stone-50 px-6 py-4 text-center">
            <p className="text-xs text-stone-400">Catering LD · info@catering-ld.cz</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-gradient-to-r from-[#2d1b69] to-[#5b21b6] text-white px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-purple-300 text-xs mb-1">🍽️ Výběr menu</div>
          <h1 className="text-lg font-bold">{proposal.nazev || 'Výběr menu'}</h1>
          {proposal.zakazka_nazev && (
            <p className="text-purple-200 text-sm mt-0.5">{proposal.zakazka_nazev}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-purple-200">
            {proposal.datum_akce && <span>📅 {datum2(proposal.datum_akce)}</span>}
            {proposal.misto && <span>📍 {proposal.misto}</span>}
            <span>👥 {proposal.guest_count} hostů</span>
          </div>
        </div>
      </div>

      {locked && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-2xl mx-auto text-sm text-amber-800 font-medium flex items-center gap-2">
            🔒 {isSigned ? 'Výběr byl závazně potvrzen.' : 'Výběr menu je uzamčen a nelze upravovat.'}
          </div>
        </div>
      )}

      {proposal.uvodni_text && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-white rounded-xl border border-purple-100 p-4 text-sm text-stone-700 leading-relaxed border-l-4 border-l-purple-400">
            {proposal.uvodni_text}
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-5 pb-40">
        {(proposal.sekce || []).map(sekce => {
          const selected = (sekce.polozky || []).filter(p => p.je_vybrana);
          const isMulti = sekce.typ === 'multi';
          const atMax = isMulti && selected.length >= sekce.max_vyberu;

          return (
            <div key={sekce.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-100 bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-stone-800">{sekce.nazev}</h2>
                    {sekce.popis && <p className="text-xs text-stone-500 mt-0.5">{sekce.popis}</p>}
                  </div>
                  <div className="flex-shrink-0 flex gap-1.5">
                    {isMulti ? (
                      <span className="inline-flex items-center bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                        Vyberte {sekce.min_vyberu}–{sekce.max_vyberu}
                      </span>
                    ) : (
                      <span className="inline-flex items-center bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                        Vyberte 1
                      </span>
                    )}
                    {sekce.povinne && (
                      <span className="inline-flex items-center bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full">Povinné</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-stone-50">
                {(sekce.polozky || []).map(item => {
                  const isSelected = item.je_vybrana;
                  const canSelect = !locked && (!atMax || isSelected);
                  const noteIsOpen = noteOpen[item.id];
                  const currentNote = notes[item.id] ?? item.poznamka_klienta ?? '';

                  return (
                    <div key={item.id} className={`transition-colors ${isSelected ? 'bg-purple-50' : 'bg-white'}`}>
                      <div
                        onClick={() => {
                          if (!canSelect && !isSelected) return;
                          if (locked) return;
                          selectMut.mutate({ polozka_id: item.id, je_vybrana: !isSelected });
                        }}
                        className={`flex gap-3 p-4 ${!locked ? 'cursor-pointer' : 'cursor-default'}`}>

                        <div className="flex-shrink-0">
                          {item.obrazek_url ? (
                            <img src={item.obrazek_url} alt={item.nazev}
                              className="w-16 h-16 rounded-xl object-cover"/>
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-stone-100 flex items-center justify-center text-2xl">🍽️</div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-semibold text-stone-800 leading-snug">{item.nazev}</div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-sm font-bold text-purple-700">{czk2(item.cena_os)}</div>
                              <div className="text-xs text-stone-400">/ os.</div>
                            </div>
                          </div>
                          {item.popis && <p className="text-xs text-stone-500 mt-1 leading-relaxed">{item.popis}</p>}
                          {item.alergeny_nazvy?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {item.alergeny_nazvy.map((name, i) => (
                                <span key={i} className="inline-flex items-center gap-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-1.5 py-0.5 rounded-md">
                                  {EU_ALERGENY_ICONS[item.alergeny?.[i]] || '⚠'} {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex items-center">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-purple-600 border-purple-600' :
                            canSelect ? 'border-stone-300 hover:border-purple-400' : 'border-stone-200 opacity-40'
                          }`}>
                            {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                          </div>
                        </div>
                      </div>

                      {isSelected && !locked && (
                        <div className="px-4 pb-3 -mt-1">
                          <button
                            onClick={() => setNoteOpen(n => ({ ...n, [item.id]: !n[item.id] }))}
                            className="text-xs text-stone-400 hover:text-purple-600 flex items-center gap-1 transition-colors">
                            {noteIsOpen ? '▾' : '▸'} {currentNote ? '📝 ' + currentNote.slice(0, 40) + (currentNote.length > 40 ? '…' : '') : 'Přidat speciální požadavek'}
                          </button>
                          {noteIsOpen && (
                            <div className="mt-2 flex gap-2">
                              <textarea
                                className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-purple-400"
                                rows={2}
                                placeholder="Alergie, bezlepková verze, jiná úprava…"
                                value={currentNote}
                                onChange={e => setNotes(n => ({ ...n, [item.id]: e.target.value }))}
                              />
                              <button
                                onClick={() => {
                                  noteMut.mutate({ polozka_id: item.id, poznamka: notes[item.id] ?? '' });
                                  setNoteOpen(n => ({ ...n, [item.id]: false }));
                                }}
                                className="flex-shrink-0 bg-purple-600 text-white text-xs px-3 py-1 rounded-lg hover:bg-purple-700 transition-colors self-start">
                                Uložit
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {isSelected && locked && item.poznamka_klienta && (
                        <div className="px-4 pb-3 -mt-1">
                          <span className="text-xs text-orange-600">⚠ {item.poznamka_klienta}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {proposal.expires_at && !isSigned && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            ⏰ Výběr musí být dokončen do: <strong>{datum2(proposal.expires_at)}</strong>
          </div>
        )}
      </div>

      {!locked && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-xl px-4 py-3 z-50">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-stone-500">Cena / os.</div>
              <div className="text-base font-bold text-stone-800">{czk2(totalPerPerson)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-stone-400">{proposal.guest_count} hostů</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-500">Celková cena</div>
              <div className="text-base font-bold text-purple-700">{czk2(totalPrice)}</div>
            </div>
            <button
              onClick={() => setConfirmModal(true)}
              disabled={selectedItems.length === 0}
              className="flex-shrink-0 bg-gradient-to-r from-[#2d1b69] to-[#5b21b6] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
              Potvrdit výběr
            </button>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <h2 className="text-base font-bold text-stone-800 mb-1">Závazné potvrzení výběru</h2>
              <p className="text-sm text-stone-500 mb-4">Po potvrzení již nebude možné výběr měnit.</p>
              <div className="bg-stone-50 rounded-xl p-3 mb-4 text-sm space-y-1">
                {selectedItems.map(item => (
                  <div key={item.id} className="flex justify-between">
                    <span className="text-stone-700">{item.nazev}</span>
                    <span className="text-stone-500 text-xs">{czk2(item.cena_os)} / os.</span>
                  </div>
                ))}
                <div className="border-t border-stone-200 pt-2 mt-2 flex justify-between font-semibold">
                  <span>Celkem ({proposal.guest_count} hostů)</span>
                  <span className="text-purple-700">{czk2(totalPrice)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Vaše jméno a příjmení *</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400"
                    placeholder="Jana Nováková"
                    value={confirmForm.signed_by}
                    onChange={e => setConfirmForm(f => ({ ...f, signed_by: e.target.value }))}
                    autoFocus
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmForm.souhlas}
                    onChange={e => setConfirmForm(f => ({ ...f, souhlas: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 accent-purple-600"
                  />
                  <span className="text-xs text-stone-600 leading-relaxed">
                    Souhlasím s výběrem menu a beru na vědomí, že tento výběr je závazný a nelze jej po potvrzení měnit.
                  </span>
                </label>
                {confirmMut.error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {confirmMut.error?.response?.data?.error || 'Chyba při potvrzení'}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button
                onClick={() => setConfirmModal(false)}
                className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors">
                Zrušit
              </button>
              <button
                onClick={() => confirmMut.mutate(confirmForm)}
                disabled={!confirmForm.signed_by.trim() || !confirmForm.souhlas || confirmMut.isPending}
                className="flex-1 bg-gradient-to-r from-[#2d1b69] to-[#5b21b6] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
                {confirmMut.isPending ? 'Potvrzuji…' : 'Závazně potvrdit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SablonyPage ────────────────────────────────────────────────
import { sablonyApi } from '../api';

const TYP_OPTIONS_S = [
  { v: '', l: '— universal (všechny typy) —' },
  { v: 'svatba', l: 'Svatba 💒' },
  { v: 'soukroma_akce', l: 'Soukromá akce 🥂' },
  { v: 'firemni_akce', l: 'Firemní akce 🏢' },
  { v: 'zavoz', l: 'Závoz / vyzvednutí 🚚' },
  { v: 'bistro', l: 'Bistro / pronájem ☕' },
  { v: 'pohreb', l: 'Pohřeb 🕯️' },
  { v: 'ostatni', l: 'Ostatní 📋' },
];

const emptySablonaForm = { nazev: '', popis: '', typ: '', cas_zacatek: '', cas_konec: '', misto: '', pocet_hostu: '', poznamka_klient: '', poznamka_interni: '', polozky: [] };
const emptyPolSablona = { kategorie: 'jidlo', nazev: '', jednotka: 'os.', mnozstvi: 1, cena_jednotka: 0 };

const KAT_SABLONA = [
  { v: 'jidlo',    l: 'Jídlo' },
  { v: 'napoj',    l: 'Nápoj' },
  { v: 'sladky',   l: 'Sladkosti' },
  { v: 'personal', l: 'Personál' },
  { v: 'ostatni',  l: 'Ostatní' },
];

export function SablonyPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null); // null = new, otherwise id
  const [form, setForm] = useState(emptySablonaForm);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addPol    = () => setForm(f => ({ ...f, polozky: [...f.polozky, { ...emptyPolSablona }] }));
  const remPol    = (i) => setForm(f => ({ ...f, polozky: f.polozky.filter((_, idx) => idx !== i) }));
  const updPol    = (i, k, v) => setForm(f => ({ ...f, polozky: f.polozky.map((p, idx) => idx === i ? { ...p, [k]: v } : p) }));

  const { data, isLoading } = useQuery({
    queryKey: ['sablony'],
    queryFn: () => sablonyApi.list().then(r => r.data.data),
  });
  const sablony = data || [];

  const createMut = useMutation({
    mutationFn: sablonyApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sablony'] }); toast.success('Šablona vytvořena'); setModal(false); },
    onError: () => toast.error('Chyba při ukládání'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => sablonyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sablony'] }); toast.success('Šablona uložena'); setModal(false); },
    onError: () => toast.error('Chyba při ukládání'),
  });
  const deleteMut = useMutation({
    mutationFn: sablonyApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sablony'] }); toast.success('Šablona smazána'); },
    onError: () => toast.error('Chyba při mazání'),
  });

  const openCreate = () => { setEditing(null); setForm(emptySablonaForm); setModal(true); };
  const openEdit = (s) => { setEditing(s.id); setForm({ nazev: s.nazev || '', popis: s.popis || '', typ: s.typ || '', cas_zacatek: s.cas_zacatek?.slice(0,5) || '', cas_konec: s.cas_konec?.slice(0,5) || '', misto: s.misto || '', pocet_hostu: s.pocet_hostu || '', poznamka_klient: s.poznamka_klient || '', poznamka_interni: s.poznamka_interni || '', polozky: s.polozky || [] }); setModal(true); };
  const handleSave = () => { editing ? updateMut.mutate({ id: editing, d: form }) : createMut.mutate(form); };
  const isPending = createMut.isPending || updateMut.isPending;

  const TYP_EMOJI = { svatba: '💒', soukroma_akce: '🥂', firemni_akce: '🏢', zavoz: '🚚', bistro: '☕', pohreb: '🕯️', ostatni: '📋' };
  const TYP_LABEL = { svatba: 'Svatba', soukroma_akce: 'Soukromá akce', firemni_akce: 'Firemní akce', zavoz: 'Závoz', bistro: 'Bistro', pohreb: 'Pohřeb', ostatni: 'Ostatní' };

  return (
    <div>
      <PageHeader
        title="Šablony zakázek"
        actions={<Btn variant="primary" onClick={openCreate}><Plus size={13}/> Nová šablona</Btn>}
      />

      <div className="p-6">
        {isLoading && <div className="text-sm text-stone-500">Načítám…</div>}

        {!isLoading && sablony.length === 0 && (
          <EmptyState icon={FileText} title="Žádné šablony"
            desc="Vytvořte šablonu pro opakující se typy akcí a ušetřete čas při zakládání zakázek." />
        )}

        {!isLoading && sablony.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sablony.map(s => (
              <div key={s.id} className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col gap-3 hover:border-stone-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {s.typ && <span className="text-xl shrink-0">{TYP_EMOJI[s.typ] || '📋'}</span>}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-stone-800 truncate">{s.nazev}</div>
                      {s.typ && <div className="text-xs text-stone-400">{TYP_LABEL[s.typ]}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-stone-400 hover:text-stone-700 rounded-md hover:bg-stone-100 transition-colors"><Pencil size={13}/></button>
                    <button onClick={() => window.confirm('Smazat šablonu?') && deleteMut.mutate(s.id)} className="p-1.5 text-stone-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"><Trash2 size={13}/></button>
                  </div>
                </div>
                {s.popis && <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">{s.popis}</p>}
                <div className="grid grid-cols-2 gap-1.5 text-xs text-stone-500 border-t border-stone-100 pt-3">
                  {(s.cas_zacatek || s.cas_konec) && (
                    <div>⏰ {s.cas_zacatek?.slice(0,5) || '?'} – {s.cas_konec?.slice(0,5) || '?'}</div>
                  )}
                  {s.misto && <div>📍 <span className="truncate">{s.misto}</span></div>}
                  {s.pocet_hostu > 0 && <div>👥 {s.pocet_hostu} hostů</div>}
                  {s.polozky?.length > 0 && (
                    <div className="col-span-2 flex items-center gap-1 text-violet-600 font-medium">
                      <FileText size={10}/> {s.polozky.length} položek v nabídce
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Upravit šablonu' : 'Nová šablona'}
        footer={<>
          <Btn onClick={() => setModal(false)}>Zrušit</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={!form.nazev || isPending}>
            {isPending ? 'Ukládám…' : (editing ? 'Uložit' : 'Vytvořit')}
          </Btn>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Název šablony *</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="např. Firemní oběd – standardní" value={form.nazev} onChange={e => set('nazev', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Popis (interní poznámka k šabloně)</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="Volitelný popis pro orientaci v šablonách" value={form.popis} onChange={e => set('popis', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Typ akce</label>
            <select className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.typ} onChange={e => set('typ', e.target.value)}>
              {TYP_OPTIONS_S.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Začátek</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={form.cas_zacatek} onChange={e => set('cas_zacatek', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Konec</label>
              <input type="time" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                value={form.cas_konec} onChange={e => set('cas_konec', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Místo konání</label>
            <input className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="Adresa nebo název místa" value={form.misto} onChange={e => set('misto', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Výchozí počet hostů</label>
            <input type="number" className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="0" value={form.pocet_hostu} onChange={e => set('pocet_hostu', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Poznámka pro klienta</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              rows={2} value={form.poznamka_klient} onChange={e => set('poznamka_klient', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Interní poznámka</label>
            <textarea className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              rows={2} value={form.poznamka_interni} onChange={e => set('poznamka_interni', e.target.value)} />
          </div>

          {/* Položky šablony */}
          <div className="border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-stone-700">Položky nabídky</label>
              <button type="button" onClick={addPol}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium">
                <Plus size={11}/> Přidat položku
              </button>
            </div>
            {form.polozky.length === 0 ? (
              <p className="text-xs text-stone-400 italic py-1">
                Žádné položky — po přidání se automaticky vytvoří nabídka při zakládání zakázky ze šablony.
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-1 text-xs text-stone-400 px-0.5 mb-0.5">
                  <span className="col-span-2">Kat.</span>
                  <span className="col-span-4">Název</span>
                  <span className="col-span-2">Jedn.</span>
                  <span className="col-span-1">Mn.</span>
                  <span className="col-span-2">Kč/j</span>
                </div>
                {form.polozky.map((pol, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <select
                      className="col-span-2 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      value={pol.kategorie} onChange={e => updPol(i, 'kategorie', e.target.value)}>
                      {KAT_SABLONA.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                    </select>
                    <input
                      className="col-span-4 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      placeholder="Název položky" value={pol.nazev}
                      onChange={e => updPol(i, 'nazev', e.target.value)} />
                    <input
                      className="col-span-2 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      placeholder="os." value={pol.jednotka}
                      onChange={e => updPol(i, 'jednotka', e.target.value)} />
                    <input type="number" min="0"
                      className="col-span-1 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      placeholder="1" value={pol.mnozstvi}
                      onChange={e => updPol(i, 'mnozstvi', e.target.value)} />
                    <input type="number" min="0"
                      className="col-span-2 border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      placeholder="0" value={pol.cena_jednotka}
                      onChange={e => updPol(i, 'cena_jednotka', e.target.value)} />
                    <button type="button" onClick={() => remPol(i)}
                      className="col-span-1 flex justify-center text-stone-300 hover:text-red-500 transition-colors">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── ArchivPage ─────────────────────────────────────────────────
import { archivApi, zakazkyApi as zakazkyApiArchiv, klientiApi as klientiApiArchiv, personalApi as personalApiArchiv } from '../api';
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
      if (druh === 'zakazka') return zakazkyApiArchiv.obnovit(id);
      if (druh === 'klient') return klientiApiArchiv.obnovit(id);
      return personalApiArchiv.obnovit(id);
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
