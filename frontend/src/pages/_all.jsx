// ── KalendarPage.jsx ─────────────────────────────────────────
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { kalendarApi, googleCalendarApi } from '../api';
import { TypBadge, StavBadge, formatDatum, formatCena } from '../components/ui';
import { ChevronDown } from 'lucide-react';

export function KalendarPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear]         = useState(now.getFullYear());
  const [month, setMonth]       = useState(now.getMonth());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  const [view, setView]             = useState('mesic');
  const [collapsed, setCollapsed]   = useState(new Set());

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
    return events.filter(e => e.datum_akce === ds);
  };
  const gcEventsForDay = (ds) => gcEvents.filter(e => gcDateStr(e.start) === ds);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

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
  };

  // ── Timeline helpers ──────────────────────────────────────────
  const timeToMin = (t) => { if (!t) return null; const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); };
  const TL_MIN_START  = 6 * 60;   // 6:00 = 360 min
  const TL_MIN_RANGE  = 18 * 60;  // 6:00–24:00 = 1080 min
  const HOUR_MARKS    = [6, 8, 10, 12, 14, 16, 18, 20, 22];
  const CZ_DAYS_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const todayStr = now.toISOString().slice(0, 10);

  // Týden: horizontal bar view – all 7 days (Mon–Sun) always visible
  const nowPct = ((now.getHours() * 60 + now.getMinutes() - TL_MIN_START) / TL_MIN_RANGE) * 100;
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(tlWinStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const crmEvts = events.filter(e => e.datum_akce === iso)
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
  const denAllDay = events.filter(e => {
    const s = timeToMin(e.cas_zacatek); const en = timeToMin(e.cas_konec);
    return s === null || en === null || en <= s;
  });
  const denTimed = events.filter(e => {
    const s = timeToMin(e.cas_zacatek); const en = timeToMin(e.cas_konec);
    return s !== null && en !== null && en > s;
  });
  // Google events for day view
  const gcDenEvts = gcEvents
    .filter(e => gcDateStr(e.start) === tlWinStart)
    .map(e => ({ ...e, _google: true, cas_zacatek: gcTimeStr(e.start), cas_konec: gcTimeStr(e.end) }));
  const gcDenAllDay = gcDenEvts.filter(e => !e.cas_zacatek || !e.cas_konec || timeToMin(e.cas_zacatek) === null);
  const gcDenTimed  = gcDenEvts.filter(e => e.cas_zacatek && e.cas_konec && timeToMin(e.cas_zacatek) !== null);

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
          </div>

          {/* Month picker (only in month view) */}
          {view === 'mesic' && (
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
          {view === 'mesic' ? (
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
                return (
                  <div key={i} className={`min-h-[120px] p-1.5 ${!d ? 'bg-stone-50/50' : isWeekend ? 'bg-stone-50/40' : 'bg-white'}`}>
                    {d && (
                      <>
                        <div className="mb-1 px-0.5">
                          <span className={`text-xs font-semibold inline-flex items-center justify-center w-7 h-7 rounded-full select-none ${isToday ? 'bg-brand-900 text-white' : evs.length > 0 ? 'text-stone-800 ring-2 ring-accent-DEFAULT/25' : isWeekend ? 'text-stone-400' : 'text-stone-600'}`}>{d}</span>
                          {(evs.length > 0 || gcEvs.length > 0) && (
                            <div className="flex gap-0.5 mt-0.5 ml-0.5">
                              {evs.slice(0, 3).map((e, i) => (
                                <span key={i} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TYP_DOT[e.typ] || 'bg-stone-400'}`} />
                              ))}
                              {gcEvs.length > 0 && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-500" />}
                            </div>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {evs.map(e => (
                            <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)} title={e.nazev}
                              className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer hover:opacity-75 transition-opacity ${TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700 border border-stone-200'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TYP_DOT[e.typ] || 'bg-stone-400'}`} />
                              <span className="truncate">{e.cas_zacatek ? e.cas_zacatek.slice(0, 5) + ' ' : ''}{e.nazev}</span>
                            </div>
                          ))}
                          {gcEvs.map(e => (
                            <div key={'gc-' + e.id} title={e.summary}
                              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-500" />
                              <span className="truncate">{gcTimeStr(e.start) ? gcTimeStr(e.start) + ' ' : ''}{e.summary}</span>
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

                {/* Timed event blocks */}
                {denTimed.map(e => {
                  const sMin    = timeToMin(e.cas_zacatek);
                  const eMin    = timeToMin(e.cas_konec);
                  const topPx   = Math.max((sMin - TL_MIN_START) / 60 * SLOT_H, 0);
                  const heightPx = Math.max((eMin - sMin) / 60 * SLOT_H, 32);
                  return (
                    <div key={e.id} onClick={() => navigate(`/zakazky/${e.id}`)}
                      style={{ top: `${topPx}px`, height: `${heightPx}px`, left: '10px', right: '10px' }}
                      className={`absolute rounded-lg border cursor-pointer hover:shadow-md hover:brightness-95 transition-all px-3 py-1.5 overflow-hidden z-10
                        ${TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700 border border-stone-200'}`}>
                      <div className="text-xs font-semibold leading-tight truncate">{e.nazev}</div>
                      <div className="text-xs opacity-70 mt-0.5">{e.cas_zacatek?.slice(0,5)} – {e.cas_konec?.slice(0,5)}</div>
                      {e.misto && heightPx > 60 && <div className="text-xs opacity-60 truncate mt-0.5">{e.misto}</div>}
                    </div>
                  );
                })}

                {/* Google timed event blocks */}
                {gcDenTimed.map(e => {
                  const sMin     = timeToMin(e.cas_zacatek);
                  const eMin     = timeToMin(e.cas_konec);
                  const topPx    = Math.max((sMin - TL_MIN_START) / 60 * SLOT_H, 0);
                  const heightPx = Math.max((eMin - sMin) / 60 * SLOT_H, 32);
                  return (
                    <div key={'gc-' + e.id}
                      style={{ top: `${topPx}px`, height: `${heightPx}px`, left: '10px', right: '10px' }}
                      className="absolute rounded-lg border bg-blue-50 text-blue-700 border-blue-200 px-3 py-1.5 overflow-hidden z-10">
                      <div className="text-xs font-semibold leading-tight truncate">{e.summary}</div>
                      <div className="text-xs opacity-70 mt-0.5">{e.cas_zacatek?.slice(0,5)} – {e.cas_konec?.slice(0,5)}</div>
                      {e.location && heightPx > 60 && <div className="text-xs opacity-60 truncate mt-0.5">{e.location}</div>}
                    </div>
                  );
                })}

                {/* Empty state */}
                {events.length === 0 && gcDenTimed.length === 0 && gcDenAllDay.length === 0 && (
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
                  <div className={`text-xs font-bold leading-tight ${isToday ? 'text-blue-600' : isWeekend ? 'text-stone-400' : 'text-stone-700'}`}>
                    {CZ_DAYS_SHORT[d.getDay()]} {d.getDate()}. {d.toLocaleString('cs-CZ', { month: 'short' })}
                  </div>
                );
                const gridLines = HOUR_MARKS.map(h => (
                  <div key={h}
                    style={{ left: `${((h * 60 - TL_MIN_START) / TL_MIN_RANGE) * 100}%` }}
                    className="absolute top-0 h-full border-l border-stone-100 pointer-events-none" />
                ));
                const nowLine = isToday && nowPct >= 0 && nowPct <= 100 && (
                  <div style={{ left: `${nowPct}%` }}
                    className="absolute top-0 h-full border-l-2 border-red-400/70 z-10 pointer-events-none" />
                );

                if (evts.length === 0) {
                  return (
                    <div key={date}
                      className={`flex items-center border-b border-stone-100 last:border-b-0 min-h-[40px] ${isToday ? 'bg-blue-50/20' : isWeekend ? 'bg-stone-50/60' : ''}`}>
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
                  <div key={date} className={`border-b border-stone-100 last:border-b-0 ${isToday ? 'bg-blue-50/20' : isWeekend ? 'bg-stone-50/40' : ''}`}>
                    {evts.map((e, ei) => {
                      const isGc     = !!e._google;
                      const sMin     = timeToMin(e.cas_zacatek);
                      const eMin     = timeToMin(e.cas_konec);
                      const hasTimes = sMin !== null && eMin !== null && eMin > sMin;
                      const barS     = hasTimes ? Math.max(sMin, TL_MIN_START) : TL_MIN_START;
                      const barE     = hasTimes ? Math.min(eMin, TL_MIN_START + TL_MIN_RANGE) : TL_MIN_START + TL_MIN_RANGE;
                      const leftPct  = ((barS - TL_MIN_START) / TL_MIN_RANGE) * 100;
                      const widthPct = Math.max(((barE - barS) / TL_MIN_RANGE) * 100, 0.8);
                      const chipCls  = isGc ? 'bg-blue-50 text-blue-700 border border-blue-200' : (TYP_CHIP[e.typ] || 'bg-stone-100 text-stone-700 border border-stone-200');
                      const dotCls   = isGc ? 'bg-blue-500' : (TYP_DOT[e.typ] || 'bg-stone-400');
                      const label    = isGc ? e.summary : e.nazev;
                      return (
                        <div key={(isGc ? 'gc-' : '') + e.id}
                          onClick={isGc ? undefined : () => navigate(`/zakazky/${e.id}`)}
                          className={`flex items-center min-h-[48px] transition-colors group ${isGc ? '' : 'cursor-pointer hover:bg-white/60'}`}>
                          <div className="w-[152px] flex-shrink-0 border-r border-stone-100 px-4 py-2 self-stretch flex items-center">
                            {ei === 0 ? (
                              <div>
                                {dateLbl}
                                <div className="flex items-center gap-1 mt-0.5">
                                  {evts.length > 1 && <span className="text-xs text-stone-400">{evts.length}×</span>}
                                  {!isGc && <StavBadge stav={e.stav} />}
                                  {isGc && <span className="text-xs text-blue-500 font-medium">Google</span>}
                                </div>
                              </div>
                            ) : (
                              <div className="ml-auto">
                                {!isGc && <StavBadge stav={e.stav} />}
                                {isGc && <span className="text-xs text-blue-500 font-medium">Google</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 relative" style={{ height: '48px' }}>
                            {gridLines}{nowLine}
                            <div
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              title={`${label}${hasTimes ? ` · ${e.cas_zacatek?.slice(0,5)}–${e.cas_konec?.slice(0,5)}` : ''}`}
                              className={`absolute top-1/2 -translate-y-1/2 rounded flex items-center px-2 overflow-hidden transition-all group-hover:opacity-85 group-hover:shadow-md
                                ${hasTimes ? 'h-7 shadow-sm' : 'h-2.5 opacity-40 rounded-full'}
                                ${chipCls}`}>
                              {hasTimes && (
                                <>
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-1.5 ${dotCls}`} />
                                  <span className="text-xs font-medium truncate whitespace-nowrap">
                                    {e.cas_zacatek?.slice(0,5)}–{e.cas_konec?.slice(0,5)}&nbsp;·&nbsp;{label}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PersonalPage.jsx ──────────────────────────────────────────
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { personalApi } from '../api';
import { PageHeader, EmptyState, Btn, Modal, Spinner, ExportMenu } from '../components/ui';
import toast from 'react-hot-toast';
import { Plus, UserCheck, Pencil, Trash2 as Trash2Personal } from 'lucide-react';

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

  const { data, isLoading } = useQuery({
    queryKey: ['personal'],
    queryFn: () => personalApi.list(),
  });

  const specsToArr = (s) => typeof s === 'string' ? s.split(',').map(x => x.trim()).filter(Boolean) : (s || []);

  const createMut = useMutation({
    mutationFn: (d) => personalApi.create({ ...d, specializace: specsToArr(d.specializace) }),
    onSuccess: () => { qc.invalidateQueries(['personal']); toast.success('Osoba přidána'); setModal(false); setForm(EMPTY_PERSON); },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => personalApi.update(d.id, { ...d, specializace: specsToArr(d.specializace) }),
    onSuccess: () => { qc.invalidateQueries(['personal']); toast.success('Uloženo'); setEditModal(false); setEditPerson(null); },
    onError: () => toast.error('Chyba při ukládání'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => personalApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['personal']); toast.success('Osoba smazána'); },
    onError: () => toast.error('Chybu při mazání'),
  });

  const personal = data?.data?.data || [];
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
    Promise.all([...selP].map(id => personalApi.delete(id))).then(() => { qc.invalidateQueries(['personal']); setSelP(new Set()); toast.success('Osoby smazány'); });
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
        <button onClick={() => handleDelete(p)}
          className="p-1.5 rounded-md bg-stone-100 hover:bg-red-100 text-stone-500 hover:text-red-600 transition-colors"
          title="Smazat">
          <Trash2Personal size={12}/>
        </button>
      </div>
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
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu data={personal} columns={PERSONAL_EXPORT_COLS} filename="personal"/>
            <Btn variant="primary" size="sm" onClick={() => setModal(true)}><Plus size={12}/> Přidat osobu</Btn>
          </div>
        }/>
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
    Promise.all([...selD].map(id => dokumentyApi.delete(id))).then(() => { qc.invalidateQueries(['dokumenty']); setSelD(new Set()); toast.success('Dokumenty smazány'); });
  };

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
              <th className="pl-4 pr-2 py-3 w-8"><input type="checkbox" checked={docs.length>0&&docs.every(r=>selD.has(r.id))} onChange={() => setSelD(docs.every(r=>selD.has(r.id))?new Set():new Set(docs.map(r=>r.id)))} className="rounded cursor-pointer"/></th>
              {['Název','Kategorie','Velikost','Nahráno','Akce'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-stone-500">{h}</th>)}
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
import { Tag } from 'lucide-react';

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
    onSuccess: () => { qc.invalidateQueries(['cenik']); toast.success('Položka přidána'); setModal(false); },
  });

  const addKatMut = useMutation({
    mutationFn: (d) => cenikApi.addKategorie(d),
    onSuccess: (res) => {
      qc.invalidateQueries(['cenik-kategorie']);
      toast.success('Kategorie přidána');
      setKatModal(false);
      setKatForm({ nazev: '' });
      setForm(f => ({ ...f, kategorie: res.data.hodnota }));
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při přidávání kategorie'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => cenikApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['cenik']); setEditRow(null); toast.success('Cena aktualizována'); },
  });

  const kategorie = katData?.data?.data || [];
  const items = data?.data?.data || [];
  const grouped = items.reduce((acc, item) => { (acc[item.kategorie] = acc[item.kategorie]||[]).push(item); return acc; }, {});
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
  const nabidky = data?.data?.data || [];
  const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0}).format(n);
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('cs-CZ') : '—';

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
              {['Nabídka','Zakázka','Klient','Stav','Platnost','Cena celkem'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-stone-500">{h}</th>)}
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
    onSuccess: () => { qc.invalidateQueries(['nabidka', id]); qc.invalidateQueries(['nabidky']); toast.success('Nabídka odeslána emailem'); setEmailModal(false); },
    onError: (err) => toast.error(err?.response?.data?.error || 'Chyba při odesílání'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => nabidkyApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['nabidka', id]); qc.invalidateQueries(['nabidky']); toast.success('Nabídka uložena'); setEditMode(false); },
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
                  <Btn key={s} onClick={() => nabidkyApi.setStav(n.id,{stav:s}).then(()=>{ qc.invalidateQueries(['nabidka',id]); toast.success('Stav aktualizován'); })}>
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
import { nastaveniApi, uzivateleApi, authApi, googleCalendarApi } from '../api';
import { Settings } from 'lucide-react';

export function NastaveniPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('firma');
  const [form, setForm] = useState({});
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ jmeno:'', prijmeni:'', email:'', heslo:'', role:'obchodnik', telefon:'' });
  const [passForm, setPassForm] = useState({ stare_heslo:'', nove_heslo:'', nove_heslo2:'' });

  const { data: nastavData } = useQuery({ queryKey:['nastaveni'], queryFn: nastaveniApi.get });
  const { data: uzivData }   = useQuery({ queryKey:['uzivatele'], queryFn: uzivateleApi.list, enabled: tab==='uziv' });

  useEffect(() => { if (nastavData?.data) setForm(nastavData.data); }, [nastavData]);

  const saveMut  = useMutation({ mutationFn: nastaveniApi.update, onSuccess: () => toast.success('Nastavení uloženo') });
  const userMut  = useMutation({ mutationFn: uzivateleApi.create, onSuccess: () => { qc.invalidateQueries(['uzivatele']); toast.success('Uživatel přidán'); setUserModal(false); } });
  const toggleMut = useMutation({ mutationFn: ({id,aktivni}) => uzivateleApi.update(id,{aktivni}), onSuccess: () => qc.invalidateQueries(['uzivatele']) });
  const passMut  = useMutation({
    mutationFn: (d) => authApi.changePassword({ stare_heslo: d.stare_heslo, nove_heslo: d.nove_heslo }),
    onSuccess: () => { toast.success('Heslo bylo úspěšně změněno'); setPassForm({ stare_heslo:'', nove_heslo:'', nove_heslo2:'' }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Chyba při změně hesla'),
  });

  const TABS = [['firma','Profil firmy'],['uziv','Uživatelé'],['heslo','Změna hesla'],['notif','Notifikace'],['integrace','Integrace'],['google','Google Kalendář']];

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
import { zakazkyApi } from '../api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox, Check, X as XIcon, Phone, Mail, MapPin, Users, Banknote } from 'lucide-react';

const TYP_LABELS_P = { svatba:'Svatba', soukroma_akce:'Soukromá akce', firemni_akce:'Firemní akce', zavoz:'Závoz', bistro:'Bistro' };
const TYP_CHIP_P   = { svatba:'bg-blue-50 text-blue-700', soukroma_akce:'bg-orange-50 text-orange-700', firemni_akce:'bg-emerald-50 text-emerald-700', zavoz:'bg-violet-50 text-violet-700', bistro:'bg-amber-50 text-amber-700' };

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
    onSuccess: (_, id) => { qc.invalidateQueries(['poptavky']); qc.invalidateQueries(['zakazky']); navigate(`/zakazky/${id}`); },
  });
  const stornMut = useMutation({
    mutationFn: (id) => zakazkyApi.setStav(id, { stav: 'stornovano' }),
    onSuccess: () => { qc.invalidateQueries(['poptavky']); toast.success('Poptávka stornována'); },
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

const TYP_LABELS_R = { svatba:'Svatba', soukroma_akce:'Soukromá akce', firemni_akce:'Firemní akce', zavoz:'Závoz', bistro:'Bistro' };

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
  const zakazky = report?.zakazky || [];

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
                    {['Datum','Zakázka','Klient','Typ','Cena','Náklady','Zisk'].map(h =>
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-stone-500">{h}</th>)}
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
