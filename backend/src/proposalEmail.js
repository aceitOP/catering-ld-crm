'use strict';

const { createSmtpTransporter } = require('./smtpConfig');

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function czk(n) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function datum(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

async function getMailer() {
  const { transporter, smtpCfg } = await createSmtpTransporter();
  return {
    transporter,
    from: `"${process.env.SMTP_FROM_NAME || 'Catering LD'}" <${smtpCfg.from || smtpCfg.user}>`,
  };
}

async function sendProposalLink(to, proposal) {
  const { transporter, from } = await getMailer();

  const html = `
    <!DOCTYPE html>
    <html lang="cs">
    <head><meta charset="utf-8"><title>Výběr menu</title></head>
    <body style="font-family:Inter,Arial,sans-serif;background:#f5f5f4;margin:0;padding:32px 16px">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="background:linear-gradient(135deg,#2d1b69,#5b21b6);padding:32px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">Výběr menu</h1>
          <p style="color:#c4b5fd;margin:8px 0 0;font-size:14px">${esc(proposal.nazev || 'Nabídka')}</p>
        </div>
        <div style="padding:32px">
          <p style="color:#44403c;font-size:15px;line-height:1.6">Dobrý den,</p>
          <p style="color:#44403c;font-size:15px;line-height:1.6">
            připravili jsme pro vás interaktivní výběr menu pro vaši akci
            <strong>${esc(proposal.zakazka_nazev || '')}</strong>
            ${proposal.datum_akce ? ` plánovanou na ${datum(proposal.datum_akce)}` : ''}.
          </p>
          ${proposal.uvodni_text ? `<p style="color:#44403c;font-size:14px;line-height:1.6;background:#fafaf9;border-left:3px solid #a78bfa;padding:12px 16px;border-radius:0 8px 8px 0">${esc(proposal.uvodni_text)}</p>` : ''}
          <p style="color:#44403c;font-size:15px;line-height:1.6">
            Klikněte na tlačítko níže, vyberte si z nabízených variant a svůj výběr závazně potvrďte.
          </p>
          <div style="text-align:center;margin:32px 0">
            <a href="${esc(proposal.url)}"
               style="display:inline-block;background:linear-gradient(135deg,#2d1b69,#5b21b6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600">
              Vybrat menu →
            </a>
          </div>
          <p style="color:#78716c;font-size:12px">
            Nebo zkopírujte tento odkaz do prohlížeče:<br>
            <a href="${esc(proposal.url)}" style="color:#7c3aed;word-break:break-all">${esc(proposal.url)}</a>
          </p>
          ${proposal.expires_at ? `<p style="color:#dc2626;font-size:12px;background:#fef2f2;padding:8px 12px;border-radius:8px;border:1px solid #fecaca">
            Výběr je dostupný do: <strong>${datum(proposal.expires_at)}</strong>
          </p>` : ''}
        </div>
        <div style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:16px 32px;text-align:center">
          <p style="color:#a8a29e;font-size:11px;margin:0">Catering LD · info@catering-ld.cz</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: `Výběr menu – ${proposal.nazev || 'Vaše akce'}`,
    html,
  });
}

async function sendProposalConfirmed(to, proposal, selections) {
  const { transporter, from } = await getMailer();

  const grouped = {};
  for (const pol of selections) {
    if (!grouped[pol.sekce_nazev]) grouped[pol.sekce_nazev] = [];
    grouped[pol.sekce_nazev].push(pol);
  }

  const selectionHtml = Object.entries(grouped).map(([sekce, items]) => `
    <div style="margin-bottom:16px">
      <div style="font-weight:600;color:#2d1b69;font-size:13px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${esc(sekce)}</div>
      ${items.map((item) => `
        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:#fafaf9;border-radius:6px;margin-bottom:4px">
          <div>
            <span style="font-size:14px;color:#1c1917">${esc(item.nazev)}</span>
            ${item.poznamka_klienta ? `<br><span style="font-size:12px;color:#f97316;font-style:italic">Poznámka: ${esc(item.poznamka_klienta)}</span>` : ''}
          </div>
          <span style="font-size:13px;color:#44403c;font-weight:500;white-space:nowrap;margin-left:16px">${czk(item.cena_os)} / os.</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="cs">
    <head><meta charset="utf-8"></head>
    <body style="font-family:Inter,Arial,sans-serif;background:#f5f5f4;margin:0;padding:32px 16px">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="background:linear-gradient(135deg,#14532d,#16a34a);padding:28px 32px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">OK</div>
          <h1 style="color:#fff;margin:0;font-size:20px">Výběr menu potvrzen</h1>
          <p style="color:#bbf7d0;margin:6px 0 0;font-size:13px">${esc(proposal.nazev || '')}</p>
        </div>
        <div style="padding:32px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
            <tr><td style="color:#78716c;padding:4px 0;width:160px">Potvrdil(a):</td><td style="color:#1c1917;font-weight:600">${esc(proposal.signed_by)}</td></tr>
            <tr><td style="color:#78716c;padding:4px 0">Datum potvrzení:</td><td style="color:#1c1917">${datum(proposal.signed_at || new Date())}</td></tr>
            <tr><td style="color:#78716c;padding:4px 0">Akce:</td><td style="color:#1c1917">${esc(proposal.zakazka_nazev || '—')}</td></tr>
            ${proposal.datum_akce ? `<tr><td style="color:#78716c;padding:4px 0">Datum akce:</td><td style="color:#1c1917">${datum(proposal.datum_akce)}</td></tr>` : ''}
            <tr><td style="color:#78716c;padding:4px 0">Počet hostů:</td><td style="color:#1c1917">${proposal.guest_count}</td></tr>
            <tr><td style="color:#78716c;padding:4px 0">Celková cena:</td><td style="color:#2d1b69;font-weight:700;font-size:16px">${czk(proposal.total_price)}</td></tr>
          </table>

          <div style="border-top:1px solid #e7e5e4;padding-top:20px;margin-bottom:8px">
            <div style="font-size:15px;font-weight:600;color:#1c1917;margin-bottom:16px">Potvrzený výběr menu:</div>
            ${selectionHtml || '<p style="color:#78716c;font-size:14px">Žádné položky nebyly vybrány.</p>'}
          </div>

          ${selections.some((s) => s.poznamka_klienta) ? `
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;margin-top:16px">
            <div style="font-weight:600;color:#c2410c;font-size:13px;margin-bottom:8px">Speciální požadavky klientů:</div>
            ${selections.filter((s) => s.poznamka_klienta).map((s) => `
              <div style="font-size:13px;color:#7c2d12;margin-bottom:4px">
                <strong>${esc(s.nazev)}:</strong> ${esc(s.poznamka_klienta)}
              </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        <div style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:16px 32px;text-align:center">
          <p style="color:#a8a29e;font-size:11px;margin:0">Catering LD – automatické potvrzení výběru menu</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: `Potvrzen výběr menu – ${proposal.nazev || proposal.zakazka_nazev || 'Akce'}`,
    html,
  });
}

module.exports = { sendProposalLink, sendProposalConfirmed };
