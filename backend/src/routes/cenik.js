'use strict';
const express = require('express');
const { query, withTransaction } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');
const { computeRecipeCostWithClient } = require('../recipeCostEngine');

const router = express.Router();

const CATEGORY_KEY_RE = /^[a-z0-9_]+$/;

function isValidCategoryKey(value) {
  return CATEGORY_KEY_RE.test(value || '');
}

async function getCategoryLabels(client = { query }) {
  const { rows } = await client.query(
    `SELECT enumlabel AS hodnota FROM pg_enum
     WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cenik_kategorie')
     ORDER BY enumsortorder`
  );
  return rows.map((r) => r.hodnota);
}

router.get('/kategorie', auth, async (req, res, next) => {
  try {
    res.json({ data: await getCategoryLabels() });
  } catch (err) { next(err); }
});

router.post('/kategorie', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { klic } = req.body;
    if (!isValidCategoryKey(klic)) {
      return res.status(400).json({ error: 'Klíč kategorie musí obsahovat pouze malá písmena, číslice a podtržítka' });
    }
    const exists = await query(
      `SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cenik_kategorie') AND enumlabel = $1`,
      [klic]
    );
    if (exists.rows.length > 0) return res.status(409).json({ error: 'Kategorie s tímto klíčem již existuje' });
    // klic ověřen regexpem – bezpečná interpolace
    await query(`ALTER TYPE cenik_kategorie ADD VALUE '${klic}'`);
    res.status(201).json({ hodnota: klic });
  } catch (err) { next(err); }
});

router.patch('/kategorie/:klic', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const puvodniKlic = req.params.klic;
    const novyKlic = req.body?.klic;

    if (!isValidCategoryKey(puvodniKlic) || !isValidCategoryKey(novyKlic)) {
      return res.status(400).json({ error: 'Klíče kategorií musí obsahovat pouze malá písmena, číslice a podtržítka' });
    }
    if (puvodniKlic === novyKlic) {
      return res.json({ hodnota: novyKlic });
    }

    const labels = await getCategoryLabels();
    if (!labels.includes(puvodniKlic)) {
      return res.status(404).json({ error: 'Kategorie nenalezena' });
    }
    if (labels.includes(novyKlic)) {
      return res.status(409).json({ error: 'Kategorie s tímto klíčem již existuje' });
    }

    await query(`ALTER TYPE cenik_kategorie RENAME VALUE '${puvodniKlic}' TO '${novyKlic}'`);
    res.json({ hodnota: novyKlic });
  } catch (err) { next(err); }
});

