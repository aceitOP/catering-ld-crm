'use strict';

const { query } = require('./db');
const { computeRecipeCostWithClient } = require('./recipeCostEngine');
const { parseNumeric, uniqueStrings } = require('./recipeUtils');

async function loadZakazkaKalkulace(client, zakazkaId) {
  const { rows: zakRows } = await client.query(
    `SELECT z.*,
            k.jmeno AS klient_jmeno,
            k.prijmeni AS klient_prijmeni,
            k.firma AS klient_firma
     FROM zakazky z
     LEFT JOIN klienti k ON k.id = z.klient_id
     WHERE z.id = $1
     LIMIT 1`,
    [zakazkaId]
  );
  const zakazka = zakRows[0];
  if (!zakazka) {
    throw Object.assign(new Error('Zakázka nebyla nalezena.'), { status: 404 });
  }

  const { rows: kalRows } = await client.query(
    'SELECT * FROM kalkulace WHERE zakazka_id = $1 ORDER BY verze DESC LIMIT 1',
    [zakazkaId]
  );
  const kalkulace = kalRows[0];
  if (!kalkulace) {
    return { zakazka, kalkulace: null, polozky: [] };
  }

  const { rows: polozky } = await client.query(
    `
      SELECT kp.*, r.nazev AS recipe_nazev, rv.verze AS recipe_verze
      FROM kalkulace_polozky kp
      LEFT JOIN recipes r ON r.id = kp.recipe_id
      LEFT JOIN recipe_versions rv ON rv.id = kp.recipe_version_id
      WHERE kp.kalkulace_id = $1
      ORDER BY kp.kategorie, kp.poradi, kp.id
    `,
    [kalkulace.id]
  );

  return { zakazka, kalkulace, polozky };
}

async function aggregateIngredientsForZakazka(zakazkaId, client = null) {
  const dbClient = client || { query };
  const { zakazka, kalkulace, polozky } = await loadZakazkaKalkulace(dbClient, zakazkaId);

  const ingredientMap = new Map();
  const componentMap = new Map();
  const allergens = new Set();
  const recipeCards = [];
  const issues = [];
  let totalRecipeCost = 0;

  for (const polozka of polozky) {
    if (polozka.cost_mode !== 'recipe' || !polozka.recipe_id || !polozka.recipe_version_id) {
      continue;
    }

    const recipeCost = await computeRecipeCostWithClient(dbClient, {
      recipeId: polozka.recipe_id,
      recipeVersionId: polozka.recipe_version_id,
    });
    const quantity = Math.max(parseNumeric(polozka.mnozstvi, 0), 0);
    const outputAmount = Math.max(parseNumeric(recipeCost.output_amount, 1), 0.001);
    const scale = quantity / outputAmount;
    const rowCost = Number((parseNumeric(recipeCost.total_cost) * scale).toFixed(2));
    totalRecipeCost += rowCost;

    recipeCards.push({
      kalkulace_polozka_id: polozka.id,
      recipe_id: recipeCost.recipe_id,
      recipe_version_id: recipeCost.recipe_version_id,
      recipe_name: recipeCost.recipe_name,
      version_number: recipeCost.version_number,
      requested_quantity: quantity,
      requested_unit: polozka.jednotka || recipeCost.output_unit,
      scaled_cost: rowCost,
      allergens: recipeCost.allergens,
    });

    for (const ingredient of recipeCost.ingredients) {
      const key = `${ingredient.ingredient_id}:${ingredient.jednotka}`;
      const existing = ingredientMap.get(key) || {
        ingredient_id: ingredient.ingredient_id,
        ingredient_slug: ingredient.ingredient_slug,
        ingredient_name: ingredient.ingredient_name,
        jednotka: ingredient.jednotka,
        mnozstvi: 0,
        nakupni_mnozstvi: 0,
        total_cost: 0,
        alergeny: [],
        source_rows: [],
      };
      existing.mnozstvi = Number((existing.mnozstvi + parseNumeric(ingredient.mnozstvi) * scale).toFixed(3));
      existing.nakupni_mnozstvi = Number((existing.nakupni_mnozstvi + parseNumeric(ingredient.nakupni_mnozstvi) * scale).toFixed(3));
      existing.total_cost = Number((existing.total_cost + parseNumeric(ingredient.total_cost) * scale).toFixed(2));
      existing.alergeny = uniqueStrings([...(existing.alergeny || []), ...(ingredient.alergeny || [])]);
      existing.source_rows = uniqueStrings([...(existing.source_rows || []), polozka.nazev, recipeCost.recipe_name]);
      ingredientMap.set(key, existing);
      (ingredient.alergeny || []).forEach((alergen) => allergens.add(alergen));
    }

    for (const component of recipeCost.components) {
      const key = `${component.recipe_id}:${component.jednotka}`;
      const existing = componentMap.get(key) || {
        recipe_id: component.recipe_id,
        recipe_name: component.recipe_name,
        jednotka: component.jednotka,
        mnozstvi: 0,
        scaled_cost: 0,
      };
      existing.mnozstvi = Number((existing.mnozstvi + parseNumeric(component.mnozstvi) * scale).toFixed(3));
      existing.scaled_cost = Number((existing.scaled_cost + parseNumeric(component.scaled_cost) * scale).toFixed(2));
      componentMap.set(key, existing);
    }
  }

  if (!recipeCards.length) {
    issues.push('V kalkulaci zatím nejsou žádné recepturové položky.');
  }

  return {
    zakazka: {
      id: zakazka.id,
      cislo: zakazka.cislo,
      nazev: zakazka.nazev,
      datum_akce: zakazka.datum_akce,
      typ: zakazka.typ,
      pocet_hostu: zakazka.pocet_hostu,
      klient: zakazka.klient_firma || [zakazka.klient_jmeno, zakazka.klient_prijmeni].filter(Boolean).join(' ') || null,
    },
    kalkulace: kalkulace
      ? {
          id: kalkulace.id,
          verze: kalkulace.verze,
          nazev: kalkulace.nazev,
          pocet_hostu: kalkulace.pocet_hostu,
        }
      : null,
    ingredients: [...ingredientMap.values()].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, 'cs')),
    components: [...componentMap.values()].sort((a, b) => a.recipe_name.localeCompare(b.recipe_name, 'cs')),
    recipe_cards: recipeCards.sort((a, b) => a.recipe_name.localeCompare(b.recipe_name, 'cs')),
    summary: {
      total_recipe_cost: Number(totalRecipeCost.toFixed(2)),
      total_ingredients: ingredientMap.size,
      total_components: componentMap.size,
      total_recipe_rows: recipeCards.length,
      allergens: [...allergens].sort((a, b) => a.localeCompare(b, 'cs')),
    },
    issues,
  };
}

module.exports = {
  loadZakazkaKalkulace,
  aggregateIngredientsForZakazka,
};
