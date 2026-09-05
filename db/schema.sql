-- ============================================================
-- Sema baze za referal sistem vebinara.
-- Pokrece se jednom, u Neon SQL Editor-u (Vercel > Storage > Open in Neon).
-- Bezbedno je pokrenuti vise puta: sve je IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS prijave (
  id                 BIGSERIAL PRIMARY KEY,

  -- podaci sa forme. Email se uvek upisuje malim slovima (normalizuje ga backend),
  -- pa obicno UNIQUE ogranicenje ispod hvata i "Pera@Gmail.com" i "pera@gmail.com".
  email              TEXT NOT NULL UNIQUE,
  ime                TEXT NOT NULL,
  prezime            TEXT,
  telefon            TEXT,

  -- referal
  ref_kod            TEXT NOT NULL,          -- kod koji OVAJ korisnik deli drugima
  token              TEXT NOT NULL,          -- tajni kljuc za /hvala?k=...
  ref_od_id          BIGINT REFERENCES prijave(id) ON DELETE SET NULL,

  -- status: 'prijavljen' dok ne potvrdi email, 'potvrdjen' kad jeste.
  -- Dok je double opt-in u MailerLite-u iskljucen, svi su odmah 'potvrdjen'.
  status             TEXT NOT NULL DEFAULT 'potvrdjen',

  -- dijagnostika
  mailerlite_ok      BOOLEAN NOT NULL DEFAULT FALSE,
  mailerlite_greska  TEXT,
  ip                 TEXT,

  kreirano           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  azurirano          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS prijave_ref_kod_uniq ON prijave (ref_kod);
CREATE UNIQUE INDEX IF NOT EXISTS prijave_token_uniq   ON prijave (token);

-- Brojanje referala ide preko ovog indeksa.
CREATE INDEX IF NOT EXISTS prijave_ref_od_idx ON prijave (ref_od_id);
CREATE INDEX IF NOT EXISTS prijave_ip_idx     ON prijave (ip, kreirano);
