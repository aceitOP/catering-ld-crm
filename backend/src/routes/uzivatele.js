'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { auth, requireCapability, userLevel } = require('../middleware/auth');
const { appendAdminAudit } = require('../adminAudit');

const router = express.Router();
const PROTECTED_ADMIN_ROLES = ['super_admin', 'majitel', 'admin'];

router.get('/', auth, requireCapability('users.manage'), async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, jmeno, prijmeni, email, role, telefon, aktivni, posledni_prihlaseni, created_at FROM uzivatele ORDER BY jmeno'
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.post('/', auth, requireCapability('users.manage'), async (req, res, next) => {
  try {
    const { jmeno, prijmeni, email, heslo, role, telefon } = req.body || {};
    if (!heslo || heslo.length < 8) {
      return res.status(400).json({ error: 'Heslo je povinné a musí mít alespoň 8 znaků' });
    }

    const requestedRole = role || 'uzivatel';
    if (userLevel(req) < 3 && PROTECTED_ADMIN_ROLES.includes(requestedRole)) {
      return res.status(403).json({ error: 'Pouze super admin může vytvářet adminy a majitele' });
    }

    const hash = await bcrypt.hash(heslo, 12);
    const { rows } = await query(
      `INSERT INTO uzivatele (jmeno, prijmeni, email, heslo_hash, role, telefon)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, jmeno, prijmeni, email, role, telefon, aktivni`,
      [jmeno, prijmeni, String(email || '').toLowerCase(), hash, requestedRole, telefon]
    );

    await appendAdminAudit({
      actorId: req.user?.id,
      action: 'user.create',
      entityType: 'user',
      entityId: String(rows[0].id),
      afterPayload: rows[0],
    });

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, requireCapability('users.manage'), async (req, res, next) => {
  try {
    const { rows: targetRows } = await query(
      'SELECT id, jmeno, prijmeni, email, role, telefon, aktivni FROM uzivatele WHERE id = $1',
      [req.params.id]
    );
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'Uživatel nenalezen' });

    if (userLevel(req) < 3 && PROTECTED_ADMIN_ROLES.includes(target.role)) {
      return res.status(403).json({ error: 'Administrátor nemůže upravovat super adminy, majitele ani jiné adminy' });
    }
    if (req.body.role && userLevel(req) < 3 && PROTECTED_ADMIN_ROLES.includes(req.body.role)) {
      return res.status(403).json({ error: 'Pouze super admin může přiřadit roli majitel, admin nebo super admin' });
    }

    const allowed = ['jmeno', 'prijmeni', 'email', 'role', 'telefon', 'aktivni'];
    const fields = Object.keys(req.body || {}).filter((key) => allowed.includes(key));
    if (!fields.length) return res.status(400).json({ error: 'Žádné platné pole k aktualizaci' });

    const setSql = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = fields.map((field) => field === 'email'
      ? String(req.body[field] || '').toLowerCase()
      : req.body[field]);

    const { rows } = await query(
      `UPDATE uzivatele
       SET ${setSql}
       WHERE id = $1
       RETURNING id, jmeno, prijmeni, email, role, telefon, aktivni`,
      [req.params.id, ...values]
    );

    await appendAdminAudit({
      actorId: req.user?.id,
      action: 'user.update',
      entityType: 'user',
      entityId: String(req.params.id),
      beforePayload: target,
      afterPayload: rows[0],
    });

    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, requireCapability('users.manage'), async (req, res, next) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ error: 'Nemůžete smazat svůj vlastní účet' });
    }

    const { rows: targetRows } = await query(
      'SELECT id, jmeno, prijmeni, email, role, telefon, aktivni FROM uzivatele WHERE id = $1',
      [req.params.id]
    );
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'Uživatel nenalezen' });

    if (userLevel(req) < 3 && PROTECTED_ADMIN_ROLES.includes(target.role)) {
      return res.status(403).json({ error: 'Administrátor nemůže smazat super adminy, majitele ani jiné adminy' });
    }

    const { rows } = await query(
      'DELETE FROM uzivatele WHERE id = $1 RETURNING id, email, role',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Uživatel nenalezen' });

    await appendAdminAudit({
      actorId: req.user?.id,
      action: 'user.delete',
      entityType: 'user',
      entityId: String(req.params.id),
      beforePayload: target,
      afterPayload: rows[0],
    });

    res.json({ message: 'Uživatel smazán' });
  } catch (err) { next(err); }
});

module.exports = router;
