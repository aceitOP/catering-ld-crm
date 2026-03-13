// Spustí se při startu backendu a inicializuje databázi (schema + seed) pokud je prázdná
const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

async function initDb() {
  try {
    // Zkontroluj jestli tabulky už existují
    const { rows } = await pool.query(`
      SELECT COUNT(*) as cnt FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'uzivatele'
    `);

    if (parseInt(rows[0].cnt) > 0) {
      console.log('✅  Databáze již inicializována, přeskakuji schema.');
      return;
    }

    console.log('📦  Inicializuji databázi...');

    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅  Schema vytvořeno.');

    const seed = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
    await pool.query(seed);
    console.log('✅  Demo data vložena.');

  } catch (err) {
    console.error('❌  Chyba při inicializaci DB:', err.message);
    // Nekončíme – databáze mohla být inicializována jinak
  }
}

module.exports = { initDb };
