'use strict';

const { query } = require('./db');

const FRESH_DAYS = 90;
const AGING_DAYS = 180;
const RECENT_OBSERVATION_DAYS = 180;

const OBSERVATION_CATEGORY_TO_SECTION = {
  access: 'access',
  security: 'access',
  loading: 'loading',
  route: 'routes',
  service: 'service_areas',
  parking: 'parking',
  connectivity: 'connectivity',
  restriction: 'restrictions',
  incident: 'overview',
  other: 'overview',
};

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function deriveFreshnessStatus(lastVerifiedAt, now = new Date()) {
  const days = daysSince(lastVerifiedAt, now);
  if (days == null) return 'stale';
  if (days <= FRESH_DAYS) return 'fresh';
  if (days <= AGING_DAYS) return 'aging';
  return 'stale';
}

function deriveConfidenceLevel({
  verifiedRecentCount = 0,
  manualVerifiedAt = null,
  hasConflicts = false,
  now = new Date(),
}) {
  const manualFresh = deriveFreshnessStatus(manualVerifiedAt, now) !== 'stale';
  if (!hasConflicts && verifiedRecentCount >= 3) return 'high';
  if ((verifiedRecentCount >= 1 || manualFresh) && !hasConflicts) return 'medium';
  if (verifiedRecentCount >= 3 && hasConflicts) return 'medium';
  return 'low';
}

function normalizeRecurringKey(title = '', fallbackCategory = 'other') {
  const normalized = String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallbackCategory;
}

function buildRecurringIssues(observations = [], now = new Date()) {
  const cutoff = new Date(now.getTime() - RECENT_OBSERVATION_DAYS * 86400000);
  const buckets = new Map();

  for (const observation of observations) {
    const happenedAt = toDate(observation.happened_at);
    if (!observation.is_verified || !happenedAt || happenedAt < cutoff) continue;
    const key = observation.recurring_key || normalizeRecurringKey(observation.title, observation.category);
    const current = buckets.get(key) || {
      key,
      title: observation.title,
      category: observation.category,
      count: 0,
      last_happened_at: observation.happened_at,
      highest_severity: observation.severity || 'info',
    };
    current.count += 1;
    if (toDate(current.last_happened_at) < happenedAt) current.last_happened_at = observation.happened_at;
    if (severityRank(observation.severity) > severityRank(current.highest_severity)) {
      current.highest_severity = observation.severity;
    }
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .filter((item) => item.count >= 2)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return severityRank(b.highest_severity) - severityRank(a.highest_severity);
    });
}

function severityRank(value) {
  return ({ info: 1, warning: 2, critical: 3 }[value] || 0);
}

