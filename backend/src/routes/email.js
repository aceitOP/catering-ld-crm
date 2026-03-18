'use strict';
/**
 * E-mail modul – IMAP čtení + SMTP odesílání
 *
 * GET    /api/email/status               – stav připojení (test)
 * GET    /api/email/folders              – seznam složek
 * GET    /api/email/messages             – seznam zpráv (?folder=INBOX&page=1&limit=30)
 * GET    /api/email/messages/:uid        – detail zprávy (?folder=INBOX)
 * PATCH  /api/email/messages/:uid/seen   – označit přečtenou/nepřečtenou
 * DELETE /api/email/messages/:uid        – smazat (?folder=INBOX&permanent=true)
 * POST   /api/email/messages/:uid/move   – přesunout do složky
 * POST   /api/email/send                 – odeslat / odpovědět
 * POST   /api/email/messages/:uid/zakazka – vytvořit zakázku z e-mailu
 */
const router       = require('express').Router();
const nodemailer   = require('nodemailer');
const { simpleParser } = require('mailparser');
const auth         = require('../middleware/auth');
const { withImap, getImapConfig } = require('../emailImapService');
const { query, withTransaction } = require('../db');
const { createNotif } = require('../notifHelper');

router.use(auth);

// ── Pomocník pro číslo zakázky (inline – zakazky.js ho neexportuje) ──────────
async function genCisloZakazky(client) {
  const rok = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT cislo FROM zakazky WHERE cislo LIKE $1 ORDER BY cislo DESC LIMIT 1 FOR UPDATE`,
    [`ZAK-${rok}-%`]
  );
  if (!rows.length) return `ZAK-${rok}-001`;
  const last = parseInt(rows[0].cislo.split('-')[2], 10);
  return `ZAK-${rok}-${String(last + 1).padStart(3, '0')}`;
}

// ── Flags helper (ImapFlow vrací Set i Array) ────────────────────────────────
function hasFlag(flags, flag) {
  if (!flags) return false;
  if (typeof flags.has === 'function') return flags.has(flag);
  return Array.isArray(flags) && flags.includes(flag);
}

// ── GET /status ───────────────────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    await withImap(async (client) => {
      await client.status('INBOX', { messages: true });
    });
    res.json({ ok: true, connected: true });
  } catch (err) {
    res.json({ ok: false, connected: false, error: err.message });
  }
});

// ── GET /folders ──────────────────────────────────────────────────────────────
router.get('/folders', async (req, res, next) => {
  try {
    const folders = await withImap(async (client) => {
      const list = await client.list();
      return list.map(f => ({
        path:       f.path,
        name:       f.name,
        specialUse: f.specialUse || null,
        flags:      [...(f.flags || [])],
      }));
    });
    res.json({ data: folders });
  } catch (err) { next(err); }
});

// ── GET /messages ─────────────────────────────────────────────────────────────
router.get('/messages', async (req, res, next) => {
  try {
    const folder = req.query.folder || 'INBOX';
    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(50, parseInt(req.query.limit || '30', 10));

    const result = await withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const status = await client.status(folder, { messages: true, unseen: true });
        const total  = status.messages || 0;

        if (total === 0) return { total: 0, unseen: 0, page, limit, messages: [] };

        // Sesbírej všechny záhlaví (envelope + flags)
        const all = [];
        for await (const msg of client.fetch('1:*', {
          uid: true, envelope: true, flags: true, size: true,
        })) {
          all.push({
            uid:      msg.uid,
            envelope: msg.envelope,
            flags:    msg.flags,
            size:     msg.size,
          });
        }

        // Seřadit sestupně (nejnovější první)
        all.sort((a, b) => b.uid - a.uid);
        const paged = all.slice((page - 1) * limit, page * limit);

        return {
          total,
          unseen: status.unseen || 0,
          page,
          limit,
          messages: paged.map(m => ({
            uid:     m.uid,
            subject: m.envelope?.subject || '(bez předmětu)',
            from:    m.envelope?.from?.[0]  || null,
            to:      m.envelope?.to         || [],
            date:    m.envelope?.date       || null,
            seen:    hasFlag(m.flags, '\\Seen'),
            flagged: hasFlag(m.flags, '\\Flagged'),
            size:    m.size,
          })),
        };
      } finally {
        lock.release();
      }
    });

    res.json({ data: result });
  } catch (err) { next(err); }
});

// ── GET /messages/:uid ────────────────────────────────────────────────────────
router.get('/messages/:uid', async (req, res, next) => {
  try {
    const folder = req.query.folder || 'INBOX';
    const uid    = parseInt(req.params.uid, 10);

    const message = await withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        // Označ jako přečtené
        await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });

        let parsed = null;
        for await (const msg of client.fetch(
          { uid },
          { source: true, flags: true },
          { uid: true }
        )) {
          parsed      = await simpleParser(msg.source);
          parsed._uid   = msg.uid;
          parsed._flags = msg.flags;
        }
        return parsed;
      } finally {
        lock.release();
      }
    });

    if (!message) return res.status(404).json({ error: 'Zpráva nenalezena' });

    res.json({
      data: {
        uid:         message._uid,
        subject:     message.subject     || '(bez předmětu)',
        from:        message.from?.value  || [],
        to:          message.to?.value    || [],
        cc:          message.cc?.value    || [],
        date:        message.date         || null,
        text:        message.text         || null,
        html:        message.html         || null,
        seen:        hasFlag(message._flags, '\\Seen'),
        flagged:     hasFlag(message._flags, '\\Flagged'),
        messageId:   message.messageId    || null,
        inReplyTo:   message.inReplyTo    || null,
        references:  message.references   || null,
        attachments: (message.attachments || []).map(a => ({
          filename:    a.filename,
          contentType: a.contentType,
          size:        a.size,
        })),
      },
    });
  } catch (err) { next(err); }
});

// ── PATCH /messages/:uid/seen ─────────────────────────────────────────────────
router.patch('/messages/:uid/seen', async (req, res, next) => {
  try {
    const folder = req.query.folder || 'INBOX';
    const uid    = parseInt(req.params.uid, 10);
    const { seen } = req.body;

    await withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        if (seen) {
          await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
        } else {
          await client.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true });
        }
      } finally { lock.release(); }
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /messages/:uid/flagged ──────────────────────────────────────────────
router.patch('/messages/:uid/flagged', async (req, res, next) => {
  try {
    const folder  = req.query.folder || 'INBOX';
    const uid     = parseInt(req.params.uid, 10);
    const { flagged } = req.body;

    await withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        if (flagged) {
          await client.messageFlagsAdd({ uid }, ['\\Flagged'], { uid: true });
        } else {
          await client.messageFlagsRemove({ uid }, ['\\Flagged'], { uid: true });
        }
      } finally { lock.release(); }
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── DELETE /messages/:uid ─────────────────────────────────────────────────────
router.delete('/messages/:uid', async (req, res, next) => {
  try {
    const folder    = req.query.folder || 'INBOX';
    const uid       = parseInt(req.params.uid, 10);
    const permanent = req.query.permanent === 'true';

    await withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        if (permanent) {
          await client.messageDelete({ uid }, { uid: true });
        } else {
          // Přesun do Koše
          const folders = await client.list();
          const trash   = folders.find(f =>
            f.specialUse === '\\Trash' || /trash|ko[sš]/i.test(f.name)
          );
          if (trash && trash.path !== folder) {
            await client.messageMove({ uid }, trash.path, { uid: true });
          } else {
            await client.messageDelete({ uid }, { uid: true });
          }
        }
      } finally { lock.release(); }
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /messages/:uid/move ──────────────────────────────────────────────────
router.post('/messages/:uid/move', async (req, res, next) => {
  try {
    const folder = req.query.folder || 'INBOX';
    const uid    = parseInt(req.params.uid, 10);
    const { target } = req.body;
    if (!target) return res.status(400).json({ error: 'Chybí cílová složka' });

    await withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageMove({ uid }, target, { uid: true });
      } finally { lock.release(); }
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /send ────────────────────────────────────────────────────────────────
router.post('/send', async (req, res, next) => {
  try {
    const { to, cc, subject, html, text, inReplyTo, references } = req.body;
    if (!to || !subject) return res.status(400).json({ error: 'Chybí příjemce nebo předmět' });

    // SMTP konfigurace – primárně env proměnné (jako emailService.js), fallback IMAP user
    const imapCfg = await getImapConfig();
    const smtpHost = process.env.SMTP_HOST || imapCfg.host;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER || imapCfg.user;
    const smtpPass = process.env.SMTP_PASS || imapCfg.pass;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser) {
      return res.status(500).json({ error: 'SMTP není nakonfigurován' });
    }

    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: smtpUser, pass: smtpPass },
      tls:    { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from:       smtpFrom,
      to:         Array.isArray(to) ? to.join(', ') : to,
      cc:         cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
      subject,
      html:       html || undefined,
      text:       text || undefined,
      inReplyTo:  inReplyTo  || undefined,
      references: references || undefined,
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /messages/:uid/zakazka ───────────────────────────────────────────────
router.post('/messages/:uid/zakazka', async (req, res, next) => {
  try {
    const folder = req.query.folder || 'INBOX';
    const uid    = parseInt(req.params.uid, 10);

    // Načti e-mail
    const message = await withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        let parsed = null;
        for await (const msg of client.fetch({ uid }, { source: true }, { uid: true })) {
          parsed = await simpleParser(msg.source);
        }
        return parsed;
      } finally { lock.release(); }
    });

    if (!message) return res.status(404).json({ error: 'Zpráva nenalezena' });

    const fromAddr = message.from?.value?.[0] || {};
    const email    = fromAddr.address || null;
    const nameParts = (fromAddr.name || '').trim().split(/\s+/);
    const jmeno    = nameParts[0] || null;
    const prijmeni = nameParts.slice(1).join(' ') || null;
    const predmet  = message.subject || 'E-mail poptávka';
    const zprava   = message.text || null;

    let zakazkaId, cislo;

    await withTransaction(async (client) => {
      // Najít nebo vytvořit klienta
      let klientId;
      if (email) {
        const ex = await client.query('SELECT id FROM klienti WHERE email = $1 LIMIT 1', [email]);
        if (ex.rows.length) klientId = ex.rows[0].id;
      }
      if (!klientId) {
        const kr = await client.query(
          `INSERT INTO klienti (jmeno, prijmeni, email, zdroj) VALUES ($1,$2,$3,'email') RETURNING id`,
          [jmeno || 'Neznámý', prijmeni, email]
        );
        klientId = kr.rows[0].id;
      }

      cislo = await genCisloZakazky(client);
      const klientNazev = [jmeno, prijmeni].filter(Boolean).join(' ') || email || 'Poptávka';
      const nazev = `${predmet} – ${klientNazev}`;

      const zakRes = await client.query(
        `INSERT INTO zakazky (cislo, nazev, stav, klient_id, poznamka_klient)
         VALUES ($1,$2,'nova_poptavka',$3,$4) RETURNING *`,
        [cislo, nazev, klientId, zprava]
      );
      const z = zakRes.rows[0];
      zakazkaId = z.id;

      await client.query(
        `INSERT INTO zakazky_history (zakazka_id, stav_po, poznamka)
         VALUES ($1,'nova_poptavka','Zakázka vytvořena z e-mailu')`,
        [z.id]
      );
    });

    createNotif({
      typ:    'nova_poptavka',
      titulek: `Zakázka z e-mailu — ${predmet}`,
      zprava: email ? `Od: ${email}` : null,
      odkaz:  `/zakazky/${zakazkaId}`,
    });

    res.status(201).json({ ok: true, zakazka_id: zakazkaId, cislo });
  } catch (err) { next(err); }
});

module.exports = router;
