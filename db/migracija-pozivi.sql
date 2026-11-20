-- ============================================================
-- Zahtevi za poziv iz popupa na /ponuda i /ponuda-2.
-- Ne mora rucno: api/poziv.js pravi tabelu sam pri prvom zahtevu.
-- Ovde je samo da se vidi sema. Bezbedno je pokrenuti vise puta.
-- ============================================================

CREATE TABLE IF NOT EXISTS pozivi (
  id         BIGSERIAL PRIMARY KEY,
  ime        TEXT NOT NULL,
  telefon    TEXT NOT NULL,          -- uvek u obliku +381...
  stranica   TEXT,                   -- /ponuda, /ponuda-2
  uredjaj    TEXT,                   -- mobilni, tablet, racunar
  ip         TEXT,                   -- za ogranicenje broja zahteva
  pozvan     BOOLEAN NOT NULL DEFAULT FALSE,
  kreirano   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pozivi_kreirano_idx ON pozivi (kreirano);
