'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '../../db/migrations');
const BASELINE_VERSION = '001_legacy_bootstrap';

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.(sql|js)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function getFileChecksum(filePath) {
  const raw = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(raw).digest('hex');
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version       VARCHAR(120) PRIMARY KEY,
      name          VARCHAR(255) NOT NULL,
      checksum      VARCHAR(64),
      applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms  INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function legacySchemaExists(client) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'uzivatele'
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS exists`,
    [tableName]
  );
  return Boolean(rows[0]?.exists);
}

async function ensureLegacyCompatibilityConstraints(client) {
  if (await tableExists(client, 'nastaveni')) {
    await client.query(`
      DELETE FROM nastaveni
      WHERE klic IS NULL
         OR ctid NOT IN (
           SELECT MIN(ctid)
           FROM nastaveni
           WHERE klic IS NOT NULL
           GROUP BY klic
         )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nastaveni_klic_unique
      ON nastaveni(klic)
    `);
  }
}

async function markLegacyBaseline(client) {
  const filePath = path.join(MIGRATIONS_DIR, `${BASELINE_VERSION}.js`);
  const checksum = fs.existsSync(filePath) ? getFileChecksum(filePath) : null;
  await client.query(
    `INSERT INTO schema_migrations (version, name, checksum, execution_ms)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (version) DO NOTHING`,
    [BASELINE_VERSION, 'legacy bootstrap baseline', checksum]
  );
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT version, checksum FROM schema_migrations ORDER BY version'
  );
  return new Map(rows.map((row) => [row.version, row]));
}

async function runSqlMigration(client, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  if (!sql.trim()) return;
  await client.query(sql);
}

async function runJsMigration(client, filePath) {
  delete require.cache[require.resolve(filePath)];
  const migration = require(filePath);
  if (typeof migration.up !== 'function') {
    throw new Error(`JS migrace ${path.basename(filePath)} neexportuje funkci up()`);
  }
  await migration.up({ client, pool });
}

async function applyMigration(client, fileName) {
  const version = fileName.replace(/\.(sql|js)$/i, '');
  const filePath = path.join(MIGRATIONS_DIR, fileName);
  const checksum = getFileChecksum(filePath);
  const startedAt = Date.now();

  if (fileName.endsWith('.sql')) await runSqlMigration(client, filePath);
  else await runJsMigration(client, filePath);

  const executionMs = Date.now() - startedAt;
  await client.query(
    `INSERT INTO schema_migrations (version, name, checksum, execution_ms)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (version) DO UPDATE
       SET checksum = EXCLUDED.checksum,
           execution_ms = EXCLUDED.execution_ms,
           applied_at = NOW()`,
    [version, fileName, checksum, executionMs]
  );

  return { version, fileName, execution_ms: executionMs };
}

async function runMigrations() {
  const client = await pool.connect();
  const appliedVersions = [];
  let baselineMarked = false;
  let freshInstall = false;

  try {
    await ensureMigrationsTable(client);
    const legacyExists = await legacySchemaExists(client);
    const applied = await getAppliedMigrations(client);

    if (legacyExists) {
      await ensureLegacyCompatibilityConstraints(client);
    }

    if (legacyExists && !applied.has(BASELINE_VERSION)) {
      await markLegacyBaseline(client);
      applied.set(BASELINE_VERSION, { version: BASELINE_VERSION });
      baselineMarked = true;
    }

    const files = getMigrationFiles();
    if (!legacyExists && files.includes(`${BASELINE_VERSION}.js`) && !applied.has(BASELINE_VERSION)) {
      freshInstall = true;
    }

    for (const file of files) {
      const version = file.replace(/\.(sql|js)$/i, '');
      if (applied.has(version)) continue;
      const result = await applyMigration(client, file);
      appliedVersions.push(result.version);
    }

    return {
      baselineMarked,
      freshInstall,
      appliedVersions,
      migrationCount: appliedVersions.length,
    };
  } finally {
    client.release();
  }
}

module.exports = {
  runMigrations,
  BASELINE_VERSION,
  MIGRATIONS_DIR,
};
