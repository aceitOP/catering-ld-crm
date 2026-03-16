const router = require('express').Router();
const { query } = require('../db');
const { auth }  = require('../middleware/auth');

// Vytvoř tabulku pokud neexistuje (migration-safe)
query(`
  CREATE TABLE IF NOT EXISTS notifikace (
    id          SERIAL PRIMARY KEY,
    typ         VARCHAR(50)  NOT NULL DEFAULT 'system',
    titulek     VARCHAR(255) NOT NULL,
    zprava      TEXT,
    odkaz       VARCHAR(255),
    procitana   BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )
`).catch(err => console.error('[notif] Chyba při vytváření tabulky:', err.message));

// GET /api/notifikace – seznam (nejnovější první) + počet nepřečtených
router.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM notifikace ORDER BY created_at DESC LIMIT 100'
    );
    const unread = rows.filter(r => !r.procitana).length;
    res.json({ data: rows, unread });
  } catch (err) { next(err); }
});

// PATCH /api/notifikace/read-all – označ vše jako přečtené
router.patch('/read-all', auth, async (req, res, next) => {
  try {
    await query('UPDATE notifikace SET procitana = true WHERE procitana = false');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/notifikace/:id/read – označ jednu jako přečtenou
router.patch('/:id/read', auth, async (req, res, next) => {
  try {
    await query('UPDATE notifikace SET procitana = true WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notifikace/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await query('DELETE FROM notifikace WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notifikace – smazat všechny přečtené
router.delete('/', auth, async (req, res, next) => {
  try {
    await query('DELETE FROM notifikace WHERE procitana = true');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/notifikace/poptavka – veřejný webhook pro poptávky z webu
// Zabezpečení: volitelný API klíč přes env POPTAVKA_KEY
router.post('/poptavka', async (req, res, next) => {
  try {
    const secret = process.env.POPTAVKA_KEY;
    if (secret && req.headers['x-api-key'] !== secret) {
      return res.status(403).json({ error: 'Neplatný API klíč' });
    }

    const { jmeno, email, telefon, zprava, typ_akce, datum } = req.body;
    if (!jmeno || !email) {
      return res.status(400).json({ error: 'Pole jmeno a email jsou povinná' });
    }

    const titulek = `Nová poptávka z webu — ${jmeno}`;
    const msg = [
      typ_akce  && `Typ akce: ${typ_akce}`,
      datum     && `Datum: ${datum}`,
      `E-mail: ${email}`,
      telefon   && `Telefon: ${telefon}`,
      zprava    && `Zpráva: ${zprava}`,
    ].filter(Boolean).join('\n');

    await query(
      'INSERT INTO notifikace (typ, titulek, zprava, odkaz) VALUES ($1,$2,$3,$4)',
      ['nova_poptavka', titulek, msg, '/klienti']
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
