// ── Print / PDF utilities ────────────────────────────────────
// Opens a styled print window; user saves as PDF via browser dialog.

const THEME_MAP = {
  ocean: { primary: '#1d4ed8', accent: '#0f766e' },
  forest: { primary: '#059669', accent: '#0f766e' },
  terracotta: { primary: '#c2410c', accent: '#ea580c' },
  graphite: { primary: '#44403c', accent: '#78716c' },
};

const FONT_MAP = {
  syne: { family: "'Syne', Arial, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&display=swap' },
  manrope: { family: "'Manrope', Arial, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap' },
  merriweather: { family: "'Merriweather', Georgia, serif", url: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap' },
  source_sans_3: { family: "'Source Sans 3', Arial, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap' },
};

function getDocumentBranding() {
  const branding = safeGetJson('app_branding', {}) || {};
  const theme = THEME_MAP[branding.app_color_theme] || THEME_MAP.ocean;
  const font = FONT_MAP[branding.app_document_font_family] || FONT_MAP.syne;

  return {
    appTitle: branding.app_title || 'Catering CRM',
    logoDataUrl: branding.app_logo_data_url || '',
    brandBlue: theme.primary,
    accent: theme.accent,
    fontFamily: font.family,
    fontUrl: font.url,
  };
}

function buildBaseCss() {
  const branding = getDocumentBranding();
  return `
  @import url('${branding.fontUrl}');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${branding.fontFamily}; font-size: 11px; color: #333; background: #fff; }
  h1 { font-size: 18px; font-weight: 700; color: ${branding.brandBlue}; }
  h2 { font-size: 13px; font-weight: 600; color: ${branding.brandBlue}; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: ${branding.brandBlue}; color: #fff; }
  th { padding: 7px 10px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  td { padding: 6px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) td { background: #f9f9fb; }
  .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 3px; }
  .value { font-size: 12px; font-weight: 600; color: ${branding.brandBlue}; }
  .value-sm { font-size: 11px; color: #555; }
  .brand-lockup { display:flex; align-items:center; gap:14px; }
  .brand-logo { width:56px; height:56px; border-radius:18px; overflow:hidden; background:#fff; display:flex; align-items:center; justify-content:center; }
  .brand-logo img { width:100%; height:100%; object-fit:contain; }
  @media print {
    @page { size: A4; margin: 0; }
    body { margin: 0; }
    .no-print { display: none; }
  }
`;
}

function openPrint(html) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Povolte vyskakovací okna pro tisk.'); return; }
  w.document.write(html);
  w.document.close();
}

function fmt(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč';
}

function fmtD(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('cs-CZ');
}

// ── Nabídka PDF ───────────────────────────────────────────────
export function printNabidkuPdf(n) {
  const branding = getDocumentBranding();
  const BASE_CSS = buildBaseCss();
  const BRAND_BLUE = branding.brandBlue;
  const ACCENT = branding.accent;
  const klient = n.klient_firma || [n.klient_jmeno, n.klient_prijmeni].filter(Boolean).join(' ') || '—';
  const dnes   = new Date().toLocaleDateString('cs-CZ');

  const rows = (n.polozky || []).map(p => `
    <tr>
      <td>${p.nazev || '—'}</td>
      <td style="text-align:center">${p.mnozstvi}</td>
      <td>${p.jednotka}</td>
      <td style="text-align:right">${fmt(p.cena_jednotka)}</td>
      <td style="text-align:right;font-weight:600">${fmt(p.cena_celkem)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="cs"><head>
    <meta charset="utf-8">
    <title>Nabídka – ${n.nazev}</title>
    <style>
      ${BASE_CSS}
      .header { background:${BRAND_BLUE}; color:#fff; padding:22px 30px; display:flex; justify-content:space-between; align-items:flex-start; }
      .header-logo { font-size:22px; font-weight:800; letter-spacing:-0.5px; }
      .header-sub { font-size:11px; opacity:0.7; margin-top:3px; }
      .header-badge { background:${ACCENT}; color:#fff; font-size:11px; font-weight:700; padding:4px 12px; border-radius:20px; margin-top:6px; display:inline-block; }
      .content { padding:25px 30px; }
      .info-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-bottom:22px; }
      .info-box { background:#f4f5fb; border-radius:6px; padding:10px 14px; border-left:3px solid ${BRAND_BLUE}; }
      .totals-wrap { display:flex; justify-content:flex-end; margin-top:16px; }
      .totals { min-width:280px; }
      .t-row { display:flex; justify-content:space-between; padding:4px 0; color:#555; }
      .t-total { display:flex; justify-content:space-between; padding:9px 0; font-size:15px; font-weight:700; color:${BRAND_BLUE}; border-top:2px solid ${BRAND_BLUE}; margin-top:6px; }
      .text-block { background:#f9f9fb; border-radius:6px; padding:12px 14px; margin-bottom:18px; font-size:11px; color:#444; line-height:1.6; }
      .footer { margin-top:30px; padding-top:14px; border-top:1px solid #ddd; display:flex; justify-content:space-between; font-size:9px; color:#999; }
      .signature { margin-top:30px; display:grid; grid-template-columns:1fr 1fr; gap:40px; }
      .sig-line { border-top:1px solid #ccc; padding-top:6px; font-size:10px; color:#888; margin-top:40px; }
    </style>
  </head><body>

  <div class="header">
    <div>
      <div class="header-logo">Catering Landa &amp; Dvořák</div>
      <div class="header-sub">Profesionální catering &amp; event management</div>
      <div class="header-badge">NABÍDKA</div>
    </div>
    <div style="text-align:right;font-size:11px;opacity:0.85;line-height:1.8">
      <div>Datum: ${dnes}</div>
      ${n.platnost_do ? `<div>Platnost do: ${fmtD(n.platnost_do)}</div>` : ''}
      <div style="margin-top:4px;font-weight:700;font-size:13px">${n.nazev}</div>
      <div>Verze ${n.verze || 1}</div>
    </div>
  </div>

  <div class="content">
    <div class="info-grid">
      <div class="info-box">
        <div class="label">Zakázka</div>
        <div class="value">${n.zakazka_cislo || '—'}</div>
        <div class="value-sm">${n.zakazka_nazev || ''}</div>
      </div>
      <div class="info-box">
        <div class="label">Klient</div>
        <div class="value">${klient}</div>
        ${n.klient_email ? `<div class="value-sm">${n.klient_email}</div>` : ''}
      </div>
      <div class="info-box">
        <div class="label">Celková cena</div>
        <div class="value" style="color:${ACCENT}">${fmt(n.cena_celkem)}</div>
        <div class="value-sm">vč. DPH</div>
      </div>
    </div>

    ${n.uvodni_text ? `<div class="text-block">${n.uvodni_text}</div>` : ''}

    <h2 style="margin-bottom:10px">Položky nabídky</h2>
    <table>
      <thead><tr>
        <th>Název</th><th style="text-align:center">Mn.</th><th>Jedn.</th>
        <th style="text-align:right">Cena/jedn.</th><th style="text-align:right">Celkem</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals">
        <div class="t-row"><span>Cena bez DPH</span><span>${fmt(n.cena_bez_dph)}</span></div>
        <div class="t-row"><span>DPH 12 %</span><span>${fmt(n.dph)}</span></div>
        ${n.sleva_procent > 0 ? `<div class="t-row" style="color:#16a34a"><span>Sleva ${n.sleva_procent} %</span><span>−${fmt((n.cena_bez_dph||0)*(n.sleva_procent/100))}</span></div>` : ''}
        <div class="t-total"><span>Celkem s DPH</span><span>${fmt(n.cena_celkem)}</span></div>
      </div>
    </div>

    ${n.zaverecny_text ? `<div class="text-block" style="margin-top:20px">${n.zaverecny_text}</div>` : ''}

    <div class="signature">
      <div><div class="sig-line">Vystavil / Catering Landa &amp; Dvořák</div></div>
      <div><div class="sig-line">Potvrdil / Klient</div></div>
    </div>
  </div>

  <div style="padding:0 30px 20px">
    <div class="footer">
      <span>Catering Landa &amp; Dvořák – www.cateringld.cz</span>
      <span>Vytištěno: ${dnes}</span>
    </div>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`;

  openPrint(html);
}

// ── Faktura PDF ───────────────────────────────────────────────
export function printFakturuPdf(f) {
  const branding = getDocumentBranding();
  const BASE_CSS = buildBaseCss();
  const BRAND_BLUE = branding.brandBlue;
  const ACCENT = branding.accent;
  const firma    = f.dodavatel_json || {};
  const klient   = f.klient_firma || [f.klient_jmeno, f.klient_prijmeni].filter(Boolean).join(' ') || '—';
  const dnes     = new Date().toLocaleDateString('cs-CZ');

  const STAV_LABELS = { vystavena: 'Vystavena', odeslana: 'Odeslána', zaplacena: 'Zaplacena', storno: 'Storno' };
  const stavLabel   = STAV_LABELS[f.stav] || f.stav;

  const rows = (f.polozky || []).map(p => {
    const celkem = (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0);
    const dphCastka = celkem * ((parseFloat(p.dph_sazba) || 12) / 100);
    return `
    <tr>
      <td>${p.nazev || '—'}</td>
      <td style="text-align:center">${p.mnozstvi}</td>
      <td>${p.jednotka}</td>
      <td style="text-align:right">${fmt(p.cena_jednotka)}</td>
      <td style="text-align:center">${p.dph_sazba || 12} %</td>
      <td style="text-align:right">${fmt(dphCastka)}</td>
      <td style="text-align:right;font-weight:600">${fmt(celkem + dphCastka)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="cs"><head>
    <meta charset="utf-8">
    <title>Faktura – ${f.cislo}</title>
    <style>
      ${BASE_CSS}
      .header { background:${BRAND_BLUE}; color:#fff; padding:22px 30px; display:flex; justify-content:space-between; align-items:flex-start; }
      .header-logo { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
      .header-sub { font-size:10px; opacity:0.7; margin-top:3px; }
      .header-right { text-align:right; }
      .header-badge { background:${ACCENT}; color:#fff; font-size:13px; font-weight:800; padding:5px 16px; border-radius:20px; display:inline-block; letter-spacing:1px; margin-bottom:6px; }
      .content { padding:22px 30px; }
      .parties { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:22px; }
      .party-box { background:#f4f5fb; border-radius:6px; padding:12px 16px; border-left:3px solid ${BRAND_BLUE}; }
      .party-label { font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:#888; margin-bottom:6px; font-weight:600; }
      .party-name { font-size:13px; font-weight:700; color:${BRAND_BLUE}; margin-bottom:4px; }
      .party-detail { font-size:10px; color:#555; line-height:1.7; }
      .meta-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
      .meta-box { background:#f9f9fb; border-radius:6px; padding:8px 12px; }
      .totals-wrap { display:flex; justify-content:flex-end; margin-top:14px; }
      .totals { min-width:300px; }
      .t-row { display:flex; justify-content:space-between; padding:4px 0; color:#555; font-size:11px; }
      .t-total { display:flex; justify-content:space-between; padding:9px 0; font-size:16px; font-weight:700; color:${BRAND_BLUE}; border-top:2px solid ${BRAND_BLUE}; margin-top:6px; }
      .footer { margin-top:24px; padding-top:12px; border-top:1px solid #ddd; display:flex; justify-content:space-between; font-size:9px; color:#999; }
      .stav-badge { display:inline-block; padding:2px 10px; border-radius:12px; font-size:10px; font-weight:700;
        background:${f.stav === 'zaplacena' ? '#dcfce7' : f.stav === 'storno' ? '#fee2e2' : '#dbeafe'};
        color:${f.stav === 'zaplacena' ? '#15803d' : f.stav === 'storno' ? '#dc2626' : '#1d4ed8'}; }
    </style>
  </head><body>

  <div class="header">
    <div>
      <div class="header-logo">${firma.firma_nazev || 'Catering Landa &amp; Dvořák'}</div>
      <div class="header-sub">${firma.firma_adresa || ''}</div>
      ${firma.firma_web ? `<div class="header-sub">${firma.firma_web}</div>` : ''}
    </div>
    <div class="header-right">
      <div class="header-badge">FAKTURA</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:3px">${f.cislo}</div>
      <div class="stav-badge">${stavLabel}</div>
    </div>
  </div>

  <div class="content">
    <div class="parties">
      <div class="party-box">
        <div class="party-label">Dodavatel</div>
        <div class="party-name">${firma.firma_nazev || '—'}</div>
        <div class="party-detail">
          ${firma.firma_adresa ? firma.firma_adresa + '<br>' : ''}
          ${firma.firma_ico ? 'IČO: ' + firma.firma_ico + '<br>' : ''}
          ${firma.firma_dic ? 'DIČ: ' + firma.firma_dic + '<br>' : ''}
          ${firma.firma_iban ? 'Účet: ' + firma.firma_iban + '<br>' : ''}
          ${firma.firma_email ? firma.firma_email : ''}
        </div>
      </div>
      <div class="party-box">
        <div class="party-label">Odběratel</div>
        <div class="party-name">${f.klient_firma || klient}</div>
        <div class="party-detail">
          ${f.klient_firma && klient !== f.klient_firma ? klient + '<br>' : ''}
          ${f.klient_adresa ? f.klient_adresa + '<br>' : ''}
          ${f.klient_ico ? 'IČO: ' + f.klient_ico + '<br>' : ''}
          ${f.klient_dic ? 'DIČ: ' + f.klient_dic + '<br>' : ''}
          ${f.klient_email ? f.klient_email : ''}
        </div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-box"><div class="label">Datum vystavení</div><div class="value-sm">${fmtD(f.datum_vystaveni)}</div></div>
      <div class="meta-box"><div class="label">Datum splatnosti</div><div class="value-sm">${fmtD(f.datum_splatnosti)}</div></div>
      <div class="meta-box"><div class="label">Způsob platby</div><div class="value-sm">${f.zpusob_platby || '—'}</div></div>
      <div class="meta-box"><div class="label">Variabilní symbol</div><div class="value-sm">${f.variabilni_symbol || '—'}</div></div>
    </div>

    <h2 style="margin-bottom:10px">Položky faktury</h2>
    <table>
      <thead><tr>
        <th>Název</th><th style="text-align:center">Mn.</th><th>Jedn.</th>
        <th style="text-align:right">Cena/jedn.</th><th style="text-align:center">DPH</th>
        <th style="text-align:right">DPH Kč</th><th style="text-align:right">Celkem s DPH</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals">
        <div class="t-row"><span>Základ daně (bez DPH)</span><span>${fmt(f.cena_bez_dph)}</span></div>
        <div class="t-row"><span>DPH celkem</span><span>${fmt(f.dph)}</span></div>
        <div class="t-total"><span>Celkem k úhradě</span><span>${fmt(f.cena_celkem)}</span></div>
      </div>
    </div>

    ${f.poznamka ? `<div style="margin-top:18px;background:#f9f9fb;border-radius:6px;padding:12px 14px;font-size:11px;color:#444;line-height:1.6"><strong>Poznámka:</strong> ${f.poznamka}</div>` : ''}
    ${f.zakazka_cislo ? `<div style="margin-top:10px;font-size:10px;color:#999">Zakázka: ${f.zakazka_cislo}${f.zakazka_nazev ? ' – ' + f.zakazka_nazev : ''}</div>` : ''}
  </div>

  <div style="padding:0 30px 20px">
    <div class="footer">
      <span>${firma.firma_nazev || 'Catering Landa &amp; Dvořák'} · IČO: ${firma.firma_ico || '—'} · DIČ: ${firma.firma_dic || '—'}</span>
      <span>Vytištěno: ${dnes}</span>
    </div>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`;

  openPrint(html);
}

// ── Komando PDF ───────────────────────────────────────────────
export function printKomandoPdf(z) {
  const branding = getDocumentBranding();
  const BASE_CSS = buildBaseCss();
  const BRAND_BLUE = branding.brandBlue;
  const ACCENT = branding.accent;
  const dnes  = new Date().toLocaleDateString('cs-CZ');
  const klient = z.klient_firma || [z.klient_jmeno, z.klient_prijmeni].filter(Boolean).join(' ') || '—';

  const ROLE_LABELS = {
    koordinator: 'Koordinátor', cisnik: 'Číšník / servírka',
    kuchar: 'Kuchař', ridic: 'Řidič', barman: 'Barman', pomocna_sila: 'Pomocná síla',
  };
  const TYP_LABELS = {
    svatba: 'Svatba', soukroma_akce: 'Soukromá akce',
    firemni_akce: 'Firemní akce', zavoz: 'Závoz', bistro: 'Bistro',
  };

  const personalRows = (z.personal || []).map(p => `
    <tr>
      <td><strong>${p.jmeno} ${p.prijmeni}</strong></td>
      <td>${ROLE_LABELS[p.role_na_akci || p.role] || p.role_na_akci || p.role || '—'}</td>
      <td>${p.cas_prichod ? p.cas_prichod.slice(0,5) : '—'}</td>
      <td>${p.cas_odchod  ? p.cas_odchod.slice(0,5)  : '—'}</td>
      <td>${p.telefon || '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="cs"><head>
    <meta charset="utf-8">
    <title>Komando – ${z.cislo}</title>
    <style>
      ${BASE_CSS}
      .header { background:${BRAND_BLUE}; color:#fff; padding:20px 30px; display:flex; justify-content:space-between; align-items:center; }
      .header-title { font-size:26px; font-weight:800; letter-spacing:3px; }
      .header-sub { font-size:12px; opacity:0.75; margin-top:2px; }
      .content { padding:22px 30px; }
      .event-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:22px; }
      .event-box { background:#f4f5fb; border-radius:6px; padding:10px 14px; border-left:3px solid ${BRAND_BLUE}; }
      .accent-bar { width:40px; height:4px; background:${ACCENT}; border-radius:2px; margin-bottom:14px; }
      .notes { background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; padding:12px 16px; margin-top:18px; font-size:11px; line-height:1.6; color:#444; }
      .footer { margin-top:24px; padding-top:12px; border-top:1px solid #ddd; display:flex; justify-content:space-between; font-size:9px; color:#999; }
      /* Komando – větší text */
      body { font-size:14px; }
      td { padding:10px 14px; font-size:13px; }
      th { padding:9px 14px; font-size:12px; }
      h2 { font-size:18px; }
      .label { font-size:11px; }
      .value { font-size:16px; }
      .value-sm { font-size:14px; }
      .notes { font-size:13px; }
      .header-sub { font-size:14px; }
    </style>
  </head><body>

  <div class="header">
    <div>
      <div style="font-size:11px;opacity:0.7;margin-bottom:3px">Catering Landa &amp; Dvořák</div>
      <div class="header-title">KOMANDO</div>
      <div class="header-sub">${z.cislo} · ${z.nazev}</div>
    </div>
    <div style="text-align:right;font-size:11px;opacity:0.85;line-height:2">
      <div>Vytištěno: ${dnes}</div>
      ${z.stav ? `<div style="background:rgba(255,255,255,0.15);padding:3px 10px;border-radius:12px;margin-top:4px">${z.stav.replace(/_/g,' ')}</div>` : ''}
    </div>
  </div>

  <div class="content">
    <div class="accent-bar"></div>
    <h2 style="margin-bottom:14px;font-size:16px">${z.nazev}</h2>

    <div class="event-grid">
      <div class="event-box">
        <div class="label">Datum akce</div>
        <div class="value">${fmtD(z.datum_akce)}</div>
      </div>
      <div class="event-box">
        <div class="label">Čas</div>
        <div class="value">${z.cas_zacatek ? z.cas_zacatek.slice(0,5) : '—'}${z.cas_konec ? ' – ' + z.cas_konec.slice(0,5) : ''}</div>
      </div>
      <div class="event-box">
        <div class="label">Počet hostů</div>
        <div class="value">${z.pocet_hostu || '—'}</div>
      </div>
      <div class="event-box">
        <div class="label">Místo konání</div>
        <div class="value">${z.misto || '—'}</div>
      </div>
      <div class="event-box">
        <div class="label">Klient</div>
        <div class="value">${klient}</div>
      </div>
      <div class="event-box">
        <div class="label">Typ akce</div>
        <div class="value">${TYP_LABELS[z.typ] || z.typ || '—'}</div>
      </div>
    </div>

    <h2 style="margin-bottom:10px">Přiřazený personál (${(z.personal||[]).length} osob)</h2>
    ${(z.personal||[]).length > 0 ? `
    <table>
      <thead><tr>
        <th>Jméno</th><th>Role</th><th>Příchod</th><th>Odchod</th><th>Telefon</th>
      </tr></thead>
      <tbody>${personalRows}</tbody>
    </table>` : '<p style="color:#888;font-size:11px;padding:10px 0">K zakázce nebyl přiřazen žádný personál.</p>'}

    ${z.nabidka && (z.nabidka.polozky||[]).length > 0 ? `
    <h2 style="margin-bottom:10px;margin-top:22px">Obsah nabídky (${(z.nabidka.polozky||[]).length} položek)</h2>
    <table>
      <thead><tr>
        <th>Položka</th><th style="text-align:center">Množství</th><th>Jednotka</th>
      </tr></thead>
      <tbody>${(z.nabidka.polozky||[]).map(p => `
        <tr>
          <td>${p.nazev || '—'}</td>
          <td style="text-align:center">${p.mnozstvi}</td>
          <td>${p.jednotka}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}

    ${z.poznamka_interni ? `
    <div class="notes">
      <strong style="display:block;margin-bottom:5px;color:${BRAND_BLUE}">Interní poznámky / instrukce:</strong>
      ${z.poznamka_interni}
    </div>` : ''}

    ${z.poznamka_klient ? `
    <div class="notes" style="background:#f0f9ff;border-color:#7dd3fc;margin-top:10px">
      <strong style="display:block;margin-bottom:5px;color:${BRAND_BLUE}">Poznámky od klienta:</strong>
      ${z.poznamka_klient}
    </div>` : ''}
  </div>

  <div style="padding:0 30px 20px">
    <div class="footer">
      <span>Catering Landa &amp; Dvořák – interní dokument</span>
      <span>www.cateringld.cz · Vytištěno: ${dnes}</span>
    </div>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`;

  openPrint(html);
}
import { safeGetJson } from './storage';
