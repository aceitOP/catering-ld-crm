'use strict';
const router = require('express').Router();
const { query } = require('../db');
const { auth } = require('../middleware/auth');

// ── GET /api/followup ─────────────────────────────────────────
// Vrátí seznam follow-up úkolů. Parametry: zakazka_id, splneno (true/false), limit.
router.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, splneno, limit = 50 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const where = [];
    const params = [];
    let p = 1;

    if (zakazka_id) { where.push(`f.zakazka_id = $${p++}`); params.push(zakazka_id); }
    if (splneno !== undefined) {
      where.push(`f.splneno = $${p++}`);
      params.push(splneno === 'true');
    }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(`
      SELECT f.*,
             z.nazev   AS zakazka_nazev,
             z.cislo   AS zakazka_cislo,
             z.datum_akce,
             u.jmeno   AS splnil_jmeno,
             u.prijmeni AS splnil_prijmeni
      FROM followup_ukoly f
      JOIN zakazky z ON z.id = f.zakazka_id
      LEFT JOIN uzivatele u ON u.id = f.splneno_by
      ${wc}
      ORDER BY f.splneno ASC, f.termin ASC NULLS LAST, f.created_at ASC
      LIMIT $${p++}
    `, [...params, safeLimit]);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ── POST /api/followup ────────────────────────────────────────
router.post('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, typ = 'vlastni', titulek, termin, poznamka } = req.body;
    if (!zakazka_id || !titulek) return res.status(400).json({ error: 'zakazka_id a titulek jsou povinné' });

    const { rows } = await query(`
      INSERT INTO followup_ukoly (zakazka_id, typ, titulek, termin, poznamka)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [zakazka_id, typ, titulek, termin || null, poznamka || null]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /api/followup/:id ───────────────────────────────────
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['titulek', 'termin', 'poznamka', 'splneno'];
    const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'Žádná platná pole' });

    // Pokud splneno=true, nastav splneno_at a splneno_by
    let extraSets = '';
    let extraVals = [];
    if (req.body.splneno === true) {
      extraSets = `, splneno_at = NOW(), splneno_by = $${fields.length + 2}`;
      extraVals = [req.user.id];
    } else if (req.body.splneno === false) {
      extraSets = ', splneno_at = NULL, splneno_by = NULL';
    }

    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const vals = fields.map(f => req.body[f]);

    const { rows } = await query(
      `UPDATE followup_ukoly SET ${sets}${extraSets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...vals, ...extraVals]);

    if (!rows[0]) return res.status(404).json({ error: 'Úkol nenalezen' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /api/followup/:id ──────────────────────────────────
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM followup_ukoly WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Úkol nenalezen' });
    res.json({ message: 'Úkol smazán' });
  } catch (err) { next(err); }
});

module.exports = router;
