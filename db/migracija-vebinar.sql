-- ============================================================
-- Migracija: prijave se vezuju za konkretan vebinar.
--
-- Pokreni JEDNOM u Neon SQL Editor-u, PRE nego sto deployujes novu
-- verziju sajta (Vercel > Storage > Open in Neon > SQL Editor).
-- Bezbedno je pokrenuti vise puta.
--
-- Sta radi:
--  * svim postojecim prijavama upisuje vebinar = '2026-09-14'
--    (nista se ne brise, prvi vebinar ostaje u bazi kakav je bio)
--  * email vise nije jedinstven u celoj tabeli, nego po vebinaru,
--    pa ista osoba moze da se prijavi i na novi vebinar i dobija
--    nov referal kod i novu, praznu tabelu preporuka
-- ============================================================

ALTER TABLE prijave
  ADD COLUMN IF NOT EXISTS vebinar TEXT NOT NULL DEFAULT '2026-09-14';

-- Podrazumevanu vrednost sklanjamo, da bi svaki novi upis morao
-- eksplicitno da kaze za koji vebinar je (to radi api/prijava.js).
ALTER TABLE prijave ALTER COLUMN vebinar DROP DEFAULT;

-- Staro pravilo "jedan email u celoj tabeli".
ALTER TABLE prijave DROP CONSTRAINT IF EXISTS prijave_email_key;

-- Novo pravilo "jedan email po vebinaru". Na njega se oslanja
-- ON CONFLICT (vebinar, email) u api/prijava.js.
CREATE UNIQUE INDEX IF NOT EXISTS prijave_vebinar_email_uniq ON prijave (vebinar, email);
CREATE INDEX IF NOT EXISTS prijave_vebinar_idx ON prijave (vebinar, kreirano);

-- Provera: koliko prijava ima po vebinaru.
SELECT vebinar, COUNT(*) AS prijava FROM prijave GROUP BY vebinar ORDER BY vebinar;
