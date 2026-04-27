ALTER TABLE voucher_orders
  ADD COLUMN IF NOT EXISTS selected_offer_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS offer_title VARCHAR(120),
  ADD COLUMN IF NOT EXISTS offer_description TEXT;

INSERT INTO nastaveni (klic, hodnota, popis) VALUES
  ('voucher_shop_offers', '', 'Nabizene typy poukazu ve verejnem shopu')
ON CONFLICT (klic) DO NOTHING;
