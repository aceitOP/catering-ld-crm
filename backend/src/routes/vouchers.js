'use strict';

const express = require('express');
const crypto = require('crypto');
const { query, withTransaction } = require('../db');
const { auth, requireCapability } = require('../middleware/auth');
const { loadFirmaSettings } = require('../firmaSettings');
const { sendVoucherEmail } = require('../emailService');
const { isPdfRequested, sendPdfResponse } = require('../pdfService');
const { buildVoucherHtml, sanitizeVoucherDesignPayload } = require('../voucherTemplate');

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
        u.jmeno AS created_by_jmeno,
        u.prijmeni AS created_by_prijmeni
      FROM vouchers v
      LEFT JOIN klienti k ON k.id = v.klient_id
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
          k.prijmeni AS klient_prijmeni
        FROM vouchers v
        LEFT JOIN klienti k ON k.id = v.klient_id
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

router.post('/preview', auth, requireCapability('vouchers.manage'), async (req, res, next) => {
  try {
    const firma = await loadFirmaSettings(['app_title', 'app_logo_data_url', 'app_color_theme', 'app_document_font_family', 'voucher_design_style', 'firma_nazev', 'firma_email']);
    const design = sanitizeVoucherDesignPayload(req.body || {});
    const previewCode = req.body?.kod || 'NÁHLED';
    const previewVoucher = {
      ...req.body,
      ...design,
      kod: previewCode,
      status: req.body?.status || 'draft',
      verify_url: req.body?.verify_url || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/voucher/nahled`,
      qr_payload: req.body?.qr_payload || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/voucher/nahled`,
      title: previewCode,
    };
    const html = await buildVoucherHtml({ voucher: previewVoucher, firma });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
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

    const result = await withTransaction(async (client) => {
      const design = sanitizeVoucherDesignPayload(payload);
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
            , design_style, accent_color, footer_text, image_data_url
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
          RETURNING id
        `,
        [
          code,
          publicToken,
          code,
          payload.nominal_value || null,
          payload.fulfillment_note || null,
          payload.recipient_name || null,
          normalizeEmail(payload.recipient_email),
          payload.buyer_name || null,
          normalizeEmail(payload.buyer_email),
          payload.klient_id || null,
          null,
          payload.expires_at || null,
          payload.status || 'draft',
          qrPayload,
          verifyUrl,
          payload.note || null,
          req.user.id,
          req.user.id,
          design.design_style || null,
          design.accent_color || null,
          design.footer_text || null,
          design.image_data_url || null,
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
    const design = sanitizeVoucherDesignPayload(payload);

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
            zakazka_id = NULL,
            expires_at = $10,
            status = $11,
            note = $12,
            updated_by = $13,
            design_style = $14,
            accent_color = $15,
            footer_text = $16,
            image_data_url = $17,
            redeemed_at = CASE WHEN $11 = 'redeemed' AND redeemed_at IS NULL THEN NOW() ELSE redeemed_at END
        WHERE id = $1
        RETURNING id
      `,
      [
        req.params.id,
        current.kod || current.title,
        Object.prototype.hasOwnProperty.call(payload, 'nominal_value') ? (payload.nominal_value || null) : current.nominal_value,
        Object.prototype.hasOwnProperty.call(payload, 'fulfillment_note') ? (payload.fulfillment_note || null) : current.fulfillment_note,
        Object.prototype.hasOwnProperty.call(payload, 'recipient_name') ? (payload.recipient_name || null) : current.recipient_name,
        Object.prototype.hasOwnProperty.call(payload, 'recipient_email') ? normalizeEmail(payload.recipient_email) : current.recipient_email,
        Object.prototype.hasOwnProperty.call(payload, 'buyer_name') ? (payload.buyer_name || null) : current.buyer_name,
        Object.prototype.hasOwnProperty.call(payload, 'buyer_email') ? normalizeEmail(payload.buyer_email) : current.buyer_email,
        Object.prototype.hasOwnProperty.call(payload, 'klient_id') ? (payload.klient_id || null) : current.klient_id,
        Object.prototype.hasOwnProperty.call(payload, 'expires_at') ? (payload.expires_at || null) : current.expires_at,
        nextStatus,
        Object.prototype.hasOwnProperty.call(payload, 'note') ? (payload.note || null) : current.note,
        req.user.id,
        Object.prototype.hasOwnProperty.call(payload, 'design_style') ? (design.design_style || null) : current.design_style,
        Object.prototype.hasOwnProperty.call(payload, 'accent_color') ? (design.accent_color || null) : current.accent_color,
        Object.prototype.hasOwnProperty.call(payload, 'footer_text') ? (design.footer_text || null) : current.footer_text,
        Object.prototype.hasOwnProperty.call(payload, 'image_data_url') ? (design.image_data_url || null) : current.image_data_url,
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
    const firma = await loadFirmaSettings(['app_title', 'app_logo_data_url', 'app_color_theme', 'app_document_font_family', 'voucher_design_style', 'firma_nazev', 'firma_email']);
    const html = await buildVoucherHtml({ voucher, firma });

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
