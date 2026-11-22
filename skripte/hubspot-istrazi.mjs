// ============================================================
// Pregled HubSpot naloga pre spajanja kontakata.
//
// Samo CITA. Ne upisuje nista u HubSpot.
// Ispisuje strukturu i brojke (koliko kontakata, dealova, proizvoda,
// koja polja postoje i koliko su popunjena), bez imena, mejlova i telefona.
// Cilj: videti gde u HubSpotu stoje kupovine, da bi skripta za spajanje
// znala odakle da cita.
//
// Pokretanje iz korena projekta (trazi HUBSPOT_TOKEN u .env.local):
//   node --env-file=.env.local skripte/hubspot-istrazi.mjs
// ============================================================

const { HUBSPOT_TOKEN } = process.env;
if (!HUBSPOT_TOKEN) {
  console.error("Nedostaje HUBSPOT_TOKEN u .env.local");
  process.exit(1);
}

const API = "https://api.hubapi.com";

async function hs(putanja, telo) {
  const r = await fetch(API + putanja, {
    method: telo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: telo ? JSON.stringify(telo) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

// Ukupan broj zapisa jednog tipa objekta (search sa limit 1 vraca total).
async function ukupno(objekat) {
  const r = await hs(`/crm/v3/objects/${objekat}/search`, { limit: 1 });
  if (!r.ok) return `nedostupno (${r.status}${r.json?.category ? ", " + r.json.category : ""})`;
  return r.json.total;
}

function naslov(t) {
  console.log("\n" + "=".repeat(60) + "\n" + t + "\n" + "=".repeat(60));
}

// ---------- 1. Koliko cega ima ----------
naslov("1. Broj zapisa po tipu objekta");
for (const o of ["contacts", "deals", "line_items", "products", "orders", "invoices", "commerce_payments", "subscriptions", "carts"]) {
  console.log(`${o.padEnd(20)} ${await ukupno(o)}`);
}

// ---------- 2. Polja na kontaktu ----------
naslov("2. Polja na kontaktu koja je neko napravio (custom) + popunjenost na uzorku");
const propsR = await hs("/crm/v3/properties/contacts");
const sva = propsR.ok ? propsR.json.results : [];
const custom = sva.filter((p) => !p.hubspotDefined && !p.hidden);

// Standardna polja koja nam trebaju za spajanje i kupovine.
const standardna = [
  "email", "phone", "mobilephone", "hs_whatsapp_phone_number",
  "hs_additional_emails", "lifecyclestage", "hs_lead_status",
  "num_associated_deals", "total_revenue", "recent_deal_amount",
  "recent_deal_close_date", "first_deal_created_date", "hs_analytics_source",
  "createdate", "country", "city",
];
const traziti = [...new Set([...standardna, ...custom.map((p) => p.name)])];

// Uzorak do 500 kontakata (5 strana po 100).
const uzorak = [];
let posle;
for (let i = 0; i < 5; i++) {
  const r = await hs("/crm/v3/objects/contacts/search", {
    limit: 100,
    after: posle,
    properties: traziti,
    sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
  });
  if (!r.ok) { console.log("Greska pri citanju kontakata:", r.status, r.json?.message); break; }
  uzorak.push(...r.json.results);
  posle = r.json.paging?.next?.after;
  if (!posle) break;
}
console.log(`Uzorak: ${uzorak.length} najnovijih kontakata\n`);

const popunjeno = (ime) => uzorak.filter((c) => (c.properties[ime] ?? "") !== "").length;

console.log("Standardna polja:");
for (const ime of standardna) {
  console.log(`  ${ime.padEnd(28)} ${String(popunjeno(ime)).padStart(4)} / ${uzorak.length}`);
}

console.log(`\nCustom polja (${custom.length}):`);
for (const p of custom.sort((a, b) => popunjeno(b.name) - popunjeno(a.name))) {
  const opcije = p.options?.length ? `  opcije: ${p.options.map((o) => o.label).slice(0, 8).join(" | ")}` : "";
  console.log(`  ${p.name.padEnd(36)} ${String(popunjeno(p.name)).padStart(4)}  [${p.type}] ${p.label}${opcije}`);
}

// ---------- 3. Dealovi ----------
naslov("3. Dealovi: pipeline-ovi i faze");
const pip = await hs("/crm/v3/pipelines/deals");
if (pip.ok) {
  for (const p of pip.json.results) {
    console.log(`Pipeline: ${p.label} (${p.id})`);
    for (const s of p.stages) console.log(`   - ${s.label} (${s.id})${s.metadata?.isClosed === "true" ? "  [zatvoreno, verovatnoca " + s.metadata.probability + "]" : ""}`);
  }
} else console.log("nedostupno", pip.status);

const dealProps = await hs("/crm/v3/properties/deals");
const dealCustom = dealProps.ok ? dealProps.json.results.filter((p) => !p.hubspotDefined && !p.hidden) : [];
console.log(`\nCustom polja na dealu (${dealCustom.length}):`);
for (const p of dealCustom) console.log(`  ${p.name.padEnd(36)} [${p.type}] ${p.label}`);

const dealovi = await hs("/crm/v3/objects/deals/search", {
  limit: 15,
  properties: ["dealname", "amount", "dealstage", "pipeline", "closedate", "deal_currency_code", ...dealCustom.map((p) => p.name)],
  sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
});
if (dealovi.ok) {
  console.log("\nPrimer 15 najnovijih dealova (naziv, iznos, faza, datum):");
  for (const d of dealovi.json.results) {
    const p = d.properties;
    console.log(`  ${(p.dealname ?? "").slice(0, 45).padEnd(45)} ${String(p.amount ?? "").padStart(8)} ${p.deal_currency_code ?? ""}  ${p.dealstage}  ${(p.closedate ?? "").slice(0, 10)}`);
  }
}

// ---------- 4. Proizvodi i line itemi ----------
naslov("4. Proizvodi i stavke (line items)");
const proizvodi = await hs("/crm/v3/objects/products?limit=100&properties=name,price,hs_sku,recurringbillingfrequency");
if (proizvodi.ok) {
  for (const p of proizvodi.json.results) {
    const x = p.properties;
    console.log(`  ${(x.name ?? "").padEnd(45)} ${String(x.price ?? "").padStart(8)}  ${x.recurringbillingfrequency ?? "jednokratno"}`);
  }
} else console.log("proizvodi nedostupni", proizvodi.status);

const stavke = await hs("/crm/v3/objects/line_items/search", { limit: 100, properties: ["name", "price", "quantity"] });
if (stavke.ok) {
  const poNazivu = {};
  for (const s of stavke.json.results) poNazivu[s.properties.name] = (poNazivu[s.properties.name] ?? 0) + 1;
  console.log("\nNajcesce stavke (uzorak od 100):");
  for (const [n, k] of Object.entries(poNazivu).sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padStart(4)}  ${n}`);
}

// ---------- 5. Orders / placanja ----------
naslov("5. Orders i placanja (ako postoje)");
for (const o of ["orders", "commerce_payments", "invoices", "subscriptions"]) {
  const r = await hs(`/crm/v3/objects/${o}?limit=3`);
  if (!r.ok) { console.log(`${o}: nedostupno (${r.status})`); continue; }
  console.log(`${o}: ${r.json.results.length ? "ima zapisa, polja: " + Object.keys(r.json.results[0].properties).join(", ") : "prazno"}`);
}

// ---------- 6. Veze kontakt -> deal ----------
naslov("6. Koliko kontakata iz uzorka ima bar jedan deal");
const saDealom = uzorak.filter((c) => Number(c.properties.num_associated_deals ?? 0) > 0).length;
console.log(`${saDealom} / ${uzorak.length}`);

console.log("\nGotovo. Nista nije upisano u HubSpot.");
