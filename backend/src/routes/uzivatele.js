'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const { query } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id,jmeno,prijmeni,email,role,telefon,aktivni,posledni_prihlaseni,created_at FROM uzivatele ORDER BY jmeno');
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.post('/', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { jmeno, prijmeni, email, heslo, role, telefon } = req.body;
    if (!heslo || heslo.length < 8) {
      return res.status(400).json({ error: 'Heslo je povinné a musí mít alespoň 8 znaků' });
    }
    const hash = await bcrypt.hash(heslo, 12);
    const { rows } = await query(
      `INSERT INTO uzivatele (jmeno,prijmeni,email,heslo_hash,role,telefon)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,jmeno,prijmeni,email,role,telefon`,
      [jmeno, prijmeni, email.toLowerCase(), hash, role || 'obchodnik', telefon]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const allowed = ['jmeno','prijmeni','email','role','telefon','aktivni'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE uzivatele SET ${sets} WHERE id = $1 RETURNING id,jmeno,prijmeni,email,role,aktivni`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    if (String(req.user.id) === String(req.params.id))
      return res.status(400).json({ error: 'Nemůžete smazat svůj vlastní účet' });
    const { rows } = await query('DELETE FROM uzivatele WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Uživatel nenalezen' });
    res.json({ message: 'Uživatel smazán' });
  } catch (err) { next(err); }
});

module.exports = router;
