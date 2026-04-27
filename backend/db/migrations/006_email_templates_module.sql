CREATE TABLE IF NOT EXISTS email_sablony (
  id             SERIAL PRIMARY KEY,
  nazev          VARCHAR(255) NOT NULL,
  predmet_prefix VARCHAR(255),
  telo           TEXT NOT NULL DEFAULT '',
  poradi         INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_sablony
  ADD COLUMN IF NOT EXISTS template_key VARCHAR(80);

ALTER TABLE email_sablony
  ADD COLUMN IF NOT EXISTS use_case VARCHAR(40) NOT NULL DEFAULT 'reply';

ALTER TABLE email_sablony
  ADD COLUMN IF NOT EXISTS subject_template VARCHAR(255);

ALTER TABLE email_sablony
  ADD COLUMN IF NOT EXISTS body_template TEXT;

ALTER TABLE email_sablony
  ADD COLUMN IF NOT EXISTS popis TEXT;

ALTER TABLE email_sablony
  ADD COLUMN IF NOT EXISTS aktivni BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE email_sablony
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE email_sablony
SET subject_template = COALESCE(NULLIF(subject_template, ''), predmet_prefix),
    body_template = COALESCE(NULLIF(body_template, ''), telo),
    template_key = COALESCE(NULLIF(template_key, ''), 'template_' || id::text)
WHERE subject_template IS NULL
   OR body_template IS NULL
   OR template_key IS NULL;

DROP INDEX IF EXISTS idx_email_sablony_template_key;

CREATE UNIQUE INDEX idx_email_sablony_template_key
  ON email_sablony(template_key);

CREATE INDEX IF NOT EXISTS idx_email_sablony_use_case
  ON email_sablony(use_case, aktivni, poradi, id);

INSERT INTO email_sablony (
  template_key, use_case, nazev, predmet_prefix, subject_template, telo, body_template, popis, poradi, aktivni
)
VALUES (
  'thank_you_default',
  'thank_you',
  'Děkovací e-mail po akci',
  'Děkujeme za spolupráci - {nazev}',
  'Děkujeme za spolupráci - {nazev}',
  'Vážený zákazníku,

velice si vážíme Vaší důvěry a těší nás, že jsme mohli být součástí Vaší akce {nazev}.
Doufáme, že vše proběhlo k Vaší spokojenosti.

Budeme rádi, pokud na nás budete myslet i při plánování dalších akcí.

S pozdravem
{firma_nazev}',
  'Vážený zákazníku,

velice si vážíme Vaší důvěry a těší nás, že jsme mohli být součástí Vaší akce {nazev}.
Doufáme, že vše proběhlo k Vaší spokojenosti.

Budeme rádi, pokud na nás budete myslet i při plánování dalších akcí.

S pozdravem
{firma_nazev}',
  'Výchozí šablona pro ruční odeslání děkovacího e-mailu ze zakázky.',
  10,
  true
)
ON CONFLICT (template_key) DO NOTHING;
