// ============================================================
// Obogacivanje prijava sa vebinara podacima iz HubSpota.
//
// Samo CITA iz Neona i HubSpota. Ne upisuje nista ni u HubSpot ni u MailerLite.
// Rezultat: izvoz/kontakti-obogaceni.csv (izvoz/ je u .gitignore, licni podaci).
//
// Kako spaja:
//   1. povuce sve HubSpot kontakte (mejl, telefoni, polja o kupovinama)
//   2. svaku prijavu trazi prvo po mejlu, pa po telefonu
//      (telefon se poredi po poslednjih 9 cifara, pa +381 65..., 065... i
//      00381 65... ispadaju isti broj; ako isti broj ima vise kontakata,
//      ne spaja se, da ne bi pogodio pogresnu osobu)
//   3. za pronadjene kontakte povuce dealove i racuna STVARNO placene
//      kupovine (samo faze Processing i Completed), u EUR
//
// Pokretanje iz korena projekta:
//   node --env-file=.env.local skripte/obogati-iz-hubspota.mjs
// Za neki drugi vebinar:
//   VEBINAR_ID=2026-09-14 node --env-file=.env.local skripte/obogati-iz-hubspota.mjs
// ============================================================

import { neon } from "@neondatabase/serverless";
import { writeFileSync, mkdirSync } from "node:fs";
import { VEBINAR } from "../api/_lib.js";

const { DATABASE_URL, HUBSPOT_TOKEN } = process.env;
for (const [ime, v] of Object.entries({ DATABASE_URL, HUBSPOT_TOKEN })) {
  if (!v) { console.error(`Nedostaje ${ime} u .env.local`); process.exit(1); }
}

const IZLAZ = "izvoz/kontakti-obogaceni.csv";
const KURS_RSD_ZA_EUR = 117.2;
const KURS_USD_U_EUR = 0.86; // stari dealovi (2020-2024) su u USD

// Faze deala koje znace da je kupovina placena.
const PLACENO = new Set([
  "processed", "shipped",            // Ecommerce Pipeline: Processing, Completed
  "1247023970", "1247023974",        // Konferencija: Processing, Completed
]);
// Faze koje znace da je pokusao da kupi, ali nije prosao.
const POKUSAO = new Set([
  "checkout_abandoned", "checkout_pending", // Ecommerce: napusten checkout, placanje na cekanju ili palo
  "1247023977", "1247023969",               // Konferencija: Failed, Pending payment
]);

const POLJA_KONTAKTA = [
  "email", "hs_additional_emails", "phone", "mobilephone", "lifecyclestage",
  "monetary_rating", "order_frequency_rating", "order_recency_rating",
  "current_abandoned_cart", "abandoned_cart_products", "abandoned_cart_date",
  "billing_country", "billing_city", "newsletter_subscription",
];

// ---------- pomocne ----------

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));

