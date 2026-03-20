'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { query } = require('../db');
const { auth } = require('../middleware/auth');

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

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 25;

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Nepodporovaný typ souboru'), { status: 400 }));
    }
  },
});

const router = express.Router();

const uploadSingleDocument = (req, res, next) => {
  upload.single('soubor')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(Object.assign(new Error(`Soubor je příliš velký. Maximální velikost je ${MAX_FILE_SIZE_MB} MB.`), { status: 400 }));
    }
    return next(err);
  });
};

router.get('/', auth, async (req, res, next) => {
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

router.post('/upload', auth, uploadSingleDocument, async (req, res, next) => {
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

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM dokumenty WHERE id = $1 RETURNING filename', [req.params.id]);
    if (rows[0]?.filename) {
      const fp = path.join(uploadDir, rows[0].filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ message: 'Dokument smazán' });
  } catch (err) { next(err); }
});

module.exports = router;
