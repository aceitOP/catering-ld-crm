import { useState, useEffect } from 'react';
import { useQuery, useMutation as useMutationKal, useQueryClient as useQueryClientKal } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { kalendarApi, googleCalendarApi, kapacityApi, nastaveniApi } from '../api';
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

export default KalendarPage;
