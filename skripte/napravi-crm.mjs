// ============================================================
// Pravi izvoz/crm.html: brzi CRM za zvanje prijavljenih sa vebinara.
//
// Spaja tri lokalna izvora (sve je vec u izvoz/, nista se ne povlaci sa mreze):
//   izvoz/kontakti-obogaceni.csv   (skripte/obogati-iz-hubspota.mjs)
//   izvoz/poruke-*.csv             (najnoviji izvoz chata)
//   izvoz/zagrejani-za-zvanje.md   (rucni spisak sa preporukama, ako postoji)
//
// Beleske o pozivima se cuvaju u browseru (localStorage), ne u fajlu.
// Zato kad ponovo generises crm.html, beleske ostaju. U stranici postoji
// i dugme za izvoz beleski (rezervna kopija).
//
// Pokretanje:  node skripte/napravi-crm.mjs
// Otvaranje:   duplim klikom na izvoz/crm.html (uvek na isti nacin i u istom
//              browseru, jer browser beleske vezuje za nacin otvaranja)
// ============================================================

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "izvoz";
const VEBINAR = "2026-11-16";

// ---------- CSV ----------
function citajCsv(putanja) {
  const t = readFileSync(putanja, "utf8").replace(/^﻿/, "");
  const redovi = [];
  let red = [], polje = "", uNavodnicima = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (uNavodnicima) {
      if (c === '"' && t[i + 1] === '"') { polje += '"'; i++; }
      else if (c === '"') uNavodnicima = false;
      else polje += c;
    } else if (c === '"') uNavodnicima = true;
    else if (c === ",") { red.push(polje); polje = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      red.push(polje); redovi.push(red); red = []; polje = "";
    } else polje += c;
  }
  if (polje || red.length) { red.push(polje); redovi.push(red); }
  const [zaglavlje, ...ostalo] = redovi.filter((r) => r.length > 1 || r[0]);
  return ostalo.map((r) => Object.fromEntries(zaglavlje.map((k, i) => [k, r[i] ?? ""])));
}

const mejl = (s) => (s ?? "").trim().toLowerCase();
const telKljuc = (s) => { const c = (s ?? "").replace(/\D/g, ""); return c.length >= 8 ? c.slice(-9) : null; };

// ---------- 1. kontakti ----------
const kontakti = citajCsv(`${DIR}/kontakti-obogaceni.csv`).map((r) => ({
  id: mejl(r.email) || `tel:${telKljuc(r.telefon)}`,
  ime: [r.ime, r.prezime].filter(Boolean).join(" "),
  email: r.email,
  tel: r.telefon,
  prijava: r.prijava,
  izvor: [r.izvor, r.kampanja].filter(Boolean).join(" / "),
  zemlja: r.zemlja,
  uzivo: r.bio_uzivo === "da",
  hs: r.hubspot_nadjen_po,
  kupac: r.kupac_ranije === "da",
  brKup: Number(r.broj_kupovina) || 0,
  eur: Number(r.ukupno_eur) || 0,
  proizvodi: r.proizvodi,
  kupovine: r.kupovine ? r.kupovine.split("\n") : [],
  prva: r.prva_kupovina,
  poslednja: r.poslednja_kupovina,
  apl: r.ai_profit_lab,
  neuspelo: Number(r.neuspeli_pokusaji) || 0,
  neuspeloSta: r.neuspeli_proizvodi,
  rfm: [r.rfm_novac, r.rfm_ucestalost, r.rfm_skorasnjost].some(Boolean)
    ? `${r.rfm_novac || "-"}/${r.rfm_ucestalost || "-"}/${r.rfm_skorasnjost || "-"}` : "",
  grad: r.grad,
  poruke: [],
  spisak: null,
}));
const poMejlu = new Map(kontakti.map((k) => [mejl(k.email), k]));
const poTel = new Map();
for (const k of kontakti) { const t = telKljuc(k.tel); if (t) poTel.set(t, k); }

// ---------- 2. poruke iz chata ----------
const fajlPoruka = readdirSync(DIR).filter((f) => /^poruke-.*\.csv$/.test(f)).sort().at(-1);
let brojPoruka = 0;
if (fajlPoruka) {
  for (const p of citajCsv(`${DIR}/${fajlPoruka}`)) {
    if (p["Ko piše"] !== "ucesnik") continue;
    const k = poMejlu.get(mejl(p.Email));
    if (!k) continue;
    k.poruke.push({ v: p.Vreme.replace(/^.*?(\d{1,2}:\d{2}):\d{2}$/, "$1"), t: p.Poruka });
    brojPoruka++;
  }
}

