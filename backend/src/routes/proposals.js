// ── Admin routes: Proposals (klientský výběr menu) ───────────
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { auth } = require('../middleware/auth');
const { query } = require('../db');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Helpers ───────────────────────────────────────────────────
async function recalcPrice(proposalId) {
  const { rows } = await query(`
    SELECT COALESCE(SUM(pp.cena_os), 0) AS total_per_os, p.guest_count
    FROM proposals p
    LEFT JOIN proposal_sekce ps ON ps.proposal_id = p.id
    LEFT JOIN proposal_polozky pp ON pp.sekce_id = ps.id AND pp.je_vybrana = true
    WHERE p.id = $1
    GROUP BY p.guest_count
  `, [proposalId]);
  const guestCount  = parseInt(rows[0]?.guest_count || 1);
  const perPerson   = parseFloat(rows[0]?.total_per_os || 0);
  const total       = perPerson * guestCount;
  await query('UPDATE proposals SET total_price = $1, updated_at = NOW() WHERE id = $2', [total, proposalId]);
  return { per_person: perPerson, total, guest_count: guestCount };
}

async function loadFull(id) {
  const { rows: [p] } = await query(`
    SELECT p.*, z.nazev AS zakazka_nazev, z.datum_akce, z.misto, z.pocet_hostu AS z_pocet_hostu,
           k.email AS klient_email,
           u.jmeno AS created_by_jmeno, u.prijmeni AS created_by_prijmeni
    FROM proposals p
    LEFT JOIN zakazky z ON z.id = p.zakazka_id
    LEFT JOIN klienti k ON k.id = z.klient_id
    LEFT JOIN uzivatele u ON u.id = p.created_by
    WHERE p.id = $1
  `, [id]);
  if (!p) return null;
  const { rows: sekce } = await query(
    'SELECT * FROM proposal_sekce WHERE proposal_id = $1 ORDER BY poradi, id', [id]
  );
  for (const s of sekce) {
    const { rows: pol } = await query(
      'SELECT * FROM proposal_polozky WHERE sekce_id = $1 ORDER BY poradi, id', [s.id]
    );
    s.polozky = pol;
  }
  p.sekce = sekce;
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  p.url = `${base}/nabidka/${p.token}`;
  return p;
}

// ── Proposals ─────────────────────────────────────────────────

// GET /api/proposals
router.get('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id } = req.query;
    const params = [];
    let where = '';
    if (zakazka_id) { where = ' WHERE p.zakazka_id = $1'; params.push(zakazka_id); }
    const { rows } = await query(`
      SELECT p.*, z.nazev AS zakazka_nazev
      FROM proposals p
      LEFT JOIN zakazky z ON z.id = p.zakazka_id
      ${where}
      ORDER BY p.created_at DESC
    `, params);
    const base = process.env.FRONTEND_URL || 'http://localhost:5173';
    rows.forEach(r => { r.url = `${base}/nabidka/${r.token}`; });
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/proposals/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const p = await loadFull(req.params.id);
    if (!p) return res.status(404).json({ error: 'Návrh nenalezen' });
    res.json(p);
  } catch (err) { next(err); }
});

// POST /api/proposals
router.post('/', auth, async (req, res, next) => {
  try {
    const { zakazka_id, nazev, uvodni_text, guest_count, expires_at } = req.body;
    let guests = guest_count;
    if (!guests && zakazka_id) {
      const { rows: [z] } = await query('SELECT pocet_hostu FROM zakazky WHERE id = $1', [zakazka_id]);
      guests = z?.pocet_hostu || 1;
    }
    const token = generateToken();
    const { rows: [p] } = await query(`
      INSERT INTO proposals (zakazka_id, token, status, nazev, uvodni_text, guest_count, expires_at, created_by)
      VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7) RETURNING *
    `, [zakazka_id || null, token, nazev, uvodni_text, guests, expires_at || null, req.user.id]);
    const base = process.env.FRONTEND_URL || 'http://localhost:5173';
    p.url = `${base}/nabidka/${p.token}`;
    p.sekce = [];
    res.status(201).json(p);
  } catch (err) { next(err); }
});

