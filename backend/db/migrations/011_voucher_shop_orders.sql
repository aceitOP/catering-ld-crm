CREATE TABLE IF NOT EXISTS voucher_orders (
  id                    BIGSERIAL PRIMARY KEY,
  order_number          VARCHAR(40) NOT NULL UNIQUE,
  public_token          VARCHAR(120) NOT NULL UNIQUE,
  status                VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
  amount                NUMERIC(12,2) NOT NULL,
  currency              VARCHAR(3) NOT NULL DEFAULT 'CZK',
  buyer_name            VARCHAR(255) NOT NULL,
  buyer_email           VARCHAR(255) NOT NULL,
  recipient_choice      VARCHAR(20) NOT NULL DEFAULT 'buyer',
  recipient_name        VARCHAR(255),
  recipient_email       VARCHAR(255),
  fulfillment_note      TEXT,
  delivery_mode         VARCHAR(20) NOT NULL DEFAULT 'immediate',
  delivery_scheduled_at TIMESTAMPTZ,
  payment_iban          VARCHAR(80) NOT NULL,
  payment_variable_symbol VARCHAR(20) NOT NULL UNIQUE,
  payment_message       VARCHAR(140),
  payment_qr_payload    TEXT NOT NULL,
  paid_at               TIMESTAMPTZ,
  voucher_id            BIGINT REFERENCES vouchers(id) ON DELETE SET NULL,
  voucher_sent_at       TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voucher_orders_status_chk CHECK (status IN ('pending_payment', 'paid', 'voucher_created', 'sent', 'cancelled')),
  CONSTRAINT voucher_orders_recipient_choice_chk CHECK (recipient_choice IN ('buyer', 'recipient')),
  CONSTRAINT voucher_orders_delivery_mode_chk CHECK (delivery_mode IN ('immediate', 'scheduled')),
  CONSTRAINT voucher_orders_amount_chk CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_voucher_orders_status ON voucher_orders(status);
CREATE INDEX IF NOT EXISTS idx_voucher_orders_voucher_id ON voucher_orders(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_orders_delivery_due ON voucher_orders(status, delivery_scheduled_at)
  WHERE voucher_sent_at IS NULL AND voucher_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_voucher_orders_updated ON voucher_orders;
CREATE TRIGGER trg_voucher_orders_updated
  BEFORE UPDATE ON voucher_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

INSERT INTO nastaveni (klic, hodnota, popis) VALUES
  ('voucher_shop_enabled', 'false', 'Verejny prodej poukazu zapnuty'),
  ('voucher_shop_values', '1000,2000,3000,5000,10000', 'Povolene hodnoty poukazu ve verejnem shopu'),
  ('voucher_shop_validity_months', '12', 'Vychozi platnost koupenych poukazu v mesicich'),
  ('voucher_shop_terms_text', '', 'Podminky verejneho prodeje poukazu')
ON CONFLICT (klic) DO NOTHING;
