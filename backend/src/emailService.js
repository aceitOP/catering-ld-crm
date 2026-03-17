'use strict';
const nodemailer = require('nodemailer');

// ── HTML escaping helper ───────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Transporter ───────────────────────────────────────────────
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    throw new Error('SMTP není nakonfigurován (chybí SMTP_HOST nebo SMTP_USER)');
  }
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = () => process.env.SMTP_FROM || process.env.SMTP_USER;

// ── Pomocné formátovací funkce ────────────────────────────────
function czk(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n);
}

function datum(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Společná obálka emailu ────────────────────────────────────
function wrapHtml(firma, title, body) {
  const nazev  = firma?.firma_nazev || 'Catering LD';
  const email  = firma?.firma_email || '';
  const tel    = firma?.firma_telefon || '';
  const web    = firma?.firma_web || '';
  const podpis = firma?.email_podpis_html || '';

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#1c1917;padding:24px 32px;">
          <div style="color:#fafaf9;font-size:20px;font-weight:bold;">${nazev}</div>
          <div style="color:#a8a29e;font-size:13px;margin-top:4px;">${title}</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          ${body}
          ${podpis ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e7e5e4;">${podpis}</div>` : ''}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f5f5f4;padding:16px 32px;border-top:1px solid #e7e5e4;">
          <div style="font-size:12px;color:#78716c;line-height:1.8;">
            <strong>${nazev}</strong><br>
            ${email ? `<a href="mailto:${email}" style="color:#78716c;">${email}</a>` : ''}
            ${tel ? ` &nbsp;·&nbsp; ${tel}` : ''}
            ${web ? ` &nbsp;·&nbsp; <a href="${web}" style="color:#78716c;">${web}</a>` : ''}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── 1. NABÍDKA ────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string}   opts.to          - příjemce (email klienta)
 * @param {object}   opts.nabidka     - objekt nabídky (z DB) + polozky[]
 * @param {object}   opts.zakazka     - základní info o zakázce
 * @param {object}   opts.firma       - nastavení firmy (z nastaveni tabulky)
 * @param {string}   [opts.poznamka] - volitelná osobní poznámka
 */
async function sendNabidka({ to, nabidka, zakazka, firma, poznamka }) {
  const transporter = createTransporter();
  const polozky = nabidka.polozky || [];

  const radky = polozky.map(p => `
    <tr style="border-bottom:1px solid #f5f5f4;">
      <td style="padding:9px 10px;font-size:14px;">${esc(p.nazev)}</td>
      <td style="padding:9px 10px;font-size:14px;text-align:right;">${esc(String(p.mnozstvi))}</td>
      <td style="padding:9px 10px;font-size:14px;color:#78716c;">${esc(p.jednotka)}</td>
      <td style="padding:9px 10px;font-size:14px;text-align:right;">${czk(p.cena_jednotka)}</td>
      <td style="padding:9px 10px;font-size:14px;font-weight:bold;text-align:right;">${czk(p.cena_celkem)}</td>
    </tr>`).join('');

  const slevaRad = Number(nabidka.sleva_procent) > 0 ? `
    <tr>
      <td colspan="4" style="text-align:right;padding:6px 10px;color:#16a34a;font-size:14px;">Sleva ${nabidka.sleva_procent} %</td>
      <td style="text-align:right;padding:6px 10px;color:#16a34a;font-size:14px;">−${czk(Number(nabidka.cena_bez_dph) * Number(nabidka.sleva_procent) / 100)}</td>
    </tr>` : '';

  const body = `
    ${nabidka.uvodni_text ? `<p style="font-size:15px;line-height:1.7;margin:0 0 24px;">${esc(nabidka.uvodni_text).replace(/\n/g,'<br>')}</p>` : ''}
    ${poznamka ? `<p style="font-size:15px;line-height:1.7;margin:0 0 24px;">${esc(poznamka).replace(/\n/g,'<br>')}</p>` : ''}

    <h2 style="font-size:16px;color:#1c1917;margin:0 0 12px;">${esc(nabidka.nazev)}</h2>
    ${zakazka.datum_akce ? `<p style="font-size:13px;color:#78716c;margin:0 0 20px;">Datum akce: <strong>${datum(zakazka.datum_akce)}</strong>${zakazka.misto ? ' · ' + esc(zakazka.misto) : ''}${zakazka.pocet_hostu ? ' · ' + zakazka.pocet_hostu + ' hostů' : ''}</p>` : ''}

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="background:#f5f5f4;border-bottom:2px solid #e7e5e4;">
          <th style="text-align:left;padding:10px;font-size:12px;color:#78716c;font-weight:600;">Položka</th>
          <th style="text-align:right;padding:10px;font-size:12px;color:#78716c;font-weight:600;">Mn.</th>
          <th style="text-align:left;padding:10px;font-size:12px;color:#78716c;font-weight:600;">Jedn.</th>
          <th style="text-align:right;padding:10px;font-size:12px;color:#78716c;font-weight:600;">Cena/jedn.</th>
          <th style="text-align:right;padding:10px;font-size:12px;color:#78716c;font-weight:600;">Celkem</th>
        </tr>
      </thead>
      <tbody>${radky}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #e7e5e4;">
          <td colspan="4" style="text-align:right;padding:8px 10px;font-size:13px;color:#78716c;">Cena bez DPH</td>
          <td style="text-align:right;padding:8px 10px;font-size:13px;">${czk(nabidka.cena_bez_dph)}</td>
        </tr>
        ${slevaRad}
        <tr>
          <td colspan="4" style="text-align:right;padding:6px 10px;font-size:13px;color:#78716c;">DPH</td>
          <td style="text-align:right;padding:6px 10px;font-size:13px;">${czk(nabidka.dph)}</td>
        </tr>
        <tr style="background:#1c1917;border-radius:8px;">
          <td colspan="4" style="text-align:right;padding:12px 10px;font-size:15px;color:#fafaf9;font-weight:bold;">Celkem s DPH</td>
          <td style="text-align:right;padding:12px 10px;font-size:18px;color:#fafaf9;font-weight:bold;">${czk(nabidka.cena_celkem)}</td>
        </tr>
      </tfoot>
    </table>

    ${nabidka.platnost_do ? `<p style="font-size:13px;color:#78716c;margin:0 0 20px;">⏱ Nabídka platí do: <strong>${datum(nabidka.platnost_do)}</strong></p>` : ''}
    ${nabidka.zaverecny_text ? `<p style="font-size:15px;line-height:1.7;margin:20px 0 0;">${esc(nabidka.zaverecny_text).replace(/\n/g,'<br>')}</p>` : ''}
  `;

  const subject = `Nabídka: ${nabidka.nazev} – ${firma?.firma_nazev || 'Catering LD'}`;

  await transporter.sendMail({
    from: `"${firma?.firma_nazev || 'Catering LD'}" <${FROM()}>`,
    to,
    subject,
    html: wrapHtml(firma, `Nabídka č. v${nabidka.verze}`, body),
  });
}

// ── 2. KOMANDO ────────────────────────────────────────────────
/**
 * @param {object}   opts
 * @param {object[]} opts.personal   - seznam přiřazeného personálu (každý má jmeno, prijmeni, email, role_na_akci, cas_prichod, cas_odchod)
 * @param {object}   opts.zakazka    - detail zakázky (datum_akce, cas_zacatek, cas_konec, misto, pocet_hostu, nazev, cislo, poznamka_interni)
 * @param {object}   opts.firma      - nastavení firmy
 * @param {string}   [opts.poznamka] - volitelná extra poznámka od odesílatele
 */
async function sendKomando({ personal, zakazka, firma, poznamka }) {
  const transporter = createTransporter();
  const emailPersonal = personal.filter(p => p.email);

  if (!emailPersonal.length) {
    throw new Error('Žádný přiřazený personál nemá vyplněný email');
  }

  const personalRadky = personal.map(p => `
    <tr style="border-bottom:1px solid #f5f5f4;">
      <td style="padding:9px 10px;font-size:14px;font-weight:600;">${esc(p.jmeno)} ${esc(p.prijmeni)}</td>
      <td style="padding:9px 10px;font-size:14px;color:#78716c;">${esc(p.role_na_akci || p.role || '—')}</td>
      <td style="padding:9px 10px;font-size:14px;text-align:center;">${p.cas_prichod ? p.cas_prichod.slice(0,5) : '—'}</td>
      <td style="padding:9px 10px;font-size:14px;text-align:center;">${p.cas_odchod ? p.cas_odchod.slice(0,5) : '—'}</td>
    </tr>`).join('');

  const buildBody = (osoba) => `
    <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">
      Dobrý den, <strong>${esc(osoba.jmeno)}</strong>,<br>
      zasíláme Vám komando k akci <strong>${esc(zakazka.nazev)}</strong> (${esc(zakazka.cislo)}).
    </p>

    <div style="background:#f5f5f4;border-radius:8px;padding:20px;margin-bottom:24px;">
      <h3 style="margin:0 0 14px;font-size:15px;color:#1c1917;">Detaily akce</h3>
      <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:2;">
        <tr><td style="color:#78716c;padding-right:20px;">Datum:</td><td><strong>${datum(zakazka.datum_akce)}</strong></td></tr>
        <tr><td style="color:#78716c;padding-right:20px;">Čas akce:</td><td><strong>${zakazka.cas_zacatek ? zakazka.cas_zacatek.slice(0,5) : '—'} – ${zakazka.cas_konec ? zakazka.cas_konec.slice(0,5) : '—'}</strong></td></tr>
        <tr><td style="color:#78716c;padding-right:20px;">Místo:</td><td><strong>${esc(zakazka.misto || '—')}</strong></td></tr>
        <tr><td style="color:#78716c;padding-right:20px;">Počet hostů:</td><td><strong>${zakazka.pocet_hostu || '—'}</strong></td></tr>
        <tr><td style="color:#78716c;padding-right:20px;">Váš příchod:</td><td><strong>${osoba.cas_prichod ? osoba.cas_prichod.slice(0,5) : '—'}</strong></td></tr>
        <tr><td style="color:#78716c;padding-right:20px;">Váš odchod:</td><td><strong>${osoba.cas_odchod ? osoba.cas_odchod.slice(0,5) : '—'}</strong></td></tr>
        <tr><td style="color:#78716c;padding-right:20px;">Vaše role:</td><td><strong>${esc(osoba.role_na_akci || osoba.role || '—')}</strong></td></tr>
      </table>
    </div>

    <h3 style="font-size:15px;color:#1c1917;margin:0 0 12px;">Tým na akci</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="background:#f5f5f4;border-bottom:2px solid #e7e5e4;">
          <th style="text-align:left;padding:8px 10px;font-size:12px;color:#78716c;">Jméno</th>
          <th style="text-align:left;padding:8px 10px;font-size:12px;color:#78716c;">Role</th>
          <th style="text-align:center;padding:8px 10px;font-size:12px;color:#78716c;">Příchod</th>
          <th style="text-align:center;padding:8px 10px;font-size:12px;color:#78716c;">Odchod</th>
        </tr>
      </thead>
      <tbody>${personalRadky}</tbody>
    </table>

    ${zakazka.poznamka_interni ? `
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:16px;margin-bottom:24px;">
      <strong style="font-size:13px;color:#713f12;">Interní poznámka:</strong>
      <p style="margin:6px 0 0;font-size:14px;color:#1c1917;">${esc(zakazka.poznamka_interni).replace(/\n/g,'<br>')}</p>
    </div>` : ''}

    ${poznamka ? `<p style="font-size:15px;line-height:1.7;margin:0 0 24px;">${esc(poznamka).replace(/\n/g,'<br>')}</p>` : ''}

    <p style="font-size:14px;color:#78716c;margin:0;">V případě dotazů nás neváhejte kontaktovat.</p>
  `;

  const subject = `Komando: ${zakazka.nazev} – ${datum(zakazka.datum_akce)}`;

  await Promise.all(emailPersonal.map(osoba =>
    transporter.sendMail({
      from: `"${firma?.firma_nazev || 'Catering LD'}" <${FROM()}>`,
      to: osoba.email,
      subject,
      html: wrapHtml(firma, `Komando – ${zakazka.cislo}`, buildBody(osoba)),
    })
  ));

  return emailPersonal.length;
}

// ── 3. DĚKOVACÍ EMAIL ─────────────────────────────────────────
/**
 * @param {object}  opts
 * @param {string}  opts.to          - příjemce (email klienta)
 * @param {object}  opts.zakazka     - detail zakázky
 * @param {object}  opts.firma       - nastavení firmy
 * @param {string}  [opts.text]      - vlastní text emailu (nebo se použije výchozí)
 */
async function sendDekujeme({ to, zakazka, firma, text }) {
  const transporter = createTransporter();
  const nazevFirmy = firma?.firma_nazev || 'Catering LD';

  const defaultText = `Vážení,<br><br>
velice si vážíme Vaší důvěry a těší nás, že jsme mohli být součástí Vaší akce <strong>${esc(zakazka.nazev)}</strong>.
Doufáme, že vše proběhlo k Vaší spokojenosti a že na tuto chvíli budete vzpomínat jen v tom nejlepším.<br><br>
Budeme rádi, pokud nás budete mít na paměti při plánování dalších Vašich akcí. Rádi Vám opět pomůžeme.`;

  const bodyText = text ? esc(text).replace(/\n/g,'<br>') : defaultText;

  const body = `
    <p style="font-size:16px;font-weight:bold;color:#1c1917;margin:0 0 20px;">Děkujeme za spolupráci!</p>
    <p style="font-size:15px;line-height:1.8;margin:0 0 28px;">${bodyText}</p>

    <div style="background:#f5f5f4;border-radius:8px;padding:20px;margin-bottom:28px;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#78716c;text-transform:uppercase;letter-spacing:.05em;">Souhrn akce</h3>
      <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:2;">
        <tr><td style="color:#78716c;padding-right:20px;">Akce:</td><td><strong>${esc(zakazka.nazev)}</strong></td></tr>
        ${zakazka.datum_akce ? `<tr><td style="color:#78716c;padding-right:20px;">Datum:</td><td><strong>${datum(zakazka.datum_akce)}</strong></td></tr>` : ''}
        ${zakazka.misto ? `<tr><td style="color:#78716c;padding-right:20px;">Místo:</td><td><strong>${esc(zakazka.misto)}</strong></td></tr>` : ''}
        ${zakazka.pocet_hostu ? `<tr><td style="color:#78716c;padding-right:20px;">Hostů:</td><td><strong>${zakazka.pocet_hostu}</strong></td></tr>` : ''}
        ${zakazka.cena_celkem ? `<tr><td style="color:#78716c;padding-right:20px;">Cena akce:</td><td><strong>${czk(zakazka.cena_celkem)}</strong></td></tr>` : ''}
      </table>
    </div>

    <p style="font-size:14px;color:#78716c;line-height:1.7;margin:0;">
      S pozdravem,<br>
      <strong>${nazevFirmy}</strong>
    </p>
  `;

  const subject = `Děkujeme za spolupráci – ${zakazka.nazev}`;

  await transporter.sendMail({
    from: `"${nazevFirmy}" <${FROM()}>`,
    to,
    subject,
    html: wrapHtml(firma, 'Děkujeme za Vaši důvěru', body),
  });
}

// ── 4. POTVRZENÍ PŘIJETÍ POPTÁVKY ─────────────────────────────
/**
 * @param {object}  opts
 * @param {string}  opts.to          - příjemce (email klienta)
 * @param {string}  opts.jmeno       - jméno klienta
 * @param {object}  opts.zakazka     - detail zakázky (nazev, typ, datum_akce, misto, pocet_hostu)
 * @param {object}  opts.firma       - nastavení firmy
 */
async function sendPotvrzeniPoptavky({ to, jmeno, zakazka, firma }) {
  const transporter = createTransporter();
  const nazevFirmy  = firma?.firma_nazev || 'Catering LD';

  const body = `
    <p style="font-size:15px;line-height:1.8;margin:0 0 24px;">
      Dobrý den${jmeno ? `, <strong>${esc(jmeno)}</strong>` : ''},<br><br>
      děkujeme za Váš zájem o naše služby. Vaše poptávka byla přijata a my se Vám brzy ozveme.
    </p>

    <div style="background:#f5f5f4;border-radius:8px;padding:20px;margin-bottom:24px;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#78716c;text-transform:uppercase;letter-spacing:.05em;">Souhrn Vaší poptávky</h3>
      <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:2;">
        <tr><td style="color:#78716c;padding-right:20px;">Akce:</td><td><strong>${esc(zakazka.nazev)}</strong></td></tr>
        ${zakazka.datum_akce ? `<tr><td style="color:#78716c;padding-right:20px;">Datum:</td><td><strong>${datum(zakazka.datum_akce)}</strong></td></tr>` : ''}
        ${zakazka.misto ? `<tr><td style="color:#78716c;padding-right:20px;">Místo:</td><td><strong>${esc(zakazka.misto)}</strong></td></tr>` : ''}
        ${zakazka.pocet_hostu ? `<tr><td style="color:#78716c;padding-right:20px;">Počet hostů:</td><td><strong>${zakazka.pocet_hostu}</strong></td></tr>` : ''}
      </table>
    </div>

    <p style="font-size:14px;color:#78716c;line-height:1.8;margin:0;">
      Budeme Vás kontaktovat co nejdříve.<br>
      S pozdravem,<br>
      <strong>${nazevFirmy}</strong>
    </p>
  `;

  await transporter.sendMail({
    from: `"${nazevFirmy}" <${FROM()}>`,
    to,
    subject: `Potvrzení přijetí poptávky – ${nazevFirmy}`,
    html: wrapHtml(firma, 'Vaše poptávka byla přijata', body),
  });
}

module.exports = { sendNabidka, sendKomando, sendDekujeme, sendPotvrzeniPoptavky };
