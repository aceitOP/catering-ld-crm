'use strict';
const router = require('express').Router();
const { query, withTransaction } = require('../db');
const { auth, requireCapability } = require('../middleware/auth');
const { loadFirmaSettings } = require('../firmaSettings');
const { resolveDocumentBranding } = require('../documentBranding');
const { renderPdfFromHtml, sendPdfResponse } = require('../pdfService');
const { sendFakturaEmail } = require('../emailService');

// Generátor čísla faktury: FAK-{rok}-{seq}
async function genCislo(client) {
  const rok = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT cislo FROM faktury WHERE cislo LIKE $1 ORDER BY cislo DESC LIMIT 1`,
    [`FAK-${rok}-%`]
  );
  if (!rows.length) return `FAK-${rok}-001`;
  const last = parseInt(rows[0].cislo.split('-')[2], 10);
  return `FAK-${rok}-${String(last + 1).padStart(3, '0')}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value) {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(Number(value || 0));
}

function date(value) {
  return value ? new Date(value).toLocaleDateString('cs-CZ') : '—';
}

function buildCompactFakturaHtml({ faktura, polozky, firma, branding }) {
  const klient = faktura.klient_firma || [faktura.klient_jmeno, faktura.klient_prijmeni].filter(Boolean).join(' ') || '—';
  const itemRows = (polozky || []).map((item) => {
    const line = Number(item.mnozstvi || 0) * Number(item.cena_jednotka || 0);
    return `<tr><td>${esc(item.nazev)}</td><td class="right">${esc(item.mnozstvi)}</td><td>${esc(item.jednotka || 'ks')}</td><td class="right">${money(line)}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"><style>
    @import url('${esc(branding.fontImportUrl)}');
    body{margin:0;font-family:${branding.fontFamily};color:#1f2937;background:#fff}
    .page{padding:34px}.header{display:flex;justify-content:space-between;border-bottom:3px solid ${branding.primary};padding-bottom:20px;margin-bottom:24px}
    h1{margin:0;font-size:32px}.muted{color:#64748b;font-size:13px;line-height:1.7}.card{border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px}th{text-align:left;color:#64748b;background:#f8fafc}.right{text-align:right}
    .grand{margin-left:auto;margin-top:18px;width:330px;background:${branding.primary};color:white;border-radius:14px;padding:14px 16px;font-size:18px;font-weight:800}
  </style></head><body><main class="page">
    <section class="header"><div><h1>Faktura ${esc(faktura.cislo)}</h1><div class="muted">Splatnost ${date(faktura.datum_splatnosti)} · VS ${esc(faktura.variabilni_symbol || '—')}</div></div><div class="muted" style="text-align:right"><strong>${esc(firma.firma_nazev || branding.appTitle)}</strong><br>${esc(firma.firma_email || '')}<br>${esc(firma.firma_telefon || '')}</div></section>
    <div class="card"><strong>${esc(klient)}</strong><div class="muted">${esc(faktura.klient_adresa || '')}</div></div>
    <table><thead><tr><th>Položka</th><th class="right">Množství</th><th>Jednotka</th><th class="right">Celkem</th></tr></thead><tbody>${itemRows || '<tr><td colspan="4">Faktura nemá položky.</td></tr>'}</tbody></table>
    <div class="grand">Celkem k úhradě <span style="float:right">${money(faktura.cena_celkem)}</span></div>
  </main></body></html>`;
}

// GET /api/faktury
router.get('/', auth, async (req, res, next) => {
  try {
    const { stav, klient_id, zakazka_id, q } = req.query;
    const where = []; const params = []; let p = 1;
    if (stav)       { where.push(`f.stav = $${p++}`);                                            params.push(stav); }
    if (klient_id)  { where.push(`f.klient_id = $${p++}`);                                       params.push(klient_id); }
    if (zakazka_id) { where.push(`f.zakazka_id = $${p++}`);                                      params.push(zakazka_id); }
    if (q)          { where.push(`(f.cislo ILIKE $${p} OR k.jmeno ILIKE $${p} OR k.firma ILIKE $${p})`); params.push(`%${q}%`); p++; }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(`
      SELECT f.*,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
             z.cislo AS zakazka_cislo
      FROM faktury f
      LEFT JOIN klienti k ON k.id = f.klient_id
      LEFT JOIN zakazky z ON z.id = f.zakazka_id
      ${wc}
      ORDER BY f.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/faktury/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT f.*,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
             k.ico AS klient_ico, k.dic AS klient_dic, k.adresa AS klient_adresa, k.email AS klient_email,
             z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev
      FROM faktury f
      LEFT JOIN klienti k ON k.id = f.klient_id
      LEFT JOIN zakazky z ON z.id = f.zakazka_id
      WHERE f.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Faktura nenalezena' });
    const polozky = await query(
      'SELECT * FROM faktury_polozky WHERE faktura_id = $1 ORDER BY poradi, id',
      [req.params.id]
    );
    res.json({ ...rows[0], polozky: polozky.rows });
  } catch (err) { next(err); }
});

// GET /api/faktury/:id/pdf
router.get('/:id/pdf', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT f.*,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
             k.ico AS klient_ico, k.dic AS klient_dic, k.adresa AS klient_adresa, k.email AS klient_email,
             z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev
      FROM faktury f
      LEFT JOIN klienti k ON k.id = f.klient_id
      LEFT JOIN zakazky z ON z.id = f.zakazka_id
      WHERE f.id = $1
    `, [req.params.id]);
    const faktura = rows[0];
    if (!faktura) return res.status(404).json({ error: 'Faktura nenalezena' });

    const polozky = await query(
      'SELECT * FROM faktury_polozky WHERE faktura_id = $1 ORDER BY poradi, id',
      [req.params.id]
    );
    const firma = await loadFirmaSettings();
    const branding = resolveDocumentBranding(firma);
    const klient = faktura.klient_firma || [faktura.klient_jmeno, faktura.klient_prijmeni].filter(Boolean).join(' ') || '—';
    const itemRows = polozky.rows.map((item) => {
      const line = Number(item.mnozstvi || 0) * Number(item.cena_jednotka || 0);
      return `<tr><td>${esc(item.nazev)}</td><td class="right">${esc(item.mnozstvi)}</td><td>${esc(item.jednotka || 'ks')}</td><td class="right">${money(item.cena_jednotka)}</td><td class="right">${money(line)}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('${esc(branding.fontImportUrl)}');
    body { margin:0; font-family:${branding.fontFamily}; color:#1f2937; background:#f8fafc; }
    .page { max-width:920px; margin:24px auto; background:#fff; padding:34px; box-shadow:0 12px 34px rgba(15,23,42,.08); }
    .header { display:flex; justify-content:space-between; gap:24px; border-bottom:3px solid ${branding.primary}; padding-bottom:22px; margin-bottom:24px; }
    h1 { margin:0; font-size:32px; }
    .muted { color:#64748b; font-size:13px; line-height:1.7; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:22px; }
    .card { border:1px solid #e5e7eb; border-radius:16px; padding:16px; }
    .label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#64748b; font-weight:800; margin-bottom:6px; }
    table { width:100%; border-collapse:collapse; }
    th,td { padding:10px 12px; border-bottom:1px solid #e5e7eb; font-size:14px; vertical-align:top; }
    th { text-align:left; color:#64748b; font-size:11px; text-transform:uppercase; background:#f8fafc; }
    .right { text-align:right; }
    .total { margin-left:auto; width:330px; margin-top:18px; }
    .total-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e5e7eb; }
    .grand { background:${branding.primary}; color:white; border-radius:14px; padding:13px 16px; font-size:18px; font-weight:800; margin-top:8px; }
    @media print { body { background:#fff; } .page { margin:0; max-width:none; box-shadow:none; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <div>
        ${branding.logoDataUrl ? `<img src="${esc(branding.logoDataUrl)}" alt="Logo" style="width:72px;height:72px;object-fit:contain;margin-bottom:12px">` : ''}
        <h1>Faktura ${esc(faktura.cislo)}</h1>
        <div class="muted">Zakázka: ${esc(faktura.zakazka_cislo || '—')} ${faktura.zakazka_nazev ? `· ${esc(faktura.zakazka_nazev)}` : ''}</div>
      </div>
      <div class="muted" style="text-align:right">
        <strong>${esc(firma.firma_nazev || branding.appTitle)}</strong><br>
        ${esc(firma.firma_adresa || '')}<br>
        ${firma.firma_email ? esc(firma.firma_email) + '<br>' : ''}
        ${firma.firma_telefon ? esc(firma.firma_telefon) : ''}
      </div>
    </section>
    <section class="grid">
      <div class="card"><div class="label">Odběratel</div><strong>${esc(klient)}</strong><div class="muted">${esc(faktura.klient_adresa || '')}</div><div class="muted">${esc(faktura.klient_email || '')}</div></div>
      <div class="card"><div class="label">Platební údaje</div><div>Vystaveno: <strong>${date(faktura.datum_vystaveni)}</strong></div><div>Splatnost: <strong>${date(faktura.datum_splatnosti)}</strong></div><div>VS: <strong>${esc(faktura.variabilni_symbol || '—')}</strong></div><div>Způsob platby: <strong>${esc(faktura.zpusob_platby || '—')}</strong></div></div>
    </section>
    <table>
      <thead><tr><th>Položka</th><th class="right">Množství</th><th>Jednotka</th><th class="right">Cena/jedn.</th><th class="right">Celkem</th></tr></thead>
      <tbody>${itemRows || '<tr><td colspan="5">Faktura nemá položky.</td></tr>'}</tbody>
    </table>
    <section class="total">
      <div class="total-row"><span>Cena bez DPH</span><strong>${money(faktura.cena_bez_dph)}</strong></div>
      <div class="total-row"><span>DPH</span><strong>${money(faktura.dph)}</strong></div>
      <div class="grand"><span>Celkem k úhradě</span><span style="float:right">${money(faktura.cena_celkem)}</span></div>
    </section>
    ${faktura.poznamka ? `<p class="muted" style="margin-top:26px;white-space:pre-wrap">${esc(faktura.poznamka)}</p>` : ''}
  </main>
</body>
</html>`;

    return sendPdfResponse(res, html, `faktura-${faktura.cislo || faktura.id}.pdf`);
  } catch (err) { next(err); }
});

// POST /api/faktury/:id/send
router.post('/:id/send', auth, requireCapability('faktury.manage'), async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT f.*,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma,
             k.adresa AS klient_adresa, k.email AS klient_email,
             z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev
      FROM faktury f
      LEFT JOIN klienti k ON k.id = f.klient_id
      LEFT JOIN zakazky z ON z.id = f.zakazka_id
      WHERE f.id = $1
    `, [req.params.id]);
    const faktura = rows[0];
    if (!faktura) return res.status(404).json({ error: 'Faktura nenalezena' });

    const to = String(req.body?.email || faktura.klient_email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ error: 'Chybí platný e-mail příjemce faktury.' });
    }

    const polozky = await query(
      'SELECT * FROM faktury_polozky WHERE faktura_id = $1 ORDER BY poradi, id',
      [req.params.id]
    );
    const firma = await loadFirmaSettings();
    const branding = resolveDocumentBranding(firma);
    const html = buildCompactFakturaHtml({ faktura, polozky: polozky.rows, firma, branding });
    const pdfBuffer = await renderPdfFromHtml(html);

    await sendFakturaEmail({ to, faktura, firma, pdfBuffer });
    await query(
      "UPDATE faktury SET stav = CASE WHEN stav = 'vystavena' THEN 'odeslana' ELSE stav END WHERE id = $1",
      [req.params.id]
    );

    res.json({ message: `Faktura ${faktura.cislo} byla odeslána na ${to}.` });
  } catch (err) {
    if (err.message?.includes('SMTP')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

// POST /api/faktury
router.post('/', auth, requireCapability('faktury.manage'), async (req, res, next) => {
  try {
    const { klient_id, zakazka_id, datum_splatnosti, zpusob_platby, variabilni_symbol, poznamka, polozky } = req.body;
    if (!datum_splatnosti) return res.status(400).json({ error: 'Datum splatnosti je povinné' });

    let result;
    await withTransaction(async (client) => {
      const cislo = await genCislo(client);
      const dnes  = new Date().toISOString().slice(0, 10);

      const totalBezDph = (polozky || []).reduce((s, p) =>
        s + (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0), 0);
      const dph = (polozky || []).reduce((s, p) => {
        const c = (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0);
        return s + c * ((parseFloat(p.dph_sazba) || 12) / 100);
      }, 0);
      const celkem = totalBezDph + dph;

      // Snapshot nastavení firmy
      const { rows: nRows } = await client.query('SELECT klic, hodnota FROM nastaveni');
      const firma = {};
      nRows.forEach(r => { firma[r.klic] = r.hodnota; });

      const vs = variabilni_symbol || cislo.replace(/\D/g, '');

      const { rows } = await client.query(
        `INSERT INTO faktury
           (cislo, zakazka_id, klient_id, stav, datum_vystaveni, datum_splatnosti,
            zpusob_platby, variabilni_symbol, poznamka, cena_bez_dph, dph, cena_celkem,
            dodavatel_json, vystavil_id)
         VALUES ($1,$2,$3,'vystavena',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [cislo, zakazka_id || null, klient_id || null, dnes, datum_splatnosti,
         zpusob_platby || 'převod', vs, poznamka || null,
         totalBezDph, dph, celkem, JSON.stringify(firma), req.user.id]
      );

      for (const [i, pol] of (polozky || []).entries()) {
        await client.query(
          `INSERT INTO faktury_polozky (faktura_id, nazev, jednotka, mnozstvi, cena_jednotka, dph_sazba, poradi)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [rows[0].id, pol.nazev, pol.jednotka || 'os.',
           pol.mnozstvi, pol.cena_jednotka, pol.dph_sazba || 12, i]
        );
      }
      result = rows[0];
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// PATCH /api/faktury/:id
router.patch('/:id', auth, requireCapability('faktury.manage'), async (req, res, next) => {
  try {
    const { datum_splatnosti, zpusob_platby, variabilni_symbol, poznamka, polozky, klient_id } = req.body;

    const totalBezDph = (polozky || []).reduce((s, p) =>
      s + (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0), 0);
    const dph = (polozky || []).reduce((s, p) => {
      const c = (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0);
      return s + c * ((parseFloat(p.dph_sazba) || 12) / 100);
    }, 0);
    const celkem = totalBezDph + dph;

    const klientSet = klient_id !== undefined ? ', klient_id=$9' : '';
    const klientParam = klient_id !== undefined ? [klient_id || null] : [];

    const { rows } = await query(
      `UPDATE faktury SET datum_splatnosti=$1, zpusob_platby=$2, variabilni_symbol=$3,
         poznamka=$4, cena_bez_dph=$5, dph=$6, cena_celkem=$7${klientSet}
       WHERE id=$8 RETURNING *`,
      [datum_splatnosti, zpusob_platby, variabilni_symbol, poznamka || null,
       totalBezDph, dph, celkem, req.params.id, ...klientParam]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Faktura nenalezena' });

    if (polozky) {
      await withTransaction(async (client) => {
        await client.query('DELETE FROM faktury_polozky WHERE faktura_id=$1', [req.params.id]);
        for (const [i, pol] of polozky.entries()) {
          await client.query(
            `INSERT INTO faktury_polozky (faktura_id, nazev, jednotka, mnozstvi, cena_jednotka, dph_sazba, poradi)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [req.params.id, pol.nazev, pol.jednotka || 'os.',
             pol.mnozstvi, pol.cena_jednotka, pol.dph_sazba || 12, i]
          );
        }
      });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/faktury/:id/stav
router.patch('/:id/stav', auth, requireCapability('faktury.manage'), async (req, res, next) => {
  try {
    const { stav, datum_zaplaceni } = req.body;
    const valid = ['vystavena', 'odeslana', 'zaplacena', 'storno'];
    if (!valid.includes(stav)) return res.status(400).json({ error: 'Neplatný stav faktury' });

    const extraSet    = stav === 'zaplacena' ? ', datum_zaplaceni = $3' : '';
    const extraParams = stav === 'zaplacena'
      ? [stav, req.params.id, datum_zaplaceni || new Date().toISOString().slice(0, 10)]
      : [stav, req.params.id];

    const { rows } = await query(
      `UPDATE faktury SET stav=$1${extraSet} WHERE id=$2 RETURNING *`,
      extraParams
    );
    if (!rows[0]) return res.status(404).json({ error: 'Faktura nenalezena' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/faktury/:id
router.delete('/:id', auth, requireCapability('faktury.manage'), async (req, res, next) => {
  try {
    // Atomicky: smaž pouze pokud stav = 'vystavena' – odstraní race condition
    const { rows } = await query(
      "DELETE FROM faktury WHERE id=$1 AND stav='vystavena' RETURNING id",
      [req.params.id]
    );
    if (rows[0]) return res.status(204).end();

    // Nenašlo se – zjisti proč
    const { rows: check } = await query('SELECT stav FROM faktury WHERE id=$1', [req.params.id]);
    if (!check[0]) return res.status(404).json({ error: 'Faktura nenalezena' });
    return res.status(400).json({ error: 'Smazat lze pouze fakturu ve stavu Vystavena' });
  } catch (err) { next(err); }
});

module.exports = router;