// ---------- 3. rucni spisak za zvanje ----------
let saSpiska = 0, dodatoSaSpiska = 0;
if (existsSync(`${DIR}/zagrejani-za-zvanje.md`)) {
  let grupa = null, zaglavlje = null;
  for (const linija of readFileSync(`${DIR}/zagrejani-za-zvanje.md`, "utf8").split("\n")) {
    const g = linija.match(/^## ([A-Z])\. (.+)$/);
    if (g) { grupa = { slovo: g[1], naziv: g[2] }; zaglavlje = null; continue; }
    if (!grupa || !linija.startsWith("|")) continue;
    const celije = linija.split("|").slice(1, -1).map((c) => c.trim());
    if (/^-+$/.test(celije[0].replace(/:/g, ""))) continue;
    if (!zaglavlje) { zaglavlje = celije; continue; }
    const red = Object.fromEntries(zaglavlje.map((h, i) => [h, celije[i] ?? ""]));
    const em = celije.find((c) => /@/.test(c)) ?? "";
    const tel = red.Telefon ?? "";
    let k = poMejlu.get(mejl(em)) ?? poTel.get(telKljuc(tel));
    if (!k) {
      k = {
        id: mejl(em) || `tel:${telKljuc(tel) ?? red.Ime}`, ime: red.Ime ?? "", email: em, tel,
        prijava: "", izvor: "spisak iz chata", zemlja: "", uzivo: true, hs: "", kupac: false,
        brKup: 0, eur: 0, proizvodi: "", prva: "", poslednja: "", apl: "", neuspelo: 0,
        neuspeloSta: "", rfm: "", grad: "", poruke: [], spisak: null,
      };
      kontakti.push(k); dodatoSaSpiska++;
    }
    const tekst = (s) => (s ?? "").replace(/\*\*/g, "");
    k.spisak = {
      grupa: grupa.slovo,
      naziv: grupa.naziv,
      pisao: tekst(red["Šta je pisao/la"] ?? red["Šta treba"] ?? Object.values(red).slice(-1)[0]),
      reci: tekst(red["Šta da kažeš"] ?? ""),
      telNapomena: telKljuc(tel) !== telKljuc(k.tel) ? tel : "",
    };
    saSpiska++;
  }
}

// ---------- 3b. anketa sa /uzivo ("Da li već imaš publiku?") ----------
// izvoz/glasovi-*.csv pravi skripte/izvezi-glasove.mjs
const fajlGlasova = readdirSync(DIR).filter((f) => /^glasovi-.*\.csv$/.test(f)).sort().at(-1);
let glasovaUparenih = 0, glasovaDodato = 0;
if (fajlGlasova) {
  for (const g of citajCsv(`${DIR}/${fajlGlasova}`)) {
    if (!/publik/i.test(g.pitanje)) continue;
    const publika = /^imam/i.test(g.odgovor) ? "ima" : /^nemam/i.test(g.odgovor) ? "nema" : "";
    if (!publika) continue;
    let k = poMejlu.get(mejl(g.email));
    if (!k) {
      k = {
        id: mejl(g.email), ime: g.ime, email: g.email, tel: "",
        prijava: "", izvor: "glasao u anketi uživo", zemlja: "", uzivo: true, hs: "", kupac: false,
        brKup: 0, eur: 0, proizvodi: "", prva: "", poslednja: "", apl: "", neuspelo: 0,
        neuspeloSta: "", rfm: "", grad: "", poruke: [], spisak: null,
      };
      kontakti.push(k); poMejlu.set(mejl(g.email), k); glasovaDodato++;
    } else glasovaUparenih++;
    k.publika = publika;
    k.publikaOdgovor = g.odgovor;
  }
}

// ---------- 4. prioritet ----------
const BODOVI_GRUPE = { A: 100, D: 90, B: 80, C: 60 };
for (const k of kontakti) {
  let s = 0;
  if (k.spisak) s += BODOVI_GRUPE[k.spisak.grupa] ?? 50;
  if (k.poruke.length) s += 20 + Math.min(k.poruke.length, 10);
  if (k.neuspelo) s += 15;
  if (k.uzivo) s += 10;
  if (k.kupac) s += 10 + Math.min(Math.round(k.eur / 50), 10);
  if (!telKljuc(k.tel)) s -= 40;
  k.prio = s;
}
kontakti.sort((a, b) => b.prio - a.prio);

// ---------- 5. HTML ----------
const podaci = JSON.stringify({ vebinar: VEBINAR, napravljeno: new Date().toISOString(), kontakti })
  .replace(/</g, "\\u003c");
const sablon = readFileSync(new URL("./crm-sablon.html", import.meta.url), "utf8");
writeFileSync(`${DIR}/crm.html`, sablon.replace("/*PODACI*/null", podaci));

console.log(`Kontakata: ${kontakti.length}
Sa porukama iz chata: ${kontakti.filter((k) => k.poruke.length).length} (${brojPoruka} poruka iz ${fajlPoruka ?? "nema fajla"})
Sa rucnog spiska: ${saSpiska} (od toga ${dodatoSaSpiska} nisu u prijavama, dodati posebno)
Anketa o publici (${fajlGlasova ?? "nema fajla"}): ${glasovaUparenih} upareno, ${glasovaDodato} nije u prijavama (dodati posebno); ima ${kontakti.filter((k) => k.publika === "ima").length}, nema ${kontakti.filter((k) => k.publika === "nema").length}
Sa telefonom: ${kontakti.filter((k) => telKljuc(k.tel)).length}
Napravljeno: ${DIR}/crm.html`);
