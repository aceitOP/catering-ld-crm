'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const { query } = require('../db');
const { auth, requireMinRole, userLevel } = require('../middleware/auth');

const router = express.Router();

// GET / – seznam uživatelů (admin+)
router.get('/', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id,jmeno,prijmeni,email,role,telefon,aktivni,posledni_prihlaseni,created_at FROM uzivatele ORDER BY jmeno');
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST / – vytvořit uživatele
// admin může vytvořit jen uzivatel; super_admin může vytvořit kohokoliv
router.post('/', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { jmeno, prijmeni, email, heslo, role, telefon } = req.body;
    if (!heslo || heslo.length < 8) {
      return res.status(400).json({ error: 'Heslo je povinné a musí mít alespoň 8 znaků' });
    }
    // Admin nesmí vytvořit super_admin ani jiného admina
    const requestedRole = role || 'uzivatel';
    if (userLevel(req) < 3 && ['super_admin', 'admin'].includes(requestedRole)) {
      return res.status(403).json({ error: 'Pouze super admin může vytvářet adminy' });
    }
    const hash = await bcrypt.hash(heslo, 12);
    const { rows } = await query(
      `INSERT INTO uzivatele (jmeno,prijmeni,email,heslo_hash,role,telefon)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,jmeno,prijmeni,email,role,telefon`,
      [jmeno, prijmeni, email.toLowerCase(), hash, requestedRole, telefon]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /:id – upravit uživatele
// admin může editovat jen uzivatel; super_admin může editovat kohokoliv
router.patch('/:id', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    // Zjisti roli cílového uživatele
    const { rows: target } = await query('SELECT role FROM uzivatele WHERE id = $1', [req.params.id]);
    if (!target[0]) return res.status(404).json({ error: 'Uživatel nenalezen' });

    if (userLevel(req) < 3 && ['super_admin', 'admin'].includes(target[0].role)) {
      return res.status(403).json({ error: 'Administrátor nemůže upravovat super adminy ani jiné adminy' });
    }
    // Admin nesmí přiřadit vyšší roli
    if (req.body.role && userLevel(req) < 3 && ['super_admin', 'admin'].includes(req.body.role)) {
      return res.status(403).json({ error: 'Pouze super admin může přiřadit roli admin nebo super admin' });
    }

    const allowed = ['jmeno','prijmeni','email','role','telefon','aktivni'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE uzivatele SET ${sets} WHERE id = $1 RETURNING id,jmeno,prijmeni,email,role,aktivni`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:id – smazat uživatele
router.delete('/:id', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    if (String(req.user.id) === String(req.params.id))
      return res.status(400).json({ error: 'Nemůžete smazat svůj vlastní účet' });

    const { rows: target } = await query('SELECT role FROM uzivatele WHERE id = $1', [req.params.id]);
    if (!target[0]) return res.status(404).json({ error: 'Uživatel nenalezen' });

    if (userLevel(req) < 3 && ['super_admin', 'admin'].includes(target[0].role)) {
      return res.status(403).json({ error: 'Administrátor nemůže smazat super adminy ani jiné adminy' });
    }

    const { rows } = await query('DELETE FROM uzivatele WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Uživatel nenalezen' });
    res.json({ message: 'Uživatel smazán' });
  } catch (err) { next(err); }
});

module.exports = router;
