// Izvoz ankete sa /uzivo: ko je šta glasao (samo čitanje, ništa ne menja).
// Ključ čita iz .studio-kljuc.txt ili STUDIO_KLJUC.
// Pokretanje:  node skripte/izvezi-glasove.mjs
// Rezultat:    izvoz/glasovi-<datum>.csv
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const API = "https://vebinar-stream.vladimirst95.workers.dev";
let kljuc = process.env.STUDIO_KLJUC || "";
if (!kljuc) { try { kljuc = readFileSync(new URL("../.studio-kljuc.txt", import.meta.url), "utf8").trim(); } catch {} }
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
if (!(await proveri(kljuc))) {
  if (!process.stdin.isTTY) { console.error("Ključ za studio nije ispravan. Pokreni skriptu u terminalu da te pita za šifru."); process.exit(1); }
  kljuc = await pitajSkriveno("Šifra za /studio (ne prikazuje se dok kucaš): ");
  if (!(await proveri(kljuc))) { console.error("Pogrešna šifra."); process.exit(1); }
}

const ws = new WebSocket(`${API.replace(/^http/, "ws")}/ws-studio?k=${encodeURIComponent(kljuc)}`);
const podaci = await new Promise((ok, ne) => {
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "init") ws.send(JSON.stringify({ t: "glasovi_detalji" }));
    if (m.t === "glasovi_detalji") ok(m);
  };
  ws.onerror = () => ne(new Error("Veza nije uspela."));
  setTimeout(() => ne(new Error("Nema odgovora (da li je worker deployovan sa glasovi_detalji?).")), 20000);
});
ws.close();

const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const redovi = [["anketa", "pitanje", "odgovor", "ime", "email"].join(",")];
for (const a of podaci.ankete) {
  const g = podaci.glasovi.filter((x) => x.anketa === a.id);
  console.log(`\n#${a.id} ${a.pitanje}  (${g.length} glasova)`);
  a.opcije.forEach((op, i) => {
    const ovi = g.filter((x) => x.opcija === i);
    console.log(`  ${op}: ${ovi.length}`);
    for (const x of ovi) redovi.push([a.id, esc(a.pitanje), esc(op), esc(x.ime), esc(x.email)].join(","));
  });
}
mkdirSync(new URL("../izvoz/", import.meta.url), { recursive: true });
const fajl = new URL(`../izvoz/glasovi-${new Date().toISOString().slice(0, 10)}.csv`, import.meta.url);
writeFileSync(fajl, "﻿" + redovi.join("\n"));
console.log(`\nSačuvano: ${fajl.pathname}`);
