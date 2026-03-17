'use strict';
const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { auth } = require('../middleware/auth');

// Generátor čísla faktury: FAK-{rok}-{seq}
async function genCislo(client) {
  const rok = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT cislo FROM faktury WHERE cislo LIKE $1 ORDER BY cislo DESC LIMIT 1`,
    [`FAK-${rok}-%`]
  );
  if (!rows.length) return `FAK-${rok}-001`;
  const last = parseInt(rows[0].cislo.split('-')[2], 10);
  return `FAK-${rok}-${String(last + 1).padStart(3, '0')}`;
}

// GET /api/faktury
router.get('/', auth, async (req, res, next) => {
  try {
    const { stav, klient_id, zakazka_id, q } = req.query;
    const where = []; const params = []; let p = 1;
    if (stav)       { where.push(`f.stav = $${p++}`);                                            params.push(stav); }
    if (klient_id)  { where.push(`f.klient_id = $${p++}`);                                       params.push(klient_id); }
    if (zakazka_id) { where.push(`f.zakazka_id = $${p++}`);                                      params.push(zakazka_id); }
    if (q)          { where.push(`(f.cislo ILIKE $${p} OR k.jmeno ILIKE $${p} OR k.firma ILIKE $${p})`); params.push(`%${q}%`); p++; }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(`
      SELECT f.*,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
             z.cislo AS zakazka_cislo
      FROM faktury f
      LEFT JOIN klienti k ON k.id = f.klient_id
      LEFT JOIN zakazky z ON z.id = f.zakazka_id
      ${wc}
      ORDER BY f.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/faktury/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT f.*,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
             k.ico AS klient_ico, k.dic AS klient_dic, k.adresa AS klient_adresa, k.email AS klient_email,
             z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev
      FROM faktury f
      LEFT JOIN klienti k ON k.id = f.klient_id
      LEFT JOIN zakazky z ON z.id = f.zakazka_id
      WHERE f.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Faktura nenalezena' });
    const polozky = await query(
      'SELECT * FROM faktury_polozky WHERE faktura_id = $1 ORDER BY poradi, id',
      [req.params.id]
    );
    res.json({ ...rows[0], polozky: polozky.rows });
  } catch (err) { next(err); }
});

// POST /api/faktury
router.post('/', auth, async (req, res, next) => {
  try {
    const { klient_id, zakazka_id, datum_splatnosti, zpusob_platby, variabilni_symbol, poznamka, polozky } = req.body;
    if (!datum_splatnosti) return res.status(400).json({ error: 'Datum splatnosti je povinné' });

    let result;
    await withTransaction(async (client) => {
      const cislo = await genCislo(client);
      const dnes  = new Date().toISOString().slice(0, 10);

      const totalBezDph = (polozky || []).reduce((s, p) =>
        s + (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0), 0);
      const dph = (polozky || []).reduce((s, p) => {
        const c = (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0);
        return s + c * ((parseFloat(p.dph_sazba) || 12) / 100);
      }, 0);
      const celkem = totalBezDph + dph;

      // Snapshot nastavení firmy
      const { rows: nRows } = await client.query('SELECT klic, hodnota FROM nastaveni');
      const firma = {};
      nRows.forEach(r => { firma[r.klic] = r.hodnota; });

      const vs = variabilni_symbol || cislo.replace(/\D/g, '');

      const { rows } = await client.query(
        `INSERT INTO faktury
           (cislo, zakazka_id, klient_id, stav, datum_vystaveni, datum_splatnosti,
            zpusob_platby, variabilni_symbol, poznamka, cena_bez_dph, dph, cena_celkem,
            dodavatel_json, vystavil_id)
         VALUES ($1,$2,$3,'vystavena',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [cislo, zakazka_id || null, klient_id || null, dnes, datum_splatnosti,
         zpusob_platby || 'převod', vs, poznamka || null,
         totalBezDph, dph, celkem, JSON.stringify(firma), req.user.id]
      );

      for (const [i, pol] of (polozky || []).entries()) {
        await client.query(
          `INSERT INTO faktury_polozky (faktura_id, nazev, jednotka, mnozstvi, cena_jednotka, dph_sazba, poradi)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [rows[0].id, pol.nazev, pol.jednotka || 'os.',
           pol.mnozstvi, pol.cena_jednotka, pol.dph_sazba || 12, i]
        );
      }
      result = rows[0];
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// PATCH /api/faktury/:id
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const { datum_splatnosti, zpusob_platby, variabilni_symbol, poznamka, polozky } = req.body;

    const totalBezDph = (polozky || []).reduce((s, p) =>
      s + (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0), 0);
    const dph = (polozky || []).reduce((s, p) => {
      const c = (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0);
      return s + c * ((parseFloat(p.dph_sazba) || 12) / 100);
    }, 0);
    const celkem = totalBezDph + dph;

    const { rows } = await query(
      `UPDATE faktury SET datum_splatnosti=$1, zpusob_platby=$2, variabilni_symbol=$3,
         poznamka=$4, cena_bez_dph=$5, dph=$6, cena_celkem=$7
       WHERE id=$8 RETURNING *`,
      [datum_splatnosti, zpusob_platby, variabilni_symbol, poznamka || null,
       totalBezDph, dph, celkem, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Faktura nenalezena' });

    if (polozky) {
      await query('DELETE FROM faktury_polozky WHERE faktura_id=$1', [req.params.id]);
      for (const [i, pol] of polozky.entries()) {
        await query(
          `INSERT INTO faktury_polozky (faktura_id, nazev, jednotka, mnozstvi, cena_jednotka, dph_sazba, poradi)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [req.params.id, pol.nazev, pol.jednotka || 'os.',
           pol.mnozstvi, pol.cena_jednotka, pol.dph_sazba || 12, i]
        );
      }
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/faktury/:id/stav
router.patch('/:id/stav', auth, async (req, res, next) => {
  try {
    const { stav, datum_zaplaceni } = req.body;
    const valid = ['vystavena', 'odeslana', 'zaplacena', 'storno'];
    if (!valid.includes(stav)) return res.status(400).json({ error: 'Neplatný stav faktury' });

    const extraSet    = stav === 'zaplacena' ? ', datum_zaplaceni = $3' : '';
    const extraParams = stav === 'zaplacena'
      ? [stav, req.params.id, datum_zaplaceni || new Date().toISOString().slice(0, 10)]
      : [stav, req.params.id];

    const { rows } = await query(
      `UPDATE faktury SET stav=$1${extraSet} WHERE id=$2 RETURNING *`,
      extraParams
    );
    if (!rows[0]) return res.status(404).json({ error: 'Faktura nenalezena' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/faktury/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    // Atomicky: smaž pouze pokud stav = 'vystavena' – odstraní race condition
    const { rows } = await query(
      "DELETE FROM faktury WHERE id=$1 AND stav='vystavena' RETURNING id",
      [req.params.id]
    );
    if (rows[0]) return res.status(204).end();

    // Nenašlo se – zjisti proč
    const { rows: check } = await query('SELECT stav FROM faktury WHERE id=$1', [req.params.id]);
    if (!check[0]) return res.status(404).json({ error: 'Faktura nenalezena' });
    return res.status(400).json({ error: 'Smazat lze pouze fakturu ve stavu Vystavena' });
  } catch (err) { next(err); }
});

module.exports = router;
