// ============================================================
// GET /api/ab-rezultati  (zaglavlje X-AB-Kljuc: KLJUC)
// Brojke za stranicu /ab: posetioci, otvoreni popupi i prijave po
// varijanti, ukupno i po danima. Zakljucano kljucem AB_KLJUC
// (Vercel > Settings > Environment Variables).
// ============================================================

import { VEBINAR, db, json, greska, ocisti } from "./_lib.js";
import { VARIJANTE, OPIS_VARIJANTE } from "./_ab.js";
import { timingSafeEqual } from "node:crypto";

function istiKljuc(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return greska(res, 405, "Dozvoljen je samo GET.");
  }

  const tajna = process.env.AB_KLJUC;
  if (!tajna) return greska(res, 503, "AB_KLJUC nije podesen na Vercelu.");
  if (!istiKljuc(ocisti(req.headers["x-ab-kljuc"], 200), tajna)) return greska(res, 401, "Pogresan kljuc.");

  const vebinar = ocisti(req.query.vebinar, 20) || VEBINAR;

  try {
    const sql = db();

    const dogadjaji = await sql`
      SELECT varijanta, dogadjaj, COUNT(*)::int AS broj
      FROM ab_dogadjaji WHERE vebinar = ${vebinar}
      GROUP BY varijanta, dogadjaj`;

    const prijave = await sql`
      SELECT COALESCE(varijanta, '-') AS varijanta, COUNT(*)::int AS broj
      FROM prijave WHERE vebinar = ${vebinar}
      GROUP BY 1`;

    // Po danima, po beogradskom vremenu.
    const poDanima = await sql`
      WITH d AS (
        SELECT (kreirano AT TIME ZONE 'Europe/Belgrade')::date AS dan, varijanta,
               COUNT(*) FILTER (WHERE dogadjaj = 'poseta')::int AS posete,
               0 AS prijave
        FROM ab_dogadjaji WHERE vebinar = ${vebinar}
        GROUP BY 1, 2
        UNION ALL
        SELECT (kreirano AT TIME ZONE 'Europe/Belgrade')::date, varijanta, 0, COUNT(*)::int
        FROM prijave WHERE vebinar = ${vebinar} AND varijanta IS NOT NULL
        GROUP BY 1, 2
      )
      SELECT to_char(dan, 'YYYY-MM-DD') AS dan, varijanta,
             SUM(posete)::int AS posete, SUM(prijave)::int AS prijave
      FROM d GROUP BY 1, 2 ORDER BY 1 DESC, 2`;

    const varijante = VARIJANTE.map((v) => {
      const nadji = (dog) => (dogadjaji.find((r) => r.varijanta === v && r.dogadjaj === dog) || {}).broj || 0;
      const posete = nadji("poseta");
      const prij = (prijave.find((r) => r.varijanta === v) || {}).broj || 0;
      return {
        varijanta: v,
        opis: OPIS_VARIJANTE[v],
        posete,
        popup: nadji("popup"),
        prijave: prij,
      };
    });

    const bezVarijante = (prijave.find((r) => r.varijanta === "-") || {}).broj || 0;

    return json(res, 200, { ok: true, vebinar, varijante, bezVarijante, poDanima });
  } catch (e) {
    console.error("ab-rezultati:", e);
    const poruka = /ab_dogadjaji|varijanta/.test(e.message)
      ? "Baza jos nema tabele za A/B test. Pokreni db/migracija-ab.sql u Neon-u."
      : "Ne mogu da procitam bazu.";
    return greska(res, 500, poruka);
  }
}
