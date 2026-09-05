// ============================================================
// POST /api/prijava
// Prima formu sa landing stranice, upisuje prijavu u bazu, dodeljuje
// licni referal kod i prosledjuje kontakt MailerLite-u.
// Vraca { token, ref_kod, ref_link } - stranica onda salje coveka na /hvala?k=token
// ============================================================

import { upisiPretplatnika } from "./_mailerlite.js";
import {
  db, json, greska, jedinstvenKod, noviToken, ocisti, validanEmail,
  normalizujTelefon, referalLink, ipAdresa,
} from "./_lib.js";

// Gruba zastita od bota koji bi pumpao referale sa jedne masine.
const MAKS_PO_IP = 8;
const PROZOR_MIN = 15;

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

  // ---------- validacija ----------
  const ime = ocisti(telo.ime, 60);
  const prezime = ocisti(telo.prezime, 60);
  const email = ocisti(telo.email, 160).toLowerCase();
  const telefon = normalizujTelefon(telo.telefon);
  const refKodPozivaoca = ocisti(telo.ref, 16).toLowerCase();

  if (!ime) return greska(res, 400, "Unesi svoje ime.");
  if (!validanEmail(email)) return greska(res, 400, "Email adresa nije ispravna.");
  if (!telefon) return greska(res, 400, "Broj telefona nije ispravan. Primer: 065 132 4124");

  // Skriveno polje koje covek ne vidi, a bot ga popuni.
  if (ocisti(telo.zamka, 200)) return json(res, 200, { ok: true, token: null });

  const sql = db();
  const ip = ipAdresa(req);

  try {
    // ---------- rate limit ----------
    if (ip) {
      const [{ broj }] = await sql`
        SELECT COUNT(*)::int AS broj FROM prijave
        WHERE ip = ${ip} AND kreirano > NOW() - make_interval(mins => ${PROZOR_MIN})`;
      if (broj >= MAKS_PO_IP) {
        return greska(res, 429, "Previse prijava sa iste veze. Pokusaj kasnije.");
      }
    }

    // ---------- ko ga je pozvao ----------
    let refOdId = null;
    if (refKodPozivaoca) {
      const [pozivalac] = await sql`
        SELECT id, email FROM prijave WHERE ref_kod = ${refKodPozivaoca}`;
      // Niko ne moze da preporuci sam sebe.
      if (pozivalac && pozivalac.email !== email) refOdId = pozivalac.id;
    }

    // ---------- upis ----------
    const kod = await jedinstvenKod(sql);
    const token = noviToken();

    // Ponovna prijava istog emaila samo osvezava podatke: kod, token i
    // originalni pozivalac ostaju isti, pa se referal ne broji dvaput.
    const [red] = await sql`
      INSERT INTO prijave (email, ime, prezime, telefon, ref_kod, token, ref_od_id, ip)
      VALUES (${email}, ${ime}, ${prezime || null}, ${telefon}, ${kod}, ${token}, ${refOdId}, ${ip || null})
      ON CONFLICT (email) DO UPDATE SET
        ime       = EXCLUDED.ime,
        prezime   = EXCLUDED.prezime,
        telefon   = EXCLUDED.telefon,
        ref_od_id = COALESCE(prijave.ref_od_id, EXCLUDED.ref_od_id),
        azurirano = NOW()
      RETURNING id, ime, prezime, ref_kod, token`;

    const link = referalLink(req, red.ref_kod);

    // ---------- MailerLite ----------
    const ml = await upisiPretplatnika({
      email,
      ime: red.ime,
      prezime: red.prezime,
      telefon,
      refKod: red.ref_kod,
      refLink: link,
    });

    await sql`
      UPDATE prijave
      SET mailerlite_ok = ${ml.ok}, mailerlite_greska = ${ml.greska}
      WHERE id = ${red.id}`;

    if (!ml.ok) {
      // Red u bazi vec postoji i upis je idempotentan, pa je ponovni pokusaj bezbedan.
      console.error("MailerLite greska:", ml.greska);
      return greska(res, 502, "Prijava nije stigla do email sistema. Pokusaj ponovo za koji trenutak.");
    }

    return json(res, 200, {
      ok: true,
      token: red.token,
      ref_kod: red.ref_kod,
      ref_link: link,
    });
  } catch (e) {
    console.error("prijava:", e);
    return greska(res, 500, "Nesto je puklo kod nas. Pokusaj ponovo.");
  }
}
