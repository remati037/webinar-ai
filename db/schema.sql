-- ============================================================
-- Sema baze za referal sistem vebinara.
-- Pokrece se jednom, u Neon SQL Editor-u (Vercel > Storage > Open in Neon).
-- Bezbedno je pokrenuti vise puta: sve je IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS prijave (
  id                 BIGSERIAL PRIMARY KEY,

  -- za koji vebinar je prijava, npr. '2026-11-16' (VEBINAR u api/_lib.js)
  vebinar            TEXT NOT NULL,

  -- podaci sa forme. Email se uvek upisuje malim slovima (normalizuje ga backend),
  -- pa jedinstveni indeks (vebinar, email) ispod hvata i "Pera@Gmail.com" i "pera@gmail.com".
  email              TEXT NOT NULL,
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

-- Postojeca baza iz septembra: ne pokreci ovo, nego db/migracija-vebinar.sql.
CREATE UNIQUE INDEX IF NOT EXISTS prijave_vebinar_email_uniq ON prijave (vebinar, email);
CREATE INDEX IF NOT EXISTS prijave_vebinar_idx ON prijave (vebinar, kreirano);
CREATE UNIQUE INDEX IF NOT EXISTS prijave_ref_kod_uniq ON prijave (ref_kod);
CREATE UNIQUE INDEX IF NOT EXISTS prijave_token_uniq   ON prijave (token);

-- Brojanje referala ide preko ovog indeksa.
CREATE INDEX IF NOT EXISTS prijave_ref_od_idx ON prijave (ref_od_id);
CREATE INDEX IF NOT EXISTS prijave_ip_idx     ON prijave (ip, kreirano);

-- ---------- A/B test forme (vidi db/migracija-ab.sql) ----------
ALTER TABLE prijave ADD COLUMN IF NOT EXISTS varijanta TEXT;
CREATE INDEX IF NOT EXISTS prijave_varijanta_idx ON prijave (vebinar, varijanta);

CREATE TABLE IF NOT EXISTS ab_dogadjaji (
  id           BIGSERIAL PRIMARY KEY,
  vebinar      TEXT NOT NULL,
  varijanta    TEXT NOT NULL,
  dogadjaj     TEXT NOT NULL,
  posetilac    TEXT NOT NULL,
  kreirano     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ab_dogadjaji_uniq ON ab_dogadjaji (vebinar, posetilac, dogadjaj);
CREATE INDEX IF NOT EXISTS ab_dogadjaji_idx ON ab_dogadjaji (vebinar, varijanta, dogadjaj);
