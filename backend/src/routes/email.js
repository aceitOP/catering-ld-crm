'use strict';
/**
 * E-mail modul – IMAP čtení + SMTP odesílání
 *
 * GET    /api/email/status                          – stav připojení
 * GET    /api/email/folders                         – seznam složek
 * GET    /api/email/messages                        – seznam zpráv
 * GET    /api/email/messages/:uid                   – detail zprávy
 * PATCH  /api/email/messages/:uid/seen              – přečteno/nepřečteno
 * PATCH  /api/email/messages/:uid/flagged           – hvězdička
 * DELETE /api/email/messages/:uid                   – smazat
 * POST   /api/email/messages/:uid/move              – přesunout
 * POST   /api/email/send                            – odeslat / odpovědět
 * POST   /api/email/smtp-test                       – test SMTP připojení
 * GET    /api/email/messages/:uid/extract           – extrahovat data pro zakázku
 * POST   /api/email/messages/:uid/zakazka           – vytvořit zakázku z e-mailu
 * GET    /api/email/messages/:uid/attachments       – seznam příloh
 * POST   /api/email/messages/:uid/attachments/:idx/save – uložit přílohu do dokumentů
 * POST   /api/email/messages/:uid/followup          – vytvořit followup úkol
 * POST   /api/email/messages/:uid/link              – propojit s zakázkou
 * DELETE /api/email/messages/:uid/link              – odpojit od zakázky
 * GET    /api/email/links                           – propojené e-maily (?zakazka_id=)
 * POST   /api/email/check-inbox                     – zkontrolovat nové e-maily od klientů
 * GET    /api/email/sablony                         – šablony odpovědí
 * POST   /api/email/sablony                         – vytvořit šablonu
 * PATCH  /api/email/sablony/:id                     – upravit šablonu
 * DELETE /api/email/sablony/:id                     – smazat šablonu
 */
const router       = require('express').Router();
const nodemailer   = require('nodemailer');
const { simpleParser } = require('mailparser');
const fs           = require('fs');
const path         = require('path');
const { auth }     = require('../middleware/auth');
const { withImap, getImapConfig } = require('../emailImapService');
const { withTransaction, query } = require('../db');
const uploadDir    = process.env.UPLOAD_DIR || './uploads';
const { createNotif } = require('../notifHelper');

router.use(auth);

function allowInsecureTls() {
  return process.env.ALLOW_SELF_SIGNED_EMAIL_TLS === 'true';
}

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

