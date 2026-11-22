// ============================================================
// POST /api/otkljucaj   { lozinka }
// Upis je zatvoren (vidi middleware.js). Ko ima lozinku (LOZINKA_UPISA na
// Vercelu) dobija kolacic upis_otkljucan na 30 dana i vidi prave stranice.
// Kolacic je potpis lozinke, pa promena lozinke odjavljuje sve.
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import { json, greska, ocisti, ipAdresa } from "./_lib.js";

const TRAJANJE_S = 60 * 60 * 24 * 30;
const MAKS_POKUSAJA = 10;       // po IP adresi
const PROZOR_MS = 10 * 60 * 1000;
const pokusaji = new Map();     // grubo, po instanci funkcije

function potpis(lozinka) {
  return createHmac("sha256", lozinka).update("upis-otkljucan-v1").digest("hex");
}

function ista(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function previse(ip) {
  const sad = Date.now();
  const z = pokusaji.get(ip);
  if (!z || sad - z.od > PROZOR_MS) { pokusaji.set(ip, { od: sad, broj: 1 }); return false; }
  z.broj++;
  return z.broj > MAKS_POKUSAJA;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return greska(res, 405, "Metod nije dozvoljen.");
  }
  const tajna = process.env.LOZINKA_UPISA;
  if (!tajna) return greska(res, 503, "Otključavanje trenutno ne radi.");

  let t = req.body;
  if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
  const lozinka = ocisti(t && t.lozinka, 200);
  if (!lozinka) return greska(res, 400, "Upiši lozinku.");

  const ip = ipAdresa(req) || "?";
  if (previse(ip)) return greska(res, 429, "Previše pokušaja. Sačekaj desetak minuta pa probaj ponovo.");

  // Mala pauza da pogadjanje bude sporo.
  await new Promise((r) => setTimeout(r, 400));

  if (!ista(lozinka, tajna)) return greska(res, 401, "Lozinka nije tačna. Proveri je i pokušaj ponovo.");

  pokusaji.delete(ip);
  res.setHeader("Set-Cookie",
    `upis_otkljucan=${potpis(tajna)}; Path=/; Max-Age=${TRAJANJE_S}; HttpOnly; Secure; SameSite=Lax`);
  return json(res, 200, { ok: true });
}
