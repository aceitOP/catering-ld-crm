ALTER TABLE zakazky
  ADD COLUMN IF NOT EXISTS harmonogram TEXT,
  ADD COLUMN IF NOT EXISTS kontaktni_osoby_misto TEXT,
  ADD COLUMN IF NOT EXISTS rozsah_sluzeb TEXT,
  ADD COLUMN IF NOT EXISTS personalni_pozadavky TEXT,
  ADD COLUMN IF NOT EXISTS logistika TEXT,
  ADD COLUMN IF NOT EXISTS technicke_pozadavky TEXT,
  ADD COLUMN IF NOT EXISTS alergeny TEXT,
  ADD COLUMN IF NOT EXISTS specialni_prani TEXT;