// ── Extrakce dat z e-mailového textu ─────────────────────────────────────────
function extractFromEmail(subject, textBody) {
  const body    = textBody || '';
  const combined = `${subject || ''}\n${body}`;
  const result  = {};

  // Datum – český slovní formát: "10. dubna 2026"
  const monthMap = { 'ledna':1,'února':2,'března':3,'dubna':4,'května':5,'června':6,
    'července':7,'srpna':8,'září':9,'října':10,'listopadu':11,'prosince':12 };
  let m = combined.match(/\b(\d{1,2})\.?\s+(ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince)\s+(20\d{2})\b/i);
  if (m) {
    result.datum_akce = `${m[3]}-${String(monthMap[m[2].toLowerCase()]).padStart(2,'0')}-${String(parseInt(m[1])).padStart(2,'0')}`;
  }
  // Datum – krátký český formát: "10.4.2026" nebo "10. 4. 2026"
  if (!result.datum_akce) {
    m = combined.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\b/);
    if (m) result.datum_akce = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  // Datum – ISO
  if (!result.datum_akce) {
    m = combined.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (m) result.datum_akce = m[1];
  }

  // Čas začátku HH:MM
  m = combined.match(/\b(\d{1,2}):(\d{2})\s*(?:hod(?:in[ay]?)?)?\b/);
  if (m && parseInt(m[1]) < 24 && parseInt(m[2]) < 60) {
    result.cas_zacatek = `${m[1].padStart(2,'0')}:${m[2]}`;
  }

  // Počet hostů / osob
  m = combined.match(/\b(\d+)\s*(?:x\s*)?(hostů|hosté|osob[ay]?|osobách|lidí|pax|guests?|persons?)\b/i);
  if (m) result.pocet_hostu = parseInt(m[1]);

  // Rozpočet klienta (Kč, tisíc Kč)
  m = combined.match(/\b(?:cca\.?\s*)?(\d[\d\s]{1,9})\s*(tisíc\s*kč|tis\.?\s*kč|000\s*kč|kč|czk)\b/i);
  if (m) {
    let val = parseInt(m[1].replace(/\s/g, ''));
    if (/tisíc|tis/i.test(m[2])) val *= 1000;
    if (val > 0 && val < 50000000) result.rozpocet_klienta = val;
  }

  // Telefon (česká čísla)
  m = combined.match(/(?:\+420[\s-]?)?\b(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})\b/);
  if (m) result.telefon = m[0].replace(/[\s-]/g, '');

  // Typ akce → zakázka enum
  const typMap = [
    [['pohřeb','pohreb','smuteční','funeral'],                              'pohreb'],
    [['svatba','wedding','svadbě'],                                        'svatba'],
    [['firemní','firemni','corporate','teambuilding','team building','konference','conference'], 'firemni_akce'],
    [['narozeni','jubileum','oslava','párty','party','soukromá','soukroma','rout','raut','banquet'], 'soukroma_akce'],
    [['závoz','zavoz','vyzvednutí','delivery'],                            'zavoz'],
    [['bistro','pronájem','cafe'],                                         'bistro'],
  ];
  for (const [kws, typ] of typMap) {
    if (kws.some(kw => combined.toLowerCase().includes(kw))) { result.typ = typ; break; }
  }

  // Místo konání (po klíčovém slovu)
  m = combined.match(/(?:místo|venue|adresa|lokalita|v|ve|na)\s*:?\s*([^\n.,!?]{5,60})/i);
  if (m) result.misto_hint = m[1].trim();

  // Firma klienta
  m = combined.match(/(?:firma|společnost|company|pro firmu|za firmu|ze\s+společnosti|ze?\s+firmy)\s*:?\s*([^\n,.<>]{3,60})/i);
  if (m) result.firma = m[1].trim();

  return result;
}

// ── Načtení jedné zprávy z IMAP (helper) ────────────────────────────────────
async function fetchImapMessage(uid, folder) {
  return withImap(async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      let parsed = null;
      for await (const msg of client.fetch({ uid }, { source: true }, { uid: true })) {
        parsed = await simpleParser(msg.source);
      }
      return parsed;
    } finally { lock.release(); }
  });
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

// ── Načtení SMTP konfigurace z nastavení (s fallbackem na env proměnné) ───────
async function getSmtpConfig() {
  const { rows } = await query(
    `SELECT klic, hodnota FROM nastaveni WHERE klic LIKE 'email_smtp_%'`
  );
  const db = rows.reduce((acc, r) => { acc[r.klic] = r.hodnota; return acc; }, {});
  return {
    host:   db.email_smtp_host   || process.env.SMTP_HOST   || null,
    port:   parseInt(db.email_smtp_port   || process.env.SMTP_PORT   || '587', 10),
    user:   db.email_smtp_user   || process.env.SMTP_USER   || null,
    pass:   db.email_smtp_pass   || process.env.SMTP_PASS   || null,
    from:   db.email_smtp_from   || process.env.SMTP_FROM   || null,
    secure: (db.email_smtp_secure || process.env.SMTP_SECURE || 'false') === 'true',
  };
}

