-- ============================================================
-- Catering LD CRM – Vzorová demo data
-- Spuštění: psql "$DATABASE_URL" < backend/db/seed_demo.sql
-- ============================================================

-- ── Ceník ────────────────────────────────────────────────────

INSERT INTO cenik (nazev, kategorie, jednotka, cena_nakup, cena_prodej, dph_sazba, poznamka) VALUES
  -- Jídlo
  ('Svíčková na smetaně s knedlíkem',     'jidlo',    'os.',   95,  220, 12, 'Klasická česká svíčková, hovězí maso'),
  ('Kuřecí prsa na bylinkách',             'jidlo',    'os.',   75,  180, 12, 'Grilovaná, podávaná s grilovanou zeleninou'),
  ('Losos na špenátu s bramborovým pyré',  'jidlo',    'os.',  120,  280, 12, 'Norský losos, sezónní špenát'),
  -- Nápoje
  ('Prosecco DOC',                          'napoje',  'láhev', 120,  290, 21, '0,75 l, vhodné na přípitky'),
  ('Minerální voda Mattoni',                'napoje',  'láhev',  10,   40, 21, '0,5 l, perlivá i neperlivá'),
  ('Džus čerstvě lisovaný',                 'napoje',  'os.',    25,   75, 21, 'Pomeranč nebo jablko, 2 dl'),
  -- Personál
  ('Koordinátor akce',                      'personal','hod.',  200,  450, 21, 'Zkušený koordinátor, dohlíží na celý průběh'),
  ('Číšník / servírka',                     'personal','hod.',  150,  320, 21, 'Obsluha hostů, servírování jídla a nápojů'),
  ('Kuchař',                                'personal','hod.',  180,  400, 21, 'Zkušený kuchař, příprava jídel na místě'),
  -- Doprava
  ('Doprava vozem do 30 km',                'doprava', 'jízda', 300,  600, 21, 'Mercedes Sprinter, do 30 km od Prahy'),
  ('Doprava vozem 30–80 km',               'doprava', 'jízda', 500, 1000, 21, 'Příplatek za vzdálenost'),
  ('Expresní doprava (do 2 hod.)',          'doprava', 'jízda', 800, 1500, 21, 'Zajištění dopravy do 2 hodin od objednávky'),
  -- Vybavení
  ('Banketní stůl 180×90 cm',              'vybaveni', 'ks',    80,  200, 21, 'Skládací banketní stůl, bílý'),
  ('Banketní židle (cross-back)',           'vybaveni', 'ks',    30,   80, 21, 'Dřevěné banketní židle'),
  ('Kulatý stůl pro 8 os.',                'vybaveni', 'ks',   100,  250, 21, 'Průměr 180 cm, s bílým ubrusem'),
  -- Pronájem
  ('Párty stan 6×12 m',                    'pronajem', 'den',  2500, 6000, 21, 'Včetně montáže a demontáže'),
  ('LED světelná dekorace',                'pronajem', 'akce', 800, 2000, 21, 'Světelné závěsy, LED žárovky, teplá bílá'),
  ('Pivní set (stůl + 2 lavice)',          'pronajem', 'den',  150,  400, 21, 'Klasický pivní set, vhodný na venkovní akce'),
  -- Externí
  ('Fotograf na akci',                     'externi',  'akce', 3000, 6500, 21, 'Profesionální fotograf, 6 hod., digitální výstupy'),
  ('Hudební skupina (3 členové)',          'externi',  'akce', 8000,15000, 21, 'Živá hudba, 3× 45 min., vlastní aparatura'),
  ('Florista – výzdoba stolů',             'externi',  'akce', 2000, 5000, 21, 'Čerstvé květiny, dekorace dle přání klienta');

-- ── Klienti ──────────────────────────────────────────────────

INSERT INTO klienti (jmeno, prijmeni, firma, typ, email, telefon, adresa, ico, zdroj, poznamka) VALUES
  ('Tereza',  'Nováková',  NULL,                  'soukromy', 'tereza.novakova@email.cz',  '+420 722 111 222', 'Mánesova 12, Praha 2',    NULL,         'doporučení',   'Plánuje svatbu na léto, preferuje klasický styl'),
  ('Martin',  'Dvořák',    'Dvořák & Partneři s.r.o.', 'firemni',  'dvorak@dvoparti.cz',        '+420 603 456 789', 'Wenceslas Square 1, Praha 1', '12345678', 'web',          'Pravidelné firemní eventy, 2× ročně'),
  ('Barbora', 'Králová',   NULL,                  'vip',      'barbora.kralova@seznam.cz', '+420 777 333 444', 'Na Příkopě 5, Praha 1',   NULL,         'instagram',    'VIP klientka, vysoké nároky, vždy platí včas');

