// ============================================================
// /api/lista-cekanja
// Lista cekanja sa zakljucanog ekrana (/zakljucano): ime, email i telefon.
//
//   POST                      javno: { ime, email, telefon, stranica, zamka }
//   GET   (X-AB-Kljuc)        lista za stranicu /lista-cekanja
//   PATCH (X-AB-Kljuc)        { id, kontaktiran: true|false }
//
// Tabela se pravi sama pri prvom zahtevu. Ista sema je u db/migracija-lista-cekanja.sql.
// Ako se isti email prijavi ponovo, samo se osveze ime i telefon (bez duplikata).
// ============================================================

import { db, json, greska, ocisti, validanEmail, normalizujTelefon, ipAdresa, vrstaUredjaja, proveriKljuc } from "./_lib.js";

const MAKS_PO_IP = 8;
const PROZOR_MIN = 30;

let tabelaSpremna = false;
async function pripremiTabelu(sql) {
  if (tabelaSpremna) return;
  await sql`
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
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS lista_cekanja_email_uniq ON lista_cekanja (email)`;
  await sql`CREATE INDEX IF NOT EXISTS lista_cekanja_ip_idx ON lista_cekanja (ip, kreirano)`;
  tabelaSpremna = true;
}

function telo(req) {
  let t = req.body;
  if (typeof t === "string") {
    try { t = JSON.parse(t); } catch { t = null; }
  }
  return t && typeof t === "object" ? t : null;
}

export default async function handler(req, res) {
  if (req.method === "POST") return upisi(req, res);
  if (req.method === "GET") return lista(req, res);
  if (req.method === "PATCH") return oznaci(req, res);
  res.setHeader("Allow", "GET, POST, PATCH");
  return greska(res, 405, "Metod nije dozvoljen.");
}

async function upisi(req, res) {
  const t = telo(req);
  if (!t) return greska(res, 400, "Neispravan zahtev.");

  // Skriveno polje: covek ga ne vidi, bot ga popuni.
  if (ocisti(t.zamka, 200)) return json(res, 200, { ok: true });

  const ime = ocisti(t.ime, 60);
  const email = ocisti(t.email, 160).toLowerCase();
  const telefon = normalizujTelefon(t.telefon, "+381");
  const stranica = ocisti(t.stranica, 40) || null;

  if (!ime) return greska(res, 400, "Upiši svoje ime.");
  if (!validanEmail(email)) return greska(res, 400, "Email adresa nije ispravna.");
  if (!telefon) return greska(res, 400, "Broj telefona nije ispravan.");

  try {
    const sql = db();
    await pripremiTabelu(sql);
    const ip = ipAdresa(req);
    if (ip) {
      const [{ broj }] = await sql`
        SELECT COUNT(*)::int AS broj FROM lista_cekanja
        WHERE ip = ${ip} AND azurirano > NOW() - make_interval(mins => ${PROZOR_MIN})`;
      if (broj >= MAKS_PO_IP) return greska(res, 429, "Previše prijava. Pokušaj malo kasnije.");
    }
    await sql`
      INSERT INTO lista_cekanja (ime, email, telefon, stranica, uredjaj, ip)
      VALUES (${ime}, ${email}, ${telefon}, ${stranica}, ${vrstaUredjaja(req.headers["user-agent"])}, ${ip || null})
      ON CONFLICT (email) DO UPDATE
        SET ime = EXCLUDED.ime, telefon = EXCLUDED.telefon, azurirano = NOW()`;
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("lista-cekanja upis", e);
    return greska(res, 500, "Nešto nije u redu. Pokušaj ponovo.");
  }
}

async function lista(req, res) {
  if (!proveriKljuc(req, res)) return;
  try {
    const sql = db();
    await pripremiTabelu(sql);
    const redovi = await sql`
      SELECT id, ime, email, telefon, stranica, uredjaj, kontaktiran, kreirano
      FROM lista_cekanja ORDER BY kreirano DESC LIMIT 2000`;
    return json(res, 200, { ok: true, lista: redovi });
  } catch (e) {
    console.error("lista-cekanja lista", e);
    return greska(res, 500, "Ne mogu da učitam listu.");
  }
}

async function oznaci(req, res) {
  if (!proveriKljuc(req, res)) return;
  const t = telo(req);
  const id = Number(t && t.id);
  if (!Number.isInteger(id) || id <= 0) return greska(res, 400, "Neispravan id.");
  try {
    const sql = db();
    await pripremiTabelu(sql);
    await sql`UPDATE lista_cekanja SET kontaktiran = ${Boolean(t.kontaktiran)} WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("lista-cekanja oznaci", e);
    return greska(res, 500, "Ne mogu da sačuvam.");
  }
}
