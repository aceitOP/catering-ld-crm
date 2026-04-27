'use strict';

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { query } = require('../db');
const { calculateSpotrebu } = require('../consumptionEngine');
const { generateProductionSheet } = require('../productionSheet');
const { aggregateIngredientsForZakazka, loadZakazkaKalkulace } = require('../eventIngredientAggregator');

async function loadData(zakazkaId) {
  const result = await loadZakazkaKalkulace({ query }, zakazkaId);
  if (!result.zakazka) return { error: 'Zakázka nenalezena', status: 404 };

  if (result.kalkulace) {
    return {
      zakazka: result.zakazka,
      kalkulace: {
        ...result.kalkulace,
        polozky: result.polozky,
      },
    };
  }

  const { rows: nabRows } = await query(
    'SELECT * FROM nabidky WHERE zakazka_id = $1 AND aktivni = true ORDER BY verze DESC LIMIT 1',
    [zakazkaId]
  );
  if (!nabRows[0]) {
    return {
      error: 'K zakázce není přiřazena žádná kalkulace ani nabídka. Nejprve vytvořte nabídku s položkami.',
      status: 404,
    };
  }

  const { rows: polozky } = await query(
    'SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY kategorie, poradi',
    [nabRows[0].id]
  );

  return {
    zakazka: result.zakazka,
    kalkulace: {
      id: `nabidka-${nabRows[0].id}`,
      nazev: nabRows[0].nazev,
      pocet_hostu: result.zakazka.pocet_hostu || 1,
      marze_procent: 30,
      sleva_procent: parseFloat(nabRows[0].sleva_procent) || 0,
      dph_sazba: 12,
      polozky: polozky.map((p) => ({
        ...p,
        cena_prodej: parseFloat(p.cena_jednotka) || 0,
        cena_nakup: 0,
        cost_mode: 'manual',
      })),
    },
  };
}

router.get('/calculate/:zakazka_id', auth, async (req, res, next) => {
  try {
    const result = await loadData(req.params.zakazka_id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const spotreba = calculateSpotrebu(result.zakazka, result.kalkulace.polozky);
    res.json(spotreba);
  } catch (err) { next(err); }
});

router.get('/sheet/:zakazka_id', auth, async (req, res, next) => {
  try {
    const result = await loadData(req.params.zakazka_id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const ingredientSummary = await aggregateIngredientsForZakazka(req.params.zakazka_id).catch(() => null);
    const sheet = generateProductionSheet(result.zakazka, result.kalkulace, ingredientSummary);
    res.json(sheet);
  } catch (err) { next(err); }
});

router.get('/sheet-v2/:zakazka_id', auth, async (req, res, next) => {
  try {
    const result = await loadData(req.params.zakazka_id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const ingredientSummary = await aggregateIngredientsForZakazka(req.params.zakazka_id);
    const sheet = generateProductionSheet(result.zakazka, result.kalkulace, ingredientSummary);
    res.json(sheet);
  } catch (err) { next(err); }
});

module.exports = router;
