'use strict';

const nodemailer = require('nodemailer');
const { query } = require('./db');

function allowInsecureTls() {
  return process.env.ALLOW_SELF_SIGNED_EMAIL_TLS === 'true';
}

async function getSmtpConfig(dbQuery = query) {
  const { rows } = await dbQuery(
    `SELECT klic, hodnota
     FROM nastaveni
     WHERE klic LIKE 'email_smtp_%'`
  );

  const db = rows.reduce((acc, row) => {
    acc[row.klic] = row.hodnota;
    return acc;
  }, {});

  return {
    host: db.email_smtp_host || process.env.SMTP_HOST || null,
    port: parseInt(db.email_smtp_port || process.env.SMTP_PORT || '587', 10),
    user: db.email_smtp_user || process.env.SMTP_USER || null,
    pass: db.email_smtp_pass || process.env.SMTP_PASS || null,
    from: db.email_smtp_from || process.env.SMTP_FROM || null,
    secure: (db.email_smtp_secure || process.env.SMTP_SECURE || 'false') === 'true',
  };
}

async function createSmtpTransporter(dbQuery = query) {
  const smtpCfg = await getSmtpConfig(dbQuery);
  if (!smtpCfg.host || !smtpCfg.user) {
    throw new Error('SMTP není nakonfigurováno – nastavte host a uživatele v Nastavení -> E-mail -> SMTP');
  }

  return {
    smtpCfg,
    transporter: nodemailer.createTransport({
      host: smtpCfg.host,
      port: smtpCfg.port,
      secure: smtpCfg.secure,
      auth: { user: smtpCfg.user, pass: smtpCfg.pass || '' },
      tls: { rejectUnauthorized: !allowInsecureTls() },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    }),
  };
}

module.exports = {
  allowInsecureTls,
  getSmtpConfig,
  createSmtpTransporter,
};
