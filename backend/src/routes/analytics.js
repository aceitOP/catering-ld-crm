'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');

const MODULE_KEY_RE = /^[a-z0-9_-]{1,80}$/i;

function normalizeModuleKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return MODULE_KEY_RE.test(key) ? key : '';
}

router.post('/module-usage', auth, async (req, res, next) => {
  try {
    const moduleKey = normalizeModuleKey(req.body?.module_key);
    const path = String(req.body?.path || '').trim().slice(0, 500);
    if (!moduleKey || !path.startsWith('/')) {
      return res.status(400).json({ error: 'Neplatny zaznam pouziti modulu' });
    }
    await query(
      `INSERT INTO module_usage_events (user_id, module_key, path)
       VALUES ($1, $2, $3)`,
      [req.user?.id || null, moduleKey, path]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/module-usage/summary', auth, requireMinRole('super_admin'), async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10) || 30, 1), 365);
    const params = [days];
    const [summary, daily, users, recent] = await Promise.all([
      query(
        `SELECT module_key,
                COUNT(*)::int AS visits,
                COUNT(DISTINCT user_id)::int AS users,
                MAX(created_at) AS last_used_at
         FROM module_usage_events
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY module_key
         ORDER BY visits DESC`,
        params
      ),
      query(
        `SELECT module_key,
                DATE(created_at) AS day,
                COUNT(*)::int AS visits
         FROM module_usage_events
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY module_key, DATE(created_at)
         ORDER BY day DESC, visits DESC`,
        params
      ),
      query(
        `SELECT u.id, u.jmeno, u.prijmeni, u.email,
                COUNT(e.id)::int AS visits,
                COUNT(DISTINCT e.module_key)::int AS modules_used,
                MAX(e.created_at) AS last_used_at
         FROM module_usage_events e
         LEFT JOIN uzivatele u ON u.id = e.user_id
         WHERE e.created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY u.id, u.jmeno, u.prijmeni, u.email
         ORDER BY visits DESC
         LIMIT 20`,
        params
      ),
      query(
        `SELECT e.module_key, e.path, e.created_at,
                u.jmeno, u.prijmeni, u.email
         FROM module_usage_events e
         LEFT JOIN uzivatele u ON u.id = e.user_id
         ORDER BY e.created_at DESC
         LIMIT 40`
      ),
    ]);
    res.json({
      days,
      summary: summary.rows,
      daily: daily.rows,
      users: users.rows,
      recent: recent.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
