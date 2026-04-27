'use strict';

const { query } = require('./db');
const { clampPercent, parseNumeric, uniqueStrings } = require('./recipeUtils');

async function loadRecipeVersion(client, recipeId, versionId = null) {
  const versionQuery = versionId
    ? {
        text: `
          SELECT rv.*, r.nazev AS recipe_nazev, r.typ AS recipe_typ, r.kategorie AS recipe_kategorie,
                 r.vydatnost_mnozstvi, r.vydatnost_jednotka, r.default_porce_mnozstvi,
                 r.default_porce_jednotka, r.cas_pripravy_min, r.poznamka AS recipe_poznamka
          FROM recipe_versions rv
          JOIN recipes r ON r.id = rv.recipe_id
          WHERE rv.recipe_id = $1 AND rv.id = $2
          LIMIT 1
        `,
        values: [recipeId, versionId],
      }
    : {
        text: `
          SELECT rv.*, r.nazev AS recipe_nazev, r.typ AS recipe_typ, r.kategorie AS recipe_kategorie,
                 r.vydatnost_mnozstvi, r.vydatnost_jednotka, r.default_porce_mnozstvi,
                 r.default_porce_jednotka, r.cas_pripravy_min, r.poznamka AS recipe_poznamka
          FROM recipe_versions rv
          JOIN recipes r ON r.id = rv.recipe_id
          WHERE rv.recipe_id = $1
          ORDER BY CASE WHEN rv.stav = 'active' THEN 0 ELSE 1 END, rv.verze DESC
          LIMIT 1
        `,
        values: [recipeId],
      };

  const { rows: versionRows } = await client.query(versionQuery.text, versionQuery.values);
  const version = versionRows[0];
  if (!version) return null;

  const { rows: itemRows } = await client.query(
    `
      SELECT ri.*,
             i.nazev AS ingredient_nazev,
             i.slug AS ingredient_slug,
             i.jednotka AS ingredient_jednotka,
             i.aktualni_cena_za_jednotku,
             i.vytiznost_procent,
             i.odpad_procent,
             i.alergeny,
             sr.nazev AS subrecipe_nazev,
             sr.typ AS subrecipe_typ
      FROM recipe_items ri
      LEFT JOIN ingredients i ON i.id = ri.ingredient_id
      LEFT JOIN recipes sr ON sr.id = ri.subrecipe_id
      WHERE ri.recipe_version_id = $1
      ORDER BY ri.poradi, ri.id
    `,
    [version.id]
  );

  const { rows: stepRows } = await client.query(
    `
      SELECT rs.*,
             d.nazev AS photo_nazev,
             d.filename AS photo_filename,
             d.mime_type AS photo_mime_type,
             d.velikost AS photo_velikost
      FROM recipe_steps rs
      LEFT JOIN dokumenty d ON d.id = rs.photo_document_id
      WHERE rs.recipe_version_id = $1
      ORDER BY rs.krok_index, rs.id
    `,
    [version.id]
  );

  return {
    ...version,
    items: itemRows,
    steps: stepRows,
  };
}

function computeIngredientCost(item) {
  const mnozstvi = parseNumeric(item.mnozstvi);
  const cena = parseNumeric(item.aktualni_cena_za_jednotku);
  const effectiveYield = Math.max(1, clampPercent(item.vytiznost_procent, 1, 100, 100) - clampPercent(item.odpad_procent, 0, 99, 0));
  const purchaseFactor = 100 / effectiveYield;
  const nakupniMnozstvi = mnozstvi * purchaseFactor;
  const totalCost = nakupniMnozstvi * cena;

  return {
    ingredient_id: item.ingredient_id,
    ingredient_slug: item.ingredient_slug,
    ingredient_name: item.ingredient_nazev,
    jednotka: item.jednotka || item.ingredient_jednotka,
    mnozstvi,
    nakupni_mnozstvi: Number(nakupniMnozstvi.toFixed(3)),
    cena_za_jednotku: cena,
    total_cost: Number(totalCost.toFixed(2)),
    alergeny: uniqueStrings(item.alergeny || []),
  };
}

