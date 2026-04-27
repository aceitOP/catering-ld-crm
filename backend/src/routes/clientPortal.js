'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { clientPortalAuth } = require('../middleware/clientPortalAuth');
const {
  loadClientPortalDashboard,
  loadClientPortalZakazka,
  assertClientPortalZakazkaAccess,
} = require('../clientPortalService');

const router = express.Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 15;
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

const uploadSingleDocument = (req, res, next) => {
  upload.single('soubor')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(Object.assign(new Error(`Soubor je příliš velký. Maximální velikost je ${MAX_FILE_SIZE_MB} MB.`), { status: 400 }));
    }
    return next(err);
  });
};

router.get('/me', clientPortalAuth, async (req, res) => {
  const primaryClient = req.clientPortal.scope.clients[0] || null;
  res.json({
    email: req.clientPortal.email,
    primary_client: primaryClient,
    client_count: req.clientPortal.scope.clients.length,
    zakazka_count: req.clientPortal.scope.zakazky.length,
  });
});

router.get('/dashboard', clientPortalAuth, async (req, res, next) => {
  try {
    const data = await loadClientPortalDashboard(req.clientPortal.email);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/zakazky/:id', clientPortalAuth, async (req, res, next) => {
  try {
    const detail = await loadClientPortalZakazka(req.clientPortal.email, req.params.id);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

router.get('/dokumenty', clientPortalAuth, async (req, res, next) => {
  try {
    const dashboard = await loadClientPortalDashboard(req.clientPortal.email);
    res.json({ data: dashboard.dokumenty });
  } catch (err) {
    next(err);
  }
});

router.get('/dokumenty/:id/download', clientPortalAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `
        SELECT d.id, d.nazev, d.filename, d.mime_type
        FROM dokumenty d
        LEFT JOIN zakazky z ON z.id = d.zakazka_id
        LEFT JOIN klienti k ON k.id = COALESCE(d.klient_id, z.klient_id)
        WHERE d.id = $1
          AND (LOWER(k.email) = $2 OR d.zakazka_id = ANY($3::int[]))
        LIMIT 1
      `,
      [req.params.id, req.clientPortal.email, req.clientPortal.scope.zakazkaIds]
    );
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Dokument nebyl nalezen.' });

    const fp = path.join(uploadDir, doc.filename);
    if (!fs.existsSync(fp)) {
      return res.status(404).json({ error: 'Soubor na disku nebyl nalezen.' });
    }

    if (doc.mime_type) res.type(doc.mime_type);
    return res.download(fp, doc.nazev || doc.filename);
  } catch (err) {
    next(err);
  }
});

router.get('/faktury', clientPortalAuth, async (req, res, next) => {
  try {
    const dashboard = await loadClientPortalDashboard(req.clientPortal.email);
    res.json({ data: dashboard.faktury });
  } catch (err) {
    next(err);
  }
});

router.get('/faktury/:id', clientPortalAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `
        SELECT
          f.*,
          k.jmeno AS klient_jmeno,
          k.prijmeni AS klient_prijmeni,
          k.firma AS klient_firma,
          k.ico AS klient_ico,
          k.dic AS klient_dic,
          k.adresa AS klient_adresa,
          k.email AS klient_email,
          z.cislo AS zakazka_cislo,
          z.nazev AS zakazka_nazev
        FROM faktury f
        LEFT JOIN klienti k ON k.id = f.klient_id
        LEFT JOIN zakazky z ON z.id = f.zakazka_id
        WHERE f.id = $1
          AND (LOWER(k.email) = $2 OR f.zakazka_id = ANY($3::int[]))
        LIMIT 1
      `,
      [req.params.id, req.clientPortal.email, req.clientPortal.scope.zakazkaIds]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Faktura nebyla nalezena.' });
    const polozky = await query(
      'SELECT * FROM faktury_polozky WHERE faktura_id = $1 ORDER BY poradi, id',
      [req.params.id]
    );
    res.json({ ...rows[0], polozky: polozky.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/dokumenty/upload', clientPortalAuth, uploadSingleDocument, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Žádný soubor nebyl nahrán.' });
    const zakazkaId = req.body?.zakazka_id;
    if (!zakazkaId) {
      return res.status(400).json({ error: 'Zakázka je povinná.' });
    }

    await assertClientPortalZakazkaAccess(req.clientPortal.email, zakazkaId);
    const matchedClientId = req.clientPortal.scope.clients[0]?.id || null;
    const { rows } = await query(
      `
        INSERT INTO dokumenty (
          nazev, filename, mime_type, velikost, kategorie, zakazka_id, klient_id, nahral_id, poznamka
        )
        VALUES ($1,$2,$3,$4,'podklady',$5,$6,NULL,$7)
        RETURNING *
      `,
      [
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        zakazkaId,
        matchedClientId,
        req.body?.poznamka || 'Nahráno z klientského portálu',
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
