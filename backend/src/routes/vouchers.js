'use strict';

const express = require('express');
const crypto = require('crypto');
const { query, withTransaction } = require('../db');
const { auth, requireCapability } = require('../middleware/auth');
const { loadFirmaSettings } = require('../firmaSettings');
const { resolveDocumentBranding } = require('../documentBranding');
const { sendVoucherEmail } = require('../emailService');
const { isPdfRequested, sendPdfResponse } = require('../pdfService');

const router = express.Router();

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

async function generateVoucherCode(client) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const code = `VCH-${year}-${suffix}`;
    const exists = await client.query('SELECT 1 FROM vouchers WHERE kod = $1 LIMIT 1', [code]);
    if (!exists.rows.length) return code;
  }
  throw new Error('Nepodařilo se vygenerovat unikátní kód poukazu.');
}

function generateVoucherPublicToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function logVoucherEvent(dbClientOrQuery, voucherId, eventType, options = {}) {
  const run = typeof dbClientOrQuery.query === 'function'
    ? dbClientOrQuery.query.bind(dbClientOrQuery)
    : dbClientOrQuery;

  await run(
    `
      INSERT INTO voucher_events (
        voucher_id, event_type, previous_status, next_status, payload, actor_id, actor_label
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      voucherId,
      eventType,
      options.previousStatus || null,
      options.nextStatus || null,
      options.payload ? JSON.stringify(options.payload) : null,
      options.actorId || null,
      options.actorLabel || null,
    ]
  );
}

function buildVoucherVerifyUrl(token) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/voucher/${token}`;
}

async function loadVoucher(id) {
  const { rows } = await query(
    `
      SELECT
        v.*,
        k.jmeno AS klient_jmeno,
        k.prijmeni AS klient_prijmeni,
        k.firma AS klient_firma,
        z.cislo AS zakazka_cislo,
        z.nazev AS zakazka_nazev,
        u.jmeno AS created_by_jmeno,
        u.prijmeni AS created_by_prijmeni
      FROM vouchers v
      LEFT JOIN klienti k ON k.id = v.klient_id
      LEFT JOIN zakazky z ON z.id = v.zakazka_id
      LEFT JOIN uzivatele u ON u.id = v.created_by
      WHERE v.id = $1
      LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

router.get('/public/:token', async (req, res, next) => {
  try {
    const { rows } = await query(
      `
        SELECT kod, title, nominal_value, fulfillment_note, recipient_name, expires_at, status, verify_url
        FROM vouchers
        WHERE public_token = $1
        LIMIT 1
      `,
      [req.params.token]
    );
    const voucher = rows[0];
    if (!voucher) return res.status(404).json({ error: 'Poukaz nebyl nalezen.' });
    res.json(voucher);
  } catch (err) {
    next(err);
  }
});

router.get('/', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const where = [];
    const params = [];
    let p = 1;

    if (status) {
      where.push(`v.status = $${p++}`);
      params.push(status);
    }
    if (q) {
      where.push(`(v.kod ILIKE $${p} OR v.title ILIKE $${p} OR v.recipient_name ILIKE $${p} OR v.buyer_name ILIKE $${p})`);
      params.push(`%${q}%`);
      p += 1;
    }

    const { rows } = await query(
      `
        SELECT
          v.*,
          k.firma AS klient_firma,
          k.jmeno AS klient_jmeno,
          k.prijmeni AS klient_prijmeni,
          z.cislo AS zakazka_cislo
        FROM vouchers v
        LEFT JOIN klienti k ON k.id = v.klient_id
        LEFT JOIN zakazky z ON z.id = v.zakazka_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY v.created_at DESC
      `,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const voucher = await loadVoucher(req.params.id);
    if (!voucher) return res.status(404).json({ error: 'Poukaz nebyl nalezen.' });
    res.json(voucher);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/history', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `
        SELECT
          ve.*,
          u.jmeno,
          u.prijmeni
        FROM voucher_events ve
        LEFT JOIN uzivatele u ON u.id = ve.actor_id
        WHERE ve.voucher_id = $1
        ORDER BY ve.created_at DESC, ve.id DESC
      `,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (!String(payload.title || '').trim()) {
      return res.status(400).json({ error: 'Název poukazu je povinný.' });
    }

    const result = await withTransaction(async (client) => {
      const code = await generateVoucherCode(client);
      const publicToken = generateVoucherPublicToken();
      const verifyUrl = buildVoucherVerifyUrl(publicToken);
      const qrPayload = verifyUrl;

      const { rows } = await client.query(
        `
          INSERT INTO vouchers (
            kod, public_token, title, nominal_value, fulfillment_note,
            recipient_name, recipient_email, buyer_name, buyer_email,
            klient_id, zakazka_id, expires_at, status, qr_payload, verify_url, note, created_by, updated_by
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          RETURNING id
        `,
        [
          code,
          publicToken,
          payload.title.trim(),
          payload.nominal_value || null,
          payload.fulfillment_note || null,
          payload.recipient_name || null,
          normalizeEmail(payload.recipient_email),
          payload.buyer_name || null,
          normalizeEmail(payload.buyer_email),
          payload.klient_id || null,
          payload.zakazka_id || null,
          payload.expires_at || null,
          payload.status || 'draft',
          qrPayload,
          verifyUrl,
          payload.note || null,
          req.user.id,
          req.user.id,
        ]
      );

      await logVoucherEvent(client, rows[0].id, 'created', {
        nextStatus: payload.status || 'draft',
        actorId: req.user.id,
        actorLabel: `${req.user.jmeno} ${req.user.prijmeni}`.trim(),
        payload,
      });

      return loadVoucher(rows[0].id);
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const current = await loadVoucher(req.params.id);
    if (!current) return res.status(404).json({ error: 'Poukaz nebyl nalezen.' });

    const payload = req.body || {};
    const nextStatus = payload.status || current.status;

    const { rows } = await query(
      `
        UPDATE vouchers
        SET title = $2,
            nominal_value = $3,
            fulfillment_note = $4,
            recipient_name = $5,
            recipient_email = $6,
            buyer_name = $7,
            buyer_email = $8,
            klient_id = $9,
            zakazka_id = $10,
            expires_at = $11,
            status = $12,
            note = $13,
            updated_by = $14,
            redeemed_at = CASE WHEN $12 = 'redeemed' AND redeemed_at IS NULL THEN NOW() ELSE redeemed_at END
        WHERE id = $1
        RETURNING id
      `,
      [
        req.params.id,
        payload.title || current.title,
        Object.prototype.hasOwnProperty.call(payload, 'nominal_value') ? (payload.nominal_value || null) : current.nominal_value,
        Object.prototype.hasOwnProperty.call(payload, 'fulfillment_note') ? (payload.fulfillment_note || null) : current.fulfillment_note,
        Object.prototype.hasOwnProperty.call(payload, 'recipient_name') ? (payload.recipient_name || null) : current.recipient_name,
        Object.prototype.hasOwnProperty.call(payload, 'recipient_email') ? normalizeEmail(payload.recipient_email) : current.recipient_email,
        Object.prototype.hasOwnProperty.call(payload, 'buyer_name') ? (payload.buyer_name || null) : current.buyer_name,
        Object.prototype.hasOwnProperty.call(payload, 'buyer_email') ? normalizeEmail(payload.buyer_email) : current.buyer_email,
        Object.prototype.hasOwnProperty.call(payload, 'klient_id') ? (payload.klient_id || null) : current.klient_id,
        Object.prototype.hasOwnProperty.call(payload, 'zakazka_id') ? (payload.zakazka_id || null) : current.zakazka_id,
        Object.prototype.hasOwnProperty.call(payload, 'expires_at') ? (payload.expires_at || null) : current.expires_at,
        nextStatus,
        Object.prototype.hasOwnProperty.call(payload, 'note') ? (payload.note || null) : current.note,
        req.user.id,
      ]
    );

    await logVoucherEvent(query, req.params.id, 'updated', {
      previousStatus: current.status,
      nextStatus,
      actorId: req.user.id,
      actorLabel: `${req.user.jmeno} ${req.user.prijmeni}`.trim(),
      payload,
    });

    const updated = await loadVoucher(rows[0].id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/send', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const voucher = await loadVoucher(req.params.id);
    if (!voucher) return res.status(404).json({ error: 'Poukaz nebyl nalezen.' });
    const to = normalizeEmail(req.body?.email) || voucher.recipient_email || voucher.buyer_email;
    if (!to) return res.status(400).json({ error: 'Chybí e-mail příjemce poukazu.' });

    const firma = await loadFirmaSettings();
    await sendVoucherEmail({ to, voucher, firma, attachPdf: true });

    await logVoucherEvent(query, req.params.id, 'sent', {
      previousStatus: voucher.status,
      nextStatus: voucher.status,
      actorId: req.user.id,
      actorLabel: `${req.user.jmeno} ${req.user.prijmeni}`.trim(),
      payload: { to },
    });

    res.json({ message: `Poukaz byl odeslán na ${to}.` });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/redeem', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const voucher = await loadVoucher(req.params.id);
    if (!voucher) return res.status(404).json({ error: 'Poukaz nebyl nalezen.' });

    await query(
      `
        UPDATE vouchers
        SET status = 'redeemed',
            redeemed_at = NOW(),
            updated_by = $2
        WHERE id = $1
      `,
      [req.params.id, req.user.id]
    );

    await logVoucherEvent(query, req.params.id, 'redeemed', {
      previousStatus: voucher.status,
      nextStatus: 'redeemed',
      actorId: req.user.id,
      actorLabel: `${req.user.jmeno} ${req.user.prijmeni}`.trim(),
      payload: { note: req.body?.note || null },
    });

    res.json(await loadVoucher(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/expire', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const voucher = await loadVoucher(req.params.id);
    if (!voucher) return res.status(404).json({ error: 'Poukaz nebyl nalezen.' });

    await query(
      `
        UPDATE vouchers
        SET status = 'expired',
            updated_by = $2
        WHERE id = $1
      `,
      [req.params.id, req.user.id]
    );

    await logVoucherEvent(query, req.params.id, 'expired', {
      previousStatus: voucher.status,
      nextStatus: 'expired',
      actorId: req.user.id,
      actorLabel: `${req.user.jmeno} ${req.user.prijmeni}`.trim(),
      payload: { note: req.body?.note || null },
    });

    res.json(await loadVoucher(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/print', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const voucher = await loadVoucher(req.params.id);
    if (!voucher) return res.status(404).json({ error: 'Poukaz nebyl nalezen.' });
    const firma = await loadFirmaSettings(['app_title', 'app_logo_data_url', 'app_color_theme', 'app_document_font_family', 'voucher_design_style']);
    const documentBranding = resolveDocumentBranding(firma);

    const esc = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const voucherStyles = {
      classic: {
        bodyBg: documentBranding.soft,
        cardRadius: '28px',
        heroBg: `linear-gradient(135deg,${documentBranding.primaryDark},${documentBranding.primary})`,
        heroColor: '#fff',
        titleTransform: 'none',
        border: 'none',
        decoration: '',
      },
      minimal: {
        bodyBg: '#f8fafc',
        cardRadius: '18px',
        heroBg: '#ffffff',
        heroColor: documentBranding.primaryDark,
        titleTransform: 'none',
        border: `1px solid ${documentBranding.primary}`,
        decoration: '',
      },
      premium: {
        bodyBg: '#111827',
        cardRadius: '30px',
        heroBg: 'linear-gradient(135deg,#111827,#44403c)',
        heroColor: '#fff7ed',
        titleTransform: 'uppercase',
        border: '1px solid rgba(255,255,255,.18)',
        decoration: '<div class="ornament">GIFT CERTIFICATE</div>',
      },
      festive: {
        bodyBg: '#fff7ed',
        cardRadius: '34px',
        heroBg: `radial-gradient(circle at top left,rgba(255,255,255,.35),transparent 34%),linear-gradient(135deg,${documentBranding.primary},${documentBranding.accent})`,
        heroColor: '#fff',
        titleTransform: 'none',
        border: `2px solid ${documentBranding.accent}`,
        decoration: '<div class="ornament">✦ ✦ ✦</div>',
      },
    };
    const voucherStyle = voucherStyles[firma.voucher_design_style] || voucherStyles.classic;

    const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poukaz ${esc(voucher.kod)}</title>
  <style>
    @import url('${esc(documentBranding.fontImportUrl)}');
    body { font-family: ${documentBranding.fontFamily}; background:${voucherStyle.bodyBg}; margin:0; padding:24px; color:#1c1917; }
    .card { max-width: 880px; margin: 0 auto; background:#fff; border-radius:${voucherStyle.cardRadius}; overflow:hidden; box-shadow:0 18px 44px rgba(0,0,0,.08); border:${voucherStyle.border}; }
    .hero { position:relative; padding:32px; background:${voucherStyle.heroBg}; color:${voucherStyle.heroColor}; }
    .badge { display:inline-block; padding:6px 12px; border-radius:999px; background:rgba(255,255,255,.14); font-size:12px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
    .title { font-size:34px; font-weight:700; margin:18px 0 8px; text-transform:${voucherStyle.titleTransform}; letter-spacing:${firma.voucher_design_style === 'premium' ? '.08em' : '0'}; }
    .subtitle { color:currentColor; opacity:.76; font-size:14px; }
    .ornament { position:absolute; right:28px; top:28px; opacity:.18; font-size:13px; letter-spacing:.18em; font-weight:800; }
    .content { padding:32px; display:grid; grid-template-columns:1.1fr .9fr; gap:28px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:20px; }
    .info-box { background:#fafaf9; border:1px solid #e7e5e4; border-radius:18px; padding:14px 16px; }
    .label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#78716c; margin-bottom:6px; font-weight:700; }
    .value { font-size:18px; font-weight:700; color:${documentBranding.primaryDark}; }
    .note { font-size:14px; line-height:1.7; color:#44403c; white-space:pre-wrap; }
    .qr-card { border:1px dashed #cbd5e1; border-radius:24px; padding:20px; text-align:center; background:#f8fafc; }
    .qr-box { width:220px; height:220px; margin:0 auto 16px; background:#fff; border-radius:18px; display:flex; align-items:center; justify-content:center; }
    .code { font-family: Consolas, monospace; font-size:24px; font-weight:700; letter-spacing:.08em; color:#0f172a; }
    .muted { color:#64748b; font-size:13px; line-height:1.6; }
    .footer { padding:0 32px 24px; display:flex; justify-content:space-between; gap:16px; color:#78716c; font-size:12px; }
    @media print { body { background:#fff; padding:0; } .card { box-shadow:none; max-width:none; border-radius:0; } }
    @media (max-width: 760px) { .content { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="hero">
      ${voucherStyle.decoration}
      ${documentBranding.logoDataUrl ? `<div style="width:72px;height:72px;border-radius:24px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:16px"><img src="${esc(documentBranding.logoDataUrl)}" alt="Logo" style="width:100%;height:100%;object-fit:contain"></div>` : ''}
      <div class="badge">${esc(firma.app_title || firma.firma_nazev || 'Catering CRM')}</div>
      <div class="title">${esc(voucher.title)}</div>
      <div class="subtitle">Dárkový certifikát • ${esc(voucher.kod)}</div>
    </div>
    <div class="content">
      <div>
        <div class="label">Pro koho</div>
        <div class="value">${esc(voucher.recipient_name || 'Příjemce bude doplněn při předání')}</div>
        <div class="info-grid">
          <div class="info-box">
            <div class="label">Stav</div>
            <div class="value">${esc(voucher.status)}</div>
          </div>
          <div class="info-box">
            <div class="label">Expirace</div>
            <div class="value">${voucher.expires_at ? new Date(voucher.expires_at).toLocaleDateString('cs-CZ') : 'Bez expirace'}</div>
          </div>
          <div class="info-box">
            <div class="label">Hodnota</div>
            <div class="value">${voucher.nominal_value != null ? Number(voucher.nominal_value).toLocaleString('cs-CZ') + ' Kč' : 'Plnění dle popisu'}</div>
          </div>
          <div class="info-box">
            <div class="label">Navázaná zakázka</div>
            <div class="value">${esc(voucher.zakazka_cislo || '—')}</div>
          </div>
        </div>
        <div style="margin-top:22px">
          <div class="label">Rozsah plnění</div>
          <div class="note">${esc(voucher.fulfillment_note || voucher.note || 'Použijte tento certifikát při objednávce nebo předání poukazu na místě.')}</div>
        </div>
      </div>
      <div class="qr-card">
        <div class="qr-box"><canvas id="qr"></canvas></div>
        <div class="code">${esc(voucher.kod)}</div>
        <div class="muted" style="margin-top:10px">Kontrolní URL / QR payload:</div>
        <div class="muted" style="word-break:break-word">${esc(voucher.verify_url || voucher.qr_payload || '')}</div>
      </div>
    </div>
    <div class="footer">
      <span>${esc(firma.firma_nazev || 'Catering LD')} • ${esc(firma.firma_email || '')}</span>
      <span>Vytištěno ${new Date().toLocaleDateString('cs-CZ')}</span>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
  <script>
    const payload = ${JSON.stringify(voucher.verify_url || voucher.qr_payload || voucher.kod)};
    if (window.QRCode) {
      QRCode.toCanvas(document.getElementById('qr'), payload, { width: 200, margin: 1 }, function () {});
    }
    window.onload = () => window.print();
  </script>
</body>
</html>`;

    if (isPdfRequested(req)) {
      return sendPdfResponse(res, html, `poukaz-${voucher.kod}.pdf`, { waitUntil: 'load' });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
