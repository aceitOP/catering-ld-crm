// Spustí se při startu backendu a inicializuje databázi (schema + seed) pokud je prázdná
const { pool } = require('./db');
const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS } = require('./settingsDefaults');
const { bootstrapCanonicalSuperAdmin } = require('./superAdmin');

async function initDb() {
  try {
    const ensureDefaultSettings = async () => {
      for (const [klic, hodnota, popis] of DEFAULT_SETTINGS) {
        await pool.query(
          `INSERT INTO nastaveni (klic, hodnota, popis)
           VALUES ($1, $2, $3)
           ON CONFLICT (klic) DO NOTHING`,
          [klic, hodnota, popis]
        );
      }
    };

    const ensureSuperAdminUser = async () => {
      const { rows: existing } = await pool.query(
        `SELECT id, email FROM uzivatele
         WHERE role = 'super_admin'
         ORDER BY created_at ASC, id ASC
         LIMIT 1`
      );
      if (existing[0]) return existing[0];

      const preferredEmails = [
        process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase(),
        'l.dvorackova@catering-ld.cz',
      ].filter(Boolean);

      for (const email of preferredEmails) {
        const promoted = await pool.query(
          `UPDATE uzivatele
           SET role = 'super_admin'
           WHERE lower(email) = $1
           RETURNING id, email`,
          [email]
        );
        if (promoted.rows[0]) {
          console.log(`✅  Super admin nastaven pro účet ${promoted.rows[0].email}.`);
          return promoted.rows[0];
        }
      }

      const fallback = await pool.query(
        `WITH candidate AS (
           SELECT id
           FROM uzivatele
           WHERE role = 'admin'
           ORDER BY created_at ASC NULLS LAST, id ASC
           LIMIT 1
         )
         UPDATE uzivatele u
         SET role = 'super_admin'
         FROM candidate
         WHERE u.id = candidate.id
         RETURNING u.id, u.email`
      );

      if (fallback.rows[0]) {
        console.log(`✅  Žádný super admin nebyl nalezen, povýšen účet ${fallback.rows[0].email}.`);
        return fallback.rows[0];
      }

      console.warn('⚠️  Nebyl nalezen žádný účet pro povýšení na super admin.');
      return null;
    };

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
          polozky          JSONB NOT NULL DEFAULT '[]',
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE zakazky_sablony ADD COLUMN IF NOT EXISTS polozky JSONB NOT NULL DEFAULT '[]'`);
      // Plánování akce – nové sloupce pro záložku Plánování v detailu zakázky
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS harmonogram TEXT`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS kontaktni_osoby_misto TEXT`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS rozsah_sluzeb TEXT`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS personalni_pozadavky TEXT`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS logistika TEXT`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS technicke_pozadavky TEXT`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS alergeny TEXT`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS specialni_prani TEXT`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'`);
      // Pravidelní klienti
      await pool.query(`ALTER TABLE klienti ADD COLUMN IF NOT EXISTS pravidelny BOOLEAN NOT NULL DEFAULT false`);
      // Follow-up úkoly
      await pool.query(`
        CREATE TABLE IF NOT EXISTS followup_ukoly (
          id            SERIAL PRIMARY KEY,
          zakazka_id    INTEGER NOT NULL REFERENCES zakazky(id) ON DELETE CASCADE,
          typ           VARCHAR(50) NOT NULL DEFAULT 'vlastni',
          titulek       VARCHAR(300) NOT NULL,
          termin        DATE,
          splneno       BOOLEAN NOT NULL DEFAULT false,
          splneno_at    TIMESTAMPTZ,
          splneno_by    INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          poznamka      TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES uzivatele(id) ON DELETE CASCADE,
          token_hash VARCHAR(64) NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
        ON password_reset_tokens(user_id)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
        ON password_reset_tokens(expires_at)
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS error_logs (
          id BIGSERIAL PRIMARY KEY,
          source VARCHAR(30) NOT NULL DEFAULT 'http',
          method VARCHAR(10),
          path TEXT,
          status_code INTEGER NOT NULL DEFAULT 500,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          user_id INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          ip_address VARCHAR(100),
          user_agent TEXT,
          meta JSONB,
          resolved BOOLEAN NOT NULL DEFAULT false,
          resolved_at TIMESTAMPTZ,
          resolved_by INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
        ON error_logs(created_at DESC)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_error_logs_resolved
        ON error_logs(resolved, created_at DESC)
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS dokumenty_slozky (
          id SERIAL PRIMARY KEY,
          nazev VARCHAR(255) NOT NULL,
          vytvoril_id INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE dokumenty ADD COLUMN IF NOT EXISTS slozka_id INTEGER REFERENCES dokumenty_slozky(id) ON DELETE SET NULL`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venues (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) NOT NULL UNIQUE,
          address_line_1 VARCHAR(255),
          address_line_2 VARCHAR(255),
          city VARCHAR(120),
          postal_code VARCHAR(40),
          country VARCHAR(120) NOT NULL DEFAULT 'CZ',
          latitude NUMERIC(10,7),
          longitude NUMERIC(10,7),
          general_notes TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          created_by INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          updated_by INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE dokumenty ADD COLUMN IF NOT EXISTS venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_contacts (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          name VARCHAR(200) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'other',
          phone VARCHAR(50),
          email VARCHAR(255),
          availability_notes TEXT,
          is_primary BOOLEAN NOT NULL DEFAULT false,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_access_rules (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          applies_to_days VARCHAR(40),
          delivery_window_start TIME,
          delivery_window_end TIME,
          check_in_point VARCHAR(255),
          security_check_required BOOLEAN NOT NULL DEFAULT false,
          avg_security_minutes INTEGER NOT NULL DEFAULT 0,
          badge_required BOOLEAN NOT NULL DEFAULT false,
          manifest_required BOOLEAN NOT NULL DEFAULT false,
          manifest_lead_time_hours INTEGER,
          escort_required BOOLEAN NOT NULL DEFAULT false,
          vehicle_registration_required BOOLEAN NOT NULL DEFAULT false,
          service_elevator_only BOOLEAN NOT NULL DEFAULT false,
          notes TEXT,
          is_default BOOLEAN NOT NULL DEFAULT false,
          last_verified_at TIMESTAMPTZ,
          verification_source VARCHAR(30) NOT NULL DEFAULT 'manual',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_loading_zones (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          arrival_instructions TEXT,
          booking_required BOOLEAN NOT NULL DEFAULT false,
          booking_contact VARCHAR(255),
          max_vehicle_height_cm INTEGER,
          max_vehicle_length_cm INTEGER,
          weight_limit_kg INTEGER,
          unloading_time_limit_min INTEGER,
          distance_to_service_area_min INTEGER,
          notes TEXT,
          is_default BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_service_areas (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          floor VARCHAR(80),
          capacity INTEGER,
          has_power_access BOOLEAN NOT NULL DEFAULT false,
          has_water_access BOOLEAN NOT NULL DEFAULT false,
          has_cold_storage_access BOOLEAN NOT NULL DEFAULT false,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS venue_loading_zone_id INTEGER REFERENCES venue_loading_zones(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS venue_service_area_id INTEGER REFERENCES venue_service_areas(id) ON DELETE SET NULL`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_routes (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          from_loading_zone_id INTEGER REFERENCES venue_loading_zones(id) ON DELETE SET NULL,
          to_service_area_id INTEGER REFERENCES venue_service_areas(id) ON DELETE SET NULL,
          name VARCHAR(255) NOT NULL,
          estimated_walk_minutes INTEGER NOT NULL DEFAULT 0,
          stairs_count INTEGER NOT NULL DEFAULT 0,
          elevator_required BOOLEAN NOT NULL DEFAULT false,
          route_difficulty VARCHAR(20) NOT NULL DEFAULT 'low',
          notes TEXT,
          is_default BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE zakazky ADD COLUMN IF NOT EXISTS venue_route_id INTEGER REFERENCES venue_routes(id) ON DELETE SET NULL`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_route_steps (
          id SERIAL PRIMARY KEY,
          route_id INTEGER NOT NULL REFERENCES venue_routes(id) ON DELETE CASCADE,
          step_index INTEGER NOT NULL,
          instruction TEXT NOT NULL,
          checkpoint_type VARCHAR(30) NOT NULL DEFAULT 'other',
          estimated_minutes INTEGER,
          attachment_id INTEGER,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_restrictions (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          category VARCHAR(40) NOT NULL DEFAULT 'other',
          severity VARCHAR(20) NOT NULL DEFAULT 'info',
          title VARCHAR(255) NOT NULL,
          description TEXT,
          applies_to_area_id INTEGER REFERENCES venue_service_areas(id) ON DELETE SET NULL,
          effective_from TIMESTAMPTZ,
          effective_to TIMESTAMPTZ,
          notes TEXT,
          last_verified_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_parking_options (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          vehicle_type VARCHAR(20) NOT NULL DEFAULT 'mixed',
          location_description TEXT NOT NULL,
          reservation_required BOOLEAN NOT NULL DEFAULT false,
          paid BOOLEAN NOT NULL DEFAULT false,
          price_notes TEXT,
          walking_minutes_to_venue INTEGER,
          overnight_allowed BOOLEAN NOT NULL DEFAULT false,
          capacity_notes TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_connectivity_zones (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          zone_name VARCHAR(255) NOT NULL,
          signal_quality VARCHAR(20) NOT NULL DEFAULT 'usable',
          wifi_available BOOLEAN NOT NULL DEFAULT false,
          wifi_notes TEXT,
          dead_spot BOOLEAN NOT NULL DEFAULT false,
          notes TEXT,
          last_verified_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_observations (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          event_id INTEGER REFERENCES zakazky(id) ON DELETE SET NULL,
          category VARCHAR(30) NOT NULL DEFAULT 'other',
          title VARCHAR(255) NOT NULL,
          description TEXT,
          severity VARCHAR(20) NOT NULL DEFAULT 'info',
          measured_minutes INTEGER,
          happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          source VARCHAR(20) NOT NULL DEFAULT 'manual',
          is_verified BOOLEAN NOT NULL DEFAULT false,
          attachment_id INTEGER,
          recurring_key VARCHAR(120),
          propose_master_update BOOLEAN NOT NULL DEFAULT false,
          proposal_status VARCHAR(20) NOT NULL DEFAULT 'none',
          proposed_update_payload JSONB,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_snapshots (
          id SERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          event_id INTEGER NOT NULL REFERENCES zakazky(id) ON DELETE CASCADE,
          snapshot_payload JSONB NOT NULL,
          generated_by INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_audit_log (
          id BIGSERIAL PRIMARY KEY,
          venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
          entity_type VARCHAR(50) NOT NULL,
          entity_id INTEGER,
          action VARCHAR(20) NOT NULL,
          before_payload JSONB,
          after_payload JSONB,
          changed_by INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          source VARCHAR(30) NOT NULL DEFAULT 'manual',
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_contacts_venue ON venue_contacts(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_access_rules_venue ON venue_access_rules(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_loading_zones_venue ON venue_loading_zones(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_service_areas_venue ON venue_service_areas(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_routes_venue ON venue_routes(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_route_steps_route ON venue_route_steps(route_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_restrictions_venue ON venue_restrictions(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_parking_options_venue ON venue_parking_options(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_connectivity_zones_venue ON venue_connectivity_zones(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_observations_venue ON venue_observations(venue_id, happened_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_observations_event ON venue_observations(event_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_snapshots_event ON venue_snapshots(event_id, generated_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_venue_audit_log_venue ON venue_audit_log(venue_id, created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_zakazky_venue ON zakazky(venue_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_dokumenty_venue ON dokumenty(venue_id)`);
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venues_updated') THEN
            CREATE TRIGGER trg_venues_updated BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_contacts_updated') THEN
            CREATE TRIGGER trg_venue_contacts_updated BEFORE UPDATE ON venue_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_access_rules_updated') THEN
            CREATE TRIGGER trg_venue_access_rules_updated BEFORE UPDATE ON venue_access_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_loading_zones_updated') THEN
            CREATE TRIGGER trg_venue_loading_zones_updated BEFORE UPDATE ON venue_loading_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_service_areas_updated') THEN
            CREATE TRIGGER trg_venue_service_areas_updated BEFORE UPDATE ON venue_service_areas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_routes_updated') THEN
            CREATE TRIGGER trg_venue_routes_updated BEFORE UPDATE ON venue_routes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_route_steps_updated') THEN
            CREATE TRIGGER trg_venue_route_steps_updated BEFORE UPDATE ON venue_route_steps FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_restrictions_updated') THEN
            CREATE TRIGGER trg_venue_restrictions_updated BEFORE UPDATE ON venue_restrictions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_parking_options_updated') THEN
            CREATE TRIGGER trg_venue_parking_options_updated BEFORE UPDATE ON venue_parking_options FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_connectivity_zones_updated') THEN
            CREATE TRIGGER trg_venue_connectivity_zones_updated BEFORE UPDATE ON venue_connectivity_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_observations_updated') THEN
            CREATE TRIGGER trg_venue_observations_updated BEFORE UPDATE ON venue_observations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
          END IF;
        END $$;
      `);

      // ── E-mail integrace ───────────────────────────────────────────────────
      await pool.query(`
        CREATE TABLE IF NOT EXISTS email_links (
          id          SERIAL PRIMARY KEY,
          message_id  VARCHAR(500),
          uid         INTEGER NOT NULL,
          folder      VARCHAR(255) NOT NULL DEFAULT 'INBOX',
          subject     VARCHAR(500),
          from_email  VARCHAR(255),
          from_name   VARCHAR(255),
          zakazka_id  INTEGER NOT NULL REFERENCES zakazky(id) ON DELETE CASCADE,
          linked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          linked_by   INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_links_zakazka ON email_links(zakazka_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_links_message_id ON email_links(message_id)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS email_sablony (
          id             SERIAL PRIMARY KEY,
          nazev          VARCHAR(255) NOT NULL,
          predmet_prefix VARCHAR(255),
          telo           TEXT NOT NULL DEFAULT '',
          poradi         INTEGER NOT NULL DEFAULT 0,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // ── Login log ─────────────────────────────────────────────────────────────
      await pool.query(`
        CREATE TABLE IF NOT EXISTS login_log (
          id            BIGSERIAL PRIMARY KEY,
          user_id       INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
          email         VARCHAR(255),
          uspech        BOOLEAN NOT NULL,
          ip_adresa     VARCHAR(100),
          user_agent    TEXT,
          duvod         VARCHAR(100),
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_log_created_at ON login_log(created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_login_log_user_id ON login_log(user_id)`);

      // ── Role migrace ──────────────────────────────────────────────────────────
      await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'`);
      await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'uzivatel'`);
      await pool.query(`UPDATE uzivatele SET role = 'uzivatel' WHERE role IN ('obchodnik', 'provoz')`);
      await ensureDefaultSettings();
      await ensureSuperAdminUser();
      await bootstrapCanonicalSuperAdmin(pool.query.bind(pool));

      console.log('✅  Migrace OK (google_event_id, faktury, proposals, archivovano, sablony, planovani, pravidelny, followup, password reset, error logs, dokumenty_slozky, email_links, email_sablony, user_roles, venue_twin).');
      return;
    }

    console.log('📦  Inicializuji databázi...');

    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(schema);
    await ensureDefaultSettings();
    console.log('✅  Schema vytvořeno.');

    const seedMode = String(process.env.DB_SEED_MODE || process.env.INIT_SEED_MODE || 'empty').trim().toLowerCase();
    if (seedMode === 'demo') {
      const seed = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
      await pool.query(seed);
    }
    await ensureSuperAdminUser();
    await bootstrapCanonicalSuperAdmin(pool.query.bind(pool));
    if (seedMode !== 'demo') {
      console.log(`Demo seed preskocen (rezim: ${seedMode}).`);
    }
    console.log('✅  Demo data vložena.');

  } catch (err) {
    console.error('❌  Chyba při inicializaci DB:', err.message);
    throw err;
  }
}

module.exports = { initDb };
