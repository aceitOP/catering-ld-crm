const router = require('express').Router();
const { query } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth, requireRole('admin'));

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
