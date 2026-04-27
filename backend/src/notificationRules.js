'use strict';

const cron = require('node-cron');
const { query } = require('./db');
const { createNotif } = require('./notifHelper');
const { createSmtpTransporter } = require('./smtpConfig');

const DEFAULT_NOTIFICATION_RULES = [
  {
    key: 'zakazka_confirmed',
    title: 'Zakázka potvrzena',
    description: 'Pošle interní notifikaci a volitelně e-mail při potvrzení zakázky.',
    event_type: 'zakazka_confirmed',
    enabled: true,
    include_assigned_staff: false,
    include_admins: true,
    extra_emails: '',
    subject_template: 'Potvrzená zakázka: {cislo} - {nazev}',
    body_template: 'Zakázka {cislo} ({nazev}) byla potvrzena. Termín: {datum_akce}. Místo: {misto}.',
  },
  {
    key: 'zakazka_changed',
    title: 'Změna termínu nebo venue',
    description: 'Upozorní na změnu důležitých detailů eventu.',
    event_type: 'zakazka_changed',
    enabled: true,
    include_assigned_staff: true,
    include_admins: true,
    extra_emails: '',
    subject_template: 'Změna zakázky: {cislo} - {nazev}',
    body_template: 'Zakázka {cislo} ({nazev}) má změněné důležité detaily. Termín: {datum_akce}. Místo: {misto}.',
  },
  {
    key: 'upcoming_event_48h',
    title: 'Akce za 48 hodin',
    description: 'Připomene blížící se akci internímu týmu a případně přiřazenému personálu.',
    event_type: 'upcoming_event_48h',
    enabled: true,
    include_assigned_staff: true,
    include_admins: true,
    extra_emails: '',
    subject_template: 'Blíží se akce: {cislo} - {nazev}',
    body_template: 'Akce {cislo} ({nazev}) probíhá {datum_akce} v {cas_zacatek}. Místo: {misto}.',
  },
  {
    key: 'missing_venue_debrief',
    title: 'Chybí venue debrief',
    description: 'Upozorní po realizaci, že k venue ještě chybí debrief.',
    event_type: 'missing_venue_debrief',
    enabled: true,
    include_assigned_staff: false,
    include_admins: true,
    extra_emails: '',
    subject_template: 'Chybí venue debrief: {cislo} - {nazev}',
    body_template: 'Zakázka {cislo} ({nazev}) je realizovaná, ale venue debrief zatím chybí.',
  },
  {
    key: 'venue_debrief_submitted',
    title: 'Venue debrief vyplněn',
    description: 'Informuje o přidaném venue debriefu a nových pozorováních.',
    event_type: 'venue_debrief_submitted',
    enabled: true,
    include_assigned_staff: false,
    include_admins: true,
    extra_emails: '',
    subject_template: 'Venue debrief vyplněn: {cislo} - {nazev}',
    body_template: 'Zakázka {cislo} ({nazev}) má nový venue debrief. Zkontrolujte observations a případné promítnutí do venue master dat.',
  },
];

let schedulerStarted = false;

function parseEmailList(value) {
  return String(value || '')
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item && item.includes('@'));
}

function renderTemplate(template, context = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = context[key];
    return value == null ? '' : String(value);
  });
}

async function ensureDefaultNotificationRules(dbQuery = query) {
  for (const rule of DEFAULT_NOTIFICATION_RULES) {
    await dbQuery(
      `INSERT INTO notification_rules
         (key, title, description, event_type, enabled, include_assigned_staff, include_admins, extra_emails, subject_template, body_template)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (key) DO NOTHING`,
      [
        rule.key,
        rule.title,
        rule.description,
        rule.event_type,
        rule.enabled,
        rule.include_assigned_staff,
        rule.include_admins,
        rule.extra_emails,
        rule.subject_template,
        rule.body_template,
      ]
    );
  }
}

async function listNotificationRules(dbQuery = query) {
  const { rows } = await dbQuery(
    `SELECT nr.*,
            (
              SELECT ndl.created_at
              FROM notification_dispatch_log ndl
              WHERE ndl.rule_id = nr.id
              ORDER BY ndl.created_at DESC
              LIMIT 1
            ) AS last_dispatched_at
       FROM notification_rules nr
       ORDER BY nr.id`
  );
  return rows;
}

