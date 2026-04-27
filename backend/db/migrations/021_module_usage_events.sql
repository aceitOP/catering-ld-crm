CREATE TABLE IF NOT EXISTS module_usage_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  module_key  VARCHAR(80) NOT NULL,
  path        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_module_usage_events_created_at ON module_usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_module_usage_events_module ON module_usage_events(module_key, created_at);
CREATE INDEX IF NOT EXISTS idx_module_usage_events_user ON module_usage_events(user_id, created_at);

INSERT INTO nastaveni (klic, hodnota, popis)
VALUES ('public_ga4_measurement_id', '', 'GA4 Measurement ID pro verejne casti aplikace')
ON CONFLICT (klic) DO NOTHING;
