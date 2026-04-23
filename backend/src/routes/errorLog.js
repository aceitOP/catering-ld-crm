const router = require('express').Router();
const { query } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');
const { logUserReport } = require('../errorLog');

router.post('/report', auth, async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    const description = String(req.body?.description || '').trim();

    if (message.length < 5) {
      return res.status(400).json({ error: 'Popis chyby musi mit alespon 5 znaku' });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: 'Strucny popis chyby muze mit maximalne 500 znaku' });
    }
    if (description.length > 5000) {
      return res.status(400).json({ error: 'Detailni popis chyby muze mit maximalne 5000 znaku' });
    }

    await logUserReport({
      message,
      path: req.body?.path || req.body?.current_path || null,
      userId: req.user?.id || null,
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent'),
      meta: {
        description: description || null,
        page_title: req.body?.page_title || null,
        app_version: req.body?.app_version || null,
        viewport: req.body?.viewport || null,
        created_at_client: req.body?.created_at_client || null,
      },
    });

    res.status(201).json({ message: 'Hlaseni chyby bylo odeslano' });
  } catch (err) { next(err); }
});

router.use(auth, requireMinRole('super_admin'));

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '100', 10), 1), 500);
    const unresolvedOnly = req.query.unresolved === 'true';
    const where = [];
    const params = [];

    if (unresolvedOnly) {
      params.push(false);
      where.push(`el.resolved = $${params.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const { rows } = await query(
      `SELECT
         el.id, el.source, el.method, el.path, el.status_code, el.error_message,
         el.stack_trace, el.ip_address, el.user_agent, el.meta, el.resolved,
         el.resolved_at, el.created_at, el.user_id, el.resolved_by,
         u.email AS user_email,
         rb.email AS resolved_by_email
       FROM error_logs el
       LEFT JOIN uzivatele u ON u.id = el.user_id
       LEFT JOIN uzivatele rb ON rb.id = el.resolved_by
       ${whereClause}
       ORDER BY el.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    const { rows: [stats] } = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE resolved = false)::int AS unresolved
       FROM error_logs`
    );

    res.json({ data: rows, stats });
  } catch (err) { next(err); }
});

router.patch('/:id/resolve', async (req, res, next) => {
  try {
    const resolved = req.body?.resolved !== false;
    const { rows } = await query(
      `UPDATE error_logs
       SET resolved = $2,
           resolved_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           resolved_by = CASE WHEN $2 THEN $3 ELSE NULL END
       WHERE id = $1
       RETURNING id, resolved, resolved_at, resolved_by`,
      [req.params.id, resolved, req.user.id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Záznam nenalezen' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/resolved', async (_req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM error_logs WHERE resolved = true');
    res.json({ ok: true, deleted: rowCount });
  } catch (err) { next(err); }
});

module.exports = router;
