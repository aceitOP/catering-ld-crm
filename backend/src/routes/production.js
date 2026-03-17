const express = require('express');
const router  = express.Router();
const { auth } = require('../middleware/auth');
const { query } = require('../db');
const { calculateSpotrebu } = require('../consumptionEngine');
const { generateProductionSheet } = require('../productionSheet');

// ── Helper: load zakazka + latest kalkulace (or active nabídka as fallback) ──
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

  // Preferuj kalkulaci, fallback na aktivní nabídku
  const { rows: kalRows } = await query(
    'SELECT * FROM kalkulace WHERE zakazka_id = $1 ORDER BY verze DESC LIMIT 1',
    [zakazka_id]
  );

  if (kalRows[0]) {
    const { rows: polozky } = await query(
      'SELECT * FROM kalkulace_polozky WHERE kalkulace_id = $1 ORDER BY kategorie, poradi',
      [kalRows[0].id]
    );
    return { zakazka: zakRows[0], kalkulace: { ...kalRows[0], polozky } };
  }

  // Žádná kalkulace – zkus aktivní nabídku
  const { rows: nabRows } = await query(
    'SELECT * FROM nabidky WHERE zakazka_id = $1 AND aktivni = true ORDER BY verze DESC LIMIT 1',
    [zakazka_id]
  );
  if (!nabRows[0]) return { error: 'K zakázce není přiřazena žádná kalkulace ani nabídka. Nejprve vytvořte nabídku s položkami.', status: 404 };

  const { rows: polozky } = await query(
    'SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY kategorie, poradi',
    [nabRows[0].id]
  );

  // Mapuj nabídkové položky na formát kalkulace (cena_jednotka → cena_prodej/nakup)
  const mappedPolozky = polozky.map(p => ({
    ...p,
    cena_prodej: parseFloat(p.cena_jednotka) || 0,
    cena_nakup:  0,
  }));

  const kalkulace = {
    id:            `nabidka-${nabRows[0].id}`,
    nazev:         nabRows[0].nazev,
    pocet_hostu:   zakRows[0].pocet_hostu || 1,
    marze_procent: 30,
    sleva_procent: parseFloat(nabRows[0].sleva_procent) || 0,
    dph_sazba:     12,
    polozky:       mappedPolozky,
  };

  return { zakazka: zakRows[0], kalkulace };
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
