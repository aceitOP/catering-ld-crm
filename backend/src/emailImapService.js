'use strict';
/**
 * emailImapService.js
 * IMAP připojení přes imapflow.
 * Konfigurace se čte z tabulky nastaveni (klíče email_imap_*).
 * Fallback: env proměnné IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS, IMAP_TLS.
 */
const { ImapFlow }    = require('imapflow');
const { query }       = require('./db');

async function getImapConfig() {
  const { rows } = await query(
    `SELECT klic, hodnota FROM nastaveni WHERE klic LIKE 'email_imap_%'`
  );
  const db = rows.reduce((acc, r) => { acc[r.klic] = r.hodnota; return acc; }, {});
  return {
    host:   db.email_imap_host  || process.env.IMAP_HOST  || null,
    port:   parseInt(db.email_imap_port  || process.env.IMAP_PORT  || '993', 10),
    user:   db.email_imap_user  || process.env.IMAP_USER  || null,
    pass:   db.email_imap_pass  || process.env.IMAP_PASS  || null,
    tls:    (db.email_imap_tls  || process.env.IMAP_TLS   || 'true') !== 'false',
  };
}

async function createImapClient() {
  const cfg = await getImapConfig();
  if (!cfg.host || !cfg.user) throw new Error('IMAP není nakonfigurován – vyplňte nastavení v sekci E-mail');

  return new ImapFlow({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.tls,
    auth:   { user: cfg.user, pass: cfg.pass || '' },
    logger: false,
    tls:    { rejectUnauthorized: false }, // povolení self-signed certifikátů
  });
}

/**
 * Otevře připojení, zavolá fn(client), pak se odhlásí.
 */
async function withImap(fn) {
  const client = await createImapClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try { await client.logout(); } catch (_) { /* ignore */ }
  }
}

module.exports = { withImap, getImapConfig };
