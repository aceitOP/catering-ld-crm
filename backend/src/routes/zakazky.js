const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { sendKomando, sendDekujeme } = require('../emailService');
const { createNotif } = require('../notifHelper');
const { upsertEvent, deleteEvent } = require('../googleCalendar');

// Generátor čísla zakázky
async function genCislo() {
  const rok = new Date().getFullYear();
  const { rows } = await query(
    `SELECT cislo FROM zakazky WHERE cislo LIKE $1 ORDER BY cislo DESC LIMIT 1`,
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
    if (q && q.length > 200) return res.status(400).json({ error: 'Hledaný výraz je příliš dlouhý' });
    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 200);
    const safePage  = Math.max(parseInt(page) || 1, 1);

    const where = [];
    const params = [];
    let p = 1;

    if (stav)         { where.push(`z.stav = $${p++}`);                  params.push(stav); }
    else              { where.push(`z.stav != 'nova_poptavka'`); }
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
             COUNT(*) OVER() AS total_count
      FROM zakazky z
      LEFT JOIN klienti k ON k.id = z.klient_id
      LEFT JOIN uzivatele u ON u.id = z.obchodnik_id
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
             u.jmeno AS obchodnik_jmeno, u.prijmeni AS obchodnik_prijmeni
      FROM zakazky z
      LEFT JOIN klienti k ON k.id = z.klient_id
      LEFT JOIN uzivatele u ON u.id = z.obchodnik_id
      WHERE z.id = $1`, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Zakázka nenalezena' });

    // Historie stavů
    const history = await query(`
      SELECT zh.*, u.jmeno, u.prijmeni FROM zakazky_history zh
      LEFT JOIN uzivatele u ON u.id = zh.uzivatel_id
      WHERE zh.zakazka_id = $1 ORDER BY zh.created_at ASC LIMIT 200`, [req.params.id]);

    // Personál
    const personal = await query(`
      SELECT zp.*, p.jmeno, p.prijmeni, p.role, p.telefon, p.email
      FROM zakazky_personal zp
      JOIN personal p ON p.id = zp.personal_id
      WHERE zp.zakazka_id = $1`, [req.params.id]);

    // Dokumenty
    const dokumenty = await query(
      'SELECT * FROM dokumenty WHERE zakazka_id = $1 ORDER BY created_at DESC',
      [req.params.id]);

    // Nabídka (aktivní) s položkami pro Komando
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

    res.json({ ...rows[0], history: history.rows, personal: personal.rows, dokumenty: dokumenty.rows, nabidka });
  } catch (err) { next(err); }
});

// POST /api/zakazky
router.post('/', auth, async (req, res, next) => {
  try {
    const cislo = await genCislo();
    const { nazev, typ, klient_id, obchodnik_id, datum_akce, cas_zacatek, cas_konec,
            misto, pocet_hostu, rozpocet_klienta, poznamka_klient, poznamka_interni } = req.body;

    const { rows } = await query(`
      INSERT INTO zakazky (cislo, nazev, typ, klient_id, obchodnik_id, datum_akce,
        cas_zacatek, cas_konec, misto, pocet_hostu, rozpocet_klienta, poznamka_klient, poznamka_interni)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [cislo, nazev, typ, klient_id, obchodnik_id || req.user.id, datum_akce,
       cas_zacatek, cas_konec, misto, pocet_hostu, rozpocet_klienta, poznamka_klient, poznamka_interni]);

    // Záznam do historie
    await query(`INSERT INTO zakazky_history (zakazka_id, stav_po, uzivatel_id, poznamka)
                 VALUES ($1, 'nova_poptavka', $2, 'Zakázka vytvořena')`,
      [rows[0].id, req.user.id]);

    createNotif({
      typ: 'nova_zakazka',
      titulek: `Nová zakázka — ${rows[0].nazev}`,
      zprava: `Číslo: ${rows[0].cislo}${misto ? ` · Místo: ${misto}` : ''}`,
      odkaz: `/zakazky/${rows[0].id}`,
    });

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/zakazky/:id
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['nazev','typ','klient_id','obchodnik_id','datum_akce','cas_zacatek',
                     'cas_konec','misto','pocet_hostu','rozpocet_klienta','cena_celkem',
                     'cena_naklady','zaloha','doplatek','poznamka_klient','poznamka_interni',
                     'google_event_id'];

    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'Žádná platná pole k aktualizaci' });

    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const vals = fields.map(f => req.body[f]);

    const { rows } = await query(
      `UPDATE zakazky SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...vals]);

    if (!rows[0]) return res.status(404).json({ error: 'Zakázka nenalezena' });

    // Google Calendar sync: update event if zakázka is confirmed and has an event
    if (rows[0].google_event_id && rows[0].stav === 'potvrzeno') {
      const { rows: full } = await query(`
        SELECT z.*, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
        FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id WHERE z.id = $1`, [req.params.id]);
      upsertEvent(full[0]).catch(err => console.warn('[GoogleCalendar] PATCH sync chyba:', err.message));
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/zakazky/:id/stav – změna stavu s historií
router.patch('/:id/stav', auth, async (req, res, next) => {
  try {
    const { stav, poznamka } = req.body;
    const validStavy = ['nova_poptavka','rozpracovano','nabidka_pripravena','nabidka_odeslana',
                        'ceka_na_vyjadreni','potvrzeno','ve_priprave','realizovano','uzavreno','stornovano'];
    if (!validStavy.includes(stav)) {
      return res.status(400).json({ error: 'Neplatný stav zakázky' });
    }

    let zakazkaRow = null;
    await withTransaction(async (client) => {
      const old = await client.query(`
        SELECT z.stav, z.google_event_id, z.datum_akce, z.cas_zacatek, z.cas_konec,
               z.misto, z.pocet_hostu, z.cena_celkem, z.nazev, z.cislo, z.typ, z.id,
               z.poznamka_interni,
               k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
        FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id
        WHERE z.id = $1`, [req.params.id]);
      if (!old.rows[0]) throw Object.assign(new Error('Zakázka nenalezena'), { status: 404 });
      zakazkaRow = old.rows[0];

      await client.query('UPDATE zakazky SET stav = $1 WHERE id = $2', [stav, req.params.id]);
      await client.query(
        `INSERT INTO zakazky_history (zakazka_id, stav_pred, stav_po, uzivatel_id, poznamka)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, old.rows[0].stav, stav, req.user.id, poznamka || null]);
    });

    // Google Calendar sync (fire-and-forget, errors non-fatal)
    if (stav === 'potvrzeno') {
      upsertEvent({ ...zakazkaRow, id: req.params.id })
        .catch(err => console.warn('[GoogleCalendar] stav sync chyba:', err.message));
    } else if (stav === 'stornovano' && zakazkaRow?.google_event_id) {
      deleteEvent(zakazkaRow.google_event_id)
        .catch(err => console.warn('[GoogleCalendar] delete sync chyba:', err.message));
    }

    res.json({ message: 'Stav zakázky aktualizován', stav });
  } catch (err) { next(err); }
});

