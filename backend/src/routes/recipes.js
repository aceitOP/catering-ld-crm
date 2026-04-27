'use strict';

const express = require('express');
const { query, withTransaction } = require('../db');
const { auth, requireCapability } = require('../middleware/auth');
const { computeRecipeCostWithClient, loadRecipeVersion } = require('../recipeCostEngine');
const { escapeHtml, parseNumeric, slugify } = require('../recipeUtils');

const router = express.Router();

function normalizeRecipePayload(payload = {}) {
  return {
    nazev: payload.nazev?.trim() || '',
    interni_nazev: payload.interni_nazev?.trim() || null,
    typ: payload.typ === 'component' ? 'component' : 'final',
    kategorie: payload.kategorie?.trim() || null,
    vydatnost_mnozstvi: Object.prototype.hasOwnProperty.call(payload, 'vydatnost_mnozstvi') ? parseNumeric(payload.vydatnost_mnozstvi, null) : null,
    vydatnost_jednotka: payload.vydatnost_jednotka?.trim() || null,
    default_porce_mnozstvi: Object.prototype.hasOwnProperty.call(payload, 'default_porce_mnozstvi') ? parseNumeric(payload.default_porce_mnozstvi, null) : null,
    default_porce_jednotka: payload.default_porce_jednotka?.trim() || null,
    cas_pripravy_min: Object.prototype.hasOwnProperty.call(payload, 'cas_pripravy_min') ? parseNumeric(payload.cas_pripravy_min, null) : null,
    poznamka: payload.poznamka?.trim() || null,
    aktivni: payload.aktivni !== false,
  };
}

function normalizeRecipeItem(item = {}, index = 0) {
  return {
    item_type: item.item_type === 'subrecipe' ? 'subrecipe' : 'ingredient',
    ingredient_id: item.ingredient_id ? Number(item.ingredient_id) : null,
    subrecipe_id: item.subrecipe_id ? Number(item.subrecipe_id) : null,
    mnozstvi: parseNumeric(item.mnozstvi, 0),
    jednotka: item.jednotka?.trim() || 'ks',
    poradi: Number.isFinite(Number(item.poradi)) ? Number(item.poradi) : index,
    poznamka: item.poznamka?.trim() || null,
  };
}

function normalizeRecipeStep(step = {}, index = 0) {
  return {
    krok_index: Number.isFinite(Number(step.krok_index)) ? Number(step.krok_index) : index + 1,
    nazev: step.nazev?.trim() || null,
    instrukce: step.instrukce?.trim() || '',
    pracoviste: step.pracoviste?.trim() || null,
    cas_min: Object.prototype.hasOwnProperty.call(step, 'cas_min') ? parseNumeric(step.cas_min, null) : null,
    kriticky_bod: Boolean(step.kriticky_bod),
    poznamka: step.poznamka?.trim() || null,
  };
}

async function ensureRecipeSlug(client, rawSlug) {
  const base = slugify(rawSlug, 'receptura');
  let nextSlug = base;
  let attempt = 1;
  while (true) {
    const exists = await client.query('SELECT 1 FROM recipes WHERE slug = $1 LIMIT 1', [nextSlug]);
    if (!exists.rows.length) return nextSlug;
    attempt += 1;
    nextSlug = `${base}-${attempt}`;
  }
}

