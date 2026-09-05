// ============================================================
// GET /api/referali?k=TOKEN
// Vraca podatke za licnu tabelu: sopstveni referal link, brojeve i
// listu ljudi koje je ta osoba dovela.
//
// Tudji podaci se NIKAD ne vracaju u celosti - samo ime sa inicijalom
// prezimena i maskiran email ("Marko P.", "mar***@gmail.com").
// ============================================================

import {
  db, json, greska, ocisti, referalLink, skracenoIme, maskiranEmail,
} from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return greska(res, 405, "Dozvoljen je samo GET.");
  }

  const token = ocisti(req.query?.k, 64);
  if (!token) return greska(res, 400, "Nedostaje kljuc.");

  try {
    const sql = db();

    const [ja] = await sql`
      SELECT id, ime, prezime, ref_kod FROM prijave WHERE token = ${token}`;
    if (!ja) return greska(res, 404, "Link nije prepoznat.");

    const dovedeni = await sql`
      SELECT ime, prezime, email, status, kreirano
      FROM prijave
      WHERE ref_od_id = ${ja.id}
      ORDER BY kreirano DESC
      LIMIT 500`;

    const lista = dovedeni.map((r) => ({
      ime: skracenoIme(r.ime, r.prezime),
      email: maskiranEmail(r.email),
      status: r.status,
      datum: r.kreirano,
    }));

    return json(res, 200, {
      ok: true,
      ime: ja.ime,
      ref_kod: ja.ref_kod,
      ref_link: referalLink(req, ja.ref_kod),
      ukupno: lista.length,
      potvrdjeno: lista.filter((r) => r.status === "potvrdjen").length,
      lista,
    });
  } catch (e) {
    console.error("referali:", e);
    return greska(res, 500, "Nesto je puklo kod nas. Osvezi stranicu za koji trenutak.");
  }
}
