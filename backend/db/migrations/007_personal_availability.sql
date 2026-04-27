CREATE TABLE IF NOT EXISTS personal_absence (
  id           BIGSERIAL PRIMARY KEY,
  personal_id  INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
  datum_od     DATE NOT NULL,
  datum_do     DATE NOT NULL,
  cas_od       TIME,
  cas_do       TIME,
  typ          VARCHAR(40) NOT NULL DEFAULT 'dovolena',
  poznamka     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT personal_absence_date_order_chk CHECK (datum_do >= datum_od)
);

CREATE INDEX IF NOT EXISTS idx_personal_absence_personal_range
  ON personal_absence(personal_id, datum_od, datum_do);

CREATE INDEX IF NOT EXISTS idx_personal_absence_range
  ON personal_absence(datum_od, datum_do);

DROP TRIGGER IF EXISTS trg_personal_absence_updated ON personal_absence;

CREATE TRIGGER trg_personal_absence_updated
  BEFORE UPDATE ON personal_absence
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
