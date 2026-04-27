'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('./db');

const DEFAULT_SUPER_ADMIN_EMAIL = 'pomykal@aceit.cz';
const DEFAULT_SUPER_ADMIN_FIRST_NAME = 'Super';
const DEFAULT_SUPER_ADMIN_LAST_NAME = 'Admin';

function getCanonicalSuperAdminEmail() {
  return (process.env.SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase();
}

async function bootstrapCanonicalSuperAdmin(dbQuery = query) {
  const ensured = await ensureSuperAdminUser(dbQuery);
  if (ensured) return ensured;

  const password = process.env.SUPER_ADMIN_PASSWORD?.trim();
  if (!password) return null;

  const firstName = (process.env.SUPER_ADMIN_FIRST_NAME || DEFAULT_SUPER_ADMIN_FIRST_NAME).trim() || DEFAULT_SUPER_ADMIN_FIRST_NAME;
  const lastName = (process.env.SUPER_ADMIN_LAST_NAME || DEFAULT_SUPER_ADMIN_LAST_NAME).trim() || DEFAULT_SUPER_ADMIN_LAST_NAME;
  const email = getCanonicalSuperAdminEmail();
  const passwordHash = await bcrypt.hash(password, 12);

  const created = await dbQuery(
    `INSERT INTO uzivatele (jmeno, prijmeni, email, heslo_hash, role, aktivni)
     VALUES ($1, $2, $3, $4, 'super_admin', true)
     ON CONFLICT (email) DO UPDATE
       SET jmeno = EXCLUDED.jmeno,
           prijmeni = EXCLUDED.prijmeni,
           heslo_hash = EXCLUDED.heslo_hash,
           role = 'super_admin',
           aktivni = true
     RETURNING id, email, role`,
    [firstName, lastName, email, passwordHash]
  );

  await ensureSuperAdminUser(dbQuery);
  return created.rows[0] || null;
}

async function ensureSuperAdminUser(dbQuery = query) {
  const canonicalEmail = getCanonicalSuperAdminEmail();
  await dbQuery(
    `UPDATE uzivatele
     SET role = 'admin'
     WHERE role = 'super_admin'
       AND lower(email) <> $1`,
    [canonicalEmail]
  );

  const { rows: canonicalRows } = await dbQuery(
    `SELECT id, email
     FROM uzivatele
     WHERE lower(email) = $1
     LIMIT 1`,
    [canonicalEmail]
  );
  const canonicalUser = canonicalRows[0];
  if (!canonicalUser) {
    return null;
  }

  const promoted = await dbQuery(
    `UPDATE uzivatele
     SET role = 'super_admin'
     WHERE lower(email) = $1
     RETURNING id, email, role`,
    [canonicalEmail]
  );

  return promoted.rows[0] || canonicalUser;
}

module.exports = {
  bootstrapCanonicalSuperAdmin,
  ensureSuperAdminUser,
  getCanonicalSuperAdminEmail,
  DEFAULT_SUPER_ADMIN_EMAIL,
};
