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

router.get('/kitchen-plan', auth, async (req, res, next) => {
  try {
    const today = new Date();
    const defaultFrom = today.toISOString().slice(0, 10);
    const defaultToDate = new Date(today);
    defaultToDate.setDate(defaultToDate.getDate() + 7);
    const dateFrom = String(req.query.date_from || defaultFrom).slice(0, 10);
    const dateTo = String(req.query.date_to || defaultToDate.toISOString().slice(0, 10)).slice(0, 10);

    const { rows: zakazky } = await query(
      `SELECT z.*,
              k.jmeno AS klient_jmeno,
              k.prijmeni AS klient_prijmeni,
              k.firma AS klient_firma
       FROM zakazky z
       LEFT JOIN klienti k ON k.id = z.klient_id
       WHERE z.datum_akce >= $1::date
         AND z.datum_akce <= $2::date
         AND COALESCE(z.archivovano, false) = false
         AND COALESCE(z.stav::text, '') NOT IN ('storno', 'zruseno')
       ORDER BY z.datum_akce, z.cas_zacatek NULLS LAST, z.cislo`,
      [dateFrom, dateTo]
    );

    const events = [];
    const itemMap = new Map();
    const allergenMap = new Map();

    for (const zakazka of zakazky) {
      const result = await loadData(zakazka.id);
      if (result.error) {
        events.push({ ...zakazka, error: result.error, sheet: null });
        continue;
      }
      const ingredientSummary = await aggregateIngredientsForZakazka(zakazka.id).catch(() => null);
      const sheet = generateProductionSheet(result.zakazka, result.kalkulace, ingredientSummary);
      for (const item of sheet.sekce_a || []) {
        const key = `${item.nazev}|${item.jednotka || ''}|${item.kategorie || ''}`;
        const existing = itemMap.get(key) || {
          nazev: item.nazev,
          jednotka: item.jednotka,
          kategorie: item.kategorie,
          mnozstvi: 0,
          zakazky: [],
        };
        existing.mnozstvi += Number(item.mnozstvi || 0);
        existing.zakazky.push({ id: zakazka.id, cislo: zakazka.cislo, nazev: zakazka.nazev, mnozstvi: item.mnozstvi });
        itemMap.set(key, existing);
      }
      for (const group of sheet.sekce_c_alergeny || []) {
        const set = allergenMap.get(group.alergen) || new Set();
        (group.jidla || []).forEach((jidlo) => set.add(jidlo));
        allergenMap.set(group.alergen, set);
      }
      events.push({ ...zakazka, sheet });
    }

    res.json({
      date_from: dateFrom,
      date_to: dateTo,
      summary: {
        events_count: events.length,
        guests_count: events.reduce((sum, event) => sum + Number(event.pocet_hostu || event.sheet?.pocet_hostu || 0), 0),
        items_count: itemMap.size,
      },
      events,
      production_items: Array.from(itemMap.values()).sort((a, b) => String(a.nazev).localeCompare(String(b.nazev), 'cs')),
      allergens: Array.from(allergenMap.entries()).map(([alergen, jidla]) => ({ alergen, jidla: Array.from(jidla) })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
