INSERT INTO users (id, email, password_hash, display_name, avatar_url, is_moderator, created_at) VALUES
	('u1', 'piotr@foodia.net', '600000:7ecb9d9cd302894814e8381d35958161:774b53958a4daa17b5afbeb4b8cd04cee9f60e74c3a297d5de7ee3fe55c1520d', 'Piotr P.', NULL, 1, '2026-07-29T00:00:00Z'),
	('u2', 'ania@foodia.net', '600000:739bc36799d7a92ed07ecd3463c342b3:91af239fbc647bb6025a4ba6e59289e3f1e089ec0fd45b42af4f149336214a4e', 'Ania K.', NULL, 0, '2026-07-29T00:00:00Z');

INSERT INTO recipes (id, name, summary, description, hero_image, author_id, tags, diet_flags, required_equipment, time_minutes, cost_amount, cost_currency, kcal, protein_g, fat_g, carbs_g, up_count, down_count, source_locale, created_at, updated_at) VALUES
	('r1', 'Spaghetti Bolognese w 30 minut', 'Klasyczny sos mięsny na co dzień — bez godzinnego duszenia.', 'Szybka wersja tradycyjnego sosu bolognese, zoptymalizowana pod dzień powszedni: mniej duszenia, więcej smaku dzięki skoncentrowanemu przecierowi pomidorowemu i dobrze zredukowanemu winu.', '/recipes/bolognese.jpg', 'u1', '["włoskie","makaron","na-co-dzien"]', '[]', '[]', 30, 18, 'PLN', 620, 32, 22, 68, 41, 2, 'pl', '2026-01-10T00:00:00Z', '2026-06-01T00:00:00Z'),
	('r2', 'Owsianka na zimno (overnight oats)', 'Zero gotowania, gotowe rano — idealne do biura.', 'Przygotowywana wieczorem, gotowa do zjedzenia rano bez podgrzewania — dobrze się przechowuje i nie pachnie w biurowej kuchni.', '/recipes/oats.jpg', 'u2', '["sniadanie","do-biura","bez-gotowania"]', '["wegetariańskie"]', '["kitchenScale"]', 5, 4, 'PLN', 340, 12, 9, 52, 27, 1, NULL, '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'),
	('r3', 'Frytki z batatów z airfryera', 'Chrupiące, bez litra oleju — 15 minut, jeden sprzęt.', 'Szybki dodatek do obiadu, wymaga tylko airfryera — bez piekarnika, bez smażenia.', '/recipes/fries.jpg', 'u1', '["dodatek","airfryer","szybkie"]', '["wegańskie","bezglutenowe"]', '["airfryer"]', 15, 6, 'PLN', 210, 3, 5, 38, 18, 0, NULL, '2026-05-05T00:00:00Z', '2026-05-05T00:00:00Z');

INSERT INTO recipe_versions (id, recipe_id, label, parent_recipe_id) VALUES
	('r1::r1', 'r1', 'Klasyczna', NULL),
	('r1::r1v2', 'r1', 'Wegetariańska (soczewica)', 'r1');

INSERT INTO ingredients (id, recipe_id, order_index, name, quantity, unit, substitutable) VALUES
	('i1', 'r1', 0, 'Mięso mielone wołowo-wieprzowe', 400, 'g', 1),
	('i2', 'r1', 1, 'Passata pomidorowa', 500, 'ml', 0),
	('i3', 'r1', 2, 'Cebula', 1, 'szt', 0),
	('i4', 'r1', 3, 'Czosnek', 2, 'ząbki', 1),
	('i5', 'r1', 4, 'Spaghetti', 350, 'g', 1),
	('i6', 'r2', 0, 'Płatki owsiane', 50, 'g', 0),
	('i7', 'r2', 1, 'Mleko', 150, 'ml', 1),
	('i8', 'r2', 2, 'Jogurt naturalny', 100, 'g', 0),
	('i9', 'r2', 3, 'Miód', 1, 'łyżka', 0),
	('i10', 'r3', 0, 'Bataty', 500, 'g', 0),
	('i11', 'r3', 1, 'Oliwa z oliwek', 1, 'łyżka', 0),
	('i12', 'r3', 2, 'Papryka wędzona', 1, 'łyżeczka', 1);

