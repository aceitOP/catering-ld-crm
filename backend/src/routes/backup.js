'use strict';
const express = require('express');
const fs = require('fs');
const {
  buildBackupPayload,
  getBackupFilePath,
  getBackupSettings,
  listBackupFiles,
  runManagedBackup,
  TABLES,
} = require('../backupService');
const { pool } = require('../db');
const { auth, requireCapability } = require('../middleware/auth');
const { appendAdminAudit } = require('../adminAudit');

const router = express.Router();

async function getTableCounts() {
  const counts = {};
  for (const table of TABLES) {
    try {
      const { rows } = await pool.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
      counts[table] = parseInt(rows[0].cnt, 10);
    } catch {
      counts[table] = null;
    }
  }
  return counts;
}

// GET /api/backup - okamzity download JSON zalohy
router.get('/', auth, requireCapability('backup.manage'), async (_req, res, next) => {
  try {
    const payload = await buildBackupPayload();
    const json = JSON.stringify(payload, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="crm-backup-${date}.json"`);
    res.send(json);
  } catch (err) { next(err); }
});

// POST /api/backup/run - vytvori zalohu na serveru
router.post('/run', auth, requireCapability('backup.manage'), async (req, res, next) => {
  try {
    const result = await runManagedBackup({ trigger: 'manual', actorId: req.user?.id });
    await appendAdminAudit({
      actorId: req.user?.id,
      action: 'backup.run',
      entityType: 'backup',
      entityId: result.fileName,
      afterPayload: {
        file: result.fileName,
        size: result.size,
        created_at: result.createdAt,
      },
    });
    res.status(201).json({
      message: 'Zaloha byla vytvorena',
      file: {
        name: result.fileName,
        size: result.size,
        created_at: result.createdAt,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/backup/files - seznam ulozenych zaloh
router.get('/files', auth, requireCapability('backup.manage'), async (_req, res, next) => {
  try {
    const files = await listBackupFiles();
    res.json({ data: files });
  } catch (err) { next(err); }
});

// GET /api/backup/files/:name - stazeni konkretni zalohy
router.get('/files/:name', auth, requireCapability('backup.manage'), async (req, res, next) => {
  try {
    const filePath = getBackupFilePath(req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Zaloha nenalezena' });
    }
    return res.download(filePath, req.params.name);
  } catch (err) { next(err); }
});

// GET /api/backup/info - pocty radku + stav backupu + seznam souboru
router.get('/info', auth, requireCapability('backup.manage'), async (_req, res, next) => {
  try {
    const [counts, settings, files] = await Promise.all([
      getTableCounts(),
      getBackupSettings(),
      listBackupFiles(),
    ]);
    res.json({ counts, tables: TABLES, settings, files });
  } catch (err) { next(err); }
});

module.exports = router;
