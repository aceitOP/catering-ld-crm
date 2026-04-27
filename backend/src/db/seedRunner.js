'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const SEED_FILES = {
  demo: path.join(__dirname, '../../db/seed.sql'),
};

async function getUserCount() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM uzivatele');
  return rows[0]?.cnt || 0;
}

async function runSeedMode(mode = 'empty') {
  const normalized = String(mode || 'empty').trim().toLowerCase();
  const userCount = await getUserCount();

  if (userCount > 0) {
    return { applied: false, reason: 'existing_data', mode: normalized };
  }

  if (normalized === 'demo') {
    const seedPath = SEED_FILES.demo;
    const sql = fs.readFileSync(seedPath, 'utf8');
    await pool.query(sql);
    return { applied: true, reason: 'demo_seed_applied', mode: normalized };
  }

  if (normalized === 'super_admin_only' || normalized === 'empty') {
    return { applied: false, reason: 'seed_disabled', mode: normalized };
  }

  return { applied: false, reason: 'unknown_seed_mode', mode: normalized };
}

module.exports = {
  runSeedMode,
};
