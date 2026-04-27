'use strict';

const { resolveDocumentBranding } = require('./documentBranding');

const DESIGN_STYLES = new Set(['classic', 'minimal', 'premium', 'festive']);
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const IMAGE_DATA_URL_RE = /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeVoucherDesignStyle(value, fallback = 'classic') {
  const normalized = String(value || '').trim().toLowerCase();
  return DESIGN_STYLES.has(normalized) ? normalized : fallback;
}

function normalizeAccentColor(value) {
  const normalized = String(value || '').trim();
  return HEX_COLOR_RE.test(normalized) ? normalized : '';
}

function normalizeImageDataUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (!IMAGE_DATA_URL_RE.test(normalized)) return '';
  if (normalized.length > 2 * 1024 * 1024) return '';
  return normalized;
}

function sanitizeVoucherDesignPayload(payload = {}) {
  return {
    design_style: normalizeVoucherDesignStyle(payload.design_style || payload.voucher_design_style || '', ''),
    accent_color: normalizeAccentColor(payload.accent_color),
    footer_text: String(payload.footer_text || '').trim().slice(0, 500),
    image_data_url: normalizeImageDataUrl(payload.image_data_url),
  };
}

async function renderVoucherQrDataUrl(payload) {
  if (!payload) return '';
  try {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(String(payload), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
    });
  } catch {
    return '';
  }
}

function buildVoucherStyles(styleKey, branding, accentColor) {
  const accent = accentColor || branding.accent;
  const base = {
    classic: {
      bodyBg: branding.soft,
      cardRadius: '28px',
      heroBg: `linear-gradient(135deg,${branding.primaryDark},${branding.primary})`,
      heroColor: '#fff',
      titleTransform: 'none',
      border: 'none',
      decoration: '',
    },
    minimal: {
      bodyBg: '#f8fafc',
      cardRadius: '18px',
      heroBg: '#ffffff',
      heroColor: branding.primaryDark,
      titleTransform: 'none',
      border: `1px solid ${branding.primary}`,
      decoration: '',
    },
    premium: {
      bodyBg: '#111827',
      cardRadius: '30px',
      heroBg: `linear-gradient(135deg,#111827,${accent})`,
      heroColor: '#fff7ed',
      titleTransform: 'uppercase',
      border: '1px solid rgba(255,255,255,.18)',
      decoration: '<div class="ornament">GIFT CERTIFICATE</div>',
    },
    festive: {
      bodyBg: '#fff7ed',
      cardRadius: '34px',
      heroBg: `radial-gradient(circle at top left,rgba(255,255,255,.35),transparent 34%),linear-gradient(135deg,${branding.primary},${accent})`,
      heroColor: '#fff',
      titleTransform: 'none',
      border: `2px solid ${accent}`,
      decoration: '<div class="ornament">* * *</div>',
    },
  };
  return base[styleKey] || base.classic;
}

