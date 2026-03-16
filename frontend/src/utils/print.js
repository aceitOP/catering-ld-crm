// ── Print / PDF utilities ────────────────────────────────────
// Opens a styled print window; user saves as PDF via browser dialog.

const BRAND_BLUE  = '#262d64';
const ACCENT      = '#EB5939';
const FONT_URL    = 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&display=swap';

const BASE_CSS = `
  @import url('${FONT_URL}');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Syne', Arial, sans-serif; font-size: 11px; color: #333; background: #fff; }
  h1 { font-size: 18px; font-weight: 700; color: ${BRAND_BLUE}; }
  h2 { font-size: 13px; font-weight: 600; color: ${BRAND_BLUE}; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: ${BRAND_BLUE}; color: #fff; }
  th { padding: 7px 10px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  td { padding: 6px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) td { background: #f9f9fb; }
  .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 3px; }
  .value { font-size: 12px; font-weight: 600; color: ${BRAND_BLUE}; }
  .value-sm { font-size: 11px; color: #555; }
  @media print {
    @page { size: A4; margin: 0; }
    body { margin: 0; }
    .no-print { display: none; }
  }
`;

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

// ── Komando PDF ───────────────────────────────────────────────
export function printKomandoPdf(z) {
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