// ── POST /smtp-test ───────────────────────────────────────────────────────────
router.post('/smtp-test', async (req, res) => {
  const smtpCfg = await getSmtpConfig().catch(err => ({ _err: err.message }));
  if (smtpCfg._err) return res.status(500).json({ ok: false, error: smtpCfg._err });
  if (!smtpCfg.host || !smtpCfg.user) {
    return res.json({ ok: false, error: 'SMTP není nakonfigurováno (chybí host nebo uživatel)' });
  }
  const info = { host: smtpCfg.host, port: smtpCfg.port, secure: smtpCfg.secure, user: smtpCfg.user };
  try {
    const transporter = nodemailer.createTransport({
      host: smtpCfg.host, port: smtpCfg.port, secure: smtpCfg.secure,
      auth: { user: smtpCfg.user, pass: smtpCfg.pass || '' },
      tls: { rejectUnauthorized: !allowInsecureTls() },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
    });
    await transporter.verify();
    res.json({ ok: true, info });
  } catch (err) {
    const hint = err.message.includes('timeout')
      ? `Connection timeout na ${smtpCfg.host}:${smtpCfg.port}. Zkuste port 2525 (Render blokuje 587/465). Nebo použijte Brevo/Mailgun SMTP relay.`
      : err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')
        ? `Server ${smtpCfg.host}:${smtpCfg.port} není dostupný. Zkontrolujte SMTP host.`
        : err.message.includes('auth') || err.message.includes('535')
          ? 'Chybné přihlašovací údaje (uživatel nebo heslo).'
          : null;
    res.json({ ok: false, error: err.message, hint, info });
  }
});

