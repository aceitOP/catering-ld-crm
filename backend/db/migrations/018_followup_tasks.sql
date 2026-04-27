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
);

CREATE INDEX IF NOT EXISTS idx_followup_ukoly_zakazka
  ON followup_ukoly(zakazka_id);

CREATE INDEX IF NOT EXISTS idx_followup_ukoly_termin
  ON followup_ukoly(termin);
