'use strict';
const express = require('express');
const { query } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/login-log – seznam záznamů (admin+)
router.get('/', auth, requireMinRole('super_admin'), async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '200', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const only_failures = req.query.only_failures === 'true';
    const user_id = req.query.user_id ? parseInt(req.query.user_id, 10) : null;

    const where = [];
    const params = [];

    if (only_failures) {
      where.push('l.uspech = false');
    }
    if (user_id) {
      params.push(user_id);
      where.push(`l.user_id = $${params.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    params.push(limit, offset);
    const { rows } = await query(`
      SELECT
        l.id, l.email, l.uspech, l.ip_adresa, l.user_agent, l.duvod, l.created_at,
        u.jmeno, u.prijmeni, u.role
      FROM login_log l
      LEFT JOIN uzivatele u ON u.id = l.user_id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    // Statistiky
    const { rows: [stats] } = await query(`
      SELECT
        COUNT(*)::int                                      AS total,
        COUNT(*) FILTER (WHERE uspech = true)::int        AS uspesnych,
        COUNT(*) FILTER (WHERE uspech = false)::int       AS neuspesnych,
        COUNT(*) FILTER (WHERE uspech = false AND created_at > NOW() - INTERVAL '24 hours')::int AS neuspesnych_24h
      FROM login_log
    `);

    res.json({ data: rows, stats });
  } catch (err) { next(err); }
});

// DELETE /api/login-log/old – smazat záznamy starší než N dní (super_admin)
router.delete('/old', auth, requireMinRole('super_admin'), async (req, res, next) => {
  try {
    const days = Math.max(parseInt(req.query.days || '90', 10), 7);
    const { rowCount } = await query(
      `DELETE FROM login_log WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [String(days)]
    );
    res.json({ deleted: rowCount, message: `Smazáno ${rowCount} záznamů starších než ${days} dní` });
  } catch (err) { next(err); }
});

module.exports = router;
