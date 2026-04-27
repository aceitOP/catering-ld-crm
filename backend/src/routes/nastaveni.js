const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { auth, requireMinRole, userLevel } = require('../middleware/auth');
const { isModuleSettingKey } = require('../moduleConfig');
const { refreshBackupScheduler } = require('../backupScheduler');
const { getSetupStatus } = require('../setupWizard');

const router = express.Router();
const SECRET_KEYS = new Set([
  'email_imap_pass',
  'email_smtp_pass',
]);
const SUPER_ADMIN_ONLY_SETTING_PREFIXES = ['email_imap_', 'email_smtp_'];
const PUBLIC_BRANDING_KEYS = ['app_title', 'app_logo_data_url', 'app_color_theme'];
const LOGO_DATA_URL_RE = /^data:image\/(?:png|jpeg|jpg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/;
const BACKUP_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const BRAND_THEMES = new Set(['ocean', 'forest', 'terracotta', 'graphite']);

function isSuperAdminOnlySettingKey(key) {
  return SUPER_ADMIN_ONLY_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function sanitizeSettingValue(key, value) {
  if (value == null) return '';
  const raw = typeof value === 'string' ? value : String(value);

  if (key === 'app_title') {
    return raw.trim().slice(0, 80);
  }

  if (key === 'app_logo_data_url') {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (!LOGO_DATA_URL_RE.test(trimmed)) {
      const err = new Error('Logo musi byt PNG, JPG, SVG nebo WEBP obrazek');
      err.status = 400;
      throw err;
    }
    if (trimmed.length > 1024 * 1024) {
      const err = new Error('Logo je prilis velke');
      err.status = 400;
      throw err;
    }
    return trimmed;
  }

  if (key === 'app_color_theme') {
    const normalized = raw.trim().toLowerCase();
    if (!BRAND_THEMES.has(normalized)) {
      const err = new Error('Neplatna barevna sablona');
      err.status = 400;
      throw err;
    }
    return normalized;
  }

  if (key === 'backup_auto_time') {
    const normalized = raw.trim();
    if (!BACKUP_TIME_RE.test(normalized)) {
      const err = new Error('Cas automaticke zalohy musi byt ve formatu HH:MM');
      err.status = 400;
      throw err;
    }
    return normalized;
  }

  if (key === 'backup_retention_count') {
    const count = parseInt(raw, 10);
    if (Number.isNaN(count) || count < 1 || count > 90) {
      const err = new Error('Retence zaloh musi byt cislo od 1 do 90');
      err.status = 400;
      throw err;
    }
    return String(count);
  }

  return raw;
}

async function persistSettings(entries = {}) {
  const keys = Object.keys(entries);
  for (const klic of keys) {
    await query(
      `INSERT INTO nastaveni (klic, hodnota) VALUES ($1, $2)
       ON CONFLICT (klic) DO UPDATE SET hodnota = EXCLUDED.hodnota`,
      [klic, entries[klic]]
    );
  }
  return keys;
}

router.get('/public-branding', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT klic, hodnota
       FROM nastaveni
       WHERE klic = ANY($1::text[])`,
      [PUBLIC_BRANDING_KEYS]
    );
    const branding = {
      app_title: 'Catering CRM',
      app_logo_data_url: '',
      app_color_theme: 'ocean',
    };
    rows.forEach((row) => {
      branding[row.klic] = row.hodnota;
    });
    res.json(branding);
  } catch (err) { next(err); }
});

router.get('/setup-status', auth, async (_req, res, next) => {
  try {
    const status = await getSetupStatus(query);
    res.json(status);
  } catch (err) { next(err); }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT klic, hodnota, popis FROM nastaveni ORDER BY klic');
    const obj = {};
    const isAdminPlus = userLevel(req) >= 2;
    const isSuperAdmin = req.user?.role === 'super_admin';
    rows.forEach((r) => {
      if (isSuperAdminOnlySettingKey(r.klic) && !isSuperAdmin) return;
      if (SECRET_KEYS.has(r.klic) && !isAdminPlus) return;
      obj[r.klic] = r.hodnota;
    });
    res.json(obj);
  } catch (err) { next(err); }
});

router.patch('/', auth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const keys = Object.keys(req.body || {});
    if (keys.some(isModuleSettingKey) && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Moduly muze menit pouze super admin' });
    }
    if (keys.some(isSuperAdminOnlySettingKey) && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Toto nastaveni muze menit pouze super admin' });
    }

    const safeEntries = Object.fromEntries(
      Object.entries(req.body || {}).map(([klic, hodnota]) => [klic, sanitizeSettingValue(klic, hodnota)])
    );
    await persistSettings(safeEntries);

    if (keys.some((key) => key.startsWith('backup_auto_') || key === 'backup_retention_count')) {
      await refreshBackupScheduler();
    }

    res.json({ message: 'Nastaveni ulozeno' });
  } catch (err) { next(err); }
});

router.post('/setup-wizard', auth, requireMinRole('super_admin'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const incomingSettings = body.settings && typeof body.settings === 'object' ? body.settings : {};
    const allowedKeys = new Set([
      'app_title',
      'app_logo_data_url',
      'app_color_theme',
      'firma_nazev',
      'firma_ico',
      'firma_dic',
      'firma_adresa',
      'firma_email',
      'firma_telefon',
      'firma_web',
      'firma_iban',
      'email_smtp_host',
      'email_smtp_port',
      'email_smtp_secure',
      'email_smtp_user',
      'email_smtp_pass',
      'email_smtp_from',
      'email_imap_host',
      'email_imap_port',
      'email_imap_tls',
      'email_imap_user',
      'email_imap_pass',
    ]);

    const safeEntries = {};
    for (const [klic, hodnota] of Object.entries(incomingSettings)) {
      if (!allowedKeys.has(klic) && !isModuleSettingKey(klic)) continue;
      safeEntries[klic] = sanitizeSettingValue(klic, hodnota);
    }

    let createdUser = null;
    const additionalUser = body.additional_user && typeof body.additional_user === 'object'
      ? body.additional_user
      : null;

    if (additionalUser?.email || additionalUser?.heslo || additionalUser?.jmeno || additionalUser?.prijmeni) {
      const email = String(additionalUser.email || '').trim().toLowerCase();
      const heslo = String(additionalUser.heslo || '');
      const jmeno = String(additionalUser.jmeno || '').trim();
      const prijmeni = String(additionalUser.prijmeni || '').trim();
      const role = additionalUser.role === 'admin' ? 'admin' : 'uzivatel';
      const telefon = String(additionalUser.telefon || '').trim();

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Dalsi uzivatel musi mit platny e-mail' });
      }
      if (heslo.length < 8) {
        return res.status(400).json({ error: 'Heslo dalsiho uzivatele musi mit alespon 8 znaku' });
      }
      if (!jmeno || !prijmeni) {
        return res.status(400).json({ error: 'Dalsi uzivatel musi mit jmeno i prijmeni' });
      }

      const { rows: existing } = await query('SELECT id FROM uzivatele WHERE lower(email) = $1 LIMIT 1', [email]);
      if (existing[0]) {
        return res.status(409).json({ error: 'Uzivatel s timto e-mailem uz existuje' });
      }

      const hesloHash = await bcrypt.hash(heslo, 12);
      const { rows } = await query(
        `INSERT INTO uzivatele (jmeno, prijmeni, email, heslo_hash, role, telefon)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, jmeno, prijmeni, email, role, telefon`,
        [jmeno, prijmeni, email, hesloHash, role, telefon]
      );
      createdUser = rows[0] || null;
    }

    const shouldMarkComplete = body.mark_complete !== false;
    if (shouldMarkComplete) {
      safeEntries.app_setup_completed_at = new Date().toISOString();
      safeEntries.app_setup_completed_by = String(req.user.id);
    }

    const changedKeys = await persistSettings(safeEntries);
    if (changedKeys.some((key) => key.startsWith('backup_auto_') || key === 'backup_retention_count')) {
      await refreshBackupScheduler();
    }

    const status = await getSetupStatus(query);
    res.json({
      message: 'Setup wizard byl ulozen',
      created_user: createdUser,
      status,
    });
  } catch (err) { next(err); }
});

module.exports = router;
