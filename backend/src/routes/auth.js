const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const { auth }  = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho pokusů o přihlášení, zkuste to znovu za 15 minut.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, heslo } = req.body;
    if (!email || !heslo) {
      return res.status(400).json({ error: 'E-mail a heslo jsou povinné' });
    }

    const { rows } = await query(
      'SELECT * FROM uzivatele WHERE email = $1 AND aktivni = true',
      [email.toLowerCase().trim()]
    );

    const uzivatel = rows[0];
    if (!uzivatel || !(await bcrypt.compare(heslo, uzivatel.heslo_hash))) {
      return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });
    }

    // Aktualizace posledního přihlášení
    await query('UPDATE uzivatele SET posledni_prihlaseni = NOW() WHERE id = $1', [uzivatel.id]);

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
      }
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, jmeno, prijmeni, email, role, telefon, posledni_prihlaseni FROM uzivatele WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Uživatel nenalezen' });
    res.json(rows[0]);
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
