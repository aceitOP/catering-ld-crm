require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { DEFAULT_SUPER_ADMIN_EMAIL } = require('../src/superAdmin');

async function main() {
  const email = DEFAULT_SUPER_ADMIN_EMAIL;
  const heslo = process.argv[2] || 'Mdb@1989';
  const jmeno = process.argv[3] || 'Super';
  const prijmeni = process.argv[4] || 'Admin';

  const hash = await bcrypt.hash(heslo, 12);

  await pool.query(
    `UPDATE uzivatele
     SET role = 'admin'
     WHERE role = 'super_admin' AND lower(email) <> $1`,
    [email]
  );

  const { rows } = await pool.query(
    `INSERT INTO uzivatele (jmeno, prijmeni, email, heslo_hash, role, aktivni)
     VALUES ($1, $2, $3, $4, 'super_admin', true)
     ON CONFLICT (email) DO UPDATE
       SET heslo_hash = EXCLUDED.heslo_hash,
           role = 'super_admin',
           aktivni = true
     RETURNING id, jmeno, prijmeni, email, role`,
    [jmeno, prijmeni, email.toLowerCase(), hash]
  );

  console.log('Super admin vytvoren / aktualizovan:');
  console.log(rows[0]);
  await pool.end();
}

main().catch(async (e) => {
  const details = e?.stack || e?.message || String(e);

  if (String(e?.code || '').toUpperCase() === 'ECONNREFUSED') {
    console.error('Nepodarilo se pripojit k PostgreSQL. Ujistete se, ze bezi databaze podle backend/.env.');
  } else {
    console.error('Vytvoreni super admina selhalo.');
  }

  console.error(details);

  try {
    await pool.end();
  } catch (_) {
    // ignore pool close errors on shutdown
  }

  process.exit(1);
});