async function computeRecipeCostWithClient(client, options, state = {}) {
  const recipeId = Number(options.recipeId);
  const requestedVersionId = options.recipeVersionId ? Number(options.recipeVersionId) : null;
  const cache = state.cache || new Map();
  const visited = state.visited || new Set();
  const cacheKey = `${recipeId}:${requestedVersionId || 'active'}`;

  if (cache.has(cacheKey)) return cache.get(cacheKey);
  if (visited.has(cacheKey)) {
    throw Object.assign(new Error('Receptura obsahuje cyklickou vazbu v podrecepturach.'), { status: 400 });
  }

  visited.add(cacheKey);
  const version = await loadRecipeVersion(client, recipeId, requestedVersionId);
  if (!version) {
    visited.delete(cacheKey);
    throw Object.assign(new Error('Receptura nebo verze receptury nebyla nalezena.'), { status: 404 });
  }

  const flattenedIngredients = new Map();
  const components = [];
  const allergens = new Set();
  let totalCost = 0;

  for (const item of version.items) {
    if (item.item_type === 'ingredient') {
      const computed = computeIngredientCost(item);
      totalCost += computed.total_cost;
      computed.alergeny.forEach((alergen) => allergens.add(alergen));
      const key = `${computed.ingredient_id}:${computed.jednotka}`;
      const existing = flattenedIngredients.get(key) || {
        ingredient_id: computed.ingredient_id,
        ingredient_slug: computed.ingredient_slug,
        ingredient_name: computed.ingredient_name,
        jednotka: computed.jednotka,
        mnozstvi: 0,
        nakupni_mnozstvi: 0,
        total_cost: 0,
        alergeny: [],
      };
      existing.mnozstvi = Number((existing.mnozstvi + computed.mnozstvi).toFixed(3));
      existing.nakupni_mnozstvi = Number((existing.nakupni_mnozstvi + computed.nakupni_mnozstvi).toFixed(3));
      existing.total_cost = Number((existing.total_cost + computed.total_cost).toFixed(2));
      existing.alergeny = uniqueStrings([...(existing.alergeny || []), ...computed.alergeny]);
      flattenedIngredients.set(key, existing);
      continue;
    }

    const nested = await computeRecipeCostWithClient(
      client,
      { recipeId: item.subrecipe_id, recipeVersionId: null },
      { cache, visited }
    );
    const baseOutput = Math.max(parseNumeric(nested.output_amount, 1), 0.001);
    const scale = parseNumeric(item.mnozstvi, 0) / baseOutput;
    const scaledCost = Number((nested.total_cost * scale).toFixed(2));
    totalCost += scaledCost;
    nested.allergens.forEach((alergen) => allergens.add(alergen));
    components.push({
      recipe_id: nested.recipe_id,
      recipe_version_id: nested.recipe_version_id,
      recipe_name: nested.recipe_name,
      mnozstvi: parseNumeric(item.mnozstvi, 0),
      jednotka: item.jednotka || nested.output_unit || 'ks',
      scaled_cost: scaledCost,
      scale: Number(scale.toFixed(4)),
    });

    for (const ingredient of nested.ingredients) {
      const key = `${ingredient.ingredient_id}:${ingredient.jednotka}`;
      const existing = flattenedIngredients.get(key) || {
        ingredient_id: ingredient.ingredient_id,
        ingredient_slug: ingredient.ingredient_slug,
        ingredient_name: ingredient.ingredient_name,
        jednotka: ingredient.jednotka,
        mnozstvi: 0,
        nakupni_mnozstvi: 0,
        total_cost: 0,
        alergeny: [],
      };
      existing.mnozstvi = Number((existing.mnozstvi + (parseNumeric(ingredient.mnozstvi) * scale)).toFixed(3));
      existing.nakupni_mnozstvi = Number((existing.nakupni_mnozstvi + (parseNumeric(ingredient.nakupni_mnozstvi) * scale)).toFixed(3));
      existing.total_cost = Number((existing.total_cost + (parseNumeric(ingredient.total_cost) * scale)).toFixed(2));
      existing.alergeny = uniqueStrings([...(existing.alergeny || []), ...(ingredient.alergeny || [])]);
      flattenedIngredients.set(key, existing);
    }
  }

  const outputAmount = parseNumeric(version.vydatnost_mnozstvi, parseNumeric(version.default_porce_mnozstvi, 1) || 1);
  const outputUnit = version.vydatnost_jednotka || version.default_porce_jednotka || 'porce';
  const defaultPortionAmount = parseNumeric(version.default_porce_mnozstvi, 1);
  const costPerOutputUnit = outputAmount > 0 ? Number((totalCost / outputAmount).toFixed(2)) : Number(totalCost.toFixed(2));
  const costPerPortion = defaultPortionAmount > 0 ? Number((costPerOutputUnit * defaultPortionAmount).toFixed(2)) : null;

  const result = {
    recipe_id: version.recipe_id,
    recipe_version_id: version.id,
    recipe_name: version.recipe_nazev,
    recipe_type: version.recipe_typ,
    recipe_category: version.recipe_kategorie,
    version_number: version.verze,
    version_status: version.stav,
    output_amount: outputAmount,
    output_unit: outputUnit,
    default_portion_amount: defaultPortionAmount,
    default_portion_unit: version.default_porce_jednotka || 'porce',
    total_cost: Number(totalCost.toFixed(2)),
    cost_per_output_unit: costPerOutputUnit,
    cost_per_portion: costPerPortion,
    allergens: [...allergens].sort((a, b) => a.localeCompare(b, 'cs')),
    ingredients: [...flattenedIngredients.values()].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, 'cs')),
    components,
    items: version.items,
    steps: version.steps,
  };

  cache.set(cacheKey, result);
  visited.delete(cacheKey);
  return result;
}

async function computeRecipeCost(options, client = null) {
  if (client) {
    return computeRecipeCostWithClient(client, options);
  }
  return computeRecipeCostWithClient({ query }, options);
}

async function getResolvedRecipeVersionId(client, recipeId, recipeVersionId = null) {
  if (recipeVersionId) return Number(recipeVersionId);
  const version = await loadRecipeVersion(client, recipeId, null);
  return version?.id || null;
}

module.exports = {
  loadRecipeVersion,
  computeRecipeCost,
  computeRecipeCostWithClient,
  getResolvedRecipeVersionId,
};
