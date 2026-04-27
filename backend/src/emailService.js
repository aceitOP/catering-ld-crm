'use strict';

const nodemailer = require('nodemailer');
const { createSmtpTransporter } = require('./smtpConfig');

function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    throw new Error('SMTP není nakonfigurován (chybí SMTP_HOST nebo SMTP_USER)');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = () => process.env.SMTP_FROM || process.env.SMTP_USER;

async function getMailer() {
  const { transporter, smtpCfg } = await createSmtpTransporter();
  return { transporter, from: smtpCfg.from || smtpCfg.user };
}

function czk(value) {
  if (value == null || value === '') return '—';
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(value);
}

function datum(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function cas(value) {
  return value ? String(value).slice(0, 5) : '—';
}

function wrapHtml(firma, title, body) {
  const nazev = firma?.firma_nazev || 'Catering LD';
  const email = firma?.firma_email || '';
  const telefon = firma?.firma_telefon || '';
  const web = firma?.firma_web || '';
  const podpis = firma?.email_podpis_html || '';

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1c1917;padding:24px 32px;">
              <div style="color:#fafaf9;font-size:20px;font-weight:bold;">${esc(nazev)}</div>
              <div style="color:#a8a29e;font-size:13px;margin-top:4px;">${esc(title)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
              ${podpis ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e7e5e4;">${podpis}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background:#f5f5f4;padding:16px 32px;border-top:1px solid #e7e5e4;">
              <div style="font-size:12px;color:#78716c;line-height:1.8;">
                <strong>${esc(nazev)}</strong><br>
                ${email ? `<a href="mailto:${esc(email)}" style="color:#78716c;">${esc(email)}</a>` : ''}
                ${telefon ? ` &nbsp;|&nbsp; ${esc(telefon)}` : ''}
                ${web ? ` &nbsp;|&nbsp; <a href="${esc(web)}" style="color:#78716c;">${esc(web)}</a>` : ''}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildKomandoRows(personal = []) {
  return personal.map((osoba) => `
    <tr style="border-bottom:1px solid #f5f5f4;">
      <td style="padding:9px 10px;font-size:14px;font-weight:600;">${esc(osoba.jmeno)} ${esc(osoba.prijmeni)}</td>
      <td style="padding:9px 10px;font-size:14px;color:#78716c;">${esc(osoba.role_na_akci || osoba.role || '—')}</td>
      <td style="padding:9px 10px;font-size:14px;text-align:center;">${cas(osoba.cas_prichod)}</td>
      <td style="padding:9px 10px;font-size:14px;text-align:center;">${cas(osoba.cas_odchod)}</td>
    </tr>
  `).join('');
}

function normalizeEmailList(input) {
  const parts = Array.isArray(input) ? input : String(input || '').split(/[\n,;]+/);
  const valid = [];
  const seen = new Set();

  for (const part of parts) {
    const email = String(part || '').trim().toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }

  return valid;
}

function getKomandoSubject(zakazka) {
  return `Komando: ${zakazka.nazev} - ${datum(zakazka.datum_akce)}`;
}

function buildKomandoIntro(zakazka, osoba) {
  if (osoba) {
    return `
      <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">
        Dobrý den, <strong>${esc(osoba.jmeno)}</strong>,<br>
        zasíláme Vám komando k akci <strong>${esc(zakazka.nazev)}</strong> (${esc(zakazka.cislo)}).
      </p>
    `;
  }

  return `
    <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">
      Dobrý den,<br>
      zasíláme komando k akci <strong>${esc(zakazka.nazev)}</strong> (${esc(zakazka.cislo)}).
    </p>
  `;
}

function buildKomandoDetailRows(zakazka, osoba) {
  return `
    <tr><td style="color:#78716c;padding-right:20px;">Datum:</td><td><strong>${datum(zakazka.datum_akce)}</strong></td></tr>
    <tr><td style="color:#78716c;padding-right:20px;">Čas akce:</td><td><strong>${cas(zakazka.cas_zacatek)} - ${cas(zakazka.cas_konec)}</strong></td></tr>
    <tr><td style="color:#78716c;padding-right:20px;">Místo:</td><td><strong>${esc(zakazka.misto || '—')}</strong></td></tr>
    <tr><td style="color:#78716c;padding-right:20px;">Počet hostů:</td><td><strong>${esc(zakazka.pocet_hostu || '—')}</strong></td></tr>
    ${osoba ? `<tr><td style="color:#78716c;padding-right:20px;">Váš příchod:</td><td><strong>${cas(osoba.cas_prichod)}</strong></td></tr>` : ''}
    ${osoba ? `<tr><td style="color:#78716c;padding-right:20px;">Váš odchod:</td><td><strong>${cas(osoba.cas_odchod)}</strong></td></tr>` : ''}
    ${osoba ? `<tr><td style="color:#78716c;padding-right:20px;">Vaše role:</td><td><strong>${esc(osoba.role_na_akci || osoba.role || '—')}</strong></td></tr>` : ''}
  `;
}

function buildKomandoBody({ personal, zakazka, poznamka, osoba }) {
  const personalRows = buildKomandoRows(personal);

  return `
    ${buildKomandoIntro(zakazka, osoba)}

    <div style="background:#f5f5f4;border-radius:8px;padding:20px;margin-bottom:24px;">
      <h3 style="margin:0 0 14px;font-size:15px;color:#1c1917;">Detaily akce</h3>
      <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:2;">
        ${buildKomandoDetailRows(zakazka, osoba)}
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
      <tbody>${personalRows}</tbody>
    </table>

    ${zakazka.poznamka_interni ? `
      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:16px;margin-bottom:24px;">
        <strong style="font-size:13px;color:#713f12;">Interní poznámka:</strong>
        <p style="margin:6px 0 0;font-size:14px;color:#1c1917;">${esc(zakazka.poznamka_interni).replace(/\n/g, '<br>')}</p>
      </div>
    ` : ''}

    ${poznamka ? `<p style="font-size:15px;line-height:1.7;margin:0 0 24px;">${esc(poznamka).replace(/\n/g, '<br>')}</p>` : ''}

    <p style="font-size:14px;color:#78716c;margin:0;">V případě dotazů nás neváhejte kontaktovat.</p>
  `;
}

async function sendNabidka({ to, nabidka, zakazka, firma, poznamka }) {
  const { transporter, from } = await getMailer();
  const polozky = nabidka.polozky || [];

  const radky = polozky.map((polozka) => `
    <tr style="border-bottom:1px solid #f5f5f4;">
      <td style="padding:9px 10px;font-size:14px;">${esc(polozka.nazev)}</td>
      <td style="padding:9px 10px;font-size:14px;text-align:right;">${esc(String(polozka.mnozstvi))}</td>
      <td style="padding:9px 10px;font-size:14px;color:#78716c;">${esc(polozka.jednotka)}</td>
      <td style="padding:9px 10px;font-size:14px;text-align:right;">${czk(polozka.cena_jednotka)}</td>
      <td style="padding:9px 10px;font-size:14px;font-weight:bold;text-align:right;">${czk(polozka.cena_celkem)}</td>
    </tr>
  `).join('');

  const slevaRadek = Number(nabidka.sleva_procent) > 0 ? `
    <tr>
      <td colspan="4" style="text-align:right;padding:6px 10px;color:#16a34a;font-size:14px;">Sleva ${nabidka.sleva_procent} %</td>
      <td style="text-align:right;padding:6px 10px;color:#16a34a;font-size:14px;">-${czk(Number(nabidka.cena_bez_dph) * Number(nabidka.sleva_procent) / 100)}</td>
    </tr>
  ` : '';

  const body = `
    ${nabidka.uvodni_text ? `<p style="font-size:15px;line-height:1.7;margin:0 0 24px;">${esc(nabidka.uvodni_text).replace(/\n/g, '<br>')}</p>` : ''}
    ${poznamka ? `<p style="font-size:15px;line-height:1.7;margin:0 0 24px;">${esc(poznamka).replace(/\n/g, '<br>')}</p>` : ''}

    <h2 style="font-size:16px;color:#1c1917;margin:0 0 12px;">${esc(nabidka.nazev)}</h2>
    ${zakazka.datum_akce ? `<p style="font-size:13px;color:#78716c;margin:0 0 20px;">Datum akce: <strong>${datum(zakazka.datum_akce)}</strong>${zakazka.misto ? ' | ' + esc(zakazka.misto) : ''}${zakazka.pocet_hostu ? ' | ' + esc(zakazka.pocet_hostu) + ' hostů' : ''}</p>` : ''}

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
        ${slevaRadek}
        <tr>
          <td colspan="4" style="text-align:right;padding:6px 10px;font-size:13px;color:#78716c;">DPH</td>
          <td style="text-align:right;padding:6px 10px;font-size:13px;">${czk(nabidka.dph)}</td>
        </tr>
        <tr style="background:#1c1917;">
          <td colspan="4" style="text-align:right;padding:12px 10px;font-size:15px;color:#fafaf9;font-weight:bold;">Celkem s DPH</td>
          <td style="text-align:right;padding:12px 10px;font-size:18px;color:#fafaf9;font-weight:bold;">${czk(nabidka.cena_celkem)}</td>
        </tr>
      </tfoot>
    </table>

    ${nabidka.platnost_do ? `<p style="font-size:13px;color:#78716c;margin:0 0 20px;">Nabídka platí do: <strong>${datum(nabidka.platnost_do)}</strong></p>` : ''}
    ${nabidka.zaverecny_text ? `<p style="font-size:15px;line-height:1.7;margin:20px 0 0;">${esc(nabidka.zaverecny_text).replace(/\n/g, '<br>')}</p>` : ''}
  `;

  await transporter.sendMail({
    from: `"${firma?.firma_nazev || 'Catering LD'}" <${from}>`,
    to,
    subject: `Nabídka: ${nabidka.nazev} - ${firma?.firma_nazev || 'Catering LD'}`,
    html: wrapHtml(firma, `Nabídka č. v${nabidka.verze}`, body),
  });
}

async function sendKomando({
  personal = [],
  zakazka,
  firma,
  poznamka,
  includeAssignedStaff = true,
  extraEmails = [],
}) {
  const { transporter, from } = await getMailer();
  const assignedStaff = personal.filter((osoba) => osoba.email);
  const extra = normalizeEmailList(extraEmails);
  const recipients = new Map();

  if (includeAssignedStaff) {
    for (const osoba of assignedStaff) {
      recipients.set(String(osoba.email).trim().toLowerCase(), {
        email: String(osoba.email).trim(),
        osoba,
      });
    }
  }

  for (const email of extra) {
    if (recipients.has(email)) continue;
    const matchedOsoba = assignedStaff.find((osoba) => String(osoba.email).trim().toLowerCase() === email);
    recipients.set(email, {
      email,
      osoba: matchedOsoba || null,
    });
  }

  if (!recipients.size) {
    throw new Error('Vyberte alespoň jednoho příjemce komanda');
  }

  const subject = getKomandoSubject(zakazka);
  const recipientList = Array.from(recipients.values());

  await Promise.all(recipientList.map((recipient) => transporter.sendMail({
    from: `"${firma?.firma_nazev || 'Catering LD'}" <${from}>`,
    to: recipient.email,
    subject,
    html: wrapHtml(
      firma,
      `Komando - ${zakazka.cislo}`,
      buildKomandoBody({
        personal,
        zakazka,
        poznamka,
        osoba: recipient.osoba,
      }),
    ),
  })));

  return {
    count: recipientList.length,
    recipients: recipientList.map((recipient) => recipient.email),
  };
}

async function sendDekujeme({ to, zakazka, firma, text }) {
  const { transporter, from } = await getMailer();
  const nazevFirmy = firma?.firma_nazev || 'Catering LD';

  const defaultText = `Vážený zákazníku,<br><br>
velice si vážíme Vaší důvěry a těší nás, že jsme mohli být součástí Vaší akce <strong>${esc(zakazka.nazev)}</strong>.
Doufáme, že vše proběhlo k Vaší spokojenosti a že na tuto chvíli budete vzpomínat jen v tom nejlepším.<br><br>
Budeme rádi, pokud nás budete mít na paměti při plánování dalších Vašich akcí. Rádi Vám opět pomůžeme.`;

  const body = `
    <p style="font-size:16px;font-weight:bold;color:#1c1917;margin:0 0 20px;">Děkujeme za spolupráci.</p>
    <p style="font-size:15px;line-height:1.8;margin:0 0 28px;">${text ? esc(text).replace(/\n/g, '<br>') : defaultText}</p>

    <div style="background:#f5f5f4;border-radius:8px;padding:20px;margin-bottom:28px;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#78716c;text-transform:uppercase;letter-spacing:.05em;">Souhrn akce</h3>
      <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:2;">
        <tr><td style="color:#78716c;padding-right:20px;">Akce:</td><td><strong>${esc(zakazka.nazev)}</strong></td></tr>
        ${zakazka.datum_akce ? `<tr><td style="color:#78716c;padding-right:20px;">Datum:</td><td><strong>${datum(zakazka.datum_akce)}</strong></td></tr>` : ''}
        ${zakazka.misto ? `<tr><td style="color:#78716c;padding-right:20px;">Místo:</td><td><strong>${esc(zakazka.misto)}</strong></td></tr>` : ''}
        ${zakazka.pocet_hostu ? `<tr><td style="color:#78716c;padding-right:20px;">Hostů:</td><td><strong>${esc(zakazka.pocet_hostu)}</strong></td></tr>` : ''}
        ${zakazka.cena_celkem ? `<tr><td style="color:#78716c;padding-right:20px;">Cena akce:</td><td><strong>${czk(zakazka.cena_celkem)}</strong></td></tr>` : ''}
      </table>
    </div>

    <p style="font-size:14px;color:#78716c;line-height:1.7;margin:0;">
      S pozdravem,<br>
      <strong>${esc(nazevFirmy)}</strong>
    </p>
  `;

  await transporter.sendMail({
    from: `"${nazevFirmy}" <${from}>`,
    to,
    subject: `Děkujeme za spolupráci - ${zakazka.nazev}`,
    html: wrapHtml(firma, 'Děkujeme za Vaši důvěru', body),
  });
}

async function sendPotvrzeniPoptavky({ to, jmeno, zakazka, firma }) {
  const { transporter, from } = await getMailer();
  const nazevFirmy = firma?.firma_nazev || 'Catering LD';

  const body = `
    <p style="font-size:15px;line-height:1.8;margin:0 0 24px;">
      Dobrý den${jmeno ? `, <strong>${esc(jmeno)}</strong>` : ''},<br><br>
      děkujeme za Váš zájem o naše služby. Vaše poptávka byla přijata a brzy se Vám ozveme.
    </p>

    <div style="background:#f5f5f4;border-radius:8px;padding:20px;margin-bottom:24px;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#78716c;text-transform:uppercase;letter-spacing:.05em;">Souhrn Vaší poptávky</h3>
      <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:2;">
        <tr><td style="color:#78716c;padding-right:20px;">Akce:</td><td><strong>${esc(zakazka.nazev)}</strong></td></tr>
        ${zakazka.datum_akce ? `<tr><td style="color:#78716c;padding-right:20px;">Datum:</td><td><strong>${datum(zakazka.datum_akce)}</strong></td></tr>` : ''}
        ${zakazka.misto ? `<tr><td style="color:#78716c;padding-right:20px;">Místo:</td><td><strong>${esc(zakazka.misto)}</strong></td></tr>` : ''}
        ${zakazka.pocet_hostu ? `<tr><td style="color:#78716c;padding-right:20px;">Počet hostů:</td><td><strong>${esc(zakazka.pocet_hostu)}</strong></td></tr>` : ''}
      </table>
    </div>

    <p style="font-size:14px;color:#78716c;line-height:1.8;margin:0;">
      Budeme Vás kontaktovat co nejdříve.<br>
      S pozdravem,<br>
      <strong>${esc(nazevFirmy)}</strong>
    </p>
  `;

  await transporter.sendMail({
    from: `"${nazevFirmy}" <${from}>`,
    to,
    subject: `Potvrzení přijetí poptávky - ${nazevFirmy}`,
    html: wrapHtml(firma, 'Vaše poptávka byla přijata', body),
  });
}

async function sendPasswordReset({ to, jmeno, resetUrl, firma }) {
  const { transporter, from } = await getMailer();
  const nazevFirmy = firma?.firma_nazev || 'Catering LD';

  const body = `
    <p style="font-size:15px;line-height:1.8;margin:0 0 20px;">
      Dobrý den${jmeno ? `, <strong>${esc(jmeno)}</strong>` : ''},<br><br>
      obdrželi jsme žádost o obnovení hesla do interního CRM systému.
    </p>

    <p style="font-size:15px;line-height:1.8;margin:0 0 24px;">
      Pro nastavení nového hesla klikněte na tlačítko níže. Odkaz je platný 60 minut a lze jej použít pouze jednou.
    </p>

    <div style="margin:0 0 24px;">
      <a href="${esc(resetUrl)}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold;">
        Obnovit heslo
      </a>
    </div>

    <p style="font-size:14px;line-height:1.7;color:#57534e;margin:0 0 12px;">
      Pokud tlačítko nefunguje, otevřete tento odkaz ručně:
    </p>
    <p style="font-size:13px;line-height:1.7;word-break:break-word;margin:0 0 24px;">
      <a href="${esc(resetUrl)}" style="color:#ea580c;">${esc(resetUrl)}</a>
    </p>

    <p style="font-size:14px;line-height:1.7;color:#57534e;margin:0;">
      Pokud jste o změnu hesla nežádali, můžete tento e-mail bezpečně ignorovat.
    </p>
  `;

  await transporter.sendMail({
    from: `"${nazevFirmy}" <${from}>`,
    to,
    subject: `Obnovení hesla - ${nazevFirmy}`,
    html: wrapHtml(firma, 'Obnovení hesla', body),
  });
}

module.exports = {
  sendNabidka,
  sendKomando,
  sendDekujeme,
  sendPotvrzeniPoptavky,
  sendPasswordReset,
};