async function replaceVersionCollections(client, versionId, items = null, steps = null) {
  if (Array.isArray(items)) {
    await client.query('DELETE FROM recipe_items WHERE recipe_version_id = $1', [versionId]);
    for (const [index, item] of items.map(normalizeRecipeItem).entries()) {
      if (item.item_type === 'ingredient' && !item.ingredient_id) continue;
      if (item.item_type === 'subrecipe' && !item.subrecipe_id) continue;
      if (item.mnozstvi <= 0) continue;
      await client.query(
        `
          INSERT INTO recipe_items (recipe_version_id, item_type, ingredient_id, subrecipe_id, mnozstvi, jednotka, poradi, poznamka)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          versionId,
          item.item_type,
          item.item_type === 'ingredient' ? item.ingredient_id : null,
          item.item_type === 'subrecipe' ? item.subrecipe_id : null,
          item.mnozstvi,
          item.jednotka,
          Number.isFinite(item.poradi) ? item.poradi : index,
          item.poznamka,
        ]
      );
    }
  }

  if (Array.isArray(steps)) {
    await client.query('DELETE FROM recipe_steps WHERE recipe_version_id = $1', [versionId]);
    for (const [index, step] of steps.map(normalizeRecipeStep).entries()) {
      if (!step.instrukce) continue;
      await client.query(
        `
          INSERT INTO recipe_steps (recipe_version_id, krok_index, nazev, instrukce, pracoviste, cas_min, kriticky_bod, poznamka)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [versionId, step.krok_index || index + 1, step.nazev, step.instrukce, step.pracoviste, step.cas_min, step.kriticky_bod, step.poznamka]
      );
    }
  }
}

async function loadRecipeDetail(client, recipeId) {
  const { rows } = await client.query('SELECT * FROM recipes WHERE id = $1 LIMIT 1', [recipeId]);
  const recipe = rows[0];
  if (!recipe) return null;

  const versions = await client.query(
    'SELECT * FROM recipe_versions WHERE recipe_id = $1 ORDER BY verze DESC, created_at DESC',
    [recipeId]
  );
  const activeVersion = versions.rows.find((row) => row.stav === 'active') || versions.rows[0] || null;
  const versionDetail = activeVersion ? await loadRecipeVersion(client, recipeId, activeVersion.id) : null;
  const documents = await client.query(
    `
      SELECT id, nazev, mime_type, velikost, created_at, recipe_version_id
      FROM dokumenty
      WHERE recipe_id = $1
      ORDER BY created_at DESC
    `,
    [recipeId]
  );

  let costSummary = null;
  if (activeVersion) {
    costSummary = await computeRecipeCostWithClient(client, {
      recipeId,
      recipeVersionId: activeVersion.id,
    }).catch(() => null);
  }

  return {
    ...recipe,
    versions: versions.rows,
    active_version_id: activeVersion?.id || null,
    active_version: versionDetail,
    current_cost: costSummary,
    documents: documents.rows,
  };
}

