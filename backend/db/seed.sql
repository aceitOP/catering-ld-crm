-- ============================================================
-- Catering LD CRM - Demo data (seed)
-- Heslo pro vsechny demo uzivatele: Demo1234!
-- ============================================================

-- Uzivatele
INSERT INTO uzivatele (jmeno, prijmeni, email, heslo_hash, role, telefon) VALUES
  ('Lucie', 'Dvorackova', 'l.dvorackova@catering-ld.cz', crypt('Demo1234!', gen_salt('bf')), 'admin', '+420 724 000 001'),
  ('Jana', 'Novackova', 'j.novackova@catering-ld.cz', crypt('Demo1234!', gen_salt('bf')), 'obchodnik', '+420 724 111 222'),
  ('Petr', 'Kratochvil', 'p.kratochvil@catering-ld.cz', crypt('Demo1234!', gen_salt('bf')), 'obchodnik', '+420 724 333 444'),
  ('Martina', 'Horakova', 'm.horakova@catering-ld.cz', crypt('Demo1234!', gen_salt('bf')), 'obchodnik', '+420 724 555 666'),
  ('Pavel', 'Dostal', 'p.dostal@catering-ld.cz', crypt('Demo1234!', gen_salt('bf')), 'provoz', '+420 603 700 800');

-- Klienti
INSERT INTO klienti (jmeno, prijmeni, firma, typ, email, telefon, adresa, zdroj, poznamka, obchodnik_id) VALUES
  ('Jana', 'Novakova', '', 'vip', 'j.novakova@email.cz', '+420 777 123 456', 'Manesova 12, Praha 2', 'Doporuceni', 'VIP klientka. Bezlepkova varianta pro 8 hostu.', 2),
  ('DataTech', 's.r.o.', 'DataTech s.r.o.', 'firemni', 'akce@datatech.cz', '+420 485 200 300', 'Prumyslova 5, Liberec', 'Web / Google', 'Kontaktni osoba: Ing. Martin Dvorak', 3),
  ('Pavel', 'Benes', '', 'soukromy', 'p.benes@volny.cz', '+420 603 456 789', 'Soukenne nam. 3, Liberec', 'Doporuceni', '', 2),
  ('Skoda', 'Auto a.s.', 'Skoda Auto a.s.', 'firemni', 'catering@skoda-auto.cz', '+420 326 811 111', 'tr. Vaclava Klementa 869, Mlada Boleslav', 'Veletrh', 'Ramcova smlouva platna do 12/2026.', 3),
  ('Preciosa', 'a.s.', 'Preciosa a.s.', 'firemni', 'marketing@preciosa.com', '+420 485 119 111', 'Opletalova 3197/17, Jablonec nad Nisou', 'Doporuceni', 'Preferuji studeny bufet.', 2),
  ('Syner', 's.r.o.', 'Syner s.r.o.', 'firemni', 'hr@syner.cz', '+420 485 900 200', 'Stara Kysibelska 45, Liberec', 'Web / Google', '', 4),
  ('Tereza', 'Horakova', '', 'soukromy', 't.horakova@gmail.com', '+420 731 888 999', 'Husova 22, Jablonec nad Nisou', 'Socialni site', '', 2),
  ('LBH', 'konference', 'LBH konference s.r.o.', 'firemni', 'info@lbh.cz', '+420 485 777 100', 'namesti Dr. E. Benese 22, Liberec', 'Doporuceni', 'Opakujici se klient - konference 2x rocne.', 4);

