'use strict';

const { query } = require('./db');

const DEFAULT_SUPER_ADMIN_EMAIL = 'pomykal@aceit.cz';

function getCanonicalSuperAdminEmail() {
  return (process.env.SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase();
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
  ensureSuperAdminUser,
  getCanonicalSuperAdminEmail,
  DEFAULT_SUPER_ADMIN_EMAIL,
};
