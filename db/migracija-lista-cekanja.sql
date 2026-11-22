-- Lista cekanja sa zakljucanog ekrana (/zakljucano). /api/lista-cekanja pravi
-- tabelu sam pri prvom zahtevu, ovo je samo za rucno pokretanje u Neon-u.
CREATE TABLE IF NOT EXISTS lista_cekanja (
  id           BIGSERIAL PRIMARY KEY,
  ime          TEXT NOT NULL,
  email        TEXT NOT NULL,
  telefon      TEXT NOT NULL,
  stranica     TEXT,
  uredjaj      TEXT,
  ip           TEXT,
  kontaktiran  BOOLEAN NOT NULL DEFAULT FALSE,
  kreirano     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  azurirano    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS lista_cekanja_email_uniq ON lista_cekanja (email);
CREATE INDEX IF NOT EXISTS lista_cekanja_ip_idx ON lista_cekanja (ip, kreirano);