router.get('/', auth, requireCapability('recipe_costs.view'), async (req, res, next) => {
  try {
    const { q, typ, aktivni, stav } = req.query;
    const where = [];
    const params = [];
    let p = 1;

    if (q) {
      where.push(`(r.nazev ILIKE $${p++} OR r.interni_nazev ILIKE $${p++} OR r.slug ILIKE $${p++})`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (typ) {
      where.push(`r.typ = $${p++}`);
      params.push(typ);
    }
    if (aktivni !== undefined) {
      where.push(`r.aktivni = $${p++}`);
      params.push(aktivni === 'true');
    }
    if (stav) {
      where.push(`COALESCE(av.stav, lv.stav) = $${p++}`);
      params.push(stav);
    }

    const { rows } = await query(
      `
        SELECT r.*,
               av.id AS active_version_id,
               av.verze AS active_version_number,
               av.stav AS active_version_status,
               lv.id AS latest_version_id,
               lv.verze AS latest_version_number,
               lv.stav AS latest_version_status,
               COALESCE(doc.cnt, 0)::int AS dokumenty_count
        FROM recipes r
        LEFT JOIN LATERAL (
          SELECT id, verze, stav
          FROM recipe_versions
          WHERE recipe_id = r.id AND stav = 'active'
          ORDER BY verze DESC
          LIMIT 1
        ) av ON true
        LEFT JOIN LATERAL (
          SELECT id, verze, stav
          FROM recipe_versions
          WHERE recipe_id = r.id
          ORDER BY verze DESC
          LIMIT 1
        ) lv ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS cnt
          FROM dokumenty d
          WHERE d.recipe_id = r.id
        ) doc ON true
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY r.aktivni DESC, r.nazev
      `,
      params
    );

    const data = [];
    for (const row of rows) {
      let currentCost = null;
      if (row.active_version_id) {
        currentCost = await computeRecipeCostWithClient({ query }, {
          recipeId: row.id,
          recipeVersionId: row.active_version_id,
        }).catch(() => null);
      }
      data.push({
        ...row,
        current_cost: currentCost ? currentCost.total_cost : null,
        allergens: currentCost?.allergens || [],
      });
    }

    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/', auth, requireCapability('recipes.manage'), async (req, res, next) => {
  try {
    const payload = normalizeRecipePayload(req.body || {});
    if (!payload.nazev) {
      return res.status(400).json({ error: 'Název receptury je povinný.' });
    }

    const result = await withTransaction(async (client) => {
      const slug = await ensureRecipeSlug(client, req.body?.slug || payload.nazev);
      const { rows } = await client.query(
        `
          INSERT INTO recipes (
            slug, nazev, interni_nazev, typ, kategorie, vydatnost_mnozstvi, vydatnost_jednotka,
            default_porce_mnozstvi, default_porce_jednotka, cas_pripravy_min, poznamka, aktivni
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING *
        `,
        [
          slug,
          payload.nazev,
          payload.interni_nazev,
          payload.typ,
          payload.kategorie,
          payload.vydatnost_mnozstvi,
          payload.vydatnost_jednotka,
          payload.default_porce_mnozstvi,
          payload.default_porce_jednotka,
          payload.cas_pripravy_min,
          payload.poznamka,
          payload.aktivni,
        ]
      );

      const recipe = rows[0];
      const versionRows = await client.query(
        `
          INSERT INTO recipe_versions (recipe_id, verze, stav, poznamka_zmeny, created_by)
          VALUES ($1, 1, 'draft', $2, $3)
          RETURNING *
        `,
        [recipe.id, 'Počáteční verze', req.user.id]
      );

      await replaceVersionCollections(client, versionRows.rows[0].id, req.body?.items || [], req.body?.steps || []);
      return loadRecipeDetail(client, recipe.id);
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.get('/:id', auth, requireCapability('recipe_costs.view'), async (req, res, next) => {
  try {
    const detail = await loadRecipeDetail({ query }, req.params.id);
    if (!detail) return res.status(404).json({ error: 'Receptura nenalezena' });
    res.json(detail);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, requireCapability('recipes.manage'), async (req, res, next) => {
  try {
    const current = await query('SELECT * FROM recipes WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Receptura nenalezena' });
    const payload = normalizeRecipePayload({ ...current.rows[0], ...(req.body || {}) });

    const result = await withTransaction(async (client) => {
      await client.query(
        `
          UPDATE recipes
          SET nazev = $2,
              interni_nazev = $3,
              typ = $4,
              kategorie = $5,
              vydatnost_mnozstvi = $6,
              vydatnost_jednotka = $7,
              default_porce_mnozstvi = $8,
              default_porce_jednotka = $9,
              cas_pripravy_min = $10,
              poznamka = $11,
              aktivni = $12,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          req.params.id,
          payload.nazev,
          payload.interni_nazev,
          payload.typ,
          payload.kategorie,
          payload.vydatnost_mnozstvi,
          payload.vydatnost_jednotka,
          payload.default_porce_mnozstvi,
          payload.default_porce_jednotka,
          payload.cas_pripravy_min,
          payload.poznamka,
          payload.aktivni,
        ]
      );
      return loadRecipeDetail(client, req.params.id);
    });

    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:id/versions', auth, requireCapability('recipes.manage'), async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const recipe = await client.query('SELECT * FROM recipes WHERE id = $1 LIMIT 1', [req.params.id]);
      if (!recipe.rows[0]) {
        throw Object.assign(new Error('Receptura nenalezena'), { status: 404 });
      }

      const latest = await client.query(
        'SELECT * FROM recipe_versions WHERE recipe_id = $1 ORDER BY verze DESC LIMIT 1',
        [req.params.id]
      );
      const nextVersionNumber = (latest.rows[0]?.verze || 0) + 1;
      const sourceVersionId = req.body?.source_version_id || latest.rows[0]?.id || null;

      const { rows } = await client.query(
        `
          INSERT INTO recipe_versions (recipe_id, verze, stav, poznamka_zmeny, created_by)
          VALUES ($1,$2,'draft',$3,$4)
          RETURNING *
        `,
        [req.params.id, nextVersionNumber, req.body?.poznamka_zmeny || 'Nová pracovní verze', req.user.id]
      );

      if (sourceVersionId) {
        const source = await loadRecipeVersion(client, req.params.id, sourceVersionId);
        await replaceVersionCollections(client, rows[0].id, source?.items || [], source?.steps || []);
      }

      const version = await loadRecipeVersion(client, req.params.id, rows[0].id);
      return version;
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.get('/:id/versions/:versionId', auth, requireCapability('recipe_costs.view'), async (req, res, next) => {
  try {
    const version = await loadRecipeVersion({ query }, req.params.id, req.params.versionId);
    if (!version) return res.status(404).json({ error: 'Verze receptury nenalezena' });

    const cost = await computeRecipeCostWithClient({ query }, {
      recipeId: req.params.id,
      recipeVersionId: req.params.versionId,
    }).catch(() => null);

    res.json({
      ...version,
      cost,
    });
  } catch (err) { next(err); }
});

router.patch('/:id/versions/:versionId', auth, requireCapability('recipes.manage'), async (req, res, next) => {
  try {
    const payload = req.body || {};
    const result = await withTransaction(async (client) => {
      const current = await client.query(
        'SELECT * FROM recipe_versions WHERE id = $1 AND recipe_id = $2 LIMIT 1',
        [req.params.versionId, req.params.id]
      );
      if (!current.rows[0]) {
        throw Object.assign(new Error('Verze receptury nenalezena'), { status: 404 });
      }

      const nextState = payload.stav && ['draft', 'active', 'archived'].includes(payload.stav)
        ? payload.stav
        : current.rows[0].stav;

      await client.query(
        `
          UPDATE recipe_versions
          SET stav = $3,
              poznamka_zmeny = $4,
              schvaleno_by = $5,
              schvaleno_at = CASE WHEN $3 = 'active' THEN COALESCE(schvaleno_at, NOW()) ELSE schvaleno_at END
          WHERE id = $1 AND recipe_id = $2
        `,
        [
          req.params.versionId,
          req.params.id,
          nextState,
          Object.prototype.hasOwnProperty.call(payload, 'poznamka_zmeny') ? payload.poznamka_zmeny : current.rows[0].poznamka_zmeny,
          nextState === 'active' ? req.user.id : current.rows[0].schvaleno_by,
        ]
      );

      await replaceVersionCollections(client, req.params.versionId, payload.items, payload.steps);
      const version = await loadRecipeVersion(client, req.params.id, req.params.versionId);
      const cost = await computeRecipeCostWithClient(client, {
        recipeId: req.params.id,
        recipeVersionId: req.params.versionId,
      }).catch(() => null);
      return { ...version, cost };
    });

    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:id/versions/:versionId/activate', auth, requireCapability('recipes.manage'), async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const exists = await client.query(
        'SELECT id FROM recipe_versions WHERE id = $1 AND recipe_id = $2 LIMIT 1',
        [req.params.versionId, req.params.id]
      );
      if (!exists.rows[0]) {
        throw Object.assign(new Error('Verze receptury nenalezena'), { status: 404 });
      }

      await client.query(
        `UPDATE recipe_versions
         SET stav = CASE WHEN id = $2 THEN 'active' WHEN stav = 'active' THEN 'archived' ELSE stav END,
             schvaleno_by = CASE WHEN id = $2 THEN $3 ELSE schvaleno_by END,
             schvaleno_at = CASE WHEN id = $2 THEN NOW() ELSE schvaleno_at END
         WHERE recipe_id = $1`,
        [req.params.id, req.params.versionId, req.user.id]
      );

      return loadRecipeDetail(client, req.params.id);
    });

    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:id/versions/:versionId/items', auth, requireCapability('recipes.manage'), async (req, res, next) => {
  try {
    const item = normalizeRecipeItem(req.body || {});
    if (item.item_type === 'ingredient' && !item.ingredient_id) {
      return res.status(400).json({ error: 'Vyberte surovinu.' });
    }
    if (item.item_type === 'subrecipe' && !item.subrecipe_id) {
      return res.status(400).json({ error: 'Vyberte podrecepturu.' });
    }

    const { rows } = await query(
      `
        INSERT INTO recipe_items (recipe_version_id, item_type, ingredient_id, subrecipe_id, mnozstvi, jednotka, poradi, poznamka)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `,
      [
        req.params.versionId,
        item.item_type,
        item.item_type === 'ingredient' ? item.ingredient_id : null,
        item.item_type === 'subrecipe' ? item.subrecipe_id : null,
        item.mnozstvi,
        item.jednotka,
        item.poradi,
        item.poznamka,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/:id/versions/:versionId/steps', auth, requireCapability('recipes.manage'), async (req, res, next) => {
  try {
    const step = normalizeRecipeStep(req.body || {});
    if (!step.instrukce) {
      return res.status(400).json({ error: 'Instrukce kroku je povinná.' });
    }

    const { rows } = await query(
      `
        INSERT INTO recipe_steps (recipe_version_id, krok_index, nazev, instrukce, pracoviste, cas_min, kriticky_bod, poznamka)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `,
      [req.params.versionId, step.krok_index, step.nazev, step.instrukce, step.pracoviste, step.cas_min, step.kriticky_bod, step.poznamka]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/:id/cost', auth, requireCapability('recipe_costs.view'), async (req, res, next) => {
  try {
    const cost = await computeRecipeCostWithClient({ query }, {
      recipeId: req.params.id,
      recipeVersionId: req.query.version_id || null,
    });
    res.json(cost);
  } catch (err) { next(err); }
});

router.get('/:id/print-card', auth, requireCapability('recipe_costs.view'), async (req, res, next) => {
  try {
    const recipeId = req.params.id;
    const versionId = req.query.version_id || null;
    const detail = await loadRecipeDetail({ query }, recipeId);
    if (!detail) return res.status(404).json({ error: 'Receptura nenalezena' });

    const version = versionId
      ? await loadRecipeVersion({ query }, recipeId, versionId)
      : detail.active_version;
    if (!version) return res.status(404).json({ error: 'Verze receptury nenalezena' });

    const cost = await computeRecipeCostWithClient({ query }, {
      recipeId,
      recipeVersionId: version.id,
    });

    const itemRows = cost.items.map((item) => `
      <tr>
        <td>${escapeHtml(item.item_type === 'ingredient' ? (item.ingredient_nazev || 'Surovina') : (item.subrecipe_nazev || 'Podreceptura'))}</td>
        <td>${escapeHtml(item.item_type === 'ingredient' ? 'Surovina' : 'Podreceptura')}</td>
        <td class="right">${parseNumeric(item.mnozstvi, 0).toLocaleString('cs-CZ')}</td>
        <td>${escapeHtml(item.jednotka || 'ks')}</td>
      </tr>
    `).join('');

    const ingredientRows = cost.ingredients.map((ingredient) => `
      <tr>
        <td>${escapeHtml(ingredient.ingredient_name)}</td>
        <td class="right">${parseNumeric(ingredient.mnozstvi, 0).toLocaleString('cs-CZ')}</td>
        <td class="right">${parseNumeric(ingredient.nakupni_mnozstvi, 0).toLocaleString('cs-CZ')}</td>
        <td>${escapeHtml(ingredient.jednotka)}</td>
        <td class="right">${parseNumeric(ingredient.total_cost, 0).toLocaleString('cs-CZ')} Kč</td>
      </tr>
    `).join('');

    const stepRows = cost.steps.map((step) => `
      <li>
        <strong>${escapeHtml(step.nazev || `Krok ${step.krok_index}`)}</strong>
        <div>${escapeHtml(step.instrukce)}</div>
        <div class="meta-row">${escapeHtml(step.pracoviste || 'Bez pracoviště')}${step.cas_min ? ` · ${escapeHtml(step.cas_min)} min` : ''}${step.kriticky_bod ? ' · Kritický bod' : ''}</div>
      </li>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(detail.nazev)} – receptura</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; background:#f5f5f4; color:#1f2937; margin:0; }
    .page { max-width: 960px; margin: 24px auto; background:#fff; padding:32px; box-shadow:0 8px 24px rgba(0,0,0,.06); }
    .grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin:18px 0 20px; }
    .card { border:1px solid #e7e5e4; border-radius:14px; padding:14px; }
    h1 { margin:0 0 6px; font-size:28px; }
    .muted { color:#78716c; }
    .section-title { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#78716c; font-weight:700; margin-bottom:10px; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; border-bottom:1px solid #e7e5e4; font-size:14px; vertical-align:top; }
    th { text-align:left; font-size:12px; color:#78716c; text-transform:uppercase; letter-spacing:.05em; background:#fafaf9; }
    .right { text-align:right; }
    .steps { padding-left:18px; }
    .steps li { margin-bottom:10px; line-height:1.55; }
    .meta-row { color:#78716c; font-size:12px; margin-top:2px; }
    @media print { body { background:#fff; } .page { box-shadow:none; margin:0; max-width:none; } }
  </style>
</head>
<body>
  <div class="page">
    <div>
      <div class="muted">${escapeHtml(detail.typ === 'component' ? 'Komponenta' : 'Finální receptura')} · verze ${escapeHtml(version.verze)}</div>
      <h1>${escapeHtml(detail.nazev)}</h1>
      <div class="muted">${escapeHtml(detail.interni_nazev || '')}</div>
    </div>

    <div class="grid">
      <div class="card"><div class="section-title">Vydatnost</div><strong>${parseNumeric(cost.output_amount, 0).toLocaleString('cs-CZ')} ${escapeHtml(cost.output_unit)}</strong></div>
      <div class="card"><div class="section-title">Výchozí porce</div><strong>${parseNumeric(cost.default_portion_amount, 0).toLocaleString('cs-CZ')} ${escapeHtml(cost.default_portion_unit)}</strong></div>
      <div class="card"><div class="section-title">Celkový náklad</div><strong>${parseNumeric(cost.total_cost, 0).toLocaleString('cs-CZ')} Kč</strong></div>
      <div class="card"><div class="section-title">Náklad / porce</div><strong>${cost.cost_per_portion != null ? `${parseNumeric(cost.cost_per_portion, 0).toLocaleString('cs-CZ')} Kč` : '—'}</strong></div>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div class="section-title">Složení receptury</div>
      <table>
        <thead><tr><th>Položka</th><th>Typ</th><th class="right">Množství</th><th>Jednotka</th></tr></thead>
        <tbody>${itemRows || '<tr><td colspan="4" class="muted">Receptura zatím nemá složení.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div class="section-title">Agregované suroviny</div>
      <table>
        <thead><tr><th>Surovina</th><th class="right">Čisté množství</th><th class="right">Nákupní množství</th><th>Jednotka</th><th class="right">Náklad</th></tr></thead>
        <tbody>${ingredientRows || '<tr><td colspan="5" class="muted">Bez navázaných surovin.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="card">
      <div class="section-title">Technologický postup</div>
      <ol class="steps">${stepRows || '<li>Postup zatím není vyplněný.</li>'}</ol>
      <div class="meta-row">Alergeny: ${cost.allergens.length ? escapeHtml(cost.allergens.join(', ')) : 'nezadány'}</div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

module.exports = router;
