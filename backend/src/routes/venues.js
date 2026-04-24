'use strict';

const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');
const {
  getVenueBundle,
  buildVenueSummary,
  appendVenueAudit,
  normalizeRecurringKey,
  bool,
} = require('../venueTwin');

const VENUE_STATUS = new Set(['active', 'archived']);
const CONTACT_ROLE = new Set(['venue_manager', 'security', 'loading_dock', 'reception', 'facilities', 'av_support', 'parking', 'other']);
const ROUTE_DIFFICULTY = new Set(['low', 'medium', 'high']);
const CHECKPOINT_TYPE = new Set(['entry', 'security', 'corridor', 'door', 'elevator', 'stairs', 'ramp', 'service_area', 'other']);
const RESTRICTION_CATEGORY = new Set(['noise', 'open_fire', 'alcohol', 'glass', 'decorations', 'waste_disposal', 'power_usage', 'vendor_access', 'timing', 'security', 'photography', 'parking', 'other']);
const SEVERITY = new Set(['info', 'warning', 'critical']);
const VEHICLE_TYPE = new Set(['car', 'van', 'truck', 'mixed']);
const SIGNAL_QUALITY = new Set(['none', 'weak', 'usable', 'good']);
const OBSERVATION_CATEGORY = new Set(['access', 'security', 'loading', 'route', 'service', 'parking', 'connectivity', 'restriction', 'incident', 'other']);

const SECTION_DEFS = {
  contacts: {
    table: 'venue_contacts',
    entityType: 'contact',
    fields: ['name', 'role', 'phone', 'email', 'availability_notes', 'is_primary', 'notes'],
    booleans: ['is_primary'],
    enums: { role: CONTACT_ROLE },
    defaultFlag: 'is_primary',
  },
  'access-rules': {
    table: 'venue_access_rules',
    entityType: 'access_rule',
    fields: [
      'title', 'applies_to_days', 'delivery_window_start', 'delivery_window_end', 'check_in_point',
      'security_check_required', 'avg_security_minutes', 'badge_required', 'manifest_required',
      'manifest_lead_time_hours', 'escort_required', 'vehicle_registration_required',
      'service_elevator_only', 'notes', 'is_default', 'last_verified_at', 'verification_source',
    ],
    booleans: [
      'security_check_required', 'badge_required', 'manifest_required', 'escort_required',
      'vehicle_registration_required', 'service_elevator_only', 'is_default',
    ],
    integers: ['avg_security_minutes', 'manifest_lead_time_hours'],
    defaultFlag: 'is_default',
  },
  'loading-zones': {
    table: 'venue_loading_zones',
    entityType: 'loading_zone',
    fields: [
      'name', 'description', 'arrival_instructions', 'booking_required', 'booking_contact',
      'max_vehicle_height_cm', 'max_vehicle_length_cm', 'weight_limit_kg', 'unloading_time_limit_min',
      'distance_to_service_area_min', 'notes', 'is_default',
    ],
    booleans: ['booking_required', 'is_default'],
    integers: [
      'max_vehicle_height_cm', 'max_vehicle_length_cm', 'weight_limit_kg',
      'unloading_time_limit_min', 'distance_to_service_area_min',
    ],
    defaultFlag: 'is_default',
  },
  'service-areas': {
    table: 'venue_service_areas',
    entityType: 'service_area',
    fields: ['name', 'floor', 'capacity', 'has_power_access', 'has_water_access', 'has_cold_storage_access', 'notes'],
    booleans: ['has_power_access', 'has_water_access', 'has_cold_storage_access'],
    integers: ['capacity'],
  },
  routes: {
    table: 'venue_routes',
    entityType: 'route',
    fields: [
      'from_loading_zone_id', 'to_service_area_id', 'name', 'estimated_walk_minutes',
      'stairs_count', 'elevator_required', 'route_difficulty', 'notes', 'is_default',
    ],
    booleans: ['elevator_required', 'is_default'],
    integers: ['from_loading_zone_id', 'to_service_area_id', 'estimated_walk_minutes', 'stairs_count'],
    enums: { route_difficulty: ROUTE_DIFFICULTY },
    defaultFlag: 'is_default',
    hasSteps: true,
  },
  restrictions: {
    table: 'venue_restrictions',
    entityType: 'restriction',
    fields: [
      'category', 'severity', 'title', 'description', 'applies_to_area_id',
      'effective_from', 'effective_to', 'notes', 'last_verified_at',
    ],
    integers: ['applies_to_area_id'],
    enums: { category: RESTRICTION_CATEGORY, severity: SEVERITY },
  },
  'parking-options': {
    table: 'venue_parking_options',
    entityType: 'parking_option',
    fields: [
      'vehicle_type', 'location_description', 'reservation_required', 'paid', 'price_notes',
      'walking_minutes_to_venue', 'overnight_allowed', 'capacity_notes', 'notes',
    ],
    booleans: ['reservation_required', 'paid', 'overnight_allowed'],
    integers: ['walking_minutes_to_venue'],
    enums: { vehicle_type: VEHICLE_TYPE },
  },
  'connectivity-zones': {
    table: 'venue_connectivity_zones',
    entityType: 'connectivity_zone',
    fields: ['zone_name', 'signal_quality', 'wifi_available', 'wifi_notes', 'dead_spot', 'notes', 'last_verified_at'],
    booleans: ['wifi_available', 'dead_spot'],
    enums: { signal_quality: SIGNAL_QUALITY },
  },
};