async function listNotificationDispatches(limit = 100, dbQuery = query) {
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 100));
  const { rows } = await dbQuery(
    `SELECT ndl.*, nr.title AS rule_title, z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev
     FROM notification_dispatch_log ndl
     LEFT JOIN notification_rules nr ON nr.id = ndl.rule_id
     LEFT JOIN zakazky z ON z.id = ndl.zakazka_id
     ORDER BY ndl.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return rows;
}

async function updateNotificationRule(ruleId, payload, actorId = null, dbQuery = query) {
  const allowed = [
    'title',
    'description',
    'enabled',
    'include_assigned_staff',
    'include_admins',
    'extra_emails',
    'subject_template',
    'body_template',
  ];
  const fields = Object.keys(payload || {}).filter((key) => allowed.includes(key));
  if (!fields.length) return null;

  const { rows: beforeRows } = await dbQuery('SELECT * FROM notification_rules WHERE id = $1 LIMIT 1', [ruleId]);
  const before = beforeRows[0];
  if (!before) return null;

  const values = fields.map((field) => {
    if (field === 'enabled' || field === 'include_assigned_staff' || field === 'include_admins') {
      return Boolean(payload[field]);
    }
    return payload[field];
  });

  const setSql = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  const { rows } = await dbQuery(
    `UPDATE notification_rules
     SET ${setSql}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [ruleId, ...values]
  );

  await dbQuery(
    `INSERT INTO admin_audit_log
       (actor_id, action, entity_type, entity_id, before_payload, after_payload)
     VALUES ($1, 'notification_rule.update', 'notification_rule', $2, $3::jsonb, $4::jsonb)`,
    [actorId, String(ruleId), JSON.stringify(before), JSON.stringify(rows[0])]
  );

  return rows[0];
}

async function loadZakazkaContext(zakazkaId, dbQuery = query) {
  if (!zakazkaId) return {};
  const { rows } = await dbQuery(
    `SELECT z.*, k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
     FROM zakazky z
     LEFT JOIN klienti k ON k.id = z.klient_id
     WHERE z.id = $1
     LIMIT 1`,
    [zakazkaId]
  );
  const zakazka = rows[0];
  if (!zakazka) return {};
  return {
    ...zakazka,
    klient_display: zakazka.klient_firma || [zakazka.klient_jmeno, zakazka.klient_prijmeni].filter(Boolean).join(' '),
  };
}

async function collectRecipients(rule, zakazkaId, eventPayload = {}, dbQuery = query) {
  const emails = new Set();

  if (rule.include_admins) {
    const { rows } = await dbQuery(
      `SELECT email
       FROM uzivatele
       WHERE aktivni = true
         AND role IN ('admin', 'super_admin')
         AND email IS NOT NULL`
    );
    rows.forEach((row) => emails.add(String(row.email).trim().toLowerCase()));
  }

  if (rule.include_assigned_staff && zakazkaId) {
    const { rows } = await dbQuery(
      `SELECT p.email
       FROM zakazky_personal zp
       JOIN personal p ON p.id = zp.personal_id
       WHERE zp.zakazka_id = $1
         AND p.email IS NOT NULL`,
      [zakazkaId]
    );
    rows.forEach((row) => emails.add(String(row.email).trim().toLowerCase()));
  }

  parseEmailList(rule.extra_emails).forEach((email) => emails.add(email));
  parseEmailList(eventPayload.extra_emails).forEach((email) => emails.add(email));

  return [...emails];
}

async function trySendEmail(recipients, subject, body) {
  if (!recipients.length) {
    return { status: 'skipped', error: 'no_recipients', recipientCount: 0 };
  }

  try {
    const { transporter, smtpCfg } = await createSmtpTransporter(query);
    await transporter.sendMail({
      from: smtpCfg.from || smtpCfg.user,
      to: recipients.join(', '),
      subject,
      text: body,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-line;">${String(body).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`,
    });
    return { status: 'sent', error: null, recipientCount: recipients.length };
  } catch (err) {
    return { status: 'failed', error: err.message, recipientCount: recipients.length };
  }
}

