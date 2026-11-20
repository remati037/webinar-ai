// ============================================================
// /api/poziv
// Zahtevi za poziv iz popupa na /ponuda i /ponuda-2: ime i broj telefona.
//
//   POST                      javno: upisuje zahtev { ime, telefon, pozivni, stranica }
//   GET   (X-AB-Kljuc)        lista zahteva za stranicu /pozivi
//   PATCH (X-AB-Kljuc)        { id, pozvan: true|false } oznaci da je Vladimir zvao
//
// Tabela se pravi sama pri prvom zahtevu (CREATE TABLE IF NOT EXISTS),
// pa nije potrebna rucna migracija. Ista sema je u db/migracija-pozivi.sql.
// ============================================================

import { db, json, greska, ocisti, normalizujTelefon, ipAdresa, vrstaUredjaja, proveriKljuc } from "./_lib.js";

const MAKS_PO_IP = 5;
const PROZOR_MIN = 30;

let tabelaSpremna = false;
async function pripremiTabelu(sql) {
  if (tabelaSpremna) return;
  await sql`
    CREATE TABLE IF NOT EXISTS pozivi (
      id         BIGSERIAL PRIMARY KEY,
      ime        TEXT NOT NULL,
      telefon    TEXT NOT NULL,
      stranica   TEXT,
      uredjaj    TEXT,
      ip         TEXT,
      pozvan     BOOLEAN NOT NULL DEFAULT FALSE,
      kreirano   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS pozivi_kreirano_idx ON pozivi (kreirano)`;
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
  const pozivni = /^\+\d{1,4}$/.test(ocisti(t.pozivni, 6)) ? ocisti(t.pozivni, 6) : "+381";
  const telefon = normalizujTelefon(t.telefon, pozivni);
  const stranica = ocisti(t.stranica, 40) || null;

  if (!ime) return greska(res, 400, "Unesi svoje ime.");
  if (!telefon) return greska(res, 400, "Broj telefona nije ispravan.");

  try {
    const sql = db();
    await pripremiTabelu(sql);
    const ip = ipAdresa(req);
    if (ip) {
      const [{ broj }] = await sql`
        SELECT COUNT(*)::int AS broj FROM pozivi
        WHERE ip = ${ip} AND kreirano > NOW() - make_interval(mins => ${PROZOR_MIN})`;
      if (broj >= MAKS_PO_IP) return greska(res, 429, "Previše zahteva. Pokušaj malo kasnije.");
    }
    await sql`
      INSERT INTO pozivi (ime, telefon, stranica, uredjaj, ip)
      VALUES (${ime}, ${telefon}, ${stranica}, ${vrstaUredjaja(req.headers["user-agent"])}, ${ip || null})`;
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("poziv upis", e);
    return greska(res, 500, "Nešto nije u redu. Pokušaj ponovo.");
  }
}

async function lista(req, res) {
  if (!proveriKljuc(req, res)) return;
  try {
    const sql = db();
    await pripremiTabelu(sql);
    const redovi = await sql`
      SELECT id, ime, telefon, stranica, uredjaj, pozvan, kreirano
      FROM pozivi ORDER BY kreirano DESC LIMIT 500`;
    return json(res, 200, { ok: true, pozivi: redovi });
  } catch (e) {
    console.error("poziv lista", e);
    return greska(res, 500, "Ne mogu da učitam zahteve.");
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
    await sql`UPDATE pozivi SET pozvan = ${Boolean(t.pozvan)} WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("poziv oznaci", e);
    return greska(res, 500, "Ne mogu da sačuvam.");
  }
}