function bool(value) {
  if (typeof value === 'boolean') return value;
  if (value == null) return false;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function extractSectionLastVerified(sectionRows = [], explicitKey = 'last_verified_at') {
  const dates = sectionRows
    .map((row) => row?.[explicitKey] || row?.updated_at || row?.created_at)
    .map(toDate)
    .filter(Boolean)
    .sort((a, b) => b - a);
  return dates[0] ? dates[0].toISOString() : null;
}

async function getVenueSectionRows(dbClient, venueId) {
  const client = dbClient || { query };
  const [
    venueRes,
    contactsRes,
    accessRulesRes,
    loadingZonesRes,
    serviceAreasRes,
    routesRes,
    routeStepsRes,
    restrictionsRes,
    parkingOptionsRes,
    connectivityZonesRes,
    observationsRes,
    eventHistoryRes,
    attachmentsRes,
  ] = await Promise.all([
    client.query('SELECT * FROM venues WHERE id = $1 LIMIT 1', [venueId]),
    client.query('SELECT * FROM venue_contacts WHERE venue_id = $1 ORDER BY is_primary DESC, role, name', [venueId]),
    client.query('SELECT * FROM venue_access_rules WHERE venue_id = $1 ORDER BY created_at DESC, id DESC', [venueId]),
    client.query('SELECT * FROM venue_loading_zones WHERE venue_id = $1 ORDER BY is_default DESC, name', [venueId]),
    client.query('SELECT * FROM venue_service_areas WHERE venue_id = $1 ORDER BY name', [venueId]),
    client.query('SELECT * FROM venue_routes WHERE venue_id = $1 ORDER BY is_default DESC, name', [venueId]),
    client.query('SELECT * FROM venue_route_steps WHERE route_id IN (SELECT id FROM venue_routes WHERE venue_id = $1) ORDER BY route_id, step_index, id', [venueId]),
    client.query('SELECT * FROM venue_restrictions WHERE venue_id = $1 ORDER BY severity DESC, title', [venueId]),
    client.query('SELECT * FROM venue_parking_options WHERE venue_id = $1 ORDER BY walking_minutes_to_venue NULLS LAST, id', [venueId]),
    client.query('SELECT * FROM venue_connectivity_zones WHERE venue_id = $1 ORDER BY dead_spot DESC, zone_name', [venueId]),
    client.query(
      `SELECT vo.*, u.jmeno AS created_by_jmeno, u.prijmeni AS created_by_prijmeni, z.cislo AS event_cislo, z.nazev AS event_nazev
       FROM venue_observations vo
       LEFT JOIN uzivatele u ON u.id = vo.created_by
       LEFT JOIN zakazky z ON z.id = vo.event_id
       WHERE vo.venue_id = $1
       ORDER BY vo.happened_at DESC, vo.created_at DESC
       LIMIT 200`,
      [venueId]
    ),
    client.query(
      `SELECT z.id, z.cislo, z.nazev, z.stav, z.datum_akce, z.created_at,
              k.firma AS klient_firma, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni
       FROM zakazky z
       LEFT JOIN klienti k ON k.id = z.klient_id
       WHERE z.venue_id = $1
       ORDER BY z.datum_akce DESC NULLS LAST, z.created_at DESC
       LIMIT 100`,
      [venueId]
    ),
    client.query('SELECT * FROM dokumenty WHERE venue_id = $1 ORDER BY created_at DESC', [venueId]),
  ]);

  const routes = routesRes.rows.map((route) => ({
    ...route,
    steps: routeStepsRes.rows.filter((step) => step.route_id === route.id),
  }));

  return {
    venue: venueRes.rows[0] || null,
    contacts: contactsRes.rows,
    access_rules: accessRulesRes.rows,
    loading_zones: loadingZonesRes.rows,
    service_areas: serviceAreasRes.rows,
    routes,
    restrictions: restrictionsRes.rows,
    parking_options: parkingOptionsRes.rows,
    connectivity_zones: connectivityZonesRes.rows,
    observations: observationsRes.rows,
    event_history: eventHistoryRes.rows,
    attachments: attachmentsRes.rows,
  };
}

function buildSectionMeta(bundle, now = new Date()) {
  const observationCounts = new Map();
  const conflictCounts = new Map();

  for (const observation of bundle.observations || []) {
    const section = OBSERVATION_CATEGORY_TO_SECTION[observation.category] || 'overview';
    if (observation.is_verified) {
      observationCounts.set(section, (observationCounts.get(section) || 0) + 1);
    }
    if (bool(observation.propose_master_update) && !observation.is_verified) {
      conflictCounts.set(section, (conflictCounts.get(section) || 0) + 1);
    }
  }

  const sectionDates = {
    overview: bundle.venue?.updated_at || bundle.venue?.created_at || null,
    access: extractSectionLastVerified(bundle.access_rules),
    loading: extractSectionLastVerified(bundle.loading_zones),
    routes: extractSectionLastVerified(bundle.routes),
    service_areas: extractSectionLastVerified(bundle.service_areas),
    restrictions: extractSectionLastVerified(bundle.restrictions),
    parking: extractSectionLastVerified(bundle.parking_options),
    connectivity: extractSectionLastVerified(bundle.connectivity_zones),
    contacts: extractSectionLastVerified(bundle.contacts),
    attachments: extractSectionLastVerified(bundle.attachments),
  };

  const sections = Object.entries(sectionDates).reduce((acc, [section, lastVerifiedAt]) => {
    acc[section] = {
      last_verified_at: lastVerifiedAt,
      freshness_status: deriveFreshnessStatus(lastVerifiedAt, now),
      confidence_level: deriveConfidenceLevel({
        verifiedRecentCount: observationCounts.get(section) || 0,
        manualVerifiedAt: lastVerifiedAt,
        hasConflicts: (conflictCounts.get(section) || 0) > 0,
        now,
      }),
      conflict_count: conflictCounts.get(section) || 0,
    };
    return acc;
  }, {});

  return sections;
}

function buildVenueSummary(bundle, now = new Date()) {
  const recurringIssues = buildRecurringIssues(bundle.observations, now);
  const sectionMeta = buildSectionMeta(bundle, now);
  const staleSections = Object.entries(sectionMeta)
    .filter(([, meta]) => meta.freshness_status === 'stale')
    .map(([section]) => section);

  const defaultAccessRule = bundle.access_rules.find((rule) => bool(rule.is_default)) || bundle.access_rules[0] || null;
  const defaultLoadingZone = bundle.loading_zones.find((zone) => bool(zone.is_default)) || bundle.loading_zones[0] || null;
  const defaultRoute = bundle.routes.find((route) => bool(route.is_default)) || bundle.routes[0] || null;
  const criticalRestrictions = (bundle.restrictions || []).filter((item) => item.severity === 'critical');
  const primaryContacts = (bundle.contacts || []).filter((contact) => bool(contact.is_primary));

  return {
    venue_id: bundle.venue?.id || null,
    status: bundle.venue?.status || 'active',
    has_loading_dock: bundle.loading_zones.length > 0,
    security_check_required: bool(defaultAccessRule?.security_check_required),
    expected_security_delay_min: Number(defaultAccessRule?.avg_security_minutes || 0) || 0,
    default_loading_zone_name: defaultLoadingZone?.name || null,
    default_route_name: defaultRoute?.name || null,
    expected_unload_to_room_min: Number(defaultRoute?.estimated_walk_minutes || defaultLoadingZone?.distance_to_service_area_min || 0) || 0,
    critical_restrictions_count: criticalRestrictions.length,
    parking_available: bundle.parking_options.length > 0,
    mobile_dead_spot_present: bundle.connectivity_zones.some((zone) => bool(zone.dead_spot) || zone.signal_quality === 'none'),
    stale_sections_count: staleSections.length,
    stale_sections: staleSections,
    recurring_issues_count: recurringIssues.length,
    recurring_issues: recurringIssues.slice(0, 5),
    top_recurring_issues: recurringIssues.slice(0, 3),
    primary_contacts: primaryContacts.slice(0, 4),
    section_meta: sectionMeta,
    recent_observations: (bundle.observations || []).slice(0, 6),
  };
}

async function getVenueBundle(dbClient, venueId) {
  const bundle = await getVenueSectionRows(dbClient, venueId);
  if (!bundle.venue) return null;
  return {
    ...bundle,
    summary: buildVenueSummary(bundle),
  };
}

function pickRestrictionsForBrief(restrictions = []) {
  return restrictions
    .filter((restriction) => !restriction.effective_to || toDate(restriction.effective_to) >= new Date())
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 6);
}