function normalizeString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeInt(value) {
  if (value === '' || value == null) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function pick(obj, keys) {
  return keys.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key];
    return acc;
  }, {});
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'venue';
}

async function ensureUniqueSlug(client, desired, excludeId = null) {
  const base = slugify(desired);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const params = excludeId ? [candidate, excludeId] : [candidate];
    const sql = excludeId
      ? 'SELECT id FROM venues WHERE slug = $1 AND id != $2 LIMIT 1'
      : 'SELECT id FROM venues WHERE slug = $1 LIMIT 1';
    const { rows } = await client.query(sql, params);
    if (!rows[0]) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

function normalizeVenuePayload(body = {}) {
  const payload = pick(body, [
    'name', 'slug', 'address_line_1', 'address_line_2', 'city', 'postal_code',
    'country', 'latitude', 'longitude', 'general_notes', 'status',
  ]);
  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'latitude' || key === 'longitude') {
      normalized[key] = value === '' || value == null ? null : Number(value);
    } else {
      normalized[key] = normalizeString(value);
    }
  }
  if (normalized.status && !VENUE_STATUS.has(normalized.status)) {
    const err = new Error('Neplatny status venue');
    err.status = 400;
    throw err;
  }
  if (!normalized.country) normalized.country = 'CZ';
  return normalized;
}

function normalizeSectionPayload(def, body = {}) {
  const payload = pick(body, def.fields);
  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (def.booleans?.includes(key)) normalized[key] = bool(value);
    else if (def.integers?.includes(key)) normalized[key] = normalizeInt(value);
    else normalized[key] = normalizeString(value);
  }
  for (const [field, enumSet] of Object.entries(def.enums || {})) {
    if (normalized[field] && !enumSet.has(normalized[field])) {
      const err = new Error(`Neplatna hodnota pole ${field}`);
      err.status = 400;
      throw err;
    }
  }
  return normalized;
}

function normalizeRouteSteps(steps = []) {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((step, index) => ({
      step_index: normalizeInt(step.step_index) ?? index + 1,
      instruction: normalizeString(step.instruction),
      checkpoint_type: normalizeString(step.checkpoint_type) || 'other',
      estimated_minutes: normalizeInt(step.estimated_minutes),
      attachment_id: normalizeInt(step.attachment_id),
      notes: normalizeString(step.notes),
    }))
    .filter((step) => step.instruction)
    .map((step) => {
      if (!CHECKPOINT_TYPE.has(step.checkpoint_type)) step.checkpoint_type = 'other';
      return step;
    })
    .sort((a, b) => a.step_index - b.step_index);
}