router.delete('/kategorie/:klic', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const mazana = req.params.klic;
    const nahraditZa = req.body?.nahraditZa;

    if (!isValidCategoryKey(mazana)) {
      return res.status(400).json({ error: 'Neplatný klíč kategorie' });
    }

    const labels = await getCategoryLabels();
    if (!labels.includes(mazana)) {
      return res.status(404).json({ error: 'Kategorie nenalezena' });
    }
    if (labels.length <= 1) {
      return res.status(400).json({ error: 'Poslední kategorii nelze smazat' });
    }
    if (!isValidCategoryKey(nahraditZa) || mazana === nahraditZa || !labels.includes(nahraditZa)) {
      return res.status(400).json({ error: 'Vyberte platnou náhradní kategorii' });
    }

    const noveLabels = labels.filter((label) => label !== mazana);
    const enumValuesSql = noveLabels.map((label) => `'${label}'`).join(', ');

    await withTransaction(async (client) => {
      await client.query(`UPDATE cenik SET kategorie = $1 WHERE kategorie = $2`, [nahraditZa, mazana]);
      await client.query(`UPDATE kalkulace_polozky SET kategorie = $1 WHERE kategorie = $2`, [nahraditZa, mazana]);
      await client.query(`UPDATE nabidky_polozky SET kategorie = $1 WHERE kategorie = $2`, [nahraditZa, mazana]);

      await client.query(`ALTER TABLE cenik ALTER COLUMN kategorie TYPE text USING kategorie::text`);
      await client.query(`ALTER TABLE kalkulace_polozky ALTER COLUMN kategorie TYPE text USING kategorie::text`);
      await client.query(`ALTER TABLE nabidky_polozky ALTER COLUMN kategorie TYPE text USING kategorie::text`);

      await client.query(`DROP TYPE cenik_kategorie`);
      await client.query(`CREATE TYPE cenik_kategorie AS ENUM (${enumValuesSql})`);

      await client.query(`ALTER TABLE cenik ALTER COLUMN kategorie TYPE cenik_kategorie USING kategorie::cenik_kategorie`);
      await client.query(`ALTER TABLE kalkulace_polozky ALTER COLUMN kategorie TYPE cenik_kategorie USING kategorie::cenik_kategorie`);
      await client.query(`ALTER TABLE nabidky_polozky ALTER COLUMN kategorie TYPE cenik_kategorie USING kategorie::cenik_kategorie`);
    });

    res.json({ message: 'Kategorie smazána', nahraditZa });
  } catch (err) { next(err); }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const { kategorie, aktivni, q } = req.query;
    const where = []; const params = []; let p = 1;
    if (kategorie) { where.push(`kategorie = $${p++}`); params.push(kategorie); }
    if (aktivni !== undefined) { where.push(`aktivni = $${p++}`); params.push(aktivni === 'true'); }
    if (q) { where.push(`nazev ILIKE $${p++}`); params.push(`%${q}%`); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(
      `
        SELECT c.*, r.nazev AS recipe_nazev
        FROM cenik c
        LEFT JOIN recipes r ON r.id = c.recipe_id
        ${wc}
        ORDER BY c.kategorie, c.nazev
      `,
      params
    );

    const data = [];
    for (const row of rows) {
      let recipeCost = null;
      if (row.recipe_id) {
        recipeCost = await computeRecipeCostWithClient({ query }, { recipeId: row.recipe_id }).catch(() => null);
      }
      data.push({
        ...row,
        recipe_cost_current: recipeCost?.cost_per_portion ?? recipeCost?.total_cost ?? null,
        recipe_cost_total: recipeCost?.total_cost ?? null,
        recipe_allergens: recipeCost?.allergens || [],
      });
    }

    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/', auth, requireMinRole('uzivatel'), async (req, res, next) => {
  try {
    const { nazev, kategorie, jednotka, cena_nakup, cena_prodej, dph_sazba, poznamka, recipe_id } = req.body;
    let effectiveNakup = cena_nakup || 0;
    if (recipe_id) {
      const recipeCost = await computeRecipeCostWithClient({ query }, { recipeId: recipe_id }).catch(() => null);
      if (recipeCost) effectiveNakup = recipeCost.cost_per_portion ?? recipeCost.total_cost ?? effectiveNakup;
    }
    const { rows } = await query(
      `INSERT INTO cenik (nazev,kategorie,jednotka,cena_nakup,cena_prodej,dph_sazba,poznamka,recipe_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [nazev, kategorie, jednotka || 'os.', effectiveNakup || 0, cena_prodej || 0, dph_sazba || 12, poznamka, recipe_id || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, requireMinRole('uzivatel'), async (req, res, next) => {
  try {
    if (req.body.recipe_id) {
      const recipeCost = await computeRecipeCostWithClient({ query }, { recipeId: req.body.recipe_id }).catch(() => null);
      if (recipeCost && !Object.prototype.hasOwnProperty.call(req.body, 'cena_nakup')) {
        req.body.cena_nakup = recipeCost.cost_per_portion ?? recipeCost.total_cost ?? req.body.cena_nakup;
      }
    }
    const allowed = ['nazev','kategorie','jednotka','cena_nakup','cena_prodej','dph_sazba','aktivni','poznamka','recipe_id'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE cenik SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    if (!rows[0]) return res.status(404).json({ error: 'Položka nenalezena' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    await query('UPDATE cenik SET aktivni = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Položka deaktivována' });
  } catch (err) { next(err); }
});

module.exports = router;
