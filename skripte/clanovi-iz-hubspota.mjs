// ============================================================
// Telefoni i istorija kupovina za clanove AI Profit Laba, iz HubSpota.
//
// Samo CITA iz HubSpota. Ulaz je izvoz pretplata (CSV sa platforme),
// izlaz je izvoz/clanovi-hubspot.csv (izvoz/ je u .gitignore, licni podaci).
//
// Pokretanje iz korena projekta:
//   node --env-file=.env.local skripte/clanovi-iz-hubspota.mjs ~/Downloads/Subscriptions-....csv
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const { HUBSPOT_TOKEN } = process.env;
if (!HUBSPOT_TOKEN) { console.error("Nedostaje HUBSPOT_TOKEN u .env.local"); process.exit(1); }
const ULAZ = process.argv[2];
if (!ULAZ) { console.error("Prosledi putanju do CSV-a sa pretplatama"); process.exit(1); }
const IZLAZ = "izvoz/clanovi-hubspot.csv";

const PLACENO = new Set(["processed", "shipped", "1247023970", "1247023974"]);
const POKUSAO = new Set(["checkout_abandoned", "checkout_pending", "1247023977", "1247023969"]);
const KURS = { RSD: 1 / 117.2, USD: 0.86, EUR: 1 };

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
async function hs(putanja, telo, pokusaj = 1) {
  const r = await fetch("https://api.hubapi.com" + putanja, {
    method: telo ? "POST" : "GET",
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
    body: telo ? JSON.stringify(telo) : undefined,
  });
  if (r.status === 429 && pokusaj <= 5) { await pauza(1500 * pokusaj); return hs(putanja, telo, pokusaj + 1); }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HubSpot ${r.status} na ${putanja}: ${json.message ?? ""}`);
  await pauza(110);
  return json;
}

function citajCsv(t) {
  const redovi = []; let red = [], polje = "", q = false;
  t = t.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { polje += '"'; i++; } else if (c === '"') q = false; else polje += c; }
    else if (c === '"') q = true;
    else if (c === ",") { red.push(polje); polje = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; red.push(polje); redovi.push(red); red = []; polje = ""; }
    else polje += c;
  }
  if (polje || red.length) { red.push(polje); redovi.push(red); }
  const [zag, ...ost] = redovi.filter((r) => r.length > 1);
  return ost.map((r) => Object.fromEntries(zag.map((k, i) => [k, r[i] ?? ""])));
}

const mejlovi = [...new Set(citajCsv(readFileSync(ULAZ, "utf8")).map((r) => r["Member email"].trim().toLowerCase()).filter(Boolean))];
console.log(`Clanova: ${mejlovi.length}`);

// 1. kontakti po mejlu
const kontakt = new Map(); // mejl -> {id, properties}
for (let i = 0; i < mejlovi.length; i += 100) {
  const r = await hs("/crm/v3/objects/contacts/batch/read", {
    idProperty: "email",
    inputs: mejlovi.slice(i, i + 100).map((id) => ({ id })),
    properties: ["email", "firstname", "lastname", "phone", "mobilephone", "billing_city", "lifecyclestage"],
  });
  for (const k of r.results ?? []) kontakt.set(k.properties.email.trim().toLowerCase(), k);
}
console.log(`Nadjeno u HubSpotu: ${kontakt.size}`);

// 2. dealovi
const ids = [...new Set([...kontakt.values()].map((k) => k.id))];
const dealoviKontakta = new Map();
for (let i = 0; i < ids.length; i += 1000) {
  const r = await hs("/crm/v4/associations/contacts/deals/batch/read", { inputs: ids.slice(i, i + 1000).map((id) => ({ id })) });
  for (const red of r.results ?? []) dealoviKontakta.set(String(red.from.id), red.to.map((t) => String(t.toObjectId)));
}
const sviDeal = [...new Set([...dealoviKontakta.values()].flat())];
const deal = new Map();
for (let i = 0; i < sviDeal.length; i += 100) {
  const r = await hs("/crm/v3/objects/deals/batch/read", {
    inputs: sviDeal.slice(i, i + 100).map((id) => ({ id })),
    properties: ["dealname", "amount", "deal_currency_code", "dealstage", "closedate", "createdate", "hs_num_of_associated_line_items"],
  });
  for (const d of r.results) deal.set(d.id, d.properties);
}
console.log(`Dealova: ${deal.size}`);

// 3. stavke (pravi nazivi proizvoda)
const saStavkama = [...deal].filter(([, d]) => Number(d.hs_num_of_associated_line_items) > 0).map(([id]) => id);
const stavkeDeala = new Map();
for (let i = 0; i < saStavkama.length; i += 1000) {
  const r = await hs("/crm/v4/associations/deals/line_items/batch/read", { inputs: saStavkama.slice(i, i + 1000).map((id) => ({ id })) });
  for (const red of r.results ?? []) stavkeDeala.set(String(red.from.id), red.to.map((t) => String(t.toObjectId)));
}
const sveStavke = [...new Set([...stavkeDeala.values()].flat())];
const stavka = new Map();
for (let i = 0; i < sveStavke.length; i += 100) {
  const r = await hs("/crm/v3/objects/line_items/batch/read", { inputs: sveStavke.slice(i, i + 100).map((id) => ({ id })), properties: ["name"] });
  for (const s of r.results) stavka.set(s.id, s.properties);
}
const naziv = (id, d) => {
  const imena = (stavkeDeala.get(id) ?? []).map((s) => stavka.get(s)?.name).filter(Boolean);
  return imena.length ? imena.join(" + ") : (d.dealname ?? "").replace(/^#\d+\s*/, "");
};

// 4. red po clanu
const polje = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const kolone = ["email", "telefon", "grad", "broj_kupovina", "ukupno_eur", "proizvodi", "kupio_infocash", "neuspeli_pokusaji", "neuspeli_proizvodi"];
const redovi = mejlovi.map((m) => {
  const k = kontakt.get(m);
  const p = k?.properties ?? {};
  const dl = (k ? dealoviKontakta.get(k.id) ?? [] : []).filter((id) => deal.has(id)).map((id) => ({ ...deal.get(id), naziv: naziv(id, deal.get(id)) }));
  const placeni = dl.filter((d) => PLACENO.has(d.dealstage));
  const pokusaji = dl.filter((d) => POKUSAO.has(d.dealstage));
  const nazivi = placeni.map((d) => d.naziv);
  const brojac = new Map(); for (const n of nazivi) brojac.set(n, (brojac.get(n) ?? 0) + 1);
  return {
    email: m,
    telefon: p.mobilephone || p.phone || "",
    grad: p.billing_city ?? "",
    broj_kupovina: placeni.length,
    ukupno_eur: Math.round(placeni.reduce((s, d) => s + (Number(d.amount) || 0) * (KURS[d.deal_currency_code] ?? 1), 0)),
    proizvodi: [...brojac].map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(" | "),
    kupio_infocash: placeni.some((d) => /infocash|info cash|akcelerator/i.test(d.naziv)) ? "da" : "",
    neuspeli_pokusaji: pokusaji.length,
    neuspeli_proizvodi: [...new Set(pokusaji.map((d) => d.naziv))].join(" | "),
  };
});

mkdirSync("izvoz", { recursive: true });
writeFileSync(IZLAZ, "﻿" + [kolone, ...redovi.map((r) => kolone.map((c) => r[c]))].map((r) => r.map(polje).join(",")).join("\n"));
console.log(`Upisano: ${IZLAZ} (sa telefonom: ${redovi.filter((r) => r.telefon).length}, kupili InfoCash: ${redovi.filter((r) => r.kupio_infocash).length})`);
