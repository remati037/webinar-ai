-- ============================================================
-- Migracija: A/B test forme za prijavu.
--
-- Pokreni JEDNOM u Neon SQL Editor-u (Vercel > Storage > Open in Neon
-- > SQL Editor). Bezbedno je pokrenuti vise puta, sve je IF NOT EXISTS.
-- Sajt radi i pre migracije: prijave prolaze, samo se varijanta ne belezi.
--
-- Sta radi:
--  * prijave dobijaju kolonu varijanta ('a' = forma na strani,
--    'b' = popup u dva koraka). Stare prijave ostaju bez varijante.
--  * nova tabela ab_dogadjaji broji jedinstvene posetioce po varijanti
--    i koliko njih je otvorilo popup. Iz toga se racuna konverzija.
-- ============================================================

ALTER TABLE prijave ADD COLUMN IF NOT EXISTS varijanta TEXT;
CREATE INDEX IF NOT EXISTS prijave_varijanta_idx ON prijave (vebinar, varijanta);

CREATE TABLE IF NOT EXISTS ab_dogadjaji (
  id           BIGSERIAL PRIMARY KEY,
  vebinar      TEXT NOT NULL,
  varijanta    TEXT NOT NULL,          -- 'a' ili 'b'
  dogadjaj     TEXT NOT NULL,          -- 'poseta' ili 'popup'
  posetilac    TEXT NOT NULL,          -- nasumican id iz browsera, bez licnih podataka
  kreirano     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jedan posetilac se broji jednom po dogadjaju, koliko god puta se vratio.
CREATE UNIQUE INDEX IF NOT EXISTS ab_dogadjaji_uniq ON ab_dogadjaji (vebinar, posetilac, dogadjaj);
CREATE INDEX IF NOT EXISTS ab_dogadjaji_idx ON ab_dogadjaji (vebinar, varijanta, dogadjaj);

-- Provera
SELECT varijanta, dogadjaj, COUNT(*) FROM ab_dogadjaji GROUP BY 1, 2 ORDER BY 1, 2;
