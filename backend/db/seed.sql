-- ============================================================
-- Catering LD CRM – Demo data (seed)
-- Heslo pro všechny demo uživatele: Demo1234!
-- ============================================================

-- Uživatelé (heslo: Demo1234!)
INSERT INTO uzivatele (jmeno, prijmeni, email, heslo_hash, role, telefon) VALUES
  ('Lucie',   'Dvořáčková', 'l.dvorackova@catering-ld.cz', crypt('Demo1234!', gen_salt('bf')), 'admin',     '+420 724 000 001'),
  ('Jana',    'Nováčková',  'j.novackova@catering-ld.cz',  crypt('Demo1234!', gen_salt('bf')), 'obchodnik', '+420 724 111 222'),
  ('Petr',    'Kratochvíl', 'p.kratochvil@catering-ld.cz', crypt('Demo1234!', gen_salt('bf')), 'obchodnik', '+420 724 333 444'),
  ('Martina', 'Horáková',   'm.horakova@catering-ld.cz',   crypt('Demo1234!', gen_salt('bf')), 'obchodnik', '+420 724 555 666'),
  ('Pavel',   'Dostál',     'p.dostal@catering-ld.cz',     crypt('Demo1234!', gen_salt('bf')), 'provoz',    '+420 603 700 800');

-- Klienti
INSERT INTO klienti (jmeno, prijmeni, firma, typ, email, telefon, adresa, zdroj, poznamka, obchodnik_id) VALUES
  ('Jana',    'Nováková',  '',                    'vip',      'j.novakova@email.cz',       '+420 777 123 456', 'Mánesova 12, Praha 2',                         'Doporučení', 'VIP klientka – prioritní obsluha. Bezlepková varianta pro 8 hostů.', 2),
  ('DataTech','s.r.o.',    'DataTech s.r.o.',     'firemni',  'akce@datatech.cz',          '+420 485 200 300', 'Průmyslová 5, Liberec',                        'Web / Google','Kontaktní osoba: Ing. Martin Dvořák', 3),
  ('Pavel',   'Beneš',     '',                    'soukromy', 'p.benes@volny.cz',          '+420 603 456 789', 'Soukenné nám. 3, Liberec',                     'Doporučení', '', 2),
  ('Škoda',   'Auto a.s.', 'Škoda Auto a.s.',     'firemni',  'catering@skoda-auto.cz',    '+420 326 811 111', 'tř. Václava Klementa 869, Mladá Boleslav',     'Veletrh',    'Rámcová smlouva platná do 12/2026.', 3),
  ('Preciosa','a.s.',       'Preciosa a.s.',       'firemni',  'marketing@preciosa.com',    '+420 485 119 111', 'Opletalova 3197/17, Jablonec nad Nisou',       'Doporučení', 'Preferují studený bufet.', 2),
  ('Syner',   's.r.o.',    'Syner s.r.o.',        'firemni',  'hr@syner.cz',               '+420 485 900 200', 'Stará Kysibelská 45, Liberec',                 'Web / Google','', 4),
  ('Tereza',  'Horáková',  '',                    'soukromy', 't.horakova@gmail.com',      '+420 731 888 999', 'Husova 22, Jablonec nad Nisou',                'Sociální sítě','', 2),
  ('LBH',     'konference','LBH konference s.r.o.','firemni', 'info@lbh.cz',              '+420 485 777 100', 'náměstí Dr. E. Beneše 22, Liberec',           'Doporučení', 'Opakující se klient – konference 2× ročně.', 4);

-- Ceník
INSERT INTO cenik (nazev, kategorie, jednotka, cena_nakup, cena_prodej, dph_sazba) VALUES
  -- Jídlo
  ('Předkrm – výběr ze 3 variant',      'jidlo',    'os.',   65, 120,  12),
  ('Hlavní chod vč. přílohy',           'jidlo',    'os.',  155, 280,  12),
  ('Dezert',                            'jidlo',    'os.',   45,  90,  12),
  ('Noční raut',                        'jidlo',    'os.',   80, 150,  12),
  ('Studený bufet – standard',          'jidlo',    'os.',  110, 195,  12),
  ('Vegetariánské menu',                'jidlo',    'os.',   90, 175,  12),
  ('Bezlepkové menu (příplatek)',        'jidlo',    'os.',   25,  45,  12),
  ('Dětské menu',                       'jidlo',    'os.',   55,  95,  12),
  -- Nápoje
  ('Víno bílé / červené',               'napoje',   'láhev', 90, 180, 21),
  ('Sekt – přípitek',                   'napoje',   'láhev',110, 220, 21),
  ('Nealkoholické nápoje',              'napoje',   'os.',   25,  60, 21),
  ('Káva a čaj – komplet',              'napoje',   'os.',   20,  45, 21),
  -- Personál
  ('Číšník / servírka',                 'personal', 'hod.', 110, 180, 21),
  ('Kuchař',                            'personal', 'hod.', 155, 250, 21),
  ('Koordinátor akce',                  'personal', 'hod.', 200, 350, 21),
  ('Barman',                            'personal', 'hod.', 130, 220, 21),
  ('Pomocná síla',                      'personal', 'hod.',  80, 140, 21),
  -- Doprava
  ('Doprava dodávkou',                  'doprava',  'km',     8,  18, 21),
  ('Chlazený transport',                'doprava',  'km',    12,  24, 21),
  ('Paušál za jízdu (do 30 km)',        'doprava',  'pauš.',300, 600, 21),
  -- Vybavení
  ('Stůl + 8 židlí (sada)',             'vybaveni', 'ks',    45, 120, 21),
  ('Ubrus + ubrousky (sada)',           'vybaveni', 'stůl',  40,  85, 21),
  ('Dekorace stolů – standard',         'vybaveni', 'pauš.',2200,4500,21),
  -- Pronájem
  ('Pronájem bistra (polodenní)',       'pronajem', 'pauš.',3000,6500, 21),
  ('Pronájem bistra (celodenní)',       'pronajem', 'pauš.',5000,11000,21);