async function buildVenueBriefForZakazka(dbClient, zakazkaId) {
  const client = dbClient || { query };
  const { rows } = await client.query(
    `SELECT z.id, z.cislo, z.nazev, z.datum_akce, z.misto, z.venue_id, z.venue_loading_zone_id, z.venue_service_area_id, z.venue_route_id,
            v.name AS venue_name, v.address_line_1, v.address_line_2, v.city, v.postal_code, v.country, v.general_notes
     FROM zakazky z
     LEFT JOIN venues v ON v.id = z.venue_id
     WHERE z.id = $1
     LIMIT 1`,
    [zakazkaId]
  );
  const zakazka = rows[0];
  if (!zakazka) {
    const err = new Error('Zakázka nenalezena');
    err.status = 404;
    throw err;
  }
  if (!zakazka.venue_id) {
    return {
      zakazka_id: zakazka.id,
      venue: null,
      summary: null,
      risks: [],
      stale_warning: 'K zakázce není přiřazené venue.',
    };
  }

  const bundle = await getVenueBundle(client, zakazka.venue_id);
  const selectedLoadingZone = bundle.loading_zones.find((zone) => zone.id === zakazka.venue_loading_zone_id)
    || bundle.loading_zones.find((zone) => bool(zone.is_default))
    || bundle.loading_zones[0]
    || null;
  const selectedServiceArea = bundle.service_areas.find((area) => area.id === zakazka.venue_service_area_id)
    || bundle.service_areas[0]
    || null;
  const selectedRoute = bundle.routes.find((route) => route.id === zakazka.venue_route_id)
    || bundle.routes.find((route) =>
      (!selectedLoadingZone || route.from_loading_zone_id === selectedLoadingZone.id)
      && (!selectedServiceArea || route.to_service_area_id === selectedServiceArea.id)
    )
    || bundle.routes.find((route) => bool(route.is_default))
    || bundle.routes[0]
    || null;

  const defaultAccessRule = bundle.access_rules.find((rule) => bool(rule.is_default)) || bundle.access_rules[0] || null;
  const criticalRestrictions = pickRestrictionsForBrief(bundle.restrictions);
  const recurringIssues = bundle.summary.top_recurring_issues || [];
  const staleSections = bundle.summary.stale_sections || [];

  const risks = [
    ...(defaultAccessRule?.avg_security_minutes >= 20 ? [{
      type: 'security',
      label: `Bezpečnostní kontrola obvykle trvá ${defaultAccessRule.avg_security_minutes} min.`,
    }] : []),
    ...criticalRestrictions.slice(0, 2).map((item) => ({
      type: 'restriction',
      label: item.title,
    })),
    ...recurringIssues.slice(0, 3).map((item) => ({
      type: 'recurring',
      label: `${item.title} (${item.count}× za posledních 180 dní)`,
    })),
  ].slice(0, 3);

  return {
    zakazka_id: zakazka.id,
    zakazka_cislo: zakazka.cislo,
    zakazka_nazev: zakazka.nazev,
    venue: {
      id: bundle.venue.id,
      name: bundle.venue.name,
      address_line_1: bundle.venue.address_line_1,
      address_line_2: bundle.venue.address_line_2,
      city: bundle.venue.city,
      postal_code: bundle.venue.postal_code,
      country: bundle.venue.country,
      general_notes: bundle.venue.general_notes,
    },
    summary: {
      expected_security_delay_min: Number(defaultAccessRule?.avg_security_minutes || 0) || 0,
      expected_unload_to_room_min: Number(selectedRoute?.estimated_walk_minutes || selectedLoadingZone?.distance_to_service_area_min || 0) || 0,
      critical_restrictions_count: criticalRestrictions.length,
      stale_sections_count: staleSections.length,
      recurring_issues_count: recurringIssues.length,
    },
    access_rule: defaultAccessRule,
    loading_zone: selectedLoadingZone,
    service_area: selectedServiceArea,
    route: selectedRoute,
    route_steps: selectedRoute?.steps || [],
    restrictions: criticalRestrictions,
    parking_options: bundle.parking_options.slice(0, 4),
    connectivity_zones: bundle.connectivity_zones.slice(0, 4),
    contacts: bundle.contacts.filter((contact) => bool(contact.is_primary)).slice(0, 5),
    recurring_issues: recurringIssues,
    risks,
    freshness: bundle.summary.section_meta,
    stale_warning: staleSections.length
      ? `Pozor: zastaralé sekce venue (${staleSections.join(', ')}).`
      : '',
  };
}

