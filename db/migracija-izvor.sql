-- ============================================================
-- Migracija: odakle je prijava stigla.
--
-- Pokreni JEDNOM u Neon SQL Editor-u (Vercel > Storage > Open in Neon
-- > SQL Editor). Bezbedno je pokrenuti vise puta, sve je IF NOT EXISTS.
-- Sajt radi i pre migracije: prijave prolaze, samo se izvor ne belezi.
--
-- Sta radi: prijave dobijaju kolone koje koristi stranica /analiza.
--  * izvor, medij, kampanja, oglas: utm_source / utm_medium /
--    utm_campaign / utm_content sa prvog dolaska na landing
--    (bez UTM-a: "facebook" ako ima fbclid, inace domen sa kog je dosao)
--  * zemlja: po IP adresi (Vercel zaglavlje), dvoslovni kod
--  * uredjaj: 'mobilni', 'tablet' ili 'racunar'
-- ============================================================

ALTER TABLE prijave ADD COLUMN IF NOT EXISTS izvor    TEXT;
ALTER TABLE prijave ADD COLUMN IF NOT EXISTS medij    TEXT;
ALTER TABLE prijave ADD COLUMN IF NOT EXISTS kampanja TEXT;
ALTER TABLE prijave ADD COLUMN IF NOT EXISTS oglas    TEXT;
ALTER TABLE prijave ADD COLUMN IF NOT EXISTS zemlja   TEXT;
ALTER TABLE prijave ADD COLUMN IF NOT EXISTS uredjaj  TEXT;

-- Provera
SELECT COALESCE(izvor, '(nema)') AS izvor, COUNT(*) FROM prijave GROUP BY 1 ORDER BY 2 DESC;