INSERT INTO substitutions (id, for_ingredient_id, name, ratio, delta_macros, up_count, down_count, source, proposed_by_id) VALUES
	('s1', 'i1', 'Soczewica czerwona (namoczona)', 0.6, '{"kcal":-180,"proteinG":-14,"fatG":-18}', 12, 1, 'community', 'u2'),
	('s2', 'i4', 'Czosnek granulowany', 0.5, NULL, 0, 0, 'system', NULL),
	('s3', 'i5', 'Makaron pełnoziarnisty', 1, '{"carbsG":-6,"proteinG":2}', 0, 0, 'system', NULL),
	('s4', 'i7', 'Mleko owsiane', 1, NULL, 0, 0, 'system', NULL),
	('s6', 'i7', 'Mleko orzechowe (orzech laskowy)', 1, NULL, 5, 0, 'community', 'u2'),
	('s5', 'i12', 'Papryka słodka', 1, NULL, 0, 0, 'system', NULL);

INSERT INTO steps (id, recipe_id, order_index, text, duration_minutes, requires_equipment, ingredient_ids) VALUES
	('st1', 'r1', 0, 'Cebulę i czosnek drobno posiekaj, podsmaż na oliwie na złoty kolor.', NULL, NULL, '["i3","i4"]'),
	('st2', 'r1', 1, 'Dodaj mięso mielone, smaż aż się zrumieni.', 8, NULL, '["i1"]'),
	('st3', 'r1', 2, 'Wlej passatę, przypraw solą i pieprzem, duś pod przykryciem.', 15, NULL, '["i2"]'),
	('st4', 'r1', 3, 'Ugotuj spaghetti al dente w osolonej wodzie.', 9, '[]', '["i5"]'),
	('st5', 'r1', 4, 'Połącz makaron z sosem, podawaj od razu.', NULL, NULL, '["i5","i2"]'),
	('st6', 'r2', 0, 'Wszystkie składniki wymieszaj w słoiku.', NULL, NULL, '["i6","i7","i8","i9"]'),
	('st7', 'r2', 1, 'Odstaw w lodówce na noc (minimum 6 godzin).', 360, NULL, '[]'),
	('st8', 'r3', 0, 'Bataty pokrój w słupki, wymieszaj z oliwą i przyprawami.', NULL, NULL, '["i10","i11","i12"]'),
	('st9', 'r3', 1, 'Piecz w airfryerze w 200°C, potrząsając koszykiem w połowie.', 15, '["airfryer"]', '["i10"]');

INSERT INTO step_alternatives (id, for_step_id, text, requires_equipment, duration_minutes, up_count, down_count, source, proposed_by_id) VALUES
	('sa1', 'st9', 'Piecz w piekarniku nagrzanym do 220°C (termoobieg) przez 25 minut, obracając w połowie.', '["oven"]', 25, 14, 1, 'system', NULL),
	('sa2', 'st9', 'Smaż na patelni z odrobiną oleju na średnim ogniu, mieszając co kilka minut, aż się zarumienią.', NULL, NULL, 3, 2, 'community', 'u1');

INSERT INTO comments (id, recipe_id, target_type, target_id, content, visibility, author_id, up_count, down_count, created_at) VALUES
	('c1', 'r1', 'ingredient', 'i4', 'Dawajcie śmiało 4 ząbki zamiast 2 — dużo lepiej wychodzi.', 'public', 'u2', 9, 0, '2026-03-02T10:00:00Z'),
	('c2', 'r1', 'step', 'st3', 'Mój piekarnik... to znaczy garnek, potrzebuje tu 20 minut, a nie 15.', 'private', 'u1', 0, 0, '2026-04-11T18:20:00Z');

INSERT INTO translations (id, recipe_id, locale, fields, translated_by_id, up_count, down_count, created_at) VALUES
	('tr1', 'r1', 'en', '{"name":"Spaghetti Bolognese in 30 Minutes","summary":"A classic everyday meat sauce — no hour-long simmering required.","description":"A quick take on the traditional bolognese sauce, optimized for a weekday: less simmering, more flavor thanks to concentrated tomato paste and a well-reduced wine."}', 'u2', 6, 0, '2026-05-01T09:00:00Z'),
	('tr2', 'r1', 'pl', '{"summary":"Klasyczny sos mięsny na co dzień — szybciej niż myślisz."}', 'u1', 1, 3, '2026-05-10T09:00:00Z');
