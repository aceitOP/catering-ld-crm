'use strict';

const crypto = require('crypto');
const { query, withTransaction } = require('./db');
const { loadFirmaSettings } = require('./firmaSettings');
const { sendVoucherEmail, sendVoucherOrderPaymentInstructions, sendVoucherOrderAdminNotification } = require('./emailService');
const { createNotif } = require('./notifHelper');

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeIban(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function parseShopValues(raw) {
  return String(raw || '')
    .split(/[,;\n]+/)
    .map((value) => Number(String(value).trim().replace(/\s+/g, '').replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));
}

function parseShopOffers(raw, minAmount) {
  let parsed = [];
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((offer, index) => {
      const amount = Math.round(Number(offer?.amount));
      const title = String(offer?.title || '').trim();
      if (!title || !Number.isFinite(amount) || amount < minAmount || amount > 1000000) return null;
      return {
        id: String(offer?.id || `offer-${index + 1}`).trim().slice(0, 120) || `offer-${index + 1}`,
        title: title.slice(0, 120),
        amount,
        description: String(offer?.description || '').trim().slice(0, 500),
      };
    })
    .filter(Boolean);
}

function normalizeShopOffersForSave(rawOffers) {
  const source = Array.isArray(rawOffers) ? rawOffers : [];
  return source
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
}

async function saveVoucherShopOffers(rawOffers) {
  const offers = normalizeShopOffersForSave(rawOffers);
  await query(
    `INSERT INTO nastaveni (klic, hodnota, popis)
     VALUES ('voucher_shop_offers', $1, 'Nabízené typy poukazů ve veřejném shopu')
     ON CONFLICT (klic) DO UPDATE SET hodnota = EXCLUDED.hodnota`,
    [JSON.stringify(offers)]
  );
  return offers;
}

function parsePositiveInt(value, fallback, min = 1, max = 120) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatAmount(value) {
  return Number(value).toFixed(2);
}

function buildPaymentMessage(orderNumber) {
  return `Poukaz ${orderNumber}`.slice(0, 60);
}

function buildSpaydPayload({ iban, amount, variableSymbol, message }) {
  const parts = [
    'SPD*1.0',
    `ACC:${normalizeIban(iban)}`,
    `AM:${formatAmount(amount)}`,
    'CC:CZK',
    `X-VS:${String(variableSymbol || '').replace(/\D/g, '')}`,
    `MSG:${String(message || '').replace(/[*/]/g, ' ').slice(0, 60)}`,
  ];
  return parts.join('*');
}

async function renderPaymentQrDataUrl(payload) {
  if (!payload) return '';
  try {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 260,
      color: { dark: '#111827', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

async function getVoucherShopConfig({ includeQr = false } = {}) {
  const firma = await loadFirmaSettings([
    'app_title',
    'app_logo_data_url',
    'app_color_theme',
    'voucher_design_style',
    'firma_nazev',
    'firma_email',
    'firma_telefon',
    'firma_web',
    'firma_iban',
    'voucher_shop_enabled',
    'voucher_shop_values',
    'voucher_shop_min_amount',
    'voucher_shop_offers',
    'voucher_shop_validity_months',
    'voucher_shop_terms_text',
  ]);
  const values = parseShopValues(firma.voucher_shop_values || '1000,2000,3000,5000,10000');
  const minAmount = parsePositiveInt(firma.voucher_shop_min_amount, 500, 1, 1000000);
  const offers = parseShopOffers(firma.voucher_shop_offers, minAmount);
  return {
    enabled: String(firma.voucher_shop_enabled || 'false') === 'true',
    values: values.length ? values : [1000, 2000, 3000, 5000, 10000],
    min_amount: minAmount,
    offers,
    validity_months: parsePositiveInt(firma.voucher_shop_validity_months, 12),
    terms_text: firma.voucher_shop_terms_text || '',
    bank_ready: Boolean(normalizeIban(firma.firma_iban)),
    iban: normalizeIban(firma.firma_iban),
    currency: 'CZK',
    branding: {
      app_title: firma.app_title || firma.firma_nazev || 'Catering CRM',
      firma_nazev: firma.firma_nazev || '',
      firma_email: firma.firma_email || '',
      firma_telefon: firma.firma_telefon || '',
      firma_web: firma.firma_web || '',
      app_logo_data_url: firma.app_logo_data_url || '',
      app_color_theme: firma.app_color_theme || 'ocean',
      voucher_design_style: firma.voucher_design_style || 'classic',
    },
    includeQr,
  };
}

async function generateUniqueOrderIdentity(client) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const orderNumber = `POU-${year}-${suffix}`;
    const variableSymbol = `${String(year).slice(2)}${suffix}`;
    const exists = await client.query(
      'SELECT 1 FROM voucher_orders WHERE order_number = $1 OR payment_variable_symbol = $2 LIMIT 1',
      [orderNumber, variableSymbol]
    );
    if (!exists.rows.length) return { orderNumber, variableSymbol };
  }
  throw new Error('Nepodařilo se vygenerovat unikátní objednávku poukazu.');
}

async function generateVoucherCode(client) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const code = `VCH-${year}-${suffix}`;
    const exists = await client.query('SELECT 1 FROM vouchers WHERE kod = $1 LIMIT 1', [code]);
    if (!exists.rows.length) return code;
  }
  throw new Error('Nepodařilo se vygenerovat unikátní kód poukazu.');
}

