const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { auth, requireMinRole, userLevel } = require('../middleware/auth');
const { isModuleSettingKey } = require('../moduleConfig');
const { refreshBackupScheduler } = require('../backupScheduler');
const { getSetupStatus } = require('../setupWizard');
const { appendAdminAudit } = require('../adminAudit');

const router = express.Router();
const SECRET_KEYS = new Set([
  'email_imap_pass',
  'email_smtp_pass',
]);
const SUPER_ADMIN_ONLY_SETTING_PREFIXES = ['email_imap_', 'email_smtp_'];
const PUBLIC_BRANDING_KEYS = ['app_title', 'app_logo_data_url', 'app_color_theme', 'app_document_font_family'];
const LOGO_DATA_URL_RE = /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const BACKUP_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const BRAND_THEMES = new Set(['ocean', 'forest', 'terracotta', 'graphite']);
const DOCUMENT_FONTS = new Set(['syne', 'manrope', 'merriweather', 'source_sans_3']);
const VOUCHER_DESIGN_STYLES = new Set(['classic', 'minimal', 'premium', 'festive']);

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
      const err = new Error('Logo musí být PNG nebo SVG obrázek');
      err.status = 400;
      throw err;
    }
    if (trimmed.length > 1024 * 1024) {
      const err = new Error('Logo je příliš velké');
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

  if (key === 'app_document_font_family') {
    const normalized = raw.trim().toLowerCase();
    if (!DOCUMENT_FONTS.has(normalized)) {
      const err = new Error('Neplatne pismo pro dokumenty');
      err.status = 400;
      throw err;
    }
    return normalized;
  }

  if (key === 'voucher_design_style') {
    const normalized = raw.trim().toLowerCase();
    if (!VOUCHER_DESIGN_STYLES.has(normalized)) {
      const err = new Error('Neplatný vzhled poukazu');
      err.status = 400;
      throw err;
    }
    return normalized;
  }

  if (key === 'voucher_shop_enabled') {
    return raw === 'true' || raw === '1' || raw === 'on' ? 'true' : 'false';
  }

  if (key === 'voucher_shop_values') {
    const values = raw
      .split(/[,;\n]+/)
      .map((value) => parseInt(String(value).replace(/\s+/g, ''), 10))
      .filter((value) => Number.isFinite(value) && value > 0 && value <= 1000000);
    if (!values.length) {
      const err = new Error('Zadejte alespoň jednu povolenou hodnotu poukazu');
      err.status = 400;
      throw err;
    }
    return Array.from(new Set(values)).join(',');
  }

  if (key === 'voucher_shop_min_amount') {
    const amount = parseInt(String(raw).replace(/\s+/g, ''), 10);
    if (Number.isNaN(amount) || amount < 1 || amount > 1000000) {
      const err = new Error('Minimální hodnota poukazu musí být 1 až 1 000 000 Kč');
      err.status = 400;
      throw err;
    }
    return String(amount);
  }

  if (key === 'voucher_shop_offers') {
    let parsed;
    try {
      parsed = JSON.parse(raw || '[]');
    } catch {
      const err = new Error('Nabízené poukazy musí být platný seznam');
      err.status = 400;
      throw err;
    }
    if (!Array.isArray(parsed)) {
      const err = new Error('Nabízené poukazy musí být seznam');
      err.status = 400;
      throw err;
    }
    const offers = parsed
      .slice(0, 30)
      .map((offer, index) => {
        const title = String(offer?.title || '').trim().slice(0, 120);
        const amount = parseInt(String(offer?.amount || '').replace(/\s+/g, ''), 10);
        if (!title || Number.isNaN(amount) || amount < 1 || amount > 1000000) return null;
        const id = String(offer?.id || title || `poukaz-${index + 1}`)
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80) || `poukaz-${index + 1}`;
        return {
          id,
          title,
          amount,
          description: String(offer?.description || '').trim().slice(0, 500),
        };
      })
      .filter(Boolean);
    return JSON.stringify(offers);
  }

  if (key === 'voucher_shop_validity_months') {
    const months = parseInt(raw, 10);
    if (Number.isNaN(months) || months < 1 || months > 120) {
      const err = new Error('Platnost poukazu musí být 1 až 120 měsíců');
      err.status = 400;
      throw err;
    }
    return String(months);
  }

  if (key === 'voucher_shop_terms_text') {
    return raw.trim().slice(0, 5000);
  }

  if (key === 'backup_auto_time') {
    const normalized = raw.trim();
    if (!BACKUP_TIME_RE.test(normalized)) {
      const err = new Error('Čas automatické zálohy musí být ve formátu HH:MM');
      err.status = 400;
      throw err;
    }
    return normalized;
  }

  if (key === 'backup_retention_count') {
    const count = parseInt(raw, 10);
    if (Number.isNaN(count) || count < 1 || count > 90) {
      const err = new Error('Retence záloh musí být číslo od 1 do 90');
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
      app_document_font_family: 'syne',
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
    const beforeResponse = await query('SELECT klic, hodnota FROM nastaveni');
    const beforeMap = beforeResponse.rows.reduce((acc, row) => {
      acc[row.klic] = row.hodnota;
      return acc;
    }, {});
    const keys = Object.keys(req.body || {});
    if (keys.some(isModuleSettingKey) && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Moduly může měnit pouze super admin' });
    }
    if (keys.some(isSuperAdminOnlySettingKey) && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Toto nastavení může měnit pouze super admin' });
    }

    const safeEntries = Object.fromEntries(
      Object.entries(req.body || {}).map(([klic, hodnota]) => [klic, sanitizeSettingValue(klic, hodnota)])
    );
    await persistSettings(safeEntries);
    await appendAdminAudit({
      actorId: req.user?.id,
      action: 'settings.update',
      entityType: 'settings',
      beforePayload: Object.fromEntries(keys.map((key) => [key, beforeMap[key] ?? null])),
      afterPayload: safeEntries,
    });

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
      'app_document_font_family',
      'voucher_design_style',
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
      const role = ['admin', 'majitel'].includes(additionalUser.role) ? additionalUser.role : 'uzivatel';
      const telefon = String(additionalUser.telefon || '').trim();

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Další uživatel musí mít platný e-mail' });
      }
      if (heslo.length < 8) {
        return res.status(400).json({ error: 'Heslo dalšího uživatele musí mít alespoň 8 znaků' });
      }
      if (!jmeno || !prijmeni) {
        return res.status(400).json({ error: 'Další uživatel musí mít jméno i příjmení' });
      }

      const { rows: existing } = await query('SELECT id FROM uzivatele WHERE lower(email) = $1 LIMIT 1', [email]);
      if (existing[0]) {
        return res.status(409).json({ error: 'Uživatel s tímto e-mailem už existuje' });
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
      if (!safeEntries.firma_nazev?.trim()) {
        return res.status(400).json({ error: 'Pro dokonceni setup wizardu je povinny nazev firmy' });
      }
      if (!safeEntries.firma_email?.trim()) {
        return res.status(400).json({ error: 'Pro dokonceni setup wizardu je povinny firemni e-mail' });
      }
      if (!safeEntries.app_title?.trim()) {
        return res.status(400).json({ error: 'Pro dokonceni setup wizardu je povinny nazev aplikace' });
      }
      if (!safeEntries.app_color_theme?.trim()) {
        return res.status(400).json({ error: 'Pro dokonceni setup wizardu je povinna barevna sablona' });
      }
      safeEntries.app_setup_completed_at = new Date().toISOString();
      safeEntries.app_setup_completed_by = String(req.user.id);
    }

    const changedKeys = await persistSettings(safeEntries);
    await appendAdminAudit({
      actorId: req.user?.id,
      action: 'settings.setup_wizard',
      entityType: 'setup_wizard',
      afterPayload: {
        changed_keys: changedKeys,
        created_user_id: createdUser?.id || null,
        mark_complete: shouldMarkComplete,
      },
    });
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
