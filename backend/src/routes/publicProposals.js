// ── Public routes: klientský výběr menu (no auth, token-based) ─
const express = require('express');
const router  = express.Router();
const { query } = require('../db');

const EU_ALERGENY = {
  1:'Lepek',2:'Korýši',3:'Vejce',4:'Ryby',5:'Arašídy',
  6:'Sója',7:'Mléko',8:'Ořechy',9:'Celer',10:'Hořčice',
  11:'Sezam',12:'Oxid siřičitý',13:'Lupin',14:'Měkkýši',
};

function isLocked(p) {
  if (p.status === 'signed') return true;
  if (p.expires_at && new Date(p.expires_at) < new Date()) return true;
  // Deadline lock: 14 days before event
  if (p.datum_akce) {
    const lockDate = new Date(p.datum_akce);
    lockDate.setDate(lockDate.getDate() - 14);
    if (new Date() >= lockDate) return true;
  }
  return false;
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}

// ── GET /api/pub/proposals/:token ─────────────────────────────
router.get('/:token', async (req, res, next) => {
  try {
    const { rows: [p] } = await query(`
      SELECT pr.*,
             z.nazev  AS zakazka_nazev,
             z.datum_akce,
             z.misto,
             z.cas_zacatek,
             k.jmeno  AS klient_jmeno,
             k.prijmeni AS klient_prijmeni,
             k.firma  AS klient_firma,
             ns.hodnota AS firma_nazev_settings
      FROM proposals pr
      LEFT JOIN zakazky z  ON z.id = pr.zakazka_id
      LEFT JOIN klienti k  ON k.id = z.klient_id
      LEFT JOIN nastaveni ns ON ns.klic = 'firma_nazev'
      WHERE pr.token = $1
    `, [req.params.token]);

    if (!p) return res.status(404).json({ error: 'Odkaz nenalezen nebo vypršel' });

    const { rows: sekce } = await query(
      'SELECT * FROM proposal_sekce WHERE proposal_id = $1 ORDER BY poradi, id', [p.id]
    );
    for (const s of sekce) {
      const { rows: pol } = await query(
        'SELECT * FROM proposal_polozky WHERE sekce_id = $1 ORDER BY poradi, id', [s.id]
      );
      // Enrich allergen numbers with names
      s.polozky = pol.map(item => ({
        ...item,
        alergeny_nazvy: (item.alergeny || []).map(n => EU_ALERGENY[n]).filter(Boolean),
      }));
    }

    res.json({
      ...p,
      sekce,
      locked: isLocked(p),
      eu_alergeny: EU_ALERGENY,
    });
  } catch (err) { next(err); }
});

