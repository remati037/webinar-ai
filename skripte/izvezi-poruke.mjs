// Izvoz svih privatnih razgovora sa /uzivo (samo čitanje, ništa ne menja).
// Povezuje se na studio kanal workera kao /studio, uzima listu razgovora
// i za svaku osobu traži celu prepisku. Ključ čita iz .studio-kljuc.txt.
// Pokretanje:  node skripte/izvezi-poruke.mjs
// Rezultat:    izvoz/poruke-<datum>.json i izvoz/poruke-<datum>.csv
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const API = "https://vebinar-stream.vladimirst95.workers.dev";
const proveri = async (k) => !!k && (await (await fetch(`${API}/studio/proveri?k=${encodeURIComponent(k)}`)).json()).ok;
const pitajSkriveno = (pitanje) => new Promise((ok) => {
  process.stdout.write(pitanje);
  const stdin = process.stdin;
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
  let s = "";
  const na = (c) => {
    if (c === "\r" || c === "\n") { stdin.setRawMode(false); stdin.pause(); stdin.off("data", na); process.stdout.write("\n"); ok(s.trim()); }
    else if (c === "\u0003") process.exit(1);
    else if (c === "\u007f") s = s.slice(0, -1);
    else s += c;
  };
  stdin.on("data", na);
});

let kljuc = process.env.STUDIO_KLJUC || "";
if (!kljuc) { try { kljuc = readFileSync(new URL("../.studio-kljuc.txt", import.meta.url), "utf8").trim(); } catch {} }
if (!(await proveri(kljuc))) {
  if (!process.stdin.isTTY) { console.error("Ključ za studio nije ispravan. Pokreni skriptu u terminalu da te pita za šifru."); process.exit(1); }
  kljuc = await pitajSkriveno("Šifra za /studio (ne prikazuje se dok kucaš): ");
  if (!(await proveri(kljuc))) { console.error("Pogrešna šifra."); process.exit(1); }
}

const ws = new WebSocket(`${API.replace(/^http/, "ws")}/ws-studio?k=${encodeURIComponent(kljuc)}`);
const cekaju = new Map();
let init;
const stigaoInit = new Promise((ok, ne) => {
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "init") { init = m; ok(); }
    if (m.t === "razgovor" && cekaju.has(m.uid)) { cekaju.get(m.uid)(m); cekaju.delete(m.uid); }
  };
  ws.onerror = () => ne(new Error("Veza nije uspela (pogrešan ključ ili worker nedostupan)."));
  setTimeout(() => ne(new Error("Isteklo vreme čekanja na studio.")), 20000);
});

const razgovor = (uid) => new Promise((ok, ne) => {
  cekaju.set(uid, ok);
  ws.send(JSON.stringify({ t: "razgovor", uid }));
  setTimeout(() => ne(new Error("Nema odgovora za " + uid)), 15000);
});

await stigaoInit;
const lista = init.razgovori;
console.log(`Razgovora: ${lista.length}${lista.length >= 2000 ? " (DOSTIGNUT LIMIT 2000, moguće je da nedostaju neki)" : ""}`);

const svi = [];
for (const [i, r] of lista.entries()) {
  const odg = await razgovor(r.uid);
  svi.push({ ime: r.ime, email: r.email, uid: r.uid, poruke: odg.poruke.map((p) => ({ ko: p.ko === "u" ? "ucesnik" : (p.ime_tima || "tim"), tekst: p.tekst, vreme: new Date(p.ts).toISOString() })) });
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${lista.length}`);
}
ws.close();

const datum = new Date().toISOString().slice(0, 10);
const dir = new URL("../izvoz/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`poruke-${datum}.json`, dir), JSON.stringify({ izvezeno: new Date().toISOString(), objave: init.objave, razgovori: svi }, null, 2));

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const redovi = [["Ime", "Email", "Ko piše", "Poruka", "Vreme"].map(esc).join(",")];
for (const r of svi) for (const p of r.poruke) {
  redovi.push([r.ime, r.email, p.ko, p.tekst, new Date(p.vreme).toLocaleString("sr-Latn-RS", { timeZone: "Europe/Belgrade" })].map(esc).join(","));
}
writeFileSync(new URL(`poruke-${datum}.csv`, dir), "﻿" + redovi.join("\n"));

const ukupno = svi.reduce((s, r) => s + r.poruke.length, 0);
const odUcesnika = svi.reduce((s, r) => s + r.poruke.filter((p) => p.ko === "ucesnik").length, 0);
console.log(`Gotovo: ${svi.length} osoba, ${ukupno} poruka (${odUcesnika} od učesnika). Fajlovi u izvoz/`);
