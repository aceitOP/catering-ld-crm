'use strict';

const express = require('express');
const { query, withTransaction } = require('../db');
const { auth, requireCapability } = require('../middleware/auth');
const { clampPercent, parseNumeric, slugify, uniqueStrings } = require('../recipeUtils');

const router = express.Router();

function normalizeAllergens(input) {
  if (Array.isArray(input)) return uniqueStrings(input);
  if (typeof input === 'string') {
    return uniqueStrings(
      input
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }
  return [];
}

async function computePriceChangeFlags(ingredientIds) {
  if (!ingredientIds.length) return new Map();
  const { rows } = await query(
    `
      SELECT ingredient_id, cena_za_jednotku, platne_od, created_at
      FROM ingredient_price_history
      WHERE ingredient_id = ANY($1::int[])
      ORDER BY ingredient_id, platne_od DESC, created_at DESC, id DESC
    `,
    [ingredientIds]
  );

  const grouped = new Map();
  for (const row of rows) {
    const arr = grouped.get(row.ingredient_id) || [];
    if (arr.length < 2) arr.push(row);
    grouped.set(row.ingredient_id, arr);
  }

  const flags = new Map();
  for (const [ingredientId, arr] of grouped.entries()) {
    const latest = parseNumeric(arr[0]?.cena_za_jednotku);
    const previous = parseNumeric(arr[1]?.cena_za_jednotku);
    flags.set(ingredientId, {
      zdrazena: arr.length > 1 && latest > previous,
      previous_price: arr.length > 1 ? previous : null,
    });
  }
  return flags;
}

router.get('/', auth, requireCapability('recipe_costs.view'), async (req, res, next) => {
  try {
    const { aktivni, jednotka, alergen, q, zdrazene } = req.query;
    const where = [];
    const params = [];
    let p = 1;

    if (aktivni !== undefined) {
      where.push(`aktivni = $${p++}`);
      params.push(aktivni === 'true');
    }
    if (jednotka) {
      where.push(`jednotka = $${p++}`);
      params.push(jednotka);
    }
    if (alergen) {
      where.push(`$${p++} = ANY(alergeny)`);
      params.push(alergen);
    }
    if (q) {
      where.push(`(nazev ILIKE $${p++} OR slug ILIKE $${p++})`);
      params.push(`%${q}%`, `%${q}%`);
    }

    const { rows } = await query(
      `SELECT * FROM ingredients ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY aktivni DESC, nazev`,
      params
    );

    const flags = await computePriceChangeFlags(rows.map((row) => row.id));
    const data = rows
      .map((row) => ({
        ...row,
        ...flags.get(row.id),
      }))
      .filter((row) => (zdrazene === 'true' ? row.zdrazena : true));

    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/:id', auth, requireCapability('recipe_costs.view'), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM ingredients WHERE id = $1 LIMIT 1', [req.params.id]);
    const ingredient = rows[0];
    if (!ingredient) return res.status(404).json({ error: 'Surovina nenalezena' });

    const priceHistory = await query(
      'SELECT * FROM ingredient_price_history WHERE ingredient_id = $1 ORDER BY platne_od DESC, created_at DESC, id DESC',
      [req.params.id]
    );
    const recipeRefs = await query(
      `
        SELECT DISTINCT r.id, r.nazev, r.typ, rv.id AS recipe_version_id, rv.verze, rv.stav
        FROM recipe_items ri
        JOIN recipe_versions rv ON rv.id = ri.recipe_version_id
        JOIN recipes r ON r.id = rv.recipe_id
        WHERE ri.ingredient_id = $1
        ORDER BY r.nazev, rv.verze DESC
      `,
      [req.params.id]
    );

    res.json({
      ...ingredient,
      price_history: priceHistory.rows,
      recipes: recipeRefs.rows,
    });
  } catch (err) { next(err); }
});