// ── PATCH /api/pub/proposals/:token/select ────────────────────
router.patch('/:token/select', async (req, res, next) => {
  try {
    const { polozka_id, je_vybrana } = req.body;
    const ip = getIp(req);

    const { rows: [p] } = await query(`
      SELECT pr.*, z.datum_akce
      FROM proposals pr
      LEFT JOIN zakazky z ON z.id = pr.zakazka_id
      WHERE pr.token = $1
    `, [req.params.token]);
    if (!p) return res.status(404).json({ error: 'Odkaz nenalezen' });
    if (isLocked(p)) return res.status(403).json({ error: 'Výběr je uzamčen' });

    // Load item with its section config
    const { rows: [pol] } = await query(`
      SELECT pp.*, ps.typ, ps.max_vyberu, ps.min_vyberu, ps.sekce_id,
             ps.id AS sid, ps.proposal_id
      FROM proposal_polozky pp
      JOIN proposal_sekce ps ON ps.id = pp.sekce_id
      WHERE pp.id = $1 AND ps.proposal_id = $2
    `, [polozka_id, p.id]);
    if (!pol) return res.status(404).json({ error: 'Položka nenalezena' });

    // Single-select: deselect all others in section first
    if (je_vybrana && pol.typ === 'single') {
      await query(
        'UPDATE proposal_polozky SET je_vybrana = false WHERE sekce_id = $1', [pol.sekce_id]
      );
    }

    // Multi-select: check max limit
    if (je_vybrana && pol.typ === 'multi') {
      const { rows: [cnt] } = await query(
        'SELECT COUNT(*) AS c FROM proposal_polozky WHERE sekce_id = $1 AND je_vybrana = true AND id != $2',
        [pol.sekce_id, polozka_id]
      );
      if (parseInt(cnt.c) >= pol.max_vyberu) {
        return res.status(400).json({
          error: `Lze vybrat maximálně ${pol.max_vyberu} položky v sekci`,
        });
      }
    }

    const old = pol.je_vybrana;
    await query('UPDATE proposal_polozky SET je_vybrana = $1 WHERE id = $2', [je_vybrana, polozka_id]);

    // Log
    await query(
      `INSERT INTO proposal_selection_log (proposal_id, polozka_id, akce, old_value, new_value, ip_adresa)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [p.id, polozka_id, je_vybrana ? 'select' : 'deselect', String(old), String(je_vybrana), ip]
    );

    // Recalc price
    const { rows: [prRow] } = await query(`
      SELECT COALESCE(SUM(pp.cena_os), 0) AS per_os
      FROM proposal_polozky pp
      JOIN proposal_sekce ps ON ps.id = pp.sekce_id
      WHERE ps.proposal_id = $1 AND pp.je_vybrana = true
    `, [p.id]);
    const perPerson = parseFloat(prRow?.per_os || 0);
    const total     = perPerson * p.guest_count;
    await query('UPDATE proposals SET total_price = $1, updated_at = NOW() WHERE id = $2', [total, p.id]);

    res.json({ per_person: perPerson, total, guest_count: p.guest_count });
  } catch (err) { next(err); }
});

// ── PATCH /api/pub/proposals/:token/note ─────────────────────
router.patch('/:token/note', async (req, res, next) => {
  try {
    const { polozka_id, poznamka } = req.body;
    const ip = getIp(req);

    const { rows: [p] } = await query(`
      SELECT pr.*, z.datum_akce FROM proposals pr
      LEFT JOIN zakazky z ON z.id = pr.zakazka_id
      WHERE pr.token = $1
    `, [req.params.token]);
    if (!p) return res.status(404).json({ error: 'Odkaz nenalezen' });
    if (isLocked(p)) return res.status(403).json({ error: 'Výběr je uzamčen' });

    // Verify polozka_id belongs to this proposal (ownership check)
    const { rows: [pol] } = await query(`
      SELECT pp.poznamka_klienta AS old_value
      FROM proposal_polozky pp
      JOIN proposal_sekce ps ON ps.id = pp.sekce_id
      WHERE pp.id = $1 AND ps.proposal_id = $2
    `, [polozka_id, p.id]);
    if (!pol) return res.status(404).json({ error: 'Položka nenalezena' });
    const old = pol;
    await query(
      'UPDATE proposal_polozky SET poznamka_klienta = $1 WHERE id = $2', [poznamka || null, polozka_id]
    );
    await query(
      `INSERT INTO proposal_selection_log (proposal_id, polozka_id, akce, old_value, new_value, ip_adresa)
       VALUES ($1,$2,'note_updated',$3,$4,$5)`,
      [p.id, polozka_id, old?.old_value || '', poznamka || '', ip]
    );
    res.json({ message: 'Poznámka uložena' });
  } catch (err) { next(err); }
});

// ── POST /api/pub/proposals/:token/confirm ───────────────────
router.post('/:token/confirm', async (req, res, next) => {
  try {
    const { signed_by, souhlas } = req.body;
    const ip = getIp(req);

    if (!signed_by?.trim()) return res.status(400).json({ error: 'Zadejte jméno' });
    if (!souhlas)            return res.status(400).json({ error: 'Musíte souhlasit s podmínkami' });

    const { rows: [p] } = await query(`
      SELECT pr.*, z.datum_akce, z.nazev AS zakazka_nazev,
             k.email AS klient_email
      FROM proposals pr
      LEFT JOIN zakazky z  ON z.id = pr.zakazka_id
      LEFT JOIN klienti k  ON k.id = z.klient_id
      WHERE pr.token = $1
    `, [req.params.token]);
    if (!p)          return res.status(404).json({ error: 'Odkaz nenalezen' });
    if (p.status === 'signed') return res.status(400).json({ error: 'Výběr již byl potvrzen' });
    if (isLocked(p)) return res.status(403).json({ error: 'Výběr je uzamčen' });

    // Validate mandatory sections
    const { rows: sekce } = await query(`
      SELECT ps.nazev, ps.povinne, ps.min_vyberu,
             COUNT(pp.id) FILTER (WHERE pp.je_vybrana = true) AS selected
      FROM proposal_sekce ps
      LEFT JOIN proposal_polozky pp ON pp.sekce_id = ps.id
      WHERE ps.proposal_id = $1
      GROUP BY ps.id, ps.nazev, ps.povinne, ps.min_vyberu
    `, [p.id]);

    for (const s of sekce) {
      if (s.povinne && parseInt(s.selected || 0) < s.min_vyberu) {
        return res.status(400).json({
          error: `Sekce „${s.nazev}" vyžaduje výběr alespoň ${s.min_vyberu} položky`,
        });
      }
    }

    // Sign
    const now = new Date().toISOString();
    await query(`
      UPDATE proposals
      SET status = 'signed', signed_by = $1, signed_at = NOW(), signed_ip = $2, updated_at = NOW()
      WHERE id = $3
    `, [signed_by.trim(), ip, p.id]);

    await query(
      `INSERT INTO proposal_selection_log (proposal_id, akce, new_value, ip_adresa)
       VALUES ($1,'confirmed',$2,$3)`,
      [p.id, signed_by.trim(), ip]
    );

    // Fetch confirmed selections for email
    const { rows: selections } = await query(`
      SELECT pp.*, ps.nazev AS sekce_nazev
      FROM proposal_polozky pp
      JOIN proposal_sekce ps ON ps.id = pp.sekce_id
      WHERE ps.proposal_id = $1 AND pp.je_vybrana = true
      ORDER BY ps.poradi, pp.poradi
    `, [p.id]);

    // Send confirmation emails (graceful failure)
    try {
      const { sendProposalConfirmed } = require('../proposalEmail');
      const recipients = [process.env.SMTP_FROM || process.env.SMTP_USER];
      if (p.klient_email) recipients.push(p.klient_email);
      for (const to of recipients.filter(Boolean)) {
        await sendProposalConfirmed(to, { ...p, signed_by: signed_by.trim() }, selections);
      }
    } catch (e) {
      console.warn('Proposal confirm email failed:', e.message);
    }

    res.json({
      message: 'Výběr byl závazně potvrzen',
      signed_by: signed_by.trim(),
      signed_at: now,
    });
  } catch (err) { next(err); }
});

module.exports = router;
