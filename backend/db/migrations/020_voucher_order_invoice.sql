ALTER TABLE voucher_orders
  ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES faktury(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voucher_orders_invoice_id ON voucher_orders(invoice_id);
