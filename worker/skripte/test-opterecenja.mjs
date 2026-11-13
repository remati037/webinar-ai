// Test opterecenja: otvara N laznih ucesnika koji su istovremeno u sobi,
// salju poruke i "ziv" signale, i povlace playlistu kao pravi gledaoci.
//
//   node skripte/test-opterecenja.mjs https://vebinar-stream.NALOG.workers.dev 2000
//
// Posle testa u /studio > Podesavanja klikni "Obrisi sve podatke", da test
// ucesnici ne ostanu u statistici.
const API = (process.argv[2] || "http://localhost:8787").replace(/\/+$/, "");
const N = Number(process.argv[3] || 200);
const TRAJANJE = Number(process.argv[4] || 60) * 1000;
const WS = API.replace(/^http/, "ws");

let otvoreno = 0, greske = 0, primljeno = 0, playliste = 0, playlisteGreske = 0;
const kasnjenja = [];
const sockets = [];

async function ucesnik(i) {
  const r = await fetch(`${API}/ulaz`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ime: `Test ${i}`, email: `test${i}@opterecenje.test`, izvor: "test" }),
  });
  const { ulaznica } = await r.json();
  const ws = new WebSocket(`${WS}/ws?t=${encodeURIComponent(ulaznica)}`);
  sockets.push(ws);
  ws.onopen = () => { otvoreno++; };
  ws.onerror = () => { greske++; };
  ws.onmessage = (e) => {
    primljeno++;
    try {
      const m = JSON.parse(e.data);
      if (m.t === "poruka" && m.p.ko === "u" && m.p.c) kasnjenja.push(Date.now() - Number(m.p.c));
    } catch {}
  };
  // Svako ponekad posalje poruku i povuce playlistu, kao pravi gledalac.
  const pl = setInterval(async () => {
    try { const x = await fetch(`${API}/stream/${encodeURIComponent(ulaznica)}/live.m3u8`); playliste++; if (x.status >= 500) playlisteGreske++; await x.text(); } catch { playlisteGreske++; }
  }, 6000 + Math.random() * 1000);
  const msg = setInterval(() => {
    if (ws.readyState === 1 && Math.random() < 0.05) ws.send(JSON.stringify({ t: "poruka", tekst: "test poruka", c: String(Date.now()) }));
  }, 10000);
  setTimeout(() => { clearInterval(pl); clearInterval(msg); }, TRAJANJE);
}

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  ucesnik(i).catch(() => greske++);
  if (i % 50 === 49) await new Promise((r) => setTimeout(r, 200));
}
const izvestaj = setInterval(() => {
  console.log(`${Math.round((Date.now() - t0) / 1000)}s  otvoreno ${otvoreno}/${N}  greske ${greske}  primljeno ${primljeno}  playliste ${playliste} (greske ${playlisteGreske})`);
}, 5000);
setTimeout(() => {
  clearInterval(izvestaj);
  kasnjenja.sort((a, b) => a - b);
  const p = (q) => kasnjenja[Math.floor(kasnjenja.length * q)] ?? "-";
  console.log(`\nGotovo. Otvoreno ${otvoreno}/${N}, gresaka ${greske}. Kasnjenje poruka: median ${p(0.5)} ms, p95 ${p(0.95)} ms (${kasnjenja.length} poruka).`);
  for (const s of sockets) try { s.close(); } catch {}
  setTimeout(() => process.exit(0), 1000);
}, TRAJANJE);