-- Personál
INSERT INTO personal (jmeno, prijmeni, typ, role, email, telefon, specializace) VALUES
  ('Jana',     'Nováčková',  'interni',  'koordinator', 'j.novackova@catering-ld.cz',  '+420 724 111 222', ARRAY['Koordinace','Obchod','Svatby']),
  ('Petr',     'Kratochvíl', 'interni',  'koordinator', 'p.kratochvil@catering-ld.cz', '+420 724 333 444', ARRAY['Koordinace','Firemní akce','Bistro']),
  ('Martina',  'Horáková',   'interni',  'koordinator', 'm.horakova@catering-ld.cz',   '+420 724 555 666', ARRAY['Koordinace','Závoz']),
  ('Tomáš',    'Veselý',     'interni',  'cisnik',      't.vesely@catering-ld.cz',     '+420 603 100 200', ARRAY['Servírování','Fine dining']),
  ('Lucie',    'Marková',    'interni',  'cisnik',      'l.markova@catering-ld.cz',    '+420 603 300 400', ARRAY['Servírování','Koktejlový bar']),
  ('Karel',    'Novák',      'interni',  'kuchar',      'k.novak@catering-ld.cz',      '+420 603 500 600', ARRAY['Studená kuchyně','Vegetariánská kuchyně']),
  ('Pavel',    'Dostál',     'interni',  'ridic',       'p.dostal@catering-ld.cz',     '+420 603 700 800', ARRAY['Dodávka do 3,5t','Chlazený transport']),
  ('Michaela', 'Růžičková',  'externi',  'barman',      'm.ruzickova@gmail.com',        '+420 777 900 100', ARRAY['Barmanství','Koktejly']),
  ('Jiří',     'Šimánek',    'externi',  'cisnik',      'jiri.simanek@volny.cz',        '+420 777 200 300', ARRAY['Servírování','Letní akce']);

-- Zakázky
INSERT INTO zakazky (cislo, nazev, typ, stav, klient_id, obchodnik_id, datum_akce, misto, pocet_hostu, cena_celkem) VALUES
  ('ZAK-2026-041', 'Svatba Novák – Malá',          'svatba',       'potvrzeno',         1, 2, '2026-06-14', 'Zámek Sychrov',              80, 143360),
  ('ZAK-2026-040', 'Firemní večírek DataTech',      'firemni_akce', 'ceka_na_vyjadreni', 2, 3, '2026-05-28', 'DataTech HQ, Liberec',        60,  74500),
  ('ZAK-2026-039', 'Narozeninový raut – Beneš',     'soukroma_akce','nabidka_pripravena',3, 2, '2026-04-22', 'Restaurace Zlatá hvězda',     30,  31200),
  ('ZAK-2026-038', 'Závoz – LBH konference',        'zavoz',        've_priprave',        8, 4, '2026-03-18', 'Liberec, Centrum Babylon',   120,  18500),
  ('ZAK-2026-037', 'Pronájem bistra – Škoda',       'bistro',       'potvrzeno',          4, 3, '2026-04-05', 'Škoda Auto, areál',           40,  11000),
  ('ZAK-2026-035', 'Teambuilding – Syner',          'firemni_akce', 'nabidka_odeslana',   6, 4, '2026-05-15', 'Hrad Grabštejn',              45,  87500),
  ('ZAK-2026-029', 'Firemní večírek – Preciosa',    'firemni_akce', 'ceka_na_vyjadreni',  5, 2, '2026-05-08', 'Zámek Lemberk',               90, 112000);
