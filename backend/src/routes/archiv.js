const router = require('express').Router();
const { query } = require('../db');
const { auth } = require('../middleware/auth');

// GET /api/archiv – všechny archivované položky (zakázky, klienti, personál)
router.get('/', auth, async (req, res, next) => {
  try {
    const [zakazky, klienti, personal] = await Promise.all([
      query(`
        SELECT z.id, z.cislo, z.nazev, z.typ, z.stav, z.datum_akce, z.cena_celkem,
               k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
               'zakazka' AS druh
        FROM zakazky z
        LEFT JOIN klienti k ON k.id = z.klient_id
        WHERE z.archivovano = true
        ORDER BY z.datum_akce DESC NULLS LAST, z.created_at DESC
      `),
      query(`
        SELECT id, jmeno, prijmeni, firma, typ, email, telefon,
               'klient' AS druh
        FROM klienti
        WHERE archivovano = true
        ORDER BY jmeno, prijmeni
      `),
      query(`
        SELECT id, jmeno, prijmeni, typ, role, email,
               'personal' AS druh
        FROM personal
        WHERE archivovano = true
        ORDER BY jmeno, prijmeni
      `),
    ]);
    res.json({
      zakazky: zakazky.rows,
      klienti: klienti.rows,
      personal: personal.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