function getVoucherPublicUrl(token) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/voucher/${token}`;
}

function getOrderPublicUrl(token) {
  const base = process.env.VOUCHER_SHOP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/shop/objednavka/${token}`;
}

async function loadOrder(idOrToken, { byToken = false } = {}) {
  const { rows } = await query(
    `SELECT vo.*, v.kod AS voucher_kod, v.verify_url AS voucher_verify_url
     FROM voucher_orders vo
     LEFT JOIN vouchers v ON v.id = vo.voucher_id
     WHERE ${byToken ? 'vo.public_token = $1' : 'vo.id = $1'}
     LIMIT 1`,
    [idOrToken]
  );
  return rows[0] || null;
}

async function listOrders(params = {}) {
  const where = [];
  const values = [];
  let p = 1;
  if (params.status) {
    where.push(`vo.status = $${p++}`);
    values.push(params.status);
  }
  if (params.q) {
    where.push(`(vo.order_number ILIKE $${p} OR vo.buyer_email ILIKE $${p} OR vo.buyer_name ILIKE $${p} OR vo.payment_variable_symbol ILIKE $${p} OR v.kod ILIKE $${p})`);
    values.push(`%${params.q}%`);
    p += 1;
  }
  const { rows } = await query(
    `SELECT vo.*, v.kod AS voucher_kod
     FROM voucher_orders vo
     LEFT JOIN vouchers v ON v.id = vo.voucher_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY vo.created_at DESC
     LIMIT 300`,
    values
  );
  return rows;
}

