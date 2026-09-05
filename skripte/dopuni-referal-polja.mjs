// ============================================================
// Dopuna referal polja u MailerLite-u za vec postojece prijave.
//
// Backend upisuje referal_kod, referal_link i referal_tabela u trenutku
// prijave. Ko se prijavio PRE nego sto je polje napravljeno u MailerLite
// panelu, ima ga prazno, pa mu dugme u mejlu ne vodi nikuda.
// Ova skripta prodje kroz sve prijave iz baze i posalje im polja ponovo.
//
// Pokretanje iz korena projekta. Trazi .env.local sa cetiri promenljive
// (DATABASE_URL, MAILERLITE_API_KEY, MAILERLITE_GROUP_ID, SITE_URL) koje se
// prepisu iz Vercel panela ili povuku sa "npx vercel env pull .env.local":
//   node --env-file=.env.local skripte/dopuni-referal-polja.mjs
//
// Podrazumevano samo ISPISUJE sta bi uradila. Za stvarno slanje dodaj --posalji:
//   node --env-file=.env.local skripte/dopuni-referal-polja.mjs --posalji
// ============================================================

import { neon } from "@neondatabase/serverless";

const POSALJI = process.argv.includes("--posalji");
const API = "https://connect.mailerlite.com/api/subscribers";

// MailerLite dozvoljava oko 120 zahteva u minutu. 700ms izmedju poziva
// nas drzi na ~85/min, sa rezervom.
const PAUZA_MS = 700;

const { DATABASE_URL, MAILERLITE_API_KEY, MAILERLITE_GROUP_ID, SITE_URL } = process.env;

for (const [ime, v] of Object.entries({ DATABASE_URL, MAILERLITE_API_KEY, SITE_URL })) {
  if (!v) {
    console.error(
      `Nedostaje ${ime}.\n` +
      `Upisi ga u .env.local u korenu projekta, ili povuci sve odjednom sa\n` +
      `  npx vercel env pull .env.local\n` +
      `Detalji su u uputstvo-referal.md, korak 4.`
    );
    process.exit(1);
  }
}

const domen = SITE_URL.replace(/\/+$/, "");
const sql = neon(DATABASE_URL);

const prijave = await sql`
  SELECT email, ime, prezime, telefon, ref_kod, token
  FROM prijave
  ORDER BY kreirano ASC`;

console.log(`Prijava u bazi: ${prijave.length}`);
console.log(`Sajt: ${domen}`);
console.log(POSALJI ? "Rezim: STVARNO SLANJE\n" : "Rezim: samo prikaz, nista se ne salje (dodaj --posalji)\n");

let poslato = 0, palo = 0;

for (const [i, p] of prijave.entries()) {
  const polja = {
    name: p.ime,
    last_name: p.prezime || undefined,
    phone: p.telefon || undefined,
    referal_kod: p.ref_kod,
    referal_link: `${domen}/?ref=${p.ref_kod}`,
    referal_tabela: `${domen}/hvala?k=${encodeURIComponent(p.token)}`,
  };

  const redni = String(i + 1).padStart(3, " ");

  if (!POSALJI) {
    console.log(`${redni}. ${p.email}\n     tabela: ${polja.referal_tabela}`);
    continue;
  }

  const telo = { email: p.email, fields: polja, status: "active" };
  if (MAILERLITE_GROUP_ID) telo.groups = [String(MAILERLITE_GROUP_ID)];

  try {
    const r = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${MAILERLITE_API_KEY}`,
      },
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(10000),
    });

    if (r.ok) {
      poslato++;
      console.log(`${redni}. ok    ${p.email}`);
    } else {
      palo++;
      console.log(`${redni}. PALO  ${p.email}  (${r.status}) ${(await r.text()).slice(0, 200)}`);
    }
  } catch (e) {
    palo++;
    console.log(`${redni}. PALO  ${p.email}  ${String(e?.message || e)}`);
  }

  await new Promise((r) => setTimeout(r, PAUZA_MS));
}

if (POSALJI) {
  console.log(`\nGotovo. Azurirano: ${poslato}, neuspelo: ${palo}.`);
  if (palo) console.log("Za neuspele proveri da li custom polja u MailerLite-u imaju tacna imena.");
} else {
  console.log(`\nNista nije poslato. Za stvarno slanje pokreni istu komandu sa --posalji`);
}