-- Cenik
INSERT INTO cenik (nazev, kategorie, jednotka, cena_nakup, cena_prodej, dph_sazba) VALUES
  ('Predkrm - vyber ze 3 variant', 'jidlo', 'os.', 65, 120, 12),
  ('Hlavni chod vc. prilohy', 'jidlo', 'os.', 155, 280, 12),
  ('Dezert', 'jidlo', 'os.', 45, 90, 12),
  ('Nocni raut', 'jidlo', 'os.', 80, 150, 12),
  ('Studeny bufet - standard', 'jidlo', 'os.', 110, 195, 12),
  ('Vegetarianske menu', 'jidlo', 'os.', 90, 175, 12),
  ('Bezlepkove menu (priplatek)', 'jidlo', 'os.', 25, 45, 12),
  ('Detske menu', 'jidlo', 'os.', 55, 95, 12),
  ('Vino bile / cervene', 'napoje', 'lahev', 90, 180, 21),
  ('Sekt - pripitek', 'napoje', 'lahev', 110, 220, 21),
  ('Nealkoholicke napoje', 'napoje', 'os.', 25, 60, 21),
  ('Kava a caj - komplet', 'napoje', 'os.', 20, 45, 21),
  ('Cisnik / servirka', 'personal', 'hod.', 110, 180, 21),
  ('Kuchar', 'personal', 'hod.', 155, 250, 21),
  ('Koordinator akce', 'personal', 'hod.', 200, 350, 21),
  ('Barman', 'personal', 'hod.', 130, 220, 21),
  ('Pomocna sila', 'personal', 'hod.', 80, 140, 21),
  ('Doprava dodavkou', 'doprava', 'km', 8, 18, 21),
  ('Chlazeny transport', 'doprava', 'km', 12, 24, 21),
  ('Pausal za jizdu (do 30 km)', 'doprava', 'paus.', 300, 600, 21),
  ('Stul + 8 zidli (sada)', 'vybaveni', 'ks', 45, 120, 21),
  ('Ubrus + ubrousky (sada)', 'vybaveni', 'stul', 40, 85, 21),
  ('Dekorace stolu - standard', 'vybaveni', 'paus.', 2200, 4500, 21),
  ('Pronajem bistra (pulden)', 'pronajem', 'paus.', 3000, 6500, 21),
  ('Pronajem bistra (celoden)', 'pronajem', 'paus.', 5000, 11000, 21);

-- Personal
INSERT INTO personal (jmeno, prijmeni, typ, role, email, telefon, specializace) VALUES
  ('Jana', 'Novackova', 'interni', 'koordinator', 'j.novackova@catering-ld.cz', '+420 724 111 222', ARRAY['Koordinace','Obchod','Svatby']),
  ('Petr', 'Kratochvil', 'interni', 'koordinator', 'p.kratochvil@catering-ld.cz', '+420 724 333 444', ARRAY['Koordinace','Firemni akce','Bistro']),
  ('Martina', 'Horakova', 'interni', 'koordinator', 'm.horakova@catering-ld.cz', '+420 724 555 666', ARRAY['Koordinace','Zavoz']),
  ('Tomas', 'Vesely', 'interni', 'cisnik', 't.vesely@catering-ld.cz', '+420 603 100 200', ARRAY['Servirovani','Fine dining']),
  ('Lucie', 'Markova', 'interni', 'cisnik', 'l.markova@catering-ld.cz', '+420 603 300 400', ARRAY['Servirovani','Koktejlovy bar']),
  ('Karel', 'Novak', 'interni', 'kuchar', 'k.novak@catering-ld.cz', '+420 603 500 600', ARRAY['Studena kuchyne','Vegetarianska kuchyne']),
  ('Pavel', 'Dostal', 'interni', 'ridic', 'p.dostal@catering-ld.cz', '+420 603 700 800', ARRAY['Dodavka do 3,5t','Chlazeny transport']),
  ('Michaela', 'Ruzickova', 'externi', 'barman', 'm.ruzickova@gmail.com', '+420 777 900 100', ARRAY['Barmanstvi','Koktejly']),
  ('Jiri', 'Simanek', 'externi', 'cisnik', 'jiri.simanek@volny.cz', '+420 777 200 300', ARRAY['Servirovani','Letni akce']);

-- Zakazky
INSERT INTO zakazky (cislo, nazev, typ, stav, klient_id, obchodnik_id, datum_akce, misto, pocet_hostu, cena_celkem) VALUES
  ('ZAK-2026-041', 'Svatba Novak - Mala', 'svatba', 'potvrzeno', 1, 2, '2026-06-14', 'Zamek Sychrov', 80, 143360),
  ('ZAK-2026-040', 'Firemni vecirek DataTech', 'firemni_akce', 'ceka_na_vyjadreni', 2, 3, '2026-05-28', 'DataTech HQ, Liberec', 60, 74500),
  ('ZAK-2026-039', 'Narozeninovy raut - Benes', 'soukroma_akce', 'nabidka_pripravena', 3, 2, '2026-04-22', 'Restaurace Zlata hvezda', 30, 31200),
  ('ZAK-2026-038', 'Zavoz - LBH konference', 'zavoz', 've_priprave', 8, 4, '2026-03-18', 'Liberec, Centrum Babylon', 120, 18500),
  ('ZAK-2026-037', 'Pronajem bistra - Skoda', 'bistro', 'potvrzeno', 4, 3, '2026-04-05', 'Skoda Auto, areal', 40, 11000),
  ('ZAK-2026-035', 'Teambuilding - Syner', 'firemni_akce', 'nabidka_odeslana', 6, 4, '2026-05-15', 'Hrad Grabstejn', 45, 87500),
  ('ZAK-2026-029', 'Firemni vecirek - Preciosa', 'firemni_akce', 'ceka_na_vyjadreni', 5, 2, '2026-05-08', 'Zamek Lemberk', 90, 112000);

