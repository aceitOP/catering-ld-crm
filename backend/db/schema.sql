-- ============================================================
-- Catering LD CRM – Databázové schéma
-- PostgreSQL 16+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- UŽIVATELÉ A ROLE
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'obchodnik', 'provoz');

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
  nahral_id    INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  poznamka     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dokumenty_zakazka ON dokumenty(zakazka_id);
CREATE INDEX idx_dokumenty_klient ON dokumenty(klient_id);

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
  ('firma_nazev',       'Catering LD s.r.o.',           'Název firmy'),
  ('firma_ico',         '08123456',                      'IČO'),
  ('firma_dic',         'CZ08123456',                    'DIČ'),
  ('firma_adresa',      'Liberecká 15, 460 01 Liberec', 'Adresa sídla'),
  ('firma_email',       'info@catering-ld.cz',          'Kontaktní e-mail'),
  ('firma_telefon',     '+420 485 000 111',              'Telefon'),
  ('firma_web',         'www.catering-ld.cz',            'Web'),
  ('firma_iban',        'CZ65 0800 0000 1920 0014 5399', 'Bankovní účet'),
  ('nabidka_platnost',  '30',                            'Výchozí platnost nabídky (dny)'),
  ('faktura_splatnost', '14',                            'Výchozí splatnost faktury (dny)'),
  ('zakazka_prefix',    'ZAK',                           'Prefix čísla zakázky'),
  ('pdf_sablona',       'standard',                      'Výchozí šablona PDF');

-- ============================================================
-- TRIGGER: updated_at automaticky
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_uzivatele_updated   BEFORE UPDATE ON uzivatele   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_klienti_updated     BEFORE UPDATE ON klienti     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
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
