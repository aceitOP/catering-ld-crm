// ── routes/klienti.js ─────────────────────────────────────────
const express = require('express');
const { query } = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { sendNabidka } = require('../emailService');

const klientiRouter = express.Router();

klientiRouter.get('/', auth, async (req, res, next) => {
  try {
    const { typ, q, sort = 'jmeno', page = 1, limit = 50 } = req.query;
    const where = []; const params = []; let p = 1;
    if (typ) { where.push(`typ = $${p++}`); params.push(typ); }
    if (q)   { where.push(`(jmeno ILIKE $${p} OR prijmeni ILIKE $${p} OR firma ILIKE $${p} OR email ILIKE $${p})`); params.push(`%${q}%`); p++; }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const orderMap = { jmeno: 'jmeno ASC', obrat: 'jmeno ASC', datum: 'created_at DESC' };
    const order = orderMap[sort] || 'jmeno ASC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows } = await query(
      `SELECT k.*, u.jmeno AS obchodnik_jmeno, u.prijmeni AS obchodnik_prijmeni,
              COUNT(z.id) AS pocet_zakazek,
              COUNT(CASE WHEN z.stav IN ('realizovano','uzavreno') THEN 1 END) AS pocet_realizovano,
              COALESCE(SUM(z.cena_celkem),0) AS obrat_celkem
       FROM klienti k
       LEFT JOIN uzivatele u ON u.id = k.obchodnik_id
       LEFT JOIN zakazky z ON z.klient_id = k.id
       ${wc} GROUP BY k.id, u.jmeno, u.prijmeni
       ORDER BY ${order} LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit), offset]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

klientiRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT k.*, u.jmeno AS obchodnik_jmeno, u.prijmeni AS obchodnik_prijmeni
       FROM klienti k LEFT JOIN uzivatele u ON u.id = k.obchodnik_id WHERE k.id = $1`,
      [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Klient nenalezen' });
    const zakazky = await query(
      'SELECT id, cislo, nazev, datum_akce, stav, cena_celkem FROM zakazky WHERE klient_id = $1 ORDER BY datum_akce DESC',
      [req.params.id]);
    res.json({ ...rows[0], zakazky: zakazky.rows });
  } catch (err) { next(err); }
});

klientiRouter.post('/', auth, async (req, res, next) => {
  try {
    const { jmeno, prijmeni, firma, typ, email, telefon, adresa, ico, dic, zdroj, poznamka, obchodnik_id } = req.body;
    const { rows } = await query(
      `INSERT INTO klienti (jmeno,prijmeni,firma,typ,email,telefon,adresa,ico,dic,zdroj,poznamka,obchodnik_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [jmeno, prijmeni, firma, typ || 'soukromy', email, telefon, adresa, ico, dic, zdroj, poznamka, obchodnik_id || req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

klientiRouter.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['jmeno','prijmeni','firma','typ','email','telefon','adresa','ico','dic','zdroj','poznamka','obchodnik_id'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'Žádná platná pole' });
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE klienti SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    if (!rows[0]) return res.status(404).json({ error: 'Klient nenalezen' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

klientiRouter.delete('/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    await query('DELETE FROM klienti WHERE id = $1', [req.params.id]);
    res.json({ message: 'Klient smazán' });
  } catch (err) { next(err); }
});

// ── routes/cenik.js ───────────────────────────────────────────
const cenikRouter = express.Router();

// GET /kategorie – seznam hodnot enumu z pg_enum
cenikRouter.get('/kategorie', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT enumlabel AS hodnota FROM pg_enum
       WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cenik_kategorie')
       ORDER BY enumsortorder`
    );
    res.json({ data: rows.map(r => r.hodnota) });
  } catch (err) { next(err); }
});

// POST /kategorie – přidání nové hodnoty do enumu (jen admin)
cenikRouter.post('/kategorie', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { klic } = req.body;
    if (!klic || !/^[a-z0-9_]+$/.test(klic)) {
      return res.status(400).json({ error: 'Klíč kategorie musí obsahovat pouze malá písmena, číslice a podtržítka' });
    }
    // Zjistit, zda hodnota již existuje
    const exists = await query(
      `SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cenik_kategorie') AND enumlabel = $1`,
      [klic]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Kategorie s tímto klíčem již existuje' });
    }
    // DDL příkaz – klic je ověřen regexpem, bezpečné pro interpolaci
    await query(`ALTER TYPE cenik_kategorie ADD VALUE '${klic}'`);
    res.status(201).json({ hodnota: klic });
  } catch (err) { next(err); }
});

