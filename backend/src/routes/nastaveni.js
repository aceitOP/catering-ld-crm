const express = require('express');
const { query } = require('../db');
const { auth, requireMinRole, userLevel } = require('../middleware/auth');

const router = express.Router();
const SECRET_KEYS = new Set([
  'email_imap_pass',
  'email_smtp_pass',
]);

router.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT klic, hodnota, popis FROM nastaveni ORDER BY klic');
    const obj = {};
    const isAdminPlus = userLevel(req) >= 2; // admin nebo super_admin
    rows.forEach((r) => {
      if (SECRET_KEYS.has(r.klic) && !isAdminPlus) return;
      obj[r.klic] = r.hodnota;
    });
    res.json(obj);
  } catch (err) { next(err); }
});

router.patch('/', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    for (const [klic, hodnota] of Object.entries(req.body)) {
      await query(
        `INSERT INTO nastaveni (klic, hodnota) VALUES ($1, $2)
         ON CONFLICT (klic) DO UPDATE SET hodnota = EXCLUDED.hodnota`,
        [klic, String(hodnota)]
      );
    }
    res.json({ message: 'Nastavení uloženo' });
  } catch (err) { next(err); }
});

module.exports = router;