// ── POST /send ────────────────────────────────────────────────────────────────
router.post('/send', async (req, res, next) => {
  try {
    const { to, cc, subject, html, text, inReplyTo, references } = req.body;
    if (!to || !subject) return res.status(400).json({ error: 'Chybí příjemce nebo předmět' });

    const smtpCfg = await getSmtpConfig();

    if (!smtpCfg.host || !smtpCfg.user) {
      return res.status(500).json({ error: 'SMTP není nakonfigurováno – nastavte v Nastavení → E-mail (IMAP) → SMTP sekce' });
    }

    const transporter = nodemailer.createTransport({
      host:               smtpCfg.host,
      port:               smtpCfg.port,
      secure:             smtpCfg.secure,
      auth:               { user: smtpCfg.user, pass: smtpCfg.pass || '' },
      tls:                { rejectUnauthorized: !allowInsecureTls() },
      connectionTimeout:  10000,
      greetingTimeout:    10000,
      socketTimeout:      10000,
    });
    const smtpFrom = smtpCfg.from || smtpCfg.user;

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

// ── GET /messages/:uid/extract – extrahovat data z e-mailu (bez DB změn) ──────
router.get('/messages/:uid/extract', async (req, res, next) => {
  try {
    const folder  = req.query.folder || 'INBOX';
    const uid     = parseInt(req.params.uid, 10);
    const message = await fetchImapMessage(uid, folder);
    if (!message) return res.status(404).json({ error: 'Zpráva nenalezena' });

    const fromAddr  = message.from?.value?.[0] || {};
    const senderEmail = fromAddr.address || '';
    const nameParts = (fromAddr.name || '').trim().split(/\s+/);

    // Existující klient v DB?
    let existingKlient = null;
    if (senderEmail) {
      const { rows } = await query(
        'SELECT id, jmeno, prijmeni, firma, telefon, email FROM klienti WHERE email = $1 LIMIT 1',
        [senderEmail]
      );
      if (rows.length) existingKlient = rows[0];
    }

    const extracted = extractFromEmail(message.subject || '', message.text || '');

    res.json({
      sender:          { jmeno: nameParts[0] || '', prijmeni: nameParts.slice(1).join(' ') || '', email: senderEmail },
      existingKlient,
      predmet:         message.subject || '',
      textPreview:     (message.text || '').slice(0, 1500),
      extracted,
    });
  } catch (err) { next(err); }
});

// ── POST /messages/:uid/zakazka – vytvořit zakázku (přijímá body z formuláře) ─
router.post('/messages/:uid/zakazka', async (req, res, next) => {
  try {
    const folder  = req.query.folder || 'INBOX';
    const uid     = parseInt(req.params.uid, 10);
    const message = await fetchImapMessage(uid, folder);
    if (!message) return res.status(404).json({ error: 'Zpráva nenalezena' });

    // ── Data odeslaná z formuláře (nebo auto-detekce jako fallback) ────────
    const body = req.body || {};
    const fromAddr  = message.from?.value?.[0] || {};
    const senderEmail = fromAddr.address || null;
    const nameParts = (fromAddr.name || '').trim().split(/\s+/);
    const extracted = extractFromEmail(message.subject || '', message.text || '');

    // Klient: formulář > existující DB match > auto z e-mailu
    const klientData = body.klient || {};
    const klientEmail    = klientData.email   ?? senderEmail;
    const klientJmeno    = klientData.jmeno   ?? nameParts[0] ?? 'Neznámý';
    const klientPrijmeni = klientData.prijmeni ?? nameParts.slice(1).join(' ') ?? null;
    const klientTelefon  = klientData.telefon  ?? extracted.telefon ?? null;
    const klientFirma    = klientData.firma    ?? extracted.firma   ?? null;
    const klientIdForce  = klientData.klient_id ?? null; // použít existujícího

    // Zakázka: formulář > auto-extrakce > fallback
    const nazev         = body.nazev          ?? `${message.subject || 'Poptávka'} – ${[klientJmeno, klientPrijmeni].filter(Boolean).join(' ') || klientEmail || 'Neznámý'}`;
    const typ           = body.typ            ?? extracted.typ      ?? 'soukroma_akce';
    const datum_akce    = body.datum_akce     ?? extracted.datum_akce ?? null;
    const cas_zacatek   = body.cas_zacatek    ?? extracted.cas_zacatek ?? null;
    const misto         = body.misto          ?? null;
    const pocet_hostu   = body.pocet_hostu    ? parseInt(body.pocet_hostu) : (extracted.pocet_hostu ?? null);
    const poznamka      = body.poznamka_klient ?? message.text?.slice(0, 3000) ?? null;
    const rozpocet      = body.rozpocet_klienta ? parseFloat(body.rozpocet_klienta) : (extracted.rozpocet_klienta ?? null);

    let zakazkaId, cislo;

    await withTransaction(async (dbClient) => {
      // Klient: použít existující ID / najít podle e-mailu / vytvořit nový
      let klientId = klientIdForce;
      if (!klientId && klientEmail) {
        const ex = await dbClient.query('SELECT id FROM klienti WHERE email = $1 LIMIT 1', [klientEmail]);
        if (ex.rows.length) klientId = ex.rows[0].id;
      }
      if (!klientId) {
        const kr = await dbClient.query(
          `INSERT INTO klienti (jmeno, prijmeni, email, telefon, firma, zdroj)
           VALUES ($1,$2,$3,$4,$5,'email') RETURNING id`,
          [klientJmeno, klientPrijmeni, klientEmail, klientTelefon, klientFirma]
        );
        klientId = kr.rows[0].id;
      } else if (klientTelefon || klientFirma) {
        // Doplnit chybějící kontaktní údaje
        await dbClient.query(
          `UPDATE klienti SET
            telefon = COALESCE(NULLIF(telefon,''), $1),
            firma   = COALESCE(NULLIF(firma,''),   $2)
           WHERE id = $3`,
          [klientTelefon, klientFirma, klientId]
        );
      }

      cislo = await genCisloZakazky(dbClient);
      const zakRes = await dbClient.query(
        `INSERT INTO zakazky
           (cislo, nazev, typ, stav, klient_id, datum_akce, cas_zacatek, misto,
            pocet_hostu, rozpocet_klienta, poznamka_klient, obchodnik_id)
         VALUES ($1,$2,$3,'nova_poptavka',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [cislo, nazev, typ, klientId, datum_akce || null, cas_zacatek || null,
         misto || null, pocet_hostu, rozpocet, poznamka, req.user?.id || null]
      );
      zakazkaId = zakRes.rows[0].id;

      await dbClient.query(
        `INSERT INTO zakazky_history (zakazka_id, stav_po, poznamka)
         VALUES ($1,'nova_poptavka','Zakázka vytvořena z e-mailu')`,
        [zakazkaId]
      );
    });

    createNotif({
      typ:     'nova_poptavka',
      titulek: `Zakázka z e-mailu — ${message.subject || nazev}`,
      zprava:  klientEmail ? `Od: ${klientEmail}` : null,
      odkaz:   `/zakazky/${zakazkaId}`,
    });

    res.status(201).json({ ok: true, zakazka_id: zakazkaId, cislo });
  } catch (err) { next(err); }
});

// ── GET /messages/:uid/attachments – seznam příloh (bez stažení těla) ─────────
router.get('/messages/:uid/attachments', async (req, res, next) => {
  try {
    const folder  = req.query.folder || 'INBOX';
    const uid     = parseInt(req.params.uid, 10);
    const message = await fetchImapMessage(uid, folder);
    if (!message) return res.status(404).json({ error: 'Zpráva nenalezena' });

    const attachments = (message.attachments || []).map((att, idx) => ({
      index:    idx,
      filename: att.filename || `priloha-${idx + 1}`,
      mimeType: att.contentType || 'application/octet-stream',
      size:     att.size || att.content?.length || 0,
    }));
    res.json({ attachments });
  } catch (err) { next(err); }
});

// ── POST /messages/:uid/attachments/:idx/save – uložit přílohu do dokumentů ──
router.post('/messages/:uid/attachments/:idx/save', async (req, res, next) => {
  try {
    const folder  = req.query.folder || 'INBOX';
    const uid     = parseInt(req.params.uid, 10);
    const idx     = parseInt(req.params.idx, 10);
    const { zakazka_id, klient_id, slozka_id } = req.body;

    const message = await fetchImapMessage(uid, folder);
    if (!message) return res.status(404).json({ error: 'Zpráva nenalezena' });

    const att = (message.attachments || [])[idx];
    if (!att) return res.status(404).json({ error: 'Příloha nenalezena' });

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext      = path.extname(att.filename || '').toLowerCase() || '.bin';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, att.content);

    const { rows: [doc] } = await query(
      `INSERT INTO dokumenty (nazev, filename, mime_type, velikost, kategorie, zakazka_id, klient_id, nahral_id, poznamka, slozka_id)
       VALUES ($1,$2,$3,$4,'priloha',$5,$6,$7,$8,$9) RETURNING id, nazev`,
      [att.filename || safeName, safeName, att.contentType || 'application/octet-stream',
       att.content?.length || 0, zakazka_id || null, klient_id || null,
       req.user.id, `Příloha z e-mailu: ${message.subject || ''}`, slozka_id || null]
    );
    res.status(201).json({ ok: true, dokument: doc });
  } catch (err) { next(err); }
});

// ── POST /messages/:uid/followup – vytvořit followup úkol ─────────────────────
router.post('/messages/:uid/followup', async (req, res, next) => {
  try {
    const { zakazka_id, titulek, termin, poznamka } = req.body;
    if (!zakazka_id) return res.status(400).json({ error: 'Chybí zakazka_id' });
    if (!titulek)    return res.status(400).json({ error: 'Chybí titulek' });

    const { rows: [u] } = await query(
      `INSERT INTO followup_ukoly (zakazka_id, typ, titulek, termin, poznamka)
       VALUES ($1,'email',$2,$3,$4) RETURNING id`,
      [zakazka_id, titulek, termin || null, poznamka || null]
    );
    res.status(201).json({ ok: true, id: u.id });
  } catch (err) { next(err); }
});

// ── POST /messages/:uid/link – propojit e-mail se zakázkou ────────────────────
router.post('/messages/:uid/link', async (req, res, next) => {
  try {
    const folder = req.query.folder || 'INBOX';
    const uid    = parseInt(req.params.uid, 10);
    const { zakazka_id } = req.body;
    if (!zakazka_id) return res.status(400).json({ error: 'Chybí zakazka_id' });

    const message = await fetchImapMessage(uid, folder);
    if (!message) return res.status(404).json({ error: 'Zpráva nenalezena' });

    const fromAddr = message.from?.value?.[0] || {};
    const msgId    = message.messageId || null;

    // Upsert – stejný message-id + zakazka nesmí být duplicitní
    const { rows: [link] } = await query(
      `INSERT INTO email_links (message_id, uid, folder, subject, from_email, from_name, zakazka_id, linked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [msgId, uid, folder, message.subject || '', fromAddr.address || '',
       fromAddr.name || '', zakazka_id, req.user?.id || null]
    );
    if (!link) return res.json({ ok: true, duplicate: true });
    res.status(201).json({ ok: true, id: link.id });
  } catch (err) { next(err); }
});

// ── DELETE /messages/:uid/link – odpojit od zakázky ───────────────────────────
router.delete('/messages/:uid/link', async (req, res, next) => {
  try {
    const uid        = parseInt(req.params.uid, 10);
    const zakazka_id = req.query.zakazka_id;
    if (!zakazka_id) return res.status(400).json({ error: 'Chybí zakazka_id' });

    await query('DELETE FROM email_links WHERE uid = $1 AND zakazka_id = $2', [uid, zakazka_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /links – propojené e-maily zakázky ────────────────────────────────────
router.get('/links', async (req, res, next) => {
  try {
    const { zakazka_id } = req.query;
    if (!zakazka_id) return res.status(400).json({ error: 'Chybí zakazka_id' });

    const { rows } = await query(
      `SELECT el.*, u.jmeno AS linked_by_jmeno
       FROM email_links el
       LEFT JOIN uzivatele u ON u.id = el.linked_by
       WHERE el.zakazka_id = $1
       ORDER BY el.linked_at DESC`,
      [zakazka_id]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ── POST /check-inbox – zkontrolovat nové e-maily od klientů ─────────────────
router.post('/check-inbox', async (req, res, next) => {
  try {
    const folder  = req.body?.folder || 'INBOX';
    const results = [];

    const messages = await withImap(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const msgs = [];
        // Načti posledních 50 nepřečtených
        for await (const msg of client.fetch(
          { seen: false },
          { envelope: true, uid: true },
          { uid: true }
        )) {
          msgs.push({
            uid:       msg.uid,
            subject:   msg.envelope?.subject || '(bez předmětu)',
            from:      msg.envelope?.from?.[0] || {},
            date:      msg.envelope?.date,
          });
          if (msgs.length >= 50) break;
        }
        return msgs;
      } finally { lock.release(); }
    });

    for (const m of messages) {
      const email = m.from?.mailbox && m.from?.host
        ? `${m.from.mailbox}@${m.from.host}`
        : null;
      if (!email) continue;

      const { rows: [klient] } = await query(
        'SELECT id, jmeno, prijmeni FROM klienti WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      if (klient) {
        results.push({ uid: m.uid, email, subject: m.subject, klient });
        await query(
          `INSERT INTO notifikace (typ, titulek, zprava, odkaz)
           VALUES ('email_od_klienta', $1, $2, '/email')
           ON CONFLICT DO NOTHING`,
          [`Nový e-mail od ${klient.jmeno} ${klient.prijmeni || ''}`.trim(),
           `Předmět: ${m.subject}`]
        ).catch(() => {}); // notifikace jsou bonus, neselhávej kvůli nim
      }
    }

    res.json({ checked: messages.length, matches: results.length, clients: results });
  } catch (err) { next(err); }
});

// ── Šablony odpovědí CRUD ─────────────────────────────────────────────────────
router.get('/sablony', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM email_sablony ORDER BY poradi, id');
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.post('/sablony', async (req, res, next) => {
  try {
    const { nazev, predmet_prefix, telo, poradi } = req.body;
    if (!nazev) return res.status(400).json({ error: 'Chybí název' });
    const { rows: [r] } = await query(
      `INSERT INTO email_sablony (nazev, predmet_prefix, telo, poradi) VALUES ($1,$2,$3,$4) RETURNING *`,
      [nazev, predmet_prefix || '', telo || '', parseInt(poradi) || 0]
    );
    res.status(201).json(r);
  } catch (err) { next(err); }
});

router.patch('/sablony/:id', async (req, res, next) => {
  try {
    const { nazev, predmet_prefix, telo, poradi } = req.body;
    const { rows: [r] } = await query(
      `UPDATE email_sablony SET nazev=$1, predmet_prefix=$2, telo=$3, poradi=$4
       WHERE id=$5 RETURNING *`,
      [nazev, predmet_prefix || '', telo || '', parseInt(poradi) || 0, req.params.id]
    );
    if (!r) return res.status(404).json({ error: 'Šablona nenalezena' });
    res.json(r);
  } catch (err) { next(err); }
});

router.delete('/sablony/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM email_sablony WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
