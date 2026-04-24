const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pool, query } = require('./db');

const TABLES = [
  'uzivatele',
  'klienti',
  'venues',
  'venue_contacts',
  'venue_access_rules',
  'venue_loading_zones',
  'venue_service_areas',
  'venue_routes',
  'venue_route_steps',
  'venue_restrictions',
  'venue_parking_options',
  'venue_connectivity_zones',
  'venue_observations',
  'venue_snapshots',
  'venue_audit_log',
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
  'error_logs',
];

const BACKUP_DIR = path.resolve(process.cwd(), process.env.BACKUP_DIR || 'backups');
const BACKUP_NAME_RE = /^crm-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d+)?Z\.json$/;
const BACKUP_SETTING_KEYS = [
  'backup_auto_enabled',
  'backup_auto_time',
  'backup_retention_count',
  'backup_last_run_at',
  'backup_last_status',
  'backup_last_error',
];

function parseSettingBoolean(value, fallback = true) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeBackupTime(value) {
  const match = String(value || '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : '02:30';
}

function normalizeRetentionCount(value) {
  const count = parseInt(value, 10);
  if (Number.isNaN(count)) return 14;
  return Math.min(Math.max(count, 1), 90);
}

async function ensureBackupDir() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}

async function buildBackupPayload() {
  const backup = {
    version: 2,
    created_at: new Date().toISOString(),
    tables: {},
  };

  for (const table of TABLES) {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
      backup.tables[table] = rows;
    } catch {
      backup.tables[table] = [];
    }
  }

  return backup;
}

function getBackupFileName(isoString = new Date().toISOString()) {
  return `crm-backup-${isoString.replace(/:/g, '-')}.json`;
}

function getBackupFilePath(name) {
  const basename = path.basename(name || '');
  if (!BACKUP_NAME_RE.test(basename)) {
    const err = new Error('Neplatny nazev zalohy');
    err.status = 400;
    throw err;
  }
  return path.join(BACKUP_DIR, basename);
}

async function writeBackupFile(payload, fileName = getBackupFileName(payload.created_at)) {
  await ensureBackupDir();
  const filePath = path.join(BACKUP_DIR, fileName);
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  const stat = await fsp.stat(filePath);
  return {
    fileName,
    filePath,
    size: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

async function createBackupFile(meta = {}) {
  const payload = await buildBackupPayload();
  payload.meta = {
    trigger: meta.trigger || 'manual',
    actor_id: meta.actorId || null,
  };
  return writeBackupFile(payload);
}

async function listBackupFiles() {
  await ensureBackupDir();
  const entries = await fsp.readdir(BACKUP_DIR, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && BACKUP_NAME_RE.test(entry.name))
    .map(async (entry) => {
      const stat = await fsp.stat(path.join(BACKUP_DIR, entry.name));
      return {
        name: entry.name,
        size: stat.size,
        created_at: stat.mtime.toISOString(),
      };
    }));

  return files.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function enforceRetention(retentionCount) {
  const keep = normalizeRetentionCount(retentionCount);
  const files = await listBackupFiles();
  const toDelete = files.slice(keep);

  await Promise.all(toDelete.map((file) =>
    fsp.unlink(path.join(BACKUP_DIR, file.name)).catch(() => {})
  ));

  return { removed: toDelete.map((file) => file.name), keep };
}

async function getBackupSettings() {
  const { rows } = await query(
    `SELECT klic, hodnota
     FROM nastaveni
     WHERE klic = ANY($1::text[])`,
    [BACKUP_SETTING_KEYS]
  );
  const settings = rows.reduce((acc, row) => {
    acc[row.klic] = row.hodnota;
    return acc;
  }, {});

  return {
    autoEnabled: parseSettingBoolean(settings.backup_auto_enabled, true),
    autoTime: normalizeBackupTime(settings.backup_auto_time),
    retentionCount: normalizeRetentionCount(settings.backup_retention_count),
    lastRunAt: settings.backup_last_run_at || '',
    lastStatus: settings.backup_last_status || '',
    lastError: settings.backup_last_error || '',
  };
}

async function setBackupStatus({ lastRunAt, lastStatus, lastError }) {
  const updates = [
    ['backup_last_run_at', lastRunAt || ''],
    ['backup_last_status', lastStatus || ''],
    ['backup_last_error', lastError || ''],
  ];

  for (const [key, value] of updates) {
    await query(
      `INSERT INTO nastaveni (klic, hodnota)
       VALUES ($1, $2)
       ON CONFLICT (klic) DO UPDATE SET hodnota = EXCLUDED.hodnota`,
      [key, String(value)]
    );
  }
}

async function runManagedBackup(meta = {}) {
  const nowIso = new Date().toISOString();
  try {
    const settings = await getBackupSettings();
    const result = await createBackupFile(meta);
    await enforceRetention(settings.retentionCount);
    await setBackupStatus({
      lastRunAt: nowIso,
      lastStatus: 'success',
      lastError: '',
    });
    return result;
  } catch (err) {
    await setBackupStatus({
      lastRunAt: nowIso,
      lastStatus: 'error',
      lastError: err.message || 'Neznama chyba',
    });
    throw err;
  }
}

module.exports = {
  BACKUP_DIR,
  TABLES,
  buildBackupPayload,
  createBackupFile,
  enforceRetention,
  getBackupFileName,
  getBackupFilePath,
  getBackupSettings,
  listBackupFiles,
  runManagedBackup,
};
