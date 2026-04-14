const router = require('express').Router();
const { query } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');

// GET /api/sablony
router.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM zakazky_sablony ORDER BY nazev ASC');
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/sablony/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM zakazky_sablony WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Šablona nenalezena' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/sablony
router.post('/', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { nazev, popis, typ, cas_zacatek, cas_konec, misto, pocet_hostu, poznamka_klient, poznamka_interni, polozky } = req.body;
    if (!nazev) return res.status(400).json({ error: 'Název šablony je povinný' });
    const { rows } = await query(
      `INSERT INTO zakazky_sablony (nazev, popis, typ, cas_zacatek, cas_konec, misto, pocet_hostu, poznamka_klient, poznamka_interni, polozky)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [nazev, popis, typ, cas_zacatek || null, cas_konec || null, misto, pocet_hostu || 0, poznamka_klient, poznamka_interni,
       JSON.stringify(Array.isArray(polozky) ? polozky : [])]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/sablony/:id
router.patch('/:id', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const allowed = ['nazev','popis','typ','cas_zacatek','cas_konec','misto','pocet_hostu','poznamka_klient','poznamka_interni','polozky'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'Žádná platná pole' });
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE zakazky_sablony SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => req.body[f] ?? null)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Šablona nenalezena' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/sablony/:id
router.delete('/:id', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM zakazky_sablony WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Šablona nenalezena' });
    res.json({ message: 'Šablona smazána' });
  } catch (err) { next(err); }
});

module.exports = router;
