// ============================================================
// POST /api/meta
// Meta Conversions API. Stranica posalje isti dogadjaj pikselu i ovde,
// sa istim eventID-jem, pa Meta spoji oba i broji ga jednom.
// Server dodaje IP, user agent i _fbp/_fbc kolacice.
//
// Promenljive na Vercelu:
//   META_CAPI_TOKEN        access token iz Events Manager-a
//                          (Settings > Conversions API > Generate access token)
//   META_TEST_EVENT_CODE   opciono, TEST12345 iz kartice "Test events".
//                          Obrisi ga kad zavrsis testiranje.
// ============================================================

const PIXEL_ID = "539402290072454";
const API_VERZIJA = "v23.0";
const DOZVOLJENI = new Set(["ViewContent", "InitiateCheckout"]);

function kolacici(req) {
  const izlaz = {};
  (req.headers.cookie || "").split(";").forEach((d) => {
    const i = d.indexOf("=");
    if (i > 0) izlaz[d.slice(0, i).trim()] = decodeURIComponent(d.slice(i + 1).trim());
  });
  return izlaz;
}

function telo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return res.status(204).end();

  const ua = req.headers["user-agent"] || "";
  if (!ua || /bot|crawl|spider|preview|facebookexternalhit|headless/i.test(ua)) {
    return res.status(204).end();
  }

  const t = telo(req);
  const ime = String(t.ime || "");
  const eventId = String(t.eventId || "").slice(0, 100);
  if (!DOZVOLJENI.has(ime) || !eventId) return res.status(400).end();

  // Prihvatamo samo adrese sa istog sajta.
  let adresa;
  try {
    adresa = new URL(String(t.url || ""));
    if (adresa.host !== req.headers.host) return res.status(400).end();
  } catch {
    return res.status(400).end();
  }

  const k = kolacici(req);
  let fbc = k._fbc;
  const fbclid = adresa.searchParams.get("fbclid");
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress || "";

  const podaci = {};
  const p = t.podaci && typeof t.podaci === "object" ? t.podaci : {};
  if (typeof p.value === "number" && isFinite(p.value)) podaci.value = p.value;
  if (typeof p.currency === "string") podaci.currency = p.currency.slice(0, 3);
  if (typeof p.content_name === "string") podaci.content_name = p.content_name.slice(0, 100);

  const dogadjaj = {
    event_name: ime,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    event_source_url: adresa.toString(),
    user_data: {
      client_ip_address: ip || undefined,
      client_user_agent: ua,
      fbp: k._fbp || undefined,
      fbc: fbc || undefined,
    },
    custom_data: Object.keys(podaci).length ? podaci : undefined,
  };

  const zahtev = { data: [dogadjaj] };
  if (process.env.META_TEST_EVENT_CODE) zahtev.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const r = await fetch(
      `https://graph.facebook.com/${API_VERZIJA}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(zahtev) }
    );
    if (!r.ok) console.error("[meta]", ime, r.status, await r.text());
  } catch (e) {
    console.error("[meta]", ime, e.message);
  }
  return res.status(204).end();
}
