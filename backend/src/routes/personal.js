'use strict';
const express = require('express');
const { query } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');

const router = express.Router();

const ABSENCE_TYPES = new Set(['dovolena', 'nemoc', 'blokace', 'jina_akce', 'jine']);

function normalizeNullable(value) {
  return value === undefined || value === '' ? null : value;
}

function normalizeAbsenceType(value) {
  return ABSENCE_TYPES.has(value) ? value : 'dovolena';
}

function formatTime(value) {
  if (!value) return null;
  return String(value).slice(0, 5);
}

function isTimeOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart < bEnd && aEnd > bStart;
}

function describeAbsence(row) {
  const range = row.datum_od === row.datum_do
    ? row.datum_od
    : `${row.datum_od} - ${row.datum_do}`;
  const times = row.cas_od || row.cas_do ? ` ${formatTime(row.cas_od) || '00:00'}-${formatTime(row.cas_do) || '23:59'}` : '';
  return `${row.typ || 'nedostupnost'} ${range}${times}${row.poznamka ? `: ${row.poznamka}` : ''}`;
}

async function loadEventWindow({ zakazka_id, datum, cas_od, cas_do }) {
  if (!zakazka_id) {
    return {
      zakazka_id: null,
      datum: normalizeNullable(datum),
      cas_od: normalizeNullable(cas_od),
      cas_do: normalizeNullable(cas_do),
    };
  }

  const { rows } = await query(
    'SELECT id, datum_akce, cas_zacatek, cas_konec FROM zakazky WHERE id = $1',
    [zakazka_id]
  );
  const z = rows[0] || {};
  return {
    zakazka_id,
    datum: normalizeNullable(datum) || z.datum_akce,
    cas_od: normalizeNullable(cas_od) || z.cas_zacatek,
    cas_do: normalizeNullable(cas_do) || z.cas_konec,
  };
}

async function buildAvailabilityMap(personalIds, eventWindow) {
  const ids = [...new Set((personalIds || []).map(Number).filter(Boolean))];
  const map = new Map(ids.map((id) => [id, { available: true, conflicts: [] }]));
  const eventDate = eventWindow?.datum;
  if (ids.length === 0 || !eventDate) return map;

  const absenceRes = await query(
    `SELECT id, personal_id, datum_od::text, datum_do::text, cas_od::text, cas_do::text, typ, poznamka
     FROM personal_absence
     WHERE personal_id = ANY($1::int[])
       AND datum_od <= $2::date
       AND datum_do >= $2::date
     ORDER BY datum_od, cas_od NULLS FIRST`,
    [ids, eventDate]
  );

  for (const absence of absenceRes.rows) {
    if (!isTimeOverlap(eventWindow.cas_od, eventWindow.cas_do, absence.cas_od, absence.cas_do)) continue;
    const item = map.get(absence.personal_id);
    if (!item) continue;
    item.available = false;
    item.conflicts.push({
      type: 'absence',
      label: describeAbsence(absence),
      absence,
    });
  }

  const assignmentRes = await query(
    `SELECT zp.personal_id, zp.zakazka_id, zp.cas_prichod::text, zp.cas_odchod::text,
            z.cislo, z.nazev, z.datum_akce::text, z.cas_zacatek::text, z.cas_konec::text
     FROM zakazky_personal zp
     JOIN zakazky z ON z.id = zp.zakazka_id
     WHERE zp.personal_id = ANY($1::int[])
       AND z.datum_akce = $2::date
       AND ($3::int IS NULL OR z.id <> $3::int)`,
    [ids, eventDate, eventWindow.zakazka_id || null]
  );

  for (const assignment of assignmentRes.rows) {
    const existingStart = assignment.cas_prichod || assignment.cas_zacatek;
    const existingEnd = assignment.cas_odchod || assignment.cas_konec;
    if (!isTimeOverlap(eventWindow.cas_od, eventWindow.cas_do, existingStart, existingEnd)) continue;
    const item = map.get(assignment.personal_id);
    if (!item) continue;
    item.available = false;
    item.conflicts.push({
      type: 'assignment',
      label: `Již přiřazen na ${assignment.cislo || 'zakázku'} ${assignment.nazev || ''}`.trim(),
      zakazka_id: assignment.zakazka_id,
      assignment,
    });
  }

  return map;
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { typ, role, q, zakazka_id, datum, cas_od, cas_do } = req.query;
    const where = []; const params = []; let p = 1;
    if (typ)  { where.push(`typ = $${p++}`);  params.push(typ); }
    if (role) { where.push(`role = $${p++}`); params.push(role); }
    if (q)    { where.push(`(jmeno ILIKE $${p} OR prijmeni ILIKE $${p})`); params.push(`%${q}%`); p++; }
    where.push('archivovano = false');
    const wc = 'WHERE ' + where.join(' AND ');
    const { rows } = await query(`SELECT * FROM personal ${wc} ORDER BY jmeno, prijmeni`, params);
    const eventWindow = await loadEventWindow({ zakazka_id, datum, cas_od, cas_do });
    const availability = await buildAvailabilityMap(rows.map((row) => row.id), eventWindow);
    res.json({
      data: rows.map((row) => ({ ...row, availability: availability.get(row.id) || { available: true, conflicts: [] } })),
      event_window: eventWindow,
    });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM personal WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    const zakazky = await query(
      `SELECT z.id, z.cislo, z.nazev, z.datum_akce, zp.role_na_akci, zp.cas_prichod, zp.cas_odchod
       FROM zakazky_personal zp JOIN zakazky z ON z.id = zp.zakazka_id
       WHERE zp.personal_id = $1 ORDER BY z.datum_akce DESC`, [req.params.id]);
    const absence = await query(
      `SELECT id, personal_id, datum_od::text, datum_do::text, cas_od::text, cas_do::text, typ, poznamka, created_at, updated_at
       FROM personal_absence
       WHERE personal_id = $1
       ORDER BY datum_od DESC, cas_od NULLS FIRST`,
      [req.params.id]
    );
    res.json({ ...rows[0], zakazky: zakazky.rows, absence: absence.rows });
  } catch (err) { next(err); }
});