// PATCH /api/proposals/:id
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const { nazev, uvodni_text, guest_count, expires_at, status } = req.body;
    const { rows: [p] } = await query(`
      UPDATE proposals SET
        nazev        = COALESCE($1, nazev),
        uvodni_text  = COALESCE($2, uvodni_text),
        guest_count  = COALESCE($3, guest_count),
        expires_at   = COALESCE($4, expires_at),
        status       = COALESCE($5, status),
        updated_at   = NOW()
      WHERE id = $6 RETURNING *
    `, [nazev, uvodni_text, guest_count, expires_at, status, req.params.id]);
    if (!p) return res.status(404).json({ error: 'Návrh nenalezen' });
    if (guest_count) await recalcPrice(req.params.id);
    const base = process.env.FRONTEND_URL || 'http://localhost:5173';
    p.url = `${base}/nabidka/${p.token}`;
    res.json(p);
  } catch (err) { next(err); }
});

// POST /api/proposals/:id/send  (change status → sent, optionally email link)
router.post('/:id/send', auth, async (req, res, next) => {
  try {
    const { email } = req.body;
    const { rows: [p] } = await query("UPDATE proposals SET status = 'sent', updated_at = NOW() WHERE id = $1 RETURNING *", [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Návrh nenalezen' });
    const base = process.env.FRONTEND_URL || 'http://localhost:5173';
    const url  = `${base}/nabidka/${p.token}`;
    if (email) {
      try {
        const { sendProposalLink } = require('../proposalEmail');
        await sendProposalLink(email, { ...p, url });
      } catch (e) { console.warn('Proposal email failed:', e.message); }
    }
    res.json({ message: 'Odkaz odeslán', url });
  } catch (err) { next(err); }
});

// DELETE /api/proposals/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM proposals WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Proposal nenalezen' });
    res.json({ message: 'Odstraněno' });
  } catch (err) { next(err); }
});

// ── Sekce ─────────────────────────────────────────────────────

// POST /api/proposals/:id/sekce
router.post('/:id/sekce', auth, async (req, res, next) => {
  try {
    const { nazev, popis, typ, min_vyberu, max_vyberu, povinne, poradi } = req.body;
    const { rows: [s] } = await query(`
      INSERT INTO proposal_sekce (proposal_id, nazev, popis, typ, min_vyberu, max_vyberu, povinne, poradi)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [req.params.id, nazev, popis || null, typ || 'single',
        min_vyberu || 1, max_vyberu || 1, povinne !== false, poradi || 0]);
    s.polozky = [];
    res.status(201).json(s);
  } catch (err) { next(err); }
});

// PATCH /api/proposals/:id/sekce/:sekceId
router.patch('/:id/sekce/:sekceId', auth, async (req, res, next) => {
  try {
    const { nazev, popis, typ, min_vyberu, max_vyberu, povinne, poradi } = req.body;
    const { rows: [s] } = await query(`
      UPDATE proposal_sekce SET
        nazev       = COALESCE($1, nazev),
        popis       = COALESCE($2, popis),
        typ         = COALESCE($3, typ),
        min_vyberu  = COALESCE($4, min_vyberu),
        max_vyberu  = COALESCE($5, max_vyberu),
        povinne     = COALESCE($6, povinne),
        poradi      = COALESCE($7, poradi)
      WHERE id = $8 AND proposal_id = $9 RETURNING *
    `, [nazev, popis, typ, min_vyberu, max_vyberu, povinne, poradi, req.params.sekceId, req.params.id]);
    if (!s) return res.status(404).json({ error: 'Sekce nenalezena' });
    res.json(s);
  } catch (err) { next(err); }
});

// DELETE /api/proposals/:id/sekce/:sekceId
router.delete('/:id/sekce/:sekceId', auth, async (req, res, next) => {
  try {
    await query('DELETE FROM proposal_sekce WHERE id = $1 AND proposal_id = $2', [req.params.sekceId, req.params.id]);
    res.json({ message: 'Sekce odstraněna' });
  } catch (err) { next(err); }
});

// ── Položky (přes sekci) ──────────────────────────────────────

// POST /api/proposals/sekce/:sekceId/polozky
router.post('/sekce/:sekceId/polozky', auth, async (req, res, next) => {
  try {
    const { nazev, popis, obrazek_url, alergeny, cena_os, poradi } = req.body;
    const { rows: [pol] } = await query(`
      INSERT INTO proposal_polozky (sekce_id, nazev, popis, obrazek_url, alergeny, cena_os, poradi)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [req.params.sekceId, nazev, popis || null, obrazek_url || null,
        alergeny || [], parseFloat(cena_os) || 0, poradi || 0]);
    // Recalc price for the proposal this sekce belongs to
    const { rows: [sekce] } = await query('SELECT proposal_id FROM proposal_sekce WHERE id = $1', [req.params.sekceId]);
    if (sekce) await recalcPrice(sekce.proposal_id);
    res.status(201).json(pol);
  } catch (err) { next(err); }
});

