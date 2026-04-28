INSERT INTO nastaveni (klic, hodnota, popis) VALUES
  ('voucher_shop_logo_data_url', '', 'Logo verejne stranky pro prodej poukazu'),
  ('voucher_shop_brand_title', '', 'Nazev verejne stranky pro prodej poukazu'),
  ('voucher_shop_header_subtitle', 'Poukazy · Praha', 'Podtitulek v hlavicce verejneho voucher shopu'),
  ('voucher_shop_hero_eyebrow', '[01] - Dárkové poukazy', 'Maly text nad hero nadpisem voucher shopu'),
  ('voucher_shop_hero_title', 'Darujte chuť, ne věci.', 'Hero nadpis voucher shopu'),
  ('voucher_shop_hero_highlight', 'chuť', 'Zvyraznena cast hero nadpisu voucher shopu'),
  ('voucher_shop_hero_text', 'Hodnotové i zážitkové poukazy. Vyberte částku, doplňte jméno a vzkaz, náhled poukazu uvidíte ještě před objednáním.', 'Hero popis voucher shopu'),
  ('voucher_shop_how_title_1', 'Vyberte poukaz', 'Krok 1 ve voucher shopu'),
  ('voucher_shop_how_text_1', 'Hodnotový nebo zážitkový poukaz z aktuální nabídky.', 'Popis kroku 1 ve voucher shopu'),
  ('voucher_shop_how_title_2', 'Personalizujte', 'Krok 2 ve voucher shopu'),
  ('voucher_shop_how_text_2', 'Doplňte jméno, e-mail, vzkaz a fakturační údaje.', 'Popis kroku 2 ve voucher shopu'),
  ('voucher_shop_how_title_3', 'Dokončete objednávku', 'Krok 3 ve voucher shopu'),
  ('voucher_shop_how_text_3', 'Po odeslání vám přijde potvrzení objednávky.', 'Popis kroku 3 ve voucher shopu'),
  ('voucher_shop_footer_title', 'Pojďme spolu obdarovat.', 'Nadpis paticky voucher shopu'),
  ('voucher_shop_terms_title', 'Obchodní podmínky', 'Nadpis stranky obchodnich podminek voucher shopu')
ON CONFLICT (klic) DO NOTHING;
