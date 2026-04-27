const { URL } = require('url');
const {
  deriveFreshnessStatus,
  deriveConfidenceLevel,
  buildRecurringIssues,
} = require('../src/venueTwin');

const API_BASE = process.env.REGRESSION_TEST_API_URL || 'http://localhost:4000';
const EMAIL = process.env.REGRESSION_TEST_EMAIL || process.env.SECURITY_TEST_EMAIL || 'pomykal@aceit.cz';
const PASSWORD = process.env.REGRESSION_TEST_PASSWORD || process.env.SECURITY_TEST_PASSWORD || 'Demo1234!';
const FORCE_MUTATIONS = process.env.REGRESSION_TEST_MUTATIONS === 'true';

const buildUrl = (path) => new URL(path, API_BASE).toString();
const apiUrl = new URL(API_BASE);
const isLocalTarget = ['localhost', '127.0.0.1'].includes(apiUrl.hostname);
const allowMutations = FORCE_MUTATIONS || isLocalTarget;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}, token = '') {
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(buildUrl(path), { ...options, headers });
  return res;
}

async function expectJson(path, options = {}, token = '', expectedStatuses = [200]) {
  const res = await api(path, options, token);
  if (!expectedStatuses.includes(res.status)) {
    const body = await res.text();
    throw new Error(`${path} expected ${expectedStatuses.join('/')} but got ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function logStep(label, fn) {
  process.stdout.write(`- ${label} ... `);
  await fn();
  console.log('ok');
}

function runUnitChecks() {
  assert(deriveFreshnessStatus(new Date()) === 'fresh', 'freshness should be fresh');
  assert(deriveFreshnessStatus(new Date(Date.now() - 120 * 86400000)) === 'aging', 'freshness should be aging');
  assert(deriveFreshnessStatus(null) === 'stale', 'freshness should be stale');
  assert(deriveConfidenceLevel({ verifiedRecentCount: 3, manualVerifiedAt: new Date(), hasConflicts: false }) === 'high', 'confidence should be high');
  assert(deriveConfidenceLevel({ verifiedRecentCount: 1, manualVerifiedAt: null, hasConflicts: false }) === 'medium', 'confidence should be medium');
  assert(deriveConfidenceLevel({ verifiedRecentCount: 0, manualVerifiedAt: null, hasConflicts: true }) === 'low', 'confidence should be low');
  const recurring = buildRecurringIssues([
    { category: 'security', title: 'Security delay', happened_at: new Date(), is_verified: true, severity: 'warning', recurring_key: 'security_delay' },
    { category: 'security', title: 'Security delay', happened_at: new Date(), is_verified: true, severity: 'warning', recurring_key: 'security_delay' },
  ]);
  assert(recurring.length === 1, 'recurring issue bucket missing');
}

async function run() {
  console.log(`Running regression test against ${API_BASE}`);
  console.log(`Mutation mode: ${allowMutations ? 'full' : 'read-only'}${FORCE_MUTATIONS && !isLocalTarget ? ' (forced)' : ''}`);

  await logStep('Unit logic checks', async () => {
    runUnitChecks();
  });

  let token = '';
  let me = null;

  await logStep('Backend health', async () => {
    const health = await expectJson('/api/health');
    assert(health.status === 'ok', 'health payload should be ok');
  });

  await logStep('Login and auth identity', async () => {
    const login = await expectJson('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, heslo: PASSWORD }),
    });
    assert(login.token, 'token missing in login');
    token = login.token;
    me = await expectJson('/api/auth/me', {}, token);
    assert(String(me.email || '').toLowerCase() === String(EMAIL).toLowerCase(), 'logged user mismatch');
  });

  await logStep('Core read endpoints', async () => {
    await expectJson('/api/nastaveni', {}, token);
    await expectJson('/api/nastaveni/setup-status', {}, token);
    await expectJson('/api/klienti?limit=5', {}, token);
    await expectJson('/api/zakazky?limit=5', {}, token);
    await expectJson('/api/venues?limit=5', {}, token);
    await expectJson('/api/notifikace', {}, token);
    await expectJson('/api/backup/info', {}, token);
  });

  if (me?.modules?.reporty) {
    await logStep('Reporty summary', async () => {
      await expectJson('/api/reporty/dashboard-summary', {}, token);
      await expectJson('/api/reporty', {}, token);
    });
  }

  if (me?.modules?.kalendar) {
    await logStep('Kalendar and capacities reads', async () => {
      await expectJson('/api/kalendar', {}, token);
      await expectJson('/api/kapacity', {}, token);
    });
  }

  if (me?.modules?.archiv) {
    await logStep('Archiv read', async () => {
      await expectJson('/api/archiv', {}, token);
    });
  }

  if (!allowMutations) {
    console.log('\nRead-only regression finished. For full CRUD run set REGRESSION_TEST_MUTATIONS=true or target localhost.');
    return;
  }

  const suffix = Date.now();
  let klient;
  let venue;
  let loadingZone;
  let serviceArea;
  let route;
  let zakazka;
  let followup;
  let nabidka;

  await logStep('Create and update klient', async () => {
    klient = await expectJson('/api/klienti', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jmeno: 'Regression',
        prijmeni: `Client ${suffix}`,
        firma: 'Regression Labs',
        typ: 'firemni',
        email: `regression-client-${suffix}@example.com`,
        telefon: '+420 777 000 111',
        adresa: 'Testovaci 1, Praha',
        zdroj: 'Regression test',
      }),
    }, token, [201]);

    const updated = await expectJson(`/api/klienti/${klient.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ poznamka: 'Regression note', pravidelny: true }),
    }, token);
    assert(updated.pravidelny === true, 'client update failed');
  });

  await logStep('Create venue and logistics sections', async () => {
    venue = await expectJson('/api/venues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Regression Venue ${suffix}`,
        address_line_1: 'Logisticka 5',
        city: 'Praha',
        postal_code: '11000',
        general_notes: 'Regression venue',
      }),
    }, token, [201]);

    await expectJson(`/api/venues/${venue.id}/contacts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ops Contact', role: 'venue_manager', phone: '+420 777 111 222', is_primary: true }),
    }, token, [201]);

    await expectJson(`/api/venues/${venue.id}/access-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Default access', check_in_point: 'Gate A', security_check_required: true, avg_security_minutes: 15, is_default: true }),
    }, token, [201]);

    loadingZone = await expectJson(`/api/venues/${venue.id}/loading-zones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Dock A', arrival_instructions: 'Rear entrance', distance_to_service_area_min: 5, is_default: true }),
    }, token, [201]);

    serviceArea = await expectJson(`/api/venues/${venue.id}/service-areas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Main Hall', floor: '1', capacity: 60, has_power_access: true }),
    }, token, [201]);

    route = await expectJson(`/api/venues/${venue.id}/routes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Dock A to Main Hall',
        from_loading_zone_id: loadingZone.id,
        to_service_area_id: serviceArea.id,
        estimated_walk_minutes: 7,
        route_difficulty: 'medium',
        is_default: true,
        steps: [
          { step_index: 1, instruction: 'Check in at gate', checkpoint_type: 'security' },
          { step_index: 2, instruction: 'Use service corridor', checkpoint_type: 'corridor' },
        ],
      }),
    }, token, [201]);

    await expectJson(`/api/venues/${venue.id}/restrictions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'timing', severity: 'warning', title: 'Unload by 10:00', description: 'Morning window only' }),
    }, token, [201]);

    await expectJson(`/api/venues/${venue.id}/parking-options`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_type: 'van', location_description: 'Parking P2', walking_minutes_to_venue: 4 }),
    }, token, [201]);

    await expectJson(`/api/venues/${venue.id}/connectivity-zones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ zone_name: 'Loading corridor', signal_quality: 'weak', dead_spot: true }),
    }, token, [201]);

    const summary = await expectJson(`/api/venues/${venue.id}/summary`, {}, token);
    assert(summary.venue?.id === venue.id, 'venue summary mismatch');
  });

  await logStep('Create zakazka and venue brief flow', async () => {
    zakazka = await expectJson('/api/zakazky', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nazev: `Regression Event ${suffix}`,
        typ: 'firemni_akce',
        klient_id: klient.id,
        datum_akce: '2026-12-31',
        cas_zacatek: '18:00',
        cas_konec: '23:00',
        misto: 'Regression venue',
        venue_id: venue.id,
        venue_loading_zone_id: loadingZone.id,
        venue_service_area_id: serviceArea.id,
        venue_route_id: route.id,
        pocet_hostu: 42,
        rozpocet_klienta: 50000,
      }),
    }, token, [201]);

    await expectJson(`/api/zakazky/${zakazka.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        harmonogram: '18:00 setup, 19:00 service',
        logistika: 'Vstup pres dock A',
        checklist: [
          { key: 'offer_ready', label: 'Nabidka', done: true },
          { key: 'team_ready', label: 'Tym', done: true },
        ],
      }),
    }, token);

    const brief = await expectJson(`/api/zakazky/${zakazka.id}/venue-brief`, {}, token);
    assert(brief.venue?.id === venue.id, 'venue brief missing venue');
    await expectJson(`/api/zakazky/${zakazka.id}/venue-snapshot`, { method: 'POST' }, token, [201]);
    await expectJson(`/api/zakazky/${zakazka.id}/venue-debrief`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        access_as_expected: 'yes',
        actual_security_delay_minutes: 18,
        actual_unload_to_service_area_minutes: 11,
        route_bottleneck: true,
        route_bottleneck_note: 'Service corridor was crowded',
      }),
    }, token, [201]);
  });

  await logStep('Create followup and nabidka', async () => {
    followup = await expectJson('/api/followup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        zakazka_id: zakazka.id,
        titulek: 'Regression followup',
        termin: '2026-12-15',
      }),
    }, token, [201]);
    await expectJson(`/api/followup/${followup.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ splneno: true }),
    }, token);

    nabidka = await expectJson('/api/nabidky', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        zakazka_id: zakazka.id,
        nazev: `Regression nabidka ${suffix}`,
        uvodni_text: 'Dobry den',
        zaverecny_text: 'Dekujeme',
        platnost_do: '2026-12-01',
        polozky: [
          { kategorie: 'jidlo', nazev: 'Test menu', jednotka: 'os.', mnozstvi: 42, cena_jednotka: 250 },
        ],
      }),
    }, token, [201]);
    assert(nabidka.id, 'offer create failed');
  });

  if (me?.modules?.personal) {
    await logStep('Personal create and assignment', async () => {
      const personal = await expectJson('/api/personal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jmeno: 'Regression',
          prijmeni: `Crew ${suffix}`,
          typ: 'externi',
          role: 'cisnik',
          email: `regression-crew-${suffix}@example.com`,
          telefon: '+420 777 222 333',
        }),
      }, token, [201]);

      await expectJson(`/api/personal/${personal.id}/prirazeni`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          zakazka_id: zakazka.id,
          role_na_akci: 'Obsluha',
          cas_prichod: '17:00',
          cas_odchod: '23:30',
        }),
      }, token, [201]);

      const unavailable = await expectJson('/api/personal', {
        method: 'GET',
      }, token);
      const availablePerson = unavailable.data.find((item) => item.id === personal.id);
      assert(availablePerson?.availability?.available !== false, 'freshly assigned person should remain available for non-overlapping availability query');

      const absentPerson = await expectJson('/api/personal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jmeno: 'Regression',
          prijmeni: `Absent ${suffix}`,
          typ: 'externi',
          role: 'cisnik',
          email: `regression-absent-${suffix}@example.com`,
        }),
      }, token, [201]);

      await expectJson(`/api/personal/${absentPerson.id}/absence`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          datum_od: '2026-12-31',
          datum_do: '2026-12-31',
          typ: 'dovolena',
          poznamka: 'Regression unavailable check',
        }),
      }, token, [201]);

      const availability = await expectJson(`/api/personal?zakazka_id=${zakazka.id}&cas_od=17:00&cas_do=23:30`, {}, token);
      const blocked = availability.data.find((item) => item.id === absentPerson.id);
      assert(blocked?.availability?.available === false, 'absent person should be marked unavailable');
      assert(blocked.availability.conflicts?.some((item) => item.type === 'absence'), 'absence conflict should be reported');

      const blockedAssignment = await expectJson(`/api/personal/${absentPerson.id}/prirazeni`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          zakazka_id: zakazka.id,
          role_na_akci: 'Obsluha',
          cas_prichod: '17:00',
          cas_odchod: '23:30',
        }),
      }, token, [201]);
      assert(blockedAssignment.availability_warning?.available === false, 'assignment response should include availability warning');
    });
  }

  if (me?.modules?.dokumenty) {
    await logStep('Dokumenty folders CRUD', async () => {
      const slozka = await expectJson('/api/dokumenty/slozky', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nazev: `Regression folder ${suffix}` }),
      }, token, [201]);

      await expectJson(`/api/dokumenty/slozky/${slozka.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nazev: `Regression folder renamed ${suffix}` }),
      }, token);

      const res = await api(`/api/dokumenty/slozky/${slozka.id}`, { method: 'DELETE' }, token);
      assert(res.status === 200, `folder delete failed with ${res.status}`);
    });
  }

  if (me?.modules?.faktury) {
    await logStep('Faktura create', async () => {
      const faktura = await expectJson('/api/faktury', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klient_id: klient.id,
          zakazka_id: zakazka.id,
          datum_splatnosti: '2027-01-14',
          zpusob_platby: 'prevod',
          polozky: [
            { nazev: 'Catering service', jednotka: 'ks', mnozstvi: 1, cena_jednotka: 10000, dph_sazba: 12 },
          ],
        }),
      }, token, [201]);
      assert(faktura.id, 'invoice create failed');
    });
  }

  if (me?.role === 'super_admin') {
    await logStep('Temporary user management', async () => {
      const tempUser = await expectJson('/api/uzivatele', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jmeno: 'Temp',
          prijmeni: 'Regression',
          email: `temp-regression-${suffix}@example.com`,
          heslo: 'Regression123!',
          role: 'admin',
        }),
      }, token, [201]);

      await expectJson(`/api/uzivatele/${tempUser.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ telefon: '+420 777 444 555', aktivni: true }),
      }, token);

      const res = await api(`/api/uzivatele/${tempUser.id}`, { method: 'DELETE' }, token);
      assert(res.status === 200, `temp user delete failed with ${res.status}`);
    });
  }

  await logStep('Derived documents and production endpoints', async () => {
    await api(`/api/zakazky/${zakazka.id}/podklady`, { method: 'GET' }, token);
    await api(`/api/zakazky/${zakazka.id}/dodaci-list`, { method: 'GET' }, token);
    await expectJson(`/api/production/calculate/${zakazka.id}`, {}, token);
    await expectJson(`/api/production/sheet/${zakazka.id}`, {}, token);
  });

  console.log('\nFull regression test passed');
}

run().catch((err) => {
  console.error(`\nRegression test failed: ${err.message}`);
  process.exit(1);
});
