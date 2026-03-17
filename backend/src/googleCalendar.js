'use strict';

const { google } = require('googleapis');
const { query }  = require('./db');

function isConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

async function getCalendarClient() {
  if (!isConfigured()) return null;
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const authClient = await auth.getClient();
    return google.calendar({ version: 'v3', auth: authClient });
  } catch (err) {
    console.error('[GoogleCalendar] Chyba inicializace klienta:', err.message);
    return null;
  }
}

async function getCalendarId() {
  const { rows } = await query(
    "SELECT hodnota FROM nastaveni WHERE klic = 'google_calendar_id' LIMIT 1"
  );
  return rows[0]?.hodnota || null;
}

function buildEvent(zakazka) {
  const datum = zakazka.datum_akce
    ? new Date(zakazka.datum_akce).toISOString().slice(0, 10)
    : null;
  if (!datum) return null;

  const klient = zakazka.klient_firma
    || [zakazka.klient_jmeno, zakazka.klient_prijmeni].filter(Boolean).join(' ')
    || 'Neznámý klient';
  const summary = `${(zakazka.typ || 'Akce').replace(/_/g, ' ')} – ${klient} (${zakazka.cislo})`;

  const start = zakazka.cas_zacatek
    ? { dateTime: `${datum}T${zakazka.cas_zacatek}:00`, timeZone: 'Europe/Prague' }
    : { date: datum };

  let endCas = zakazka.cas_konec;
  if (!endCas && zakazka.cas_zacatek) {
    const [h, m] = zakazka.cas_zacatek.split(':').map(Number);
    endCas = `${String((h + 4) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const end = endCas
    ? { dateTime: `${datum}T${endCas}:00`, timeZone: 'Europe/Prague' }
    : { date: datum };

  const descParts = [
    zakazka.pocet_hostu  && `Hosté: ${zakazka.pocet_hostu}`,
    zakazka.cena_celkem  && `Cena: ${Number(zakazka.cena_celkem).toLocaleString('cs-CZ')} Kč`,
    zakazka.poznamka_interni && `Poznámka: ${zakazka.poznamka_interni}`,
  ].filter(Boolean);

  return {
    summary,
    location:    zakazka.misto    || undefined,
    description: descParts.join('\n') || undefined,
    start,
    end,
  };
}

async function upsertEvent(zakazka) {
  if (!isConfigured()) return null;
  try {
    const cal = await getCalendarClient();
    if (!cal) return null;

    const calendarId = await getCalendarId();
    if (!calendarId) {
      console.warn('[GoogleCalendar] google_calendar_id není nastaven v Nastavení');
      return null;
    }

    const event = buildEvent(zakazka);
    if (!event) return null;

    if (zakazka.google_event_id) {
      const res = await cal.events.update({
        calendarId,
        eventId: zakazka.google_event_id,
        requestBody: event,
      });
      return res.data;
    } else {
      const res = await cal.events.insert({ calendarId, requestBody: event });
      if (res.data.id && zakazka.id) {
        await query('UPDATE zakazky SET google_event_id = $1 WHERE id = $2',
          [res.data.id, zakazka.id]);
      }
      return res.data;
    }
  } catch (err) {
    console.error('[GoogleCalendar] upsertEvent chyba:', err.message);
    return null;
  }
}

async function deleteEvent(eventId) {
  if (!isConfigured() || !eventId) return null;
  try {
    const cal = await getCalendarClient();
    if (!cal) return null;

    const calendarId = await getCalendarId();
    if (!calendarId) return null;

    await cal.events.delete({ calendarId, eventId });
    return true;
  } catch (err) {
    if (err.code === 404 || err.code === 410) return null; // already deleted
    console.error('[GoogleCalendar] deleteEvent chyba:', err.message);
    return null;
  }
}

async function listEvents(od, doo) {
  if (!isConfigured()) return [];
  try {
    const cal = await getCalendarClient();
    if (!cal) return [];

    const calendarId = await getCalendarId();
    if (!calendarId) return [];

    const res = await cal.events.list({
      calendarId,
      timeMin: od  ? new Date(od).toISOString()  : new Date().toISOString(),
      timeMax: doo ? new Date(doo).toISOString() : undefined,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
    });

    return (res.data.items || []).map(e => ({
      id:       e.id,
      title:    e.summary,
      start:    e.start?.dateTime || e.start?.date,
      end:      e.end?.dateTime   || e.end?.date,
      location: e.location,
      source:   'google',
    }));
  } catch (err) {
    console.error('[GoogleCalendar] listEvents chyba:', err.message);
    return [];
  }
}

async function testConnection() {
  if (!isConfigured()) {
    return { connected: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON není nastaven' };
  }
  try {
    const cal = await getCalendarClient();
    if (!cal) return { connected: false, reason: 'Nepodařilo se inicializovat Google Auth' };

    const calendarId = await getCalendarId();
    if (!calendarId) {
      return { connected: false, reason: 'google_calendar_id není nastaven v Nastavení' };
    }

    await cal.calendars.get({ calendarId });
    return { connected: true };
  } catch (err) {
    return { connected: false, reason: err.message };
  }
}

module.exports = { isConfigured, getCalendarClient, upsertEvent, deleteEvent, listEvents, testConnection };
