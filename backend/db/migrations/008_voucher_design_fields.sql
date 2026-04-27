ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS design_style VARCHAR(40),
  ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20),
  ADD COLUMN IF NOT EXISTS footer_text TEXT,
  ADD COLUMN IF NOT EXISTS image_data_url TEXT;

CREATE INDEX IF NOT EXISTS idx_vouchers_expiration_sweep
  ON vouchers(status, expires_at)
  WHERE expires_at IS NOT NULL;