function normalizePublicOrderPayload(payload, config) {
  const selectedOfferId = String(payload.selected_offer_id || '').trim();
  const selectedOffer = selectedOfferId
    ? (config.offers || []).find((offer) => offer.id === selectedOfferId)
    : null;
  const amount = selectedOffer ? selectedOffer.amount : Math.round(Number(payload.amount));
  if (!Number.isFinite(amount) || amount < config.min_amount || amount > 1000000) {
    const err = new Error(`Hodnota poukazu musí být alespoň ${config.min_amount.toLocaleString('cs-CZ')} Kč.`);
    err.status = 400;
    throw err;
  }
  const buyerEmail = normalizeEmail(payload.buyer_email);
  if (!buyerEmail) {
    const err = new Error('Zadejte platný e-mail kupujícího.');
    err.status = 400;
    throw err;
  }
  const buyerName = String(payload.buyer_name || '').trim().slice(0, 255);
  if (!buyerName) {
    const err = new Error('Zadejte jméno kupujícího.');
    err.status = 400;
    throw err;
  }
  const billingEmailRaw = String(payload.billing_email || '').trim();
  const billingEmail = billingEmailRaw ? normalizeEmail(billingEmailRaw) : buyerEmail;
  if (billingEmailRaw && !billingEmail) {
    const err = new Error('Zadejte platný fakturační e-mail.');
    err.status = 400;
    throw err;
  }
  const recipientChoice = payload.recipient_choice === 'recipient' ? 'recipient' : 'buyer';
  const recipientName = String(payload.recipient_name || '').trim().slice(0, 255);
  const recipientEmail = recipientChoice === 'recipient' ? normalizeEmail(payload.recipient_email) : buyerEmail;
  if (recipientChoice === 'recipient' && (!recipientName || !recipientEmail)) {
    const err = new Error('Pro odeslání obdarovanému vyplňte jeho jméno i platný e-mail.');
    err.status = 400;
    throw err;
  }
  const deliveryMode = payload.delivery_mode === 'scheduled' ? 'scheduled' : 'immediate';
  const deliveryScheduledAt = deliveryMode === 'scheduled' ? new Date(payload.delivery_scheduled_at || '') : null;
  if (deliveryMode === 'scheduled' && (Number.isNaN(deliveryScheduledAt.getTime()) || deliveryScheduledAt <= new Date())) {
    const err = new Error('Naplánované odeslání musí být v budoucnu.');
    err.status = 400;
    throw err;
  }
  return {
    amount,
    selected_offer_id: selectedOffer?.id || null,
    offer_title: (selectedOffer?.title || payload.offer_title || `Dárkový poukaz ${amount.toLocaleString('cs-CZ')} Kč`).trim().slice(0, 120),
    offer_description: String(selectedOffer?.description || payload.offer_description || '').trim().slice(0, 500),
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    billing_name: String(payload.billing_name || buyerName).trim().slice(0, 255),
    billing_company: String(payload.billing_company || '').trim().slice(0, 255),
    billing_ico: String(payload.billing_ico || '').trim().slice(0, 40),
    billing_dic: String(payload.billing_dic || '').trim().slice(0, 40),
    billing_address: String(payload.billing_address || '').trim().slice(0, 1000),
    billing_email: billingEmail,
    recipient_choice: recipientChoice,
    recipient_name: recipientChoice === 'recipient' ? recipientName : buyerName,
    recipient_email: recipientEmail,
    fulfillment_note: String(payload.fulfillment_note || '').trim().slice(0, 2000),
    delivery_mode: deliveryMode,
    delivery_scheduled_at: deliveryScheduledAt ? deliveryScheduledAt.toISOString() : null,
  };
}

