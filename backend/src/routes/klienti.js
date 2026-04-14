'use strict';
const express = require('express');
const { query } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');
const { createNotif } = require('../notifHelper');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { typ, q, sort = 'jmeno', page = 1, limit = 50 } = req.query;
    if (q && q.length > 200) return res.status(400).json({ error: 'Hledaný výraz je příliš dlouhý' });
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const safePage  = Math.max(parseInt(page) || 1, 1);
    const where = []; const params = []; let p = 1;
    if (typ) { where.push(`typ = $${p++}`); params.push(typ); }
    if (q)   { where.push(`(jmeno ILIKE $${p} OR prijmeni ILIKE $${p} OR firma ILIKE $${p} OR email ILIKE $${p})`); params.push(`%${q}%`); p++; }
    where.push('k.archivovano = false');
    const wc = 'WHERE ' + where.join(' AND ');
    const orderMap = { jmeno: 'jmeno ASC', obrat: 'jmeno ASC', datum: 'created_at DESC' };
    const order = orderMap[sort] || 'jmeno ASC';
    const offset = (safePage - 1) * safeLimit;
    const { rows } = await query(
      `SELECT k.*, u.jmeno AS obchodnik_jmeno, u.prijmeni AS obchodnik_prijmeni,
              COUNT(z.id) AS pocet_zakazek,
              COUNT(CASE WHEN z.stav IN ('realizovano','uzavreno') THEN 1 END) AS pocet_realizovano,
              COALESCE(SUM(z.cena_celkem),0) AS obrat_celkem
       FROM klienti k
       LEFT JOIN uzivatele u ON u.id = k.obchodnik_id
       LEFT JOIN zakazky z ON z.klient_id = k.id
       ${wc} GROUP BY k.id, u.jmeno, u.prijmeni
       ORDER BY ${order} LIMIT $${p++} OFFSET $${p++}`,
      [...params, safeLimit, offset]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/pravidelni', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      WITH akce AS (
        SELECT z.klient_id, COUNT(*) AS pocet_akci, MAX(z.datum_akce) AS posledni_akce
        FROM zakazky z
        WHERE z.stav IN ('realizovano', 'uzavreno') AND z.archivovano = false AND z.datum_akce IS NOT NULL
        GROUP BY z.klient_id
      )
      SELECT k.id, k.jmeno, k.prijmeni, k.firma, k.typ, k.email, k.telefon, k.pravidelny,
             a.pocet_akci, a.posledni_akce,
             ROUND(EXTRACT(EPOCH FROM (NOW() - a.posledni_akce::timestamptz)) / 86400)::int AS dni_od_posledni,
             (a.posledni_akce + INTERVAL '1 year')::date AS ocekavana_pristi,
             ROUND(EXTRACT(EPOCH FROM ((a.posledni_akce + INTERVAL '1 year')::timestamptz - NOW())) / 86400)::int AS dni_do_pristi
      FROM klienti k JOIN akce a ON a.klient_id = k.id
      WHERE k.archivovano = false AND (a.pocet_akci >= 2 OR k.pravidelny = true)
      ORDER BY (a.posledni_akce + INTERVAL '1 year') LIMIT 30
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT k.*, u.jmeno AS obchodnik_jmeno, u.prijmeni AS obchodnik_prijmeni
       FROM klienti k LEFT JOIN uzivatele u ON u.id = k.obchodnik_id WHERE k.id = $1`,
      [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Klient nenalezen' });
    const zakazky = await query(
      'SELECT id, cislo, nazev, datum_akce, stav, cena_celkem FROM zakazky WHERE klient_id = $1 ORDER BY datum_akce DESC',
      [req.params.id]);
    res.json({ ...rows[0], zakazky: zakazky.rows });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { jmeno, prijmeni, firma, typ, email, telefon, adresa, ico, dic, zdroj, poznamka, obchodnik_id } = req.body;
    const { rows } = await query(
      `INSERT INTO klienti (jmeno,prijmeni,firma,typ,email,telefon,adresa,ico,dic,zdroj,poznamka,obchodnik_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [jmeno, prijmeni, firma, typ || 'soukromy', email, telefon, adresa, ico, dic, zdroj, poznamka, obchodnik_id || req.user.id]);
    createNotif({
      typ: 'nova_klient',
      titulek: `Nový klient — ${jmeno} ${prijmeni || ''}${firma ? ` (${firma})` : ''}`.trim(),
      zprava: email ? `E-mail: ${email}` : null,
      odkaz: `/klienti`,
    });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['jmeno','prijmeni','firma','typ','email','telefon','adresa','ico','dic','zdroj','poznamka','obchodnik_id','pravidelny'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'Žádná platná pole' });
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE klienti SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    if (!rows[0]) return res.status(404).json({ error: 'Klient nenalezen' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/archivovat', auth, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE klienti SET archivovano=true WHERE id=$1 RETURNING id, jmeno, prijmeni, firma', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Klient nenalezen' });
    res.json({ message: 'Klient archivován', ...rows[0] });
  } catch (err) { next(err); }
});

router.patch('/:id/obnovit', auth, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE klienti SET archivovano=false WHERE id=$1 RETURNING id, jmeno, prijmeni, firma', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Klient nenalezen' });
    res.json({ message: 'Klient obnoven', ...rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    await query('DELETE FROM klienti WHERE id = $1', [req.params.id]);
    res.json({ message: 'Klient smazán' });
  } catch (err) { next(err); }
});

// ── POST /import ──────────────────────────────────────────────────────────────
router.post('/import', auth, async (req, res, next) => {
  try {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'Chybí data (rows)' });

    let imported = 0, skipped = 0;
    const errors = [];

    // Načti existující emaily jednou pro rychlé vyhledání duplicit
    const { rows: existing } = await query(`SELECT LOWER(email) AS email FROM klienti WHERE email IS NOT NULL`);
    const knownEmails = new Set(existing.map(r => r.email));

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.jmeno && !r.firma) { errors.push({ row: i + 1, reason: 'Chybí jméno i firma' }); continue; }

      const email = (r.email || '').trim().toLowerCase() || null;
      if (email && knownEmails.has(email)) { skipped++; continue; }

      try {
        await query(
          `INSERT INTO klienti (jmeno,prijmeni,firma,typ,email,telefon,adresa,ico,dic,zdroj,poznamka)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'import',$10)`,
          [r.jmeno || null, r.prijmeni || null, r.firma || null,
           r.typ || 'soukromy', email, r.telefon || null, r.adresa || null,
           r.ico || null, r.dic || null, r.poznamka || null]
        );
        if (email) knownEmails.add(email);
        imported++;
      } catch (e) {
        errors.push({ row: i + 1, reason: e.message });
      }
    }

    res.json({ imported, skipped, errors });
  } catch (err) { next(err); }
});

module.exports = router;
