/**
 * migrate.js – ruční spuštění DB schématu a migrací
 *
 * Dělá přesně totéž co initDb.js při startu aplikace:
 *   - vytvoří tabulky (CREATE TABLE IF NOT EXISTS)
 *   - spustí ALTER TABLE migrace pro nové sloupce
 *   - vytvoří demo uživatele pokud DB je prázdná
 *
 * Spuštění:
 *   cd backend && node src/db/migrate.js
 *   nebo: npm run migrate
 *
 * Lze volat opakovaně – vše je idempotentní (IF NOT EXISTS / IF NOT EXIST).
 */
require('dotenv').config();

const { initDb } = require('../initDb');

initDb()
  .then(() => {
    console.log('✅  Migrace dokončena.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌  Migrace selhala:', err.message);
    process.exit(1);
  });