async function dispatchRule(rule, {
  eventType,
  zakazkaId = null,
  actorId = null,
  dedupeKey = null,
  title,
  message,
  context = {},
  extraEmails = '',
}, dbQuery = query) {
  const recipients = await collectRecipients(rule, zakazkaId, { extra_emails: extraEmails }, dbQuery);

  const renderedTitle = renderTemplate(rule.subject_template || title, context) || title;
  const renderedMessage = renderTemplate(rule.body_template || message, context) || message;

  const inserted = await dbQuery(
    `INSERT INTO notification_dispatch_log
       (rule_id, event_type, dedupe_key, zakazka_id, recipient_count, status, payload, created_by)
     VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb, $7)
     ON CONFLICT (rule_id, dedupe_key) DO NOTHING
     RETURNING id`,
    [
      rule.id,
      eventType,
      dedupeKey,
      zakazkaId,
      recipients.length,
      JSON.stringify({ title: renderedTitle, message: renderedMessage, recipients }),
      actorId,
    ]
  );

  if (!inserted.rows[0]) {
    return { skipped: true, reason: 'duplicate' };
  }

  await createNotif({
    typ: 'system',
    titulek: renderedTitle,
    zprava: renderedMessage,
    odkaz: zakazkaId ? `/zakazky/${zakazkaId}` : null,
  });

  const mailResult = await trySendEmail(recipients, renderedTitle, renderedMessage);

  await dbQuery(
    `UPDATE notification_dispatch_log
     SET status = $2,
         error_message = $3,
         recipient_count = $4
     WHERE id = $1`,
    [inserted.rows[0].id, mailResult.status, mailResult.error, mailResult.recipientCount]
  );

  return { skipped: false, ...mailResult };
}

async function processNotificationEvent({
  eventType,
  zakazkaId = null,
  actorId = null,
  dedupeKey = null,
  title,
  message,
  extraEmails = '',
  context = {},
}, dbQuery = query) {
  const { rows: rules } = await dbQuery(
    `SELECT *
     FROM notification_rules
     WHERE enabled = true
       AND event_type = $1
     ORDER BY id`,
    [eventType]
  );

  if (!rules.length) return [];

  const zakazkaContext = zakazkaId ? await loadZakazkaContext(zakazkaId, dbQuery) : {};
  const mergedContext = { ...zakazkaContext, ...context };
  const results = [];

  for (const rule of rules) {
    const result = await dispatchRule(rule, {
      eventType,
      zakazkaId,
      actorId,
      dedupeKey,
      title,
      message,
      context: mergedContext,
      extraEmails,
    }, dbQuery);
    results.push({ rule: rule.key, ...result });
  }

  return results;
}

async function runScheduledNotificationSweep(dbQuery = query) {
  const upcoming = await dbQuery(
    `SELECT id, cislo, nazev, datum_akce, cas_zacatek, misto
     FROM zakazky
     WHERE stav IN ('potvrzeno', 've_priprave')
       AND datum_akce BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 days'`
  );

  for (const zakazka of upcoming.rows) {
    await processNotificationEvent({
      eventType: 'upcoming_event_48h',
      zakazkaId: zakazka.id,
      dedupeKey: `upcoming_event_48h:${zakazka.id}:${zakazka.datum_akce}`,
      title: `Blizi se akce: ${zakazka.cislo} - ${zakazka.nazev}`,
      message: `Akce ${zakazka.cislo} (${zakazka.nazev}) probiha ${zakazka.datum_akce}${zakazka.cas_zacatek ? ` od ${zakazka.cas_zacatek}` : ''}.`,
      context: zakazka,
    }, dbQuery);
  }

  const missingDebriefs = await dbQuery(
    `SELECT z.id, z.cislo, z.nazev, z.datum_akce, z.misto
     FROM zakazky z
     WHERE z.venue_id IS NOT NULL
       AND z.stav = 'realizovano'
       AND z.datum_akce >= CURRENT_DATE - INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1
         FROM venue_observations vo
         WHERE vo.event_id = z.id
           AND vo.source = 'debrief'
       )`
  );

  for (const zakazka of missingDebriefs.rows) {
    await processNotificationEvent({
      eventType: 'missing_venue_debrief',
      zakazkaId: zakazka.id,
      dedupeKey: `missing_venue_debrief:${zakazka.id}:${zakazka.datum_akce}`,
      title: `Chybí venue debrief: ${zakazka.cislo} - ${zakazka.nazev}`,
      message: `Zakazka ${zakazka.cislo} (${zakazka.nazev}) je realizovana, ale venue debrief zatim chybi.`,
      context: zakazka,
    }, dbQuery);
  }
}

function startNotificationRuleScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  cron.schedule('15 * * * *', () => {
    runScheduledNotificationSweep().catch((err) => {
      console.warn('[notification-rules] scheduled sweep chyba:', err.message);
    });
  });
}

module.exports = {
  DEFAULT_NOTIFICATION_RULES,
  ensureDefaultNotificationRules,
  listNotificationRules,
  listNotificationDispatches,
  updateNotificationRule,
  processNotificationEvent,
  runScheduledNotificationSweep,
  startNotificationRuleScheduler,
};
