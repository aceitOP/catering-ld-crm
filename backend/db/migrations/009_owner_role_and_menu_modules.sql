ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'majitel' AFTER 'super_admin';

INSERT INTO nastaveni (klic, hodnota, popis) VALUES
  ('modul_pro', 'true', 'Suroviny a receptury'),
  ('modul_vouchers', 'true', 'Poukazy'),
  ('modul_venues', 'true', 'Prostory')
ON CONFLICT (klic) DO NOTHING;
