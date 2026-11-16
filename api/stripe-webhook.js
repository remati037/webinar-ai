// ============================================================
// POST /api/stripe-webhook
// Stripe javlja kad je kupovina završena. Za plaćanje na 2 rate
// (pretplata od 270 € mesečno sa metadata plan=rate) pretplata se odmah
// prebacuje u raspored koji naplati tačno 2 rate i onda se sam završi.
// Bez ovoga bi Stripe naplaćivao 270 € svakog meseca.
//
// Promenljive na Vercelu:
//   STRIPE_SECRET_KEY      tajni ili restricted ključ (Subscriptions i
//                          Subscription schedules: write)
//   STRIPE_WEBHOOK_SECRET  whsec_... sa webhook endpointa u Stripe-u
// ============================================================

import crypto from "node:crypto";

const BROJ_RATA_PODRAZUMEVANO = 2;

function citajTelo(req) {
  return new Promise((resolve, reject) => {
    const delovi = [];
    req.on("data", (d) => delovi.push(d));
    req.on("end", () => resolve(Buffer.concat(delovi)));
    req.on("error", reject);
  });
}

// Provera potpisa po Stripe pravilima: t=...,v1=... i HMAC-SHA256 nad "t.telo".
function potpisJeDobar(telo, zaglavlje, tajna, tolerancijaSek = 300) {
  if (!zaglavlje) return false;
  const delovi = Object.fromEntries(
    zaglavlje.split(",").map((d) => {
      const i = d.indexOf("=");
      return [d.slice(0, i), d.slice(i + 1)];
    })
  );
  const t = Number(delovi.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > tolerancijaSek) return false;
  const ocekivan = crypto.createHmac("sha256", tajna).update(`${t}.${telo}`).digest("hex");
  const potpisi = zaglavlje.split(",").filter((d) => d.startsWith("v1=")).map((d) => d.slice(3));
  return potpisi.some((p) => p.length === ocekivan.length &&
    crypto.timingSafeEqual(Buffer.from(p), Buffer.from(ocekivan)));
}

function formular(obj, prefiks = "", izlaz = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const kljuc = prefiks ? `${prefiks}[${k}]` : k;
    if (v !== null && typeof v === "object") formular(v, kljuc, izlaz);
    else if (v !== undefined) izlaz.append(kljuc, String(v));
  }
  return izlaz;
}

async function stripe(metod, putanja, podaci) {
  const r = await fetch(`https://api.stripe.com/v1${putanja}`, {
    method: metod,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: podaci ? formular(podaci).toString() : undefined,
  });
  const odgovor = await r.json();
  if (!r.ok) throw new Error(`Stripe ${putanja}: ${odgovor.error?.message || r.status}`);
  return odgovor;
}

// Pretplatu na rate pretvara u raspored: N naplata, pa kraj.
async function ograniciRate(subscriptionId) {
  const sub = await stripe("GET", `/subscriptions/${subscriptionId}`);
  if (sub.metadata?.plan !== "rate") return "nije plan na rate";

  const brojRata = Number(sub.metadata.broj_rata) || BROJ_RATA_PODRAZUMEVANO;
  const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  const raspored = scheduleId
    ? await stripe("GET", `/subscription_schedules/${scheduleId}`)
    : await stripe("POST", "/subscription_schedules", { from_subscription: subscriptionId });

  if (raspored.end_behavior === "cancel" && raspored.phases?.[0]?.end_date) {
    return "već ograničeno";
  }

  const faza = raspored.phases[0];
  const izmena = (trajanje) => stripe("POST", `/subscription_schedules/${raspored.id}`, {
    end_behavior: "cancel",
    proration_behavior: "none",
    phases: [{
      start_date: faza.start_date,
      items: faza.items.map((s) => ({
        price: typeof s.price === "string" ? s.price : s.price.id,
        quantity: s.quantity || 1,
      })),
      ...trajanje,
      metadata: { plan: "rate", broj_rata: String(brojRata) },
    }],
  });
  // Mesečna cena x N meseci = N rata. Novije Stripe API verzije znaju samo
  // "duration", starije samo "iterations", pa probamo oba.
  try {
    await izmena({ duration: { interval: "month", interval_count: brojRata } });
  } catch (e) {
    if (!/duration/.test(e.message)) throw e;
    await izmena({ iterations: brojRata });
  }
  return `ograničeno na ${brojRata} rate`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ greska: "Samo POST." });
  }
  const tajna = process.env.STRIPE_WEBHOOK_SECRET;
  if (!tajna || !process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ greska: "Stripe nije podešen." });
  }

  const telo = (await citajTelo(req)).toString("utf8");
  if (!potpisJeDobar(telo, req.headers["stripe-signature"], tajna)) {
    return res.status(400).json({ greska: "Neispravan potpis." });
  }

  const dogadjaj = JSON.parse(telo);
  try {
    let rezultat = "preskočeno";
    const obj = dogadjaj.data?.object || {};
    if (dogadjaj.type === "checkout.session.completed" && obj.mode === "subscription" && obj.subscription) {
      rezultat = await ograniciRate(obj.subscription);
    } else if (dogadjaj.type === "customer.subscription.created") {
      rezultat = await ograniciRate(obj.id);
    }
    console.log(`[stripe] ${dogadjaj.type} ${dogadjaj.id}: ${rezultat}`);
    return res.status(200).json({ primljeno: true, rezultat });
  } catch (e) {
    // 500 da Stripe pokuša ponovo kasnije.
    console.error(`[stripe] ${dogadjaj.type} ${dogadjaj.id}:`, e.message);
    return res.status(500).json({ greska: "Obrada nije uspela." });
  }
}

// Telo mora da ostane sirovo zbog provere potpisa.
export const config = { api: { bodyParser: false } };
