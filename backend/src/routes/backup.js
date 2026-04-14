'use strict';
const express = require('express');
const { pool } = require('../db');
const { auth, requireMinRole } = require('../middleware/auth');

const router = express.Router();

// Tabulky k záloze v pořadí (respektuje FK závislosti pro případný import)
const TABLES = [
  'uzivatele',
  'klienti',
  'personal',
  'zakazky',
  'zakazky_personal',
  'nabidky',
  'kalkulace',
  'faktury',
  'faktury_polozky',
  'followup_ukoly',
  'cenik_kategorie',
  'cenik',
  'dokumenty_slozky',
  'dokumenty',
  'nastaveni',
  'notifikace',
  'proposals',
  'proposal_sekce',
  'proposal_polozky',
  'proposal_selection_log',
  'zakazky_sablony',
  'email_links',
  'email_sablony',
  'error_log',
];

// GET /api/backup – stáhne JSON zálohu celé DB (pouze admin)
router.get('/', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const backup = {
      version: 1,
      created_at: new Date().toISOString(),
      tables: {},
    };

    for (const table of TABLES) {
      try {
        const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
        backup.tables[table] = rows;
      } catch {
        // Tabulka neexistuje nebo jiná chyba – přeskočit
        backup.tables[table] = [];
      }
    }

    const json = JSON.stringify(backup, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="crm-backup-${date}.json"`);
    res.send(json);
  } catch (err) { next(err); }
});

// GET /api/backup/info – počty řádků v tabulkách (pro přehled)
router.get('/info', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const counts = {};
    for (const table of TABLES) {
      try {
        const { rows } = await pool.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
        counts[table] = parseInt(rows[0].cnt);
      } catch {
        counts[table] = null;
      }
    }
    res.json({ counts, tables: TABLES });
  } catch (err) { next(err); }
});

module.exports = router;
