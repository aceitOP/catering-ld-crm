'use strict';

const { pool } = require('./db');
const { DEFAULT_SETTINGS } = require('./settingsDefaults');
const { bootstrapCanonicalSuperAdmin, ensureSuperAdminUser } = require('./superAdmin');
const { runMigrations } = require('./db/migrationRunner');
const { runSeedMode } = require('./db/seedRunner');
const { setInitState } = require('./initState');
const { ensureDefaultNotificationRules } = require('./notificationRules');

async function ensureDefaultSettings() {
  for (const [klic, hodnota, popis] of DEFAULT_SETTINGS) {
    await pool.query(
      `INSERT INTO nastaveni (klic, hodnota, popis)
       VALUES ($1, $2, $3)
       ON CONFLICT (klic) DO NOTHING`,
      [klic, hodnota, popis]
    );
  }
}

async function initDb() {
  const seedMode = String(process.env.DB_SEED_MODE || process.env.INIT_SEED_MODE || 'empty').trim().toLowerCase();
  const initStartedAt = new Date();

  try {
    const migrationResult = await runMigrations();

    await ensureDefaultSettings();

    const seedResult = await runSeedMode(seedMode);
    await ensureDefaultSettings();
    await ensureSuperAdminUser(pool.query.bind(pool));
    await bootstrapCanonicalSuperAdmin(pool.query.bind(pool));
    await ensureDefaultNotificationRules(pool.query.bind(pool));

    const summary = {
      ready: true,
      initialized_at: initStartedAt.toISOString(),
      migration_count: migrationResult.migrationCount,
      migrated_versions: migrationResult.appliedVersions,
      baseline_marked: migrationResult.baselineMarked,
      fresh_install: migrationResult.freshInstall,
      seed_mode: seedMode,
      seed_applied: seedResult.applied,
      seed_skipped_reason: seedResult.reason,
    };

    setInitState(summary);

    console.log(`✅  DB init hotovo. Migrace: ${summary.migration_count}, seed mode: ${seedMode}, seed applied: ${summary.seed_applied}`);
    return summary;
  } catch (err) {
    setInitState({
      ready: false,
      initialized_at: initStartedAt.toISOString(),
      seed_mode: seedMode,
      error: err.message,
    });
    console.error('❌  Chyba při inicializaci DB:', err.message);
    throw err;
  }
}

module.exports = { initDb };
