// ============================================================
// GET /api/status
// Provera da li je okruzenje podeseno kako treba. Vraca samo da/ne,
// nikad same vrednosti kljuceva. Korisno posle prvog deploya.
// ============================================================

import { db, json } from "./_lib.js";

export default async function handler(req, res) {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    MAILERLITE_API_KEY: Boolean(process.env.MAILERLITE_API_KEY),
    MAILERLITE_GROUP_ID: Boolean(process.env.MAILERLITE_GROUP_ID),
    SITE_URL: Boolean(process.env.SITE_URL),
  };

  let baza = "nije provereno";
  let tabela = false;
  try {
    const sql = db();
    const [r] = await sql`SELECT to_regclass('public.prijave') IS NOT NULL AS ima_tabelu`;
    baza = "povezana";
    tabela = r.ima_tabelu;
  } catch (e) {
    baza = `greska: ${String(e?.message || e).slice(0, 200)}`;
  }

  const spremno = env.DATABASE_URL && env.MAILERLITE_API_KEY && baza === "povezana" && tabela;
  json(res, spremno ? 200 : 503, { ok: spremno, env, baza, tabela_prijave: tabela });
}