// POST /api/zakazky/:id/komando – odešle komando email přiřazenému personálu
router.post('/:id/komando', auth, async (req, res, next) => {
  try {
    const { poznamka } = req.body;

    // Načti zakázku
    const { rows: zRows } = await query(`
      SELECT z.*, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
      FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id
      WHERE z.id = $1`, [req.params.id]);
    if (!zRows[0]) return res.status(404).json({ error: 'Zakázka nenalezena' });

    // Načti personál
    const { rows: personal } = await query(`
      SELECT zp.role_na_akci, zp.cas_prichod, zp.cas_odchod,
             p.jmeno, p.prijmeni, p.email, p.role
      FROM zakazky_personal zp
      JOIN personal p ON p.id = zp.personal_id
      WHERE zp.zakazka_id = $1`, [req.params.id]);

    // Načti nastavení firmy
    const { rows: nastaveni } = await query('SELECT klic, hodnota FROM nastaveni');
    const firma = {};
    nastaveni.forEach(r => { firma[r.klic] = r.hodnota; });

    const count = await sendKomando({ personal, zakazka: zRows[0], firma, poznamka });
    res.json({ message: `Komando odesláno ${count} osobám` });
  } catch (err) {
    if (err.message.includes('SMTP')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

// POST /api/zakazky/:id/dekujeme – odešle děkovací email klientovi
router.post('/:id/dekujeme', auth, async (req, res, next) => {
  try {
    const { to, text } = req.body;

    const { rows } = await query(`
      SELECT z.*, k.email AS klient_email, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
      FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id
      WHERE z.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Zakázka nenalezena' });

    const recipient = to || rows[0].klient_email;
    if (!recipient) return res.status(400).json({ error: 'Chybí emailová adresa příjemce' });

    const { rows: nastaveni } = await query('SELECT klic, hodnota FROM nastaveni');
    const firma = {};
    nastaveni.forEach(r => { firma[r.klic] = r.hodnota; });

    await sendDekujeme({ to: recipient, zakazka: rows[0], firma, text });
    res.json({ message: `Děkovací email odeslán na ${recipient}` });
  } catch (err) {
    if (err.message.includes('SMTP')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/zakazky/:id/personal/:pid – odebrat personál ze zakázky
router.delete('/:id/personal/:pid', auth, async (req, res, next) => {
  try {
    await query('DELETE FROM zakazky_personal WHERE zakazka_id = $1 AND personal_id = $2',
      [req.params.id, req.params.pid]);
    res.json({ message: 'Personál odebrán' });
  } catch (err) { next(err); }
});

// DELETE /api/zakazky/:id (pouze admin)
router.delete('/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM zakazky WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Zakázka nenalezena' });
    res.json({ message: 'Zakázka smazána' });
  } catch (err) { next(err); }
});

module.exports = router;