async function hs(putanja, telo, pokusaj = 1) {
  const r = await fetch("https://api.hubapi.com" + putanja, {
    method: telo ? "POST" : "GET",
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
    body: telo ? JSON.stringify(telo) : undefined,
  });
  if (r.status === 429 && pokusaj <= 5) {
    await pauza(1500 * pokusaj);
    return hs(putanja, telo, pokusaj + 1);
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HubSpot ${r.status} na ${putanja}: ${json.message ?? ""}`);
  await pauza(110); // ispod limita od ~100 zahteva u 10 sekundi
  return json;
}

const mejl = (s) => (s ?? "").trim().toLowerCase();

// Kljuc telefona: samo cifre, poslednjih 9. Kraci od 8 cifara se ignorise.
function telKljuc(s) {
  const cifre = (s ?? "").replace(/\D/g, "");
  if (cifre.length < 8) return null;
  return cifre.slice(-9);
}

const ukloniBroj = (naziv) => (naziv ?? "").replace(/^#\d+\s*/, "").trim();

function uEur(iznos, valuta) {
  const n = Number(iznos);
  if (!Number.isFinite(n)) return 0;
  if (valuta === "RSD") return n / KURS_RSD_ZA_EUR;
  if (valuta === "USD") return n * KURS_USD_U_EUR;
  return n;
}

const datum = (s) => (s ?? "").slice(0, 10);

function csvPolje(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

// ---------- 1. prijave iz Neona ----------

const sql = neon(DATABASE_URL);
const prijave = await sql`
  SELECT p.id, p.ime, p.prezime, p.email, p.telefon, p.izvor, p.kampanja, p.zemlja,
         p.kreirano, u.ulazaka
  FROM prijave p
  LEFT JOIN uzivo_ucesnici u
    ON u.vebinar = p.vebinar AND (u.prijava_id = p.id OR lower(u.email) = lower(p.email))
  WHERE p.vebinar = ${VEBINAR}
  ORDER BY p.kreirano ASC`;
console.log(`Vebinar ${VEBINAR}: ${prijave.length} prijava`);

// ---------- 2. svi HubSpot kontakti ----------

const kontakti = [];
let posle;
do {
  const q = new URLSearchParams({ limit: "100", properties: POLJA_KONTAKTA.join(",") });
  if (posle) q.set("after", posle);
  const r = await hs(`/crm/v3/objects/contacts?${q}`);
  kontakti.push(...r.results);
  posle = r.paging?.next?.after;
  process.stdout.write(`\rHubSpot kontakti: ${kontakti.length}`);
} while (posle);
console.log();

const poMejlu = new Map();
const poTelefonu = new Map(); // kljuc -> Set id-jeva
for (const k of kontakti) {
  const p = k.properties;
  for (const m of [p.email, ...(p.hs_additional_emails ?? "").split(";")]) {
    if (mejl(m)) poMejlu.set(mejl(m), k);
  }
  for (const t of [p.phone, p.mobilephone]) {
    const kl = telKljuc(t);
    if (!kl) continue;
    if (!poTelefonu.has(kl)) poTelefonu.set(kl, new Map());
    poTelefonu.get(kl).set(k.id, k);
  }
}

// ---------- 3. spajanje ----------

let viseKontakataNaBroj = 0;
const spojeni = prijave.map((pr) => {
  const poM = poMejlu.get(mejl(pr.email));
  if (poM) return { pr, hk: poM, nacin: "mejl" };
  const kl = telKljuc(pr.telefon);
  const nadjeni = kl ? poTelefonu.get(kl) : null;
  if (nadjeni?.size === 1) return { pr, hk: [...nadjeni.values()][0], nacin: "telefon" };
  if (nadjeni?.size > 1) viseKontakataNaBroj++;
  return { pr, hk: null, nacin: "" };
});

// ---------- 4. dealovi za pronadjene kontakte ----------

const idKontakata = [...new Set(spojeni.filter((s) => s.hk).map((s) => s.hk.id))];
const dealoviKontakta = new Map(); // contactId -> [dealId]

for (let i = 0; i < idKontakata.length; i += 1000) {
  const r = await hs("/crm/v4/associations/contacts/deals/batch/read", {
    inputs: idKontakata.slice(i, i + 1000).map((id) => ({ id })),
  });
  for (const red of r.results ?? []) {
    dealoviKontakta.set(String(red.from.id), red.to.map((t) => String(t.toObjectId)));
  }
}

const sviDealId = [...new Set([...dealoviKontakta.values()].flat())];
const deal = new Map();
for (let i = 0; i < sviDealId.length; i += 100) {
  const r = await hs("/crm/v3/objects/deals/batch/read", {
    inputs: sviDealId.slice(i, i + 100).map((id) => ({ id })),
    properties: ["dealname", "amount", "deal_currency_code", "dealstage", "closedate", "createdate",
      "pipeline", "hs_object_source_detail_1", "hs_num_of_associated_line_items"],
  });
  for (const d of r.results) deal.set(d.id, d.properties);
  process.stdout.write(`\rDealovi: ${deal.size} / ${sviDealId.length}`);
}
console.log();

// Stavke porudzbine (line items): pravi nazivi proizvoda.
// Naziv deala nije pouzdan: uvezeni i Make dealovi nose ime kupca.
const saStavkama = [...deal].filter(([, d]) => Number(d.hs_num_of_associated_line_items) > 0).map(([id]) => id);
const stavkeDeala = new Map(); // dealId -> [lineItemId]
for (let i = 0; i < saStavkama.length; i += 1000) {
  const r = await hs("/crm/v4/associations/deals/line_items/batch/read", {
    inputs: saStavkama.slice(i, i + 1000).map((id) => ({ id })),
  });
  for (const red of r.results ?? []) stavkeDeala.set(String(red.from.id), red.to.map((t) => String(t.toObjectId)));
}
const sveStavke = [...new Set([...stavkeDeala.values()].flat())];
const stavka = new Map();
for (let i = 0; i < sveStavke.length; i += 100) {
  const r = await hs("/crm/v3/objects/line_items/batch/read", {
    inputs: sveStavke.slice(i, i + 100).map((id) => ({ id })),
    properties: ["name", "quantity"],
  });
  for (const s of r.results) stavka.set(s.id, s.properties);
  process.stdout.write(`\rStavke: ${stavka.size} / ${sveStavke.length}`);
}
console.log();

// Uvezeni dealovi bez stavki: proizvod se vidi iz imena CSV fajla iz kog su uvezeni.
const PROIZVOD_IZ_UVOZA = [
  [/biznis tajne/i, "Biznis tajne"],
  [/ai kurs/i, "AI Kurs"],
  [/konf\. 2024/i, "Konferencija 2024"],
  [/konferencija 2025/i, "Konferencija 2025"],
  [/biznis pri[cč]/i, "55 Biznis Priča (uplatnica)"],
];
const PIPELINE_KONFERENCIJA = "839674369";
const cistNaziv = (n) => (n ?? "").replace(/\s*\([^()\s]+\)$/, "").trim();
const POZNATI = new Set([...stavka.values()].map((s) => cistNaziv(s.name).toLowerCase()));

function proizvodiDeala(id, d) {
  const imena = (stavkeDeala.get(id) ?? []).map((sid) => stavka.get(sid)).filter(Boolean)
    .map((s) => ({ ...s, name: cistNaziv(s.name) }))
    .map((s) => (Number(s.quantity) > 1 ? `${s.name} x${Number(s.quantity)}` : s.name));
  if (imena.length) return imena;
  // "#broj Naziv" bez stavki: prihvati samo ako je naziv poznat proizvod,
  // jer i takvi dealovi ponekad nose ime kupca.
  if (/^#\d+/.test(d.dealname ?? "") && POZNATI.has(ukloniBroj(d.dealname).toLowerCase())) return [ukloniBroj(d.dealname)];
  const izvor = d.hs_object_source_detail_1 ?? "";
  const nadjen = PROIZVOD_IZ_UVOZA.find(([re]) => re.test(izvor));
  if (nadjen) return [nadjen[1]];
  if (d.pipeline === PIPELINE_KONFERENCIJA) return ["Konferencija"];
  return ["Nepoznat proizvod"];
}

// ---------- 5. red po prijavi ----------

const danas = Date.now();
const redovi = spojeni.map(({ pr, hk, nacin }) => {
  const p = hk?.properties ?? {};
  const dealovi = (hk ? dealoviKontakta.get(hk.id) ?? [] : [])
    .filter((id) => deal.has(id))
    .map((id) => {
      const d = deal.get(id);
      const lista = proizvodiDeala(id, d);
      return { ...d, lista, naziv: lista.join(" + "), kada: d.closedate || d.createdate };
    });

  const placeni = dealovi
    .filter((d) => PLACENO.has(d.dealstage))
    .sort((a, b) => (a.kada < b.kada ? -1 : 1));
  const pokusaji = dealovi.filter((d) => POKUSAO.has(d.dealstage));

  // Proizvodi sa brojem kupovina, npr. "AI Profit Lab x6 | 70 Claude Eskperata"
  const brojac = new Map();
  for (const d of placeni) for (const n of d.lista) {
    const cist = n.replace(/ x\d+$/, "");
    brojac.set(cist, (brojac.get(cist) ?? 0) + 1);
  }
  const proizvodi = [...brojac].map(([n, k]) => (k > 1 ? `${n} x${k}` : n)).join(" | ");

  // Sve kupovine sa datumom, najnovija prva, jedna po redu.
  const kupovine = placeni.slice().reverse()
    .map((d) => `${datum(d.kada)} · ${d.naziv} · ${Number(d.amount) || 0} ${d.deal_currency_code ?? ""}`.trim())
    .join("\n");

  const ukupno = placeni.reduce((s, d) => s + uEur(d.amount, d.deal_currency_code), 0);
  const poslednji = placeni.at(-1);

  // AI Profit Lab je mesecni: aktivan ako je poslednje placanje u zadnjih 40 dana.
  const apl = placeni.filter((d) => /ai profit lab/i.test(d.naziv)).at(-1);
  const aplAktivan = apl && danas - Date.parse(apl.kada) < 40 * 864e5;

  return {
    ime: pr.ime,
    prezime: pr.prezime,
    email: pr.email,
    telefon: pr.telefon,
    prijava: datum(pr.kreirano?.toISOString?.() ?? String(pr.kreirano)),
    izvor: pr.izvor,
    kampanja: pr.kampanja,
    zemlja: pr.zemlja,
    bio_uzivo: pr.ulazaka ? "da" : "ne",
    hubspot_nadjen_po: nacin,
    hubspot_id: hk?.id ?? "",
    kupac_ranije: placeni.length ? "da" : "ne",
    broj_kupovina: placeni.length,
    ukupno_eur: Math.round(ukupno),
    proizvodi,
    kupovine,
    prva_kupovina: datum(placeni[0]?.kada),
    poslednja_kupovina: datum(poslednji?.kada),
    poslednji_proizvod: poslednji?.naziv ?? "",
    ai_profit_lab: apl ? (aplAktivan ? "aktivan" : `bio, poslednje ${datum(apl.kada)}`) : "",
    neuspeli_pokusaji: pokusaji.length,
    neuspeli_proizvodi: [...new Set(pokusaji.map((d) => d.naziv))].join(" | "),
    napustena_korpa: p.current_abandoned_cart === "Yes" ? (p.abandoned_cart_products ?? "da") : "",
    rfm_novac: p.monetary_rating ?? "",
    rfm_ucestalost: p.order_frequency_rating ?? "",
    rfm_skorasnjost: p.order_recency_rating ?? "",
    hubspot_faza: p.lifecyclestage ?? "",
    grad: p.billing_city ?? "",
  };
});

// ---------- 6. CSV ----------

mkdirSync("izvoz", { recursive: true });
const kolone = Object.keys(redovi[0] ?? { ime: "" });
const csv = [kolone, ...redovi.map((r) => kolone.map((k) => r[k]))]
  .map((red) => red.map(csvPolje).join(","))
  .join("\n");
writeFileSync(IZLAZ, "﻿" + csv);

// ---------- 7. kratak pregled ----------

const n = (f) => redovi.filter(f).length;
const pct = (x) => `${x} (${prijave.length ? Math.round((100 * x) / prijave.length) : 0}%)`;
console.log(`
Prijava:                         ${prijave.length}
Nadjeno u HubSpotu po mejlu:     ${pct(n((r) => r.hubspot_nadjen_po === "mejl"))}
Nadjeno u HubSpotu po telefonu:  ${pct(n((r) => r.hubspot_nadjen_po === "telefon"))}
Nije nadjeno:                    ${pct(n((r) => !r.hubspot_nadjen_po))}
  od toga broj deli vise kontakata (nije spojeno): ${viseKontakataNaBroj}

Kupili ranije bar nesto:         ${pct(n((r) => r.kupac_ranije === "da"))}
Kupili 2 ili vise puta:          ${pct(n((r) => r.broj_kupovina >= 2))}
AI Profit Lab aktivni:           ${n((r) => r.ai_profit_lab === "aktivan")}
Imaju neuspeo pokusaj kupovine:  ${n((r) => r.neuspeli_pokusaji > 0)}
Trenutno napustena korpa:        ${n((r) => r.napustena_korpa)}

Zapisano u ${IZLAZ}. U HubSpot i MailerLite nije upisano nista.`);

// Najcesci proizvodi medju prijavljenima (bez imena ljudi).
const top = new Map();
for (const r of redovi) for (const p of r.proizvodi.split(" | ").filter(Boolean)) {
  const naziv = p.replace(/ x\d+$/, "");
  top.set(naziv, (top.get(naziv) ?? 0) + 1);
}
console.log("\nNajcesce kupljeno medju prijavljenima (broj ljudi):");
for (const [p, k] of [...top].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${String(k).padStart(4)}  ${p}`);
}
