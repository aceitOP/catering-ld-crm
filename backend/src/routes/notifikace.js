'use strict';

const router = require('express').Router();
const { query } = require('../db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM notifikace ORDER BY created_at DESC LIMIT 100'
    );
    const unread = rows.filter((row) => !row.procitana).length;
    res.json({ data: rows, unread });
  } catch (err) { next(err); }
});

router.patch('/read-all', auth, async (_req, res, next) => {
  try {
    await query('UPDATE notifikace SET procitana = true WHERE procitana = false');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.patch('/:id/read', auth, async (req, res, next) => {
  try {
    await query('UPDATE notifikace SET procitana = true WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    await query('DELETE FROM notifikace WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/', auth, async (_req, res, next) => {
  try {
    await query('DELETE FROM notifikace WHERE procitana = true');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/poptavka', async (req, res, next) => {
  try {
    const secret = process.env.POPTAVKA_KEY;
    if (secret && req.headers['x-api-key'] !== secret) {
      return res.status(403).json({ error: 'Neplatny API klic' });
    }

    const { jmeno, email, telefon, zprava, typ_akce, datum } = req.body || {};
    if (!jmeno || !email) {
      return res.status(400).json({ error: 'Pole jmeno a email jsou povinna' });
    }

    const titulek = `Nova poptavka z webu - ${jmeno}`;
    const msg = [
      typ_akce && `Typ akce: ${typ_akce}`,
      datum && `Datum: ${datum}`,
      `E-mail: ${email}`,
      telefon && `Telefon: ${telefon}`,
      zprava && `Zprava: ${zprava}`,
    ].filter(Boolean).join('\n');

    await query(
      'INSERT INTO notifikace (typ, titulek, zprava, odkaz) VALUES ($1, $2, $3, $4)',
      ['nova_poptavka', titulek, msg, '/klienti']
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
