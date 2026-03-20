const express = require('express');
const { query } = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id } = req.query;
    const { rows } = await query(
      'SELECT * FROM kalkulace WHERE zakazka_id = $1 ORDER BY verze DESC',
      [zakazka_id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM kalkulace WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Kalkulace nenalezena' });
    const polozky = await query('SELECT * FROM kalkulace_polozky WHERE kalkulace_id = $1 ORDER BY kategorie, poradi', [req.params.id]);
    res.json({ ...rows[0], polozky: polozky.rows });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, nazev, pocet_hostu, marze_procent, sleva_procent, dph_sazba, polozky } = req.body;
    const maxVer = await query('SELECT COALESCE(MAX(verze),0) AS v FROM kalkulace WHERE zakazka_id = $1', [zakazka_id]);
    const { rows } = await query(
      `INSERT INTO kalkulace (zakazka_id, verze, nazev, pocet_hostu, marze_procent, sleva_procent, dph_sazba)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [zakazka_id, maxVer.rows[0].v + 1, nazev, pocet_hostu, marze_procent || 30, sleva_procent || 0, dph_sazba || 12]);

    for (const [i, pol] of (polozky || []).entries()) {
      await query(
        `INSERT INTO kalkulace_polozky (kalkulace_id, cenik_id, kategorie, nazev, jednotka, mnozstvi, cena_nakup, cena_prodej, poradi)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [rows[0].id, pol.cenik_id || null, pol.kategorie, pol.nazev, pol.jednotka,
         pol.mnozstvi, pol.cena_nakup, pol.cena_prodej, i]);
    }
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
