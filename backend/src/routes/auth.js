const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto = require('crypto');
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const { auth }  = require('../middleware/auth');
const { sendPasswordReset } = require('../emailService');
const { getModuleState } = require('../moduleAccess');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho pokusů o přihlášení, zkuste to znovu za 15 minut.' },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho žádostí o obnovu hesla, zkuste to znovu za 15 minut.' },
});

const RESET_TOKEN_TTL_MINUTES = 60;

async function loadFirmaSettings() {
  const { rows } = await query(
    `SELECT klic, hodnota FROM nastaveni
     WHERE klic = ANY($1::text[])`,
    [[
      'firma_nazev',
      'firma_email',
      'firma_telefon',
      'firma_web',
      'email_podpis_html',
    ]]
  );

  return rows.reduce((acc, row) => {
    acc[row.klic] = row.hodnota;
    return acc;
  }, {});
}

// Helper – zaloguje pokus o přihlášení
async function logLogin({ user_id, email, uspech, ip_adresa, user_agent, duvod }) {
  try {
    await query(
      `INSERT INTO login_log (user_id, email, uspech, ip_adresa, user_agent, duvod)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user_id || null, email || null, uspech, ip_adresa || null, user_agent || null, duvod || null]
    );
  } catch { /* logování nesmí shodit login */ }
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, heslo } = req.body;
    const ip = getIp(req);
    const ua = req.headers['user-agent'] || null;

    if (!email || !heslo) {
      return res.status(400).json({ error: 'E-mail a heslo jsou povinné' });
    }

    const emailNorm = email.toLowerCase().trim();

    // Nejdřív zkus najít uživatele (i neaktivního – abychom zalogovali správný důvod)
    const { rows: allRows } = await query(
      'SELECT * FROM uzivatele WHERE email = $1',
      [emailNorm]
    );
    const uzivatel = allRows[0];

    // Neaktivní účet
    if (uzivatel && !uzivatel.aktivni) {
      await logLogin({ user_id: uzivatel.id, email: emailNorm, uspech: false, ip_adresa: ip, user_agent: ua, duvod: 'neaktivni_ucet' });
      return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });
    }

    // Špatné heslo nebo uživatel neexistuje
    if (!uzivatel || !(await bcrypt.compare(heslo, uzivatel.heslo_hash))) {
      await logLogin({ user_id: uzivatel?.id || null, email: emailNorm, uspech: false, ip_adresa: ip, user_agent: ua, duvod: 'nespravne_heslo' });
      return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });
    }

    // Úspěšné přihlášení
    await query('UPDATE uzivatele SET posledni_prihlaseni = NOW() WHERE id = $1', [uzivatel.id]);
    await logLogin({ user_id: uzivatel.id, email: emailNorm, uspech: true, ip_adresa: ip, user_agent: ua, duvod: null });
    const modules = await getModuleState();

    const token = jwt.sign(
      { id: uzivatel.id, email: uzivatel.email, role: uzivatel.role,
        jmeno: uzivatel.jmeno, prijmeni: uzivatel.prijmeni },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      uzivatel: {
        id: uzivatel.id,
        jmeno: uzivatel.jmeno,
        prijmeni: uzivatel.prijmeni,
        email: uzivatel.email,
        role: uzivatel.role,
        telefon: uzivatel.telefon,
        modules,
      }
    });
  } catch (err) { next(err); }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', resetLimiter, async (req, res, next) => {
  try {
    const email = req.body?.email?.toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: 'E-mail je povinný' });
    }

    const genericResponse = {
      message: 'Pokud účet s tímto e-mailem existuje, poslali jsme instrukce pro obnovu hesla.',
    };

    const { rows } = await query(
      'SELECT id, jmeno, prijmeni, email, aktivni FROM uzivatele WHERE email = $1 LIMIT 1',
      [email]
    );

    const uzivatel = rows[0];
    if (!uzivatel || !uzivatel.aktivni) {
      return res.json(genericResponse);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    await query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW() OR used_at IS NOT NULL',
      [uzivatel.id]
    );

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
      [uzivatel.id, tokenHash, String(RESET_TOKEN_TTL_MINUTES)]
    );

    const firma = await loadFirmaSettings();
    const frontendBaseUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173';
    const resetUrl = new URL('/login', frontendBaseUrl);
    resetUrl.searchParams.set('mode', 'reset');
    resetUrl.searchParams.set('token', resetToken);

    await sendPasswordReset({
      to: uzivatel.email,
      jmeno: `${uzivatel.jmeno} ${uzivatel.prijmeni}`.trim(),
      resetUrl: resetUrl.toString(),
      firma,
    });

    res.json(genericResponse);
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const modules = await getModuleState();
    const { rows } = await query(
      'SELECT id, jmeno, prijmeni, email, role, telefon, posledni_prihlaseni FROM uzivatele WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Uživatel nenalezen' });
    res.json({ ...rows[0], modules });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password
router.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const { token, nove_heslo } = req.body;
    if (!token || !nove_heslo) {
      return res.status(400).json({ error: 'Token a nové heslo jsou povinné' });
    }
    if (nove_heslo.length < 8) {
      return res.status(400).json({ error: 'Nové heslo musí mít alespoň 8 znaků' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await query(
      `SELECT prt.id, prt.user_id
       FROM password_reset_tokens prt
       JOIN uzivatele u ON u.id = prt.user_id
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
         AND u.aktivni = true
       LIMIT 1`,
      [tokenHash]
    );

    const resetRecord = rows[0];
    if (!resetRecord) {
      return res.status(400).json({ error: 'Reset odkaz je neplatný nebo už expiroval' });
    }

    const hash = await bcrypt.hash(nove_heslo, 12);
    await query('UPDATE uzivatele SET heslo_hash = $1 WHERE id = $2', [hash, resetRecord.user_id]);
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [resetRecord.id]);
    await query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND id <> $2',
      [resetRecord.user_id, resetRecord.id]
    );

    res.json({ message: 'Heslo bylo úspěšně obnoveno. Nyní se můžete přihlásit.' });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res, next) => {
  try {
    const { stare_heslo, nove_heslo } = req.body;
    if (!stare_heslo || !nove_heslo) {
      return res.status(400).json({ error: 'Stávající i nové heslo jsou povinné' });
    }
    if (nove_heslo.length < 8) {
      return res.status(400).json({ error: 'Nové heslo musí mít alespoň 8 znaků' });
    }

    const { rows } = await query('SELECT heslo_hash FROM uzivatele WHERE id = $1', [req.user.id]);
    if (!await bcrypt.compare(stare_heslo, rows[0].heslo_hash)) {
      return res.status(401).json({ error: 'Stávající heslo není správné' });
    }

    const hash = await bcrypt.hash(nove_heslo, 12);
    await query('UPDATE uzivatele SET heslo_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Heslo bylo úspěšně změněno' });
  } catch (err) { next(err); }
});

module.exports = router;
