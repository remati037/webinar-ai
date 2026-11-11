// ============================================================
// POST /api/prijava
// Prima formu sa landing stranice, upisuje prijavu u bazu, dodeljuje
// licni referal kod i prosledjuje kontakt MailerLite-u.
// Vraca { token, ref_kod, ref_link } - stranica onda salje coveka na /hvala?k=token
// ============================================================

import { upisiPretplatnika } from "./_mailerlite.js";
import {
  VEBINAR, db, json, greska, jedinstvenKod, noviToken, ocisti, validanEmail,
  normalizujTelefon, referalLink, tabelaLink, ipAdresa, vrstaUredjaja,
} from "./_lib.js";
import { VARIJANTE } from "./_ab.js";

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
  // Pozivni broj bira forma (sama, po zemlji posetioca, ili covek rucno).
  const pozivni = /^\+\d{1,4}$/.test(ocisti(telo.pozivni, 6)) ? ocisti(telo.pozivni, 6) : "+381";
  const telefon = normalizujTelefon(telo.telefon, pozivni);
  const refKodPozivaoca = ocisti(telo.ref, 16).toLowerCase();
  const varijanta = ocisti(telo.varijanta, 2).toLowerCase();

  if (!ime) return greska(res, 400, "Unesi svoje ime.");
  if (!validanEmail(email)) return greska(res, 400, "Email adresa nije ispravna.");
  if (!telefon) return greska(res, 400, "Broj telefona nije ispravan. Proveri pozivni broj i broj.");

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
    // Broje se samo kodovi sa ovog vebinara. Kod sa proslog vebinara
    // se tiho ignorise, a prijava prolazi normalno.
    let refOdId = null;
    if (refKodPozivaoca) {
      const [pozivalac] = await sql`
        SELECT id, email FROM prijave
        WHERE ref_kod = ${refKodPozivaoca} AND vebinar = ${VEBINAR}`;
      // Niko ne moze da preporuci sam sebe.
      if (pozivalac && pozivalac.email !== email) refOdId = pozivalac.id;
    }

    // ---------- upis ----------
    const kod = await jedinstvenKod(sql);
    const token = noviToken();

    // Ponovna prijava istog emaila za ISTI vebinar samo osvezava podatke:
    // kod, token i originalni pozivalac ostaju isti, pa se referal ne broji
    // dvaput. Prijava za novi vebinar je nov red sa novim kodom i tabelom.
    const [red] = await sql`
      INSERT INTO prijave (vebinar, email, ime, prezime, telefon, ref_kod, token, ref_od_id, ip)
      VALUES (${VEBINAR}, ${email}, ${ime}, ${prezime || null}, ${telefon}, ${kod}, ${token}, ${refOdId}, ${ip || null})
      ON CONFLICT (vebinar, email) DO UPDATE SET
        ime       = EXCLUDED.ime,
        prezime   = COALESCE(EXCLUDED.prezime, prijave.prezime),
        telefon   = EXCLUDED.telefon,
        ref_od_id = COALESCE(prijave.ref_od_id, EXCLUDED.ref_od_id),
        azurirano = NOW()
      RETURNING id, ime, prezime, ref_kod, token`;

    // ---------- A/B test ----------
    // Posebnim upitom, da prijava prodje i ako migracija za A/B jos nije
    // pokrenuta. Racuna se prva varijanta koju je covek video.
    if (VARIJANTE.includes(varijanta)) {
      try {
        await sql`
          UPDATE prijave SET varijanta = COALESCE(varijanta, ${varijanta})
          WHERE id = ${red.id}`;
      } catch (e) {
        console.error("A/B varijanta nije upisana:", e.message);
      }
    }

    // ---------- odakle je stigao (za /analiza) ----------
    // Isto kao A/B: posebnim upitom, da prijava prodje i bez migracije.
    // COALESCE cuva prvi izvor ako se isti email prijavi ponovo.
    try {
      const iz = telo.izvor && typeof telo.izvor === "object" ? telo.izvor : {};
      const polje = (v) => ocisti(v, 80).toLowerCase() || null;
      const zemlja = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
      await sql`
        UPDATE prijave SET
          izvor    = COALESCE(izvor, ${polje(iz.izvor)}),
          medij    = COALESCE(medij, ${polje(iz.medij)}),
          kampanja = COALESCE(kampanja, ${polje(iz.kampanja)}),
          oglas    = COALESCE(oglas, ${polje(iz.oglas)}),
          zemlja   = COALESCE(zemlja, ${/^[A-Z]{2}$/.test(zemlja) ? zemlja : null}),
          uredjaj  = COALESCE(uredjaj, ${vrstaUredjaja(req.headers["user-agent"])})
        WHERE id = ${red.id}`;
    } catch (e) {
      console.error("Izvor prijave nije upisan:", e.message);
    }

    const link = referalLink(req, red.ref_kod);
    const tabela = tabelaLink(req, red.token);

    // ---------- MailerLite ----------
    const ml = await upisiPretplatnika({
      email,
      ime: red.ime,
      prezime: red.prezime,
      telefon,
      refKod: red.ref_kod,
      refLink: link,
      tabelaUrl: tabela,
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
