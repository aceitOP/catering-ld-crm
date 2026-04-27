CREATE TABLE IF NOT EXISTS ingredients (
  id                          SERIAL PRIMARY KEY,
  slug                        VARCHAR(180) NOT NULL UNIQUE,
  nazev                       VARCHAR(255) NOT NULL,
  jednotka                    VARCHAR(32) NOT NULL DEFAULT 'kg',
  nakupni_jednotka            VARCHAR(32),
  aktualni_cena_za_jednotku   NUMERIC(12,2) NOT NULL DEFAULT 0,
  vytiznost_procent           NUMERIC(5,2) NOT NULL DEFAULT 100,
  odpad_procent               NUMERIC(5,2) NOT NULL DEFAULT 0,
  alergeny                    TEXT[] NOT NULL DEFAULT '{}',
  poznamka                    TEXT,
  aktivni                     BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredients_vytiznost_chk CHECK (vytiznost_procent > 0 AND vytiznost_procent <= 100),
  CONSTRAINT ingredients_odpad_chk CHECK (odpad_procent >= 0 AND odpad_procent < 100)
);

CREATE INDEX IF NOT EXISTS idx_ingredients_active_name ON ingredients(aktivni, nazev);

CREATE TABLE IF NOT EXISTS ingredient_price_history (
  id                   BIGSERIAL PRIMARY KEY,
  ingredient_id        INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  cena_za_jednotku     NUMERIC(12,2) NOT NULL,
  platne_od            DATE NOT NULL DEFAULT CURRENT_DATE,
  zdroj                VARCHAR(80),
  poznamka             TEXT,
  created_by           INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingredient_price_history_lookup
  ON ingredient_price_history(ingredient_id, platne_od DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS recipes (
  id                        SERIAL PRIMARY KEY,
  slug                      VARCHAR(180) NOT NULL UNIQUE,
  nazev                     VARCHAR(255) NOT NULL,
  interni_nazev             VARCHAR(255),
  typ                       VARCHAR(20) NOT NULL DEFAULT 'final',
  kategorie                 VARCHAR(120),
  vydatnost_mnozstvi        NUMERIC(12,3),
  vydatnost_jednotka        VARCHAR(32),
  default_porce_mnozstvi    NUMERIC(12,3),
  default_porce_jednotka    VARCHAR(32),
  cas_pripravy_min          INTEGER,
  poznamka                  TEXT,
  aktivni                   BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipes_typ_chk CHECK (typ IN ('final', 'component'))
);

CREATE INDEX IF NOT EXISTS idx_recipes_active_name ON recipes(aktivni, nazev);

CREATE TABLE IF NOT EXISTS recipe_versions (
  id                SERIAL PRIMARY KEY,
  recipe_id         INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  verze             INTEGER NOT NULL,
  stav              VARCHAR(20) NOT NULL DEFAULT 'draft',
  poznamka_zmeny    TEXT,
  schvaleno_by      INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  schvaleno_at      TIMESTAMPTZ,
  created_by        INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_versions_stav_chk CHECK (stav IN ('draft', 'active', 'archived')),
  CONSTRAINT recipe_versions_unique_verze UNIQUE (recipe_id, verze)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_versions_single_active
  ON recipe_versions(recipe_id)
  WHERE stav = 'active';

CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_created ON recipe_versions(recipe_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recipe_items (
  id                  SERIAL PRIMARY KEY,
  recipe_version_id   INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  item_type           VARCHAR(20) NOT NULL,
  ingredient_id       INTEGER REFERENCES ingredients(id) ON DELETE RESTRICT,
  subrecipe_id        INTEGER REFERENCES recipes(id) ON DELETE RESTRICT,
  mnozstvi            NUMERIC(12,3) NOT NULL,
  jednotka            VARCHAR(32) NOT NULL,
  poradi              INTEGER NOT NULL DEFAULT 0,
  poznamka            TEXT,
  CONSTRAINT recipe_items_type_chk CHECK (item_type IN ('ingredient', 'subrecipe')),
  CONSTRAINT recipe_items_ref_chk CHECK (
    (item_type = 'ingredient' AND ingredient_id IS NOT NULL AND subrecipe_id IS NULL)
    OR
    (item_type = 'subrecipe' AND subrecipe_id IS NOT NULL AND ingredient_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_version_order
  ON recipe_items(recipe_version_id, poradi, id);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id                SERIAL PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  krok_index        INTEGER NOT NULL,
  nazev             VARCHAR(255),
  instrukce         TEXT NOT NULL,
  pracoviste        VARCHAR(120),
  cas_min           INTEGER,
  kriticky_bod      BOOLEAN NOT NULL DEFAULT false,
  poznamka          TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipe_steps_version_order
  ON recipe_steps(recipe_version_id, krok_index, id);

ALTER TABLE cenik
  ADD COLUMN IF NOT EXISTS recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL;

ALTER TABLE kalkulace_polozky
  ADD COLUMN IF NOT EXISTS recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL;

ALTER TABLE kalkulace_polozky
  ADD COLUMN IF NOT EXISTS recipe_version_id INTEGER REFERENCES recipe_versions(id) ON DELETE SET NULL;

ALTER TABLE kalkulace_polozky
  ADD COLUMN IF NOT EXISTS cost_mode VARCHAR(20) NOT NULL DEFAULT 'manual';

ALTER TABLE kalkulace_polozky
  ADD COLUMN IF NOT EXISTS naklad_vypocet NUMERIC(12,2);

ALTER TABLE kalkulace_polozky
  ADD COLUMN IF NOT EXISTS marze_vypocet NUMERIC(8,2);

ALTER TABLE kalkulace_polozky
  DROP CONSTRAINT IF EXISTS kalkulace_polozky_cost_mode_chk;

ALTER TABLE kalkulace_polozky
  ADD CONSTRAINT kalkulace_polozky_cost_mode_chk
  CHECK (cost_mode IN ('manual', 'cenik', 'recipe'));

ALTER TABLE dokumenty
  ADD COLUMN IF NOT EXISTS recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL;

ALTER TABLE dokumenty
  ADD COLUMN IF NOT EXISTS recipe_version_id INTEGER REFERENCES recipe_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cenik_recipe_id ON cenik(recipe_id);
CREATE INDEX IF NOT EXISTS idx_kalkulace_polozky_recipe_id ON kalkulace_polozky(recipe_id);
CREATE INDEX IF NOT EXISTS idx_kalkulace_polozky_recipe_version_id ON kalkulace_polozky(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_dokumenty_recipe_id ON dokumenty(recipe_id);
CREATE INDEX IF NOT EXISTS idx_dokumenty_recipe_version_id ON dokumenty(recipe_version_id);
