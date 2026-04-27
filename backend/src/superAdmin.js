'use strict';

const { query } = require('./db');

const DEFAULT_SUPER_ADMIN_EMAIL = 'pomykal@aceit.cz';

function getCanonicalSuperAdminEmail() {
  return (process.env.SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase();
}

async function ensureSuperAdminUser(dbQuery = query) {
  const canonicalEmail = getCanonicalSuperAdminEmail();
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
     SET role = CASE
       WHEN lower(email) = $1 THEN 'super_admin'::user_role
       WHEN role = 'super_admin' THEN 'admin'::user_role
       ELSE role
     END
     WHERE lower(email) = $1 OR role = 'super_admin'
     RETURNING id, email, role`,
    [canonicalEmail]
  );

  return promoted.rows.find((row) => row.role === 'super_admin') || canonicalUser;
}

module.exports = {
  ensureSuperAdminUser,
  getCanonicalSuperAdminEmail,
  DEFAULT_SUPER_ADMIN_EMAIL,
};
