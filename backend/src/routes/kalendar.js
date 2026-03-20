const express = require('express');
const { query } = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { od, do: doo, obchodnik_id, typ } = req.query;
    const where = ['z.datum_akce IS NOT NULL'];
    const params = []; let p = 1;
    if (od)           { where.push(`z.datum_akce >= $${p++}`);   params.push(od); }
    if (doo)          { where.push(`z.datum_akce <= $${p++}`);   params.push(doo); }
    if (obchodnik_id) { where.push(`z.obchodnik_id = $${p++}`);  params.push(obchodnik_id); }
    if (typ)          { where.push(`z.typ = $${p++}`);            params.push(typ); }
    const { rows } = await query(
      `SELECT z.id, z.cislo, z.nazev, z.typ, z.stav, z.datum_akce, z.cas_zacatek, z.cas_konec,
              z.misto, z.pocet_hostu, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni,
              u.jmeno AS obchodnik_jmeno
       FROM zakazky z
       LEFT JOIN klienti k ON k.id = z.klient_id
       LEFT JOIN uzivatele u ON u.id = z.obchodnik_id
       WHERE ${where.join(' AND ')}
       ORDER BY z.datum_akce ASC`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