-- ── Personál ─────────────────────────────────────────────────

INSERT INTO personal (jmeno, prijmeni, typ, role, email, telefon, specializace, poznamka) VALUES
  ('Jakub',  'Horáček', 'interni', 'koordinator', 'jakub.horacek@cateringld.cz', '+420 601 100 200', ARRAY['koordinace','logistics','klientský servis'], 'Head koordinátor, 8 let zkušeností'),
  ('Lucie',  'Marková',  'interni', 'kuchar',      'lucie.markova@cateringld.cz',  '+420 602 200 300', ARRAY['česká kuchyně','grilování','dezerty'],       'Šéfkuchařka, specialistka na svatební rauty'),
  ('Ondřej', 'Blaha',    'externi', 'cisnik',      'ondrej.blaha@gmail.com',       '+420 776 400 500', ARRAY['víno','barman','fine dining'],               'Sommelier, brigádník na víkendy');

-- ── Zakázky ──────────────────────────────────────────────────

INSERT INTO zakazky (cislo, nazev, typ, stav, klient_id, datum_akce, cas_zacatek, cas_konec, misto, pocet_hostu, rozpocet_klienta, poznamka_klient, poznamka_interni)
VALUES
  ('ZAK-2026-001',
   'Svatba Nováková & Procházka',
   'svatba',
   'potvrzeno',
   (SELECT id FROM klienti WHERE email = 'tereza.novakova@email.cz'),
   '2026-07-18', '14:00', '23:00',
   'Zámek Kozel, Šťáhlavy u Plzně',
   80,
   180000,
   'Přejeme si teplý bufet + dezertní stůl. Alergii na ořechy má 5 hostů.',
   'Koordinace s cukrářem Novák – dort doveze v 15:00. Parkování pro 2 vozy zajistit.'
  ),
  ('ZAK-2026-002',
   'Team Building Dvořák & Partneři',
   'firemni_akce',
   've_priprave',
   (SELECT id FROM klienti WHERE email = 'dvorak@dvoparti.cz'),
   '2026-05-22', '11:00', '18:00',
   'Prostor 39, Bubenská 1, Praha 7',
   45,
   95000,
   'Oběd formou rautu, odpoledne kávový koutek s dezerty.',
   'Faktura na firmu, 30denní splatnost. Kontakt na místě: Petra Horáčková +420 731 000 111.'
  ),
  ('ZAK-2026-003',
   'Narozeninová oslava Králová 50',
   'soukroma_akce',
   'nabidka_odeslana',
   (SELECT id FROM klienti WHERE email = 'barbora.kralova@seznam.cz'),
   '2026-06-07', '18:30', '01:00',
   'Vila Richter, Praha – Hradčany',
   30,
   75000,
   'Degustační menu 6 chodů, párovanie s víny. Dresscode black tie.',
   'VIP klientka – vše první třídou. Objednány svíčky Diptyque, dodat do 17:00.'
  );

-- ── Šablony zakázek ──────────────────────────────────────────

INSERT INTO zakazky_sablony (nazev, popis, typ, cas_zacatek, cas_konec, misto, pocet_hostu, poznamka_klient, poznamka_interni) VALUES
  (
    'Svatební raut (80–120 hostů)',
    'Klasická svatba s teplým rautem, dezertem a evening servisem. Vhodné pro hrady, zámky a venkovní prostory.',
    'svatba',
    '14:00', '23:00',
    NULL,
    100,
    'Teplý bufet, dezertní stůl, evening snack po 21:00. Prosíme o sdělení alergií.',
    'Potvrdit finální počet hostů 14 dní před akcí. Zajistit parkování pro 2 servisní vozy.'
  ),
  (
    'Firemní konferenční catering (do 50 os.)',
    'Standardní balíček pro firemní akce – oběd + coffee break. Rychlé nasazení, faktura na firmu.',
    'firemni_akce',
    '09:00', '17:00',
    NULL,
    40,
    'Coffee break v 10:30, oběd rautem ve 12:30, odpolední coffee break ve 14:30.',
    'Faktura na IČO, 30denní splatnost. Potřebujeme kontakt na místě den před akcí.'
  ),
  (
    'VIP soukromá večeře (do 20 os.)',
    'Exkluzivní degustační menu, obsluha bílé rukavičky, sommelier. Pro privátní vily a penthouse.',
    'soukroma_akce',
    '19:00', '23:30',
    NULL,
    15,
    'Degustační menu 5–7 chodů, párování s víny na vyžádání. Dresscode dle přání hostitele.',
    'Koordinovat s sommelierem výběr vín. Příjezd a příprava 3 hod. před akcí.'
  );
