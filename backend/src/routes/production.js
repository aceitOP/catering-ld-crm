const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { query } = require('../db');
const { calculateSpotrebu } = require('../consumptionEngine');
const { generateProductionSheet } = require('../productionSheet');

// ── Helper: load zakazka + latest kalkulace + items ──────────
async function loadData(zakazka_id) {
  const { rows: zakRows } = await query(
    `SELECT z.*,
            k.jmeno  AS klient_jmeno,
            k.prijmeni AS klient_prijmeni,
            k.firma  AS klient_firma
     FROM zakazky z
     LEFT JOIN klienti k ON k.id = z.klient_id
     WHERE z.id = $1`,
    [zakazka_id]
  );
  if (!zakRows[0]) return { error: 'Zakázka nenalezena', status: 404 };

  const { rows: kalRows } = await query(
    'SELECT * FROM kalkulace WHERE zakazka_id = $1 ORDER BY verze DESC LIMIT 1',
    [zakazka_id]
  );
  if (!kalRows[0]) return { error: 'K zakázce není přiřazena žádná kalkulace', status: 404 };

  const { rows: polozky } = await query(
    'SELECT * FROM kalkulace_polozky WHERE kalkulace_id = $1 ORDER BY kategorie, poradi',
    [kalRows[0].id]
  );

  return { zakazka: zakRows[0], kalkulace: { ...kalRows[0], polozky } };
}

// ── GET /api/production/calculate/:zakazka_id ─────────────────
// Returns raw consumption calculation (qty adjustments per event type)
router.get('/calculate/:zakazka_id', auth, async (req, res, next) => {
  try {
    const result = await loadData(req.params.zakazka_id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const spotreba = calculateSpotrebu(result.zakazka, result.kalkulace.polozky);
    res.json(spotreba);
  } catch (err) { next(err); }
});

// ── GET /api/production/sheet/:zakazka_id ─────────────────────
// Returns full production sheet (sections A–E + allergens + summary)
router.get('/sheet/:zakazka_id', auth, async (req, res, next) => {
  try {
    const result = await loadData(req.params.zakazka_id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const sheet = generateProductionSheet(result.zakazka, result.kalkulace);
    res.json(sheet);
  } catch (err) { next(err); }
});

module.exports = router;
