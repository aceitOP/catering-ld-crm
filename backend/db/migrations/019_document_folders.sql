CREATE TABLE IF NOT EXISTS dokumenty_slozky (
  id SERIAL PRIMARY KEY,
  nazev VARCHAR(255) NOT NULL,
  vytvoril_id INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dokumenty
  ADD COLUMN IF NOT EXISTS slozka_id INTEGER REFERENCES dokumenty_slozky(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dokumenty_slozky_nazev
  ON dokumenty_slozky(nazev);

CREATE INDEX IF NOT EXISTS idx_dokumenty_slozka
  ON dokumenty(slozka_id);
