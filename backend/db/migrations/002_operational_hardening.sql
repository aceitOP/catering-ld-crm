CREATE TABLE IF NOT EXISTS notifikace (
  id          SERIAL PRIMARY KEY,
  typ         VARCHAR(50) NOT NULL DEFAULT 'system',
  titulek     VARCHAR(255) NOT NULL,
  zprava      TEXT,
  odkaz       VARCHAR(255),
  procitana   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  actor_id       INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  action         VARCHAR(80) NOT NULL,
  entity_type    VARCHAR(80) NOT NULL,
  entity_id      VARCHAR(120),
  before_payload JSONB,
  after_payload  JSONB,
  meta           JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_log(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_rules (
  id                      SERIAL PRIMARY KEY,
  key                     VARCHAR(80) NOT NULL UNIQUE,
  title                   VARCHAR(255) NOT NULL,
  description             TEXT,
  event_type              VARCHAR(80) NOT NULL,
  enabled                 BOOLEAN NOT NULL DEFAULT true,
  include_assigned_staff  BOOLEAN NOT NULL DEFAULT false,
  include_admins          BOOLEAN NOT NULL DEFAULT true,
  extra_emails            TEXT,
  subject_template        VARCHAR(255),
  body_template           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_dispatch_log (
  id               BIGSERIAL PRIMARY KEY,
  rule_id          INTEGER REFERENCES notification_rules(id) ON DELETE SET NULL,
  event_type       VARCHAR(80) NOT NULL,
  dedupe_key       VARCHAR(255),
  zakazka_id       INTEGER REFERENCES zakazky(id) ON DELETE SET NULL,
  recipient_count  INTEGER NOT NULL DEFAULT 0,
  status           VARCHAR(20) NOT NULL DEFAULT 'queued',
  error_message    TEXT,
  payload          JSONB,
  created_by       INTEGER REFERENCES uzivatele(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_dispatch_dedupe
  ON notification_dispatch_log(rule_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_event
  ON notification_dispatch_log(event_type, created_at DESC);
