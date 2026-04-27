const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');
const { requireAppModule } = require('../moduleAccess');
const { sendKomando, sendDekujeme } = require('../emailService');
const { createNotif } = require('../notifHelper');
const { processNotificationEvent } = require('../notificationRules');
const { upsertEvent, deleteEvent } = require('../googleCalendar');
const { autoFollowup } = require('../followupHelper');
const {
  normalizeChecklist,
  createChecklistTemplate,
  mergeChecklistWithTemplate,
  getWorkflowBlockers,
  getChecklistSummary,
} = require('../zakazkaWorkflow');
const {
  buildVenueBriefForZakazka,
  createVenueSnapshot,
  submitVenueDebrief,
} = require('../venueTwin');
const { aggregateIngredientsForZakazka } = require('../eventIngredientAggregator');
const { loadFirmaSettings } = require('../firmaSettings');
const { resolveDocumentBranding } = require('../documentBranding');

const CRITICAL_EVENT_FIELDS = new Set([
  'datum_akce',
  'cas_zacatek',
  'cas_konec',
  'misto',
  'venue_id',
  'venue_loading_zone_id',
  'venue_service_area_id',
  'venue_route_id',
  'pocet_hostu',
]);

// GenerĂˇtor ÄŤĂ­sla zakĂˇzky â€“ musĂ­ bĂ˝t volĂˇno uvnitĹ™ transakce (FOR UPDATE zabrĂˇnĂ­ race condition)
async function genCislo(client) {
  const rok = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT cislo FROM zakazky WHERE cislo LIKE $1 ORDER BY cislo DESC LIMIT 1 FOR UPDATE`,
    [`ZAK-${rok}-%`]
  );
  if (!rows.length) return `ZAK-${rok}-001`;
  const last = parseInt(rows[0].cislo.split('-')[2], 10);
  return `ZAK-${rok}-${String(last + 1).padStart(3, '0')}`;
}

// GET /api/zakazky
router.get('/', auth, async (req, res, next) => {
  try {
    const { stav, typ, obchodnik_id, klient_id, od, do: doo,
            cena_od, cena_do, q, page = 1, limit = 20 } = req.query;

    // Input validation
    if (q && q.length > 200) return res.status(400).json({ error: 'HledanĂ˝ vĂ˝raz je pĹ™Ă­liĹˇ dlouhĂ˝' });
    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 200);
    const safePage  = Math.max(parseInt(page) || 1, 1);

    const where = [];
    const params = [];
    let p = 1;

    if (stav)         { where.push(`z.stav = $${p++}`);                  params.push(stav); }
    else              { where.push(`z.stav != 'nova_poptavka'`); }
    where.push('z.archivovano = false');
    if (typ)          { where.push(`z.typ = $${p++}`);                   params.push(typ); }
    if (obchodnik_id) { where.push(`z.obchodnik_id = $${p++}`);          params.push(obchodnik_id); }
    if (klient_id)    { where.push(`z.klient_id = $${p++}`);             params.push(klient_id); }
    if (od)           { where.push(`z.datum_akce >= $${p++}`);            params.push(od); }
    if (doo)          { where.push(`z.datum_akce <= $${p++}`);            params.push(doo); }
    if (cena_od)      { where.push(`z.cena_celkem >= $${p++}`);           params.push(cena_od); }
    if (cena_do)      { where.push(`z.cena_celkem <= $${p++}`);           params.push(cena_do); }
    if (q)            { where.push(`(z.nazev ILIKE $${p} OR z.cislo ILIKE $${p} OR k.jmeno ILIKE $${p})`);
                        params.push(`%${q}%`); p++; }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (safePage - 1) * safeLimit;

    const sql = `
      SELECT z.*,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
             u.jmeno AS obchodnik_jmeno, u.prijmeni AS obchodnik_prijmeni,
             v.name AS venue_name, v.address_line_1 AS venue_address_line_1, v.city AS venue_city,
             COUNT(*) OVER() AS total_count
      FROM zakazky z
      LEFT JOIN klienti k ON k.id = z.klient_id
      LEFT JOIN uzivatele u ON u.id = z.obchodnik_id
      LEFT JOIN venues v ON v.id = z.venue_id
      ${whereClause}
      ORDER BY z.datum_akce DESC NULLS LAST, z.created_at DESC
      LIMIT $${p++} OFFSET $${p++}`;

    params.push(safeLimit, offset);
    const { rows } = await query(sql, params);
    const total = rows[0]?.total_count || 0;

    res.json({
      data: rows.map(r => { delete r.total_count; return r; }),
      meta: { total: parseInt(total), page: safePage, limit: safeLimit,
              pages: Math.ceil(parseInt(total) / safeLimit) }
    });
  } catch (err) { next(err); }
});

// GET /api/zakazky/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT z.*,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
             k.email AS klient_email, k.telefon AS klient_telefon,
             u.jmeno AS obchodnik_jmeno, u.prijmeni AS obchodnik_prijmeni,
             v.name AS venue_name, v.slug AS venue_slug,
             v.address_line_1 AS venue_address_line_1, v.address_line_2 AS venue_address_line_2,
             v.city AS venue_city, v.postal_code AS venue_postal_code, v.country AS venue_country
      FROM zakazky z
      LEFT JOIN klienti k ON k.id = z.klient_id
      LEFT JOIN uzivatele u ON u.id = z.obchodnik_id
      LEFT JOIN venues v ON v.id = z.venue_id
      WHERE z.id = $1`, [req.params.id]);

    // Historie stavĹŻ
    const history = await query(`
      SELECT zh.*, u.jmeno, u.prijmeni FROM zakazky_history zh
      LEFT JOIN uzivatele u ON u.id = zh.uzivatel_id
      WHERE zh.zakazka_id = $1 ORDER BY zh.created_at ASC LIMIT 200`, [req.params.id]);

    // PersonĂˇl
    const personal = await query(`
      SELECT zp.*, p.jmeno, p.prijmeni, p.role, p.telefon, p.email
      FROM zakazky_personal zp
      JOIN personal p ON p.id = zp.personal_id
      WHERE zp.zakazka_id = $1`, [req.params.id]);

    // Dokumenty
    const dokumenty = await query(
      'SELECT * FROM dokumenty WHERE zakazka_id = $1 ORDER BY created_at DESC',
      [req.params.id]);

    // NabĂ­dka (aktivnĂ­) s poloĹľkami pro Komando
    const nabidkaRes = await query(`
      SELECT n.*,
        COALESCE(
          json_agg(json_build_object('nazev', p.nazev, 'mnozstvi', p.mnozstvi, 'jednotka', p.jednotka) ORDER BY p.poradi, p.id)
          FILTER (WHERE p.id IS NOT NULL), '[]'
        ) AS polozky
      FROM nabidky n
      LEFT JOIN nabidky_polozky p ON p.nabidka_id = n.id
      WHERE n.zakazka_id = $1 AND n.aktivni = true
      GROUP BY n.id
      LIMIT 1`, [req.params.id]);
    const nabidka = nabidkaRes.rows[0] || null;

    const mergedChecklist = mergeChecklistWithTemplate(rows[0].checklist, rows[0].typ);

    res.json({
      ...rows[0],
      checklist: mergedChecklist,
      checklist_template: createChecklistTemplate(rows[0].typ),
      checklist_summary: getChecklistSummary(mergedChecklist),
      history: history.rows,
      personal: personal.rows,
      dokumenty: dokumenty.rows,
      nabidka,
    });
  } catch (err) { next(err); }
});