// PATCH /api/proposals/polozky/:polozkaId
router.patch('/polozky/:polozkaId', auth, async (req, res, next) => {
  try {
    const { nazev, popis, obrazek_url, alergeny, cena_os, je_vybrana, poradi } = req.body;
    const { rows: [pol] } = await query(`
      UPDATE proposal_polozky SET
        nazev        = COALESCE($1, nazev),
        popis        = COALESCE($2, popis),
        obrazek_url  = COALESCE($3, obrazek_url),
        alergeny     = COALESCE($4, alergeny),
        cena_os      = COALESCE($5, cena_os),
        je_vybrana   = COALESCE($6, je_vybrana),
        poradi       = COALESCE($7, poradi)
      WHERE id = $8 RETURNING *, sekce_id
    `, [nazev, popis, obrazek_url, alergeny, cena_os, je_vybrana, poradi, req.params.polozkaId]);
    if (!pol) return res.status(404).json({ error: 'Položka nenalezena' });
    const { rows: [sekce] } = await query('SELECT proposal_id FROM proposal_sekce WHERE id = $1', [pol.sekce_id]);
    if (sekce) await recalcPrice(sekce.proposal_id);
    res.json(pol);
  } catch (err) { next(err); }
});

// DELETE /api/proposals/polozky/:polozkaId
router.delete('/polozky/:polozkaId', auth, async (req, res, next) => {
  try {
    const { rows: [pol] } = await query('SELECT sekce_id FROM proposal_polozky WHERE id = $1', [req.params.polozkaId]);
    await query('DELETE FROM proposal_polozky WHERE id = $1', [req.params.polozkaId]);
    if (pol) {
      const { rows: [sekce] } = await query('SELECT proposal_id FROM proposal_sekce WHERE id = $1', [pol.sekce_id]);
      if (sekce) await recalcPrice(sekce.proposal_id);
    }
    res.json({ message: 'Položka odstraněna' });
  } catch (err) { next(err); }
});

// GET /api/proposals/:id/log  (selection history)
router.get('/:id/log', auth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT l.*, pp.nazev AS polozka_nazev
      FROM proposal_selection_log l
      LEFT JOIN proposal_polozky pp ON pp.id = l.polozka_id
      WHERE l.proposal_id = $1
      ORDER BY l.created_at DESC LIMIT 100
    `, [req.params.id]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ── PATCH /:id/unlock – odemknutí potvrzeného výběru adminem ─────────────────
router.patch('/:id/unlock', auth, async (req, res, next) => {
  try {
    const { rows: [p] } = await query('SELECT id, status FROM proposals WHERE id = $1', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Výběr nenalezen' });
    if (p.status !== 'signed') return res.status(400).json({ error: 'Výběr není v podepsaném stavu' });

    await query(`
      UPDATE proposals
      SET status = 'draft', signed_by = NULL, signed_at = NULL, signed_ip = NULL, updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    await query(
      `INSERT INTO proposal_selection_log (proposal_id, akce, new_value, ip_adresa)
       VALUES ($1, 'unlocked', $2, $3)`,
      [req.params.id, req.user?.jmeno || 'admin', req.ip || '']
    );

    res.json({ message: 'Výběr byl odemknut' });
  } catch (err) { next(err); }
});

module.exports = router;
