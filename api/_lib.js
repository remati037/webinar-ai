// ============================================================
// Zajednicke funkcije za /api rute.
// Nema frameworka: obicne Vercel Node funkcije + Neon serverless drajver.
// ============================================================

import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

// ---------- baza ----------

let _sql = null;

/** Neon konekcija. Pravi se lenjo da funkcija ne pukne pri hladnom startu bez env-a. */
export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL nije podesen u Vercel Environment Variables.");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// ---------- odgovori ----------

export function json(res, kod, telo) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(kod).send(JSON.stringify(telo));
}

export function greska(res, kod, poruka) {
  json(res, kod, { ok: false, poruka });
}

// ---------- referal kod i token ----------

// Bez 0/O/1/l/I da se kod moze procitati naglas i prepisati bez zabune.
const AZBUKA = "abcdefghjkmnpqrstuvwxyz23456789";

function nasumicanKod(duzina = 6) {
  const bajtovi = randomBytes(duzina);
  let out = "";
  for (let i = 0; i < duzina; i++) out += AZBUKA[bajtovi[i] % AZBUKA.length];
  return out;
}

/** Kod koji sigurno jos ne postoji u bazi. */
export async function jedinstvenKod(sql) {
  for (let i = 0; i < 8; i++) {
    const kod = nasumicanKod(6);
    const [zauzet] = await sql`SELECT 1 FROM prijave WHERE ref_kod = ${kod}`;
    if (!zauzet) return kod;
  }
  throw new Error("Ne mogu da nadjem slobodan referal kod.");
}

/** Tajni kljuc za pristup licnoj tabeli. 32 znaka, url-safe. */
export function noviToken() {
  return randomBytes(24).toString("base64url");
}

// ---------- validacija i normalizacija ----------

export function ocisti(v, maks = 120) {
  return String(v ?? "").trim().slice(0, maks);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function validanEmail(v) {
  return EMAIL_RE.test(v);
}

/**
 * Domaci zapis broja (065..., 00381...) prevodi u +381...
 * Ista logika postoji i u assets/js/main.js zbog trenutne provere u formi;
 * ovde je jos jednom jer klijentu nikad ne verujemo.
 */
export function normalizujTelefon(unos, pozivni = "+381") {
  let v = String(unos ?? "").replace(/[\s\-(). ]/g, "");
  if (!v) return "";
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (v.startsWith("+")) return /^\+\d{6,15}$/.test(v) ? v : "";
  if (!/^\d+$/.test(v)) return "";
  if (v.startsWith("0")) v = v.slice(1);
  if (v.length < 6 || v.length > 12) return "";
  return pozivni + v;
}

// ---------- prikaz tudjih podataka ----------

/** "Marko" + "Petrovic" -> "Marko P." */
export function skracenoIme(ime, prezime) {
  const i = ocisti(ime);
  const p = ocisti(prezime);
  return p ? `${i} ${p.charAt(0).toUpperCase()}.` : i;
}

/** "marko.petrovic@gmail.com" -> "mar***@gmail.com" */
export function maskiranEmail(email) {
  const e = String(email ?? "");
  const at = e.lastIndexOf("@");
  if (at < 1) return "***";
  const lokalni = e.slice(0, at);
  const domen = e.slice(at);
  const vidljivo = lokalni.slice(0, Math.min(3, Math.max(1, lokalni.length - 1)));
  return `${vidljivo}***${domen}`;
}

// ---------- okruzenje ----------

/** Adresa sajta. Iz SITE_URL ako postoji, inace iz zaglavlja zahteva. */
export function adresaSajta(req) {
  const iz_env = process.env.SITE_URL;
  if (iz_env) return iz_env.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protokol = req.headers["x-forwarded-proto"] || "https";
  return `${protokol}://${host}`;
}

export function referalLink(req, kod) {
  return `${adresaSajta(req)}/?ref=${kod}`;
}

export function ipAdresa(req) {
  const f = req.headers["x-forwarded-for"];
  if (typeof f === "string" && f) return f.split(",")[0].trim().slice(0, 45);
  return (req.socket?.remoteAddress || "").slice(0, 45);
}
