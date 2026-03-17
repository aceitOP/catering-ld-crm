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
      // Migrace: přidat nové sloupce pokud chybí
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255)`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS archivovano BOOLEAN NOT NULL DEFAULT false`);
      await pool.query(`ALTER TABLE klienti ADD COLUMN IF NOT EXISTS archivovano BOOLEAN NOT NULL DEFAULT false`);
      await pool.query(`ALTER TABLE personal ADD COLUMN IF NOT EXISTS archivovano BOOLEAN NOT NULL DEFAULT false`);
      // Faktury – migrace pro existující DB
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'faktura_stav') THEN
            CREATE TYPE faktura_stav AS ENUM ('vystavena','odeslana','zaplacena','storno');
          END IF;
        END $$;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS faktury (
          id SERIAL PRIMARY KEY, cislo VARCHAR(30) NOT NULL UNIQUE,
          zakazka_id INTEGER REFERENCES zakazky(id) ON DELETE SET NULL,
          klient_id INTEGER REFERENCES klienti(id) ON DELETE SET NULL,
          stav faktura_stav NOT NULL DEFAULT 'vystavena',
          datum_vystaveni DATE NOT NULL DEFAULT CURRENT_DATE,
          datum_splatnosti DATE NOT NULL,
          datum_zaplaceni DATE, zpusob_platby VARCHAR(50) NOT NULL DEFAULT 'převod',
          variabilni_symbol VARCHAR(20), poznamka TEXT,
          cena_bez_dph NUMERIC(12,2) NOT NULL DEFAULT 0,
          dph NUMERIC(12,2) NOT NULL DEFAULT 0,
          cena_celkem NUMERIC(12,2) NOT NULL DEFAULT 0,
          dodavatel_json JSONB,
          vystavil_id INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS faktury_polozky (
          id SERIAL PRIMARY KEY,
          faktura_id INTEGER NOT NULL REFERENCES faktury(id) ON DELETE CASCADE,
          nazev VARCHAR(300) NOT NULL, jednotka VARCHAR(30) NOT NULL DEFAULT 'os.',
          mnozstvi NUMERIC(10,2) NOT NULL DEFAULT 1,
          cena_jednotka NUMERIC(10,2) NOT NULL DEFAULT 0,
          dph_sazba SMALLINT NOT NULL DEFAULT 12,
          cena_celkem NUMERIC(10,2) GENERATED ALWAYS AS (mnozstvi * cena_jednotka) STORED,
          poradi SMALLINT DEFAULT 0
        )
      `);
      // Proposals – klientský výběr menu
      await pool.query(`
        CREATE TABLE IF NOT EXISTS proposals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          zakazka_id INTEGER REFERENCES zakazky(id) ON DELETE CASCADE,
          token VARCHAR(64) NOT NULL UNIQUE,
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          nazev VARCHAR(300),
          uvodni_text TEXT,
          guest_count INTEGER NOT NULL DEFAULT 1,
          total_price NUMERIC(12,2) DEFAULT 0,
          expires_at TIMESTAMPTZ,
          signed_by VARCHAR(200),
          signed_at TIMESTAMPTZ,
          signed_ip VARCHAR(50),
          created_by INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS proposal_sekce (
          id SERIAL PRIMARY KEY,
          proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
          nazev VARCHAR(200) NOT NULL,
          popis TEXT,
          typ VARCHAR(30) NOT NULL DEFAULT 'single',
          min_vyberu SMALLINT DEFAULT 1,
          max_vyberu SMALLINT DEFAULT 1,
          povinne BOOLEAN DEFAULT true,
          poradi SMALLINT DEFAULT 0
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS proposal_polozky (
          id SERIAL PRIMARY KEY,
          sekce_id INTEGER NOT NULL REFERENCES proposal_sekce(id) ON DELETE CASCADE,
          nazev VARCHAR(300) NOT NULL,
          popis TEXT,
          obrazek_url TEXT,
          alergeny INTEGER[] DEFAULT '{}',
          cena_os NUMERIC(10,2) NOT NULL DEFAULT 0,
          je_vybrana BOOLEAN DEFAULT false,
          poznamka_klienta TEXT,
          poradi SMALLINT DEFAULT 0
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS proposal_selection_log (
          id SERIAL PRIMARY KEY,
          proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
          polozka_id INTEGER REFERENCES proposal_polozky(id) ON DELETE SET NULL,
          akce VARCHAR(50) NOT NULL,
          old_value TEXT,
          new_value TEXT,
          ip_adresa VARCHAR(50),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Šablony zakázek
      await pool.query(`
        CREATE TABLE IF NOT EXISTS zakazky_sablony (
          id               SERIAL PRIMARY KEY,
          nazev            VARCHAR(200) NOT NULL,
          popis            TEXT,
          typ              VARCHAR(50),
          cas_zacatek      TIME,
          cas_konec        TIME,
          misto            VARCHAR(300),
          pocet_hostu      INTEGER DEFAULT 0,
          poznamka_klient  TEXT,
          poznamka_interni TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log('✅  Migrace OK (google_event_id, faktury, proposals, archivovano, sablony).');
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