async function getSectionRow(client, table, id) {
  const { rows } = await client.query(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function ensureDefaultFlag(client, table, venueId, flag, entityId = null) {
  if (!flag) return;
  const params = entityId ? [venueId, entityId] : [venueId];
  const sql = entityId
    ? `UPDATE ${table} SET ${flag} = false WHERE venue_id = $1 AND id != $2`
    : `UPDATE ${table} SET ${flag} = false WHERE venue_id = $1`;
  await client.query(sql, params);
}

async function writeSectionRow(client, def, venueId, payload, existingId = null, userId = null) {
  const dbPayload = { ...payload };
  delete dbPayload.steps;

  if (def.defaultFlag && dbPayload[def.defaultFlag]) {
    await ensureDefaultFlag(client, def.table, venueId, def.defaultFlag, existingId);
  }

  if (existingId) {
    const before = await getSectionRow(client, def.table, existingId);
    if (!before) {
      const err = new Error('Polozka venue nebyla nalezena');
      err.status = 404;
      throw err;
    }
    const fields = Object.keys(dbPayload);
    if (!fields.length) return before;
    const setSql = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = fields.map((field) => dbPayload[field]);
    const { rows } = await client.query(
      `UPDATE ${def.table} SET ${setSql} WHERE id = $1 RETURNING *`,
      [existingId, ...values]
    );
    if (['access_rule', 'restriction', 'loading_zone', 'route', 'connectivity_zone'].includes(def.entityType)) {
      await appendVenueAudit({
        dbClient: client,
        venueId,
        entityType: def.entityType,
        entityId: existingId,
        action: 'update',
        beforeValue: before,
        afterValue: rows[0],
        changedBy: userId,
        source: 'manual',
      });
    }
    return rows[0];
  }

  const fields = ['venue_id', ...Object.keys(dbPayload)];
  const placeholders = fields.map((_, index) => `$${index + 1}`);
  const values = [venueId, ...fields.slice(1).map((field) => dbPayload[field])];
  const { rows } = await client.query(
    `INSERT INTO ${def.table} (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values
  );
  if (def.hasSteps) {
    const steps = normalizeRouteSteps(payload.steps || []);
    for (const step of steps) {
      await client.query(
        `INSERT INTO venue_route_steps (route_id, step_index, instruction, checkpoint_type, estimated_minutes, attachment_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [rows[0].id, step.step_index, step.instruction, step.checkpoint_type, step.estimated_minutes, step.attachment_id, step.notes]
      );
    }
  }
  if (['access_rule', 'restriction', 'loading_zone', 'route', 'connectivity_zone'].includes(def.entityType)) {
    await appendVenueAudit({
      dbClient: client,
      venueId,
      entityType: def.entityType,
      entityId: rows[0].id,
      action: 'create',
      beforeValue: null,
      afterValue: rows[0],
      changedBy: userId,
      source: 'manual',
    });
  }
  return rows[0];
}

async function replaceRouteSteps(client, routeId, steps = []) {
  await client.query('DELETE FROM venue_route_steps WHERE route_id = $1', [routeId]);
  const normalized = normalizeRouteSteps(steps);
  for (const step of normalized) {
    await client.query(
      `INSERT INTO venue_route_steps (route_id, step_index, instruction, checkpoint_type, estimated_minutes, attachment_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [routeId, step.step_index, step.instruction, step.checkpoint_type, step.estimated_minutes, step.attachment_id, step.notes]
    );
  }
}

router.get('/', auth, async (req, res, next) => {
  try {
    const {
      q, status = 'active', has_loading_dock, security_check_required,
      max_security_delay, truck_friendly, parking_available, mobile_dead_spot_present,
      page = 1, limit = 20,
    } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const where = [];
    const params = [];
    let p = 1;

    if (status && status !== 'all') {
      where.push(`v.status = $${p++}`);
      params.push(status);
    }
    if (q) {
      where.push(`(
        v.name ILIKE $${p}
        OR COALESCE(v.address_line_1, '') ILIKE $${p}
        OR COALESCE(v.city, '') ILIKE $${p}
        OR COALESCE(v.postal_code, '') ILIKE $${p}
      )`);
      params.push(`%${q}%`);
      p++;
    }
    if (bool(has_loading_dock)) {
      where.push(`EXISTS (SELECT 1 FROM venue_loading_zones lz WHERE lz.venue_id = v.id)`);
    }
    if (bool(security_check_required)) {
      where.push(`EXISTS (SELECT 1 FROM venue_access_rules ar WHERE ar.venue_id = v.id AND ar.security_check_required = true)`);
    }
    if (max_security_delay != null && max_security_delay !== '') {
      where.push(`COALESCE((SELECT MAX(ar.avg_security_minutes) FROM venue_access_rules ar WHERE ar.venue_id = v.id), 0) <= $${p++}`);
      params.push(normalizeInt(max_security_delay) || 0);
    }
    if (bool(truck_friendly)) {
      where.push(`EXISTS (
        SELECT 1
        FROM venue_loading_zones lz
        WHERE lz.venue_id = v.id
          AND (lz.max_vehicle_height_cm IS NULL OR lz.max_vehicle_height_cm >= 240)
          AND (lz.max_vehicle_length_cm IS NULL OR lz.max_vehicle_length_cm >= 600)
      )`);
    }
    if (bool(parking_available)) {
      where.push(`EXISTS (SELECT 1 FROM venue_parking_options po WHERE po.venue_id = v.id)`);
    }
    if (bool(mobile_dead_spot_present)) {
      where.push(`EXISTS (
        SELECT 1
        FROM venue_connectivity_zones cz
        WHERE cz.venue_id = v.id AND (cz.dead_spot = true OR cz.signal_quality = 'none')
      )`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (safePage - 1) * safeLimit;
    const { rows } = await query(
      `SELECT v.*, COUNT(*) OVER() AS total_count
       FROM venues v
       ${whereClause}
       ORDER BY v.name ASC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, safeLimit, offset]
    );

    const total = parseInt(rows[0]?.total_count || 0, 10);
    const summaries = await Promise.all(rows.map(async (row) => {
      const bundle = await getVenueBundle(null, row.id);
      const summary = bundle?.summary || buildVenueSummary({
        venue: row,
        contacts: [],
        access_rules: [],
        loading_zones: [],
        service_areas: [],
        routes: [],
        restrictions: [],
        parking_options: [],
        connectivity_zones: [],
        observations: [],
        attachments: [],
      });
      return {
        ...row,
        summary,
        badges: {
          loading_dock: summary.has_loading_dock,
          security: summary.security_check_required,
          restrictions: summary.critical_restrictions_count,
          stale_data: summary.stale_sections_count > 0,
        },
      };
    }));

    res.json({
      data: summaries.map((item) => {
        delete item.total_count;
        return item;
      }),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
      },
    });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const payload = normalizeVenuePayload(req.body);
    if (!payload.name) return res.status(400).json({ error: 'Nazev venue je povinny' });
    const created = await withTransaction(async (client) => {
      const slug = await ensureUniqueSlug(client, payload.slug || payload.name);
      const { rows } = await client.query(
        `INSERT INTO venues (
           name, slug, address_line_1, address_line_2, city, postal_code, country,
           latitude, longitude, general_notes, status, created_by, updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          payload.name,
          slug,
          payload.address_line_1,
          payload.address_line_2,
          payload.city,
          payload.postal_code,
          payload.country || 'CZ',
          payload.latitude,
          payload.longitude,
          payload.general_notes,
          payload.status || 'active',
          req.user.id,
          req.user.id,
        ]
      );
      await appendVenueAudit({
        dbClient: client,
        venueId: rows[0].id,
        entityType: 'venue',
        entityId: rows[0].id,
        action: 'create',
        beforeValue: null,
        afterValue: rows[0],
        changedBy: req.user.id,
        source: 'manual',
      });
      return rows[0];
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const bundle = await getVenueBundle(null, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Venue nenalezeno' });
    const { rows: audit } = await query(
      `SELECT val.*, u.jmeno, u.prijmeni
       FROM venue_audit_log val
       LEFT JOIN uzivatele u ON u.id = val.changed_by
       WHERE val.venue_id = $1
       ORDER BY val.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json({ ...bundle, audit_log: audit });
  } catch (err) { next(err); }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const updated = await withTransaction(async (client) => {
      const before = await getSectionRow(client, 'venues', req.params.id);
      if (!before) {
        const err = new Error('Venue nenalezeno');
        err.status = 404;
        throw err;
      }
      const payload = normalizeVenuePayload(req.body);
      if (payload.status === 'archived' && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        const err = new Error('Archivace venue je povolena jen adminovi');
        err.status = 403;
        throw err;
      }
      if (payload.slug || payload.name) {
        payload.slug = await ensureUniqueSlug(client, payload.slug || payload.name, req.params.id);
      }
      payload.updated_by = req.user.id;
      const fields = Object.keys(payload);
      if (!fields.length) return before;
      const setSql = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
      const values = fields.map((field) => payload[field]);
      const { rows } = await client.query(
        `UPDATE venues SET ${setSql} WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      await appendVenueAudit({
        dbClient: client,
        venueId: rows[0].id,
        entityType: 'venue',
        entityId: rows[0].id,
        action: 'update',
        beforeValue: before,
        afterValue: rows[0],
        changedBy: req.user.id,
        source: 'manual',
      });
      return rows[0];
    });
    res.json(updated);
  } catch (err) { next(err); }
});

router.get('/:id/summary', auth, async (req, res, next) => {
  try {
    const bundle = await getVenueBundle(null, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Venue nenalezeno' });
    res.json(bundle.summary);
  } catch (err) { next(err); }
});

router.get('/:id/event-history', auth, async (req, res, next) => {
  try {
    const bundle = await getVenueBundle(null, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Venue nenalezeno' });
    res.json({ data: bundle.event_history });
  } catch (err) { next(err); }
});

for (const [sectionKey, def] of Object.entries(SECTION_DEFS)) {
  router.post(`/:id/${sectionKey}`, auth, async (req, res, next) => {
    try {
      const created = await withTransaction(async (client) => {
        const venue = await getSectionRow(client, 'venues', req.params.id);
        if (!venue) {
          const err = new Error('Venue nenalezeno');
          err.status = 404;
          throw err;
        }
        const payload = normalizeSectionPayload(def, req.body);
        if (def.hasSteps) payload.steps = req.body.steps;
        if (!payload.name && sectionKey !== 'access-rules') {
          const requiredField = sectionKey === 'parking-options' ? 'location_description' : 'name';
          if (!payload[requiredField]) {
            const err = new Error('Chybi povinne pole sekce');
            err.status = 400;
            throw err;
          }
        }
        if (sectionKey === 'access-rules' && !payload.title) {
          const err = new Error('Nazev access pravidla je povinny');
          err.status = 400;
          throw err;
        }
        const row = await writeSectionRow(client, def, req.params.id, payload, null, req.user.id);
        if (def.hasSteps) {
          const bundle = await getVenueBundle(client, req.params.id);
          return bundle.routes.find((route) => route.id === row.id) || row;
        }
        return row;
      });
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  router.patch(`/:id/${sectionKey}/:rowId`, auth, async (req, res, next) => {
    try {
      const updated = await withTransaction(async (client) => {
        const venue = await getSectionRow(client, 'venues', req.params.id);
        if (!venue) {
          const err = new Error('Venue nenalezeno');
          err.status = 404;
          throw err;
        }
        const row = await getSectionRow(client, def.table, req.params.rowId);
        if (!row || String(row.venue_id) !== String(req.params.id)) {
          const err = new Error('Polozka venue nebyla nalezena');
          err.status = 404;
          throw err;
        }
        const payload = normalizeSectionPayload(def, req.body);
        const updatedRow = await writeSectionRow(client, def, req.params.id, payload, req.params.rowId, req.user.id);
        if (def.hasSteps && Array.isArray(req.body.steps)) {
          await replaceRouteSteps(client, req.params.rowId, req.body.steps);
          const bundle = await getVenueBundle(client, req.params.id);
          return bundle.routes.find((route) => route.id === Number(req.params.rowId)) || updatedRow;
        }
        return updatedRow;
      });
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.delete(`/:id/${sectionKey}/:rowId`, auth, async (req, res, next) => {
    try {
      await withTransaction(async (client) => {
        const row = await getSectionRow(client, def.table, req.params.rowId);
        if (!row || String(row.venue_id) !== String(req.params.id)) {
          const err = new Error('Polozka venue nebyla nalezena');
          err.status = 404;
          throw err;
        }
        await client.query(`DELETE FROM ${def.table} WHERE id = $1`, [req.params.rowId]);
        if (['access_rule', 'restriction', 'loading_zone', 'route', 'connectivity_zone'].includes(def.entityType)) {
          await appendVenueAudit({
            dbClient: client,
            venueId: req.params.id,
            entityType: def.entityType,
            entityId: req.params.rowId,
            action: 'delete',
            beforeValue: row,
            afterValue: null,
            changedBy: req.user.id,
            source: 'manual',
          });
        }
      });
      res.json({ message: 'Polozka venue smazana' });
    } catch (err) { next(err); }
  });
}

router.post('/:id/observations', auth, async (req, res, next) => {
  try {
    const payload = {
      category: normalizeString(req.body.category) || 'other',
      title: normalizeString(req.body.title),
      description: normalizeString(req.body.description),
      severity: normalizeString(req.body.severity) || 'info',
      measured_minutes: normalizeInt(req.body.measured_minutes),
      happened_at: normalizeString(req.body.happened_at) || new Date().toISOString(),
      source: normalizeString(req.body.source) || 'manual',
      is_verified: bool(req.body.is_verified),
      attachment_id: normalizeInt(req.body.attachment_id),
      propose_master_update: bool(req.body.propose_master_update),
      proposal_status: normalizeString(req.body.proposal_status) || (bool(req.body.propose_master_update) ? 'pending' : 'none'),
      proposed_update_payload: req.body.proposed_update_payload || null,
      notes: normalizeString(req.body.notes),
      event_id: normalizeInt(req.body.event_id),
    };
    if (!payload.title) return res.status(400).json({ error: 'Nazev observation je povinny' });
    if (!OBSERVATION_CATEGORY.has(payload.category)) return res.status(400).json({ error: 'Neplatna kategorie observation' });
    if (!SEVERITY.has(payload.severity)) return res.status(400).json({ error: 'Neplatna zavaznost observation' });

    const { rows } = await query(
      `INSERT INTO venue_observations (
         venue_id, event_id, category, title, description, severity, measured_minutes, happened_at,
         created_by, source, is_verified, attachment_id, recurring_key, propose_master_update,
         proposal_status, proposed_update_payload, notes
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
       RETURNING *`,
      [
        req.params.id,
        payload.event_id,
        payload.category,
        payload.title,
        payload.description,
        payload.severity,
        payload.measured_minutes,
        payload.happened_at,
        req.user.id,
        payload.source,
        payload.is_verified,
        payload.attachment_id,
        normalizeRecurringKey(payload.title, payload.category),
        payload.propose_master_update,
        payload.proposal_status,
        payload.proposed_update_payload ? JSON.stringify(payload.proposed_update_payload) : null,
        payload.notes,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/:id/observations/:observationId/promote', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const observation = await getSectionRow(client, 'venue_observations', req.params.observationId);
      if (!observation || String(observation.venue_id) !== String(req.params.id)) {
        const err = new Error('Observation nebyla nalezena');
        err.status = 404;
        throw err;
      }
      const proposal = observation.proposed_update_payload || {};
      const section = proposal.section || null;
      let promoted = null;

      if (section === 'access') {
        const { rows } = await client.query(
          `SELECT * FROM venue_access_rules WHERE venue_id = $1 ORDER BY is_default DESC, id DESC LIMIT 1`,
          [req.params.id]
        );
        if (rows[0]) {
          const before = rows[0];
          const { rows: updated } = await client.query(
            `UPDATE venue_access_rules
             SET avg_security_minutes = COALESCE($2, avg_security_minutes),
                 notes = COALESCE($3, notes),
                 last_verified_at = NOW(),
                 verification_source = 'admin_update'
             WHERE id = $1
             RETURNING *`,
            [before.id, normalizeInt(proposal.avg_security_minutes), normalizeString(proposal.notes)]
          );
          promoted = updated[0];
          await appendVenueAudit({
            dbClient: client,
            venueId: req.params.id,
            entityType: 'access_rule',
            entityId: before.id,
            action: 'promote',
            beforeValue: before,
            afterValue: promoted,
            changedBy: req.user.id,
            source: 'event_debrief',
            note: observation.title,
          });
        }
      } else if (section === 'routes') {
        const { rows } = await client.query(
          `SELECT * FROM venue_routes WHERE venue_id = $1 ORDER BY is_default DESC, id DESC LIMIT 1`,
          [req.params.id]
        );
        if (rows[0]) {
          const before = rows[0];
          const { rows: updated } = await client.query(
            `UPDATE venue_routes
             SET estimated_walk_minutes = COALESCE($2, estimated_walk_minutes),
                 notes = COALESCE($3, notes)
             WHERE id = $1
             RETURNING *`,
            [before.id, normalizeInt(proposal.estimated_walk_minutes), normalizeString(proposal.notes)]
          );
          promoted = updated[0];
          await appendVenueAudit({
            dbClient: client,
            venueId: req.params.id,
            entityType: 'route',
            entityId: before.id,
            action: 'promote',
            beforeValue: before,
            afterValue: promoted,
            changedBy: req.user.id,
            source: 'event_debrief',
            note: observation.title,
          });
        }
      }

      const { rows } = await client.query(
        `UPDATE venue_observations
         SET is_verified = true, proposal_status = $2, notes = COALESCE(notes, $3)
         WHERE id = $1
         RETURNING *`,
        [req.params.observationId, promoted ? 'approved' : 'reviewed', normalizeString(req.body.note)]
      );
      return { observation: rows[0], promoted };
    });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