async function createVenueSnapshot(dbClient, zakazkaId, generatedBy = null) {
  const client = dbClient || { query };
  const brief = await buildVenueBriefForZakazka(client, zakazkaId);
  if (!brief.venue?.id) return null;

  const { rows } = await client.query(
    `INSERT INTO venue_snapshots (venue_id, event_id, snapshot_payload, generated_by)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING *`,
    [brief.venue.id, zakazkaId, JSON.stringify(brief), generatedBy]
  );
  return rows[0];
}

function buildObservationPayloadsFromDebrief({ body, zakazka, attachmentIds = [] }) {
  const payloads = [];
  const happenedAt = new Date().toISOString();
  const addObservation = (category, title, description, severity = 'info', extra = {}) => {
    payloads.push({
      venue_id: zakazka.venue_id,
      event_id: zakazka.id,
      category,
      title,
      description,
      severity,
      happened_at: happenedAt,
      source: 'debrief',
      is_verified: false,
      attachment_id: extra.attachment_id || null,
      measured_minutes: extra.measured_minutes ?? null,
      recurring_key: extra.recurring_key || normalizeRecurringKey(title, category),
      propose_master_update: bool(extra.propose_master_update),
      proposal_status: bool(extra.propose_master_update) ? 'pending' : 'none',
      proposed_update_payload: extra.proposed_update_payload || null,
      notes: extra.notes || null,
    });
  };

  if (body.access_as_expected === false || body.access_as_expected === 'no') {
    addObservation('access', 'Access neodpovídal očekávání', body.access_notes || 'Přístup na venue se lišil oproti briefu.', 'warning', {
      recurring_key: 'access_unexpected',
      propose_master_update: body.propose_master_update,
      proposed_update_payload: { section: 'access', notes: body.access_notes || '' },
    });
  }

  if (body.actual_security_delay_minutes != null && body.actual_security_delay_minutes !== '') {
    const delay = Number(body.actual_security_delay_minutes) || 0;
    addObservation('security', delay >= 20 ? 'Security check 20+ min' : 'Security check ověřen', `Skutečná bezpečnostní kontrola trvala ${delay} min.`, delay >= 20 ? 'warning' : 'info', {
      measured_minutes: delay,
      recurring_key: delay >= 20 ? 'security_delay_20_plus' : 'security_delay_verified',
      propose_master_update: body.propose_master_update,
      proposed_update_payload: { section: 'access', avg_security_minutes: delay },
    });
  }

  if (body.actual_unload_to_service_area_minutes != null && body.actual_unload_to_service_area_minutes !== '') {
    const minutes = Number(body.actual_unload_to_service_area_minutes) || 0;
    addObservation('route', minutes >= 15 ? 'Unload-to-room 15+ min' : 'Unload-to-room time ověřen', `Přesun z vykládky do servisní zóny trval ${minutes} min.`, minutes >= 15 ? 'warning' : 'info', {
      measured_minutes: minutes,
      recurring_key: minutes >= 15 ? 'route_delay_15_plus' : 'route_delay_verified',
      propose_master_update: body.propose_master_update,
      proposed_update_payload: { section: 'routes', estimated_walk_minutes: minutes },
    });
  }

  const issueConfigs = [
    ['loading_issue', 'loading', 'Problém s loading dockem', 'loading_issue', body.loading_issue_note],
    ['route_bottleneck', 'route', 'Bottleneck na trase', 'route_bottleneck', body.route_bottleneck_note],
    ['parking_issue', 'parking', 'Problém s parkováním', 'parking_issue', body.parking_issue_note],
    ['connectivity_issue', 'connectivity', 'Problém s konektivitou', 'connectivity_issue', body.connectivity_issue_note],
    ['restriction_discovered', 'restriction', 'Nově zjištěná restrikce', 'restriction_discovered', body.new_restriction_note],
  ];

  for (const [field, category, title, recurringKey, note] of issueConfigs) {
    if (body[field] === true || body[field] === 'yes') {
      addObservation(category, title, note || title, category === 'restriction' ? 'critical' : 'warning', {
        recurring_key: recurringKey,
        propose_master_update: body.propose_master_update,
        proposed_update_payload: { section: OBSERVATION_CATEGORY_TO_SECTION[category], notes: note || title },
      });
    }
  }

  if (attachmentIds[0]) {
    payloads[0] = payloads[0] || {
      venue_id: zakazka.venue_id,
      event_id: zakazka.id,
      category: 'other',
      title: 'Debrief foto',
      description: 'Fotodokumentace z debriefu venue.',
      severity: 'info',
      happened_at: happenedAt,
      source: 'debrief',
      is_verified: false,
      recurring_key: 'debrief_photo',
      propose_master_update: false,
      proposal_status: 'none',
    };
    payloads[0].attachment_id = attachmentIds[0];
  }

  return payloads;
}