async function createPublicOrder(payload = {}) {
  const config = await getVoucherShopConfig();
  if (!config.enabled) {
    const err = new Error('Prodej poukazů je momentálně vypnutý.');
    err.status = 403;
    throw err;
  }
  if (!config.bank_ready) {
    const err = new Error('Prodej poukazů není dokončený: chybí firemní IBAN.');
    err.status = 409;
    throw err;
  }
  const normalized = normalizePublicOrderPayload(payload, config);
  const firma = await loadFirmaSettings();

  const order = await withTransaction(async (client) => {
    const identity = await generateUniqueOrderIdentity(client);
    const publicToken = crypto.randomBytes(24).toString('hex');
    const paymentMessage = buildPaymentMessage(identity.orderNumber);
    const spaydPayload = buildSpaydPayload({
      iban: config.iban,
      amount: normalized.amount,
      variableSymbol: identity.variableSymbol,
      message: paymentMessage,
    });
    const { rows } = await client.query(
      `INSERT INTO voucher_orders (
         order_number, public_token, amount, buyer_name, buyer_email,
         selected_offer_id, offer_title, offer_description,
         billing_name, billing_company, billing_ico, billing_dic, billing_address, billing_email,
         recipient_choice, recipient_name, recipient_email, fulfillment_note,
         delivery_mode, delivery_scheduled_at, payment_iban, payment_variable_symbol,
         payment_message, payment_qr_payload
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        identity.orderNumber,
        publicToken,
        normalized.amount,
        normalized.buyer_name,
        normalized.buyer_email,
        normalized.selected_offer_id,
        normalized.offer_title,
        normalized.offer_description || null,
        normalized.billing_name || null,
        normalized.billing_company || null,
        normalized.billing_ico || null,
        normalized.billing_dic || null,
        normalized.billing_address || null,
        normalized.billing_email || null,
        normalized.recipient_choice,
        normalized.recipient_name,
        normalized.recipient_email,
        normalized.fulfillment_note || null,
        normalized.delivery_mode,
        normalized.delivery_scheduled_at,
        config.iban,
        identity.variableSymbol,
        paymentMessage,
        spaydPayload,
      ]
    );
    return rows[0];
  });

  const enriched = {
    ...order,
    public_url: getOrderPublicUrl(order.public_token),
    payment_qr_data_url: await renderPaymentQrDataUrl(order.payment_qr_payload),
  };

  const adminEmails = await getAdminNotificationEmails(firma);
  await Promise.allSettled([
    createNotif({
      typ: 'voucher',
      titulek: 'Nová objednávka poukazu',
      zprava: `${order.order_number} · ${Number(order.amount).toLocaleString('cs-CZ')} Kč · ${order.buyer_name}`,
      odkaz: '/poukazy',
    }),
    sendVoucherOrderPaymentInstructions({ to: order.buyer_email, order: enriched, firma }),
    sendVoucherOrderAdminNotification({ to: adminEmails, order: enriched, firma }),
  ]);

  return enriched;
}

async function getAdminNotificationEmails(firma = {}) {
  const emails = new Set();
  if (normalizeEmail(firma.firma_email)) emails.add(normalizeEmail(firma.firma_email));
  const { rows } = await query(
    `SELECT email
     FROM uzivatele
     WHERE aktivni = true
       AND role IN ('admin', 'majitel', 'super_admin')
       AND email IS NOT NULL`
  );
  rows.forEach((row) => {
    const email = normalizeEmail(row.email);
    if (email) emails.add(email);
  });
  return Array.from(emails);
}

async function createVoucherForPaidOrder(client, order, actorId = null) {
  const code = await generateVoucherCode(client);
  const publicToken = crypto.randomBytes(24).toString('hex');
  const verifyUrl = getVoucherPublicUrl(publicToken);
  const settings = await loadFirmaSettings(['voucher_shop_validity_months']);
  const months = parsePositiveInt(settings.voucher_shop_validity_months, 12);
  const expiresAt = addMonths(order.paid_at ? new Date(order.paid_at) : new Date(), months);
  const { rows } = await client.query(
    `INSERT INTO vouchers (
       kod, public_token, title, nominal_value, fulfillment_note,
       recipient_name, recipient_email, buyer_name, buyer_email,
       expires_at, status, qr_payload, verify_url, note, created_by, updated_by
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12,$13,$14,$14)
     RETURNING *`,
    [
      code,
      publicToken,
      order.offer_title || code,
      order.amount,
      order.fulfillment_note || order.offer_description || null,
      order.recipient_name || null,
      order.recipient_email || null,
      order.buyer_name || null,
      order.buyer_email || null,
      expiresAt.toISOString(),
      verifyUrl,
      verifyUrl,
      `Vytvořeno z objednávky ${order.order_number}`,
      actorId,
    ]
  );
  await client.query(
    `INSERT INTO voucher_events (voucher_id, event_type, next_status, payload, actor_id, actor_label)
     VALUES ($1, 'created_from_shop_order', 'active', $2, $3, 'voucher shop')`,
    [rows[0].id, JSON.stringify({ order_id: order.id, order_number: order.order_number }), actorId]
  );
  return rows[0];
}

function getDeliveryEmail(order) {
  return order.recipient_choice === 'recipient'
    ? order.recipient_email
    : order.buyer_email;
}

async function sendOrderVoucher(orderId) {
  const order = await loadOrder(orderId);
  if (!order || !order.voucher_id || order.voucher_sent_at || order.status === 'cancelled') return order;
  const { rows } = await query('SELECT * FROM vouchers WHERE id = $1 LIMIT 1', [order.voucher_id]);
  const voucher = rows[0];
  if (!voucher) return order;
  const to = getDeliveryEmail(order);
  const firma = await loadFirmaSettings();
  await sendVoucherEmail({ to, voucher, firma, attachPdf: true });
  const { rows: updatedRows } = await query(
    `UPDATE voucher_orders
     SET status = 'sent', voucher_sent_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [order.id]
  );
  return updatedRows[0] || order;
}

async function markOrderPaid(orderId, actorId = null) {
  let shouldSend = false;
  const orderAfterPayment = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM voucher_orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) {
      const err = new Error('Objednávka poukazu nebyla nalezena.');
      err.status = 404;
      throw err;
    }
    if (order.status === 'cancelled') {
      const err = new Error('Zrušenou objednávku nelze označit jako zaplacenou.');
      err.status = 400;
      throw err;
    }
    if (order.voucher_id) return order;
    const paidAt = new Date();
    const paidOrder = { ...order, paid_at: paidAt.toISOString() };
    const voucher = await createVoucherForPaidOrder(client, paidOrder, actorId);
    const deliverNow = order.delivery_mode === 'immediate'
      || !order.delivery_scheduled_at
      || new Date(order.delivery_scheduled_at) <= new Date();
    shouldSend = deliverNow;
    const nextStatus = deliverNow ? 'voucher_created' : 'voucher_created';
    const { rows: updatedRows } = await client.query(
      `UPDATE voucher_orders
       SET status = $2,
           paid_at = $3,
           voucher_id = $4
       WHERE id = $1
       RETURNING *`,
      [order.id, nextStatus, paidAt.toISOString(), voucher.id]
    );
    return updatedRows[0];
  });
  if (shouldSend) return sendOrderVoucher(orderAfterPayment.id);
  return orderAfterPayment;
}