cenikRouter.get('/', auth, async (req, res, next) => {
  try {
    const { kategorie, aktivni, q } = req.query;
    const where = []; const params = []; let p = 1;
    if (kategorie) { where.push(`kategorie = $${p++}`); params.push(kategorie); }
    if (aktivni !== undefined) { where.push(`aktivni = $${p++}`); params.push(aktivni === 'true'); }
    if (q) { where.push(`nazev ILIKE $${p++}`); params.push(`%${q}%`); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(`SELECT * FROM cenik ${wc} ORDER BY kategorie, nazev`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

cenikRouter.post('/', auth, requireRole('admin', 'obchodnik'), async (req, res, next) => {
  try {
    const { nazev, kategorie, jednotka, cena_nakup, cena_prodej, dph_sazba, poznamka } = req.body;
    const { rows } = await query(
      `INSERT INTO cenik (nazev,kategorie,jednotka,cena_nakup,cena_prodej,dph_sazba,poznamka)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [nazev, kategorie, jednotka || 'os.', cena_nakup || 0, cena_prodej || 0, dph_sazba || 12, poznamka]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

cenikRouter.patch('/:id', auth, requireRole('admin', 'obchodnik'), async (req, res, next) => {
  try {
    const allowed = ['nazev','kategorie','jednotka','cena_nakup','cena_prodej','dph_sazba','aktivni','poznamka'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE cenik SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    if (!rows[0]) return res.status(404).json({ error: 'Položka nenalezena' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

cenikRouter.delete('/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    await query('UPDATE cenik SET aktivni = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Položka deaktivována' });
  } catch (err) { next(err); }
});

// ── routes/personal.js ────────────────────────────────────────
const personalRouter = express.Router();

personalRouter.get('/', auth, async (req, res, next) => {
  try {
    const { typ, role, q } = req.query;
    const where = []; const params = []; let p = 1;
    if (typ)  { where.push(`typ = $${p++}`);  params.push(typ); }
    if (role) { where.push(`role = $${p++}`); params.push(role); }
    if (q)    { where.push(`(jmeno ILIKE $${p} OR prijmeni ILIKE $${p})`); params.push(`%${q}%`); p++; }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(`SELECT * FROM personal ${wc} ORDER BY jmeno, prijmeni`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

personalRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM personal WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    const zakazky = await query(
      `SELECT z.id, z.cislo, z.nazev, z.datum_akce, zp.role_na_akci, zp.cas_prichod, zp.cas_odchod
       FROM zakazky_personal zp JOIN zakazky z ON z.id = zp.zakazka_id
       WHERE zp.personal_id = $1 ORDER BY z.datum_akce DESC`, [req.params.id]);
    res.json({ ...rows[0], zakazky: zakazky.rows });
  } catch (err) { next(err); }
});

personalRouter.post('/', auth, async (req, res, next) => {
  try {
    const { jmeno, prijmeni, typ, role, email, telefon, specializace, poznamka } = req.body;
    const { rows } = await query(
      `INSERT INTO personal (jmeno,prijmeni,typ,role,email,telefon,specializace,poznamka)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [jmeno, prijmeni, typ || 'interni', role, email, telefon, specializace || [], poznamka]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

personalRouter.patch('/:id', auth, async (req, res, next) => {
  try {
    const allowed = ['jmeno','prijmeni','typ','role','email','telefon','specializace','poznamka','aktivni'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE personal SET ${sets} WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

personalRouter.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM personal WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Osoba nenalezena' });
    res.json({ message: 'Osoba smazána' });
  } catch (err) { next(err); }
});

// POST přiřazení personálu k zakázce
personalRouter.post('/:id/prirazeni', auth, async (req, res, next) => {
  try {
    const { zakazka_id, role_na_akci, cas_prichod, cas_odchod, poznamka } = req.body;
    const { rows } = await query(
      `INSERT INTO zakazky_personal (zakazka_id, personal_id, role_na_akci, cas_prichod, cas_odchod, poznamka)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (zakazka_id, personal_id) DO UPDATE SET role_na_akci=$3, cas_prichod=$4, cas_odchod=$5, poznamka=$6
       RETURNING *`,
      [zakazka_id, req.params.id, role_na_akci, cas_prichod, cas_odchod, poznamka]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── routes/nabidky.js ─────────────────────────────────────────
const nabidkyRouter = express.Router();

nabidkyRouter.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, stav } = req.query;
    const where = []; const params = []; let p = 1;
    if (zakazka_id) { where.push(`n.zakazka_id = $${p++}`); params.push(zakazka_id); }
    if (stav)       { where.push(`n.stav = $${p++}`);       params.push(stav); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(
      `SELECT n.*, z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev,
              k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
       FROM nabidky n
       JOIN zakazky z ON z.id = n.zakazka_id
       LEFT JOIN klienti k ON k.id = z.klient_id
       ${wc} ORDER BY n.created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

nabidkyRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM nabidky WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    const polozky = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY poradi, id', [req.params.id]);
    res.json({ ...rows[0], polozky: polozky.rows });
  } catch (err) { next(err); }
});

nabidkyRouter.post('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, nazev, uvodni_text, zaverecny_text, platnost_do, sleva_procent, polozky } = req.body;
    // Zjistit max verzi pro zakázku
    const maxVer = await query('SELECT COALESCE(MAX(verze),0) AS v FROM nabidky WHERE zakazka_id = $1', [zakazka_id]);
    const verze = maxVer.rows[0].v + 1;

    // Deaktivovat předchozí verze
    await query('UPDATE nabidky SET aktivni = false WHERE zakazka_id = $1', [zakazka_id]);

    const totalBezDph = (polozky || []).reduce((s, p) => s + (p.mnozstvi * p.cena_jednotka), 0);
    const sleva = totalBezDph * ((sleva_procent || 0) / 100);
    const dph = (totalBezDph - sleva) * 0.12;
    const celkem = totalBezDph - sleva + dph;

    const { rows } = await query(
      `INSERT INTO nabidky (zakazka_id, verze, nazev, uvodni_text, zaverecny_text, platnost_do,
        sleva_procent, cena_bez_dph, dph, cena_celkem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [zakazka_id, verze, nazev, uvodni_text, zaverecny_text, platnost_do,
       sleva_procent || 0, totalBezDph, dph, celkem]);

    // Uložit položky
    for (const [i, pol] of (polozky || []).entries()) {
      await query(
        `INSERT INTO nabidky_polozky (nabidka_id, kategorie, nazev, jednotka, mnozstvi, cena_jednotka, poradi)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [rows[0].id, pol.kategorie, pol.nazev, pol.jednotka, pol.mnozstvi, pol.cena_jednotka, i]);
    }

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

nabidkyRouter.patch('/:id', auth, async (req, res, next) => {
  try {
    const { nazev, uvodni_text, zaverecny_text, platnost_do, sleva_procent, polozky } = req.body;
    const totalBezDph = (polozky||[]).reduce((s,p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
    const sleva = totalBezDph * ((parseFloat(sleva_procent)||0)/100);
    const dph = (totalBezDph - sleva) * 0.12;
    const celkem = totalBezDph - sleva + dph;
    const { rows } = await query(
      `UPDATE nabidky SET nazev=$1,uvodni_text=$2,zaverecny_text=$3,platnost_do=$4,sleva_procent=$5,cena_bez_dph=$6,dph=$7,cena_celkem=$8 WHERE id=$9 RETURNING *`,
      [nazev, uvodni_text||null, zaverecny_text||null, platnost_do||null, sleva_procent||0, totalBezDph, dph, celkem, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    if (polozky) {
      await query('DELETE FROM nabidky_polozky WHERE nabidka_id = $1', [req.params.id]);
      for (const [i,pol] of polozky.entries()) {
        await query(
          `INSERT INTO nabidky_polozky (nabidka_id,kategorie,nazev,jednotka,mnozstvi,cena_jednotka,poradi) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [req.params.id, pol.kategorie||'jidlo', pol.nazev, pol.jednotka, pol.mnozstvi, pol.cena_jednotka, i]);
      }
    }
    const newPol = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id=$1 ORDER BY poradi,id', [req.params.id]);
    res.json({ ...rows[0], polozky: newPol.rows });
  } catch (err) { next(err); }
});

// POST /api/nabidky/:id/odeslat – odešle nabídku emailem klientovi + změní stav na 'odeslano'
nabidkyRouter.post('/:id/odeslat', auth, async (req, res, next) => {
  try {
    const { to, poznamka } = req.body;
    if (!to) return res.status(400).json({ error: 'Chybí emailová adresa příjemce' });

    // Načti nabídku + položky
    const { rows } = await query('SELECT * FROM nabidky WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    const polozky = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY poradi, id', [req.params.id]);
    const nabidka = { ...rows[0], polozky: polozky.rows };

    // Načti zakázku
    const { rows: zRows } = await query(
      'SELECT * FROM zakazky WHERE id = $1', [nabidka.zakazka_id]);
    const zakazka = zRows[0] || {};

    // Načti nastavení firmy
    const { rows: nastaveni } = await query('SELECT klic, hodnota FROM nastaveni');
    const firma = {};
    nastaveni.forEach(r => { firma[r.klic] = r.hodnota; });

    await sendNabidka({ to, nabidka, zakazka, firma, poznamka });

    // Automaticky změň stav na 'odeslano' a zaznamenej datum
    await query(`UPDATE nabidky SET stav = 'odeslano', odeslano_at = NOW() WHERE id = $1`, [req.params.id]);

    res.json({ message: `Nabídka odeslána na ${to}` });
  } catch (err) {
    if (err.message.includes('SMTP')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

nabidkyRouter.patch('/:id/stav', auth, async (req, res, next) => {
  try {
    const { stav } = req.body;
    const extra = stav === 'odeslano' ? ', odeslano_at = NOW()' : '';
    const { rows } = await query(
      `UPDATE nabidky SET stav = $1${extra} WHERE id = $2 RETURNING *`, [stav, req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── routes/dokumenty.js ───────────────────────────────────────
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const ALLOWED_MIME_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
];

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 25) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error(`Nepodporovaný typ souboru`), { status: 400 }));
    }
  },
});

const dokumentyRouter = express.Router();

dokumentyRouter.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, klient_id, kategorie } = req.query;
    const where = []; const params = []; let p = 1;
    if (zakazka_id) { where.push(`zakazka_id = $${p++}`); params.push(zakazka_id); }
    if (klient_id)  { where.push(`klient_id = $${p++}`);  params.push(klient_id); }
    if (kategorie)  { where.push(`kategorie = $${p++}`);  params.push(kategorie); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(`SELECT * FROM dokumenty ${wc} ORDER BY created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

dokumentyRouter.post('/upload', auth, upload.single('soubor'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Žádný soubor nahrán' });
    const { kategorie, zakazka_id, klient_id, poznamka } = req.body;
    const { rows } = await query(
      `INSERT INTO dokumenty (nazev, filename, mime_type, velikost, kategorie, zakazka_id, klient_id, nahral_id, poznamka)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size,
       kategorie || 'interni', zakazka_id || null, klient_id || null, req.user.id, poznamka || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

dokumentyRouter.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM dokumenty WHERE id = $1 RETURNING filename', [req.params.id]);
    if (rows[0]?.filename) {
      const fp = path.join(uploadDir, rows[0].filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ message: 'Dokument smazán' });
  } catch (err) { next(err); }
});

// ── routes/uzivatele.js ───────────────────────────────────────
const bcrypt = require('bcryptjs');
const uzivateleRouter = express.Router();

uzivateleRouter.get('/', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id,jmeno,prijmeni,email,role,telefon,aktivni,posledni_prihlaseni,created_at FROM uzivatele ORDER BY jmeno');
    res.json({ data: rows });
  } catch (err) { next(err); }
});

uzivateleRouter.post('/', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { jmeno, prijmeni, email, heslo, role, telefon } = req.body;
    const hash = await bcrypt.hash(heslo || 'CateringLD2026!', 12);
    const { rows } = await query(
      `INSERT INTO uzivatele (jmeno,prijmeni,email,heslo_hash,role,telefon)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,jmeno,prijmeni,email,role,telefon`,
      [jmeno, prijmeni, email.toLowerCase(), hash, role || 'obchodnik', telefon]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

uzivateleRouter.patch('/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const allowed = ['jmeno','prijmeni','email','role','telefon','aktivni'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE uzivatele SET ${sets} WHERE id = $1 RETURNING id,jmeno,prijmeni,email,role,aktivni`,
      [req.params.id, ...fields.map(f => req.body[f])]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── routes/nastaveni.js ───────────────────────────────────────
const nastaveniRouter = express.Router();

nastaveniRouter.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT klic, hodnota, popis FROM nastaveni ORDER BY klic');
    const obj = {};
    rows.forEach(r => { obj[r.klic] = r.hodnota; });
    res.json(obj);
  } catch (err) { next(err); }
});

nastaveniRouter.patch('/', auth, requireRole('admin'), async (req, res, next) => {
  try {
    for (const [klic, hodnota] of Object.entries(req.body)) {
      await query('UPDATE nastaveni SET hodnota = $1 WHERE klic = $2', [String(hodnota), klic]);
    }
    res.json({ message: 'Nastavení uloženo' });
  } catch (err) { next(err); }
});

// ── routes/kalendar.js ────────────────────────────────────────
const kalendarRouter = express.Router();

kalendarRouter.get('/', auth, async (req, res, next) => {
  try {
    const { od, do: doo, obchodnik_id, typ } = req.query;
    const where = ['z.datum_akce IS NOT NULL'];
    const params = []; let p = 1;
    if (od)           { where.push(`z.datum_akce >= $${p++}`);   params.push(od); }
    if (doo)          { where.push(`z.datum_akce <= $${p++}`);   params.push(doo); }
    if (obchodnik_id) { where.push(`z.obchodnik_id = $${p++}`);  params.push(obchodnik_id); }
    if (typ)          { where.push(`z.typ = $${p++}`);            params.push(typ); }
    const { rows } = await query(
      `SELECT z.id, z.cislo, z.nazev, z.typ, z.stav, z.datum_akce, z.cas_zacatek, z.cas_konec,
              z.misto, z.pocet_hostu, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni,
              u.jmeno AS obchodnik_jmeno
       FROM zakazky z
       LEFT JOIN klienti k ON k.id = z.klient_id
       LEFT JOIN uzivatele u ON u.id = z.obchodnik_id
       WHERE ${where.join(' AND ')}
       ORDER BY z.datum_akce ASC`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ── routes/kalkulace.js ───────────────────────────────────────
const kalkulaceRouter = express.Router();

kalkulaceRouter.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id } = req.query;
    const { rows } = await query(
      'SELECT * FROM kalkulace WHERE zakazka_id = $1 ORDER BY verze DESC',
      [zakazka_id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

kalkulaceRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM kalkulace WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Kalkulace nenalezena' });
    const polozky = await query('SELECT * FROM kalkulace_polozky WHERE kalkulace_id = $1 ORDER BY kategorie, poradi', [req.params.id]);
    res.json({ ...rows[0], polozky: polozky.rows });
  } catch (err) { next(err); }
});

kalkulaceRouter.post('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, nazev, pocet_hostu, marze_procent, sleva_procent, dph_sazba, polozky } = req.body;
    const maxVer = await query('SELECT COALESCE(MAX(verze),0) AS v FROM kalkulace WHERE zakazka_id = $1', [zakazka_id]);
    const { rows } = await query(
      `INSERT INTO kalkulace (zakazka_id, verze, nazev, pocet_hostu, marze_procent, sleva_procent, dph_sazba)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [zakazka_id, maxVer.rows[0].v + 1, nazev, pocet_hostu, marze_procent || 30, sleva_procent || 0, dph_sazba || 12]);

    for (const [i, pol] of (polozky || []).entries()) {
      await query(
        `INSERT INTO kalkulace_polozky (kalkulace_id, cenik_id, kategorie, nazev, jednotka, mnozstvi, cena_nakup, cena_prodej, poradi)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [rows[0].id, pol.cenik_id || null, pol.kategorie, pol.nazev, pol.jednotka,
         pol.mnozstvi, pol.cena_nakup, pol.cena_prodej, i]);
    }
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── routes/reporty.js ─────────────────────────────────────────
const reportyRouter = express.Router();

reportyRouter.get('/', auth, async (req, res, next) => {
  try {
    const { od, do: doo } = req.query;
    const where = []; const params = []; let p = 1;
    if (od)  { where.push(`z.datum_akce >= $${p++}`); params.push(od); }
    if (doo) { where.push(`z.datum_akce <= $${p++}`); params.push(doo); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows: [souhrn] } = await query(`
      SELECT COUNT(*) AS total_zakazek,
        COUNT(CASE WHEN z.stav IN ('realizovano','uzavreno') THEN 1 END) AS realizovano,
        COALESCE(SUM(CASE WHEN z.stav NOT IN ('stornovano') THEN z.cena_celkem END), 0) AS obrat,
        COALESCE(SUM(CASE WHEN z.stav NOT IN ('stornovano') THEN z.cena_naklady END), 0) AS naklady
      FROM zakazky z ${wc}`, params);

    const { rows: podle_typu } = await query(`
      SELECT z.typ, COUNT(*) AS pocet, COALESCE(SUM(z.cena_celkem),0) AS obrat
      FROM zakazky z ${wc} GROUP BY z.typ ORDER BY obrat DESC`, params);

    const whereReal = where.length
      ? wc + ` AND z.stav IN ('realizovano','uzavreno')`
      : `WHERE z.stav IN ('realizovano','uzavreno')`;

    const { rows: zakazky } = await query(`
      SELECT z.id, z.cislo, z.nazev, z.typ, z.stav, z.datum_akce,
             z.cena_celkem, z.cena_naklady,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
      FROM zakazky z
      LEFT JOIN klienti k ON k.id = z.klient_id
      ${whereReal} ORDER BY z.datum_akce DESC`, params);

    res.json({ souhrn, podle_typu, zakazky });
  } catch (err) { next(err); }
});

// ── Export všech routerů ──────────────────────────────────────
module.exports = {
  klientiRouter,
  cenikRouter,
  personalRouter,
  nabidkyRouter,
  dokumentyRouter,
  uzivateleRouter,
  nastaveniRouter,
  kalendarRouter,
  kalkulaceRouter,
  reportyRouter,
};
