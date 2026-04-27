ALTER TABLE voucher_orders
  ADD COLUMN IF NOT EXISTS billing_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_company VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_ico VARCHAR(40),
  ADD COLUMN IF NOT EXISTS billing_dic VARCHAR(40),
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);

INSERT INTO nastaveni (klic, hodnota, popis) VALUES
  ('voucher_shop_min_amount', '500', 'Minimalni hodnota poukazu ve verejnem shopu')
ON CONFLICT (klic) DO NOTHING;
