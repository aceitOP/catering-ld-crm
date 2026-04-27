'use strict';

const express = require('express');
const { query, withTransaction } = require('../db');
const { auth } = require('../middleware/auth');
const { computeRecipeCostWithClient, getResolvedRecipeVersionId } = require('../recipeCostEngine');
const { parseNumeric } = require('../recipeUtils');

const router = express.Router();

function normalizeCostMode(polozka = {}) {
  if (polozka.cost_mode && ['manual', 'cenik', 'recipe'].includes(polozka.cost_mode)) {
    return polozka.cost_mode;
  }
  if (polozka.recipe_id) return 'recipe';
  if (polozka.cenik_id) return 'cenik';
  return 'manual';
}

async function resolvePolozkaCosts(client, polozka) {
  const costMode = normalizeCostMode(polozka);
  const mnozstvi = parseNumeric(polozka.mnozstvi, 0);
  const cenaProdej = parseNumeric(polozka.cena_prodej, 0);
  let recipeVersionId = polozka.recipe_version_id ? Number(polozka.recipe_version_id) : null;
  let cenaNakup = parseNumeric(polozka.cena_nakup, 0);
  let nakladVypocet = null;
  let marzeVypocet = null;

  if (costMode === 'recipe' && polozka.recipe_id) {
    recipeVersionId = await getResolvedRecipeVersionId(client, polozka.recipe_id, recipeVersionId);
    const recipeCost = await computeRecipeCostWithClient(client, {
      recipeId: polozka.recipe_id,
      recipeVersionId,
    });
    const outputAmount = Math.max(parseNumeric(recipeCost.output_amount, 1), 0.001);
    const requestedAmount = Math.max(mnozstvi, 0);
    const scale = requestedAmount / outputAmount;
    nakladVypocet = Number((parseNumeric(recipeCost.total_cost) * scale).toFixed(2));
    cenaNakup = Number((nakladVypocet / Math.max(requestedAmount, 1)).toFixed(2));
    if (cenaProdej > 0) {
      marzeVypocet = Number((((cenaProdej - cenaNakup) / cenaProdej) * 100).toFixed(2));
    }
  } else {
    nakladVypocet = Number((cenaNakup * mnozstvi).toFixed(2));
    if (cenaProdej > 0) {
      marzeVypocet = Number((((cenaProdej - cenaNakup) / cenaProdej) * 100).toFixed(2));
    }
  }

  return {
    cost_mode: costMode,
    recipe_version_id: recipeVersionId,
    cena_nakup: cenaNakup,
    cena_prodej: cenaProdej,
    naklad_vypocet: nakladVypocet,
    marze_vypocet: marzeVypocet,
  };
}

async function loadKalkulaceDetail(id) {
  const { rows } = await query('SELECT * FROM kalkulace WHERE id = $1', [id]);
  if (!rows[0]) return null;

  const polozky = await query(
    `
      SELECT kp.*,
             r.nazev AS recipe_nazev,
             rv.verze AS recipe_verze,
             c.nazev AS cenik_nazev
      FROM kalkulace_polozky kp
      LEFT JOIN recipes r ON r.id = kp.recipe_id
      LEFT JOIN recipe_versions rv ON rv.id = kp.recipe_version_id
      LEFT JOIN cenik c ON c.id = kp.cenik_id
      WHERE kp.kalkulace_id = $1
      ORDER BY kp.kategorie, kp.poradi, kp.id
    `,
    [id]
  );

  const summary = polozky.rows.reduce((acc, row) => {
    const qty = parseNumeric(row.mnozstvi, 0);
    const prodejCelkem = parseNumeric(row.cena_prodej, 0) * qty;
    const nakladCelkem = parseNumeric(row.naklad_vypocet, parseNumeric(row.cena_nakup, 0) * qty);
    acc.total_naklad += nakladCelkem;
    acc.total_prodej += prodejCelkem;
    if (row.cost_mode === 'recipe') acc.recipe_rows += 1;
    if (row.marze_vypocet != null && parseNumeric(row.marze_vypocet, 100) < 25) acc.problematic_items += 1;
    return acc;
  }, { total_naklad: 0, total_prodej: 0, recipe_rows: 0, problematic_items: 0 });

  const foodCostPercent = summary.total_prodej > 0
    ? Number(((summary.total_naklad / summary.total_prodej) * 100).toFixed(2))
    : null;
  const grossMarginPercent = summary.total_prodej > 0
    ? Number((((summary.total_prodej - summary.total_naklad) / summary.total_prodej) * 100).toFixed(2))
    : null;

  return {
    ...rows[0],
    polozky: polozky.rows,
    summary: {
      total_naklad: Number(summary.total_naklad.toFixed(2)),
      total_prodej: Number(summary.total_prodej.toFixed(2)),
      food_cost_percent: foodCostPercent,
      gross_margin_percent: grossMarginPercent,
      recipe_rows: summary.recipe_rows,
      problematic_items: summary.problematic_items,
    },
  };
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id } = req.query;
    const { rows } = await query(
      'SELECT * FROM kalkulace WHERE zakazka_id = $1 ORDER BY verze DESC',
      [zakazka_id]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const detail = await loadKalkulaceDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Kalkulace nenalezena' });
    res.json(detail);
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, nazev, pocet_hostu, marze_procent, sleva_procent, dph_sazba, polozky } = req.body || {};
    const created = await withTransaction(async (client) => {
      const maxVer = await client.query('SELECT COALESCE(MAX(verze),0) AS v FROM kalkulace WHERE zakazka_id = $1', [zakazka_id]);
      const { rows } = await client.query(
        `
          INSERT INTO kalkulace (zakazka_id, verze, nazev, pocet_hostu, marze_procent, sleva_procent, dph_sazba)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          RETURNING *
        `,
        [zakazka_id, maxVer.rows[0].v + 1, nazev, pocet_hostu, marze_procent || 30, sleva_procent || 0, dph_sazba || 12]
      );

      const kalkulace = rows[0];
      for (const [i, rawPolozka] of (polozky || []).entries()) {
        const derived = await resolvePolozkaCosts(client, rawPolozka);
        await client.query(
          `
            INSERT INTO kalkulace_polozky (
              kalkulace_id, cenik_id, recipe_id, recipe_version_id, cost_mode,
              kategorie, nazev, jednotka, mnozstvi, cena_nakup, cena_prodej, poradi,
              naklad_vypocet, marze_vypocet
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          `,
          [
            kalkulace.id,
            rawPolozka.cenik_id || null,
            rawPolozka.recipe_id || null,
            derived.recipe_version_id || null,
            derived.cost_mode,
            rawPolozka.kategorie,
            rawPolozka.nazev,
            rawPolozka.jednotka,
            parseNumeric(rawPolozka.mnozstvi, 0),
            derived.cena_nakup,
            derived.cena_prodej,
            i,
            derived.naklad_vypocet,
            derived.marze_vypocet,
          ]
        );
      }

      return kalkulace;
    });

    res.status(201).json(created);
  } catch (err) { next(err); }
});

module.exports = router;