// POST /api/zakazky
router.post('/', auth, async (req, res, next) => {
  try {
    const { nazev, typ, klient_id, obchodnik_id, datum_akce, cas_zacatek, cas_konec,
            misto, venue_id, venue_loading_zone_id, venue_service_area_id, venue_route_id,
            pocet_hostu, rozpocet_klienta, poznamka_klient, poznamka_interni } = req.body;
    const normalizeNullable = (value) => (value === '' || value === undefined ? null : value);

    const newZakazka = await withTransaction(async (client) => {
      const cislo = await genCislo(client);
      const checklist = createChecklistTemplate(typ);
      const { rows } = await client.query(`
        INSERT INTO zakazky (cislo, nazev, typ, stav, klient_id, obchodnik_id, datum_akce,
          cas_zacatek, cas_konec, misto, venue_id, venue_loading_zone_id, venue_service_area_id, venue_route_id,
          pocet_hostu, rozpocet_klienta, poznamka_klient, poznamka_interni, checklist)
        VALUES ($1,$2,$3,'rozpracovano',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [cislo, nazev, typ, normalizeNullable(klient_id), normalizeNullable(obchodnik_id) || req.user.id, normalizeNullable(datum_akce),
         normalizeNullable(cas_zacatek), normalizeNullable(cas_konec), normalizeNullable(misto),
         normalizeNullable(venue_id), normalizeNullable(venue_loading_zone_id), normalizeNullable(venue_service_area_id), normalizeNullable(venue_route_id),
         normalizeNullable(pocet_hostu), normalizeNullable(rozpocet_klienta), normalizeNullable(poznamka_klient), normalizeNullable(poznamka_interni), JSON.stringify(checklist)]);
      await client.query(`INSERT INTO zakazky_history (zakazka_id, stav_po, uzivatel_id, poznamka)
                   VALUES ($1, 'rozpracovano', $2, 'ZakĂˇzka vytvoĹ™ena')`,
        [rows[0].id, req.user.id]);
      return rows[0];
    });

    createNotif({
      typ: 'nova_zakazka',
      titulek: `NovĂˇ zakĂˇzka â€” ${newZakazka.nazev}`,
      zprava: `ďż˝slo: ${newZakazka.cislo}${misto ? ` ďż˝ Mďż˝sto: ${misto}` : ''}`,
      odkaz: `/zakazky/${newZakazka.id}`,
    });

    res.status(201).json(newZakazka);
  } catch (err) { next(err); }
});

// PATCH /api/zakazky/:id
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['nazev','typ','klient_id','obchodnik_id','datum_akce','cas_zacatek',
                     'cas_konec','misto','pocet_hostu','rozpocet_klienta','cena_celkem',
                     'cena_naklady','zaloha','doplatek','poznamka_klient','poznamka_interni',
                     'google_event_id',
                     'venue_id','venue_loading_zone_id','venue_service_area_id','venue_route_id',
                     'harmonogram','kontaktni_osoby_misto','rozsah_sluzeb','personalni_pozadavky',
                     'logistika','technicke_pozadavky','alergeny','specialni_prani','checklist'];

    const previous = await query(
      `SELECT id, cislo, nazev, datum_akce, cas_zacatek, cas_konec, misto,
              venue_id, venue_loading_zone_id, venue_service_area_id, venue_route_id, pocet_hostu
       FROM zakazky
       WHERE id = $1`,
      [req.params.id]
    );

    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    
    if (!previous.rows[0]) return res.status(404).json({ error: 'Zakazka nenalezena' });

    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    // PrĂˇzdnĂ˝ string â†’ null (zabrĂˇnĂ­ chybÄ› "invalid input syntax for type integer" u FK polĂ­)
    const vals = fields.map((f) => {
      const v = req.body[f];
      if (f === 'checklist') return JSON.stringify(normalizeChecklist(v));
      return (v === '' || v === undefined) ? null : v;
    });

    const { rows } = await query(
      `UPDATE zakazky SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...vals]);

    const hasCriticalChange = fields.some((field) => CRITICAL_EVENT_FIELDS.has(field))
      && fields.some((field) => previous.rows[0][field] !== rows[0][field]);

    // Google Calendar sync: update event if zakĂˇzka is confirmed and has an event
    if (rows[0].google_event_id && rows[0].stav === 'potvrzeno') {
      const { rows: full } = await query(`
        SELECT z.*, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
        FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id WHERE z.id = $1`, [req.params.id]);
      upsertEvent(full[0]).catch(err => console.warn('[GoogleCalendar] PATCH sync chyba:', err.message));
    }

    if (hasCriticalChange) {
      processNotificationEvent({
        eventType: 'zakazka_changed',
        zakazkaId: rows[0].id,
        actorId: req.user.id,
        dedupeKey: `zakazka_changed:${rows[0].id}:${Date.now()}`,
        title: `Zmena zakazky: ${rows[0].cislo} - ${rows[0].nazev}`,
        message: `Zakazka ${rows[0].cislo} (${rows[0].nazev}) ma zmenene dulezite detaily.`,
      }).catch((err) => console.warn('[notification-rules] zakazka_changed chyba:', err.message));
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/zakazky/:id/stav â€“ zmÄ›na stavu s historiĂ­
router.patch('/:id/stav', auth, async (req, res, next) => {
  try {
    const { stav, poznamka } = req.body;
    const validStavy = ['nova_poptavka','rozpracovano','nabidka_pripravena','nabidka_odeslana',
                        'ceka_na_vyjadreni','potvrzeno','ve_priprave','realizovano','uzavreno','stornovano'];
    if (!validStavy.includes(stav)) {
      return res.status(400).json({ error: 'NeplatnĂ˝ stav zakĂˇzky' });
    }

    let zakazkaRow = null;
    await withTransaction(async (client) => {
      const old = await client.query(`
        SELECT z.stav, z.google_event_id, z.datum_akce, z.cas_zacatek, z.cas_konec,
               z.misto, z.pocet_hostu, z.cena_celkem, z.nazev, z.cislo, z.typ, z.id,
               z.poznamka_interni, z.harmonogram, z.logistika, z.checklist,
               k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
        FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id
        WHERE z.id = $1`, [req.params.id]);
      if (!old.rows[0]) throw Object.assign(new Error('ZakĂˇzka nenalezena'), { status: 404 });
      zakazkaRow = old.rows[0];
      zakazkaRow.checklist = mergeChecklistWithTemplate(zakazkaRow.checklist, zakazkaRow.typ);

      const blockers = await getWorkflowBlockers(client, zakazkaRow, stav);
      if (blockers.length) {
        const error = new Error(`Zakazku nelze presunout do vybraneho stavu:\n- ${blockers.join('\n- ')}`);
        error.status = 400;
        throw error;
      }

      await client.query('UPDATE zakazky SET stav = $1 WHERE id = $2', [stav, req.params.id]);
      await client.query(
        `INSERT INTO zakazky_history (zakazka_id, stav_pred, stav_po, uzivatel_id, poznamka)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, old.rows[0].stav, stav, req.user.id, poznamka || null]);
    });

    // Follow-up auto-Ăşkoly (fire-and-forget)
    autoFollowup(req.params.id, stav);

    // Google Calendar sync (fire-and-forget, errors non-fatal)
    if (stav === 'potvrzeno') {
      processNotificationEvent({
        eventType: 'zakazka_confirmed',
        zakazkaId: req.params.id,
        actorId: req.user.id,
        dedupeKey: `zakazka_confirmed:${req.params.id}:${Date.now()}`,
        title: `Potvrzena zakazka: ${zakazkaRow.cislo} - ${zakazkaRow.nazev}`,
        message: `Zakazka ${zakazkaRow.cislo} (${zakazkaRow.nazev}) byla potvrzena.`,
      }).catch((err) => console.warn('[notification-rules] zakazka_confirmed chyba:', err.message));
      createVenueSnapshot(null, req.params.id, req.user.id)
        .catch(err => console.warn('[VenueTwin] snapshot chyba:', err.message));
      upsertEvent({ ...zakazkaRow, id: req.params.id })
        .catch(err => console.warn('[GoogleCalendar] stav sync chyba:', err.message));
    } else if (stav === 'stornovano' && zakazkaRow?.google_event_id) {
      deleteEvent(zakazkaRow.google_event_id)
        .catch(err => console.warn('[GoogleCalendar] delete sync chyba:', err.message));
    }

    res.json({ message: 'Stav zakĂˇzky aktualizovĂˇn', stav });
  } catch (err) { next(err); }
});

// POST /api/zakazky/:id/komando
router.post('/:id/komando', auth, requireAppModule('email'), async (req, res, next) => {
  try {
    const { poznamka, extraEmails, extra_emails, includeAssignedStaff, include_assigned_staff } = req.body || {};

    const { rows: zRows } = await query(`
      SELECT z.*, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
      FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id
      WHERE z.id = $1`, [req.params.id]);
    if (!zRows[0]) return res.status(404).json({ error: 'ZakĂˇzka nenalezena' });

    const { rows: personal } = await query(`
      SELECT zp.role_na_akci, zp.cas_prichod, zp.cas_odchod,
             p.jmeno, p.prijmeni, p.email, p.role
      FROM zakazky_personal zp
      JOIN personal p ON p.id = zp.personal_id
      WHERE zp.zakazka_id = $1`, [req.params.id]);

    const { rows: nastaveni } = await query('SELECT klic, hodnota FROM nastaveni');
    const firma = {};
    nastaveni.forEach(r => { firma[r.klic] = r.hodnota; });

    const result = await sendKomando({
      personal,
      zakazka: zRows[0],
      firma,
      poznamka,
      extraEmails: extraEmails ?? extra_emails ?? [],
      includeAssignedStaff: includeAssignedStaff ?? include_assigned_staff ?? true,
    });

    res.json({
      message: `Komando odeslĂˇno na ${result.count} adres`,
      count: result.count,
      recipients: result.recipients,
    });
  } catch (err) {
    if (err.message.includes('SMTP')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

// POST /api/zakazky/:id/dekujeme â€“ odeĹˇle dÄ›kovacĂ­ email klientovi
router.post('/:id/dekujeme', auth, requireAppModule('email'), async (req, res, next) => {
  try {
    const { to, text } = req.body;

    const { rows } = await query(`
      SELECT z.*, k.email AS klient_email, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
      FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id
      WHERE z.id = $1`, [req.params.id]);
    

    const hasCriticalChange = fields.some((field) => CRITICAL_EVENT_FIELDS.has(field))
      && fields.some((field) => previous.rows[0][field] !== rows[0][field]);

    const recipient = to || rows[0].klient_email;
    if (!recipient) return res.status(400).json({ error: 'ChybĂ­ emailovĂˇ adresa pĹ™Ă­jemce' });

    const { rows: nastaveni } = await query('SELECT klic, hodnota FROM nastaveni');
    const firma = {};
    nastaveni.forEach(r => { firma[r.klic] = r.hodnota; });

    await sendDekujeme({ to: recipient, zakazka: rows[0], firma, text });
    res.json({ message: `DÄ›kovacĂ­ e-mail odeslĂˇn na ${recipient}` });
  } catch (err) {
    if (err.message.includes('SMTP')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/zakazky/:id/personal/:pid â€“ odebrat personĂˇl ze zakĂˇzky
router.delete('/:id/personal/:pid', auth, async (req, res, next) => {
  try {
    await query('DELETE FROM zakazky_personal WHERE zakazka_id = $1 AND personal_id = $2',
      [req.params.id, req.params.pid]);
    res.json({ message: 'PersonĂˇl odebrĂˇn' });
  } catch (err) { next(err); }
});

// PATCH /api/zakazky/:id/archivovat
router.patch('/:id/archivovat', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE zakazky SET archivovano=true WHERE id=$1 RETURNING id, cislo, nazev',
      [req.params.id]);
    

    const hasCriticalChange = fields.some((field) => CRITICAL_EVENT_FIELDS.has(field))
      && fields.some((field) => previous.rows[0][field] !== rows[0][field]);
    res.json({ message: 'ZakĂˇzka archivovĂˇna', ...rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/zakazky/:id/obnovit
router.patch('/:id/obnovit', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE zakazky SET archivovano=false WHERE id=$1 RETURNING id, cislo, nazev',
      [req.params.id]);
    

    const hasCriticalChange = fields.some((field) => CRITICAL_EVENT_FIELDS.has(field))
      && fields.some((field) => previous.rows[0][field] !== rows[0][field]);
    res.json({ message: 'ZakĂˇzka obnovena', ...rows[0] });
  } catch (err) { next(err); }
});

// GET /api/zakazky/:id/podklady â€“ HTML dokument k tisku / uloĹľenĂ­ jako PDF
router.get('/:id/podklady', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT z.*,
        k.jmeno  AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
        k.email  AS klient_email, k.telefon AS klient_telefon, k.adresa AS klient_adresa,
        u.jmeno  AS obch_jmeno,   u.prijmeni AS obch_prijmeni,  u.telefon AS obch_telefon
      FROM zakazky z
      LEFT JOIN klienti k  ON k.id = z.klient_id
      LEFT JOIN uzivatele u ON u.id = z.obchodnik_id
      WHERE z.id = $1`, [req.params.id]);
    

    const hasCriticalChange = fields.some((field) => CRITICAL_EVENT_FIELDS.has(field))
      && fields.some((field) => previous.rows[0][field] !== rows[0][field]);
    const z = rows[0];

    // PersonĂˇl
    const { rows: personal } = await query(`
      SELECT zp.role_na_akci, zp.cas_prichod, zp.cas_odchod, zp.poznamka,
             p.jmeno, p.prijmeni, p.role, p.telefon
      FROM zakazky_personal zp
      JOIN personal p ON p.id = zp.personal_id
      WHERE zp.zakazka_id = $1
      ORDER BY p.role`, [req.params.id]);

    // Kalkulace â€“ nejnovÄ›jĹˇĂ­ verze s poloĹľkami
    const { rows: kalc } = await query(
      `SELECT * FROM kalkulace WHERE zakazka_id = $1 ORDER BY verze DESC LIMIT 1`,
      [req.params.id]);
    let kalcPolozky = [];
    if (kalc[0]) {
      const { rows: pol } = await query(
        `SELECT * FROM kalkulace_polozky WHERE kalkulace_id = $1 ORDER BY kategorie, poradi`,
        [kalc[0].id]);
      kalcPolozky = pol;
    }
    const kalkulace = kalc[0] || null;

    // Firma (nastavenĂ­)
    const { rows: nastaveni } = await query('SELECT klic, hodnota FROM nastaveni');
    const firma = {};
    nastaveni.forEach(r => { firma[r.klic] = r.hodnota; });

    // PomocnĂ© formĂˇtovacĂ­ funkce (server-side)
    const fDate = (d) => d ? new Date(d).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const fTime = (t) => t ? t.slice(0, 5) : '';
    const fMoney = (n) => n != null ? Number(n).toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }) : '';
    const typMap = { svatba: 'Svatba', soukroma_akce: 'SoukromĂˇ akce', firemni_akce: 'FiremnĂ­ akce', zavoz: 'ZĂˇvoz', bistro: 'Bistro' };
    const stavMap = { nova_poptavka: 'NovĂˇ poptĂˇvka', rozpracovano: 'RozpracovĂˇno', nabidka_pripravena: 'NabĂ­dka pĹ™ipravena', nabidka_odeslana: 'NabĂ­dka odeslĂˇna', ceka_na_vyjadreni: 'ÄŚekĂˇ na vyjĂˇdĹ™enĂ­', potvrzeno: 'Potvrzeno', ve_priprave: 'Ve pĹ™Ă­pravÄ›', realizovano: 'RealizovĂˇno', uzavreno: 'UzavĹ™eno', stornovano: 'StornovĂˇno' };
    const rolMap = { koordinator: 'KoordinĂˇtor', cisnik: 'ÄŚĂ­ĹˇnĂ­k', kuchar: 'KuchaĹ™', ridic: 'ĹidiÄŤ', barman: 'Barman', pomocna_sila: 'PomocnĂˇ sĂ­la' };
    const katMap = { jidlo: 'JĂ­dlo', napoje: 'NĂˇpoje', personal: 'PersonĂˇl', doprava: 'Doprava', vybaveni: 'VybavenĂ­', pronajem: 'PronĂˇjem', externi: 'ExternĂ­' };

    const klientNazev = z.klient_firma || [z.klient_jmeno, z.klient_prijmeni].filter(Boolean).join(' ') || 'â€”';
    const obchodnikNazev = [z.obch_jmeno, z.obch_prijmeni].filter(Boolean).join(' ') || 'â€”';

    // Skupiny poloĹľek kalkulace
    const skupiny = {};
    for (const p of kalcPolozky) {
      if (!skupiny[p.kategorie]) skupiny[p.kategorie] = [];
      skupiny[p.kategorie].push(p);
    }
    const polozkyRows = Object.entries(skupiny).map(([kat, items]) => {
      const katHeader = `<tr style="background:#f5f5f0"><td colspan="5" style="padding:6px 8px;font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.5px">${katMap[kat] || kat}</td></tr>`;
      const itemRows = items.map(p => {
        const radek = (p.mnozstvi * p.cena_prodej);
        return `<tr>
          <td style="padding:5px 8px;font-size:12px">${p.nazev}</td>
          <td style="padding:5px 8px;font-size:12px;text-align:right">${Number(p.mnozstvi).toLocaleString('cs-CZ')}</td>
          <td style="padding:5px 8px;font-size:12px">${p.jednotka}</td>
          <td style="padding:5px 8px;font-size:12px;text-align:right">${fMoney(p.cena_prodej)}</td>
          <td style="padding:5px 8px;font-size:12px;text-align:right;font-weight:600">${fMoney(radek)}</td>
        </tr>`;
      }).join('');
      return katHeader + itemRows;
    }).join('');

    const personalRows = personal.map(p => `
      <tr>
        <td style="padding:5px 8px;font-size:12px">${p.jmeno} ${p.prijmeni}</td>
        <td style="padding:5px 8px;font-size:12px">${rolMap[p.role] || p.role}${p.role_na_akci ? `  ${p.role_na_akci}` : ''}</td>
        <td style="padding:5px 8px;font-size:12px;text-align:center">${fTime(p.cas_prichod)} â€“ ${fTime(p.cas_odchod)}</td>
        <td style="padding:5px 8px;font-size:12px">${p.telefon || 'â€”'}</td>
        <td style="padding:5px 8px;font-size:12px;color:#666">${p.poznamka || ''}</td>
      </tr>`).join('');

    const totalProdej = kalcPolozky.reduce((s, p) => s + p.mnozstvi * p.cena_prodej, 0);
    const totalNakup  = kalcPolozky.reduce((s, p) => s + p.mnozstvi * p.cena_nakup, 0);
    const marze = totalProdej > 0 ? ((totalProdej - totalNakup) / totalProdej * 100).toFixed(1) : '';

    const html = `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>Podklady k fakturaci â€“ ${z.cislo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #222; background: #fff; }
  @page { margin: 18mm 15mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } }
  .page { max-width: 800px; margin: 0 auto; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #222; padding-bottom: 14px; margin-bottom: 20px; }
  .firma-name { font-size: 18px; font-weight: 800; letter-spacing: -0.3px; }
  .firma-sub { font-size: 11px; color: #666; margin-top: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 16px; font-weight: 700; }
  .doc-title .cislo { font-size: 11px; color: #666; margin-top: 2px; }
  .doc-title .datum { font-size: 11px; color: #999; }
  .section { margin-bottom: 22px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #888; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; margin-bottom: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .info-block { background: #f9f9f7; border-radius: 6px; padding: 12px 14px; }
  .info-block .label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px; }
  .info-block .value { font-size: 13px; font-weight: 600; }
  .info-block .sub { font-size: 11px; color: #666; margin-top: 2px; }
  .highlight { background: #f0f0eb; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #222; color: #fff; padding: 7px 8px; font-size: 11px; text-align: left; font-weight: 600; }
  th.right { text-align: right; }
  tr:nth-child(even) td { background: #fafafa; }
  .total-row td { font-weight: 700; border-top: 2px solid #222; background: #f5f5f0 !important; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; background: #222; color: #fff; }
  .poznamka-box { background: #fffbeb; border: 1px solid #f0e0a0; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #555; margin-top: 6px; }
  .footer { margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 12px; font-size: 10px; color: #aaa; display: flex; justify-content: space-between; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #222; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; z-index: 100; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Tisk / UloĹľit PDF</button>
<div class="page">

  <!-- HlaviÄŤka -->
  <div class="header">
    <div>
      <div class="firma-name">${firma.firma_nazev || 'Catering LD'}</div>
      <div class="firma-sub">${firma.firma_adresa || ''}</div>
      <div class="firma-sub">IO: ${firma.firma_ico || ''}${firma.firma_dic ? ' | DI: ' + firma.firma_dic : ''}</div>
    </div>
    <div class="doc-title">
      <h1>Podklady k fakturaci</h1>
      <div class="cislo">${z.cislo}</div>
      <div class="datum">VygenerovĂˇno: ${fDate(new Date())}</div>
    </div>
  </div>

  <!-- ZĂˇkladnĂ­ informace -->
  <div class="section">
    <div class="section-title">ZakĂˇzka</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="info-block highlight">
        <div class="label">NĂˇzev akce</div>
        <div class="value" style="font-size:14px">${z.nazev}</div>
        <div class="sub">${typMap[z.typ] || z.typ} &nbsp;Â·&nbsp; <span class="badge">${stavMap[z.stav] || z.stav}</span></div>
      </div>
      <div class="info-block">
        <div class="label">Datum akce</div>
        <div class="value">${fDate(z.datum_akce)}</div>
        <div class="sub">${fTime(z.cas_zacatek)} â€“ ${fTime(z.cas_konec)}</div>
      </div>
      <div class="info-block">
        <div class="label">MĂ­sto konĂˇnĂ­</div>
        <div class="value" style="font-size:12px">${z.misto || 'â€”'}</div>
      </div>
      <div class="info-block">
        <div class="label">PoÄŤet hostĹŻ</div>
        <div class="value" style="font-size:20px">${z.pocet_hostu || 'â€”'}</div>
        <div class="sub">osob</div>
      </div>
    </div>
  </div>

  <!-- Klient + ObchodnĂ­k -->
  <div class="section">
    <div class="grid2">
      <div>
        <div class="section-title">Klient</div>
        <div class="info-block">
          <div class="value">${klientNazev}</div>
          ${z.klient_email ? `<div class="sub">${z.klient_email}</div>` : ''}
          ${z.klient_telefon ? `<div class="sub">${z.klient_telefon}</div>` : ''}
          ${z.klient_adresa ? `<div class="sub">${z.klient_adresa}</div>` : ''}
        </div>
      </div>
      <div>
        <div class="section-title">KoordinĂˇtor / ObchodnĂ­k</div>
        <div class="info-block">
          <div class="value">${obchodnikNazev}</div>
          ${z.obch_telefon ? `<div class="sub">${z.obch_telefon}</div>` : ''}
        </div>
      </div>
    </div>
  </div>

  ${kalcPolozky.length > 0 ? `
  <!-- Kalkulace -->
  <div class="section">
    <div class="section-title">Kalkulace${kalkulace ? `  ${kalkulace.nazev || 'Verze ' + kalkulace.verze}` : ''}</div>
    <table>
      <thead>
        <tr>
          <th>PoloĹľka</th>
          <th class="right" style="width:70px">MnoĹľstvĂ­</th>
          <th style="width:50px">Jedn.</th>
          <th class="right" style="width:90px">Cena/jedn.</th>
          <th class="right" style="width:100px">Celkem</th>
        </tr>
      </thead>
      <tbody>
        ${polozkyRows}
        <tr class="total-row">
          <td colspan="3" style="padding:7px 8px;font-size:12px">CELKEM BEZ DPH</td>
          <td style="padding:7px 8px;font-size:12px;text-align:right;color:#666">MarĹľe: ${marze}%</td>
          <td style="padding:7px 8px;font-size:13px;text-align:right">${fMoney(totalProdej)}</td>
        </tr>
      </tbody>
    </table>
    ${z.rozpocet_klienta ? `<div style="text-align:right;font-size:11px;color:#888;margin-top:6px">Rozpo
et klienta: ${fMoney(z.rozpocet_klienta)}</div>` : ''}
  </div>` : '<div class="section"><div class="section-title">Kalkulace</div><p style="color:#aaa;font-size:12px">Ke zakĂˇzce nenĂ­ pĹ™iĹ™azena ĹľĂˇdnĂˇ kalkulace.</p></div>'}

  ${personal.length > 0 ? `
  <!-- PersonĂˇl -->
  <div class="section">
    <div class="section-title">PersonĂˇl na akci</div>
    <table>
      <thead>
        <tr>
          <th>JmĂ©no</th>
          <th>Role</th>
          <th style="width:120px;text-align:center">PĹ™Ă­chod â€“ Odchod</th>
          <th style="width:120px">Telefon</th>
          <th>PoznĂˇmka</th>
        </tr>
      </thead>
      <tbody>${personalRows}</tbody>
    </table>
  </div>` : ''}

  ${z.poznamka_klient || z.poznamka_interni ? `
  <!-- PoznĂˇmky -->
  <div class="section">
    <div class="grid2">
      ${z.poznamka_klient ? `<div><div class="section-title">Poznďż˝mka klienta</div><div class="poznamka-box">${z.poznamka_klient}</div></div>` : '<div></div>'}
      ${z.poznamka_interni ? `<div><div class="section-title">Internďż˝ poznďż˝mka</div><div class="poznamka-box" style="background:#f0f4ff;border-color:#c0d0f0">${z.poznamka_interni}</div></div>` : ''}
    </div>
  </div>` : ''}

  <!-- FinanÄŤnĂ­ souhrn -->
  <div class="section">
    <div class="section-title">FinanÄŤnĂ­ souhrn</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      <div class="info-block highlight">
        <div class="label">Cena celkem</div>
        <div class="value" style="font-size:15px">${fMoney(z.cena_celkem || totalProdej || null)}</div>
      </div>
      <div class="info-block">
        <div class="label">NĂˇklady</div>
        <div class="value" style="font-size:15px">${fMoney(z.cena_naklady || totalNakup || null)}</div>
      </div>
      <div class="info-block">
        <div class="label">ZĂˇloha</div>
        <div class="value" style="font-size:15px">${fMoney(z.zaloha)}</div>
      </div>
      <div class="info-block">
        <div class="label">Doplatek</div>
        <div class="value" style="font-size:15px">${fMoney(z.doplatek)}</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>${firma.firma_nazev || 'Catering LD'} &nbsp;Â·&nbsp; ${firma.firma_email || ''} &nbsp;Â·&nbsp; ${firma.firma_telefon || ''}</span>
    <span>Dokument vygenerovĂˇn ${new Date().toLocaleString('cs-CZ')} &nbsp;Â·&nbsp; ${z.cislo}</span>
  </div>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

// GET /api/zakazky/:id/dodaci-list
router.get('/:id/dodaci-list', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT z.*,
        k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
        k.email AS klient_email, k.telefon AS klient_telefon, k.adresa AS klient_adresa,
        u.jmeno AS obch_jmeno, u.prijmeni AS obch_prijmeni,
        v.name AS venue_name, v.address_line_1 AS venue_address_line_1, v.address_line_2 AS venue_address_line_2,
        v.city AS venue_city, v.postal_code AS venue_postal_code, v.country AS venue_country
      FROM zakazky z
      LEFT JOIN klienti k ON k.id = z.klient_id
      LEFT JOIN uzivatele u ON u.id = z.obchodnik_id
      LEFT JOIN venues v ON v.id = z.venue_id
      WHERE z.id = $1
    `, [req.params.id]);

    

    const hasCriticalChange = fields.some((field) => CRITICAL_EVENT_FIELDS.has(field))
      && fields.some((field) => previous.rows[0][field] !== rows[0][field]);
    const z = rows[0];

    const esc = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const fDate = (value) => value
      ? new Date(value).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'â€”';
    const fTime = (value) => value ? String(value).slice(0, 5) : 'â€”';

    const klientNazev = z.klient_firma || [z.klient_jmeno, z.klient_prijmeni].filter(Boolean).join(' ') || 'â€”';
    const venueNazev = z.venue_name || z.misto || 'â€”';
    const venueAdresa = [
      z.venue_address_line_1,
      z.venue_address_line_2,
      [z.venue_postal_code, z.venue_city].filter(Boolean).join(' '),
      z.venue_country,
    ].filter(Boolean).join(', ');

    const { rows: nabidkaRows } = await query(`
      SELECT n.id, n.nazev,
        COALESCE(
          json_agg(json_build_object(
            'nazev', p.nazev,
            'mnozstvi', p.mnozstvi,
            'jednotka', p.jednotka,
            'cena_celkem', p.cena_celkem
          ) ORDER BY p.poradi, p.id) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) AS polozky
      FROM nabidky n
      LEFT JOIN nabidky_polozky p ON p.nabidka_id = n.id
      WHERE n.zakazka_id = $1 AND n.aktivni = true
      GROUP BY n.id
      LIMIT 1
    `, [req.params.id]);

    const nabidka = nabidkaRows[0] || null;
    const brief = await buildVenueBriefForZakazka(null, req.params.id).catch(() => null);

    const firma = await loadFirmaSettings();
    const documentBranding = resolveDocumentBranding(firma);

    const items = Array.isArray(nabidka?.polozky) ? nabidka.polozky : [];
    const itemsRows = items.length
      ? items.map((item) => `
          <tr>
            <td>${esc(item.nazev)}</td>
            <td class="right">${esc(item.mnozstvi)}</td>
            <td>${esc(item.jednotka || 'ks')}</td>
            <td class="right">${item.cena_celkem != null ? new Intl.NumberFormat('cs-CZ').format(item.cena_celkem) + ' KÄŤ' : 'â€”'}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="4" class="muted">PoloĹľky nejsou zatĂ­m vyplnÄ›nĂ©. DodacĂ­ list slouĹľĂ­ jako provoznĂ­ podklad a potvrzenĂ­ pĹ™edĂˇnĂ­.</td></tr>`;

    const logisticsRows = [
      ['MĂ­sto akce', venueNazev],
      ['Adresa venue', venueAdresa || z.misto || 'â€”'],
      ['PĹ™Ă­jezdovĂ© okno', brief?.access_rule?.delivery_window || 'â€”'],
      ['Check-in point', brief?.access_rule?.check_in_point || 'â€”'],
      ['Security buffer', brief?.risk_summary?.expected_security_delay_minutes != null ? `${brief.risk_summary.expected_security_delay_minutes} min` : 'â€”'],
      ['Loading instrukce', brief?.loading_zone?.arrival_instructions || 'â€”'],
      ['Trasa do servisnĂ­ zĂłny', brief?.route?.name || 'â€”'],
      ['Odhad unload -> room', brief?.risk_summary?.expected_unload_to_room_minutes != null ? `${brief.risk_summary.expected_unload_to_room_minutes} min` : 'â€”'],
      ['ParkovĂˇnĂ­', brief?.parking_summary || 'â€”'],
    ].map(([label, value]) => `
      <tr>
        <td class="label-cell">${esc(label)}</td>
        <td>${esc(value || 'â€”')}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DodacĂ­ list ${esc(z.cislo)}</title>
  <style>
    @import url('${esc(documentBranding.fontImportUrl)}');
    body { font-family: ${documentBranding.fontFamily}; color:#1f2937; margin:0; background:${documentBranding.soft}; }
    .page { max-width: 980px; margin: 24px auto; background:#fff; padding:32px; box-shadow:0 8px 24px rgba(0,0,0,.06); }
    .header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; margin-bottom:24px; }
    .title { font-size:28px; font-weight:700; margin:0 0 6px; }
    .subtitle { color:#6b7280; font-size:13px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px; }
    .card { border:1px solid #e7e5e4; border-radius:14px; padding:16px; }
    .section-title { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#78716c; font-weight:700; margin-bottom:10px; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; border-bottom:1px solid #e7e5e4; font-size:14px; vertical-align:top; }
    th { text-align:left; font-size:12px; color:#78716c; text-transform:uppercase; letter-spacing:.05em; background:#fafaf9; }
    .right { text-align:right; }
    .muted { color:#78716c; }
    .label-cell { width:220px; color:#57534e; font-weight:600; background:#fafaf9; }
    .signature-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:24px; }
    .signature { border:1px solid #e7e5e4; border-radius:14px; padding:18px; min-height:130px; }
    .signature-line { border-bottom:1px solid #a8a29e; margin-top:48px; }
    .notes { white-space:pre-wrap; font-size:14px; line-height:1.6; }
    @media print {
      body { background:#fff; }
      .page { box-shadow:none; margin:0; max-width:none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        ${documentBranding.logoDataUrl ? `<div style="width:68px;height:68px;border-radius:20px;overflow:hidden;background:${documentBranding.soft};display:flex;align-items:center;justify-content:center;margin-bottom:12px"><img src="${esc(documentBranding.logoDataUrl)}" alt="Logo" style="width:100%;height:100%;object-fit:contain"></div>` : ''}
        <h1 class="title">DodacĂ­ list</h1>
        <div class="subtitle">ZakĂˇzka ${esc(z.cislo)} | ${esc(z.nazev)}</div>
      </div>
      <div class="subtitle" style="text-align:right">
        <div><strong>${esc(firma.firma_nazev || 'Catering LD')}</strong></div>
        ${firma.firma_adresa ? `<div>${esc(firma.firma_adresa)}</div>` : ''}
        ${firma.firma_email ? `<div>${esc(firma.firma_email)}</div>` : ''}
        ${firma.firma_telefon ? `<div>${esc(firma.firma_telefon)}</div>` : ''}
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="section-title">OdbÄ›ratel / klient</div>
        <div><strong>${esc(klientNazev)}</strong></div>
        ${z.klient_email ? `<div class="muted">${esc(z.klient_email)}</div>` : ''}
        ${z.klient_telefon ? `<div class="muted">${esc(z.klient_telefon)}</div>` : ''}
        ${z.klient_adresa ? `<div class="muted">${esc(z.klient_adresa)}</div>` : ''}
      </div>
      <div class="card">
        <div class="section-title">Souhrn akce</div>
        <div><strong>Datum:</strong> ${esc(fDate(z.datum_akce))}</div>
        <div><strong>ÄŚas:</strong> ${esc(fTime(z.cas_zacatek))} - ${esc(fTime(z.cas_konec))}</div>
        <div><strong>Typ akce:</strong> ${esc(z.typ || 'â€”')}</div>
        <div><strong>PoÄŤet hostĹŻ:</strong> ${esc(z.pocet_hostu || 'â€”')}</div>
        <div><strong>KoordinĂˇtor:</strong> ${esc([z.obch_jmeno, z.obch_prijmeni].filter(Boolean).join(' ') || 'â€”')}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div class="section-title">Logistika doruÄŤenĂ­</div>
      <table>
        <tbody>${logisticsRows}</tbody>
      </table>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div class="section-title">DodĂˇvanĂ© poloĹľky / sluĹľby</div>
      <table>
        <thead>
          <tr>
            <th>PoloĹľka</th>
            <th class="right">MnoĹľstvĂ­</th>
            <th>Jednotka</th>
            <th class="right">Cena</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
    </div>

    <div class="grid">
      <div class="card">
        <div class="section-title">Rozsah sluĹľeb</div>
        <div class="notes">${esc(z.rozsah_sluzeb || 'NenĂ­ vyplnÄ›no.')}</div>
      </div>
      <div class="card">
        <div class="section-title">PoznĂˇmky pro pĹ™edĂˇnĂ­</div>
        <div class="notes">${esc(z.poznamka_klient || z.poznamka_interni || 'Bez doplĹujĂ­cĂ­ch poznĂˇmek.')}</div>
      </div>
    </div>

    <div class="signature-grid">
      <div class="signature">
        <div class="section-title">PĹ™edal</div>
        <div class="muted">JmĂ©no a podpis</div>
        <div class="signature-line"></div>
        <div class="muted" style="margin-top:10px;">Datum a ÄŤas: ____________________</div>
      </div>
      <div class="signature">
        <div class="section-title">PĹ™evzal</div>
        <div class="muted">JmĂ©no a podpis</div>
        <div class="signature-line"></div>
        <div class="muted" style="margin-top:10px;">Datum a ÄŤas: ____________________</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

// GET /api/zakazky/:id/ingredient-summary
router.get('/:id/ingredient-summary', auth, async (req, res, next) => {
  try {
    const summary = await aggregateIngredientsForZakazka(req.params.id);
    res.json(summary);
  } catch (err) { next(err); }
});

// GET /api/zakazky/:id/venue-brief
router.get('/:id/venue-brief', auth, async (req, res, next) => {
  try {
    const brief = await buildVenueBriefForZakazka(null, req.params.id);
    res.json(brief);
  } catch (err) { next(err); }
});

// POST /api/zakazky/:id/venue-snapshot
router.post('/:id/venue-snapshot', auth, async (req, res, next) => {
  try {
    const snapshot = await createVenueSnapshot(null, req.params.id, req.user.id);
    if (!snapshot) return res.status(400).json({ error: 'Zakazka nema prirazene venue' });
    res.status(201).json(snapshot);
  } catch (err) { next(err); }
});

// POST /api/zakazky/:id/venue-debrief
router.post('/:id/venue-debrief', auth, async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => submitVenueDebrief(client, req.params.id, req.body || {}, req.user.id));
    processNotificationEvent({
      eventType: 'venue_debrief_submitted',
      zakazkaId: req.params.id,
      actorId: req.user.id,
      dedupeKey: `venue_debrief_submitted:${req.params.id}:${Date.now()}`,
      title: `Venue debrief vyplnen: ${req.params.id}`,
      message: 'Byl vyplnen venue debrief a ulozena nova pozorovani.',
    }).catch((err) => console.warn('[notification-rules] venue_debrief_submitted chyba:', err.message));
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// DELETE /api/zakazky/:id (pouze admin)
router.delete('/:id', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM zakazky WHERE id = $1 RETURNING id', [req.params.id]);
    

    const hasCriticalChange = fields.some((field) => CRITICAL_EVENT_FIELDS.has(field))
      && fields.some((field) => previous.rows[0][field] !== rows[0][field]);
    res.json({ message: 'ZakĂˇzka smazĂˇna' });
  } catch (err) { next(err); }
});

module.exports = router;

