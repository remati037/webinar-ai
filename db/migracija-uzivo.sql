-- ============================================================
-- Ucesnici radionice uzivo (/uzivo). Upisuje ih Cloudflare Worker
-- (worker/src/index.js) ako mu je podesen DATABASE_URL.
-- Pokreni jednom u Neon SQL Editor-u. Bezbedno je pokrenuti vise puta.
-- Bez ove tabele platforma radi normalno, samo se ucesnici ne upisuju u Neon
-- (cela analitika gledanja je ionako u /studio > Analitika).
-- ============================================================
CREATE TABLE IF NOT EXISTS uzivo_ucesnici (
  id              BIGSERIAL PRIMARY KEY,
  vebinar         TEXT NOT NULL,
  uid             TEXT NOT NULL,
  ime             TEXT NOT NULL,
  email           TEXT NOT NULL,
  uredjaj         TEXT,
  izvor           TEXT,
  prijava_id      BIGINT REFERENCES prijave(id) ON DELETE SET NULL,
  ulazaka         INTEGER NOT NULL DEFAULT 1,
  prvi_ulaz       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  poslednji_ulaz  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uzivo_ucesnici_uniq ON uzivo_ucesnici (vebinar, email);
