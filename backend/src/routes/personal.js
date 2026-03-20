'use strict';
const express = require('express');
const { query } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { typ, role, q } = req.query;
    const where = []; const params = []; let p = 1;
    if (typ)  { where.push(`typ = $${p++}`);  params.push(typ); }
    if (role) { where.push(`role = $${p++}`); params.push(role); }
    if (q)    { where.push(`(jmeno ILIKE $${p} OR prijmeni ILIKE $${p})`); params.push(`%${q}%`); p++; }
    where.push('archivovano = false');
    const wc = 'WHERE ' + where.join(' AND ');
    const { rows } = await query(`SELECT * FROM personal ${wc} ORDER BY jmeno, prijmeni`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM personal WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    const zakazky = await query(
      `SELECT z.id, z.cislo, z.nazev, z.datum_akce, zp.role_na_akci, zp.cas_prichod, zp.cas_odchod
       FROM zakazky_personal zp JOIN zakazky z ON z.id = zp.zakazka_id
       WHERE zp.personal_id = $1 ORDER BY z.datum_akce DESC`, [req.params.id]);
    res.json({ ...rows[0], zakazky: zakazky.rows });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { jmeno, prijmeni, typ, role, email, telefon, specializace, poznamka } = req.body;
    const { rows } = await query(
      `INSERT INTO personal (jmeno,prijmeni,typ,role,email,telefon,specializace,poznamka)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [jmeno, prijmeni, typ || 'interni', role, email, telefon, specializace || [], poznamka]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['jmeno','prijmeni','typ','role','email','telefon','specializace','poznamka','aktivni'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE personal SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/archivovat', auth, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE personal SET archivovano=true WHERE id=$1 RETURNING id, jmeno, prijmeni', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    res.json({ message: 'Osoba archivována', ...rows[0] });
  } catch (err) { next(err); }
});

router.patch('/:id/obnovit', auth, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE personal SET archivovano=false WHERE id=$1 RETURNING id, jmeno, prijmeni', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    res.json({ message: 'Osoba obnovena', ...rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM personal WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    res.json({ message: 'Osoba smazána' });
  } catch (err) { next(err); }
});

router.post('/:id/prirazeni', auth, async (req, res, next) => {
  try {
    const { zakazka_id, role_na_akci, cas_prichod, cas_odchod, poznamka } = req.body;
    const { rows } = await query(
      `INSERT INTO zakazky_personal (zakazka_id, personal_id, role_na_akci, cas_prichod, cas_odchod, poznamka)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (zakazka_id, personal_id) DO UPDATE SET role_na_akci=$3, cas_prichod=$4, cas_odchod=$5, poznamka=$6
       RETURNING *`,
      [zakazka_id, req.params.id, role_na_akci, cas_prichod, cas_odchod, poznamka]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
