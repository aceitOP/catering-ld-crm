'use strict';
const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { listEvents, testConnection, isConfigured } = require('../googleCalendar');

// GET /api/google-calendar/events?od=YYYY-MM-DD&do=YYYY-MM-DD
router.get('/events', auth, async (req, res, next) => {
  try {
    const { od, do: doo } = req.query;
    if (!od || !doo) return res.status(400).json({ error: 'Parametry od a do jsou povinné' });

    const events = await listEvents(od, doo);
    res.json({ data: events });
  } catch (err) { next(err); }
});

// GET /api/google-calendar/status – test připojení
router.get('/status', auth, async (_req, res, next) => {
  try {
    const configured = isConfigured();
    if (!configured) return res.json({ connected: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON není nastaven' });

    const connected = await testConnection();
    res.json({ connected, reason: connected ? null : 'Nepodařilo se připojit ke Google Calendar (zkontrolujte Calendar ID a oprávnění service accountu)' });
  } catch (err) { next(err); }
});

module.exports = router;
