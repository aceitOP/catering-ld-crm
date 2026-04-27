'use strict';
const express = require('express');
const { query, withTransaction } = require('../db');
const { auth } = require('../middleware/auth');
const { requireAppModule } = require('../moduleAccess');
const { sendNabidka } = require('../emailService');
const { createNotif } = require('../notifHelper');
const { loadFirmaSettings } = require('../firmaSettings');
const { resolveDocumentBranding } = require('../documentBranding');
const { sendPdfResponse } = require('../pdfService');

const router = express.Router();

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

router.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, stav } = req.query;
    const where = []; const params = []; let p = 1;
    if (zakazka_id) { where.push(`n.zakazka_id = $${p++}`); params.push(zakazka_id); }
    if (stav)       { where.push(`n.stav = $${p++}`);       params.push(stav); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await query(
      `SELECT n.*, z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev,
              k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
       FROM nabidky n
       JOIN zakazky z ON z.id = n.zakazka_id
       LEFT JOIN klienti k ON k.id = z.klient_id
       ${wc} ORDER BY n.created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM nabidky WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    const polozky = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY poradi, id', [req.params.id]);
    res.json({ ...rows[0], polozky: polozky.rows });
  } catch (err) { next(err); }
});

// GET /api/nabidky/:id/pdf
router.get('/:id/pdf', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT n.*, z.cislo AS zakazka_cislo, z.nazev AS zakazka_nazev, z.datum_akce, z.misto, z.pocet_hostu,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
      FROM nabidky n
      JOIN zakazky z ON z.id = n.zakazka_id
      LEFT JOIN klienti k ON k.id = z.klient_id
      WHERE n.id = $1
    `, [req.params.id]);
    const nabidka = rows[0];
    if (!nabidka) return res.status(404).json({ error: 'Nabídka nenalezena' });
    const polozky = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY poradi, id', [req.params.id]);
    const firma = await loadFirmaSettings();
    const branding = resolveDocumentBranding(firma);
    const klient = nabidka.klient_firma || [nabidka.klient_jmeno, nabidka.klient_prijmeni].filter(Boolean).join(' ') || '—';
    const itemRows = polozky.rows.map((item) => `
      <tr>
        <td>${esc(item.nazev)}</td>
        <td>${esc(item.kategorie || '')}</td>
        <td class="right">${esc(item.mnozstvi)}</td>
        <td>${esc(item.jednotka || 'ks')}</td>
        <td class="right">${money(item.cena_jednotka)}</td>
        <td class="right">${money(item.cena_celkem)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('${esc(branding.fontImportUrl)}');
    body { margin:0; font-family:${branding.fontFamily}; color:#1f2937; background:${branding.soft}; }
    .page { max-width:960px; margin:24px auto; background:#fff; padding:34px; box-shadow:0 12px 34px rgba(15,23,42,.08); }
    .header { display:flex; justify-content:space-between; gap:24px; border-bottom:3px solid ${branding.primary}; padding-bottom:22px; margin-bottom:24px; }
    h1 { margin:0; font-size:34px; }
    .muted { color:#64748b; font-size:13px; line-height:1.7; }
    .intro { white-space:pre-wrap; line-height:1.7; margin:18px 0; }
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
        <h1>${esc(nabidka.nazev || 'Nabídka')}</h1>
        <div class="muted">Nabídka v${esc(nabidka.verze)} · Zakázka ${esc(nabidka.zakazka_cislo || '')}</div>
      </div>
      <div class="muted" style="text-align:right"><strong>${esc(firma.firma_nazev || branding.appTitle)}</strong><br>${esc(firma.firma_email || '')}<br>${esc(firma.firma_telefon || '')}</div>
    </section>
    <section class="grid">
      <div class="card"><div class="label">Klient</div><strong>${esc(klient)}</strong></div>
      <div class="card"><div class="label">Akce</div><strong>${esc(nabidka.zakazka_nazev || '—')}</strong><div class="muted">${nabidka.datum_akce ? new Date(nabidka.datum_akce).toLocaleDateString('cs-CZ') : '—'} · ${esc(nabidka.misto || '—')} · ${esc(nabidka.pocet_hostu || '—')} hostů</div></div>
    </section>
    ${nabidka.uvodni_text ? `<div class="intro">${esc(nabidka.uvodni_text)}</div>` : ''}
    <table>
      <thead><tr><th>Položka</th><th>Kategorie</th><th class="right">Množství</th><th>Jednotka</th><th class="right">Cena/jedn.</th><th class="right">Celkem</th></tr></thead>
      <tbody>${itemRows || '<tr><td colspan="6">Nabídka nemá položky.</td></tr>'}</tbody>
    </table>
    <section class="total">
      <div class="total-row"><span>Cena bez DPH</span><strong>${money(nabidka.cena_bez_dph)}</strong></div>
      <div class="total-row"><span>DPH</span><strong>${money(nabidka.dph)}</strong></div>
      <div class="grand"><span>Celkem</span><span style="float:right">${money(nabidka.cena_celkem)}</span></div>
    </section>
    ${nabidka.zaverecny_text ? `<div class="intro">${esc(nabidka.zaverecny_text)}</div>` : ''}
  </main>
</body>
</html>`;

    return sendPdfResponse(res, html, `nabidka-${nabidka.id}.pdf`);
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, nazev, uvodni_text, zaverecny_text, platnost_do, sleva_procent, polozky } = req.body;
    const totalBezDph = (polozky || []).reduce(
      (s, p) => s + (parseFloat(p.mnozstvi) || 0) * (parseFloat(p.cena_jednotka) || 0), 0);
    const sleva  = totalBezDph * ((parseFloat(sleva_procent) || 0) / 100);
    const dph    = (totalBezDph - sleva) * 0.12;
    const celkem = totalBezDph - sleva + dph;

    let newRow;
    await withTransaction(async (client) => {
      const maxVer = await client.query(
        'SELECT COALESCE(MAX(verze),0) AS v FROM nabidky WHERE zakazka_id = $1', [zakazka_id]);
      const verze = maxVer.rows[0].v + 1;
      await client.query('UPDATE nabidky SET aktivni = false WHERE zakazka_id = $1', [zakazka_id]);
      const { rows } = await client.query(
        `INSERT INTO nabidky (zakazka_id, verze, nazev, uvodni_text, zaverecny_text, platnost_do,
          sleva_procent, cena_bez_dph, dph, cena_celkem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [zakazka_id, verze, nazev, uvodni_text, zaverecny_text, platnost_do,
         sleva_procent || 0, totalBezDph, dph, celkem]);
      newRow = rows[0];
      for (const [i, pol] of (polozky || []).entries()) {
        await client.query(
          `INSERT INTO nabidky_polozky (nabidka_id, kategorie, nazev, jednotka, mnozstvi, cena_jednotka, poradi)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [newRow.id, pol.kategorie || 'jidlo', pol.nazev || '', pol.jednotka || 'os.',
           parseFloat(pol.mnozstvi) || 1, parseFloat(pol.cena_jednotka) || 0, i]);
      }
    });

    createNotif({
      typ: 'nova_nabidka',
      titulek: `Nová nabídka — ${nazev || 'bez názvu'} (v${newRow.verze})`,
      zprava: `Celkem: ${celkem.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' })}`,
      odkaz: `/nabidky/${newRow.id}`,
    });
    res.status(201).json(newRow);
  } catch (err) { next(err); }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const { nazev, uvodni_text, zaverecny_text, platnost_do, sleva_procent, polozky } = req.body;
    const totalBezDph = (polozky||[]).reduce((s,p) => s + (parseFloat(p.mnozstvi)||0)*(parseFloat(p.cena_jednotka)||0), 0);
    const sleva = totalBezDph * ((parseFloat(sleva_procent)||0)/100);
    const dph = (totalBezDph - sleva) * 0.12;
    const celkem = totalBezDph - sleva + dph;
    const { rows } = await query(
      `UPDATE nabidky SET nazev=$1,uvodni_text=$2,zaverecny_text=$3,platnost_do=$4,sleva_procent=$5,cena_bez_dph=$6,dph=$7,cena_celkem=$8 WHERE id=$9 RETURNING *`,
      [nazev, uvodni_text||null, zaverecny_text||null, platnost_do||null, sleva_procent||0, totalBezDph, dph, celkem, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    if (polozky) {
      await withTransaction(async (client) => {
        await client.query('DELETE FROM nabidky_polozky WHERE nabidka_id = $1', [req.params.id]);
        for (const [i,pol] of polozky.entries()) {
          await client.query(
            `INSERT INTO nabidky_polozky (nabidka_id,kategorie,nazev,jednotka,mnozstvi,cena_jednotka,poradi) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [req.params.id, pol.kategorie||'jidlo', pol.nazev||'', pol.jednotka||'os.', parseFloat(pol.mnozstvi)||1, parseFloat(pol.cena_jednotka)||0, i]);
        }
      });
    }
    const newPol = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id=$1 ORDER BY poradi,id', [req.params.id]);
    res.json({ ...rows[0], polozky: newPol.rows });
  } catch (err) { next(err); }
});

router.post('/:id/odeslat', auth, requireAppModule('email'), async (req, res, next) => {
  try {
    const { to, poznamka } = req.body;
    if (!to) return res.status(400).json({ error: 'Chybí emailová adresa příjemce' });
    const { rows } = await query('SELECT * FROM nabidky WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Nabídka nenalezena' });
    const polozky = await query('SELECT * FROM nabidky_polozky WHERE nabidka_id = $1 ORDER BY poradi, id', [req.params.id]);
    const nabidka = { ...rows[0], polozky: polozky.rows };
    const { rows: zRows } = await query('SELECT * FROM zakazky WHERE id = $1', [nabidka.zakazka_id]);
    const zakazka = zRows[0] || {};
    const { rows: nastaveni } = await query('SELECT klic, hodnota FROM nastaveni');
    const firma = {};
    nastaveni.forEach(r => { firma[r.klic] = r.hodnota; });
    await sendNabidka({ to, nabidka, zakazka, firma, poznamka, attachPdf: true });
    await query(`UPDATE nabidky SET stav = 'odeslano', odeslano_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ message: `Nabídka odeslána na ${to}` });
  } catch (err) {
    if (err.message.includes('SMTP')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id/stav', auth, async (req, res, next) => {
  try {
    const { stav } = req.body;
    const validStavy = ['koncept', 'odeslano', 'prijato', 'zamitnuto', 'expirováno'];
    if (!validStavy.includes(stav)) return res.status(400).json({ error: 'Neplatný stav nabídky' });
    const extra = stav === 'odeslano' ? ', odeslano_at = NOW()' : '';
    const { rows } = await query(
      `UPDATE nabidky SET stav = $1${extra} WHERE id = $2 RETURNING *`, [stav, req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