async function submitVenueDebrief(dbClient, zakazkaId, body, userId) {
  const client = dbClient || { query };
  const { rows } = await client.query(
    `SELECT id, venue_id, venue_route_id, venue_loading_zone_id
     FROM zakazky
     WHERE id = $1
     LIMIT 1`,
    [zakazkaId]
  );
  const zakazka = rows[0];
  if (!zakazka) {
    const err = new Error('Zakázka nenalezena');
    err.status = 404;
    throw err;
  }
  if (!zakazka.venue_id) {
    const err = new Error('K zakázce není přiřazené venue');
    err.status = 400;
    throw err;
  }

  const attachmentIds = Array.isArray(body.attachment_ids)
    ? body.attachment_ids.map((value) => parseInt(value, 10)).filter(Boolean)
    : [];
  const payloads = buildObservationPayloadsFromDebrief({ body, zakazka, attachmentIds });
  const created = [];

  for (const payload of payloads) {
    const { rows: inserted } = await client.query(
      `INSERT INTO venue_observations (
         venue_id, event_id, category, title, description, severity, measured_minutes,
         happened_at, created_by, source, is_verified, attachment_id, recurring_key,
         propose_master_update, proposal_status, proposed_update_payload, notes
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
       RETURNING *`,
      [
        payload.venue_id,
        payload.event_id,
        payload.category,
        payload.title,
        payload.description,
        payload.severity,
        payload.measured_minutes,
        payload.happened_at,
        userId,
        payload.source || 'debrief',
        payload.is_verified,
        payload.attachment_id,
        payload.recurring_key,
        payload.propose_master_update,
        payload.proposal_status,
        payload.proposed_update_payload ? JSON.stringify(payload.proposed_update_payload) : null,
        payload.notes,
      ]
    );
    created.push(inserted[0]);
  }

  await client.query(
    `UPDATE venue_access_rules
     SET last_verified_at = NOW(), verification_source = 'event_debrief'
     WHERE venue_id = $1`,
    [zakazka.venue_id]
  );
  await client.query(
    `UPDATE venue_restrictions
     SET last_verified_at = NOW()
     WHERE venue_id = $1 AND category IN ('timing', 'security', 'vendor_access', 'parking', 'other')`,
    [zakazka.venue_id]
  );
  await client.query(
    `UPDATE venue_connectivity_zones
     SET last_verified_at = NOW()
     WHERE venue_id = $1`,
    [zakazka.venue_id]
  );

  return { created };
}

async function appendVenueAudit({
  dbClient,
  venueId,
  entityType,
  entityId,
  action,
  beforeValue = null,
  afterValue = null,
  changedBy = null,
  source = 'manual',
  note = null,
}) {
  const client = dbClient || { query };
  await client.query(
    `INSERT INTO venue_audit_log (
       venue_id, entity_type, entity_id, action, before_payload, after_payload, changed_by, source, note
     )
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
    [
      venueId,
      entityType,
      entityId,
      action,
      beforeValue ? JSON.stringify(beforeValue) : null,
      afterValue ? JSON.stringify(afterValue) : null,
      changedBy,
      source,
      note,
    ]
  );
}

module.exports = {
  deriveFreshnessStatus,
  deriveConfidenceLevel,
  buildRecurringIssues,
  getVenueBundle,
  buildVenueSummary,
  buildVenueBriefForZakazka,
  createVenueSnapshot,
  submitVenueDebrief,
  appendVenueAudit,
  normalizeRecurringKey,
  bool,
};
