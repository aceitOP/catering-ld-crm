const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { getCanonicalSuperAdminEmail } = require('../superAdmin');
const { getCapabilities, hasCapability } = require('../rbac');

// Hierarchie roli: cislo = uroven opravneni
const ROLE_LEVEL = {
  super_admin: 3,
  admin: 2,
  uzivatel: 1,
  // Zpětná kompatibilita - staré role mají level uživatel
  obchodnik: 1,
  provoz: 1,
};

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Pristup odepren - chybi token' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      `SELECT id, jmeno, prijmeni, email, role, telefon, aktivni
       FROM uzivatele
       WHERE id = $1
       LIMIT 1`,
      [payload.id]
    );

    const dbUser = rows[0];
    if (!dbUser || !dbUser.aktivni) {
      return res.status(401).json({ error: 'Neplatny nebo neaktivni ucet' });
    }

    const canonicalSuperAdminEmail = getCanonicalSuperAdminEmail();
    const effectiveRole = dbUser.role === 'super_admin' && String(dbUser.email).toLowerCase() !== canonicalSuperAdminEmail
      ? 'admin'
      : dbUser.role;

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: effectiveRole,
      jmeno: dbUser.jmeno,
      prijmeni: dbUser.prijmeni,
      telefon: dbUser.telefon,
      capabilities: getCapabilities(effectiveRole),
    };
    next();
  } catch {
    res.status(401).json({ error: 'Neplatny nebo expirovany token' });
  }
};

// Middleware: uživatel musí mít minimálně danou roli (nebo vyšší)
// requireMinRole('admin') -> projde admin i super_admin
// requireMinRole('super_admin') -> projde pouze super_admin
const requireMinRole = (minRole) => (req, res, next) => {
  const userLevel = ROLE_LEVEL[req.user?.role] || 0;
  const minLevel = ROLE_LEVEL[minRole] || 99;
  if (userLevel < minLevel) {
    return res.status(403).json({ error: 'Nedostatecna opravneni' });
  }
  next();
};

// Zachovano pro zpetnou kompatibilitu - preferujte requireMinRole
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Nedostatecna opravneni' });
  }
  next();
};

// Helper - zjisti level role uzivatele z requestu
const userLevel = (req) => ROLE_LEVEL[req.user?.role] || 0;

const requireCapability = (capability) => (req, res, next) => {
  if (!hasCapability(req.user, capability)) {
    return res.status(403).json({ error: 'Nedostatecna opravneni' });
  }
  next();
};

module.exports = { auth, requireRole, requireMinRole, requireCapability, userLevel, ROLE_LEVEL };
