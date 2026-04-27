const { URL } = require('url');
const {
  deriveFreshnessStatus,
  deriveConfidenceLevel,
  buildRecurringIssues,
} = require('../src/venueTwin');

const API_BASE = process.env.VENUE_TEST_API_URL || 'http://localhost:4000';
const EMAIL = process.env.VENUE_TEST_EMAIL || 'pomykal@aceit.cz';
const PASSWORD = process.env.VENUE_TEST_PASSWORD || 'Demo1234!';
const SKIP_API = process.env.VENUE_TEST_SKIP_API === 'true';

const buildUrl = (path) => new URL(path, API_BASE).toString();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}, token = '') {
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(buildUrl(path), { ...options, headers });
  return res;
}

async function runUnitChecks() {
  console.log('Running venue twin unit checks');
  assert(deriveFreshnessStatus(new Date()) === 'fresh', 'freshness: expected fresh');
  assert(deriveFreshnessStatus(new Date(Date.now() - 120 * 86400000)) === 'aging', 'freshness: expected aging');
  assert(deriveFreshnessStatus(null) === 'stale', 'freshness: expected stale');

  assert(deriveConfidenceLevel({ verifiedRecentCount: 3, manualVerifiedAt: new Date(), hasConflicts: false }) === 'high', 'confidence: expected high');
  assert(deriveConfidenceLevel({ verifiedRecentCount: 1, manualVerifiedAt: null, hasConflicts: false }) === 'medium', 'confidence: expected medium');
  assert(deriveConfidenceLevel({ verifiedRecentCount: 0, manualVerifiedAt: null, hasConflicts: true }) === 'low', 'confidence: expected low');

  const recurring = buildRecurringIssues([
    { category: 'security', title: 'Security check 20+ min', happened_at: new Date(), is_verified: true, severity: 'warning', recurring_key: 'security_delay_20_plus' },
    { category: 'security', title: 'Security check 20+ min', happened_at: new Date(), is_verified: true, severity: 'warning', recurring_key: 'security_delay_20_plus' },
    { category: 'parking', title: 'Parking issue', happened_at: new Date(), is_verified: false, severity: 'warning' },
  ]);
  assert(recurring.length === 1 && recurring[0].key === 'security_delay_20_plus', 'recurring issues: expected one recurring bucket');
}

