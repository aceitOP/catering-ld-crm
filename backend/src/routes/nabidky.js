'use strict';
const express = require('express');
const { query, withTransaction } = require('../db');
const { auth } = require('../middleware/auth');
const { requireAppModule } = require('../moduleAccess');
const { sendNabidka } = require('../emailService');
const { createNotif } = require('../notifHelper');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, stav } = req.query;
    const where = []; const params = []; let p = 1;
    if (zakazka_id) { where.push(`n.zakazka_id = $${p++}`); params.push(zakazka_id); }
    if (stav)       { where.push(`n.stav = $${p++}`);       params.push(stav); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(
      `SELECT n.*, z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev,
              k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
       FROM nabidky n
       JOIN zakazky z ON z.id = n.zakazka_id
       LEFT JOIN klienti k ON k.id = z.klient_id
       ${wc} ORDER BY n.created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM nabidky WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    const polozky = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY poradi, id', [req.params.id]);
    res.json({ ...rows[0], polozky: polozky.rows });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, nazev, uvodni_text, zaverecny_text, platnost_do, sleva_procent, polozky } = req.body;
    const totalBezDph = (polozky || []).reduce(
      (s, p) => s + (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0), 0);
    const sleva  = totalBezDph * ((parseFloat(sleva_procent) || 0) / 100);
    const dph    = (totalBezDph - sleva) * 0.12;
    const celkem = totalBezDph - sleva + dph;

    let newRow;
    await withTransaction(async (client) => {
      const maxVer = await client.query(
        'SELECT COALESCE(MAX(verze),0) AS v FROM nabidky WHERE zakazka_id = $1', [zakazka_id]);
      const verze = maxVer.rows[0].v + 1;
      await client.query('UPDATE nabidky SET aktivni = false WHERE zakazka_id = $1', [zakazka_id]);
      const { rows } = await client.query(
        `INSERT INTO nabidky (zakazka_id, verze, nazev, uvodni_text, zaverecny_text, platnost_do,
          sleva_procent, cena_bez_dph, dph, cena_celkem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [zakazka_id, verze, nazev, uvodni_text, zaverecny_text, platnost_do,
         sleva_procent || 0, totalBezDph, dph, celkem]);
      newRow = rows[0];
      for (const [i, pol] of (polozky || []).entries()) {
        await client.query(
          `INSERT INTO nabidky_polozky (nabidka_id, kategorie, nazev, jednotka, mnozstvi, cena_jednotka, poradi)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [newRow.id, pol.kategorie || 'jidlo', pol.nazev || '', pol.jednotka || 'os.',
           parseFloat(pol.mnozstvi) || 1, parseFloat(pol.cena_jednotka) || 0, i]);
      }
    });

    createNotif({
      typ: 'nova_nabidka',
      titulek: `Nová nabídka — ${nazev || 'bez názvu'} (v${newRow.verze})`,
      zprava: `Celkem: ${celkem.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' })}`,
      odkaz: `/nabidky/${newRow.id}`,
    });
    res.status(201).json(newRow);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const { nazev, uvodni_text, zaverecny_text, platnost_do, sleva_procent, polozky } = req.body;
    const totalBezDph = (polozky||[]).reduce((s,p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
    const sleva = totalBezDph * ((parseFloat(sleva_procent)||0)/100);
    const dph = (totalBezDph - sleva) * 0.12;
    const celkem = totalBezDph - sleva + dph;
    const { rows } = await query(
      `UPDATE nabidky SET nazev=$1,uvodni_text=$2,zaverecny_text=$3,platnost_do=$4,sleva_procent=$5,cena_bez_dph=$6,dph=$7,cena_celkem=$8 WHERE id=$9 RETURNING *`,
      [nazev, uvodni_text||null, zaverecny_text||null, platnost_do||null, sleva_procent||0, totalBezDph, dph, celkem, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    if (polozky) {
      await withTransaction(async (client) => {
        await client.query('DELETE FROM nabidky_polozky WHERE nabidka_id = $1', [req.params.id]);
        for (const [i,pol] of polozky.entries()) {
          await client.query(
            `INSERT INTO nabidky_polozky (nabidka_id,kategorie,nazev,jednotka,mnozstvi,cena_jednotka,poradi) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [req.params.id, pol.kategorie||'jidlo', pol.nazev||'', pol.jednotka||'os.', parseFloat(pol.mnozstvi)||1, parseFloat(pol.cena_jednotka)||0, i]);
        }
      });
    }
    const newPol = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id=$1 ORDER BY poradi,id', [req.params.id]);
    res.json({ ...rows[0], polozky: newPol.rows });
  } catch (err) { next(err); }
});

router.post('/:id/odeslat', auth, requireAppModule('email'), async (req, res, next) => {
  try {
    const { to, poznamka } = req.body;
    if (!to) return res.status(400).json({ error: 'Chybí emailová adresa příjemce' });
    const { rows } = await query('SELECT * FROM nabidky WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    const polozky = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY poradi, id', [req.params.id]);
    const nabidka = { ...rows[0], polozky: polozky.rows };
    const { rows: zRows } = await query('SELECT * FROM zakazky WHERE id = $1', [nabidka.zakazka_id]);
    const zakazka = zRows[0] || {};
    const { rows: nastaveni } = await query('SELECT klic, hodnota FROM nastaveni');
    const firma = {};
    nastaveni.forEach(r => { firma[r.klic] = r.hodnota; });
    await sendNabidka({ to, nabidka, zakazka, firma, poznamka });
    await query(`UPDATE nabidky SET stav = 'odeslano', odeslano_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ message: `Nabídka odeslána na ${to}` });
  } catch (err) {
    if (err.message.includes('SMTP')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id/stav', auth, async (req, res, next) => {
  try {
    const { stav } = req.body;
    const validStavy = ['koncept', 'odeslano', 'prijato', 'zamitnuto', 'expirováno'];
    if (!validStavy.includes(stav)) return res.status(400).json({ error: 'Neplatný stav nabídky' });
    const extra = stav === 'odeslano' ? ', odeslano_at = NOW()' : '';
    const { rows } = await query(
      `UPDATE nabidky SET stav = $1${extra} WHERE id = $2 RETURNING *`, [stav, req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
