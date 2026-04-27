CREATE TABLE IF NOT EXISTS client_magic_links (
  id              BIGSERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  token_hash      VARCHAR(64) NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  requested_ip    VARCHAR(120),
  requested_ua    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_magic_links_email ON client_magic_links(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_client_magic_links_expires ON client_magic_links(expires_at);

CREATE TABLE IF NOT EXISTS client_portal_sessions (
  id              BIGSERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  token_hash      VARCHAR(64) NOT NULL UNIQUE,
  source_link_id  BIGINT REFERENCES client_magic_links(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  created_ip      VARCHAR(120),
  created_ua      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_email ON client_portal_sessions(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_expires ON client_portal_sessions(expires_at);

CREATE TABLE IF NOT EXISTS vouchers (
  id                    BIGSERIAL PRIMARY KEY,
  kod                   VARCHAR(40) NOT NULL UNIQUE,
  public_token          VARCHAR(120) NOT NULL UNIQUE,
  title                 VARCHAR(255) NOT NULL,
  nominal_value         NUMERIC(12,2),
  fulfillment_note      TEXT,
  recipient_name        VARCHAR(255),
  recipient_email       VARCHAR(255),
  buyer_name            VARCHAR(255),
  buyer_email           VARCHAR(255),
  klient_id             INTEGER REFERENCES klienti(id) ON DELETE SET NULL,
  zakazka_id            INTEGER REFERENCES zakazky(id) ON DELETE SET NULL,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,
  redeemed_at           TIMESTAMPTZ,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  qr_payload            TEXT,
  verify_url            TEXT,
  pdf_document_id       INTEGER REFERENCES dokumenty(id) ON DELETE SET NULL,
  note                  TEXT,
  created_by            INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  updated_by            INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vouchers_status_chk CHECK (status IN ('draft', 'active', 'redeemed', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_klient_id ON vouchers(klient_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_zakazka_id ON vouchers(zakazka_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_expires_at ON vouchers(expires_at);

CREATE TABLE IF NOT EXISTS voucher_events (
  id              BIGSERIAL PRIMARY KEY,
  voucher_id      BIGINT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  event_type      VARCHAR(40) NOT NULL,
  previous_status VARCHAR(20),
  next_status     VARCHAR(20),
  payload         JSONB,
  actor_id        INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  actor_label     VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voucher_events_voucher_id ON voucher_events(voucher_id, created_at DESC);

INSERT INTO nastaveni (klic, hodnota, popis)
VALUES
  ('client_portal_enabled', 'true', 'Klientsky portal s magic link prihlasenim'),
  ('voucher_module_enabled', 'true', 'Poukazy a darkove certifikaty')
ON CONFLICT (klic) DO NOTHING;

CREATE TRIGGER trg_vouchers_updated
  BEFORE UPDATE ON vouchers
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
