/**
 * GET /api/kapacity
 * Agregovaná data vytíženosti firmy po dnech.
 * Vrací počet akcí, počet hostů a seznam zakázek pro každý den v rozsahu od–do.
 */
const router = require('express').Router();
const { query } = require('../db');
const { auth }  = require('../middleware/auth');

router.get('/', auth, async (req, res, next) => {
  try {
    const od  = req.query.od || new Date().toISOString().slice(0, 10);
    const doo = req.query.do || new Date().toISOString().slice(0, 10);

    const { rows } = await query(`
      SELECT
        datum_akce::date AS datum,
        COUNT(*)::int AS akce_celkem,
        COUNT(*) FILTER (WHERE stav IN ('potvrzeno','ve_priprave','realizovano'))::int AS akce_potvrzene,
        COALESCE(SUM(pocet_hostu), 0)::int AS hoste_celkem,
        COALESCE(SUM(pocet_hostu) FILTER (WHERE stav IN ('potvrzeno','ve_priprave','realizovano')), 0)::int AS hoste_potvrzene,
        json_agg(json_build_object(
          'id',         id,
          'cislo',      cislo,
          'nazev',      nazev,
          'typ',        typ,
          'stav',       stav,
          'pocet_hostu',pocet_hostu,
          'cas_zacatek',cas_zacatek,
          'cas_konec',  cas_konec
        ) ORDER BY cas_zacatek NULLS LAST) AS akce
      FROM zakazky
      WHERE datum_akce BETWEEN $1 AND $2
        AND stav <> 'stornovano'
        AND (archivovano IS NULL OR archivovano = false)
      GROUP BY datum_akce::date
      ORDER BY datum_akce::date
    `, [od, doo]);

    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
