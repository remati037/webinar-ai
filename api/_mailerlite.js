// ============================================================
// MailerLite API klijent.
// Radi preko zvanicnog /api/subscribers endpointa (upsert po emailu),
// ne preko starog JSONP embeda koji je forma ranije koristila.
// ============================================================

const API = "https://connect.mailerlite.com/api/subscribers";

/**
 * Upisuje ili azurira pretplatnika.
 * Vraca { ok, greska } - nikad ne baca, da jedna greska kod njih
 * ne obori celu prijavu pre nego sto stignemo da je obradimo.
 */
export async function upisiPretplatnika({ email, ime, prezime, telefon, refKod, refLink, tabelaUrl }) {
  const kljuc = process.env.MAILERLITE_API_KEY;
  if (!kljuc) return { ok: false, greska: "MAILERLITE_API_KEY nije podesen" };

  const grupa = process.env.MAILERLITE_GROUP_ID;

  const osnovnaPolja = {
    name: ime,
    last_name: prezime || undefined,
    phone: telefon || undefined,
  };

  // referal_kod, referal_link i referal_tabela su custom polja koja se prave
  // rukom u MailerLite panelu. Ako jos ne postoje, njihov API vrati 422 - tada
  // saljemo ponovo bez njih, da covek bar upadne u grupu i dobije mejlove.
  const saCustom = {
    ...osnovnaPolja,
    referal_kod: refKod,
    referal_link: refLink,
    referal_tabela: tabelaUrl,
  };

  let odgovor = await posalji(kljuc, email, saCustom, grupa);
  if (odgovor.status === 422) {
    const ponovo = await posalji(kljuc, email, osnovnaPolja, grupa);
    if (ponovo.ok) {
      return {
        ok: true,
        greska: "custom polja referal_kod/referal_link/referal_tabela ne postoje u MailerLite-u",
      };
    }
    odgovor = ponovo;
  }

  if (odgovor.ok) return { ok: true, greska: null };
  return { ok: false, greska: `MailerLite ${odgovor.status}: ${odgovor.telo}`.slice(0, 500) };
}

async function posalji(kljuc, email, fields, grupa) {
  const telo = { email, fields, status: "active" };
  if (grupa) telo.groups = [String(grupa)];

  try {
    const r = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${kljuc}`,
      },
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, status: r.status, telo: r.ok ? "" : await r.text() };
  } catch (e) {
    return { ok: false, status: 0, telo: String(e?.message || e) };
  }
}
