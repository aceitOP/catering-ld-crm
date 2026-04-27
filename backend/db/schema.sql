-- ============================================================
-- Catering LD CRM – Databázové schéma
-- PostgreSQL 16+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- UŽIVATELÉ A ROLE
-- ============================================================
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'uzivatel', 'obchodnik', 'provoz');

CREATE TABLE uzivatele (
  id          SERIAL PRIMARY KEY,
  jmeno       VARCHAR(100) NOT NULL,
  prijmeni    VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  heslo_hash  TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'obchodnik',
  telefon     VARCHAR(30),
  aktivni     BOOLEAN NOT NULL DEFAULT true,
  posledni_prihlaseni TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES uzivatele(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

CREATE TABLE error_logs (
  id            BIGSERIAL PRIMARY KEY,
  source        VARCHAR(30) NOT NULL DEFAULT 'http',
  method        VARCHAR(10),
  path          TEXT,
  status_code   INTEGER NOT NULL DEFAULT 500,
  error_message TEXT NOT NULL,
  stack_trace   TEXT,
  user_id       INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  ip_address    VARCHAR(100),
  user_agent    TEXT,
  meta          JSONB,
  resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_at   TIMESTAMPTZ,
  resolved_by   INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_resolved ON error_logs(resolved, created_at DESC);

-- ============================================================
-- KLIENTI
-- ============================================================
CREATE TYPE klient_typ AS ENUM ('soukromy', 'firemni', 'vip');

CREATE TABLE klienti (
  id          SERIAL PRIMARY KEY,
  jmeno       VARCHAR(150) NOT NULL,
  prijmeni    VARCHAR(150),
  firma       VARCHAR(200),
  typ         klient_typ NOT NULL DEFAULT 'soukromy',
  email       VARCHAR(255),
  telefon     VARCHAR(30),
  adresa      TEXT,
  ico         VARCHAR(20),
  dic         VARCHAR(20),
  zdroj       VARCHAR(100),
  poznamka    TEXT,
  obchodnik_id INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_klienti_email ON klienti(email);
CREATE INDEX idx_klienti_firma ON klienti(firma);

-- ============================================================
-- ZAKÁZKY
-- ============================================================
-- ============================================================
-- VENUE LOGISTICS TWIN
-- ============================================================
CREATE TABLE venues (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  slug             VARCHAR(255) NOT NULL UNIQUE,
  address_line_1   VARCHAR(255),
  address_line_2   VARCHAR(255),
  city             VARCHAR(120),
  postal_code      VARCHAR(40),
  country          VARCHAR(120) NOT NULL DEFAULT 'CZ',
  latitude         NUMERIC(10,7),
  longitude        NUMERIC(10,7),
  general_notes    TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by       INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  updated_by       INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_contacts (
  id                 SERIAL PRIMARY KEY,
  venue_id           INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name               VARCHAR(200) NOT NULL,
  role               VARCHAR(50) NOT NULL DEFAULT 'other',
  phone              VARCHAR(50),
  email              VARCHAR(255),
  availability_notes TEXT,
  is_primary         BOOLEAN NOT NULL DEFAULT false,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_access_rules (
  id                            SERIAL PRIMARY KEY,
  venue_id                      INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  title                         VARCHAR(255) NOT NULL,
  applies_to_days               VARCHAR(40),
  delivery_window_start         TIME,
  delivery_window_end           TIME,
  check_in_point                VARCHAR(255),
  security_check_required       BOOLEAN NOT NULL DEFAULT false,
  avg_security_minutes          INTEGER NOT NULL DEFAULT 0,
  badge_required                BOOLEAN NOT NULL DEFAULT false,
  manifest_required             BOOLEAN NOT NULL DEFAULT false,
  manifest_lead_time_hours      INTEGER,
  escort_required               BOOLEAN NOT NULL DEFAULT false,
  vehicle_registration_required BOOLEAN NOT NULL DEFAULT false,
  service_elevator_only         BOOLEAN NOT NULL DEFAULT false,
  notes                         TEXT,
  is_default                    BOOLEAN NOT NULL DEFAULT false,
  last_verified_at              TIMESTAMPTZ,
  verification_source           VARCHAR(30) NOT NULL DEFAULT 'manual',
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_loading_zones (
  id                           SERIAL PRIMARY KEY,
  venue_id                     INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name                         VARCHAR(255) NOT NULL,
  description                  TEXT,
  arrival_instructions         TEXT,
  booking_required             BOOLEAN NOT NULL DEFAULT false,
  booking_contact              VARCHAR(255),
  max_vehicle_height_cm        INTEGER,
  max_vehicle_length_cm        INTEGER,
  weight_limit_kg              INTEGER,
  unloading_time_limit_min     INTEGER,
  distance_to_service_area_min INTEGER,
  notes                        TEXT,
  is_default                   BOOLEAN NOT NULL DEFAULT false,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_service_areas (
  id                      SERIAL PRIMARY KEY,
  venue_id                INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name                    VARCHAR(255) NOT NULL,
  floor                   VARCHAR(80),
  capacity                INTEGER,
  has_power_access        BOOLEAN NOT NULL DEFAULT false,
  has_water_access        BOOLEAN NOT NULL DEFAULT false,
  has_cold_storage_access BOOLEAN NOT NULL DEFAULT false,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_routes (
  id                     SERIAL PRIMARY KEY,
  venue_id               INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  from_loading_zone_id   INTEGER REFERENCES venue_loading_zones(id) ON DELETE SET NULL,
  to_service_area_id     INTEGER REFERENCES venue_service_areas(id) ON DELETE SET NULL,
  name                   VARCHAR(255) NOT NULL,
  estimated_walk_minutes INTEGER NOT NULL DEFAULT 0,
  stairs_count           INTEGER NOT NULL DEFAULT 0,
  elevator_required      BOOLEAN NOT NULL DEFAULT false,
  route_difficulty       VARCHAR(20) NOT NULL DEFAULT 'low',
  notes                  TEXT,
  is_default             BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_route_steps (
  id                SERIAL PRIMARY KEY,
  route_id          INTEGER NOT NULL REFERENCES venue_routes(id) ON DELETE CASCADE,
  step_index        INTEGER NOT NULL,
  instruction       TEXT NOT NULL,
  checkpoint_type   VARCHAR(30) NOT NULL DEFAULT 'other',
  estimated_minutes INTEGER,
  attachment_id     INTEGER,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_restrictions (
  id                 SERIAL PRIMARY KEY,
  venue_id           INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  category           VARCHAR(40) NOT NULL DEFAULT 'other',
  severity           VARCHAR(20) NOT NULL DEFAULT 'info',
  title              VARCHAR(255) NOT NULL,
  description        TEXT,
  applies_to_area_id INTEGER REFERENCES venue_service_areas(id) ON DELETE SET NULL,
  effective_from     TIMESTAMPTZ,
  effective_to       TIMESTAMPTZ,
  notes              TEXT,
  last_verified_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_parking_options (
  id                       SERIAL PRIMARY KEY,
  venue_id                 INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  vehicle_type             VARCHAR(20) NOT NULL DEFAULT 'mixed',
  location_description     TEXT NOT NULL,
  reservation_required     BOOLEAN NOT NULL DEFAULT false,
  paid                     BOOLEAN NOT NULL DEFAULT false,
  price_notes              TEXT,
  walking_minutes_to_venue INTEGER,
  overnight_allowed        BOOLEAN NOT NULL DEFAULT false,
  capacity_notes           TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_connectivity_zones (
  id               SERIAL PRIMARY KEY,
  venue_id         INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  zone_name        VARCHAR(255) NOT NULL,
  signal_quality   VARCHAR(20) NOT NULL DEFAULT 'usable',
  wifi_available   BOOLEAN NOT NULL DEFAULT false,
  wifi_notes       TEXT,
  dead_spot        BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_venues_slug ON venues(slug);
CREATE INDEX idx_venues_status ON venues(status);
CREATE INDEX idx_venue_contacts_venue ON venue_contacts(venue_id);
CREATE INDEX idx_venue_access_rules_venue ON venue_access_rules(venue_id);
CREATE INDEX idx_venue_loading_zones_venue ON venue_loading_zones(venue_id);
CREATE INDEX idx_venue_service_areas_venue ON venue_service_areas(venue_id);
CREATE INDEX idx_venue_routes_venue ON venue_routes(venue_id);
CREATE INDEX idx_venue_route_steps_route ON venue_route_steps(route_id);
CREATE INDEX idx_venue_restrictions_venue ON venue_restrictions(venue_id);
CREATE INDEX idx_venue_parking_options_venue ON venue_parking_options(venue_id);
CREATE INDEX idx_venue_connectivity_zones_venue ON venue_connectivity_zones(venue_id);

CREATE TYPE zakazka_stav AS ENUM (
  'nova_poptavka',
  'rozpracovano',
  'nabidka_pripravena',
  'nabidka_odeslana',
  'ceka_na_vyjadreni',
  'potvrzeno',
  've_priprave',
  'realizovano',
  'uzavreno',
  'stornovano'
);

CREATE TYPE zakazka_typ AS ENUM (
  'svatba',
  'soukroma_akce',
  'firemni_akce',
  'zavoz',
  'bistro'
);

CREATE TABLE zakazky (
  id            SERIAL PRIMARY KEY,
  cislo         VARCHAR(20) NOT NULL UNIQUE, -- např. ZAK-2026-041
  nazev         VARCHAR(300) NOT NULL,
  typ           zakazka_typ NOT NULL,
  stav          zakazka_stav NOT NULL DEFAULT 'nova_poptavka',
  klient_id     INTEGER REFERENCES klienti(id) ON DELETE SET NULL,
  obchodnik_id  INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  datum_akce    DATE,
  cas_zacatek   TIME,
  cas_konec     TIME,
  misto         TEXT,
  venue_id      INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  venue_loading_zone_id INTEGER REFERENCES venue_loading_zones(id) ON DELETE SET NULL,
  venue_service_area_id INTEGER REFERENCES venue_service_areas(id) ON DELETE SET NULL,
  venue_route_id INTEGER REFERENCES venue_routes(id) ON DELETE SET NULL,
  pocet_hostu   INTEGER,
  rozpocet_klienta NUMERIC(12,2),
  cena_celkem   NUMERIC(12,2),
  cena_naklady  NUMERIC(12,2),
  zalohа        NUMERIC(12,2) DEFAULT 0,
  doplatek      NUMERIC(12,2) DEFAULT 0,
  poznamka_klient TEXT,
  poznamka_interni TEXT,
  google_event_id VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_zakazky_stav ON zakazky(stav);
CREATE INDEX idx_zakazky_datum ON zakazky(datum_akce);
CREATE INDEX idx_zakazky_klient ON zakazky(klient_id);
CREATE INDEX idx_zakazky_cislo ON zakazky(cislo);
CREATE INDEX idx_zakazky_venue ON zakazky(venue_id);

-- Historie změn stavu zakázky
CREATE TABLE zakazky_history (
  id          SERIAL PRIMARY KEY,
  zakazka_id  INTEGER NOT NULL REFERENCES zakazky(id) ON DELETE CASCADE,
  stav_pred   zakazka_stav,
  stav_po     zakazka_stav NOT NULL,
  uzivatel_id INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  poznamka    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_observations (
  id                      SERIAL PRIMARY KEY,
  venue_id                INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  event_id                INTEGER REFERENCES zakazky(id) ON DELETE SET NULL,
  category                VARCHAR(30) NOT NULL DEFAULT 'other',
  title                   VARCHAR(255) NOT NULL,
  description             TEXT,
  severity                VARCHAR(20) NOT NULL DEFAULT 'info',
  measured_minutes        INTEGER,
  happened_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  source                  VARCHAR(20) NOT NULL DEFAULT 'manual',
  is_verified             BOOLEAN NOT NULL DEFAULT false,
  attachment_id           INTEGER,
  recurring_key           VARCHAR(120),
  propose_master_update   BOOLEAN NOT NULL DEFAULT false,
  proposal_status         VARCHAR(20) NOT NULL DEFAULT 'none',
  proposed_update_payload JSONB,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_snapshots (
  id               SERIAL PRIMARY KEY,
  venue_id         INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  event_id         INTEGER NOT NULL REFERENCES zakazky(id) ON DELETE CASCADE,
  snapshot_payload JSONB NOT NULL,
  generated_by     INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE venue_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  venue_id       INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  entity_type    VARCHAR(50) NOT NULL,
  entity_id      INTEGER,
  action         VARCHAR(20) NOT NULL,
  before_payload JSONB,
  after_payload  JSONB,
  changed_by     INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  source         VARCHAR(30) NOT NULL DEFAULT 'manual',
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_venue_observations_venue ON venue_observations(venue_id, happened_at DESC);
CREATE INDEX idx_venue_observations_event ON venue_observations(event_id);
CREATE INDEX idx_venue_snapshots_event ON venue_snapshots(event_id, generated_at DESC);
CREATE INDEX idx_venue_audit_log_venue ON venue_audit_log(venue_id, created_at DESC);

-- ============================================================
-- CENÍK
-- ============================================================
CREATE TYPE cenik_kategorie AS ENUM (
  'jidlo', 'napoje', 'personal', 'doprava', 'vybaveni', 'pronajem', 'externi'
);

CREATE TABLE cenik (
  id           SERIAL PRIMARY KEY,
  nazev        VARCHAR(300) NOT NULL,
  kategorie    cenik_kategorie NOT NULL,
  jednotka     VARCHAR(30) NOT NULL DEFAULT 'os.',
  cena_nakup   NUMERIC(10,2) NOT NULL DEFAULT 0,
  cena_prodej  NUMERIC(10,2) NOT NULL DEFAULT 0,
  dph_sazba    SMALLINT NOT NULL DEFAULT 12, -- procenta
  aktivni      BOOLEAN NOT NULL DEFAULT true,
  poznamka     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- KALKULACE
-- ============================================================
CREATE TABLE kalkulace (
  id           SERIAL PRIMARY KEY,
  zakazka_id   INTEGER NOT NULL REFERENCES zakazky(id) ON DELETE CASCADE,
  verze        SMALLINT NOT NULL DEFAULT 1,
  nazev        VARCHAR(200),
  pocet_hostu  INTEGER,
  marze_procent NUMERIC(5,2) DEFAULT 30,
  sleva_procent NUMERIC(5,2) DEFAULT 0,
  dph_sazba    SMALLINT DEFAULT 12,
  poznamka     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kalkulace_polozky (
  id             SERIAL PRIMARY KEY,
  kalkulace_id   INTEGER NOT NULL REFERENCES kalkulace(id) ON DELETE CASCADE,
  cenik_id       INTEGER REFERENCES cenik(id) ON DELETE SET NULL,
  kategorie      cenik_kategorie NOT NULL,
  nazev          VARCHAR(300) NOT NULL,
  jednotka       VARCHAR(30) NOT NULL DEFAULT 'os.',
  mnozstvi       NUMERIC(10,2) NOT NULL DEFAULT 1,
  cena_nakup     NUMERIC(10,2) NOT NULL DEFAULT 0,
  cena_prodej    NUMERIC(10,2) NOT NULL DEFAULT 0,
  poradi         SMALLINT DEFAULT 0
);

-- ============================================================
-- NABÍDKY
-- ============================================================
CREATE TYPE nabidka_stav AS ENUM (
  'koncept', 'odeslano', 'prijato', 'zamitnuto', 'expirováno'
);

CREATE TABLE nabidky (
  id              SERIAL PRIMARY KEY,
  zakazka_id      INTEGER NOT NULL REFERENCES zakazky(id) ON DELETE CASCADE,
  kalkulace_id    INTEGER REFERENCES kalkulace(id) ON DELETE SET NULL,
  verze           SMALLINT NOT NULL DEFAULT 1,
  aktivni         BOOLEAN NOT NULL DEFAULT true,
  stav            nabidka_stav NOT NULL DEFAULT 'koncept',
  nazev           VARCHAR(300) NOT NULL,
  uvodni_text     TEXT,
  zaverecny_text  TEXT,
  platnost_do     DATE,
  sleva_procent   NUMERIC(5,2) DEFAULT 0,
  cena_bez_dph    NUMERIC(12,2),
  dph             NUMERIC(12,2),
  cena_celkem     NUMERIC(12,2),
  odeslano_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE nabidky_polozky (
  id           SERIAL PRIMARY KEY,
  nabidka_id   INTEGER NOT NULL REFERENCES nabidky(id) ON DELETE CASCADE,
  kategorie    cenik_kategorie NOT NULL,
  nazev        VARCHAR(300) NOT NULL,
  jednotka     VARCHAR(30) NOT NULL,
  mnozstvi     NUMERIC(10,2) NOT NULL DEFAULT 1,
  cena_jednotka NUMERIC(10,2) NOT NULL DEFAULT 0,
  cena_celkem  NUMERIC(10,2) GENERATED ALWAYS AS (mnozstvi * cena_jednotka) STORED,
  poradi       SMALLINT DEFAULT 0
);

-- ============================================================
-- PERSONÁL
-- ============================================================
CREATE TYPE personal_typ AS ENUM ('interni', 'externi');
CREATE TYPE personal_role AS ENUM ('koordinator', 'cisnik', 'kuchar', 'ridic', 'barman', 'pomocna_sila');

CREATE TABLE personal (
  id           SERIAL PRIMARY KEY,
  jmeno        VARCHAR(100) NOT NULL,
  prijmeni     VARCHAR(100) NOT NULL,
  typ          personal_typ NOT NULL DEFAULT 'interni',
  role         personal_role NOT NULL,
  email        VARCHAR(255),
  telefon      VARCHAR(30),
  specializace TEXT[], -- pole specializací
  poznamka     TEXT,
  aktivni      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Přiřazení personálu k zakázkám
CREATE TABLE zakazky_personal (
  id           SERIAL PRIMARY KEY,
  zakazka_id   INTEGER NOT NULL REFERENCES zakazky(id) ON DELETE CASCADE,
  personal_id  INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
  role_na_akci VARCHAR(100),
  cas_prichod  TIME,
  cas_odchod   TIME,
  poznamka     TEXT,
  UNIQUE(zakazka_id, personal_id)
);

-- ============================================================
-- DOKUMENTY A PŘÍLOHY
-- ============================================================
CREATE TYPE dokument_kategorie AS ENUM (
  'nabidka', 'kalkulace', 'smlouva', 'poptavka', 'podklady', 'foto', 'interni'
);

CREATE TABLE dokumenty (
  id           SERIAL PRIMARY KEY,
  nazev        VARCHAR(300) NOT NULL,
  filename     VARCHAR(300) NOT NULL,
  mime_type    VARCHAR(100),
  velikost     INTEGER, -- bytes
  kategorie    dokument_kategorie NOT NULL,
  zakazka_id   INTEGER REFERENCES zakazky(id) ON DELETE SET NULL,
  klient_id    INTEGER REFERENCES klienti(id) ON DELETE SET NULL,
  venue_id     INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  nahral_id    INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  poznamka     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dokumenty_zakazka ON dokumenty(zakazka_id);
CREATE INDEX idx_dokumenty_klient ON dokumenty(klient_id);
CREATE INDEX idx_dokumenty_venue ON dokumenty(venue_id);

-- ============================================================
-- NASTAVENÍ SYSTÉMU
-- ============================================================
CREATE TABLE nastaveni (
  klic    VARCHAR(100) PRIMARY KEY,
  hodnota TEXT NOT NULL,
  popis   TEXT
);

-- Výchozí hodnoty
INSERT INTO nastaveni (klic, hodnota, popis) VALUES
  ('firma_nazev',       '',                            'Nazev firmy'),
  ('firma_ico',         '',                             'ICO'),
  ('firma_dic',         '',                             'DIC'),
  ('firma_adresa',      '',                             'Adresa sidla'),
  ('firma_email',       '',                             'Kontaktni e-mail'),
  ('firma_telefon',     '',                             'Telefon'),
  ('firma_web',         '',                             'Web'),
  ('firma_iban',        '',                             'Bankovni ucet'),
  ('nabidka_platnost',  '30',                            'Výchozí platnost nabídky (dny)'),
  ('faktura_splatnost', '14',                            'Výchozí splatnost faktury (dny)'),
  ('zakazka_prefix',    'ZAK',                           'Prefix čísla zakázky'),
  ('pdf_sablona',       'standard',                      'Výchozí šablona PDF');

-- ============================================================
-- TRIGGER: updated_at automaticky
-- ============================================================
INSERT INTO nastaveni (klic, hodnota, popis) VALUES
  ('app_title', 'Catering CRM', 'Titulek aplikace v prohlizeci'),
  ('app_logo_data_url', '', 'Logo aplikace jako data URL'),
  ('backup_auto_enabled', 'true', 'Automaticke denni zalohy zapnute'),
  ('backup_auto_time', '02:30', 'Cas automaticke zalohy (HH:MM)'),
  ('backup_retention_count', '14', 'Pocet uchovavanych JSON zaloh'),
  ('backup_last_run_at', '', 'Cas posledniho behu zalohy'),
  ('backup_last_status', '', 'Stav posledniho behu zalohy'),
  ('backup_last_error', '', 'Chyba posledniho behu zalohy'),
  ('modul_kalendar', 'true', 'Kalendar akci a kapacity'),
  ('modul_reporty', 'true', 'Reporty a statistiky'),
  ('modul_faktury', 'true', 'Fakturace'),
  ('modul_archiv', 'true', 'Archiv'),
  ('modul_error_log', 'true', 'Error log'),
  ('modul_email', 'true', 'E-mailovy modul'),
  ('modul_sablony', 'true', 'Sablony zakazek'),
  ('modul_cenik', 'true', 'Cenik'),
  ('modul_personal', 'true', 'Personal'),
  ('modul_dokumenty', 'true', 'Dokumenty');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_uzivatele_updated   BEFORE UPDATE ON uzivatele   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_klienti_updated     BEFORE UPDATE ON klienti     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venues_updated      BEFORE UPDATE ON venues      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_contacts_updated BEFORE UPDATE ON venue_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_access_rules_updated BEFORE UPDATE ON venue_access_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_loading_zones_updated BEFORE UPDATE ON venue_loading_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_service_areas_updated BEFORE UPDATE ON venue_service_areas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_routes_updated BEFORE UPDATE ON venue_routes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_route_steps_updated BEFORE UPDATE ON venue_route_steps FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_restrictions_updated BEFORE UPDATE ON venue_restrictions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_parking_options_updated BEFORE UPDATE ON venue_parking_options FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_connectivity_zones_updated BEFORE UPDATE ON venue_connectivity_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venue_observations_updated BEFORE UPDATE ON venue_observations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_zakazky_updated     BEFORE UPDATE ON zakazky     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cenik_updated       BEFORE UPDATE ON cenik       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_kalkulace_updated   BEFORE UPDATE ON kalkulace   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_nabidky_updated     BEFORE UPDATE ON nabidky     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personal_updated    BEFORE UPDATE ON personal    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- FAKTURY
-- ============================================================
CREATE TYPE faktura_stav AS ENUM ('vystavena', 'odeslana', 'zaplacena', 'storno');

CREATE TABLE faktury (
  id                SERIAL PRIMARY KEY,
  cislo             VARCHAR(30) NOT NULL UNIQUE,       -- FAK-2026-001
  zakazka_id        INTEGER REFERENCES zakazky(id) ON DELETE SET NULL,
  klient_id         INTEGER REFERENCES klienti(id) ON DELETE SET NULL,
  stav              faktura_stav NOT NULL DEFAULT 'vystavena',
  datum_vystaveni   DATE NOT NULL DEFAULT CURRENT_DATE,
  datum_splatnosti  DATE NOT NULL,
  datum_zaplaceni   DATE,
  zpusob_platby     VARCHAR(50) NOT NULL DEFAULT 'převod',
  variabilni_symbol VARCHAR(20),
  poznamka          TEXT,
  cena_bez_dph      NUMERIC(12,2) NOT NULL DEFAULT 0,
  dph               NUMERIC(12,2) NOT NULL DEFAULT 0,
  cena_celkem       NUMERIC(12,2) NOT NULL DEFAULT 0,
  dodavatel_json    JSONB,
  vystavil_id       INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE faktury_polozky (
  id            SERIAL PRIMARY KEY,
  faktura_id    INTEGER NOT NULL REFERENCES faktury(id) ON DELETE CASCADE,
  nazev         VARCHAR(300) NOT NULL,
  jednotka      VARCHAR(30) NOT NULL DEFAULT 'os.',
  mnozstvi      NUMERIC(10,2) NOT NULL DEFAULT 1,
  cena_jednotka NUMERIC(10,2) NOT NULL DEFAULT 0,
  dph_sazba     SMALLINT NOT NULL DEFAULT 12,
  cena_celkem   NUMERIC(10,2) GENERATED ALWAYS AS (mnozstvi * cena_jednotka) STORED,
  poradi        SMALLINT DEFAULT 0
);

CREATE INDEX idx_faktury_zakazka ON faktury(zakazka_id);
CREATE INDEX idx_faktury_klient  ON faktury(klient_id);
CREATE INDEX idx_faktury_stav    ON faktury(stav);
CREATE INDEX idx_faktury_cislo   ON faktury(cislo);

CREATE TRIGGER trg_faktury_updated BEFORE UPDATE ON faktury FOR EACH ROW EXECUTE FUNCTION set_updated_at();
