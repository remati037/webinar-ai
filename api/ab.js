// ============================================================
// POST /api/ab
// Belezi da je posetilac video landing (dogadjaj "poseta") ili otvorio
// popup (dogadjaj "popup"), uz varijantu A/B testa koju je dobio.
// Svaki posetilac se broji jednom po dogadjaju (jedinstveni indeks u bazi).
// Salje se preko navigator.sendBeacon, pa odgovor niko ne cita.
// ============================================================

import { VEBINAR, db, json, greska, ocisti } from "./_lib.js";
import { VARIJANTE } from "./_ab.js";

const DOGADJAJI = ["poseta", "popup"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return greska(res, 405, "Dozvoljen je samo POST.");
  }

  let telo = req.body;
  if (typeof telo === "string") {
    try { telo = JSON.parse(telo); } catch { telo = null; }
  }
  if (!telo || typeof telo !== "object") return greska(res, 400, "Neispravan zahtev.");

  const varijanta = ocisti(telo.varijanta, 2).toLowerCase();
  const dogadjaj = ocisti(telo.dogadjaj, 12).toLowerCase();
  const posetilac = ocisti(telo.posetilac, 40);

  if (!VARIJANTE.includes(varijanta)) return greska(res, 400, "Nepoznata varijanta.");
  if (!DOGADJAJI.includes(dogadjaj)) return greska(res, 400, "Nepoznat dogadjaj.");
  if (!/^[a-z0-9]{8,40}$/i.test(posetilac)) return greska(res, 400, "Neispravan posetilac.");

  // Botovi i link preview-i (Facebook, WhatsApp...) ne ulaze u statistiku.
  const ua = String(req.headers["user-agent"] || "");
  if (!ua || /bot|crawl|spider|preview|facebookexternalhit|headless/i.test(ua)) {
    return json(res, 200, { ok: true });
  }

  try {
    const sql = db();
    await sql`
      INSERT INTO ab_dogadjaji (vebinar, varijanta, dogadjaj, posetilac)
      VALUES (${VEBINAR}, ${varijanta}, ${dogadjaj}, ${posetilac})
      ON CONFLICT (vebinar, posetilac, dogadjaj) DO NOTHING`;
    return json(res, 200, { ok: true });
  } catch (e) {
    // Statistika nikad ne sme da smeta stranici.
    console.error("ab:", e.message);
    return json(res, 200, { ok: false });
  }
}