async function buildVoucherHtml({ voucher, firma = {}, qrDataUrl = '' }) {
  const branding = resolveDocumentBranding(firma);
  const styleKey = normalizeVoucherDesignStyle(voucher.design_style || firma.voucher_design_style || 'classic');
  const accentColor = normalizeAccentColor(voucher.accent_color);
  const imageDataUrl = normalizeImageDataUrl(voucher.image_data_url);
  const style = buildVoucherStyles(styleKey, branding, accentColor);
  const qrPayload = voucher.verify_url || voucher.qr_payload || voucher.kod || '';
  const qrImage = qrDataUrl || await renderVoucherQrDataUrl(qrPayload);
  const footerText = String(voucher.footer_text || '').trim();
  const companyLabel = firma.firma_nazev || branding.appTitle || 'Catering CRM';
  const defaultFooter = [companyLabel, firma.firma_email].filter(Boolean).join(' • ');
  const voucherCode = voucher.kod || 'NÁHLED';
  const voucherKind = String(voucher.title || '').trim();
  const subtitleParts = [
    voucherKind && voucherKind !== 'Dárkový poukaz' ? voucherKind : 'Dárkový certifikát',
    voucherCode,
  ];

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poukaz ${esc(voucher.kod || '')}</title>
  <style>
    @import url('${esc(branding.fontImportUrl)}');
    body { font-family: ${branding.fontFamily}; background:${style.bodyBg}; margin:0; padding:24px; color:#1c1917; }
    .card { max-width: 880px; margin: 0 auto; background:#fff; border-radius:${style.cardRadius}; overflow:hidden; box-shadow:0 18px 44px rgba(0,0,0,.08); border:${style.border}; }
    .hero { position:relative; padding:32px; background:${style.heroBg}; color:${style.heroColor}; min-height:${imageDataUrl ? '260px' : 'auto'}; }
    .hero-image { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.2; }
    .hero-inner { position:relative; z-index:1; max-width:640px; }
    .badge { display:inline-block; padding:6px 12px; border-radius:999px; background:rgba(255,255,255,.14); font-size:12px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
    .title { font-size:34px; font-weight:700; margin:18px 0 8px; text-transform:${style.titleTransform}; letter-spacing:${styleKey === 'premium' ? '.08em' : '0'}; }
    .subtitle { color:currentColor; opacity:.76; font-size:14px; }
    .ornament { position:absolute; right:28px; top:28px; opacity:.18; font-size:13px; letter-spacing:.18em; font-weight:800; }
    .content { padding:32px; display:grid; grid-template-columns:1.1fr .9fr; gap:28px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:20px; }
    .info-box { background:#fafaf9; border:1px solid #e7e5e4; border-radius:18px; padding:14px 16px; }
    .label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#78716c; margin-bottom:6px; font-weight:700; }
    .value { font-size:18px; font-weight:700; color:${accentColor || branding.primaryDark}; }
    .note { font-size:14px; line-height:1.7; color:#44403c; white-space:pre-wrap; }
    .qr-card { border:1px dashed #cbd5e1; border-radius:24px; padding:20px; text-align:center; background:#f8fafc; }
    .qr-box { width:220px; height:220px; margin:0 auto 16px; background:#fff; border-radius:18px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .qr-box img { width:200px; height:200px; object-fit:contain; }
    .qr-fallback { padding:16px; font-family:Consolas,monospace; font-size:14px; line-height:1.4; word-break:break-word; color:#0f172a; }
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
      ${imageDataUrl ? `<img class="hero-image" src="${esc(imageDataUrl)}" alt="">` : ''}
      ${style.decoration}
      <div class="hero-inner">
        ${branding.logoDataUrl
          ? `<div style="width:92px;height:72px;border-radius:20px;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:16px"><img src="${esc(branding.logoDataUrl)}" alt="${esc(companyLabel)}" style="width:100%;height:100%;object-fit:contain"></div>`
          : `<div class="badge">${esc(companyLabel)}</div>`}
        <div class="title">Dárkový poukaz</div>
        <div class="subtitle">${esc(subtitleParts.join(' • '))}</div>
      </div>
    </div>
    <div class="content">
      <div>
        <div class="label">Pro koho</div>
        <div class="value">${esc(voucher.recipient_name || 'Příjemce bude doplněn při předání')}</div>
        <div class="info-grid">
          <div class="info-box"><div class="label">Stav</div><div class="value">${esc(voucher.status || 'draft')}</div></div>
          <div class="info-box"><div class="label">Expirace</div><div class="value">${voucher.expires_at ? new Date(voucher.expires_at).toLocaleDateString('cs-CZ') : 'Bez expirace'}</div></div>
          <div class="info-box"><div class="label">Hodnota</div><div class="value">${voucher.nominal_value != null && voucher.nominal_value !== '' ? Number(voucher.nominal_value).toLocaleString('cs-CZ') + ' Kč' : 'Plnění dle popisu'}</div></div>
          <div class="info-box"><div class="label">Kód poukazu</div><div class="value">${esc(voucherCode)}</div></div>
        </div>
        <div style="margin-top:22px">
          <div class="label">Popis</div>
          <div class="note">${esc(voucher.fulfillment_note || voucher.note || 'Použijte tento certifikát při objednávce nebo předání poukazu na místě.')}</div>
        </div>
      </div>
      <div class="qr-card">
        <div class="qr-box">${qrImage ? `<img src="${esc(qrImage)}" alt="QR kód">` : `<div class="qr-fallback">${esc(qrPayload || voucher.kod || '')}</div>`}</div>
        <div class="code">${esc(voucher.kod || 'NÁHLED')}</div>
        <div class="muted" style="margin-top:10px">Kontrolní URL / QR payload:</div>
        <div class="muted" style="word-break:break-word">${esc(qrPayload)}</div>
      </div>
    </div>
    <div class="footer">
      <span>${esc(footerText || defaultFooter)}</span>
      <span>Kontrolní kód: ${esc(voucherCode)}</span>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  DESIGN_STYLES,
  sanitizeVoucherDesignPayload,
  normalizeVoucherDesignStyle,
  normalizeAccentColor,
  normalizeImageDataUrl,
  renderVoucherQrDataUrl,
  buildVoucherHtml,
};