-- Venue Logistics Twin
INSERT INTO venues (name, slug, address_line_1, city, postal_code, country, general_notes, status, created_by, updated_by) VALUES
  ('Grand Hotel Meridian Congress', 'grand-hotel-meridian-congress', 'Nabrezi 18', 'Praha', '110 00', 'CZ', 'Hotelove kongresove centrum. Loading dock zezadu z ulice Na Florenci, servisni vytah sdileny s housekeeping.', 'active', 1, 1),
  ('Galerie Sever Event Hall', 'galerie-sever-event-hall', 'Kollarova 7', 'Liberec', '460 01', 'CZ', 'Mestska galerie bez loading docku. Vstup pres bocni dvere, rucni transport pres recepci.', 'active', 1, 1);

INSERT INTO venue_contacts (venue_id, name, role, phone, email, availability_notes, is_primary, notes) VALUES
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'Andrea Mala', 'venue_manager', '+420 602 111 222', 'events@meridian.cz', 'Po-Pa 8:00-18:00', true, 'Potvrzuje layout a service elevator sloty.'),
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'Security desk Meridian', 'security', '+420 222 444 555', 'security@meridian.cz', '24/7', true, 'Pri prijezdu chteji seznam SPZ a jmen.'),
  ((SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'), 'Lenka Tomesova', 'venue_manager', '+420 777 200 900', 'produkce@galeriesever.cz', 'Po-Ne dle event kalendare', true, 'Schvaluje dekorace a timeline.'),
  ((SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'), 'Recepce Galerie Sever', 'reception', '+420 485 300 111', 'recepce@galeriesever.cz', 'Po-Ne 9:00-20:00', true, 'Pres recepci se hlasi dodavka i staff.');

INSERT INTO venue_access_rules (
  venue_id, title, applies_to_days, delivery_window_start, delivery_window_end, check_in_point,
  security_check_required, avg_security_minutes, badge_required, manifest_required, manifest_lead_time_hours,
  escort_required, vehicle_registration_required, service_elevator_only, notes, is_default, last_verified_at, verification_source
) VALUES
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'Hotel event delivery window', '1,2,3,4,5,6,0', '07:00', '10:30', 'Security gate B', true, 22, true, true, 24, false, true, true, 'Po 10:30 se dodavky posilaji pres recepci a zdrzeni roste.', true, NOW() - INTERVAL '14 days', 'manual'),
  ((SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'), 'Gallery side-door access', '1,2,3,4,5,6,0', '08:00', '15:00', 'Bocni vstup od recepce', false, 5, false, false, NULL, true, false, false, 'Pri vernisazi nutny doprovod produkce galerie.', true, NOW() - INTERVAL '45 days', 'manual');

INSERT INTO venue_loading_zones (
  venue_id, name, description, arrival_instructions, booking_required, booking_contact,
  max_vehicle_height_cm, max_vehicle_length_cm, weight_limit_kg, unloading_time_limit_min,
  distance_to_service_area_min, notes, is_default
) VALUES
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'Rear loading dock', 'Kryty loading dock pro 2 dodavky.', 'Vjezd zezadu z ulice Na Florenci, zastavit u rampy 2.', true, 'events@meridian.cz', 320, 850, 3500, 25, 9, 'Pri soubehu s hotel cateringem se ceka na slot.', true);

INSERT INTO venue_service_areas (
  venue_id, name, floor, capacity, has_power_access, has_water_access, has_cold_storage_access, notes
) VALUES
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'Ballroom A', '1', 220, true, true, true, 'Backstage zazemi za salem.'),
  ((SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'), 'Main Hall', '2', 140, true, false, false, 'Vysoky strop, omezeni dekoraci u sten.');

INSERT INTO venue_routes (
  venue_id, from_loading_zone_id, to_service_area_id, name, estimated_walk_minutes, stairs_count,
  elevator_required, route_difficulty, notes, is_default
) VALUES
  (
    (SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'),
    (SELECT id FROM venue_loading_zones WHERE venue_id = (SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress') LIMIT 1),
    (SELECT id FROM venue_service_areas WHERE venue_id = (SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress') LIMIT 1),
    'Loading dock -> service elevator -> Ballroom A', 12, 0, true, 'medium', 'Vytah sdileny s housekeeping, rano se tvori fronta.', true
  ),
  (
    (SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'),
    NULL,
    (SELECT id FROM venue_service_areas WHERE venue_id = (SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall') LIMIT 1),
    'Side entrance -> reception corridor -> Main Hall', 8, 12, false, 'high', 'Rucni transport po schodech, bez servisniho vytahu.', true
  );

INSERT INTO venue_route_steps (route_id, step_index, instruction, checkpoint_type, estimated_minutes, notes) VALUES
  ((SELECT id FROM venue_routes WHERE name = 'Loading dock -> service elevator -> Ballroom A' LIMIT 1), 1, 'Prihlasit se na Security gate B a nahlasit event name.', 'security', 4, 'Pripravit manifest a SPZ.'),
  ((SELECT id FROM venue_routes WHERE name = 'Loading dock -> service elevator -> Ballroom A' LIMIT 1), 2, 'Z loading docku pokracovat ke service elevator SE-2.', 'elevator', 3, 'Vytah byva obsazen housekeepingem.'),
  ((SELECT id FROM venue_routes WHERE name = 'Loading dock -> service elevator -> Ballroom A' LIMIT 1), 3, 'Po vystupu z vytahu odbocit vlevo do backstage Ballroom A.', 'service_area', 5, 'Posledni chodba je uzka.'),
  ((SELECT id FROM venue_routes WHERE name = 'Side entrance -> reception corridor -> Main Hall' LIMIT 1), 1, 'Zastavit u bocnich dveri a zazvonit na recepci.', 'entry', 2, 'Bez upozorneni se dele ceka.'),
  ((SELECT id FROM venue_routes WHERE name = 'Side entrance -> reception corridor -> Main Hall' LIMIT 1), 2, 'Projit kolem recepce po chodbe do praveho kridla.', 'corridor', 3, 'Behem otevreni galerie byva chodba plna navstevniku.'),
  ((SELECT id FROM venue_routes WHERE name = 'Side entrance -> reception corridor -> Main Hall' LIMIT 1), 3, 'Vynest material po schodisti do Main Hall.', 'stairs', 3, 'Nejcastejsi bottleneck pri setupu.');

INSERT INTO venue_restrictions (
  venue_id, category, severity, title, description, applies_to_area_id, notes, last_verified_at
) VALUES
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'security', 'critical', 'Manifest 24h predem', 'Seznam osob a SPZ musi byt nahlasen 24 hodin pred prijezdem.', NULL, 'Bez manifestu security nepusti dodavku k rampe.', NOW() - INTERVAL '14 days'),
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'vendor_access', 'warning', 'Pouze service elevator', 'Prevoz gastro vybaveni jen servisnim vytahem.', (SELECT id FROM venue_service_areas WHERE name = 'Ballroom A' LIMIT 1), 'Osobni vytahy jsou zakazane.', NOW() - INTERVAL '14 days'),
  ((SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'), 'open_fire', 'critical', 'Zakaz otevreneho ohne', 'Svicky, flambovani a jakykoli otevreny ohen jsou zakazane.', (SELECT id FROM venue_service_areas WHERE name = 'Main Hall' LIMIT 1), 'Plati i pro dekoracni svicky.', NOW() - INTERVAL '45 days'),
  ((SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'), 'decorations', 'critical', 'Dekorace jen bez lepeni na steny', 'Nesmi se vrtat ani lepit dekorace primo na galerijni steny.', (SELECT id FROM venue_service_areas WHERE name = 'Main Hall' LIMIT 1), 'Pouze samonosne dekorace.', NOW() - INTERVAL '45 days');

INSERT INTO venue_parking_options (
  venue_id, vehicle_type, location_description, reservation_required, paid, price_notes,
  walking_minutes_to_venue, overnight_allowed, capacity_notes, notes
) VALUES
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'van', 'Hotelove servisni stani u loading docku', true, false, 'Slot se rezervuje pres events team.', 2, false, 'Max 2 dodavky soucasne.', 'Po vylozeni je nutne dodavku preparkovat.'),
  ((SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'), 'mixed', 'Mestske parkoviste P3 za radnici', false, true, 'Bezny mestsky tarif.', 6, false, 'Vecer byva obsazeno, pro van problematicke.', 'Primo u galerie je jen kratke zastaveni.');

INSERT INTO venue_connectivity_zones (
  venue_id, zone_name, signal_quality, wifi_available, wifi_notes, dead_spot, notes, last_verified_at
) VALUES
  ((SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'), 'Service elevator lobby', 'weak', true, 'Guest Wi-Fi nepokryva technicke zazemi.', true, 'Mobilni signal pada u servisniho vytahu.', NOW() - INTERVAL '12 days'),
  ((SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'), 'Back wall of Main Hall', 'none', false, NULL, true, 'U zadni steny pada LTE i hovory.', NOW() - INTERVAL '38 days');

UPDATE zakazky
SET venue_id = (SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'),
    venue_loading_zone_id = (SELECT id FROM venue_loading_zones WHERE venue_id = (SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress') LIMIT 1),
    venue_service_area_id = (SELECT id FROM venue_service_areas WHERE name = 'Ballroom A' LIMIT 1),
    venue_route_id = (SELECT id FROM venue_routes WHERE name = 'Loading dock -> service elevator -> Ballroom A' LIMIT 1),
    misto = 'Grand Hotel Meridian Congress, Praha'
WHERE cislo = 'ZAK-2026-040';

UPDATE zakazky
SET venue_id = (SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'),
    venue_service_area_id = (SELECT id FROM venue_service_areas WHERE name = 'Main Hall' LIMIT 1),
    venue_route_id = (SELECT id FROM venue_routes WHERE name = 'Side entrance -> reception corridor -> Main Hall' LIMIT 1),
    misto = 'Galerie Sever Event Hall, Liberec'
WHERE cislo = 'ZAK-2026-029';

INSERT INTO venue_observations (
  venue_id, event_id, category, title, description, severity, measured_minutes, happened_at,
  created_by, source, is_verified, recurring_key, propose_master_update, proposal_status
) VALUES
  (
    (SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'),
    (SELECT id FROM zakazky WHERE cislo = 'ZAK-2026-040'),
    'security', 'Security check 20+ min', 'Ranni security check trval 24 minut kvuli kontrole manifestu.', 'warning', 24, NOW() - INTERVAL '21 days',
    1, 'manual', true, 'security_delay_20_plus', false, 'none'
  ),
  (
    (SELECT id FROM venues WHERE slug = 'grand-hotel-meridian-congress'),
    (SELECT id FROM zakazky WHERE cislo = 'ZAK-2026-038'),
    'connectivity', 'Slaby signal u service elevator', 'V lobby servisniho vytahu vypadavaji hovory i data.', 'warning', NULL, NOW() - INTERVAL '12 days',
    5, 'manual', true, 'connectivity_service_elevator', false, 'none'
  ),
  (
    (SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'),
    (SELECT id FROM zakazky WHERE cislo = 'ZAK-2026-029'),
    'route', 'Bottleneck na trase', 'Schodiste do Main Hall zpomalilo setup a rucni noseni.', 'warning', 16, NOW() - INTERVAL '30 days',
    1, 'manual', true, 'route_bottleneck', false, 'none'
  ),
  (
    (SELECT id FROM venues WHERE slug = 'galerie-sever-event-hall'),
    (SELECT id FROM zakazky WHERE cislo = 'ZAK-2026-039'),
    'restriction', 'Nove zjistena restrikce', 'Galerie nepovolila zaveseni dekoraci na okenni ramy.', 'critical', NULL, NOW() - INTERVAL '18 days',
    2, 'manual', true, 'restriction_window_frames', true, 'pending'
  );
