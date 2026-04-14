const jwt = require('jsonwebtoken');

// Hierarchie rolí: číslo = úroveň oprávnění
const ROLE_LEVEL = {
  super_admin: 3,
  admin:       2,
  uzivatel:    1,
  // Zpětná kompatibilita – staré role mají level uzivatel
  obchodnik:   1,
  provoz:      1,
};

const auth = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Přístup odepřen – chybí token' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Neplatný nebo expirovaný token' });
  }
};

// Middleware: uživatel musí mít minimálně danou roli (nebo vyšší)
// requireMinRole('admin') → projde admin i super_admin
// requireMinRole('super_admin') → projde pouze super_admin
const requireMinRole = (minRole) => (req, res, next) => {
  const userLevel = ROLE_LEVEL[req.user?.role] || 0;
  const minLevel  = ROLE_LEVEL[minRole]        || 99;
  if (userLevel < minLevel) {
    return res.status(403).json({ error: 'Nedostatečná oprávnění' });
  }
  next();
};

// Zachováno pro zpětnou kompatibilitu – preferujte requireMinRole
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Nedostatečná oprávnění' });
  }
  next();
};

// Helper – zjistí level role uživatele z requestu
const userLevel = (req) => ROLE_LEVEL[req.user?.role] || 0;

module.exports = { auth, requireRole, requireMinRole, userLevel, ROLE_LEVEL };