async function cancelOrder(orderId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE voucher_orders
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND status != 'sent'
       RETURNING *`,
      [orderId]
    );
    if (!rows[0]) {
      const err = new Error('Objednávku nelze zrušit.');
      err.status = 400;
      throw err;
    }
    if (rows[0].voucher_id) {
      await client.query(
        `UPDATE vouchers
         SET status = 'cancelled'
         WHERE id = $1 AND status IN ('draft', 'active')`,
        [rows[0].voucher_id]
      );
    }
    return rows[0];
  });
}

async function resendOrder(orderId) {
  const order = await loadOrder(orderId);
  if (!order?.voucher_id) {
    const err = new Error('Objednávka ještě nemá vytvořený poukaz.');
    err.status = 400;
    throw err;
  }
  await query('UPDATE voucher_orders SET voucher_sent_at = NULL, status = $2 WHERE id = $1', [orderId, 'voucher_created']);
  return sendOrderVoucher(orderId);
}

async function runScheduledVoucherOrderSendSweep() {
  const { rows } = await query(
    `SELECT id
     FROM voucher_orders
     WHERE status = 'voucher_created'
       AND voucher_id IS NOT NULL
       AND voucher_sent_at IS NULL
       AND delivery_scheduled_at IS NOT NULL
       AND delivery_scheduled_at <= NOW()
     ORDER BY delivery_scheduled_at ASC
     LIMIT 25`
  );
  let sentCount = 0;
  for (const row of rows) {
    try {
      const result = await sendOrderVoucher(row.id);
      if (result?.voucher_sent_at) sentCount += 1;
    } catch (err) {
      console.error('❌  Chyba plánovaného odeslání poukazu:', err.message);
    }
  }
  return { sentCount };
}

module.exports = {
  buildSpaydPayload,
  renderPaymentQrDataUrl,
  getVoucherShopConfig,
  saveVoucherShopOffers,
  createPublicOrder,
  loadOrder,
  listOrders,
  markOrderPaid,
  cancelOrder,
  resendOrder,
  runScheduledVoucherOrderSendSweep,
};
