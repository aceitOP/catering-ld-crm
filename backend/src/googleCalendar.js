'use strict';
const { google } = require('googleapis');
const { query }  = require('./db');

// ── Helpers ───────────────────────────────────────────────────

function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  const credentials = JSON.parse(json);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

async function getCalendarId() {
  const { rows } = await query(`SELECT hodnota FROM nastaveni WHERE klic = 'google_calendar_id'`);
  return rows[0]?.hodnota || null;
}

function buildDateTime(date, time) {
  if (!date) return null;
  const d = typeof date === 'string' ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10);
  if (!time) return { date: d }; // all-day event
  const t = typeof time === 'string' ? time.slice(0, 5) : time;
  return { dateTime: `${d}T${t}:00`, timeZone: 'Europe/Prague' };
}

function buildEventResource(zakazka) {
  const klient = zakazka.klient_firma
    || [zakazka.klient_jmeno, zakazka.klient_prijmeni].filter(Boolean).join(' ')
    || 'Neznámý klient';

  const TYP = { svatba:'Svatba', soukroma_akce:'Soukromá akce', firemni_akce:'Firemní akce', zavoz:'Závoz', bistro:'Bistro' };
  const typLabel = TYP[zakazka.typ] || zakazka.typ || 'Akce';

  const start = buildDateTime(zakazka.datum_akce, zakazka.cas_zacatek);
  // Default end: start + 4 hours, or explicit cas_konec
  let end;
  if (zakazka.cas_konec) {
    end = buildDateTime(zakazka.datum_akce, zakazka.cas_konec);
  } else if (start?.dateTime) {
    const endDate = new Date(start.dateTime);
    endDate.setHours(endDate.getHours() + 4);
    end = { dateTime: endDate.toISOString().slice(0, 19), timeZone: 'Europe/Prague' };
  } else if (start?.date) {
    end = { date: start.date };
  }

  const descParts = [];
  if (zakazka.pocet_hostu) descParts.push(`Hostů: ${zakazka.pocet_hostu}`);
  if (zakazka.cena_celkem) descParts.push(`Cena: ${Number(zakazka.cena_celkem).toLocaleString('cs-CZ')} Kč`);
  if (zakazka.cislo) descParts.push(`Zakázka: ${zakazka.cislo}`);
  if (zakazka.poznamka_interni) descParts.push(`\nPoznámka: ${zakazka.poznamka_interni}`);

  return {
    summary:     `${typLabel} – ${klient}`,
    location:    zakazka.misto || undefined,
    description: descParts.join(' · '),
    start:       start || { date: new Date().toISOString().slice(0, 10) },
    end:         end   || start || { date: new Date().toISOString().slice(0, 10) },
    colorId:     '2', // sage green
  };
}

// ── Public API ────────────────────────────────────────────────

/**
 * Upsert (create or update) a Google Calendar event for a zakázka.
 * Returns the Google event ID, or null if not configured.
 */
async function upsertEvent(zakazka) {
  if (!isConfigured()) return null;
  const auth = getAuth();
  if (!auth) return null;
  const calendarId = await getCalendarId();
  if (!calendarId) return null;

  try {
    const calendar  = google.calendar({ version: 'v3', auth });
    const resource  = buildEventResource(zakazka);
    const existingId = zakazka.google_event_id;

    if (existingId) {
      // Update existing event
      await calendar.events.update({ calendarId, eventId: existingId, requestBody: resource });
      return existingId;
    } else {
      // Create new event
      const res = await calendar.events.insert({ calendarId, requestBody: resource });
      const eventId = res.data.id;
      // Persist event ID back to DB
      await query('UPDATE zakazky SET google_event_id = $1 WHERE id = $2', [eventId, zakazka.id]);
      return eventId;
    }
  } catch (err) {
    console.error('Google Calendar upsertEvent error:', err.message);
    return null;
  }
}

/**
 * Delete a Google Calendar event.
 */
async function deleteEvent(eventId) {
  if (!isConfigured() || !eventId) return;
  const auth = getAuth();
  if (!auth) return;
  const calendarId = await getCalendarId();
  if (!calendarId) return;

  try {
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({ calendarId, eventId });
  } catch (err) {
    // 404 = already deleted – ignore
    if (err.code !== 404) console.error('Google Calendar deleteEvent error:', err.message);
  }
}

/**
 * List events from Google Calendar for a given date range.
 * Returns array of { id, summary, start, end, location } or empty array.
 */
async function listEvents(od, doo) {
  if (!isConfigured()) return [];
  const auth = getAuth();
  if (!auth) return [];
  const calendarId = await getCalendarId();
  if (!calendarId) return [];

  try {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.list({
      calendarId,
      timeMin: new Date(od  + 'T00:00:00+02:00').toISOString(),
      timeMax: new Date(doo + 'T23:59:59+02:00').toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    return (res.data.items || []).map(ev => ({
      id:       ev.id,
      summary:  ev.summary || '(bez názvu)',
      start:    ev.start?.dateTime || ev.start?.date,
      end:      ev.end?.dateTime   || ev.end?.date,
      location: ev.location || null,
      source:   'google',
    }));
  } catch (err) {
    console.error('Google Calendar listEvents error:', err.message);
    return [];
  }
}

/**
 * Test connectivity – returns true if calendar can be accessed.
 */
async function testConnection() {
  if (!isConfigured()) return false;
  const auth = getAuth();
  if (!auth) return false;
  const calendarId = await getCalendarId();
  if (!calendarId) return false;

  try {
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.calendars.get({ calendarId });
    return true;
  } catch {
    return false;
  }
}

module.exports = { upsertEvent, deleteEvent, listEvents, testConnection, isConfigured };