router.get('/:id/absence', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, personal_id, datum_od::text, datum_do::text, cas_od::text, cas_do::text, typ, poznamka, created_at, updated_at
       FROM personal_absence
       WHERE personal_id = $1
       ORDER BY datum_od DESC, cas_od NULLS FIRST`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.post('/:id/absence', auth, async (req, res, next) => {
  try {
    const { datum_od, datum_do, cas_od, cas_do, typ, poznamka } = req.body;
    if (!datum_od) return res.status(400).json({ error: 'Datum od je povinné' });
    const { rows } = await query(
      `INSERT INTO personal_absence (personal_id, datum_od, datum_do, cas_od, cas_do, typ, poznamka)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, personal_id, datum_od::text, datum_do::text, cas_od::text, cas_do::text, typ, poznamka, created_at, updated_at`,
      [
        req.params.id,
        datum_od,
        datum_do || datum_od,
        normalizeNullable(cas_od),
        normalizeNullable(cas_do),
        normalizeAbsenceType(typ),
        normalizeNullable(poznamka),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id/absence/:absenceId', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'DELETE FROM personal_absence WHERE id = $1 AND personal_id = $2 RETURNING id',
      [req.params.absenceId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Nedostupnost nenalezena' });
    res.json({ message: 'Nedostupnost odstraněna' });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { jmeno, prijmeni, typ, role, email, telefon, specializace, poznamka } = req.body;
    const { rows } = await query(
      `INSERT INTO personal (jmeno,prijmeni,typ,role,email,telefon,specializace,poznamka)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [jmeno, prijmeni, typ || 'interni', role, email, telefon, specializace || [], poznamka]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['jmeno','prijmeni','typ','role','email','telefon','specializace','poznamka','aktivni'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE personal SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/archivovat', auth, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE personal SET archivovano=true WHERE id=$1 RETURNING id, jmeno, prijmeni', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    res.json({ message: 'Osoba archivována', ...rows[0] });
  } catch (err) { next(err); }
});

router.patch('/:id/obnovit', auth, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE personal SET archivovano=false WHERE id=$1 RETURNING id, jmeno, prijmeni', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    res.json({ message: 'Osoba obnovena', ...rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM personal WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    res.json({ message: 'Osoba smazána' });
  } catch (err) { next(err); }
});

router.post('/:id/prirazeni', auth, async (req, res, next) => {
  try {
    const { zakazka_id, role_na_akci, cas_prichod, cas_odchod, poznamka } = req.body;
    const eventWindow = await loadEventWindow({
      zakazka_id,
      cas_od: cas_prichod,
      cas_do: cas_odchod,
    });
    const availability = await buildAvailabilityMap([req.params.id], eventWindow);
    const { rows } = await query(
      `INSERT INTO zakazky_personal (zakazka_id, personal_id, role_na_akci, cas_prichod, cas_odchod, poznamka)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (zakazka_id, personal_id) DO UPDATE SET role_na_akci=$3, cas_prichod=$4, cas_odchod=$5, poznamka=$6
       RETURNING *`,
      [zakazka_id, req.params.id, role_na_akci, cas_prichod, cas_odchod, poznamka]);
    res.status(201).json({
      ...rows[0],
      availability_warning: availability.get(Number(req.params.id)) || { available: true, conflicts: [] },
    });
  } catch (err) { next(err); }
});

// ── POST /import ──────────────────────────────────────────────────────────────
router.post('/import', auth, async (req, res, next) => {
  try {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'Chybí data (rows)' });

    let imported = 0, skipped = 0;
    const errors = [];

    // Deduplikace podle emailu v rámci importu i vůči DB
    const { rows: existing } = await query(`SELECT LOWER(email) AS email FROM personal WHERE email IS NOT NULL`);
    const knownEmails = new Set(existing.map(r => r.email));

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.jmeno) { errors.push({ row: i + 1, reason: 'Chybí jméno' }); continue; }

      const email = (r.email || '').trim().toLowerCase() || null;
      if (email && knownEmails.has(email)) { skipped++; continue; }

      try {
        await query(
          `INSERT INTO personal (jmeno,prijmeni,typ,role,email,telefon,poznamka)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [r.jmeno, r.prijmeni || null, r.typ || 'interni', r.role || null,
           email, r.telefon || null, r.poznamka || null]
        );
        if (email) knownEmails.add(email);
        imported++;
      } catch (e) {
        errors.push({ row: i + 1, reason: e.message });
      }
    }

    res.json({ imported, skipped, errors });
  } catch (err) { next(err); }
});

module.exports = router;