async function runApiChecks() {
  console.log('Running venue twin API smoke checks');

  const loginRes = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, heslo: PASSWORD }),
  });
  assert(loginRes.status === 200, `login failed with ${loginRes.status}`);
  const loginPayload = await loginRes.json();
  const token = loginPayload.token;
  assert(token, 'login token missing');

  const suffix = Date.now();
  const venueRes = await api('/api/venues', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Venue Twin Test ${suffix}`,
      address_line_1: 'Testovaci 1',
      city: 'Praha',
      postal_code: '11000',
      general_notes: 'Integration smoke test',
    }),
  }, token);
  assert(venueRes.status === 201, `create venue failed with ${venueRes.status}`);
  const venue = await venueRes.json();

  const accessRes = await api(`/api/venues/${venue.id}/access-rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Default access rule',
      check_in_point: 'Gate A',
      security_check_required: true,
      avg_security_minutes: 18,
      is_default: true,
    }),
  }, token);
  assert(accessRes.status === 201, `create access rule failed with ${accessRes.status}`);

  const loadingRes = await api(`/api/venues/${venue.id}/loading-zones`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test loading',
      arrival_instructions: 'Drive to rear gate',
      distance_to_service_area_min: 6,
      is_default: true,
    }),
  }, token);
  assert(loadingRes.status === 201, `create loading zone failed with ${loadingRes.status}`);
  const loading = await loadingRes.json();

  const serviceAreaRes = await api(`/api/venues/${venue.id}/service-areas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Main Hall',
      floor: '1',
      capacity: 80,
      has_power_access: true,
    }),
  }, token);
  assert(serviceAreaRes.status === 201, `create service area failed with ${serviceAreaRes.status}`);
  const serviceArea = await serviceAreaRes.json();

  const routeRes = await api(`/api/venues/${venue.id}/routes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Dock to hall',
      from_loading_zone_id: loading.id,
      to_service_area_id: serviceArea.id,
      estimated_walk_minutes: 9,
      route_difficulty: 'medium',
      is_default: true,
      steps: [
        { step_index: 1, instruction: 'Check in at gate', checkpoint_type: 'security' },
        { step_index: 2, instruction: 'Continue to hall', checkpoint_type: 'service_area' },
      ],
    }),
  }, token);
  assert(routeRes.status === 201, `create route failed with ${routeRes.status}`);
  const route = await routeRes.json();

  await api(`/api/venues/${venue.id}/restrictions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      category: 'open_fire',
      severity: 'critical',
      title: 'No open fire',
      description: 'Candles are prohibited',
    }),
  }, token);
  await api(`/api/venues/${venue.id}/parking-options`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      vehicle_type: 'van',
      location_description: 'Street parking P2',
      walking_minutes_to_venue: 4,
    }),
  }, token);
  await api(`/api/venues/${venue.id}/connectivity-zones`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      zone_name: 'Service corridor',
      signal_quality: 'weak',
      dead_spot: true,
    }),
  }, token);
  await api(`/api/venues/${venue.id}/contacts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Operations contact',
      role: 'venue_manager',
      phone: '+420 123 456 789',
      is_primary: true,
    }),
  }, token);

  const zakRes = await api('/api/zakazky?limit=1', { method: 'GET' }, token);
  assert(zakRes.status === 200, `zakazky list failed with ${zakRes.status}`);
  const zakPayload = await zakRes.json();
  const zakazka = zakPayload.data?.[0];
  assert(zakazka?.id, 'no zakazka available for integration test');

  const assignRes = await api(`/api/zakazky/${zakazka.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      venue_id: venue.id,
      venue_loading_zone_id: loading.id,
      venue_service_area_id: serviceArea.id,
      venue_route_id: route.id,
    }),
  }, token);
  assert(assignRes.status === 200, `assign venue failed with ${assignRes.status}`);

  const briefRes = await api(`/api/zakazky/${zakazka.id}/venue-brief`, { method: 'GET' }, token);
  assert(briefRes.status === 200, `venue brief failed with ${briefRes.status}`);
  const brief = await briefRes.json();
  assert(brief.venue?.id === venue.id, 'venue brief does not reference assigned venue');

  const snapshotRes = await api(`/api/zakazky/${zakazka.id}/venue-snapshot`, { method: 'POST' }, token);
  assert(snapshotRes.status === 201, `venue snapshot failed with ${snapshotRes.status}`);

  const debriefRes = await api(`/api/zakazky/${zakazka.id}/venue-debrief`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      access_as_expected: 'no',
      actual_security_delay_minutes: 26,
      actual_unload_to_service_area_minutes: 14,
      route_bottleneck: true,
      route_bottleneck_note: 'Tight corridor near the hall',
      propose_master_update: true,
    }),
  }, token);
  assert(debriefRes.status === 201, `venue debrief failed with ${debriefRes.status}`);
  const debrief = await debriefRes.json();
  assert(Array.isArray(debrief.created) && debrief.created.length >= 3, 'venue debrief did not create observations');

  const venueDetailRes = await api(`/api/venues/${venue.id}`, { method: 'GET' }, token);
  assert(venueDetailRes.status === 200, `venue detail failed with ${venueDetailRes.status}`);
  const venueDetail = await venueDetailRes.json();
  assert(Array.isArray(venueDetail.observations) && venueDetail.observations.length >= 3, 'venue detail missing observations');
}

async function run() {
  await runUnitChecks();
  if (SKIP_API) {
    console.log('Skipping API smoke checks (VENUE_TEST_SKIP_API=true)');
  } else {
    await runApiChecks();
  }
  console.log('\nVenue twin tests passed');
}

run().catch((err) => {
  console.error('\nVenue twin tests failed:', err.message);
  process.exit(1);
});