router.post('/', auth, requireCapability('ingredients.manage'), async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (!payload.nazev?.trim()) {
      return res.status(400).json({ error: 'Název suroviny je povinný.' });
    }

    const result = await withTransaction(async (client) => {
      const slugBase = slugify(payload.slug || payload.nazev, 'surovina');
      let slug = slugBase;
      let attempt = 1;
      while (true) {
        const exists = await client.query('SELECT 1 FROM ingredients WHERE slug = $1 LIMIT 1', [slug]);
        if (!exists.rows.length) break;
        attempt += 1;
        slug = `${slugBase}-${attempt}`;
      }

      const alergeny = normalizeAllergens(payload.alergeny);
      const { rows } = await client.query(
        `
          INSERT INTO ingredients (
            slug, nazev, jednotka, nakupni_jednotka, aktualni_cena_za_jednotku,
            vytiznost_procent, odpad_procent, alergeny, poznamka, aktivni
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING *
        `,
        [
          slug,
          payload.nazev.trim(),
          payload.jednotka || 'kg',
          payload.nakupni_jednotka || null,
          parseNumeric(payload.aktualni_cena_za_jednotku, 0),
          clampPercent(payload.vytiznost_procent, 1, 100, 100),
          clampPercent(payload.odpad_procent, 0, 99, 0),
          alergeny,
          payload.poznamka || null,
          payload.aktivni !== false,
        ]
      );

      if (parseNumeric(payload.aktualni_cena_za_jednotku, 0) > 0) {
        await client.query(
          `
            INSERT INTO ingredient_price_history (ingredient_id, cena_za_jednotku, platne_od, zdroj, poznamka, created_by)
            VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [
            rows[0].id,
            parseNumeric(payload.aktualni_cena_za_jednotku, 0),
            payload.platne_od || new Date().toISOString().slice(0, 10),
            payload.zdroj || 'manual',
            payload.price_note || null,
            req.user.id,
          ]
        );
      }

      return rows[0];
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, requireCapability('ingredients.manage'), async (req, res, next) => {
  try {
    const current = await query('SELECT * FROM ingredients WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Surovina nenalezena' });

    const payload = req.body || {};
    const alergeny = Object.prototype.hasOwnProperty.call(payload, 'alergeny')
      ? normalizeAllergens(payload.alergeny)
      : current.rows[0].alergeny;

    const nextValues = {
      nazev: payload.nazev?.trim() || current.rows[0].nazev,
      jednotka: payload.jednotka || current.rows[0].jednotka,
      nakupni_jednotka: Object.prototype.hasOwnProperty.call(payload, 'nakupni_jednotka')
        ? (payload.nakupni_jednotka || null)
        : current.rows[0].nakupni_jednotka,
      aktualni_cena_za_jednotku: Object.prototype.hasOwnProperty.call(payload, 'aktualni_cena_za_jednotku')
        ? parseNumeric(payload.aktualni_cena_za_jednotku, 0)
        : parseNumeric(current.rows[0].aktualni_cena_za_jednotku, 0),
      vytiznost_procent: Object.prototype.hasOwnProperty.call(payload, 'vytiznost_procent')
        ? clampPercent(payload.vytiznost_procent, 1, 100, 100)
        : current.rows[0].vytiznost_procent,
      odpad_procent: Object.prototype.hasOwnProperty.call(payload, 'odpad_procent')
        ? clampPercent(payload.odpad_procent, 0, 99, 0)
        : current.rows[0].odpad_procent,
      alergeny,
      poznamka: Object.prototype.hasOwnProperty.call(payload, 'poznamka') ? (payload.poznamka || null) : current.rows[0].poznamka,
      aktivni: Object.prototype.hasOwnProperty.call(payload, 'aktivni') ? Boolean(payload.aktivni) : current.rows[0].aktivni,
    };

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE ingredients
          SET nazev = $2,
              jednotka = $3,
              nakupni_jednotka = $4,
              aktualni_cena_za_jednotku = $5,
              vytiznost_procent = $6,
              odpad_procent = $7,
              alergeny = $8,
              poznamka = $9,
              aktivni = $10,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          req.params.id,
          nextValues.nazev,
          nextValues.jednotka,
          nextValues.nakupni_jednotka,
          nextValues.aktualni_cena_za_jednotku,
          nextValues.vytiznost_procent,
          nextValues.odpad_procent,
          nextValues.alergeny,
          nextValues.poznamka,
          nextValues.aktivni,
        ]
      );

      if (Object.prototype.hasOwnProperty.call(payload, 'aktualni_cena_za_jednotku')
        && parseNumeric(current.rows[0].aktualni_cena_za_jednotku, 0) !== nextValues.aktualni_cena_za_jednotku) {
        await client.query(
          `
            INSERT INTO ingredient_price_history (ingredient_id, cena_za_jednotku, platne_od, zdroj, poznamka, created_by)
            VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [
            req.params.id,
            nextValues.aktualni_cena_za_jednotku,
            payload.platne_od || new Date().toISOString().slice(0, 10),
            payload.zdroj || 'manual',
            payload.price_note || 'Aktualizace ceny suroviny',
            req.user.id,
          ]
        );
      }

      return rows[0];
    });

    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:id/price-history', auth, requireCapability('ingredients.manage'), async (req, res, next) => {
  try {
    const payload = req.body || {};
    const cena = parseNumeric(payload.cena_za_jednotku, NaN);
    if (!Number.isFinite(cena)) {
      return res.status(400).json({ error: 'Cena za jednotku je povinná.' });
    }

    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM ingredients WHERE id = $1 LIMIT 1', [req.params.id]);
      if (!existing.rows[0]) {
        throw Object.assign(new Error('Surovina nenalezena'), { status: 404 });
      }

      const { rows } = await client.query(
        `
          INSERT INTO ingredient_price_history (ingredient_id, cena_za_jednotku, platne_od, zdroj, poznamka, created_by)
          VALUES ($1,$2,$3,$4,$5,$6)
          RETURNING *
        `,
        [
          req.params.id,
          cena,
          payload.platne_od || new Date().toISOString().slice(0, 10),
          payload.zdroj || 'manual',
          payload.poznamka || null,
          req.user.id,
        ]
      );

      await client.query(
        'UPDATE ingredients SET aktualni_cena_za_jednotku = $2, updated_at = NOW() WHERE id = $1',
        [req.params.id, cena]
      );

      return rows[0];
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
