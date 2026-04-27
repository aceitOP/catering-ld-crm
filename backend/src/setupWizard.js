'use strict';

const { query } = require('./db');

const SETUP_STATUS_KEYS = [
  'app_setup_completed_at',
  'app_setup_completed_by',
  'app_title',
  'app_color_theme',
  'firma_nazev',
  'firma_email',
  'firma_telefon',
  'firma_adresa',
  'firma_ico',
  'firma_dic',
  'firma_web',
  'firma_iban',
  'email_smtp_host',
  'email_smtp_port',
  'email_smtp_user',
  'email_smtp_from',
  'email_smtp_secure',
  'email_imap_host',
  'email_imap_port',
  'email_imap_user',
  'email_imap_tls',
];

function isFilled(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

async function getSetupStatus(dbQuery = query) {
  const [settingsResult, countsResult] = await Promise.all([
    dbQuery(
      `SELECT klic, hodnota
       FROM nastaveni
       WHERE klic = ANY($1::text[])`,
      [SETUP_STATUS_KEYS]
    ),
    dbQuery(
      `SELECT
         (SELECT COUNT(*)::int FROM uzivatele WHERE aktivni = true) AS active_users,
         (SELECT COUNT(*)::int FROM uzivatele WHERE aktivni = true AND role IN ('admin', 'majitel', 'super_admin')) AS admin_users,
         (SELECT COUNT(*)::int FROM klienti) AS klienti_count,
         (SELECT COUNT(*)::int FROM zakazky) AS zakazky_count,
         (SELECT COUNT(*)::int FROM venues) AS venues_count`
    ),
  ]);

  const settings = settingsResult.rows.reduce((acc, row) => {
    acc[row.klic] = row.hodnota;
    return acc;
  }, {});

  const counts = countsResult.rows[0] || {
    active_users: 0,
    admin_users: 0,
    klienti_count: 0,
    zakazky_count: 0,
    venues_count: 0,
  };

  const sections = {
    company: {
      ready: isFilled(settings.firma_nazev) && isFilled(settings.firma_email),
      missing: [
        !isFilled(settings.firma_nazev) ? 'Nazev firmy' : null,
        !isFilled(settings.firma_email) ? 'Firemni e-mail' : null,
      ].filter(Boolean),
    },
    branding: {
      ready: isFilled(settings.app_title) && isFilled(settings.app_color_theme),
      missing: [
        !isFilled(settings.app_title) ? 'Nazev aplikace' : null,
        !isFilled(settings.app_color_theme) ? 'Barevna sablona' : null,
      ].filter(Boolean),
    },
    smtp: {
      ready: isFilled(settings.email_smtp_host) && isFilled(settings.email_smtp_user) && isFilled(settings.email_smtp_from),
      missing: [
        !isFilled(settings.email_smtp_host) ? 'SMTP server' : null,
        !isFilled(settings.email_smtp_user) ? 'SMTP uzivatel' : null,
        !isFilled(settings.email_smtp_from) ? 'Odesilaci adresa' : null,
      ].filter(Boolean),
    },
    team: {
      ready: Number(counts.admin_users || 0) >= 2 || Number(counts.active_users || 0) >= 2,
      missing: Number(counts.active_users || 0) >= 2 ? [] : ['Dalsi uzivatel nebo admin'],
    },
  };

  const completed = isFilled(settings.app_setup_completed_at);
  const completionSuggestions = Object.entries(sections)
    .filter(([, section]) => !section.ready)
    .map(([key]) => key);

  return {
    completed,
    completed_at: settings.app_setup_completed_at || null,
    completed_by: settings.app_setup_completed_by || null,
    sections,
    counts,
    suggestions: completionSuggestions,
    settings,
  };
}

module.exports = {
  SETUP_STATUS_KEYS,
  getSetupStatus,
};
